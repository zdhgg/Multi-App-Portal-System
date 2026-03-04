/**
 * Database Repository - Clean Implementation
 * 
 * This implements the repository interfaces using the v2 database schema.
 * Each method is focused and does exactly one thing.
 */

import { Database } from 'better-sqlite3'
import { normalize, resolve } from 'path'
import type {
  Application,
  ApplicationRepository,
  DetectionSession,
  DetectionResult,
  DetectionRepository,
  ApplicationState,
  NetworkConfiguration,
  ApplicationMetadata,
  BatchScan
} from '../core/types'
import { logger } from '../utils/logger'

// =============================================================================
// APPLICATION REPOSITORY IMPLEMENTATION
// =============================================================================

export class SQLiteApplicationRepository implements ApplicationRepository {
  constructor(private db: Database) {
    this.ensurePinnedColumn()
    this.ensureAccessPathColumn()
    this.ensureNormalizedDirectoryIndex()
  }

  async save(app: Application): Promise<void> {
    const normalizedDirectory = this.normalizeDirectory(app.directory)
    const transaction = this.db.transaction(() => {
      // Insert/update application
      this.db.prepare(`
        INSERT OR REPLACE INTO applications (
          id, name, directory, tech_stack, network_config, state, build_script, pm2_process_name, deployment_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        app.id,
        app.name,
        normalizedDirectory,
        app.techStack.name,
        JSON.stringify(app.network),
        app.state,
        app.buildScript || app.build_script || null,
        app.pm2ProcessName || null,
        app.deploymentMode || 'unknown',
        app.metadata.createdAt,
        app.metadata.updatedAt
      )
      
      // Insert/update metadata
      if (
        app.metadata.description ||
        app.metadata.icon ||
        app.metadata.color ||
        typeof app.metadata.pinned === 'boolean' ||
        typeof app.metadata.accessPath === 'string'
      ) {
        this.db.prepare(`
          INSERT OR REPLACE INTO application_metadata (app_id, description, icon, color, pinned, access_path)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          app.id,
          app.metadata.description || null,
          app.metadata.icon || null,
          app.metadata.color || null,
          app.metadata.pinned ? 1 : 0,
          app.metadata.accessPath || null
        )
      }
    })
    
    transaction()
    logger.debug('Application saved', { id: app.id })
  }

  async findById(id: string): Promise<Application | null> {
    const appRow = this.db.prepare(`
      SELECT * FROM applications WHERE id = ?
    `).get(id) as any
    
    if (!appRow) {
      return null
    }
    
    const metadataRow = this.db.prepare(`
      SELECT * FROM application_metadata WHERE app_id = ?
    `).get(id) as any
    
    return this.mapRowToApplication(appRow, metadataRow)
  }

  async findAll(): Promise<readonly Application[]> {
    const rows = this.db.prepare(`
      SELECT a.*, m.description, m.icon, m.color, m.pinned, m.access_path
      FROM applications a
      LEFT JOIN application_metadata m ON a.id = m.app_id
      ORDER BY a.created_at DESC
    `).all() as any[]
    
    return rows.map(row => this.mapRowToApplication(row, row))
  }

  async findByDirectory(directory: string): Promise<Application | null> {
    const normalizedDirectory = this.normalizeDirectory(directory)
    const appRow = this.db.prepare(`
      SELECT *
      FROM applications
      WHERE lower(replace(rtrim(directory, '/\\'), '\\', '/')) = lower(replace(rtrim(?, '/\\'), '\\', '/'))
      LIMIT 1
    `).get(normalizedDirectory) as any
    
    if (!appRow) {
      return null
    }
    
    const metadataRow = this.db.prepare(`
      SELECT * FROM application_metadata WHERE app_id = ?
    `).get(appRow.id) as any
    
    return this.mapRowToApplication(appRow, metadataRow)
  }

  async delete(id: string): Promise<void> {
    const result = this.db.prepare(`
      DELETE FROM applications WHERE id = ?
    `).run(id)
    
    if (result.changes === 0) {
      throw new Error(`Application not found: ${id}`)
    }
    
    logger.debug('Application deleted', { id })
  }

  async updateState(id: string, state: ApplicationState): Promise<void> {
    const result = this.db.prepare(`
      UPDATE applications SET state = ?, updated_at = ? WHERE id = ?
    `).run(state, Math.floor(Date.now() / 1000), id)

    if (result.changes === 0) {
      throw new Error(`Application not found: ${id}`)
    }

    logger.debug('Application state updated', { id, state })
  }

  async updatePM2ProcessName(id: string, pm2ProcessName: string | null): Promise<void> {
    const result = this.db.prepare(`
      UPDATE applications SET pm2_process_name = ?, updated_at = ? WHERE id = ?
    `).run(pm2ProcessName || null, Math.floor(Date.now() / 1000), id)

    if (result.changes === 0) {
      throw new Error(`Application not found: ${id}`)
    }

    logger.debug('Application PM2 process name updated', { id, pm2ProcessName })
  }

  async updateDeploymentMode(id: string, deploymentMode: 'development' | 'production' | 'unknown'): Promise<void> {
    const result = this.db.prepare(`
      UPDATE applications SET deployment_mode = ?, updated_at = ? WHERE id = ?
    `).run(deploymentMode, Math.floor(Date.now() / 1000), id)

    if (result.changes === 0) {
      throw new Error(`Application not found: ${id}`)
    }

    logger.debug('Application deployment mode updated', { id, deploymentMode })
  }

  async findByState(state: ApplicationState): Promise<readonly Application[]> {
    const rows = this.db.prepare(`
      SELECT a.*, m.description, m.icon, m.color, m.pinned, m.access_path
      FROM applications a
      LEFT JOIN application_metadata m ON a.id = m.app_id
      WHERE a.state = ?
      ORDER BY a.created_at DESC
    `).all(state) as any[]

    return rows.map(row => this.mapRowToApplication(row, row))
  }

  /**
   * Map database row to Application object
   */
  private mapRowToApplication(appRow: any, metadataRow?: any): Application {
    const network: NetworkConfiguration = JSON.parse(appRow.network_config)
    
    const metadata: ApplicationMetadata = {
      description: metadataRow?.description,
      icon: metadataRow?.icon || '🚀',
      color: metadataRow?.color || '#007bff',
      pinned: metadataRow?.pinned === 1,
      accessPath: typeof metadataRow?.access_path === 'string' && metadataRow.access_path.trim() !== ''
        ? metadataRow.access_path
        : undefined,
      createdAt: appRow.created_at,
      updatedAt: appRow.updated_at
    }
    
    return {
      id: appRow.id,
      name: appRow.name,
      directory: appRow.directory,
      techStack: {
        name: appRow.tech_stack,
        category: this.inferCategory(appRow.tech_stack),
        startCommand: this.getDefaultStartCommand(appRow.tech_stack)
      },
      network,
      state: appRow.state,
      metadata,
      deploymentMode: appRow.deployment_mode || 'unknown',
      pm2ProcessName: appRow.pm2_process_name || null,
      buildScript: appRow.build_script || undefined,
      build_script: appRow.build_script  // 🔧 添加build_script字段
    } as any
  }

  private inferCategory(techStack: string): 'frontend' | 'backend' | 'fullstack' {
    if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
      return 'frontend'
    }
    if (techStack.includes('express') || techStack.includes('fastify') || techStack.includes('koa')) {
      return 'backend'
    }
    return 'fullstack'
  }

  private getDefaultStartCommand(techStack: string): string {
    if (techStack.includes('vite')) return 'npm run dev'
    if (techStack.includes('next')) return 'npm run dev'
    if (techStack.includes('angular')) return 'ng serve'
    return 'npm start'
  }

  private ensurePinnedColumn(): void {
    try {
      const metadataTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_metadata'
      `).get() as { name: string } | undefined

      if (!metadataTableExists) {
        return
      }

      const columns = this.db.prepare("PRAGMA table_info(application_metadata)").all() as any[]
      const hasPinned = columns.some((col: any) => col.name === 'pinned')
      if (hasPinned) {
        return
      }

      this.db.exec(`
        ALTER TABLE application_metadata
        ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))
      `)
      logger.info('Added pinned column to application_metadata table')
    } catch (error) {
      logger.warn('Failed to ensure pinned column on application_metadata', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private ensureAccessPathColumn(): void {
    try {
      const metadataTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_metadata'
      `).get() as { name: string } | undefined

      if (!metadataTableExists) {
        return
      }

      const columns = this.db.prepare("PRAGMA table_info(application_metadata)").all() as any[]
      const hasAccessPath = columns.some((col: any) => col.name === 'access_path')
      if (hasAccessPath) {
        return
      }

      this.db.exec(`
        ALTER TABLE application_metadata
        ADD COLUMN access_path TEXT
      `)
      logger.info('Added access_path column to application_metadata table')
    } catch (error) {
      logger.warn('Failed to ensure access_path column on application_metadata', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private ensureNormalizedDirectoryIndex(): void {
    try {
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_directory_normalized
        ON applications (lower(replace(rtrim(directory, '/\\'), '\\', '/')))
      `)
    } catch (error) {
      logger.warn('Failed to ensure normalized directory unique index', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private normalizeDirectory(directory: string): string {
    if (typeof directory !== 'string') return ''
    const trimmed = directory.trim()
    if (trimmed.length === 0) return ''

    try {
      const resolvedPath = normalize(resolve(trimmed))
      const strippedPath = resolvedPath.replace(/[\\/]+$/, '')
      const safePath = strippedPath.length === 0 || /^[A-Za-z]:$/.test(strippedPath)
        ? resolvedPath
        : strippedPath
      const normalizedPath = safePath.replace(/\\/g, '/')
      return process.platform === 'win32'
        ? normalizedPath.toLowerCase()
        : normalizedPath
    } catch {
      const fallback = trimmed.replace(/\\/g, '/').replace(/\/+$/, '')
      return process.platform === 'win32'
        ? fallback.toLowerCase()
        : fallback
    }
  }
}

// =============================================================================
// DETECTION REPOSITORY IMPLEMENTATION
// =============================================================================

export class SQLiteDetectionRepository implements DetectionRepository {
  constructor(private db: Database) {
    // 创建一个触发器来监控DELETE操作
    try {
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS log_detection_results_delete
        AFTER DELETE ON detection_results
        FOR EACH ROW
        BEGIN
          INSERT INTO deletion_log (table_name, record_id, deleted_at, session_id, directory)
          VALUES ('detection_results', OLD.id, datetime('now'), OLD.session_id, OLD.directory);
        END;
      `)

      // 创建删除日志表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS deletion_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          deleted_at TEXT NOT NULL,
          session_id TEXT,
          directory TEXT
        );
      `)

      logger.info('DELETE monitoring trigger created successfully')
    } catch (error) {
      logger.warn('Failed to create DELETE monitoring trigger', { error: error instanceof Error ? error.message : String(error) })
    }

    // 重写数据库的prepare方法来监控所有SQL操作
    const originalPrepare = this.db.prepare.bind(this.db)
    this.db.prepare = (sql: string) => {
      const trimmedSql = sql.trim().toLowerCase()
      if (trimmedSql.startsWith('delete') && trimmedSql.includes('detection_results')) {
        logger.warn('DIRECT DELETE DETECTED!', {
          sql,
          stack: new Error().stack?.split('\n').slice(1, 8).join('\n')
        })
      }
      return originalPrepare(sql)
    }
  }

  async saveSession(session: DetectionSession): Promise<void> {
    // 确保 config 字段存在
    this.ensureConfigColumn()
    
    this.db.prepare(`
      INSERT OR REPLACE INTO detection_sessions (
        id, workspace_path, state, started_at, completed_at, summary, config
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.workspacePath,
      session.state,
      session.startedAt,
      session.completedAt || null,
      session.summary ? JSON.stringify(session.summary) : null,
      session.config ? JSON.stringify(session.config) : null
    )
    
    logger.debug('Detection session saved', { id: session.id, config: session.config })
  }

  /**
   * 确保 detection_sessions 表有 config 字段
   */
  private ensureConfigColumn(): void {
    try {
      // 检查并添加 config 列（如果不存在）
      const columns = this.db.prepare("PRAGMA table_info(detection_sessions)").all() as any[]
      const hasConfigColumn = columns.some(col => col.name === 'config')
      
      if (!hasConfigColumn) {
        this.db.exec('ALTER TABLE detection_sessions ADD COLUMN config TEXT')
        logger.info('Added config column to detection_sessions table')
      }
    } catch (error) {
      // 忽略错误，可能列已存在
      logger.debug('Config column check', { error })
    }
  }

  async findSessionById(id: string): Promise<DetectionSession | null> {
    const row = this.db.prepare(`
      SELECT * FROM detection_sessions WHERE id = ?
    `).get(id) as any
    
    if (!row) {
      return null
    }
    
    return {
      id: row.id,
      workspacePath: row.workspace_path,
      state: row.state,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary ? JSON.parse(row.summary) : undefined,
      config: row.config ? JSON.parse(row.config) : undefined
    }
  }

  async findActiveSessions(): Promise<DetectionSession[]> {
    const rows = this.db.prepare(`
      SELECT * FROM detection_sessions WHERE state = 'running' ORDER BY started_at DESC
    `).all() as any[]

    return rows.map(row => ({
      id: row.id,
      workspacePath: row.workspace_path,
      state: row.state,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary ? JSON.parse(row.summary) : undefined
    }))
  }

  async findSessionsByWorkspace(workspacePath: string): Promise<DetectionSession[]> {
    const rows = this.db.prepare(`
      SELECT * FROM detection_sessions WHERE workspace_path = ? ORDER BY started_at DESC
    `).all(workspacePath) as any[]

    return rows.map(row => ({
      id: row.id,
      workspacePath: row.workspace_path,
      state: row.state,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary ? JSON.parse(row.summary) : undefined
    }))
  }

  async deleteResultsBySession(sessionId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM detection_results WHERE session_id = ?')
    const result = stmt.run(sessionId)
    logger.info('Deleted detection results for session', { sessionId, deletedCount: result.changes })
  }

  async cleanupOrphanedResults(): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM detection_results WHERE session_id IS NULL')
    const result = stmt.run()
    logger.info('Cleaned up orphaned detection results', { deletedCount: result.changes })
  }

  // =============================================================================
  // BATCH SCAN METHODS
  // =============================================================================

  async saveBatch(batch: BatchScan): Promise<void> {
    // Create batch_scans table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS batch_scans (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        session_ids TEXT NOT NULL,
        total_paths INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL,
        summary TEXT
      )
    `)

    this.db.prepare(`
      INSERT OR REPLACE INTO batch_scans (
        id, mode, session_ids, total_paths, created_at, completed_at, status, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      batch.id,
      batch.mode,
      JSON.stringify(batch.sessionIds),
      batch.totalPaths,
      batch.createdAt,
      batch.completedAt || null,
      batch.status,
      batch.summary ? JSON.stringify(batch.summary) : null
    )

    logger.debug('Batch scan saved', { id: batch.id, mode: batch.mode })
  }

  async findBatchById(id: string): Promise<BatchScan | null> {
    const row = this.db.prepare(`
      SELECT * FROM batch_scans WHERE id = ?
    `).get(id) as any

    if (!row) {
      return null
    }

    return {
      id: row.id,
      mode: row.mode,
      sessionIds: JSON.parse(row.session_ids),
      totalPaths: row.total_paths,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      status: row.status,
      summary: row.summary ? JSON.parse(row.summary) : undefined
    }
  }

  async updateBatchStatus(
    id: string,
    status: BatchScan['status'],
    summary?: BatchScan['summary']
  ): Promise<void> {
    const completedAt = status === 'completed' || status === 'failed' 
      ? Math.floor(Date.now() / 1000) 
      : null

    const result = this.db.prepare(`
      UPDATE batch_scans 
      SET status = ?, completed_at = ?, summary = ?
      WHERE id = ?
    `).run(
      status,
      completedAt,
      summary ? JSON.stringify(summary) : null,
      id
    )

    if (result.changes === 0) {
      throw new Error(`Batch not found: ${id}`)
    }

    logger.debug('Batch status updated', { id, status })
  }

  async saveResult(result: DetectionResult): Promise<void> {
    logger.info('Attempting to save detection result', {
      id: result.id,
      sessionId: result.sessionId,
      directory: result.directory,
      techStack: result.techStack,
      confidence: result.confidence
    })

    try {
      const stmt = this.db.prepare(`
        INSERT INTO detection_results (
          id, session_id, directory, tech_stack, confidence, issues, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const insertResult = stmt.run(
        result.id,
        result.sessionId,
        result.directory,
        result.techStack || null,
        result.confidence,
        JSON.stringify(result.issues),
        result.createdAt
      )

      logger.info('Detection result saved successfully', {
        id: result.id,
        changes: insertResult.changes,
        lastInsertRowid: insertResult.lastInsertRowid
      })

      // 立即验证数据是否真的保存了
      const verifyStmt = this.db.prepare(`SELECT COUNT(*) as count FROM detection_results WHERE id = ?`)
      const verifyResult = verifyStmt.get(result.id) as { count: number }
      logger.info('Verification after save', {
        id: result.id,
        foundInDb: verifyResult.count > 0,
        count: verifyResult.count
      })

      // 延迟5秒后再次检查数据是否还存在
      setTimeout(() => {
        try {
          const delayedVerifyResult = verifyStmt.get(result.id) as { count: number }
          logger.info('Delayed verification (5s later)', {
            id: result.id,
            foundInDb: delayedVerifyResult.count > 0,
            count: delayedVerifyResult.count
          })
          if (delayedVerifyResult.count === 0) {
            logger.error('DATA DELETED! Record was removed after save', { id: result.id })

            // 检查删除日志
            try {
              const deleteLog = this.db.prepare(`
                SELECT * FROM deletion_log
                WHERE table_name = 'detection_results' AND record_id = ?
                ORDER BY deleted_at DESC LIMIT 1
              `).get(result.id)

              if (deleteLog) {
                logger.error('DELETE operation confirmed in log', {
                  id: result.id,
                  deletedAt: (deleteLog as any).deleted_at
                })
              }
            } catch (logError) {
              logger.error('Failed to check deletion log', { error: logError instanceof Error ? logError.message : String(logError) })
            }
          }
        } catch (error) {
          logger.error('Delayed verification failed', { id: result.id, error: error instanceof Error ? error.message : String(error) })
        }
      }, 5000)

    } catch (error) {
      logger.error('Failed to save detection result', {
        id: result.id,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  async findResultsBySession(sessionId: string): Promise<readonly DetectionResult[]> {
    logger.info('Querying detection results from database', { sessionId })

    // 先检查表是否存在
    try {
      const tableCheck = this.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='detection_results'`).get()
      logger.info('Table existence check', { tableExists: !!tableCheck })
    } catch (error) {
      logger.error('Table check failed', { error: error instanceof Error ? error.message : String(error) })
    }

    // 检查总记录数
    try {
      const totalCount = this.db.prepare(`SELECT COUNT(*) as count FROM detection_results`).get() as { count: number }
      logger.info('Total records in detection_results', { totalCount: totalCount.count })
    } catch (error) {
      logger.error('Total count check failed', { error: error instanceof Error ? error.message : String(error) })
    }

    // First try to find results with matching session_id
    let rows = this.db.prepare(`
      SELECT * FROM detection_results WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId) as any[]
    
    // If no results found, check for orphaned results (session_id = NULL)
    // This can happen when session was deleted but results were preserved
    if (rows.length === 0) {
      const orphanedRows = this.db.prepare(`
        SELECT * FROM detection_results WHERE session_id IS NULL ORDER BY created_at DESC
      `).all() as any[]
      
      logger.info('No direct matches found, checking orphaned results', { 
        sessionId, 
        orphanedCount: orphanedRows.length 
      })
      
      // For now, return the most recent orphaned results if any exist
      // This is a temporary fix - ideally we should prevent session deletion
      // or properly migrate results to applications table
      if (orphanedRows.length > 0) {
        rows = orphanedRows
        logger.info('Returning orphaned results as fallback', { count: rows.length })
      }
    }

    logger.info('Query results from database', { sessionId, rowCount: rows.length })

    if (rows.length > 0) {
      logger.info('Sample result from database', {
        sampleRow: {
          id: rows[0].id,
          session_id: rows[0].session_id,
          directory: rows[0].directory,
          tech_stack: rows[0].tech_stack
        }
      })
    }

    const results = rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      directory: row.directory,
      techStack: row.tech_stack,
      confidence: row.confidence,
      issues: JSON.parse(row.issues),
      createdAt: row.created_at
    }))

    logger.info('Mapped results for return', { sessionId, resultCount: results.length })

    return results
  }

  async deleteSession(sessionId: string): Promise<void> {
    logger.warn('DELETE SESSION CALLED!', {
      sessionId,
      stack: new Error().stack?.split('\n').slice(1, 10).join('\n')
    })

    const result = this.db.prepare(`
      DELETE FROM detection_sessions WHERE id = ?
    `).run(sessionId)

    if (result.changes === 0) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    logger.warn('Detection session deleted - this will cascade delete all results!', { id: sessionId })
  }
}
