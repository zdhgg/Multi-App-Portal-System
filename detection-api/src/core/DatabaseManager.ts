/**
 * Database Manager - 统一数据库管理
 * 
 * 负责数据库连接、配置和优化
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { logger } from '../utils/logger.js'

export class DatabaseManager {
  private static instance: DatabaseManager | null = null
  private database: Database.Database | null = null

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager()
    }
    return DatabaseManager.instance
  }

  async getDatabase(dbPath?: string): Promise<Database.Database> {
    if (this.database) {
      return this.database
    }

    // 默认数据库路径
    const defaultDbPath = join(process.cwd(), 'data', 'portal.db')
    const finalDbPath = dbPath || defaultDbPath

    // 确保数据目录存在
    const dataDir = join(process.cwd(), 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
      logger.info('Created data directory:', dataDir)
    }

    try {
      // 创建数据库连接
      this.database = new Database(finalDbPath)

      // 优化数据库性能
      this.optimizeDatabase()

      logger.info('✅ Database connected:', finalDbPath)
      return this.database

    } catch (error) {
      logger.error('Failed to connect to database:', error)
      throw error
    }
  }

  private optimizeDatabase(): void {
    if (!this.database) return

    try {
      // 启用WAL模式提高并发性能
      this.database.pragma('journal_mode = WAL')
      
      // 设置同步模式为NORMAL提高性能
      this.database.pragma('synchronous = NORMAL')
      
      // 增加缓存大小
      this.database.pragma('cache_size = 10000')
      
      // 设置临时存储为内存
      this.database.pragma('temp_store = memory')
      
      // 设置mmap大小
      this.database.pragma('mmap_size = 268435456') // 256MB

      logger.info('✅ Database optimized')
    } catch (error) {
      logger.warn('Failed to optimize database:', error)
    }
  }

  closeDatabase(): void {
    if (this.database) {
      try {
        this.database.close()
        this.database = null
        logger.info('✅ Database connection closed')
      } catch (error) {
        logger.error('Failed to close database:', error)
      }
    }
  }

  isConnected(): boolean {
    return this.database !== null
  }
}

