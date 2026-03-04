/**
 * 审计日志服务 - Phase 2 实现
 * 
 * 记录系统关键操作的审计日志，支持：
 * - 内存缓存 + 文件持久化
 * - 按日期分割日志文件
 * - 日志查询和导出
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { logger } from '../utils/logger.js'

// ===============================================================================
// 类型定义
// ===============================================================================

export interface AuditLogEntry {
  id: string
  timestamp: string
  action: string
  userId: string
  username?: string
  userRole: string
  method: string
  path: string
  statusCode: number
  duration: number
  ip: string
  userAgent?: string
  details?: Record<string, any>
  success: boolean
}

export interface AuditLogQuery {
  startDate?: string
  endDate?: string
  userId?: string
  action?: string
  success?: boolean
  limit?: number
  offset?: number
}

// ===============================================================================
// 审计日志服务
// ===============================================================================

class AuditLogService {
  private logDir: string
  private memoryCache: AuditLogEntry[] = []
  private maxMemoryEntries = 1000
  private flushInterval: NodeJS.Timeout | null = null

  constructor() {
    this.logDir = join(process.cwd(), 'logs', 'audit')
    this.initialize()
  }

  private async initialize(): Promise<void> {
    try {
      // 确保日志目录存在
      await fs.mkdir(this.logDir, { recursive: true })
      
      // 启动定时刷新（每5分钟）
      this.flushInterval = setInterval(() => {
        this.flushToFile().catch(err => {
          logger.error('审计日志刷新失败', { error: err })
        })
      }, 5 * 60 * 1000)

      logger.info('✅ 审计日志服务初始化完成', { logDir: this.logDir })
    } catch (error) {
      logger.error('审计日志服务初始化失败', { error })
    }
  }

  /**
   * 记录审计日志
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const logEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...entry
    }

    // 添加到内存缓存
    this.memoryCache.push(logEntry)

    // 如果缓存过大，触发刷新
    if (this.memoryCache.length >= this.maxMemoryEntries) {
      await this.flushToFile()
    }

    // 同时输出到标准日志
    const logLevel = entry.success ? 'info' : 'warn'
    logger[logLevel](`[AUDIT] ${entry.action}`, {
      userId: entry.userId,
      userRole: entry.userRole,
      method: entry.method,
      path: entry.path,
      statusCode: entry.statusCode,
      duration: `${entry.duration}ms`,
      success: entry.success
    })
  }

  /**
   * 将内存缓存刷新到文件
   */
  private async flushToFile(): Promise<void> {
    if (this.memoryCache.length === 0) return

    const entries = [...this.memoryCache]
    this.memoryCache = []

    // 按日期分组
    const entriesByDate: Record<string, AuditLogEntry[]> = {}
    for (const entry of entries) {
      const date = entry.timestamp.split('T')[0] // YYYY-MM-DD
      if (!entriesByDate[date]) {
        entriesByDate[date] = []
      }
      entriesByDate[date].push(entry)
    }

    // 写入各日期文件
    for (const [date, dateEntries] of Object.entries(entriesByDate)) {
      const filePath = join(this.logDir, `audit-${date}.jsonl`)
      const lines = dateEntries.map(e => JSON.stringify(e)).join('\n') + '\n'
      
      try {
        await fs.appendFile(filePath, lines, 'utf8')
      } catch (error) {
        logger.error('写入审计日志文件失败', { filePath, error })
        // 将失败的条目放回缓存
        this.memoryCache.push(...dateEntries)
      }
    }
  }

  /**
   * 查询审计日志
   */
  async query(options: AuditLogQuery = {}): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const {
      startDate,
      endDate,
      userId,
      action,
      success,
      limit = 100,
      offset = 0
    } = options

    // 先从内存缓存查询
    let results: AuditLogEntry[] = [...this.memoryCache]

    // 如果有日期范围，从文件加载
    if (startDate || endDate) {
      const fileEntries = await this.loadFromFiles(startDate, endDate)
      results = [...fileEntries, ...results]
    }

    // 应用过滤器
    if (userId) {
      results = results.filter(e => e.userId === userId)
    }
    if (action) {
      results = results.filter(e => e.action.includes(action))
    }
    if (success !== undefined) {
      results = results.filter(e => e.success === success)
    }

    // 按时间倒序排序
    results.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    const total = results.length
    const entries = results.slice(offset, offset + limit)

    return { entries, total }
  }

  /**
   * 从文件加载日志
   */
  private async loadFromFiles(startDate?: string, endDate?: string): Promise<AuditLogEntry[]> {
    const entries: AuditLogEntry[] = []

    try {
      const files = await fs.readdir(this.logDir)
      const logFiles = files.filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))

      for (const file of logFiles) {
        // 从文件名提取日期
        const fileDate = file.replace('audit-', '').replace('.jsonl', '')
        
        // 检查日期范围
        if (startDate && fileDate < startDate) continue
        if (endDate && fileDate > endDate) continue

        const filePath = join(this.logDir, file)
        const content = await fs.readFile(filePath, 'utf8')
        const lines = content.trim().split('\n').filter(l => l)

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as AuditLogEntry
            entries.push(entry)
          } catch {
            // 跳过解析失败的行
          }
        }
      }
    } catch (error) {
      logger.error('加载审计日志文件失败', { error })
    }

    return entries
  }

  /**
   * 获取审计统计
   */
  async getStats(days: number = 7): Promise<{
    totalOperations: number
    successRate: number
    topActions: Array<{ action: string; count: number }>
    topUsers: Array<{ userId: string; count: number }>
    dailyStats: Array<{ date: string; total: number; success: number; failed: number }>
  }> {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    
    const { entries } = await this.query({
      startDate: startDate.toISOString().split('T')[0],
      limit: 10000
    })

    // 计算统计
    const totalOperations = entries.length
    const successCount = entries.filter(e => e.success).length
    const successRate = totalOperations > 0 ? (successCount / totalOperations) * 100 : 0

    // Top actions
    const actionCounts: Record<string, number> = {}
    for (const entry of entries) {
      actionCounts[entry.action] = (actionCounts[entry.action] || 0) + 1
    }
    const topActions = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Top users
    const userCounts: Record<string, number> = {}
    for (const entry of entries) {
      userCounts[entry.userId] = (userCounts[entry.userId] || 0) + 1
    }
    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Daily stats
    const dailyStatsMap: Record<string, { total: number; success: number; failed: number }> = {}
    for (const entry of entries) {
      const date = entry.timestamp.split('T')[0]
      if (!dailyStatsMap[date]) {
        dailyStatsMap[date] = { total: 0, success: 0, failed: 0 }
      }
      dailyStatsMap[date].total++
      if (entry.success) {
        dailyStatsMap[date].success++
      } else {
        dailyStatsMap[date].failed++
      }
    }
    const dailyStats = Object.entries(dailyStatsMap)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return {
      totalOperations,
      successRate: Math.round(successRate * 100) / 100,
      topActions,
      topUsers,
      dailyStats
    }
  }

  /**
   * 清理旧日志
   */
  async cleanup(retainDays: number = 90): Promise<number> {
    let deletedCount = 0
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retainDays)
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

    try {
      const files = await fs.readdir(this.logDir)
      for (const file of files) {
        if (!file.startsWith('audit-') || !file.endsWith('.jsonl')) continue
        
        const fileDate = file.replace('audit-', '').replace('.jsonl', '')
        if (fileDate < cutoffDateStr) {
          await fs.unlink(join(this.logDir, file))
          deletedCount++
          logger.info('已删除过期审计日志', { file })
        }
      }
    } catch (error) {
      logger.error('清理审计日志失败', { error })
    }

    return deletedCount
  }

  /**
   * 关闭服务
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    await this.flushToFile()
    logger.info('审计日志服务已关闭')
  }
}

// 导出单例
export const auditLogService = new AuditLogService()

export default auditLogService
