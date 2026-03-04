/**
 * Database Migration v1 -> v2
 * 
 * This script performs a complete migration from the messy v1 schema
 * to the clean v2 schema. It's a one-way, destructive migration.
 * 
 * Linus's principle: "Better to have a broken system for a week 
 * than a crappy system forever."
 */

import { Database } from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { logger } from '../utils/logger'
import type { Application, NetworkConfiguration } from './types'

export interface MigrationResult {
  success: boolean
  migratedApps: number
  migratedSessions: number
  errors: string[]
  duration: number
}

export class DatabaseMigrator {
  constructor(private db: Database) {}

  /**
   * Execute the complete migration from v1 to v2
   */
  async migrate(): Promise<MigrationResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let migratedApps = 0
    let migratedSessions = 0

    try {
      logger.info('🚀 Starting database migration to clean schema... (Phase 5)')
      
      // Step 1: Backup existing data (handles fresh installations gracefully)
      const legacyData = this.extractLegacyData()
      const hasLegacyData = legacyData.apps.length > 0 || legacyData.sessions.length > 0
      
      if (hasLegacyData) {
        logger.info(`📦 Found legacy data: ${legacyData.apps.length} apps, ${legacyData.sessions.length} sessions`)
      } else {
        logger.info('🆕 Fresh installation - initializing clean database schema')
      }
      
      // Step 2: Apply clean schema (this will drop all legacy tables)
      this.applyCleanSchema()
      
      // Step 3: Migrate applications (only if there are any)
      if (legacyData.apps.length > 0) {
        migratedApps = this.migrateApplications(legacyData.apps, errors)
      } else {
        logger.debug('No legacy applications to migrate')
      }
      
      // Step 4: Migrate detection sessions (only if there are any)
      if (legacyData.sessions.length > 0) {
        migratedSessions = this.migrateDetectionSessions(legacyData.sessions, errors)
      } else {
        logger.debug('No legacy detection sessions to migrate')
      }
      
      // Step 5: Clean up and optimize
      this.optimizeDatabase()
      
      const duration = Date.now() - startTime
      
      const migrationStatus = hasLegacyData ? 'migration completed' : 'fresh installation initialized'
      logger.info(`✅ Database ${migrationStatus} (Phase 5)`, {
        migratedApps,
        migratedSessions,
        errors: errors.length,
        duration: `${duration}ms`,
        type: hasLegacyData ? 'migration' : 'fresh_install'
      })

      return {
        success: errors.length === 0,
        migratedApps,
        migratedSessions,
        errors,
        duration
      }
      
    } catch (error) {
      logger.error('❌ Database migration failed (Phase 5)', error)
      return {
        success: false,
        migratedApps: 0,
        migratedSessions: 0,
        errors: [String(error)],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * Extract data from legacy tables before they're dropped
   * Phase 5: Enhanced with better error handling for missing tables
   */
  private extractLegacyData(): { apps: any[], sessions: any[] } {
    // Check if we have a fresh database with no legacy tables
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    
    logger.debug('Available database tables:', { tables: tableNames })
    
    let apps: any[] = []
    let sessions: any[] = []
    
    try {
      // Extract applications only if the apps table exists
      if (tableNames.includes('apps')) {
        apps = this.db.prepare('SELECT * FROM apps').all()
        logger.debug(`Extracted ${apps.length} applications from legacy schema`)
      } else {
        logger.debug('No legacy "apps" table found - fresh installation')
      }
      
      // Extract detection sessions if they exist
      if (tableNames.includes('scan_sessions')) {
        sessions = this.db.prepare('SELECT * FROM scan_sessions').all()
        logger.debug(`Extracted ${sessions.length} detection sessions from legacy schema`)
      } else {
        logger.debug('No "scan_sessions" table found - fresh installation')
      }
      
      // If no legacy tables exist, this is a fresh installation
      if (!tableNames.includes('apps') && !tableNames.includes('scan_sessions')) {
        logger.debug('Fresh installation detected - no legacy data to migrate')
      }
      
      return { apps, sessions }
      
    } catch (error) {
      logger.error('Failed to extract legacy data', error)
      // Don't throw error for missing tables in fresh installations
      if (error.message?.includes('no such table')) {
        logger.warn('Legacy table not found - treating as fresh installation')
        return { apps: [], sessions: [] }
      }
      throw error
    }
  }

  /**
   * Apply the new clean schema
   */
  private applyCleanSchema(): void {
    try {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const schemaPath = join(__dirname, 'schema.sql')
      const schemaSql = readFileSync(schemaPath, 'utf-8')
      
      // 检查核心表是否已存在
      const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
      const tableNames = tables.map(t => t.name)
      
      // 如果核心表（applications）已存在，跳过schema创建，只做验证
      if (tableNames.includes('applications')) {
        logger.debug('Core tables already exist, skipping schema creation')
        
        // 验证关键表结构
        this.verifySchemaStructure()
        return
      }
      
      // 执行完整的schema创建（仅在表不存在时）
      this.db.exec(schemaSql)
      
      logger.info('✅ Applied clean schema successfully')
      
    } catch (error) {
      // 如果是"表已存在"错误，记录警告但不抛出异常
      if (error instanceof Error && error.message.includes('already exists')) {
        logger.warn('⚠️ Some tables already exist, continuing with existing schema', error)
        return
      }
      
      logger.error('Failed to apply clean schema', error)
      throw error
    }
  }
  
  /**
   * 验证数据库schema结构是否完整
   */
  private verifySchemaStructure(): void {
    const requiredTables = [
      'applications',
      'application_metadata',
      'detection_sessions',
      'detection_results',
      'port_allocations'
    ]
    
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[]
    const tableNames = tables.map(t => t.name)
    
    const missingTables = requiredTables.filter(t => !tableNames.includes(t))
    
    if (missingTables.length > 0) {
      logger.warn('⚠️ Some required tables are missing', { missingTables })
    } else {
      logger.debug('All required tables verified')
    }
  }

  /**
   * Migrate applications from v1 to v2 format
   */
  private migrateApplications(v1Apps: any[], errors: string[]): number {
    if (v1Apps.length === 0) {
      return 0
    }

    let migratedCount = 0
    
    // Prepare insert statements
    const insertApp = this.db.prepare(`
      INSERT INTO applications (
        id, name, directory, tech_stack, network_config, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    const insertMetadata = this.db.prepare(`
      INSERT INTO application_metadata (app_id, description, icon, color, pinned, access_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    
    const insertPortAllocation = this.db.prepare(`
      INSERT INTO port_allocations (port, allocated_to, allocated_at)
      VALUES (?, ?, ?)
    `)

    for (const v1App of v1Apps) {
      try {
        // Convert the messy v1 port fields to clean v2 network config
        const networkConfig = this.convertPortFields(v1App)
        
        // Convert v1 status to v2 state
        const state = this.convertApplicationState(v1App.status)
        
        // Convert timestamps
        const createdAt = this.convertTimestamp(v1App.created_at)
        const updatedAt = this.convertTimestamp(v1App.updated_at)
        
        // Insert application
        insertApp.run(
          v1App.id,
          v1App.name,
          v1App.directory,
          v1App.tech_stack,
          JSON.stringify(networkConfig),
          state,
          createdAt,
          updatedAt
        )
        
        // Insert metadata (if exists)
        const pinned = this.convertPinnedFlag(v1App)
        if (v1App.description || v1App.icon || v1App.color || pinned) {
          insertMetadata.run(
            v1App.id,
            v1App.description || null,
            v1App.icon || null,
            v1App.color || null,
            pinned ? 1 : 0,
            null
          )
        }
        
        // Insert port allocation
        if (networkConfig.primaryPort) {
          insertPortAllocation.run(
            networkConfig.primaryPort,
            v1App.id,
            Date.now()
          )
        }
        
        migratedCount++
        
      } catch (error) {
        const errorMsg = `Failed to migrate app ${v1App.id}: ${error}`
        errors.push(errorMsg)
        logger.error(errorMsg)
      }
    }
    
    logger.debug(`Migrated ${migratedCount}/${v1Apps.length} applications`)
    return migratedCount
  }

  /**
   * Convert the messy v1 port fields to clean v2 network config
   */
  private convertPortFields(v1App: any): NetworkConfiguration {
    // This is where we fix the "向后兼容" disaster
    const primaryPort = v1App.frontend_port || v1App.port || v1App.backend_port || 3000
    
    const secondaryPorts: number[] = []
    if (v1App.backend_port && v1App.backend_port !== primaryPort) {
      secondaryPorts.push(v1App.backend_port)
    }
    if (v1App.port && v1App.port !== primaryPort && !secondaryPorts.includes(v1App.port)) {
      secondaryPorts.push(v1App.port)
    }
    
    return {
      primaryPort,
      secondaryPorts,
      protocol: 'http'
    }
  }

  /**
   * Convert v1 status to v2 state
   */
  private convertApplicationState(v1Status: string): 'stopped' | 'running' | 'failed' {
    switch (v1Status) {
      case 'online': return 'running'
      case 'offline': return 'stopped'
      case 'error': return 'failed'
      case 'maintenance': return 'stopped'
      default: return 'stopped'
    }
  }

  /**
   * Convert timestamp to Unix timestamp
   */
  private convertTimestamp(timestamp: string | number): number {
    if (typeof timestamp === 'number') {
      return timestamp
    }
    return Math.floor(new Date(timestamp).getTime() / 1000)
  }

  private convertPinnedFlag(v1App: any): boolean {
    if (!v1App || typeof v1App !== 'object') {
      return false
    }

    if (typeof v1App.pinned_to_homepage === 'boolean') {
      return v1App.pinned_to_homepage
    }
    if (typeof v1App.pinned === 'boolean') {
      return v1App.pinned
    }

    if (typeof v1App.pinned_to_homepage === 'number') {
      return v1App.pinned_to_homepage === 1
    }
    if (typeof v1App.pinned === 'number') {
      return v1App.pinned === 1
    }

    return false
  }

  /**
   * Migrate detection sessions (simplified)
   */
  private migrateDetectionSessions(v1Sessions: any[], errors: string[]): number {
    // For now, we'll skip migrating old detection sessions
    // They're ephemeral data anyway
    return 0
  }

  /**
   * Optimize database after migration
   */
  private optimizeDatabase(): void {
    this.db.exec('VACUUM')
    this.db.exec('ANALYZE')
    logger.debug('Database optimized')
  }
}

/**
 * Utility function to run migration
 */
export async function runMigration(dbPath: string): Promise<MigrationResult> {
  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath)
  
  try {
    const migrator = new DatabaseMigrator(db)
    return await migrator.migrate()
  } finally {
    db.close()
  }
}
