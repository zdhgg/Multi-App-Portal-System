/**
 * 性能监控中间件
 * 
 * 记录请求性能指标和慢请求
 */

import { Request, Response, NextFunction } from 'express'
import { performance } from 'perf_hooks'
import { logger } from '../utils/logger.js'

interface PerformanceMetrics {
  method: string
  path: string
  duration: number
  statusCode: number
  timestamp: number
  userAgent?: string
  ip?: string
}

class MetricsCollector {
  private metrics: PerformanceMetrics[] = []
  private maxMetrics = 1000 // 保留最近1000条记录

  /**
   * 记录指标
   */
  record(metric: PerformanceMetrics): void {
    this.metrics.push(metric)

    // 保持最近的记录
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }
  }

  /**
   * 获取统计信息
   */
  getStats(duration: number = 3600000): {
    count: number
    avgDuration: number
    minDuration: number
    maxDuration: number
    p50: number
    p95: number
    p99: number
    slowRequests: number
  } {
    const now = Date.now()
    const recent = this.metrics.filter(m => now - m.timestamp < duration)

    if (recent.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        slowRequests: 0
      }
    }

    const durations = recent.map(m => m.duration).sort((a, b) => a - b)
    const sum = durations.reduce((a, b) => a + b, 0)

    return {
      count: recent.length,
      avgDuration: sum / recent.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99),
      slowRequests: recent.filter(m => m.duration > 1000).length
    }
  }

  /**
   * 获取慢请求
   */
  getSlowRequests(threshold: number = 1000, limit: number = 10): PerformanceMetrics[] {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit)
  }

  /**
   * 按路径分组统计
   */
  getStatsByPath(): Record<string, {
    count: number
    avgDuration: number
    maxDuration: number
  }> {
    const grouped: Record<string, number[]> = {}

    for (const metric of this.metrics) {
      if (!grouped[metric.path]) {
        grouped[metric.path] = []
      }
      grouped[metric.path].push(metric.duration)
    }

    const result: Record<string, any> = {}

    for (const [path, durations] of Object.entries(grouped)) {
      const sum = durations.reduce((a, b) => a + b, 0)
      result[path] = {
        count: durations.length,
        avgDuration: sum / durations.length,
        maxDuration: Math.max(...durations)
      }
    }

    return result
  }

  /**
   * 计算百分位数
   */
  private percentile(values: number[], p: number): number {
    const index = Math.ceil(values.length * p) - 1
    return values[Math.max(0, index)]
  }

  /**
   * 清除旧数据
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now()
    this.metrics = this.metrics.filter(m => now - m.timestamp < maxAge)
  }
}

// 全局指标收集器
const metricsCollector = new MetricsCollector()

// 定期清理旧数据
setInterval(() => {
  metricsCollector.cleanup()
}, 300000) // 每5分钟清理一次

/**
 * 性能监控中间件
 */
export const performanceMonitor = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = performance.now()

  // 记录请求开始
  const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`
  
  // 在响应完成时记录指标
  res.on('finish', () => {
    const duration = performance.now() - start

    // 记录指标
    const metric: PerformanceMetrics = {
      method: req.method,
      path: req.route?.path || req.path,
      duration,
      statusCode: res.statusCode,
      timestamp: Date.now(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    }

    metricsCollector.record(metric)

    // 记录慢请求
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        method: req.method,
        path: req.path,
        duration: `${duration.toFixed(2)}ms`,
        statusCode: res.statusCode
      })
    }

    // 在响应头中添加性能信息
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`)
  })

  next()
}

/**
 * 获取性能统计信息
 */
export function getPerformanceStats(duration?: number) {
  return metricsCollector.getStats(duration)
}

/**
 * 获取慢请求列表
 */
export function getSlowRequests(threshold?: number, limit?: number) {
  return metricsCollector.getSlowRequests(threshold, limit)
}

/**
 * 获取按路径分组的统计
 */
export function getStatsByPath() {
  return metricsCollector.getStatsByPath()
}

/**
 * 性能统计路由
 */
export function createPerformanceRouter() {
  const { Router } = require('express')
  const router = Router()

  // 获取总体统计
  router.get('/stats', (req: Request, res: Response) => {
    const duration = parseInt(req.query.duration as string) || 3600000
    const stats = getPerformanceStats(duration)
    
    res.json({
      success: true,
      data: stats
    })
  })

  // 获取慢请求
  router.get('/slow-requests', (req: Request, res: Response) => {
    const threshold = parseInt(req.query.threshold as string) || 1000
    const limit = parseInt(req.query.limit as string) || 10
    const slowRequests = getSlowRequests(threshold, limit)
    
    res.json({
      success: true,
      data: slowRequests
    })
  })

  // 获取按路径分组的统计
  router.get('/by-path', (req: Request, res: Response) => {
    const stats = getStatsByPath()
    
    res.json({
      success: true,
      data: stats
    })
  })

  return router
}
