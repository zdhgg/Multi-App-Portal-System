/**
 * Log Management Service
 * 日志管理服务 - 提供日志清理、归档、统计等功能
 */

import { Database } from 'better-sqlite3'
import { promises as fs } from 'fs'
import { existsSync, statSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { logger } from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface LogManagementConfig {
  // 保留策略
  retentionDays: number
  maxTotalSize: number // MB
  autoCleanup: boolean
  cleanupSchedule: string // cron表达式
  
  // 归档策略
  enableArchive: boolean
  archiveAfterDays: number
  archivePath: string
  
  // 文件大小限制
  maxFileSize: number // MB
  maxFiles: number
}

export interface LogFileInfo {
  name: string
  path: string
  size: number // bytes
  sizeFormatted: string
  lines?: number
  lastModified: Date
  type: 'winston' | 'pm2' | 'system'
  isArchived: boolean
}

export interface LogStorageStats {
  totalFiles: number
  totalSize: number // bytes
  totalSizeFormatted: string
  oldestLog: Date | null
  newestLog: Date | null
  filesByType: {
    winston: number
    pm2: number
    system: number
  }
  sizeByType: {
    winston: number
    pm2: number
    system: number
  }
}

export interface CleanupResult {
  filesDeleted: number
  bytesFreed: number
  bytesFreedFormatted: string
  errors: string[]
}

export interface ArchiveResult {
  filesArchived: number
  archiveSize: number
  archivePath: string
  errors: string[]
}

export class LogManagementService {
  private db: Database
  private config: LogManagementConfig
  private logPaths: Record<string, string>

  constructor(database: Database, config?: Partial<LogManagementConfig>) {
    this.db = database
    this.config = {
      retentionDays: 7,
      maxTotalSize: 100, // 100MB
      autoCleanup: true,
      cleanupSchedule: '0 2 * * *', // 每天凌晨2点
      enableArchive: true,
      archiveAfterDays: 3,
      archivePath: join(__dirname, '../../logs/archives'),
      maxFileSize: 10, // 10MB
      maxFiles: 10,
      ...config
    }
    this.initializeLogPaths()
    this.initializeDatabase()
  }

  /**
   * 初始化日志文件路径
   */
  private initializeLogPaths(): void {
    const projectRoot = join(__dirname, '../../../')
    
    this.logPaths = {
      // Winston日志目录
      winston: join(__dirname, '../../logs'),
      
      // PM2日志目录
      pm2: join(__dirname, '../../logs'),
      
      // 系统日志目录
      system: join(projectRoot, 'logs')
    }
  }

  /**
   * 初始化数据库表
   */
  private initializeDatabase(): void {
    try {
      // 日志管理配置表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS log_management_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          retention_days INTEGER NOT NULL DEFAULT 7,
          max_total_size INTEGER NOT NULL DEFAULT 100,
          auto_cleanup BOOLEAN NOT NULL DEFAULT 1,
          cleanup_schedule TEXT NOT NULL DEFAULT '0 2 * * *',
          enable_archive BOOLEAN NOT NULL DEFAULT 1,
          archive_after_days INTEGER NOT NULL DEFAULT 3,
          archive_path TEXT NOT NULL,
          max_file_size INTEGER NOT NULL DEFAULT 10,
          max_files INTEGER NOT NULL DEFAULT 10,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 日志清理历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS log_cleanup_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cleanup_date DATETIME NOT NULL,
          files_deleted INTEGER NOT NULL DEFAULT 0,
          bytes_freed INTEGER NOT NULL DEFAULT 0,
          cleanup_type TEXT NOT NULL CHECK (cleanup_type IN ('manual', 'auto', 'scheduled')),
          trigger_reason TEXT,
          errors TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 日志归档历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS log_archive_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          archive_date DATETIME NOT NULL,
          files_archived INTEGER NOT NULL DEFAULT 0,
          archive_size INTEGER NOT NULL DEFAULT 0,
          archive_path TEXT NOT NULL,
          archive_name TEXT NOT NULL,
          errors TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 加载配置
      this.loadConfig()

      logger.debug('Log management service initialized')
    } catch (error) {
      logger.error('Failed to initialize log management database', { error })
      throw error
    }
  }

  /**
   * 加载配置
   */
  private loadConfig(): void {
    try {
      const stmt = this.db.prepare('SELECT * FROM log_management_config WHERE id = 1')
      const row = stmt.get() as any

      if (row) {
        this.config = {
          retentionDays: row.retention_days,
          maxTotalSize: row.max_total_size,
          autoCleanup: Boolean(row.auto_cleanup),
          cleanupSchedule: row.cleanup_schedule,
          enableArchive: Boolean(row.enable_archive),
          archiveAfterDays: row.archive_after_days,
          archivePath: row.archive_path,
          maxFileSize: row.max_file_size,
          maxFiles: row.max_files
        }
      } else {
        // 插入默认配置
        this.saveConfig()
      }
    } catch (error) {
      logger.warn('Failed to load log management config, using defaults', { error })
    }
  }

  /**
   * 保存配置
   */
  private saveConfig(): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO log_management_config (
          id, retention_days, max_total_size, auto_cleanup, cleanup_schedule,
          enable_archive, archive_after_days, archive_path, max_file_size, max_files,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `)

      stmt.run(
        this.config.retentionDays,
        this.config.maxTotalSize,
        this.config.autoCleanup ? 1 : 0,
        this.config.cleanupSchedule,
        this.config.enableArchive ? 1 : 0,
        this.config.archiveAfterDays,
        this.config.archivePath,
        this.config.maxFileSize,
        this.config.maxFiles
      )

      logger.info('Log management config saved', this.config)
    } catch (error) {
      logger.error('Failed to save log management config', { error })
      throw error
    }
  }

  /**
   * 获取配置
   */
  getConfig(): LogManagementConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  async updateConfig(config: Partial<LogManagementConfig>): Promise<LogManagementConfig> {
    this.config = { ...this.config, ...config }
    this.saveConfig()
    return this.getConfig()
  }

  /**
   * 获取所有日志文件
   */
  async getLogFiles(): Promise<LogFileInfo[]> {
    const files: LogFileInfo[] = []

    try {
      // Winston日志
      if (existsSync(this.logPaths.winston)) {
        const winstonFiles = readdirSync(this.logPaths.winston)
          .filter(f => f.endsWith('.log') && !f.includes('pm2'))
          .map(f => this.getFileInfo(join(this.logPaths.winston, f), 'winston'))
        files.push(...winstonFiles)
      }

      // PM2日志
      if (existsSync(this.logPaths.pm2)) {
        const pm2Files = readdirSync(this.logPaths.pm2)
          .filter(f => f.includes('pm2') && f.endsWith('.log'))
          .map(f => this.getFileInfo(join(this.logPaths.pm2, f), 'pm2'))
        files.push(...pm2Files)
      }

      // 系统日志
      if (existsSync(this.logPaths.system)) {
        const systemFiles = readdirSync(this.logPaths.system)
          .filter(f => f.endsWith('.log'))
          .map(f => this.getFileInfo(join(this.logPaths.system, f), 'system'))
        files.push(...systemFiles)
      }

      return files.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    } catch (error) {
      logger.error('Failed to get log files', { error })
      throw error
    }
  }

  /**
   * 获取文件信息
   */
  private getFileInfo(filePath: string, type: 'winston' | 'pm2' | 'system'): LogFileInfo {
    const stats = statSync(filePath)
    const name = filePath.split(/[/\\]/).pop() || ''
    
    return {
      name,
      path: filePath,
      size: stats.size,
      sizeFormatted: this.formatBytes(stats.size),
      lastModified: stats.mtime,
      type,
      isArchived: false
    }
  }

  /**
   * 获取存储统计
   */
  async getStorageStats(): Promise<LogStorageStats> {
    try {
      const files = await this.getLogFiles()
      
      const stats: LogStorageStats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        totalSizeFormatted: '',
        oldestLog: null,
        newestLog: null,
        filesByType: { winston: 0, pm2: 0, system: 0 },
        sizeByType: { winston: 0, pm2: 0, system: 0 }
      }

      stats.totalSizeFormatted = this.formatBytes(stats.totalSize)

      if (files.length > 0) {
        stats.oldestLog = files[files.length - 1].lastModified
        stats.newestLog = files[0].lastModified
      }

      files.forEach(file => {
        stats.filesByType[file.type]++
        stats.sizeByType[file.type] += file.size
      })

      return stats
    } catch (error) {
      logger.error('Failed to get storage stats', { error })
      throw error
    }
  }

  /**
   * 清理日志
   */
  async cleanupLogs(options?: {
    olderThanDays?: number
    type?: 'winston' | 'pm2' | 'system'
    dryRun?: boolean
  }): Promise<CleanupResult> {
    const result: CleanupResult = {
      filesDeleted: 0,
      bytesFreed: 0,
      bytesFreedFormatted: '',
      errors: []
    }

    try {
      const files = await this.getLogFiles()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - (options?.olderThanDays || this.config.retentionDays))

      const filesToDelete = files.filter(file => {
        if (options?.type && file.type !== options.type) return false
        return file.lastModified < cutoffDate
      })

      for (const file of filesToDelete) {
        try {
          if (!options?.dryRun) {
            await fs.unlink(file.path)
          }
          result.filesDeleted++
          result.bytesFreed += file.size
        } catch (error) {
          const errMsg = `Failed to delete ${file.name}: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errMsg)
          logger.error(errMsg)
        }
      }

      result.bytesFreedFormatted = this.formatBytes(result.bytesFreed)

      // 记录清理历史
      if (!options?.dryRun && result.filesDeleted > 0) {
        this.recordCleanupHistory({
          filesDeleted: result.filesDeleted,
          bytesFreed: result.bytesFreed,
          cleanupType: 'manual',
          triggerReason: `Cleanup logs older than ${options?.olderThanDays || this.config.retentionDays} days`,
          errors: result.errors.join('; ')
        })
      }

      logger.info('Log cleanup completed', result)
      return result
    } catch (error) {
      logger.error('Failed to cleanup logs', { error })
      throw error
    }
  }

  /**
   * 归档日志
   */
  async archiveLogs(options?: {
    olderThanDays?: number
    type?: 'winston' | 'pm2' | 'system'
  }): Promise<ArchiveResult> {
    const result: ArchiveResult = {
      filesArchived: 0,
      archiveSize: 0,
      archivePath: '',
      errors: []
    }

    try {
      // 确保归档目录存在
      if (!existsSync(this.config.archivePath)) {
        await fs.mkdir(this.config.archivePath, { recursive: true })
      }

      const files = await this.getLogFiles()
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - (options?.olderThanDays || this.config.archiveAfterDays))

      const filesToArchive = files.filter(file => {
        if (options?.type && file.type !== options.type) return false
        return file.lastModified < cutoffDate
      })

      if (filesToArchive.length === 0) {
        return result
      }

      // 创建归档文件
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
      const archiveName = `logs-archive-${timestamp}.zip`
      const archivePath = join(this.config.archivePath, archiveName)
      
      result.archivePath = archivePath

      // 创建zip流
      const output = createWriteStream(archivePath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      await new Promise<void>((resolve, reject) => {
        output.on('close', () => {
          result.archiveSize = archive.pointer()
          resolve()
        })

        archive.on('error', reject)
        
        archive.pipe(output)

        // 添加文件到归档
        for (const file of filesToArchive) {
          try {
            archive.file(file.path, { name: file.name })
            result.filesArchived++
          } catch (error) {
            const errMsg = `Failed to archive ${file.name}: ${error instanceof Error ? error.message : String(error)}`
            result.errors.push(errMsg)
            logger.error(errMsg)
          }
        }

        archive.finalize()
      })

      // 删除已归档的文件
      for (const file of filesToArchive) {
        try {
          await fs.unlink(file.path)
        } catch (error) {
          const errMsg = `Failed to delete archived file ${file.name}: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errMsg)
          logger.error(errMsg)
        }
      }

      // 记录归档历史
      this.recordArchiveHistory({
        filesArchived: result.filesArchived,
        archiveSize: result.archiveSize,
        archivePath: result.archivePath,
        archiveName,
        errors: result.errors.join('; ')
      })

      logger.info('Log archive completed', result)
      return result
    } catch (error) {
      logger.error('Failed to archive logs', { error })
      throw error
    }
  }

  /**
   * 自动清理（根据配置）
   */
  async autoCleanup(): Promise<CleanupResult> {
    if (!this.config.autoCleanup) {
      throw new Error('Auto cleanup is disabled')
    }

    const result = await this.cleanupLogs({
      olderThanDays: this.config.retentionDays
    })

    // 更新记录类型
    if (result.filesDeleted > 0) {
      const stmt = this.db.prepare(`
        UPDATE log_cleanup_history 
        SET cleanup_type = 'auto', trigger_reason = ?
        WHERE id = (SELECT MAX(id) FROM log_cleanup_history)
      `)
      stmt.run(`Auto cleanup (retention: ${this.config.retentionDays} days)`)
    }

    return result
  }

  /**
   * 记录清理历史
   */
  private recordCleanupHistory(data: {
    filesDeleted: number
    bytesFreed: number
    cleanupType: string
    triggerReason: string
    errors: string
  }): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO log_cleanup_history (
          cleanup_date, files_deleted, bytes_freed, cleanup_type, trigger_reason, errors
        ) VALUES (datetime('now'), ?, ?, ?, ?, ?)
      `)
      
      stmt.run(
        data.filesDeleted,
        data.bytesFreed,
        data.cleanupType,
        data.triggerReason,
        data.errors || null
      )
    } catch (error) {
      logger.error('Failed to record cleanup history', { error })
    }
  }

  /**
   * 记录归档历史
   */
  private recordArchiveHistory(data: {
    filesArchived: number
    archiveSize: number
    archivePath: string
    archiveName: string
    errors: string
  }): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO log_archive_history (
          archive_date, files_archived, archive_size, archive_path, archive_name, errors
        ) VALUES (datetime('now'), ?, ?, ?, ?, ?)
      `)
      
      stmt.run(
        data.filesArchived,
        data.archiveSize,
        data.archivePath,
        data.archiveName,
        data.errors || null
      )
    } catch (error) {
      logger.error('Failed to record archive history', { error })
    }
  }

  /**
   * 获取清理历史
   */
  async getCleanupHistory(limit: number = 10): Promise<any[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM log_cleanup_history 
        ORDER BY created_at DESC 
        LIMIT ?
      `)
      return stmt.all(limit)
    } catch (error) {
      logger.error('Failed to get cleanup history', { error })
      return []
    }
  }

  /**
   * 获取归档历史
   */
  async getArchiveHistory(limit: number = 10): Promise<any[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM log_archive_history 
        ORDER BY created_at DESC 
        LIMIT ?
      `)
      return stmt.all(limit)
    } catch (error) {
      logger.error('Failed to get archive history', { error })
      return []
    }
  }

  /**
   * 格式化字节
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

