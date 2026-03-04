/**
 * PM2 Connection Pool
 * 
 * 管理 PM2 连接池，避免频繁连接/断开导致的性能问题
 */

import pm2 from 'pm2'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'

interface PM2Connection {
  id: string
  inUse: boolean
  createdAt: number
  lastUsed: number
  isExpired(): boolean
}

export class PM2ConnectionPool {
  private connections: PM2Connection[] = []
  private maxConnections = 3
  private idleTimeout = 60000 // 60秒空闲超时
  private connectionTimeout = 5000 // 5秒连接超时
  private isShuttingDown = false

  /**
   * 获取可用连接
   */
  async acquire(): Promise<PM2Connection> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down')
    }

    // 查找空闲连接
    const idle = this.connections.find(c => !c.inUse && !c.isExpired())
    
    if (idle) {
      idle.inUse = true
      idle.lastUsed = Date.now()
      logger.debug('Reusing idle PM2 connection', { connectionId: idle.id })
      return idle
    }
    
    // 如果没有空闲连接且未达到最大连接数，创建新连接
    if (this.connections.length < this.maxConnections) {
      const conn = await this.createConnection()
      this.connections.push(conn)
      logger.info('Created new PM2 connection', { 
        connectionId: conn.id, 
        totalConnections: this.connections.length 
      })
      return conn
    }
    
    // 等待连接释放
    logger.debug('Waiting for PM2 connection to be released')
    return await this.waitForConnection()
  }
  
  /**
   * 释放连接
   */
  release(connection: PM2Connection): void {
    connection.inUse = false
    connection.lastUsed = Date.now()
    
    logger.debug('Released PM2 connection', { connectionId: connection.id })
    
    // 设置自动清理定时器
    setTimeout(() => {
      if (!connection.inUse && connection.isExpired()) {
        this.removeConnection(connection)
      }
    }, this.idleTimeout)
  }
  
  /**
   * 创建新连接
   */
  private async createConnection(): Promise<PM2Connection> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('PM2 connection timeout'))
      }, this.connectionTimeout)
    })

    const connectPromise = new Promise<PM2Connection>((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          logger.error('Failed to create PM2 connection', { error: err.message })
          reject(err)
        } else {
          const connection: PM2Connection = {
            id: uuidv4(),
            inUse: true,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            isExpired: function() {
              return Date.now() - this.lastUsed > 60000
            }
          }
          resolve(connection)
        }
      })
    })

    return Promise.race([connectPromise, timeoutPromise])
  }
  
  /**
   * 等待连接可用
   */
  private async waitForConnection(): Promise<PM2Connection> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const maxWaitTime = 10000 // 最多等待10秒
      
      const checkInterval = setInterval(() => {
        // 检查是否超时
        if (Date.now() - startTime > maxWaitTime) {
          clearInterval(checkInterval)
          reject(new Error('Timeout waiting for PM2 connection'))
          return
        }

        const idle = this.connections.find(c => !c.inUse)
        
        if (idle) {
          clearInterval(checkInterval)
          idle.inUse = true
          idle.lastUsed = Date.now()
          logger.debug('Acquired waiting PM2 connection', { connectionId: idle.id })
          resolve(idle)
        }
      }, 100)
    })
  }

  /**
   * 移除连接
   */
  private removeConnection(connection: PM2Connection): void {
    const index = this.connections.findIndex(c => c.id === connection.id)
    
    if (index !== -1) {
      this.connections.splice(index, 1)
      logger.info('Removed expired PM2 connection', { 
        connectionId: connection.id,
        remainingConnections: this.connections.length 
      })
    }
  }

  /**
   * 获取连接池统计信息
   */
  getStats(): {
    total: number
    inUse: number
    idle: number
    expired: number
  } {
    const total = this.connections.length
    const inUse = this.connections.filter(c => c.inUse).length
    const expired = this.connections.filter(c => c.isExpired()).length
    const idle = total - inUse - expired

    return { total, inUse, idle, expired }
  }

  /**
   * 清理所有过期连接
   */
  cleanupExpired(): void {
    const expired = this.connections.filter(c => !c.inUse && c.isExpired())
    
    expired.forEach(conn => {
      this.removeConnection(conn)
    })

    if (expired.length > 0) {
      logger.info('Cleaned up expired PM2 connections', { count: expired.length })
    }
  }

  /**
   * 关闭连接池
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true
    
    logger.info('Shutting down PM2 connection pool', { 
      totalConnections: this.connections.length 
    })

    // 等待所有连接释放（最多等待5秒）
    const maxWaitTime = 5000
    const startTime = Date.now()

    while (this.connections.some(c => c.inUse) && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 断开所有连接
    try {
      pm2.disconnect()
      logger.info('PM2 connection pool shut down successfully')
    } catch (error) {
      logger.error('Error during PM2 connection pool shutdown', { 
        error: error instanceof Error ? error.message : String(error) 
      })
    }

    this.connections = []
  }
}

// 单例实例
let poolInstance: PM2ConnectionPool | null = null

export function getPM2ConnectionPool(): PM2ConnectionPool {
  if (!poolInstance) {
    poolInstance = new PM2ConnectionPool()
  }
  return poolInstance
}

export async function shutdownPM2ConnectionPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.shutdown()
    poolInstance = null
  }
}
