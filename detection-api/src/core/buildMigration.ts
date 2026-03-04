/**
 * Build Configuration Migration
 * 
 * 执行构建配置相关的数据库迁移
 */

import { Database } from 'better-sqlite3'
import { readFileSync, readFile } from 'fs'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class BuildMigration {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  /**
   * 检查是否需要执行构建配置迁移
   */
  needsBuildMigration(): boolean {
    try {
      // 检查 applications 表是否有 build_tool 字段
      const tableInfo = this.db.prepare("PRAGMA table_info(applications)").all() as any[]
      const hasBuildTool = tableInfo.some(column => column.name === 'build_tool')
      
      if (hasBuildTool) {
        logger.info('构建配置字段已存在，跳过迁移')
        return false
      }

      // 检查是否有构建分析表
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
      const hasBuildAnalyses = tables.some(table => table.name === 'build_analyses')
      
      if (hasBuildAnalyses) {
        logger.info('构建分析表已存在，跳过迁移')
        return false
      }

      return true
    } catch (error) {
      logger.error('检查构建迁移状态失败', { error })
      return false
    }
  }

  /**
   * 执行构建配置迁移
   */
  async executeBuildMigration(): Promise<{ success: boolean; error?: string }> {
    if (!this.needsBuildMigration()) {
      return { success: true }
    }

    logger.info('开始执行构建配置迁移...')

    try {
      // 开始事务
      const transaction = this.db.transaction(() => {
        // 读取迁移SQL文件
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        const migrationPath = join(__dirname, 'migrations', '001_add_build_configuration.sql')
        
        let migrationSql: string
        try {
          migrationSql = readFileSync(migrationPath, 'utf-8')
        } catch (error) {
          throw new Error(`无法读取迁移文件: ${migrationPath}`)
        }

        // 分割SQL语句并逐个执行
        const statements = this.splitSqlStatements(migrationSql)
        
        for (const statement of statements) {
          const trimmed = statement.trim()
          if (trimmed && !trimmed.startsWith('--')) {
            try {
              this.db.exec(trimmed)
            } catch (error) {
              // 对于 ALTER TABLE ADD COLUMN，如果列已存在会报错，我们可以忽略
              if (error.message.includes('duplicate column name')) {
                logger.warn('列已存在，跳过添加', { statement: trimmed.substring(0, 50) + '...' })
                continue
              }
              throw error
            }
          }
        }
      })

      // 执行事务
      transaction()

      logger.info('构建配置迁移执行成功')
      return { success: true }

    } catch (error) {
      logger.error('构建配置迁移执行失败', { error })
      return { 
        success: false, 
        error: error.message || '迁移执行失败' 
      }
    }
  }

  /**
   * 分割SQL语句
   */
  private splitSqlStatements(sql: string): string[] {
    // 简单的SQL语句分割，按分号分割但忽略注释
    const lines = sql.split('\n')
    const statements: string[] = []
    let currentStatement = ''

    for (const line of lines) {
      const trimmed = line.trim()
      
      // 跳过注释行
      if (trimmed.startsWith('--') || trimmed === '') {
        continue
      }

      currentStatement += line + '\n'

      // 如果行以分号结尾，表示语句结束
      if (trimmed.endsWith(';')) {
        statements.push(currentStatement.trim())
        currentStatement = ''
      }
    }

    // 添加最后一个语句（如果有）
    if (currentStatement.trim()) {
      statements.push(currentStatement.trim())
    }

    return statements
  }

  /**
   * 验证迁移结果
   */
  validateMigration(): boolean {
    try {
      // 检查新增的字段
      const tableInfo = this.db.prepare("PRAGMA table_info(applications)").all() as any[]
      const requiredColumns = ['build_tool', 'build_script', 'build_output_dir', 'build_config_file', 'build_features', 'build_last_analysis', 'build_confidence']
      
      for (const column of requiredColumns) {
        if (!tableInfo.some(col => col.name === column)) {
          logger.error('迁移验证失败：缺少字段', { column })
          return false
        }
      }

      // 检查新增的表
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
      const requiredTables = ['build_analyses', 'build_optimizations', 'build_execution_history']
      
      for (const table of requiredTables) {
        if (!tables.some(t => t.name === table)) {
          logger.error('迁移验证失败：缺少表', { table })
          return false
        }
      }

      logger.info('构建配置迁移验证成功')
      return true

    } catch (error) {
      logger.error('迁移验证失败', { error })
      return false
    }
  }

  /**
   * 回滚构建配置迁移（仅用于开发环境）
   */
  async rollbackBuildMigration(): Promise<{ success: boolean; error?: string }> {
    logger.warn('开始回滚构建配置迁移...')

    try {
      const transaction = this.db.transaction(() => {
        // 删除新增的表
        this.db.exec('DROP TABLE IF EXISTS build_execution_history')
        this.db.exec('DROP TABLE IF EXISTS build_optimizations')
        this.db.exec('DROP TABLE IF EXISTS build_analyses')

        // 注意：SQLite 不支持 DROP COLUMN，所以我们无法删除已添加的列
        // 在生产环境中，通常不建议回滚已添加的列
        logger.warn('注意：SQLite 不支持删除列，构建相关字段将保留在 applications 表中')
      })

      transaction()

      logger.info('构建配置迁移回滚成功')
      return { success: true }

    } catch (error) {
      logger.error('构建配置迁移回滚失败', { error })
      return { 
        success: false, 
        error: error.message || '回滚失败' 
      }
    }
  }

  /**
   * 运行构建执行相关的数据库迁移
   */
  static async runBuildExecutionMigration(db: Database): Promise<void> {
    try {
      logger.info('开始运行构建执行数据库迁移...')

      // 读取迁移SQL文件
      const migrationPath = join(__dirname, 'migrations', '002_add_build_execution.sql')
      const migrationSQL = await fs.readFile(migrationPath, 'utf-8')

      // 直接执行整个SQL文件
      try {
        db.exec(migrationSQL)
      } catch (error: any) {
        // 如果是表已存在的错误，可以忽略
        if (error.message && error.message.includes('already exists')) {
          logger.info('构建执行表已存在，跳过创建')
        } else {
          throw error
        }
      }

      logger.info('构建执行数据库迁移完成')
    } catch (error) {
      logger.error('构建执行数据库迁移失败:', error)
      throw error
    }
  }
}

/**
 * 执行构建配置迁移的便捷函数
 */
export async function runBuildMigration(db: Database): Promise<{ success: boolean; error?: string }> {
  const migration = new BuildMigration(db)
  
  if (!migration.needsBuildMigration()) {
    return { success: true }
  }

  const result = await migration.executeBuildMigration()
  
  if (result.success) {
    const isValid = migration.validateMigration()
    if (!isValid) {
      return { 
        success: false, 
        error: '迁移执行成功但验证失败' 
      }
    }
  }

  return result
}
