/**
 * Build History Service - 构建历史管理服务
 * 
 * 负责管理构建执行历史、日志、产物等数据的持久化和查询
 */

import { Database } from 'better-sqlite3'
import { logger } from '../utils/logger'
import { BuildProgress, BuildLog } from './buildExecutionService'

export interface BuildExecutionRecord {
  id: string
  appId: string
  buildTool: string
  buildScript: string
  outputDir: string
  environment: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress: number
  currentStep?: string
  startTime: number
  endTime?: number
  duration?: number
  outputSize?: number
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

export interface BuildArtifact {
  id: number
  executionId: string
  filePath: string
  fileSize: number
  fileType?: string
  checksum?: string
  createdAt: number
}

export interface BuildExecutionWithDetails extends BuildExecutionRecord {
  logs: BuildLog[]
  artifacts: BuildArtifact[]
}

export interface BuildHistoryQuery {
  appId?: string
  status?: string
  startDate?: number
  endDate?: number
  limit?: number
  offset?: number
  orderBy?: 'start_time' | 'duration' | 'created_at'
  orderDirection?: 'ASC' | 'DESC'
}

export interface BuildStatistics {
  totalBuilds: number
  successfulBuilds: number
  failedBuilds: number
  averageDuration: number
  totalOutputSize: number
  buildsByStatus: Record<string, number>
  buildsByTool: Record<string, number>
  buildTrends: Array<{
    date: string
    count: number
    successRate: number
  }>
}

export class BuildHistoryService {
  constructor(private db: Database) {}

  /**
   * 保存构建执行记录
   */
  async saveBuildExecution(progress: BuildProgress): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO build_executions (
        id, app_id, build_tool, build_script, output_dir, environment,
        status, progress, current_step, start_time, end_time, duration,
        output_size, error_message, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    try {
      stmt.run(
        progress.executionId,
        progress.appId,
        'unknown', // 需要从其他地方获取
        'unknown', // 需要从其他地方获取
        'unknown', // 需要从其他地方获取
        'production',
        progress.status,
        progress.progress,
        progress.currentStep,
        progress.startTime,
        progress.endTime,
        progress.duration,
        progress.outputSize,
        progress.error,
        Date.now()
      )
    } catch (error) {
      logger.error('保存构建执行记录失败:', error)
      throw error
    }
  }

  /**
   * 保存构建执行记录（完整版本）
   */
  async saveBuildExecutionFull(record: Partial<BuildExecutionRecord>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO build_executions (
        id, app_id, build_tool, build_script, output_dir, environment,
        status, progress, current_step, start_time, end_time, duration,
        output_size, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const now = Date.now()
    try {
      stmt.run(
        record.id,
        record.appId,
        record.buildTool,
        record.buildScript,
        record.outputDir,
        record.environment || 'production',
        record.status,
        record.progress || 0,
        record.currentStep,
        record.startTime || now,
        record.endTime,
        record.duration,
        record.outputSize,
        record.errorMessage,
        record.createdAt || now,
        now
      )
    } catch (error) {
      logger.error('保存构建执行记录失败:', error)
      throw error
    }
  }

  /**
   * 保存构建日志
   */
  async saveBuildLog(executionId: string, log: BuildLog): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO build_execution_logs (
        execution_id, timestamp, level, message, source
      ) VALUES (?, ?, ?, ?, ?)
    `)

    try {
      stmt.run(
        executionId,
        log.timestamp,
        log.level,
        log.message,
        log.source
      )
    } catch (error) {
      logger.error('保存构建日志失败:', error)
      throw error
    }
  }

  /**
   * 批量保存构建日志
   */
  async saveBuildLogs(executionId: string, logs: BuildLog[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO build_execution_logs (
        execution_id, timestamp, level, message, source
      ) VALUES (?, ?, ?, ?, ?)
    `)

    const transaction = this.db.transaction((logs: BuildLog[]) => {
      for (const log of logs) {
        stmt.run(executionId, log.timestamp, log.level, log.message, log.source)
      }
    })

    try {
      transaction(logs)
    } catch (error) {
      logger.error('批量保存构建日志失败:', error)
      throw error
    }
  }

  /**
   * 保存构建产物
   */
  async saveBuildArtifacts(executionId: string, artifacts: string[], outputDir: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO build_artifacts (
        execution_id, file_path, file_size, file_type
      ) VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction((artifacts: string[]) => {
      for (const artifact of artifacts) {
        const fileType = this.getFileType(artifact)
        stmt.run(executionId, artifact, 0, fileType) // 文件大小暂时设为0
      }
    })

    try {
      transaction(artifacts)
    } catch (error) {
      logger.error('保存构建产物失败:', error)
      throw error
    }
  }

  /**
   * 获取构建执行记录
   */
  async getBuildExecution(executionId: string): Promise<BuildExecutionRecord | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM build_executions WHERE id = ?
    `)

    try {
      const row = stmt.get(executionId) as any
      return row ? this.mapRowToBuildExecution(row) : null
    } catch (error) {
      logger.error('获取构建执行记录失败:', error)
      throw error
    }
  }

  /**
   * 获取构建执行详情（包含日志和产物）
   */
  async getBuildExecutionWithDetails(executionId: string): Promise<BuildExecutionWithDetails | null> {
    const execution = await this.getBuildExecution(executionId)
    if (!execution) return null

    const logs = await this.getBuildLogs(executionId)
    const artifacts = await this.getBuildArtifacts(executionId)

    return {
      ...execution,
      logs,
      artifacts
    }
  }

  /**
   * 获取构建日志
   */
  async getBuildLogs(executionId: string, limit = 1000): Promise<BuildLog[]> {
    const stmt = this.db.prepare(`
      SELECT timestamp, level, message, source
      FROM build_execution_logs
      WHERE execution_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `)

    try {
      const rows = stmt.all(executionId, limit) as any[]
      return rows.map(row => ({
        timestamp: row.timestamp,
        level: row.level,
        message: row.message,
        source: row.source
      }))
    } catch (error) {
      logger.error('获取构建日志失败:', error)
      throw error
    }
  }

  /**
   * 获取构建产物
   */
  async getBuildArtifacts(executionId: string): Promise<BuildArtifact[]> {
    const stmt = this.db.prepare(`
      SELECT id, execution_id, file_path, file_size, file_type, checksum, created_at
      FROM build_artifacts
      WHERE execution_id = ?
      ORDER BY file_path ASC
    `)

    try {
      const rows = stmt.all(executionId) as any[]
      return rows.map(row => ({
        id: row.id,
        executionId: row.execution_id,
        filePath: row.file_path,
        fileSize: row.file_size,
        fileType: row.file_type,
        checksum: row.checksum,
        createdAt: row.created_at
      }))
    } catch (error) {
      logger.error('获取构建产物失败:', error)
      throw error
    }
  }

  /**
   * 查询构建历史
   */
  async queryBuildHistory(query: BuildHistoryQuery): Promise<BuildExecutionRecord[]> {
    let sql = 'SELECT * FROM build_executions WHERE 1=1'
    const params: any[] = []

    if (query.appId) {
      sql += ' AND app_id = ?'
      params.push(query.appId)
    }

    if (query.status) {
      sql += ' AND status = ?'
      params.push(query.status)
    }

    if (query.startDate) {
      sql += ' AND start_time >= ?'
      params.push(query.startDate)
    }

    if (query.endDate) {
      sql += ' AND start_time <= ?'
      params.push(query.endDate)
    }

    // 排序
    const orderBy = query.orderBy || 'start_time'
    const orderDirection = query.orderDirection || 'DESC'
    sql += ` ORDER BY ${orderBy} ${orderDirection}`

    // 分页
    if (query.limit) {
      sql += ' LIMIT ?'
      params.push(query.limit)
      
      if (query.offset) {
        sql += ' OFFSET ?'
        params.push(query.offset)
      }
    }

    try {
      const stmt = this.db.prepare(sql)
      const rows = stmt.all(...params) as any[]
      return rows.map(row => this.mapRowToBuildExecution(row))
    } catch (error) {
      logger.error('查询构建历史失败:', error)
      throw error
    }
  }

  /**
   * 获取应用的构建历史
   */
  async getAppBuildHistory(appId: string, limit = 50): Promise<BuildExecutionRecord[]> {
    return this.queryBuildHistory({
      appId,
      limit,
      orderBy: 'start_time',
      orderDirection: 'DESC'
    })
  }

  /**
   * 获取构建统计信息
   */
  async getBuildStatistics(appId?: string, days = 30): Promise<BuildStatistics> {
    const startDate = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    let whereClause = 'WHERE start_time >= ?'
    const params: (string | number)[] = [startDate]
    
    if (appId) {
      whereClause += ' AND app_id = ?'
      params.push(appId)
    }

    try {
      // 基础统计
      const basicStatsStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_builds,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_builds,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_builds,
          AVG(CASE WHEN duration IS NOT NULL THEN duration END) as average_duration,
          SUM(CASE WHEN output_size IS NOT NULL THEN output_size ELSE 0 END) as total_output_size
        FROM build_executions ${whereClause}
      `)
      
      const basicStats = basicStatsStmt.get(...params) as any

      // 按状态统计
      const statusStatsStmt = this.db.prepare(`
        SELECT status, COUNT(*) as count
        FROM build_executions ${whereClause}
        GROUP BY status
      `)
      
      const statusStats = statusStatsStmt.all(...params) as any[]
      const buildsByStatus: Record<string, number> = {}
      statusStats.forEach(row => {
        buildsByStatus[row.status] = row.count
      })

      // 按构建工具统计
      const toolStatsStmt = this.db.prepare(`
        SELECT build_tool, COUNT(*) as count
        FROM build_executions ${whereClause}
        GROUP BY build_tool
      `)
      
      const toolStats = toolStatsStmt.all(...params) as any[]
      const buildsByTool: Record<string, number> = {}
      toolStats.forEach(row => {
        buildsByTool[row.build_tool] = row.count
      })

      // 构建趋势（按天）
      const trendStmt = this.db.prepare(`
        SELECT 
          DATE(start_time / 1000, 'unixepoch') as date,
          COUNT(*) as count,
          ROUND(COUNT(CASE WHEN status = 'success' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
        FROM build_executions ${whereClause}
        GROUP BY DATE(start_time / 1000, 'unixepoch')
        ORDER BY date DESC
        LIMIT 30
      `)
      
      const trendData = trendStmt.all(...params) as any[]
      const buildTrends = trendData.map(row => ({
        date: row.date,
        count: row.count,
        successRate: row.success_rate || 0
      }))

      return {
        totalBuilds: basicStats.total_builds || 0,
        successfulBuilds: basicStats.successful_builds || 0,
        failedBuilds: basicStats.failed_builds || 0,
        averageDuration: basicStats.average_duration || 0,
        totalOutputSize: basicStats.total_output_size || 0,
        buildsByStatus,
        buildsByTool,
        buildTrends
      }
    } catch (error) {
      logger.error('获取构建统计信息失败:', error)
      throw error
    }
  }

  /**
   * 删除构建历史
   */
  async deleteBuildHistory(executionId: string): Promise<boolean> {
    const transaction = this.db.transaction(() => {
      // 删除日志
      this.db.prepare('DELETE FROM build_execution_logs WHERE execution_id = ?').run(executionId)
      // 删除产物
      this.db.prepare('DELETE FROM build_artifacts WHERE execution_id = ?').run(executionId)
      // 删除执行记录
      const result = this.db.prepare('DELETE FROM build_executions WHERE id = ?').run(executionId)
      return result.changes > 0
    })

    try {
      return transaction()
    } catch (error) {
      logger.error('删除构建历史失败:', error)
      throw error
    }
  }

  /**
   * 清理旧的构建历史
   */
  async cleanupOldHistory(olderThanDays = 90): Promise<number> {
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)
    
    const transaction = this.db.transaction(() => {
      // 获取要删除的执行ID
      const executionIds = this.db.prepare(`
        SELECT id FROM build_executions WHERE start_time < ?
      `).all(cutoffTime) as any[]

      let deletedCount = 0
      for (const { id } of executionIds) {
        // 删除日志
        this.db.prepare('DELETE FROM build_execution_logs WHERE execution_id = ?').run(id)
        // 删除产物
        this.db.prepare('DELETE FROM build_artifacts WHERE execution_id = ?').run(id)
        deletedCount++
      }

      // 删除执行记录
      this.db.prepare('DELETE FROM build_executions WHERE start_time < ?').run(cutoffTime)
      
      return deletedCount
    })

    try {
      const deletedCount = transaction()
      logger.info(`清理了 ${deletedCount} 条构建历史记录`)
      return deletedCount
    } catch (error) {
      logger.error('清理构建历史失败:', error)
      throw error
    }
  }

  /**
   * 映射数据库行到构建执行记录
   */
  private mapRowToBuildExecution(row: any): BuildExecutionRecord {
    return {
      id: row.id,
      appId: row.app_id,
      buildTool: row.build_tool,
      buildScript: row.build_script,
      outputDir: row.output_dir,
      environment: row.environment,
      status: row.status,
      progress: row.progress,
      currentStep: row.current_step,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      outputSize: row.output_size,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /**
   * 获取文件类型
   */
  private getFileType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'js': return 'javascript'
      case 'css': return 'stylesheet'
      case 'html': return 'html'
      case 'json': return 'json'
      case 'map': return 'sourcemap'
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg': return 'image'
      case 'woff':
      case 'woff2':
      case 'ttf':
      case 'eot': return 'font'
      default: return 'other'
    }
  }
}
