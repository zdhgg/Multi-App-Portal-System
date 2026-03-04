/**
 * Build Cache Service - 构建缓存服务
 * 
 * 提供构建依赖缓存、增量构建、缓存管理等功能
 * 支持基于文件变更检测的智能缓存策略
 */

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface CacheEntry {
  id: string
  appId: string
  buildTool: string
  cacheKey: string
  filePaths: string[]
  fileHashes: Record<string, string>
  buildResult: any
  outputPath: string
  createdAt: number
  lastUsed: number
  size: number
  isValid: boolean
}

export interface CacheStats {
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  recentHits: number
  recentMisses: number
  oldestEntry: number
  newestEntry: number
  entriesByApp: Record<string, number>
  entriesByTool: Record<string, number>
}

export interface IncrementalBuildInfo {
  changedFiles: string[]
  addedFiles: string[]
  deletedFiles: string[]
  modifiedFiles: string[]
  affectedModules: string[]
  shouldFullRebuild: boolean
  reason?: string
}

export class BuildCacheService {
  private cacheDir: string
  private maxCacheSize = 5 * 1024 * 1024 * 1024 // 5GB
  private maxCacheAge = 30 * 24 * 60 * 60 * 1000 // 30天
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(private db: Database, cacheBaseDir = './cache') {
    this.cacheDir = path.resolve(cacheBaseDir, 'build-cache')
    this.initializeCache()
    this.startCleanupScheduler()
  }

  /**
   * 初始化缓存系统
   */
  private async initializeCache(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
      
      // 创建缓存表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_cache (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          build_tool TEXT NOT NULL,
          cache_key TEXT NOT NULL UNIQUE,
          file_paths TEXT NOT NULL,
          file_hashes TEXT NOT NULL,
          build_result TEXT NOT NULL,
          output_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_used INTEGER NOT NULL,
          size INTEGER NOT NULL,
          is_valid INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_build_cache_app_id ON build_cache (app_id);
        CREATE INDEX IF NOT EXISTS idx_build_cache_cache_key ON build_cache (cache_key);
        CREATE INDEX IF NOT EXISTS idx_build_cache_last_used ON build_cache (last_used);
        CREATE INDEX IF NOT EXISTS idx_build_cache_created_at ON build_cache (created_at);
      `)

      logger.debug('Build cache service initialized', { cacheDir: this.cacheDir })
    } catch (error) {
      logger.error('Failed to initialize build cache', { error })
      throw error
    }
  }

  /**
   * 生成缓存键
   */
  async generateCacheKey(appId: string, buildTool: string, projectPath: string): Promise<{
    cacheKey: string
    filePaths: string[]
    fileHashes: Record<string, string>
  }> {
    const filePaths = await this.getRelevantFiles(projectPath, buildTool)
    const fileHashes: Record<string, string> = {}
    
    // 计算文件哈希
    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath)
        fileHashes[filePath] = crypto.createHash('md5').update(content).digest('hex')
      } catch (error) {
        logger.warn('Failed to read file for cache key', { filePath, error })
      }
    }

    // 生成缓存键
    const hashInput = JSON.stringify({
      appId,
      buildTool,
      fileHashes: Object.values(fileHashes).sort()
    })
    
    const cacheKey = crypto.createHash('sha256').update(hashInput).digest('hex')

    return { cacheKey, filePaths, fileHashes }
  }

  /**
   * 获取相关文件列表
   */
  private async getRelevantFiles(projectPath: string, buildTool: string): Promise<string[]> {
    const files: string[] = []
    
    // 根据构建工具确定需要监控的文件
    const patterns = this.getFilePatterns(buildTool)
    
    for (const pattern of patterns) {
      try {
        const globPattern = path.join(projectPath, pattern)
        const matchedFiles = await this.globFiles(globPattern)
        files.push(...matchedFiles)
      } catch (error) {
        logger.warn('Failed to glob files', { pattern, error })
      }
    }

    return files.filter(file => !this.shouldIgnoreFile(file))
  }

  /**
   * 获取文件模式
   */
  private getFilePatterns(buildTool: string): string[] {
    const commonPatterns = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'src/**/*',
      'public/**/*',
      'assets/**/*'
    ]

    const toolSpecificPatterns: Record<string, string[]> = {
      vite: ['vite.config.*', 'index.html', '.env*'],
      webpack: ['webpack.config.*', '.env*'],
      nextjs: ['next.config.*', 'pages/**/*', 'app/**/*', '.env*'],
      nuxtjs: ['nuxt.config.*', 'pages/**/*', 'components/**/*', '.env*'],
      'create-react-app': ['.env*'],
      vue: ['vue.config.*', '.env*'],
      angular: ['angular.json', 'tsconfig.*', '.env*']
    }

    return [...commonPatterns, ...(toolSpecificPatterns[buildTool] || [])]
  }

  /**
   * 使用glob模式匹配文件
   */
  private async globFiles(pattern: string): Promise<string[]> {
    // 简化的glob实现，实际项目中应该使用专门的glob库
    const files: string[] = []
    
    try {
      const basePath = pattern.split('*')[0]
      const dir = path.dirname(basePath)
      
      if (await this.fileExists(dir)) {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          if (entry.isFile()) {
            files.push(fullPath)
          } else if (entry.isDirectory() && pattern.includes('**')) {
            const subFiles = await this.globFiles(path.join(fullPath, '**/*'))
            files.push(...subFiles)
          }
        }
      }
    } catch (error) {
      // 忽略错误，返回空数组
    }

    return files
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 检查是否应该忽略文件
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignoredPatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.nuxt',
      'coverage',
      '.cache',
      '.temp',
      '.tmp'
    ]

    return ignoredPatterns.some(pattern => filePath.includes(pattern))
  }

  /**
   * 检查缓存是否存在且有效
   */
  async getCacheEntry(cacheKey: string): Promise<CacheEntry | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM build_cache 
        WHERE cache_key = ? AND is_valid = 1
      `)
      
      const row = stmt.get(cacheKey) as any
      if (!row) return null

      // 更新最后使用时间
      this.updateLastUsed(row.id)

      return {
        id: row.id,
        appId: row.app_id,
        buildTool: row.build_tool,
        cacheKey: row.cache_key,
        filePaths: JSON.parse(row.file_paths),
        fileHashes: JSON.parse(row.file_hashes),
        buildResult: JSON.parse(row.build_result),
        outputPath: row.output_path,
        createdAt: row.created_at,
        lastUsed: row.last_used,
        size: row.size,
        isValid: row.is_valid === 1
      }
    } catch (error) {
      logger.error('Failed to get cache entry', { cacheKey, error })
      return null
    }
  }

  /**
   * 保存缓存条目
   */
  async saveCacheEntry(entry: Omit<CacheEntry, 'id' | 'createdAt' | 'lastUsed'>): Promise<string> {
    const id = crypto.randomUUID()
    const now = Date.now()

    try {
      const stmt = this.db.prepare(`
        INSERT INTO build_cache (
          id, app_id, build_tool, cache_key, file_paths, file_hashes,
          build_result, output_path, created_at, last_used, size, is_valid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        entry.appId,
        entry.buildTool,
        entry.cacheKey,
        JSON.stringify(entry.filePaths),
        JSON.stringify(entry.fileHashes),
        JSON.stringify(entry.buildResult),
        entry.outputPath,
        now,
        now,
        entry.size,
        1
      )

      logger.info('Cache entry saved', { id, appId: entry.appId, cacheKey: entry.cacheKey })
      return id
    } catch (error) {
      logger.error('Failed to save cache entry', { error })
      throw error
    }
  }

  /**
   * 分析增量构建信息
   */
  async analyzeIncrementalBuild(
    appId: string,
    projectPath: string,
    buildTool: string
  ): Promise<IncrementalBuildInfo> {
    try {
      // 获取当前文件状态
      const { filePaths, fileHashes } = await this.generateCacheKey(appId, buildTool, projectPath)
      
      // 获取最近的缓存条目
      const recentCache = await this.getRecentCacheEntry(appId, buildTool)
      
      if (!recentCache) {
        return {
          changedFiles: filePaths,
          addedFiles: filePaths,
          deletedFiles: [],
          modifiedFiles: [],
          affectedModules: [],
          shouldFullRebuild: true,
          reason: 'No previous build cache found'
        }
      }

      // 比较文件变更
      const changedFiles: string[] = []
      const addedFiles: string[] = []
      const modifiedFiles: string[] = []
      const deletedFiles: string[] = []

      // 检查新增和修改的文件
      for (const [filePath, hash] of Object.entries(fileHashes)) {
        if (!recentCache.fileHashes[filePath]) {
          addedFiles.push(filePath)
          changedFiles.push(filePath)
        } else if (recentCache.fileHashes[filePath] !== hash) {
          modifiedFiles.push(filePath)
          changedFiles.push(filePath)
        }
      }

      // 检查删除的文件
      for (const filePath of Object.keys(recentCache.fileHashes)) {
        if (!fileHashes[filePath]) {
          deletedFiles.push(filePath)
          changedFiles.push(filePath)
        }
      }

      // 分析受影响的模块
      const affectedModules = this.analyzeAffectedModules(changedFiles, buildTool)
      
      // 决定是否需要完整重建
      const shouldFullRebuild = this.shouldFullRebuild(changedFiles, buildTool)

      return {
        changedFiles,
        addedFiles,
        deletedFiles,
        modifiedFiles,
        affectedModules,
        shouldFullRebuild,
        reason: shouldFullRebuild ? this.getFullRebuildReason(changedFiles, buildTool) : undefined
      }
    } catch (error) {
      logger.error('Failed to analyze incremental build', { error })
      return {
        changedFiles: [],
        addedFiles: [],
        deletedFiles: [],
        modifiedFiles: [],
        affectedModules: [],
        shouldFullRebuild: true,
        reason: 'Analysis failed'
      }
    }
  }

  /**
   * 获取最近的缓存条目
   */
  private async getRecentCacheEntry(appId: string, buildTool: string): Promise<CacheEntry | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM build_cache 
        WHERE app_id = ? AND build_tool = ? AND is_valid = 1
        ORDER BY created_at DESC
        LIMIT 1
      `)
      
      const row = stmt.get(appId, buildTool) as any
      if (!row) return null

      return {
        id: row.id,
        appId: row.app_id,
        buildTool: row.build_tool,
        cacheKey: row.cache_key,
        filePaths: JSON.parse(row.file_paths),
        fileHashes: JSON.parse(row.file_hashes),
        buildResult: JSON.parse(row.build_result),
        outputPath: row.output_path,
        createdAt: row.created_at,
        lastUsed: row.last_used,
        size: row.size,
        isValid: row.is_valid === 1
      }
    } catch (error) {
      logger.error('Failed to get recent cache entry', { error })
      return null
    }
  }

  /**
   * 分析受影响的模块
   */
  private analyzeAffectedModules(changedFiles: string[], buildTool: string): string[] {
    const affectedModules: string[] = []
    
    for (const file of changedFiles) {
      // 根据文件类型和构建工具分析受影响的模块
      if (file.includes('package.json')) {
        affectedModules.push('dependencies')
      } else if (file.includes('config')) {
        affectedModules.push('configuration')
      } else if (file.includes('src/')) {
        affectedModules.push('source-code')
      } else if (file.includes('public/') || file.includes('assets/')) {
        affectedModules.push('static-assets')
      }
    }

    return [...new Set(affectedModules)]
  }

  /**
   * 判断是否需要完整重建
   */
  private shouldFullRebuild(changedFiles: string[], buildTool: string): boolean {
    const criticalFiles = [
      'package.json',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      'webpack.config.',
      'vite.config.',
      'next.config.',
      'nuxt.config.',
      'vue.config.',
      'angular.json',
      'tsconfig.json'
    ]

    return changedFiles.some(file => 
      criticalFiles.some(critical => file.includes(critical))
    )
  }

  /**
   * 获取完整重建的原因
   */
  private getFullRebuildReason(changedFiles: string[], buildTool: string): string {
    const criticalChanges = changedFiles.filter(file => 
      ['package.json', 'config', 'tsconfig'].some(critical => file.includes(critical))
    )

    if (criticalChanges.length > 0) {
      return `Critical files changed: ${criticalChanges.join(', ')}`
    }

    return 'Multiple files changed, full rebuild recommended'
  }

  /**
   * 更新最后使用时间
   */
  private updateLastUsed(cacheId: string): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE build_cache SET last_used = ? WHERE id = ?
      `)
      stmt.run(Date.now(), cacheId)
    } catch (error) {
      logger.error('Failed to update last used time', { cacheId, error })
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<CacheStats> {
    try {
      const totalStmt = this.db.prepare(`
        SELECT COUNT(*) as count, SUM(size) as total_size FROM build_cache WHERE is_valid = 1
      `)
      const totalResult = totalStmt.get() as any

      const appStmt = this.db.prepare(`
        SELECT app_id, COUNT(*) as count FROM build_cache WHERE is_valid = 1 GROUP BY app_id
      `)
      const appResults = appStmt.all() as any[]

      const toolStmt = this.db.prepare(`
        SELECT build_tool, COUNT(*) as count FROM build_cache WHERE is_valid = 1 GROUP BY build_tool
      `)
      const toolResults = toolStmt.all() as any[]

      const timeStmt = this.db.prepare(`
        SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM build_cache WHERE is_valid = 1
      `)
      const timeResult = timeStmt.get() as any

      const entriesByApp: Record<string, number> = {}
      appResults.forEach(row => {
        entriesByApp[row.app_id] = row.count
      })

      const entriesByTool: Record<string, number> = {}
      toolResults.forEach(row => {
        entriesByTool[row.build_tool] = row.count
      })

      return {
        totalEntries: totalResult.count || 0,
        totalSize: totalResult.total_size || 0,
        hitRate: 0, // 需要额外的统计逻辑
        missRate: 0, // 需要额外的统计逻辑
        recentHits: 0, // 需要额外的统计逻辑
        recentMisses: 0, // 需要额外的统计逻辑
        oldestEntry: timeResult.oldest || 0,
        newestEntry: timeResult.newest || 0,
        entriesByApp,
        entriesByTool
      }
    } catch (error) {
      logger.error('Failed to get cache stats', { error })
      throw error
    }
  }

  /**
   * 清理过期缓存
   */
  async cleanupExpiredCache(): Promise<{ deletedEntries: number; freedSpace: number }> {
    const cutoffTime = Date.now() - this.maxCacheAge
    let deletedEntries = 0
    let freedSpace = 0

    try {
      // 获取过期的缓存条目
      const stmt = this.db.prepare(`
        SELECT id, size, output_path FROM build_cache 
        WHERE last_used < ? OR created_at < ?
      `)
      
      const expiredEntries = stmt.all(cutoffTime, cutoffTime) as any[]

      // 删除过期条目
      const deleteStmt = this.db.prepare(`DELETE FROM build_cache WHERE id = ?`)
      
      for (const entry of expiredEntries) {
        try {
          // 删除缓存文件
          if (entry.output_path && await this.fileExists(entry.output_path)) {
            await fs.rm(entry.output_path, { recursive: true, force: true })
          }
          
          // 删除数据库记录
          deleteStmt.run(entry.id)
          
          deletedEntries++
          freedSpace += entry.size || 0
        } catch (error) {
          logger.warn('Failed to delete cache entry', { id: entry.id, error })
        }
      }

      logger.info('Cache cleanup completed', { deletedEntries, freedSpace })
      return { deletedEntries, freedSpace }
    } catch (error) {
      logger.error('Failed to cleanup expired cache', { error })
      throw error
    }
  }

  /**
   * 启动清理调度器
   */
  private startCleanupScheduler(): void {
    // 每小时执行一次清理
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredCache().catch(error => {
        logger.error('Scheduled cache cleanup failed', { error })
      })
    }, 60 * 60 * 1000)
  }

  /**
   * 关闭服务
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}
