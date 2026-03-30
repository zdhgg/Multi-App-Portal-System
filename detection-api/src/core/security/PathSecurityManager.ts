/**
 * 路径安全管理器
 * 
 * 提供文件系统访问权限控制和路径安全检查功能。
 * 实现白名单机制、访问权限控制和安全审计。
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../../utils/logger'
import { getSystemConfigFilePath, parseSystemConfigFileSync } from '../../utils/systemConfigPath.js'
import { securityValidator, SecurityValidator } from './SecurityValidator'

// =============================================================================
// 路径安全配置
// =============================================================================

const TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes'])

function normalizeAbsolutePath(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return path.resolve(trimmed)
  } catch {
    return null
  }
}

function parseBasePaths(...rawValues: Array<string | undefined>): string[] {
  const values = rawValues
    .filter(Boolean)
    .flatMap(value => String(value).split(/[;,]/))
    .map(v => v.trim())
    .filter(Boolean)

  const unique = new Set<string>()
  for (const value of values) {
    const normalized = normalizeAbsolutePath(value)
    if (normalized) {
      unique.add(normalized)
    }
  }
  return Array.from(unique)
}

interface SystemPathAccessSettings {
  allowedBasePaths: string[]
  allowWorkspaceParent?: boolean
}

let systemPathAccessSettingsCache: { mtimeMs: number; data: SystemPathAccessSettings } | null = null

function loadSystemPathAccessSettings(): SystemPathAccessSettings {
  const settingsPath = getSystemConfigFilePath()

  try {
    if (!fs.existsSync(settingsPath)) {
      return { allowedBasePaths: [] }
    }

    const stat = fs.statSync(settingsPath)
    if (systemPathAccessSettingsCache && systemPathAccessSettingsCache.mtimeMs === stat.mtimeMs) {
      return systemPathAccessSettingsCache.data
    }

    const settings = parseSystemConfigFileSync(settingsPath)
    const pathAccess = settings?.security?.pathAccess || {}

    const rawPaths = Array.isArray(pathAccess?.allowedBasePaths) ? pathAccess.allowedBasePaths : []
    const allowedBasePaths = parseBasePaths(...rawPaths.map((item: unknown) => String(item)))
    const allowWorkspaceParent =
      typeof pathAccess?.allowWorkspaceParent === 'boolean' ? pathAccess.allowWorkspaceParent : undefined

    const data: SystemPathAccessSettings = {
      allowedBasePaths,
      allowWorkspaceParent
    }

    systemPathAccessSettingsCache = {
      mtimeMs: stat.mtimeMs,
      data
    }

    return data
  } catch (error) {
    logger.warn('读取系统路径访问配置失败，回退到默认策略', {
      error: error instanceof Error ? error.message : String(error)
    })
    return { allowedBasePaths: [] }
  }
}

function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const target = path.resolve(targetPath)
  const base = path.resolve(basePath)

  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const normalizedBase = process.platform === 'win32' ? base.toLowerCase() : base

  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}${path.sep}`)
}

function buildDefaultAllowedBasePaths(): string[] {
  const systemPathAccessSettings = loadSystemPathAccessSettings()
  const strictDefaults = [
    process.cwd(),
    path.join(process.cwd(), 'data'),
    path.join(process.cwd(), 'logs'),
    path.join(process.cwd(), 'temp'),
    path.join(process.cwd(), 'uploads')
  ]

  const parentPathAllowed = TRUTHY_VALUES.has(
    (process.env.ALLOW_WORKSPACE_PARENT || '').trim().toLowerCase()
  ) || systemPathAccessSettings.allowWorkspaceParent === true

  // 仅在显式允许时开放父目录，避免默认扩大暴露面
  if (parentPathAllowed) {
    strictDefaults.push(path.resolve(process.cwd(), '..'))
  }

  const envPaths = parseBasePaths(
    process.env.PATH_SECURITY_BASE_PATHS,
    process.env.FILESYSTEM_ALLOWED_BASE_PATHS,
    process.env.ALLOWED_PATHS
  )

  const unique = new Set<string>()
  for (const candidate of [...strictDefaults, ...envPaths, ...systemPathAccessSettings.allowedBasePaths]) {
    const normalized = normalizeAbsolutePath(candidate)
    if (normalized) {
      unique.add(normalized)
    }
  }

  return Array.from(unique)
}

export interface PathSecurityConfig {
  // 白名单配置
  whitelist: {
    basePaths: string[]
    allowedExtensions: string[]
    maxDepth: number
  }
  
  // 黑名单配置
  blacklist: {
    paths: string[]
    patterns: RegExp[]
    extensions: string[]
  }
  
  // 访问控制
  accessControl: {
    requireAuthentication: boolean
    allowedRoles: string[]
    maxFileSize: number
    maxFilesPerRequest: number
  }
  
  // 审计配置
  audit: {
    logAccess: boolean
    logFailures: boolean
    alertOnSuspicious: boolean
  }
}

// 默认配置
const DEFAULT_PATH_SECURITY_CONFIG: PathSecurityConfig = {
  whitelist: {
    basePaths: buildDefaultAllowedBasePaths(),
    allowedExtensions: [
      '.js', '.ts', '.jsx', '.tsx', '.vue',
      '.json', '.md', '.txt', '.log',
      '.html', '.css', '.scss', '.less',
      '.png', '.jpg', '.jpeg', '.gif', '.svg',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx'
    ],
    maxDepth: 15  // 增加深度限制以支持更深的项目结构
  },
  
  blacklist: {
    paths: [
      '/etc/passwd',
      '/etc/shadow',
      '/windows/system32',
      'C:\\Windows\\System32',
      '/proc',
      '/sys'
    ],
    patterns: [
      /node_modules/,
      /\.git/,
      /\.env/,
      /\.ssh/,
      /\.aws/,
      /\.docker/,
      /password/i,
      /secret/i,
      /private/i
    ],
    extensions: [
      '.exe', '.bat', '.cmd', '.sh', '.ps1',
      '.vbs', '.scr', '.com', '.pif',
      '.dll', '.sys', '.drv'
    ]
  },
  
  accessControl: {
    requireAuthentication: true,
    allowedRoles: ['admin', 'user', 'system'],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxFilesPerRequest: 50
  },
  
  audit: {
    logAccess: true,
    logFailures: true,
    alertOnSuspicious: true
  }
}

// =============================================================================
// 访问结果接口
// =============================================================================

export interface PathAccessResult {
  allowed: boolean
  path?: string
  reason?: string
  metadata?: {
    resolvedPath: string
    fileSize?: number
    fileType?: string
    lastModified?: Date
    permissions?: string
  }
}

export interface PathAccessRequest {
  path: string
  operation: 'read' | 'write' | 'execute' | 'list'
  user?: {
    id: string
    role: string
    permissions: string[]
  }
  context?: {
    requestId: string
    userAgent?: string
    ip?: string
  }
}

// =============================================================================
// 路径安全管理器类
// =============================================================================

export class PathSecurityManager {
  private config: PathSecurityConfig
  private accessLog: Map<string, { count: number; lastAccess: Date; failures: number }>
  private validator: SecurityValidator

  constructor(config?: Partial<PathSecurityConfig>, validator?: SecurityValidator) {
    this.config = this.mergeConfig(DEFAULT_PATH_SECURITY_CONFIG, config)
    this.accessLog = new Map()
    this.validator = validator || securityValidator
  }

  private normalizeBasePathKey(input: string): string {
    const resolved = path.resolve(input)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  private areBasePathsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false

    const normalizedA = a.map(item => this.normalizeBasePathKey(item)).sort()
    const normalizedB = b.map(item => this.normalizeBasePathKey(item)).sort()

    return normalizedA.every((item, index) => item === normalizedB[index])
  }

  private refreshAllowedBasePathsFromRuntimeConfig(): void {
    const runtimeBasePaths = buildDefaultAllowedBasePaths()
    const currentBasePaths = this.config.whitelist.basePaths || []

    if (!this.areBasePathsEqual(currentBasePaths, runtimeBasePaths)) {
      this.config.whitelist.basePaths = runtimeBasePaths
      logger.info('路径白名单已从系统设置刷新', {
        basePathCount: runtimeBasePaths.length
      })
    }
  }

  // =============================================================================
  // 核心访问控制方法
  // =============================================================================

  /**
   * 检查路径访问权限
   */
  async checkAccess(request: PathAccessRequest): Promise<PathAccessResult> {
    const startTime = Date.now()
    
    try {
      // 每次访问前刷新一次白名单，确保系统设置修改后即时生效
      this.refreshAllowedBasePathsFromRuntimeConfig()

      // 1. 基础路径验证
      const pathValidation = this.validator.validatePath(request.path)
      if (!pathValidation.isValid) {
        await this.logAccessAttempt(request, false, pathValidation.errors.join(', '))
        return {
          allowed: false,
          reason: `路径验证失败: ${pathValidation.errors.join(', ')}`
        }
      }

      const resolvedPath = pathValidation.sanitizedPath!

      // 2. 白名单检查
      if (!this.isInWhitelist(resolvedPath)) {
        await this.logAccessAttempt(request, false, '路径不在白名单中')
        return {
          allowed: false,
          reason: '路径不在允许的访问范围内'
        }
      }

      // 3. 黑名单检查
      if (this.isInBlacklist(resolvedPath)) {
        await this.logAccessAttempt(request, false, '路径在黑名单中')
        return {
          allowed: false,
          reason: '路径被明确禁止访问'
        }
      }

      // 4. 用户权限检查
      if (this.config.accessControl.requireAuthentication) {
        const authCheck = this.checkUserPermissions(request)
        if (!authCheck.allowed) {
          await this.logAccessAttempt(request, false, authCheck.reason!)
          return authCheck
        }
      }

      // 5. 文件系统检查
      const fsCheck = await this.checkFileSystem(resolvedPath, request.operation)
      if (!fsCheck.allowed) {
        await this.logAccessAttempt(request, false, fsCheck.reason!)
        return fsCheck
      }

      // 6. 获取文件元数据
      const metadata = await this.getFileMetadata(resolvedPath)

      // 7. 文件大小检查
      if (metadata.fileSize && metadata.fileSize > this.config.accessControl.maxFileSize) {
        await this.logAccessAttempt(request, false, '文件大小超过限制')
        return {
          allowed: false,
          reason: `文件大小超过限制 (${this.config.accessControl.maxFileSize} bytes)`
        }
      }

      // 8. 记录成功访问
      await this.logAccessAttempt(request, true)

      return {
        allowed: true,
        path: resolvedPath,
        metadata: {
          resolvedPath,
          ...metadata
        }
      }

    } catch (error) {
      logger.error('路径访问检查失败', { request, error })
      await this.logAccessAttempt(request, false, `系统错误: ${error}`)
      
      return {
        allowed: false,
        reason: '访问检查过程中发生系统错误'
      }
    } finally {
      const duration = Date.now() - startTime
      logger.debug('路径访问检查完成', { 
        path: request.path, 
        operation: request.operation,
        duration 
      })
    }
  }

  // =============================================================================
  // 白名单和黑名单检查
  // =============================================================================

  /**
   * 检查路径是否在白名单中
   */
  private isInWhitelist(resolvedPath: string): boolean {
    // 检查基础路径
    const isInBasePath = this.config.whitelist.basePaths.some(basePath => {
      return isPathWithinBase(resolvedPath, basePath)
    })

    if (!isInBasePath) {
      return false
    }

    // 检查扩展名（只对“文件”进行检查；目录名中包含点号不应被当作扩展名拦截）
    const ext = path.extname(resolvedPath).toLowerCase()
    if (ext) {
      try {
        // 如果路径存在且为目录，则忽略扩展名检查
        if (fs.existsSync(resolvedPath)) {
          const stat = fs.statSync(resolvedPath)
          if (stat.isDirectory()) {
            // 目录：即使名称中包含点号也放行
          } else {
            // 文件：需要在允许的扩展名列表中
            if (!this.config.whitelist.allowedExtensions.includes(ext)) {
              return false
            }
          }
        } else {
          // 路径不存在，无法判断其类型；保守处理为仅当扩展名在白名单时放行
          if (!this.config.whitelist.allowedExtensions.includes(ext)) {
            return false
          }
        }
      } catch {
        // 任何异常都按保守策略处理
        if (!this.config.whitelist.allowedExtensions.includes(ext)) {
          return false
        }
      }
    }
    // 没有扩展名或为目录：通过扩展名检查

    // 检查深度
    const relativePath = this.getRelativePath(resolvedPath)
    if (relativePath) {
      const depth = relativePath.split(path.sep).length - 1
      if (depth > this.config.whitelist.maxDepth) {
        return false
      }
    }

    return true
  }

  /**
   * 检查路径是否在黑名单中
   */
  private isInBlacklist(resolvedPath: string): boolean {
    // 检查明确禁止的路径
    if (this.config.blacklist.paths.some(blockedPath => 
      resolvedPath.toLowerCase().includes(blockedPath.toLowerCase())
    )) {
      return true
    }

    // 检查模式匹配
    if (this.config.blacklist.patterns.some(pattern => 
      pattern.test(resolvedPath)
    )) {
      return true
    }

    // 检查扩展名
    const ext = path.extname(resolvedPath).toLowerCase()
    if (ext && this.config.blacklist.extensions.includes(ext)) {
      return true
    }

    return false
  }

  // =============================================================================
  // 权限和文件系统检查
  // =============================================================================

  /**
   * 检查用户权限
   */
  private checkUserPermissions(request: PathAccessRequest): PathAccessResult {
    if (!request.user) {
      return {
        allowed: false,
        reason: '需要用户认证'
      }
    }

    // 检查角色权限
    if (!this.config.accessControl.allowedRoles.includes(request.user.role)) {
      return {
        allowed: false,
        reason: `用户角色 '${request.user.role}' 没有访问权限`
      }
    }

    // 检查操作权限
    const requiredPermission = `file:${request.operation}`
    if (request.user.permissions && !request.user.permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        reason: `用户没有 '${request.operation}' 操作权限`
      }
    }

    return { allowed: true }
  }

  /**
   * 检查文件系统状态
   */
  private async checkFileSystem(resolvedPath: string, operation: string): Promise<PathAccessResult> {
    try {
      // 检查路径是否存在
      const exists = fs.existsSync(resolvedPath)
      
      if (!exists && operation === 'read') {
        return {
          allowed: false,
          reason: '文件或目录不存在'
        }
      }

      if (exists) {
        const stats = fs.statSync(resolvedPath)
        
        // 检查是否为目录
        if (stats.isDirectory() && operation === 'read') {
          // 检查目录读取权限
          try {
            fs.accessSync(resolvedPath, fs.constants.R_OK)
          } catch (error) {
            return {
              allowed: false,
              reason: '没有目录读取权限'
            }
          }
        }
        
        // 检查文件权限
        if (stats.isFile()) {
          try {
            switch (operation) {
              case 'read':
                fs.accessSync(resolvedPath, fs.constants.R_OK)
                break
              case 'write':
                fs.accessSync(resolvedPath, fs.constants.W_OK)
                break
              case 'execute':
                fs.accessSync(resolvedPath, fs.constants.X_OK)
                break
            }
          } catch (error) {
            return {
              allowed: false,
              reason: `没有文件 '${operation}' 权限`
            }
          }
        }
      }

      return { allowed: true }

    } catch (error) {
      logger.error('文件系统检查失败', { resolvedPath, operation, error })
      return {
        allowed: false,
        reason: '文件系统检查失败'
      }
    }
  }

  // =============================================================================
  // 辅助方法
  // =============================================================================

  /**
   * 获取文件元数据
   */
  private async getFileMetadata(resolvedPath: string): Promise<{
    fileSize?: number
    fileType?: string
    lastModified?: Date
    permissions?: string
  }> {
    try {
      if (!fs.existsSync(resolvedPath)) {
        return {}
      }

      const stats = fs.statSync(resolvedPath)
      
      return {
        fileSize: stats.size,
        fileType: stats.isDirectory() ? 'directory' : 'file',
        lastModified: stats.mtime,
        permissions: stats.mode.toString(8)
      }

    } catch (error) {
      logger.warn('获取文件元数据失败', { resolvedPath, error })
      return {}
    }
  }

  /**
   * 获取相对路径
   */
  private getRelativePath(resolvedPath: string): string | null {
    for (const basePath of this.config.whitelist.basePaths) {
      const resolvedBase = path.resolve(basePath)
      if (isPathWithinBase(resolvedPath, resolvedBase)) {
        return path.relative(resolvedBase, resolvedPath)
      }
    }
    return null
  }

  /**
   * 记录访问尝试
   */
  private async logAccessAttempt(
    request: PathAccessRequest, 
    success: boolean, 
    reason?: string
  ): Promise<void> {
    const logKey = `${request.user?.id || 'anonymous'}:${request.path}`
    
    // 更新访问统计
    const existing = this.accessLog.get(logKey) || { count: 0, lastAccess: new Date(), failures: 0 }
    existing.count++
    existing.lastAccess = new Date()
    if (!success) {
      existing.failures++
    }
    this.accessLog.set(logKey, existing)

    // 记录日志
    if ((success && this.config.audit.logAccess) || (!success && this.config.audit.logFailures)) {
      const logData = {
        success,
        path: request.path,
        operation: request.operation,
        user: request.user?.id || 'anonymous',
        role: request.user?.role,
        reason,
        context: request.context,
        timestamp: new Date().toISOString()
      }

      if (success) {
        logger.info('路径访问成功', logData)
      } else {
        logger.warn('路径访问被拒绝', logData)
        
        // 可疑活动检测
        if (this.config.audit.alertOnSuspicious && existing.failures > 5) {
          logger.error('检测到可疑的路径访问活动', {
            ...logData,
            totalFailures: existing.failures,
            totalAttempts: existing.count
          })
        }
      }
    }
  }

  /**
   * 合并配置
   */
  private mergeConfig(
    defaultConfig: PathSecurityConfig, 
    userConfig?: Partial<PathSecurityConfig>
  ): PathSecurityConfig {
    if (!userConfig) return defaultConfig

    return {
      whitelist: { ...defaultConfig.whitelist, ...userConfig.whitelist },
      blacklist: { ...defaultConfig.blacklist, ...userConfig.blacklist },
      accessControl: { ...defaultConfig.accessControl, ...userConfig.accessControl },
      audit: { ...defaultConfig.audit, ...userConfig.audit }
    }
  }

  // =============================================================================
  // 公共接口方法
  // =============================================================================

  /**
   * 更新安全配置
   */
  updateConfig(newConfig: Partial<PathSecurityConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig)
  }

  /**
   * 获取访问统计
   */
  getAccessStats(): {
    totalAccesses: number
    uniqueUsers: number
    failureRate: number
    topFailedPaths: Array<{ path: string; failures: number }>
  } {
    const stats = Array.from(this.accessLog.entries())
    const totalAccesses = stats.reduce((sum, [_, data]) => sum + data.count, 0)
    const totalFailures = stats.reduce((sum, [_, data]) => sum + data.failures, 0)
    const uniqueUsers = new Set(stats.map(([key, _]) => key.split(':')[0])).size

    const topFailedPaths = stats
      .filter(([_, data]) => data.failures > 0)
      .map(([key, data]) => ({ path: key.split(':')[1], failures: data.failures }))
      .sort((a, b) => b.failures - a.failures)
      .slice(0, 10)

    return {
      totalAccesses,
      uniqueUsers,
      failureRate: totalAccesses > 0 ? totalFailures / totalAccesses : 0,
      topFailedPaths
    }
  }

  /**
   * 清理访问日志
   */
  clearAccessLog(): void {
    this.accessLog.clear()
  }
}

// =============================================================================
// 默认实例和便捷函数
// =============================================================================

export const pathSecurityManager = new PathSecurityManager()

// 便捷函数
export const checkPathAccess = (request: PathAccessRequest) => 
  pathSecurityManager.checkAccess(request)

export const isPathSafe = async (path: string, operation: 'read' | 'write' | 'execute' | 'list' = 'read') => {
  const result = await pathSecurityManager.checkAccess({ path, operation })
  return result.allowed
}
