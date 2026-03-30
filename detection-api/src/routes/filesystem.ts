/**
 * 文件系统操作路由
 * 处理文件夹打开、文件浏览等操作
 * 
 * Phase 3 硬化：
 * - 使用 spawn 替代 exec（避免 shell 注入）
 * - 添加路径白名单限制（只允许访问工作区目录）
 */

import { Router, Request, Response } from 'express'
import { spawn } from 'child_process'
import { existsSync, statSync } from 'fs'
import { resolve, normalize } from 'path'
import { logger } from '../utils/logger'
import { getSystemConfigFilePath, parseSystemConfigFileSync } from '../utils/systemConfigPath.js'

const router = Router()
const TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes'])

function normalizeAbsolutePath(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    return normalize(resolve(trimmed))
  } catch {
    return null
  }
}

function parseAllowedPaths(...rawValues: Array<string | undefined>): string[] {
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
    if (!existsSync(settingsPath)) {
      return { allowedBasePaths: [] }
    }

    const stat = statSync(settingsPath)
    if (systemPathAccessSettingsCache && systemPathAccessSettingsCache.mtimeMs === stat.mtimeMs) {
      return systemPathAccessSettingsCache.data
    }

    const settings = parseSystemConfigFileSync(settingsPath)
    const pathAccess = settings?.security?.pathAccess || {}
    const rawPaths = Array.isArray(pathAccess?.allowedBasePaths) ? pathAccess.allowedBasePaths : []
    const allowedBasePaths = parseAllowedPaths(...rawPaths.map((item: unknown) => String(item)))
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
  const target = normalize(resolve(targetPath))
  const base = normalize(resolve(basePath))

  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const normalizedBase = process.platform === 'win32' ? base.toLowerCase() : base

  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(`${normalizedBase}\\`) || normalizedTarget.startsWith(`${normalizedBase}/`)
}

// ===============================================================================
// Phase 3: 路径白名单配置
// ===============================================================================

/**
 * 获取允许访问的基础路径列表
 *
 * 默认允许路径：
 *   - process.cwd()：服务启动目录（通常是项目根目录）
 *
 * 可通过以下环境变量扩展允许路径（支持逗号或分号分隔多个路径）：
 *
 *   FILESYSTEM_ALLOWED_BASE_PATHS
 *     主要配置项，推荐使用。
 *     示例：FILESYSTEM_ALLOWED_BASE_PATHS=D:\Projects;E:\Workspace
 *
 *   PATH_SECURITY_BASE_PATHS
 *     兼容旧版配置，与 FILESYSTEM_ALLOWED_BASE_PATHS 合并生效。
 *
 *   ALLOWED_PATHS
 *     最早期的兼容变量，与上述两个合并生效。
 *
 *   ALLOW_WORKSPACE_PARENT=true
 *     设为 true 时，额外允许访问 process.cwd() 的父目录。
 *     适用于多项目并排放置的场景（如 D:\Projects\portal 和 D:\Projects\backend）。
 *     默认关闭，开启需谨慎评估安全风险。
 *
 * 安全说明：
 *   所有路径均经过 normalize + resolve 规范化，防止路径穿越攻击（../）。
 *   此外 validatePathSafety() 会额外拦截系统敏感目录（System32、/etc/ 等）。
 */
function getAllowedBasePaths(): string[] {
  const systemPathAccessSettings = loadSystemPathAccessSettings()
  const defaultPaths = [
    process.cwd(), // 当前工作目录
  ]

  // 仅在显式允许时开放父目录
  if (
    TRUTHY_VALUES.has((process.env.ALLOW_WORKSPACE_PARENT || '').trim().toLowerCase()) ||
    systemPathAccessSettings.allowWorkspaceParent === true
  ) {
    defaultPaths.push(resolve(process.cwd(), '..'))
  }

  // 从环境变量读取额外允许的路径（兼容旧变量）
  const envPaths = parseAllowedPaths(
    process.env.FILESYSTEM_ALLOWED_BASE_PATHS,
    process.env.PATH_SECURITY_BASE_PATHS,
    process.env.ALLOWED_PATHS
  )

  const unique = new Set<string>()
  for (const candidate of [...defaultPaths, ...envPaths, ...systemPathAccessSettings.allowedBasePaths]) {
    const normalized = normalizeAbsolutePath(candidate)
    if (normalized) {
      unique.add(normalized)
    }
  }

  return Array.from(unique)
}

/**
 * 检查路径是否在白名单内
 */
function isPathAllowed(targetPath: string): { allowed: boolean; reason?: string } {
  const normalizedTarget = normalize(resolve(targetPath))
  const allowedPaths = getAllowedBasePaths()

  // 检查是否在允许的基础路径下
  for (const basePath of allowedPaths) {
    if (isPathWithinBase(normalizedTarget, basePath)) {
      return { allowed: true }
    }
  }

  return {
    allowed: false,
    reason: '路径不在允许访问的范围内'
  }
}

interface OpenFolderSpawnResult {
  child: ReturnType<typeof spawn>
  exitedEarly: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
}

interface OpenFolderCommandSpec {
  program: string
  args: string[]
}

function buildOpenFolderCommands(platform: NodeJS.Platform, targetPath: string): OpenFolderCommandSpec[] {
  switch (platform) {
    case 'win32':
      return [
        { program: 'explorer.exe', args: [targetPath] },
        { program: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', targetPath] }
      ]
    case 'darwin':
      return [{ program: 'open', args: [targetPath] }]
    case 'linux':
      return [{ program: 'xdg-open', args: [targetPath] }]
    default:
      return []
  }
}

async function openFolderWithFallback(commands: OpenFolderCommandSpec[]): Promise<{
  command: OpenFolderCommandSpec
  result: OpenFolderSpawnResult
}> {
  let lastError: Error | null = null

  for (const command of commands) {
    try {
      const result = await spawnOpenFolderCommand(command.program, command.args)
      return { command, result }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn('Open folder command failed, trying next fallback if available', {
        program: command.program,
        args: command.args,
        error: lastError.message
      })
    }
  }

  throw lastError ?? new Error('No open-folder command succeeded')
}

/**
 * 以“可感知失败”的方式启动系统文件管理器。
 * 仅在命令成功启动，或快速以 0 退出时判定成功。
 */
function spawnOpenFolderCommand(program: string, args: string[]): Promise<OpenFolderSpawnResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(program, args, {
      stdio: 'ignore',
      windowsHide: true
    })

    let settled = false
    let spawned = false
    let timer: NodeJS.Timeout | null = null
    let exitCode: number | null = null
    let exitSignal: NodeJS.Signals | null = null

    const resolveOnce = (value: OpenFolderSpawnResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolvePromise(value)
    }

    const rejectOnce = (error: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      rejectPromise(error)
    }

    child.once('error', (error) => {
      rejectOnce(new Error(`无法启动文件管理器命令: ${error.message}`))
    })

    child.once('spawn', () => {
      spawned = true
      // 给子进程一个短暂窗口上报快速失败
      timer = setTimeout(() => {
        resolveOnce({
          child,
          exitedEarly: false,
          exitCode,
          signal: exitSignal
        })
      }, 300)
    })

    child.once('exit', (code, signal) => {
      exitCode = code
      exitSignal = signal

      if (!spawned) return

      if (code === 0) {
        resolveOnce({
          child,
          exitedEarly: true,
          exitCode: code,
          signal
        })
        return
      }

      rejectOnce(new Error(`文件管理器命令退出异常 (code=${code ?? 'null'}, signal=${signal ?? 'null'})`))
    })
  })
}

/**
 * 在系统文件管理器中打开文件夹
 * POST /filesystem/open-folder
 * 
 * Phase 3 硬化：
 * - 使用 spawn 替代 exec（避免 shell 注入）
 * - 路径白名单检查
 */
router.post('/open-folder', async (req: Request, res: Response) => {
  try {
    const { path: inputPath } = req.body

    // 验证请求参数
    if (!inputPath || typeof inputPath !== 'string') {
      return res.status(400).json({
        success: false,
        message: '路径参数无效'
      })
    }

    // Phase 3: 标准化路径（防止路径穿越攻击）
    const normalizedPath = normalize(resolve(inputPath))

    // Phase 3: 路径白名单检查
    const pathCheck = isPathAllowed(normalizedPath)
    if (!pathCheck.allowed) {
      logger.warn('路径访问被拒绝（不在白名单内）', {
        inputPath,
        normalizedPath,
        reason: pathCheck.reason,
        userId: (req as any).auth?.userId
      })
      return res.status(403).json({
        success: false,
        message: '路径访问被拒绝',
        error: pathCheck.reason
      })
    }

    // 验证路径是否存在
    if (!existsSync(normalizedPath)) {
      return res.status(404).json({
        success: false,
        message: '指定的路径不存在'
      })
    }

    // 验证路径是否为目录
    const stats = statSync(normalizedPath)
    if (!stats.isDirectory()) {
      return res.status(400).json({
        success: false,
        message: '指定的路径不是一个目录'
      })
    }

    // Phase 3: 使用 spawn 替代 exec（避免 shell 注入）
    const platform = process.platform
    let program: string
    const commands = buildOpenFolderCommands(platform, normalizedPath)
    let args: string[]

    switch (platform) {
      case 'win32':
        // Windows: 使用 explorer 命令
        program = 'explorer'
        args = [normalizedPath]
        break
      case 'darwin':
        // macOS: 使用 open 命令
        program = 'open'
        args = [normalizedPath]
        break
      case 'linux':
        // Linux: 使用 xdg-open 命令
        program = 'xdg-open'
        args = [normalizedPath]
        break
      default:
        return res.status(500).json({
          success: false,
          message: `不支持的操作系统: ${platform}`
        })
    }

    // 仅在命令被成功触发后才返回 success，避免“假成功”
    const { command, result: spawnResult } = await openFolderWithFallback(commands)
    spawnResult.child.unref()

    logger.info('文件夹打开命令已执行', {
      path: normalizedPath,
      program: command.program,
      args: command.args,
      pid: spawnResult.child.pid,
      exitedEarly: spawnResult.exitedEarly,
      userId: (req as any).auth?.userId
    })

    res.json({
      success: true,
      message: '文件夹打开命令已执行',
      data: {
        path: normalizedPath,
        platform,
        program: command.program,
        args: command.args,
        pid: spawnResult.child.pid,
        exitedEarly: spawnResult.exitedEarly
      }
    })

  } catch (error) {
    logger.error('打开文件夹时发生错误', {
      path: req.body?.path,
      error: error instanceof Error ? error.message : String(error)
    })

    res.status(500).json({
      success: false,
      message: '打开文件夹时发生内部错误',
      error: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * 验证路径是否可以安全打开
 * POST /filesystem/validate-open-path
 * 
 * Phase 3: 增加白名单检查
 */
router.post('/validate-open-path', async (req: Request, res: Response) => {
  try {
    const { path: inputPath } = req.body

    if (!inputPath || typeof inputPath !== 'string') {
      return res.status(400).json({
        success: false,
        message: '路径参数无效'
      })
    }

    const normalizedPath = normalize(resolve(inputPath))

    // Phase 3: 白名单检查
    const pathAllowed = isPathAllowed(normalizedPath)
    const isValid = validatePathSafety(normalizedPath) && pathAllowed.allowed
    const exists = existsSync(normalizedPath)
    const isDirectory = exists ? statSync(normalizedPath).isDirectory() : false

    res.json({
      success: true,
      data: {
        path: normalizedPath,
        isValid,
        exists,
        isDirectory,
        canOpen: isValid && exists && isDirectory,
        allowedBasePaths: process.env.NODE_ENV === 'production' ? undefined : getAllowedBasePaths(),
        reason: !pathAllowed.allowed ? pathAllowed.reason : undefined
      }
    })

  } catch (error) {
    logger.error('验证路径时发生错误', {
      path: req.body?.path,
      error: error instanceof Error ? error.message : String(error)
    })

    res.status(500).json({
      success: false,
      message: '验证路径时发生内部错误'
    })
  }
})

/**
 * 验证路径安全性
 * 防止访问敏感系统目录
 */
function validatePathSafety(path: string): boolean {
  // 危险路径模式
  const dangerousPatterns = [
    /^C:\\Windows\\System32/i,
    /^C:\\Program Files\\WindowsApps/i,
    /^\/System\//,
    /^\/usr\/bin/,
    /^\/etc\//,
    /\.ssh/,
    /\.aws/,
    /password/i,
    /secret/i,
    /\.env(\..*)?$/i,
    /\0/
  ]

  // 检查是否匹配危险模式
  for (const pattern of dangerousPatterns) {
    if (pattern.test(path)) {
      return false
    }
  }

  return true
}

export default router
