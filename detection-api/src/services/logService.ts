/**
 * Log Service
 * 日志管理服务
 */

import { Database } from 'better-sqlite3'
import { promises as fs } from 'fs'
import { existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import {
  LogEntry,
  LogQuery,
  LogStats,
  LogExportOptions,
  LogClearOptions,
  LogClearResult,
  LogLevel,
  LogSource,
  RawLogEntry,
  WinstonLogEntry,
  PowerShellLogEntry,
  PM2LogEntry,
  LogParseResult,
  LogFileInfo
} from '../models/LogEntry'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class LogService {
  private db: Database
  private logPaths: Record<string, string>
  private cacheTimeout: number = 5 * 60 * 1000 // 5分钟缓存
  private lastCacheRefresh: number = 0
  private maxFileSize: number = 100 * 1024 * 1024 // 100MB最大文件大小

  constructor(database: Database) {
    this.db = database
    this.initializeLogPaths()
    this.initializeDatabase()
  }

  /**
   * 初始化日志文件路径
   */
  private initializeLogPaths(): void {
    const projectRoot = join(__dirname, '../../../')
    
    this.logPaths = {
      // Winston日志文件
      winston_combined: join(__dirname, '../../logs/combined.log'),
      winston_error: join(__dirname, '../../logs/error.log'),
      
      // PowerShell日志文件
      powershell_system: join(projectRoot, 'logs/system.log'),
      powershell_api: join(projectRoot, 'logs/api.log'),
      powershell_recovery: join(projectRoot, 'logs/recovery.log'),
      powershell_monitor: join(projectRoot, 'logs/monitor.log'),
      powershell_startup: join(projectRoot, 'logs/startup.log'),
      
      // PM2日志文件
      pm2_combined: join(__dirname, '../../logs/pm2-combined.log'),
      pm2_error: join(__dirname, '../../logs/pm2-error.log'),
      pm2_out: join(__dirname, '../../logs/pm2-out.log')
    }
  }

  /**
   * 初始化数据库表
   */
  private initializeDatabase(): void {
    try {
      // 创建日志缓存表（用于提高查询性能）
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS log_cache (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          source TEXT NOT NULL,
          app_id TEXT,
          app_name TEXT,
          metadata TEXT,
          file_source TEXT NOT NULL,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_log_cache_timestamp ON log_cache(timestamp);
        CREATE INDEX IF NOT EXISTS idx_log_cache_level ON log_cache(level);
        CREATE INDEX IF NOT EXISTS idx_log_cache_source ON log_cache(source);
        CREATE INDEX IF NOT EXISTS idx_log_cache_app_id ON log_cache(app_id);
      `)

      logger.debug('日志服务数据库初始化完成')
    } catch (error) {
      logger.error('日志服务数据库初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取应用日志
   */
  async getAppLogs(appId: string, query: LogQuery = {}): Promise<{
    logs: LogEntry[]
    total: number
    stats: LogStats
  }> {
    try {
      // 首先从文件读取最新日志
      await this.refreshLogCache()

      const whereConditions: string[] = ['app_id = ?']
      const params: any[] = [appId]

      if (query.level) {
        whereConditions.push('level = ?')
        params.push(query.level)
      }

      if (query.source) {
        whereConditions.push('source = ?')
        params.push(query.source)
      }

      if (query.startTime) {
        whereConditions.push('timestamp >= ?')
        params.push(query.startTime)
      }

      if (query.endTime) {
        whereConditions.push('timestamp <= ?')
        params.push(query.endTime)
      }

      if (query.search) {
        whereConditions.push('message LIKE ?')
        params.push(`%${query.search}%`)
      }

      const whereClause = whereConditions.join(' AND ')
      const limit = query.limit || 100
      const offset = query.offset || 0

      // 查询日志
      const logsStmt = this.db.prepare(`
        SELECT * FROM log_cache 
        WHERE ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `)
      const logRows = logsStmt.all(...params, limit, offset)

      // 查询总数
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM log_cache WHERE ${whereClause}
      `)
      const { total } = countStmt.get(...params) as { total: number }

      // 转换为LogEntry格式
      const logs: LogEntry[] = logRows.map(row => this.rowToLogEntry(row))

      // 生成统计信息
      const stats = await this.generateStats(appId, query)

      return { logs, total, stats }
    } catch (error) {
      logger.error('获取应用日志失败:', error)
      throw error
    }
  }

  /**
   * 获取系统日志
   */
  async getSystemLogs(query: LogQuery = {}): Promise<{
    logs: LogEntry[]
    total: number
    stats: LogStats
  }> {
    try {
      // 刷新日志缓存
      await this.refreshLogCache()

      const whereConditions: string[] = []
      const params: any[] = []

      if (query.level) {
        whereConditions.push('level = ?')
        params.push(query.level)
      }

      if (query.source) {
        whereConditions.push('source = ?')
        params.push(query.source)
      }

      if (query.startTime) {
        whereConditions.push('timestamp >= ?')
        params.push(query.startTime)
      }

      if (query.endTime) {
        whereConditions.push('timestamp <= ?')
        params.push(query.endTime)
      }

      if (query.search) {
        whereConditions.push('message LIKE ?')
        params.push(`%${query.search}%`)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
      const limit = query.limit || 100
      const offset = query.offset || 0

      // 查询日志
      const logsStmt = this.db.prepare(`
        SELECT * FROM log_cache 
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `)
      const logRows = logsStmt.all(...params, limit, offset)

      // 查询总数
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM log_cache ${whereClause}
      `)
      const { total } = countStmt.get(...params) as { total: number }

      // 转换为LogEntry格式
      const logs: LogEntry[] = logRows.map(row => this.rowToLogEntry(row))

      // 生成统计信息
      const stats = await this.generateStats(undefined, query)

      return { logs, total, stats }
    } catch (error) {
      logger.error('获取系统日志失败:', error)
      throw error
    }
  }

  /**
   * 导出日志
   */
  async exportLogs(options: LogExportOptions): Promise<Buffer> {
    try {
      const query: LogQuery = {
        appId: options.appId,
        level: options.level,
        source: options.source,
        startTime: options.startTime,
        endTime: options.endTime,
        search: options.search,
        limit: 10000 // 导出时增加限制
      }

      const { logs } = options.appId 
        ? await this.getAppLogs(options.appId, query)
        : await this.getSystemLogs(query)

      switch (options.format) {
        case 'json':
          return Buffer.from(JSON.stringify(logs, null, 2))
        case 'csv':
          return this.exportToCsv(logs)
        case 'txt':
          return this.exportToTxt(logs)
        default:
          throw new Error(`不支持的导出格式: ${options.format}`)
      }
    } catch (error) {
      logger.error('导出日志失败:', error)
      throw error
    }
  }

  /**
   * 清理日志
   */
  async clearLogs(options: LogClearOptions = {}): Promise<LogClearResult> {
    try {
      const whereConditions: string[] = []
      const params: any[] = []

      if (options.appId) {
        whereConditions.push('app_id = ?')
        params.push(options.appId)
      }

      if (options.olderThan) {
        whereConditions.push('timestamp < ?')
        params.push(options.olderThan)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      const deleteStmt = this.db.prepare(`DELETE FROM log_cache ${whereClause}`)
      const result = deleteStmt.run(...params)

      return {
        deletedCount: result.changes,
        message: `成功清理 ${result.changes} 条日志记录`
      }
    } catch (error) {
      logger.error('清理日志失败:', error)
      throw error
    }
  }

  /**
   * 获取日志统计
   */
  async getLogStats(query: LogQuery = {}): Promise<LogStats> {
    try {
      return await this.generateStats(query.appId, query)
    } catch (error) {
      logger.error('获取日志统计失败:', error)
      throw error
    }
  }

  /**
   * 预估清理数量（与清理逻辑使用完全相同的查询）
   */
  async estimateCleanup(retentionDays: number = 7): Promise<{
    totalCount: number
    retainedCount: number
    deleteCount: number
    retentionDays: number
    cutoffDate: string
  }> {
    try {
      // 使用 ISO 格式，与数据库存储格式一致
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
      const cutoffStr = cutoffDate.toISOString()

      // 总数
      const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache')
      const { count: totalCount } = totalStmt.get() as { count: number }

      // 要删除的数量
      const deleteStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?')
      const { count: deleteCount } = deleteStmt.get(cutoffStr) as { count: number }

      return {
        totalCount,
        retainedCount: totalCount - deleteCount,
        deleteCount,
        retentionDays,
        cutoffDate: cutoffStr
      }
    } catch (error) {
      logger.error('预估清理数量失败:', error)
      throw error
    }
  }

  /**
   * 清理过期日志
   * @param retentionDays 保留天数
   */
  async cleanupOldLogs(retentionDays: number = 7): Promise<{
    deletedCount: number
    retentionDays: number
    cutoffDate: string
    beforeSize: number
    afterSize: number
  }> {
    try {
      // 计算截止日期（使用 ISO 格式，与数据库存储格式一致）
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
      const cutoffStr = cutoffDate.toISOString()

      // 统计删除前的记录数
      const beforeCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache')
      const { count: beforeCount } = beforeCountStmt.get() as { count: number }

      // 统计要删除的记录数
      const deleteCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?')
      const { count: deletedCount } = deleteCountStmt.get(cutoffStr) as { count: number }

      // 执行删除数据库缓存
      if (deletedCount > 0) {
        const deleteStmt = this.db.prepare('DELETE FROM log_cache WHERE timestamp < ?')
        deleteStmt.run(cutoffStr)

        logger.debug(`清理过期日志缓存: 删除 ${deletedCount} 条记录 (保留${retentionDays}天)`)

        // 优化数据库
        this.db.prepare('VACUUM').run()
      }

      // 同时清理日志文件中的旧内容
      await this.cleanupLogFiles(cutoffDate)

      // 统计删除后的记录数
      const afterCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache')
      const { count: afterCount } = afterCountStmt.get() as { count: number }

      return {
        deletedCount,
        retentionDays,
        cutoffDate: cutoffStr,
        beforeSize: beforeCount,
        afterSize: afterCount
      }
    } catch (error) {
      logger.error('清理日志失败:', error)
      throw error
    }
  }

  /**
   * 清理日志文件中的旧内容
   */
  private async cleanupLogFiles(cutoffDate: Date): Promise<void> {
    for (const [key, filePath] of Object.entries(this.logPaths)) {
      try {
        if (!existsSync(filePath)) continue

        const stats = statSync(filePath)
        if (stats.size === 0) continue

        // 读取文件内容
        const content = await fs.readFile(filePath, 'utf-8')
        const lines = content.split('\n')
        
        // 过滤保留新的日志行
        const filteredLines = lines.filter(line => {
          if (!line.trim()) return false
          
          try {
            // 尝试从日志行中提取时间戳
            let timestamp: Date | null = null
            
            if (key.startsWith('winston_')) {
              // Winston JSON 格式
              const parsed = JSON.parse(line)
              if (parsed.timestamp) timestamp = new Date(parsed.timestamp)
            } else if (key.startsWith('powershell_')) {
              // PowerShell 格式: [timestamp] ...
              const match = line.match(/^\[([^\]]+)\]/)
              if (match) timestamp = new Date(match[1])
            }
            
            // 如果无法解析时间，保留该行
            if (!timestamp || isNaN(timestamp.getTime())) return true
            
            // 保留截止日期之后的日志
            return timestamp >= cutoffDate
          } catch {
            // 解析失败的行保留
            return true
          }
        })

        // 只有当有内容被删除时才写回文件
        if (filteredLines.length < lines.length) {
          await fs.writeFile(filePath, filteredLines.join('\n'), 'utf-8')
          logger.debug(`清理日志文件: ${key}`, {
            before: lines.length,
            after: filteredLines.length,
            removed: lines.length - filteredLines.length
          })
        }
      } catch (error) {
        logger.warn(`清理日志文件失败: ${key}`, { error })
        // 继续处理其他文件
      }
    }
  }

  /**
   * 自动清理过期日志缓存
   * 保留最近30天的日志，删除更早的记录
   */
  private async autoCleanupOldLogs(): Promise<void> {
    try {
      // 计算30天前的时间戳
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - 30)
      const cutoffStr = cutoffDate.toISOString().replace('T', ' ').substring(0, 19)

      // 统计要删除的记录数
      const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM log_cache WHERE timestamp < ?')
      const { count } = countStmt.get(cutoffStr) as { count: number }

      if (count > 0) {
        // 删除过期记录
        const deleteStmt = this.db.prepare('DELETE FROM log_cache WHERE timestamp < ?')
        deleteStmt.run(cutoffStr)

        logger.info(`自动清理过期日志: 删除 ${count} 条记录 (30天前)`)

        // 优化数据库（每次清理后执行）
        this.db.prepare('VACUUM').run()
      }
    } catch (error) {
      logger.error('自动清理日志失败:', error)
    }
  }

  /**
   * 刷新日志缓存（带缓存策略）
   */
  private async refreshLogCache(): Promise<void> {
    const now = Date.now()

    // 如果缓存还在有效期内，跳过刷新
    if (now - this.lastCacheRefresh < this.cacheTimeout) {
      return
    }

    // 每次刷新时检查是否需要清理（每小时检查一次）
    const hoursSinceLastCleanup = (now - this.lastCacheRefresh) / (1000 * 60 * 60)
    if (hoursSinceLastCleanup >= 1) {
      await this.autoCleanupOldLogs()
    }

    try {
      let processedFiles = 0
      const startTime = Date.now()

      for (const [key, filePath] of Object.entries(this.logPaths)) {
        if (existsSync(filePath)) {
          // 检查文件大小
          const stats = statSync(filePath)
          if (stats.size > this.maxFileSize) {
            logger.warn(`日志文件过大，跳过处理: ${filePath} (${Math.round(stats.size / 1024 / 1024)}MB)`)
            continue
          }

          await this.parseLogFile(filePath, key)
          processedFiles++
        }
      }

      this.lastCacheRefresh = now
      const duration = Date.now() - startTime

      logger.debug('日志缓存刷新完成', {
        processedFiles,
        duration: `${duration}ms`,
        nextRefresh: new Date(now + this.cacheTimeout).toISOString()
      })
    } catch (error) {
      logger.error('刷新日志缓存失败:', error)
      // 不抛出错误，允许降级处理
    }
  }

  /**
   * 解析日志文件（优化版本）
   */
  private async parseLogFile(filePath: string, fileKey: string): Promise<void> {
    try {
      // 检查文件大小
      const stats = statSync(filePath)
      if (stats.size === 0) {
        return // 空文件，跳过
      }

      // 对于大文件，只读取最后的部分
      const maxReadSize = 1024 * 1024 // 1MB
      let content: string

      if (stats.size > maxReadSize) {
        // 读取文件末尾的内容
        const fileHandle = await fs.open(filePath, 'r')
        const buffer = Buffer.alloc(maxReadSize)
        await fileHandle.read(buffer, 0, maxReadSize, stats.size - maxReadSize)
        await fileHandle.close()
        content = buffer.toString('utf-8')

        // 确保从完整的行开始
        const firstNewlineIndex = content.indexOf('\n')
        if (firstNewlineIndex > 0) {
          content = content.substring(firstNewlineIndex + 1)
        }
      } else {
        content = await fs.readFile(filePath, 'utf-8')
      }

      const lines = content.split('\n').filter(line => line.trim())
      let processedLines = 0
      let errorCount = 0

      for (const line of lines) {
        try {
          const parseResult = this.parseLogLine(line, fileKey)
          if (parseResult.success && parseResult.entry) {
            await this.cacheLogEntry(parseResult.entry, fileKey)
            processedLines++
          }
        } catch (error) {
          errorCount++
          if (errorCount <= 5) { // 只记录前5个错误
            logger.debug(`解析日志行失败 ${filePath}:`, { line: line.substring(0, 100), error })
          }
        }
      }

      if (processedLines > 0) {
        logger.debug(`解析日志文件完成 ${filePath}:`, {
          totalLines: lines.length,
          processedLines,
          errorCount,
          fileSize: `${Math.round(stats.size / 1024)}KB`
        })
      }
    } catch (error) {
      logger.error(`解析日志文件失败 ${filePath}:`, error)
    }
  }

  /**
   * 解析单行日志
   */
  private parseLogLine(line: string, fileKey: string): LogParseResult {
    try {
      if (fileKey.startsWith('winston_')) {
        return this.parseWinstonLog(line)
      } else if (fileKey.startsWith('powershell_')) {
        return this.parsePowerShellLog(line)
      } else if (fileKey.startsWith('pm2_')) {
        return this.parsePM2Log(line)
      }

      return { success: false, error: '未知的日志格式' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 解析Winston日志
   */
  private parseWinstonLog(line: string): LogParseResult {
    try {
      const winstonEntry: WinstonLogEntry = JSON.parse(line)

      const entry: LogEntry = {
        id: uuidv4(),
        timestamp: winstonEntry.timestamp,
        level: this.normalizeLogLevel(winstonEntry.level),
        message: winstonEntry.message,
        source: LogSource.WINSTON,
        metadata: { ...winstonEntry }
      }

      return { success: true, entry }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 解析PowerShell日志
   */
  private parsePowerShellLog(line: string): LogParseResult {
    try {
      // 格式: [timestamp] [component] [level] [source] message
      const match = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)$/)

      if (!match) {
        return { success: false, error: 'PowerShell日志格式不匹配' }
      }

      const [, timestamp, component, level, source, message] = match

      const entry: LogEntry = {
        id: uuidv4(),
        timestamp: timestamp,
        level: this.normalizeLogLevel(level),
        message: message,
        source: LogSource.POWERSHELL,
        metadata: { component, originalSource: source }
      }

      return { success: true, entry }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 解析PM2日志
   */
  private parsePM2Log(line: string): LogParseResult {
    try {
      // PM2日志格式可能比较复杂，这里做简单处理
      const entry: LogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: line,
        source: LogSource.PM2
      }

      return { success: true, entry }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 标准化日志级别
   */
  private normalizeLogLevel(level: string): LogLevel {
    const normalizedLevel = level.toLowerCase()
    switch (normalizedLevel) {
      case 'debug':
        return LogLevel.DEBUG
      case 'info':
      case 'success':
        return LogLevel.INFO
      case 'warn':
      case 'warning':
        return LogLevel.WARN
      case 'error':
      case 'fatal':
        return LogLevel.ERROR
      default:
        return LogLevel.INFO
    }
  }

  /**
   * 缓存日志条目
   */
  private async cacheLogEntry(entry: LogEntry, fileSource: string): Promise<void> {
    try {
      // 检查是否已存在（避免重复）
      const existsStmt = this.db.prepare('SELECT id FROM log_cache WHERE id = ?')
      const exists = existsStmt.get(entry.id)

      if (!exists) {
        const insertStmt = this.db.prepare(`
          INSERT INTO log_cache (
            id, timestamp, level, message, source, app_id, app_name, metadata, file_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        insertStmt.run(
          entry.id,
          entry.timestamp,
          entry.level,
          entry.message,
          entry.source,
          entry.appId || null,
          entry.appName || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          fileSource
        )
      }
    } catch (error) {
      logger.error('缓存日志条目失败:', error)
    }
  }

  /**
   * 数据库行转换为LogEntry
   */
  private rowToLogEntry(row: any): LogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogLevel,
      message: row.message,
      source: row.source,
      appId: row.app_id || undefined,
      appName: row.app_name || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }
  }

  /**
   * 生成统计信息
   */
  private async generateStats(appId?: string, query: LogQuery = {}): Promise<LogStats> {
    try {
      const whereConditions: string[] = []
      const params: any[] = []

      if (appId) {
        whereConditions.push('app_id = ?')
        params.push(appId)
      }

      if (query.startTime) {
        whereConditions.push('timestamp >= ?')
        params.push(query.startTime)
      }

      if (query.endTime) {
        whereConditions.push('timestamp <= ?')
        params.push(query.endTime)
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      // 总数统计
      const totalStmt = this.db.prepare(`SELECT COUNT(*) as total FROM log_cache ${whereClause}`)
      const { total } = totalStmt.get(...params) as { total: number }

      // 按级别统计
      const levelStmt = this.db.prepare(`
        SELECT level, COUNT(*) as count FROM log_cache ${whereClause}
        GROUP BY level
      `)
      const levelRows = levelStmt.all(...params) as { level: string; count: number }[]

      const byLevel: Record<LogLevel, number> = {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0
      }

      levelRows.forEach(row => {
        byLevel[row.level as LogLevel] = row.count
      })

      // 按来源统计
      const sourceStmt = this.db.prepare(`
        SELECT source, COUNT(*) as count FROM log_cache ${whereClause}
        GROUP BY source
      `)
      const sourceRows = sourceStmt.all(...params) as { source: string; count: number }[]

      const bySource: Record<string, number> = {}
      sourceRows.forEach(row => {
        bySource[row.source] = row.count
      })

      // 时间范围
      const timeRangeStmt = this.db.prepare(`
        SELECT MIN(timestamp) as start, MAX(timestamp) as end FROM log_cache ${whereClause}
      `)
      const timeRange = timeRangeStmt.get(...params) as { start: string; end: string }

      return {
        total,
        byLevel,
        bySource,
        timeRange: {
          start: timeRange.start || '',
          end: timeRange.end || ''
        }
      }
    } catch (error) {
      logger.error('生成统计信息失败:', error)
      throw error
    }
  }

  /**
   * 导出为CSV格式
   */
  private exportToCsv(logs: LogEntry[]): Buffer {
    const headers = ['ID', 'Timestamp', 'Level', 'Message', 'Source', 'App ID', 'App Name']
    const csvLines = [headers.join(',')]

    logs.forEach(log => {
      const row = [
        log.id,
        log.timestamp,
        log.level,
        `"${log.message.replace(/"/g, '""')}"`, // 转义双引号
        log.source,
        log.appId || '',
        log.appName || ''
      ]
      csvLines.push(row.join(','))
    })

    return Buffer.from(csvLines.join('\n'))
  }

  /**
   * 导出为TXT格式
   */
  private exportToTxt(logs: LogEntry[]): Buffer {
    const txtLines = logs.map(log => {
      return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`
    })

    return Buffer.from(txtLines.join('\n'))
  }
}
