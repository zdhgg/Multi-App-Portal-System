/**
 * Network Service - Unified Port Management
 * 
 * This single service replaces:
 * - PortManager.ts
 * - EnhancedPortManager.ts  
 * - PortAllocator.ts
 * - PortMonitoringService.ts
 * - PortPersistence.ts
 * 
 * "One problem, one solution." - Linus
 */

import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import type { NetworkService as INetworkService, PortConflict } from '../core/types'
import { logger } from '../utils/logger'
import { ConfigManager } from '../services/configManager'
import type { Database } from 'better-sqlite3'

const execAsync = promisify(exec)
type PortAllocationScope = 'frontend' | 'backend' | 'unified'

export class NetworkService implements INetworkService {
  private readonly allocatedPorts = new Set<number>()
  private configManager: ConfigManager
  private db?: Database

  constructor(configManager: ConfigManager, database?: Database) {
    this.configManager = configManager
    this.db = database

    // 监听配置变更
    this.configManager.on('configChanged', (event) => {
      logger.info('Port configuration updated, clearing allocated ports cache')
    })
  }

  /**
   * 从配置文件动态获取保留端口列表
   */
  private getReservedPorts(): Set<number> {
    const portConfig = this.configManager.getPortConfig()
    const reservedPorts = new Set<number>([80, 443]) // 默认保留端口
    
    if (portConfig?.reservedPorts) {
      for (const rp of portConfig.reservedPorts) {
        reservedPorts.add(rp.port)
      }
    }
    
    return reservedPorts
  }

  /**
   * 获取当前端口范围配置
   */
  private getPortRange(scope: PortAllocationScope = 'unified'): { start: number; end: number } {
    const portConfig = this.configManager.getPortConfig()
    if (portConfig) {
      if (scope === 'frontend') {
        return {
          start: portConfig.frontendRange.start,
          end: portConfig.frontendRange.end
        }
      }

      if (scope === 'backend') {
        return {
          start: portConfig.backendRange.start,
          end: portConfig.backendRange.end
        }
      }

      // unified: 合并前后端范围，兼容历史行为
      return {
        start: Math.min(portConfig.frontendRange.start, portConfig.backendRange.start),
        end: Math.max(portConfig.frontendRange.end, portConfig.backendRange.end)
      }
    }

    // 降级方案：使用默认范围
    logger.warn('Port configuration not available, using default range')
    if (scope === 'frontend') {
      return { start: 3001, end: 3100 }
    }
    if (scope === 'backend') {
      return { start: 8001, end: 8100 }
    }
    return { start: 3001, end: 9999 }
  }

  async allocatePort(scope: PortAllocationScope = 'unified'): Promise<number> {
    const portRange = this.getPortRange(scope)
    for (let port = portRange.start; port <= portRange.end; port++) {
      if (this.isPortAvailable(port, scope)) {
        this.allocatedPorts.add(port)
        logger.debug('Port allocated', { port, range: portRange, scope })
        return port
      }
    }
    throw new Error(`No free ports available in ${scope} range ${portRange.start}-${portRange.end}`)
  }

  async releasePort(port: number): Promise<void> {
    try {
      // 1. 先尝试杀死占用端口的进程
      await this.killProcessOnPort(port)

      // 2. 从内存中删除端口分配记录
      this.allocatedPorts.delete(port)

      logger.info('Port released successfully', { port })
    } catch (error) {
      logger.error('Failed to release port', {
        port,
        error: error instanceof Error ? error.message : String(error)
      })
      // 即使杀进程失败,也要从内存中删除记录
      this.allocatedPorts.delete(port)
      throw error
    }
  }

  /**
   * 杀死占用指定端口的进程
   */
  private async killProcessOnPort(port: number): Promise<void> {
    try {
      // Windows系统使用netstat查找占用端口的进程
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`)

      if (!stdout) {
        logger.debug('No process found on port', { port })
        return
      }

      // 解析PID
      const lines = stdout.trim().split('\n')
      const pids = new Set<string>()

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const pid = parts[parts.length - 1]
        if (pid && pid !== '0' && !isNaN(parseInt(pid))) {
          pids.add(pid)
        }
      }

      // 杀死所有占用该端口的进程
      for (const pid of pids) {
        try {
          await execAsync(`taskkill /F /PID ${pid}`)
          logger.info('Killed process on port', { port, pid })
        } catch (error) {
          logger.warn('Failed to kill process', {
            port,
            pid,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      // 等待一小段时间确保端口释放
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (error) {
      // 如果netstat命令失败(可能是端口未被占用),不抛出错误
      logger.debug('Error checking port process', {
        port,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async isPortFree(port: number): Promise<boolean> {
    const reservedPorts = this.getReservedPorts()
    if (this.allocatedPorts.has(port) || reservedPorts.has(port)) {
      return false
    }
    
    // Check if port is actually free on the system
    return await this.checkSystemPort(port)
  }

  async checkConflicts(ports: readonly number[]): Promise<readonly PortConflict[]> {
    const conflicts: PortConflict[] = []
    
    for (const port of ports) {
      // Enhanced conflict detection with PID information
      const portStatus = await this.getDetailedPortStatus(port)
      
      if (!portStatus.isFree) {
        conflicts.push({
          port,
          currentOwner: portStatus.owner || 'system',
          requestedBy: 'application',
          pid: portStatus.pid
        })
      }
    }
    
    return conflicts
  }

  /**
   * Get detailed port status with PID information
   */
  private async getDetailedPortStatus(port: number): Promise<{
    isFree: boolean;
    owner?: string;
    pid?: number;
  }> {
    // First try the existing system port check
    const systemFree = await this.checkSystemPort(port)
    
    if (systemFree) {
      return { isFree: true }
    }

    // If system check says it's not free, try to get PID information
    try {
      const { spawn } = require('child_process')
      
      return new Promise((resolve) => {
        const netstat = spawn('netstat', ['-ano'], { shell: true, windowsHide: true })
        let output = ''
        
        netstat.stdout.on('data', (data: Buffer) => {
          output += data.toString()
        })
        
        netstat.on('close', () => {
          const lines = output.split('\n')
          for (const line of lines) {
            if (line.includes(`:${port} `) && line.includes('LISTENING')) {
              const parts = line.trim().split(/\s+/)
              const pid = parseInt(parts[parts.length - 1])
              resolve({ 
                isFree: false, 
                owner: 'system', 
                pid: isNaN(pid) ? undefined : pid 
              })
              return
            }
          }
          resolve({ isFree: false, owner: 'system' })
        })
        
        netstat.on('error', () => {
          resolve({ isFree: false, owner: 'system' })
        })
        
        // Timeout after 3 seconds
        setTimeout(() => {
          netstat.kill()
          resolve({ isFree: false, owner: 'system' })
        }, 3000)
      })
    } catch (error) {
      logger.warn('Failed to get detailed port status', { port, error: (error as Error).message })
      return { isFree: false, owner: 'system' }
    }
  }

  /**
   * Check if port is available for allocation
   */
  private isPortAvailable(port: number, scope: PortAllocationScope = 'unified'): boolean {
    const portRange = this.getPortRange(scope)
    const reservedPorts = this.getReservedPorts()
    
    // 基本检查
    if (this.allocatedPorts.has(port) || reservedPorts.has(port)) {
      return false
    }
    
    // 检查端口范围
    if (port < portRange.start || port > portRange.end) {
      return false
    }
    
    // 检查已添加应用的端口
    if (this.isPortUsedByExistingApp(port)) {
      return false
    }
    
    return true
  }

  /**
   * 检查端口是否已被已添加的应用使用
   * 查询 applications 表中的 network_config JSON 字段
   */
  private isPortUsedByExistingApp(port: number): boolean {
    if (!this.db) {
      return false // 没有数据库连接时跳过检查
    }
    
    try {
      const apps = this.db.prepare('SELECT id, name, network_config FROM applications').all() as any[]
      
      for (const app of apps) {
        if (!app.network_config) continue
        
        try {
          const networkConfig = JSON.parse(app.network_config)
          
          // 检查主端口
          if (networkConfig.primaryPort === port) {
            logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为主端口`)
            return true
          }
          
          // 检查次要端口
          if (Array.isArray(networkConfig.secondaryPorts) && 
              networkConfig.secondaryPorts.includes(port)) {
            logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为次要端口`)
            return true
          }
        } catch (parseError) {
          logger.warn(`解析应用 ${app.id} 的网络配置失败`, parseError)
        }
      }
      
      return false
    } catch (error) {
      logger.warn('检查已有应用端口时出错，跳过此检查', error)
      return false
    }
  }

  /**
   * Check if port is free on the system
   */
  private async checkSystemPort(port: number): Promise<boolean> {
    return new Promise(async (resolve) => {
      const { createServer } = await import('net')
      
      // Try to bind to the port to check if it's free
      const server = createServer()
      
      server.listen(port, '0.0.0.0', () => {
        server.close(() => {
          resolve(true) // Port is free
        })
      })
      
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
          resolve(false) // Port is in use
        } else {
          resolve(true) // Assume free on other errors
        }
      })
      
      // Timeout after 1 second
      setTimeout(() => {
        try {
          server.close()
        } catch (e) {
          // Ignore close errors
        }
        resolve(false) // Assume in use on timeout
      }, 1000)
    })
  }

  /**
   * Force kill process using a specific port (Windows only for now)
   */
  async forceReleasePort(port: number): Promise<boolean> {
    if (process.platform !== 'win32') {
      logger.warn('Force port release only supported on Windows', { port })
      return false
    }

    return new Promise((resolve) => {
      // Find process using the port
      const findCmd = `netstat -ano | findstr :${port}`
      const child = spawn('cmd', ['/c', findCmd], { shell: true, windowsHide: true })
      let pidToKill: string | null = null
      
      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 5) {
            const localAddr = parts[1]
            const pid = parts[4]
            if (localAddr.includes(`:${port}`)) {
              pidToKill = pid
              break
            }
          }
        }
      })
      
      child.on('close', () => {
        if (pidToKill && pidToKill !== '0') {
          // Kill the process
          const killCmd = `taskkill /PID ${pidToKill} /F`
          const killChild = spawn('cmd', ['/c', killCmd], { shell: true, windowsHide: true })
          
          killChild.on('close', (code) => {
            const success = code === 0
            logger.info('Force port release attempt', { port, pid: pidToKill, success })
            resolve(success)
          })
        } else {
          resolve(false)
        }
      })
      
      child.on('error', () => {
        resolve(false)
      })
    })
  }

  /**
   * Get allocation statistics
   */
  getStats(): { allocated: number; available: number; range: string } {
    const portRange = this.getPortRange('unified')
    const rangeSize = portRange.end - portRange.start + 1
    const reservedPorts = this.getReservedPorts()
    const reservedCount = reservedPorts.size
    const allocatedCount = this.allocatedPorts.size

    return {
      allocated: allocatedCount,
      available: rangeSize - reservedCount - allocatedCount,
      range: `${portRange.start}-${portRange.end}`
    }
  }

  /**
   * Reset all allocations (for testing)
   */
  reset(): void {
    this.allocatedPorts.clear()
    logger.info('All port allocations cleared')
  }
}
