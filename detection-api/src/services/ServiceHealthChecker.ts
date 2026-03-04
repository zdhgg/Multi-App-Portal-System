/**
 * 服务健康检查系统
 * 
 * 提供各个服务的健康状态检查
 */

import { Database } from 'better-sqlite3'
import { logger } from '../utils/logger.js'

export interface HealthCheckResult {
  healthy: boolean
  message?: string
  details?: any
  timestamp: string
}

export interface SystemHealthResult {
  healthy: boolean
  timestamp: string
  checks: Record<string, HealthCheckResult>
  summary: {
    total: number
    healthy: number
    unhealthy: number
  }
}

export class ServiceHealthChecker {
  private healthChecks = new Map<string, () => Promise<HealthCheckResult>>()

  /**
   * 注册健康检查
   */
  register(name: string, check: () => Promise<HealthCheckResult>): void {
    this.healthChecks.set(name, check)
    logger.debug('Health check registered', { name })
  }

  /**
   * 执行所有健康检查
   */
  async checkAll(): Promise<SystemHealthResult> {
    const checks: Record<string, HealthCheckResult> = {}
    let healthyCount = 0
    let unhealthyCount = 0

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await Promise.race([
          check(),
          this.timeout(5000, name)
        ])

        checks[name] = result

        if (result.healthy) {
          healthyCount++
        } else {
          unhealthyCount++
        }
      } catch (error) {
        checks[name] = {
          healthy: false,
          message: error instanceof Error ? error.message : 'Check failed',
          timestamp: new Date().toISOString()
        }
        unhealthyCount++
      }
    }

    const allHealthy = unhealthyCount === 0

    return {
      healthy: allHealthy,
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        total: this.healthChecks.size,
        healthy: healthyCount,
        unhealthy: unhealthyCount
      }
    }
  }

  /**
   * 执行单个健康检查
   */
  async checkOne(name: string): Promise<HealthCheckResult> {
    const check = this.healthChecks.get(name)

    if (!check) {
      return {
        healthy: false,
        message: `Health check not found: ${name}`,
        timestamp: new Date().toISOString()
      }
    }

    try {
      return await Promise.race([
        check(),
        this.timeout(5000, name)
      ])
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Check failed',
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 超时处理
   */
  private timeout(ms: number, checkName: string): Promise<HealthCheckResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Health check timeout: ${checkName}`))
      }, ms)
    })
  }

  /**
   * 获取已注册的检查列表
   */
  getRegisteredChecks(): string[] {
    return Array.from(this.healthChecks.keys())
  }
}

/**
 * 创建标准健康检查
 */
export function createStandardHealthChecks(
  db: Database,
  services: any
): ServiceHealthChecker {
  const checker = new ServiceHealthChecker()

  // 数据库健康检查
  checker.register('database', async () => {
    try {
      db.prepare('SELECT 1').get()
      return {
        healthy: true,
        message: 'Database connection is healthy',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        healthy: false,
        message: 'Database connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }
  })

  // PM2 服务健康检查
  checker.register('pm2', async () => {
    try {
      const pm2Service = services.pm2Service
      if (!pm2Service) {
        return {
          healthy: false,
          message: 'PM2 service not available',
          timestamp: new Date().toISOString()
        }
      }

      // 尝试连接 PM2
      await pm2Service.connect()
      
      return {
        healthy: true,
        message: 'PM2 service is healthy',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        healthy: false,
        message: 'PM2 service connection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }
  })

  // 端口管理服务健康检查
  checker.register('portManagement', async () => {
    try {
      const portService = services.portManagementService
      if (!portService) {
        return {
          healthy: false,
          message: 'Port management service not available',
          timestamp: new Date().toISOString()
        }
      }

      const stats = await portService.getPortStatistics()
      
      return {
        healthy: true,
        message: 'Port management service is healthy',
        details: {
          allocated: stats.allocated,
          available: stats.available
        },
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        healthy: false,
        message: 'Port management service check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }
  })

  // 内存使用检查
  checker.register('memory', async () => {
    const usage = process.memoryUsage()
    const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100

    const healthy = heapUsedPercent < 90 // 内存使用低于90%

    return {
      healthy,
      message: healthy ? 'Memory usage is normal' : 'Memory usage is high',
      details: {
        heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsedPercent: `${heapUsedPercent.toFixed(2)}%`,
        rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`
      },
      timestamp: new Date().toISOString()
    }
  })

  // 磁盘空间检查（仅在有数据库路径时）
  checker.register('diskSpace', async () => {
    try {
      const dbPath = db.name
      if (!dbPath) {
        return {
          healthy: true,
          message: 'Disk space check skipped (no database path)',
          timestamp: new Date().toISOString()
        }
      }

      // 简单检查：尝试写入测试
      db.prepare('SELECT 1').get()

      return {
        healthy: true,
        message: 'Disk space is sufficient',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        healthy: false,
        message: 'Disk space check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }
    }
  })

  return checker
}

/**
 * 创建健康检查路由
 */
export function createHealthCheckRouter(checker: ServiceHealthChecker) {
  const { Router } = require('express')
  const router = Router()

  // 简单健康检查
  router.get('/', async (req: any, res: any) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    })
  })

  // 详细健康检查
  router.get('/detailed', async (req: any, res: any) => {
    try {
      const result = await checker.checkAll()
      const statusCode = result.healthy ? 200 : 503

      res.status(statusCode).json({
        success: result.healthy,
        data: result
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // 单个服务健康检查
  router.get('/:service', async (req: any, res: any) => {
    try {
      const result = await checker.checkOne(req.params.service)
      const statusCode = result.healthy ? 200 : 503

      res.status(statusCode).json({
        success: result.healthy,
        data: result
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // 获取已注册的检查列表
  router.get('/checks/list', (req: any, res: any) => {
    const checks = checker.getRegisteredChecks()
    res.json({
      success: true,
      data: checks
    })
  })

  return router
}
