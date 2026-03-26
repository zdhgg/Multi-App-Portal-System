/**
 * PM2 Routes - Process Management API
 * 
 * Handles PM2 process management endpoints
 */

import { Router, Request, Response, NextFunction } from 'express'
import { pm2Service } from '../services/pm2Service'
import { pm2DiagnosticService } from '../services/pm2DiagnosticService'
import { logger } from '../utils/logger'
import { authSecurityEnhancer } from '../core/security/AuthSecurityEnhancer'
import { pathSecurityManager } from '../core/security/PathSecurityManager'
import { webSocketManager } from '../services/websocket'
import { defaultConfigManager } from '../services/configManager'
import { existsSync } from 'fs'
import { writeFileSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { spawn, spawnSync } from 'child_process'
import { homedir } from 'os'
import { requireAuth, requireAdmin, requireOperator, auditLog } from '../middleware/authMiddleware.js'

const router = Router()
const CONFIRMATION_HEADER = 'x-confirm-action'
const DEFAULT_CONFIRMATION_TOKEN = 'CONFIRM'

interface ConfirmationRule {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: RegExp
  action: string
}

const PM2_CONFIRMATION_RULES: ConfirmationRule[] = [
  { method: 'POST', path: /^\/fix$/, action: 'pm2-fix' },
  { method: 'POST', path: /^\/enable$/, action: 'pm2-enable' },
  { method: 'POST', path: /^\/processes\/[^/]+\/start$/, action: 'pm2-start' },
  { method: 'POST', path: /^\/apps\/[^/]+\/start$/, action: 'pm2-app-start' },
  { method: 'POST', path: /^\/apps\/[^/]+\/stop$/, action: 'pm2-app-stop' },
  { method: 'POST', path: /^\/processes\/[^/]+\/stop$/, action: 'pm2-stop' },
  { method: 'POST', path: /^\/processes\/[^/]+\/restart$/, action: 'pm2-restart' },
  { method: 'DELETE', path: /^\/processes\/[^/]+$/, action: 'pm2-delete' },
  { method: 'DELETE', path: /^\/processes\/[^/]+\/logs$/, action: 'pm2-clear-logs' },
  { method: 'POST', path: /^\/config\/apply$/, action: 'pm2-config-apply' },
  { method: 'POST', path: /^\/scripts\/autofix$/, action: 'pm2-scripts-autofix' },
  { method: 'POST', path: /^\/save$/, action: 'pm2-save' },
  { method: 'POST', path: /^\/resurrect$/, action: 'pm2-resurrect' },
  { method: 'POST', path: /^\/stop-all$/, action: 'pm2-stop-all' },
  { method: 'POST', path: /^\/restart-all$/, action: 'pm2-restart-all' },
  { method: 'POST', path: /^\/delete-all$/, action: 'pm2-delete-all' },
  { method: 'POST', path: /^\/processes\/[^/]+\/auto-fix$/, action: 'pm2-auto-fix' },
  { method: 'POST', path: /^\/sync-app\/[^/]+$/, action: 'pm2-sync-app' }
]

function resolveConfirmationRule(req: Request): ConfirmationRule | null {
  const method = req.method.toUpperCase() as ConfirmationRule['method']
  const requestPath = req.path || '/'

  const rule = PM2_CONFIRMATION_RULES.find(candidate =>
    candidate.method === method && candidate.path.test(requestPath)
  )

  return rule || null
}

function requireDangerousActionConfirmation(req: Request, res: Response, next: NextFunction): void {
  const confirmationRequired = String(process.env.PM2_CONFIRMATION_REQUIRED || '').trim().toLowerCase() !== 'false'
  if (!confirmationRequired) {
    next()
    return
  }

  const rule = resolveConfirmationRule(req)
  if (!rule) {
    next()
    return
  }

  const isProduction = process.env.NODE_ENV === 'production'
  const configuredToken = String(process.env.PM2_CONFIRMATION_TOKEN || '').trim()
  const expectedToken = configuredToken || DEFAULT_CONFIRMATION_TOKEN
  const expectedDescriptor = configuredToken
    ? 'server-configured-token'
    : (isProduction ? 'missing-server-token' : DEFAULT_CONFIRMATION_TOKEN)

  // 生产环境必须配置自定义确认令牌，禁止使用默认CONFIRM。
  if (isProduction && (!configuredToken || configuredToken === DEFAULT_CONFIRMATION_TOKEN)) {
    logger.error('PM2_CONFIRMATION_TOKEN 配置不安全，已拒绝高风险操作', {
      action: rule.action,
      path: req.path,
      misconfigured: configuredToken ? 'default-token' : 'missing-token'
    })

    res.status(503).json({
      success: false,
      error: 'SECURITY_MISCONFIGURATION',
      code: 'PM2_CONFIRMATION_TOKEN_INVALID',
      message: '服务器安全配置不完整，暂时拒绝PM2高风险操作',
      details: {
        reason: 'PM2_CONFIRMATION_TOKEN must be explicitly configured in production',
        requiredHeader: 'X-Confirm-Action',
        action: rule.action
      }
    })
    return
  }

  const providedToken = String(req.headers[CONFIRMATION_HEADER] || '').trim()

  if (providedToken === expectedToken) {
    next()
    return
  }

  logger.warn('PM2高风险操作缺少确认头，已拒绝请求', {
    method: req.method,
    path: req.path,
    action: rule.action,
    userId: (req as any).auth?.userId || (req as any).user?.id || 'unknown'
  })

  res.status(428).json({
    success: false,
    error: 'CONFIRMATION_REQUIRED',
    code: 'PM2_CONFIRMATION_REQUIRED',
    message: `高风险操作 "${rule.action}" 需要二次确认`,
    details: {
      requiredHeader: 'X-Confirm-Action',
      action: rule.action,
      expected: expectedDescriptor
    }
  })
}

function isExternalExeApp(app: any): boolean {
  const tech = String(app?.techStack?.name || app?.techStack || '').trim().toLowerCase()
  return tech === 'external-exe'
}

function resolvePrimaryPort(app: any): number | null {
  const port = Number(app?.network?.primaryPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }
  return port
}

async function ensureReservedExternalExePort(port: number, appName: string, source: string): Promise<void> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return
  }

  try {
    const exists = defaultConfigManager
      .getPortConfig()
      ?.reservedPorts
      ?.some((item: any) => item?.port === port)

    if (exists) {
      return
    }

    await defaultConfigManager.addReservedPort(
      port,
      `External EXE: ${appName}`,
      'external-exe',
      source
    )

    logger.info('已自动保留 external-exe 端口', { appName, port, source })
  } catch (error: any) {
    const message = error?.message || String(error)
    if (message.includes('已被保留') || message.toLowerCase().includes('already')) {
      return
    }
    logger.warn('自动保留 external-exe 端口失败（忽略）', { appName, port, source, error: message })
  }
}

function normalizeComparableName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
}

function normalizeComparablePath(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+/g, '\\')
    .replace(/[\\]+$/, '')
    .toLowerCase()
}

function getScriptDirectory(scriptPath?: string | null): string | null {
  const trimmedPath = String(scriptPath || '').trim()
  if (!trimmedPath) {
    return null
  }

  try {
    return dirname(trimmedPath)
  } catch {
    return null
  }
}

function processPathMatchesAppDirectory(
  appDirectory: string | null | undefined,
  processCwd?: string | null,
  processScript?: string | null
): boolean {
  const normalizedAppDirectory = normalizeComparablePath(appDirectory)
  if (!normalizedAppDirectory) {
    return false
  }

  const candidates = [processCwd, getScriptDirectory(processScript)]
    .map(candidate => normalizeComparablePath(candidate))
    .filter(Boolean)

  return candidates.some(candidate =>
    candidate === normalizedAppDirectory ||
    candidate.startsWith(`${normalizedAppDirectory}\\`)
  )
}

function findManagedAppForPm2Process(
  apps: any[],
  processName: string,
  processCwd?: string | null,
  processScript?: string | null
): any | null {
  const normalizedProcessName = normalizeComparableName(processName)

  const rankApp = (app: any): number => {
    let score = 0
    const candidateNames = [
      app?.pm2ProcessName,
      app?.name,
      typeof app?.name === 'string' ? app.name.toLowerCase().replace(/\s+/g, '-') : ''
    ]

    if (candidateNames.some(candidate => normalizeComparableName(candidate) === normalizedProcessName)) {
      score += 300
    }

    if (processPathMatchesAppDirectory(app?.directory, processCwd, processScript)) {
      score += 100
    }

    return score
  }

  const rankedApps = apps
    .map((app: any) => ({ app, score: rankApp(app) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return rankedApps[0]?.app || null
}

function findPm2ProcessForApp(app: any, processes: any[]): any | null {
  const candidateNames = [
    app?.pm2ProcessName,
    app?.name,
    typeof app?.name === 'string' ? app.name.toLowerCase().replace(/\s+/g, '-') : ''
  ]

  const rankProcess = (processInfo: any): number => {
    const processName = String(processInfo?.name || '')
    let score = 0

    const matchesConfiguredProcessName = normalizeComparableName(app?.pm2ProcessName) !== '' &&
      normalizeComparableName(app?.pm2ProcessName) === normalizeComparableName(processName)
    const matchesAppName = candidateNames.some(candidate =>
      normalizeComparableName(candidate) !== '' &&
      normalizeComparableName(candidate) === normalizeComparableName(processName)
    )

    if (matchesConfiguredProcessName) score += 300
    else if (matchesAppName) score += 200

    if (processPathMatchesAppDirectory(app?.directory, processInfo?.cwd, processInfo?.script)) {
      score += 100
    }

    if (score <= 0) {
      return 0
    }

    const status = String(processInfo?.status || '').toLowerCase()
    if (status === 'online') score += 1000
    else if (status === 'launching' || status === 'stopping') score += 500

    return score
  }

  const rankedProcesses = processes
    .map((processInfo: any) => ({ processInfo, score: rankProcess(processInfo) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)

  return rankedProcesses[0]?.processInfo || null
}

async function syncStoppedApplicationState(applicationService: any, app: any): Promise<void> {
  if (!applicationService || !app?.id) {
    return
  }

  const repository = applicationService.repository
  if (repository?.updateState) {
    await repository.updateState(app.id, 'stopped')
    logger.info('应用状态已更新为stopped', { appId: app.id, appName: app.name })
  }

  if (repository?.updateDeploymentMode) {
    await repository.updateDeploymentMode(app.id, 'unknown')
    logger.info('应用部署模式已更新为unknown', { appId: app.id, appName: app.name })
  }

  if (applicationService.setPM2ProcessName) {
    await applicationService.setPM2ProcessName(app.id, null)
  } else if (typeof repository?.updatePM2ProcessName === 'function') {
    await repository.updatePM2ProcessName(app.id, null)
  }

  try {
    const wsManager = webSocketManager
    if (wsManager) {
      wsManager.broadcast({
        type: 'app_status_changed',
        payload: {
          appId: app.id,
          appName: app.name,
          state: 'stopped',
          deploymentMode: 'unknown',
          isRunning: false,
          timestamp: new Date().toISOString()
        }
      })
      logger.info('已广播应用停止WebSocket消息', {
        appId: app.id,
        appName: app.name
      })
    }
  } catch (wsError) {
    logger.warn('广播WebSocket消息失败，但不影响PM2停止', {
      appId: app.id,
      error: wsError instanceof Error ? wsError.message : String(wsError)
    })
  }
}

// ===============================================================================
// PM2 路由权限控制 (Phase 1 RBAC)
// 权限矩阵：
// - GET 类（只读）: operator + admin 可访问
// - POST/DELETE 类（写操作）: 仅 admin 可访问
// ===============================================================================

// 基础认证 - 所有PM2路由都需要登录
router.use(requireAuth)

// 高风险写操作二次确认
router.use(requireDangerousActionConfirmation)

/**
 * POST /api/pm2/diagnose
 * 诊断 PM2 问题 - 仅admin
 */
router.post('/diagnose', requireAdmin, auditLog('pm2-diagnose'), async (req, res) => {
  try {
    const isWindows = process.platform === 'win32'
    const pm2Enabled = process.env.PM2_ENABLED === '1'

    const diagnosis = {
      platform: process.platform,
      isWindows,
      pm2Enabled,
      issues: [] as Array<{
        type: string
        severity: 'low' | 'medium' | 'high' | 'critical'
        message: string
        solution: string
      }>,
      canAutoFix: false
    }

    // 检查 PM2 是否启用
    if (!pm2Enabled) {
      diagnosis.issues.push({
        type: 'PM2_DISABLED',
        severity: 'medium',
        message: 'PM2 功能未启用',
        solution: '在环境变量中设置 PM2_ENABLED=1'
      })
    }

    // 检查 PM2 守护进程
    if (pm2Enabled) {
      try {
        await pm2Service.connect()
        await pm2Service.disconnect()
      } catch (error: any) {
        // 检查是否是权限问题（更全面的检测）
        const isPermissionError =
          error.code === 'EPERM' ||
          error.message?.toLowerCase().includes('eperm') ||
          error.message?.toLowerCase().includes('permission') ||
          error.message?.toLowerCase().includes('access denied')

        if (isPermissionError && isWindows) {
          diagnosis.issues.push({
            type: 'PM2_WINDOWS_PERMISSION',
            severity: 'critical',
            message: 'PM2 在 Windows 上遇到权限问题',
            solution: '需要以管理员身份运行或重置 PM2'
          })
          diagnosis.canAutoFix = true
        } else {
          diagnosis.issues.push({
            type: 'PM2_CONNECTION_ERROR',
            severity: 'high',
            message: `PM2 连接失败: ${error.message}`,
            solution: '尝试重启 PM2 守护进程'
          })
          diagnosis.canAutoFix = true
        }
      }
    }

    res.json({
      success: true,
      data: diagnosis,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('PM2 诊断失败:', error)
    res.status(500).json({
      success: false,
      error: 'PM2 诊断失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/fix
 * 自动修复 PM2 问题 - 仅admin
 */
router.post('/fix', requireAdmin, auditLog('pm2-fix'), async (req, res) => {
  try {
    const { issueType } = req.body
    const isWindows = process.platform === 'win32'

    logger.info('开始修复 PM2 问题', { issueType, platform: process.platform })

    let fixResult = {
      success: false,
      message: '',
      steps: [] as string[]
    }

    if (issueType === 'PM2_WINDOWS_PERMISSION' || issueType === 'PM2_CONNECTION_ERROR') {
      // 尝试重置 PM2
      fixResult.steps.push('正在终止 PM2 守护进程...')

      try {
        // 使用 child_process 执行 pm2 kill
        await new Promise<void>((resolve, reject) => {
          const killProcess = spawn(isWindows ? 'pm2.cmd' : 'pm2', ['kill'], {
            shell: true,
            windowsHide: true,
            stdio: 'pipe'
          })

          let stdout = ''
          let stderr = ''

          killProcess.stdout?.on('data', (data) => {
            stdout += data.toString()
          })

          killProcess.stderr?.on('data', (data) => {
            stderr += data.toString()
          })

          killProcess.on('close', (code) => {
            fixResult.steps.push(`PM2 kill 执行完成 (退出码: ${code})`)

            // 添加命令输出到步骤中
            if (stdout.trim()) {
              fixResult.steps.push(`输出: ${stdout.trim()}`)
            }
            if (stderr.trim()) {
              fixResult.steps.push(`错误: ${stderr.trim()}`)

              // 检测权限问题
              if (stderr.toLowerCase().includes('eperm') ||
                  stderr.toLowerCase().includes('permission') ||
                  stderr.toLowerCase().includes('access denied')) {
                fixResult.steps.push('⚠️ 检测到权限问题！后端服务需要管理员权限才能修复 PM2')
              }
            }

            // 即使失败也继续，因为可能 PM2 本来就没运行
            resolve()
          })

          killProcess.on('error', (error) => {
            fixResult.steps.push(`PM2 kill 出错: ${error.message}`)

            // 检测权限问题
            if (error.message.toLowerCase().includes('eperm') ||
                error.message.toLowerCase().includes('permission')) {
              fixResult.steps.push('⚠️ 检测到权限问题！后端服务需要管理员权限才能修复 PM2')
            }

            resolve() // 继续执行
          })

          // 5秒超时
          setTimeout(() => {
            killProcess.kill()
            fixResult.steps.push('PM2 kill 命令超时')
            resolve()
          }, 5000)
        })

        // 等待一下让进程完全终止
        await new Promise(resolve => setTimeout(resolve, 2000))

        fixResult.steps.push('正在重新初始化 PM2...')

        // 尝试 ping PM2 来重新启动守护进程
        await new Promise<void>((resolve, reject) => {
          const pingProcess = spawn(isWindows ? 'pm2.cmd' : 'pm2', ['ping'], {
            shell: true,
            windowsHide: true,
            stdio: 'pipe'
          })

          let stdout = ''
          let stderr = ''

          pingProcess.stdout?.on('data', (data) => {
            stdout += data.toString()
          })

          pingProcess.stderr?.on('data', (data) => {
            stderr += data.toString()
          })

          pingProcess.on('close', (code) => {
            // 添加命令输出到步骤中
            if (stdout.trim()) {
              fixResult.steps.push(`输出: ${stdout.trim()}`)
            }
            if (stderr.trim()) {
              fixResult.steps.push(`错误: ${stderr.trim()}`)

              // 检测权限问题
              if (stderr.toLowerCase().includes('eperm') ||
                  stderr.toLowerCase().includes('permission') ||
                  stderr.toLowerCase().includes('access denied')) {
                fixResult.steps.push('⚠️ 检测到权限问题！后端服务需要管理员权限才能修复 PM2')
              }
            }

            if (code === 0) {
              fixResult.steps.push('✅ PM2 守护进程重新启动成功')
              fixResult.success = true
              fixResult.message = 'PM2 已成功修复'
            } else {
              fixResult.steps.push(`❌ PM2 ping 失败 (退出码: ${code})`)

              // 根据是否检测到权限问题提供不同的提示
              const hasPermissionIssue = stderr.toLowerCase().includes('eperm') ||
                                        stderr.toLowerCase().includes('permission') ||
                                        stderr.toLowerCase().includes('access denied')

              if (hasPermissionIssue) {
                fixResult.message = 'PM2 修复失败：后端服务缺少管理员权限。请以管理员身份重启后端服务，或使用手动修复方案'
              } else {
                fixResult.message = 'PM2 修复失败，请尝试手动修复方案'
              }
            }
            resolve()
          })

          pingProcess.on('error', (error) => {
            fixResult.steps.push(`PM2 ping 出错: ${error.message}`)

            // 检测权限问题
            if (error.message.toLowerCase().includes('eperm') ||
                error.message.toLowerCase().includes('permission')) {
              fixResult.steps.push('⚠️ 检测到权限问题！后端服务需要管理员权限才能修复 PM2')
              fixResult.message = 'PM2 修复失败：后端服务缺少管理员权限'
            } else {
              fixResult.message = 'PM2 修复失败'
            }

            resolve()
          })

          // 10秒超时
          setTimeout(() => {
            pingProcess.kill()
            fixResult.steps.push('PM2 ping 命令超时')
            fixResult.message = 'PM2 ping 超时，请尝试手动修复'
            resolve()
          }, 10000)
        })

      } catch (error) {
        fixResult.steps.push(`修复过程出错: ${error instanceof Error ? error.message : String(error)}`)
        fixResult.message = '修复失败'
      }
    } else {
      fixResult.message = '不支持的问题类型'
    }

    res.json({
      success: fixResult.success,
      data: fixResult,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('PM2 修复失败:', error)
    res.status(500).json({
      success: false,
      error: 'PM2 修复失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * GET /api/pm2/status
 * 检测PM2集成状态 - operator可读
 */
router.get('/status', requireOperator, async (req, res) => {
  try {
    const envPath = join(process.cwd(), '.env')
    const envFileExists = existsSync(envPath)
    const pm2Enabled = process.env.PM2_ENABLED === '1'
    const isWindows = process.platform === 'win32'
    
    // 调试日志
    logger.debug('PM2 status check', {
      pm2Enabled,
      PM2_ENABLED_raw: process.env.PM2_ENABLED,
      cwd: process.cwd(),
      envPath,
      envFileExists
    })
    
    // 检查.env文件中是否设置了PM2_ENABLED
    let envFileHasPM2Config = false
    if (envFileExists) {
      try {
        const envContent = readFileSync(envPath, 'utf8')
        envFileHasPM2Config = /PM2_ENABLED\s*=\s*1/.test(envContent)
      } catch (e) {
        logger.warn('读取.env文件失败', { error: e instanceof Error ? e.message : String(e) })
      }
    }
    
    // 检查PM2守护进程是否运行（与环境变量无关，直接使用 pm2 ping 检测）
    let pm2DaemonRunning = false
    try {
      const pm2Binary = isWindows ? 'pm2.cmd' : 'pm2'
      const pingResult = spawnSync(pm2Binary, ['ping'], { shell: true, windowsHide: true, encoding: 'utf-8' })
      const pingOutput = (pingResult.stdout || '').toString()
      pm2DaemonRunning = pingResult.status === 0 && /pong/i.test(pingOutput)
    } catch {
      pm2DaemonRunning = false
    }
    // 兼容计算：只要 PM2 守护进程可达，也视为已启用
    const enabled = pm2Enabled || pm2DaemonRunning

    res.json({
      success: true,
      data: {
        enabled,
        platform: process.platform,
        isWindows,
        envFileExists,
        envFileHasPM2Config,
        pm2DaemonRunning,
        needsRestart: envFileHasPM2Config && !pm2Enabled,
        needsConfig: !envFileHasPM2Config,
        restartCommand: isWindows 
          ? '.\\scripts\\utilities\\restart-backend-with-pm2.ps1'
          : 'npm run dev',
        configPath: envPath
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('检测PM2状态失败:', error)
    res.status(500).json({
      success: false,
      error: '检测PM2状态失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/enable
 * 启用PM2集成（创建/更新.env文件） - 仅admin
 */
router.post('/enable', requireAdmin, auditLog('pm2-enable'), async (req, res) => {
  try {
    const envPath = join(process.cwd(), '.env')
    
    let envContent = ''
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf8')
    }
    
    if (/PM2_ENABLED\s*=/.test(envContent)) {
      envContent = envContent.replace(/PM2_ENABLED\s*=\s*\d/, 'PM2_ENABLED=1')
      logger.info('更新现有PM2_ENABLED配置')
    } else {
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n'
      }
      envContent += '\n# PM2集成 - 启用后可通过门户管理其他应用\nPM2_ENABLED=1\n'
      logger.info('添加PM2_ENABLED配置到.env文件')
    }
    
    writeFileSync(envPath, envContent, 'utf8')

    const pm2Home = process.env.PM2_HOME || join(homedir(), '.pm2')
    const pm2HomeExists = existsSync(pm2Home)
    const pm2Binary = process.platform === 'win32' ? 'pm2.cmd' : 'pm2'

    let daemonRunning = false
    let pingOutput = ''
    let pingError: string | null = null

    try {
      const pingResult = spawnSync(pm2Binary, ['ping'], { shell: true, windowsHide: true, encoding: 'utf-8' })
      pingOutput = (pingResult.stdout || '').trim()
      if (pingResult.status === 0 && pingOutput.includes('pong')) {
        daemonRunning = true
      } else {
        const possibleError = (pingResult.stderr || pingOutput || '').trim()
        pingError = possibleError.length > 0 ? possibleError : null
      }
    } catch (err) {
      pingError = err instanceof Error ? err.message : String(err)
    }

    const guidance: string[] = []
    if (!daemonRunning) {
      guidance.push('运行 pm2 ping 确认守护进程已启动，如果失败请按以下步骤操作。')
    }
    if (process.platform === 'win32') {
      guidance.push('以管理员身份打开 PowerShell 执行：pm2 startup windows --service-name pm2-portal')
      guidance.push('执行：pm2 save 保存当前进程列表，保证重启后自动恢复。')
    } else {
      guidance.push('执行：pm2 startup && pm2 save 注册 PM2 守护进程并保存进程列表。')
    }

    logger.info('PM2配置已更新', { envPath, pm2Home, pm2HomeExists, daemonRunning, pingError })
    
    res.json({
      success: true,
      message: 'PM2配置已更新，如当前后端正在运行请重新启动后生效。',
      data: {
        envPath,
        pm2Home,
        pm2HomeExists,
        pm2Binary,
        daemonRunning,
        pingOutput,
        pingError,
        guidance,
        needsRestart: true,
        restartCommand: process.platform === 'win32'
          ? 'npm run dev'
          : 'npm run dev'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('启用PM2配置失败:', error)
    res.status(500).json({
      success: false,
      error: '启用PM2配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * GET /api/pm2/processes
 * 获取PM2进程列表 - operator可读
 */
router.get('/processes', requireOperator, async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 and ensure pm2 daemon is running if you need this feature'
      })
    }
    const processes = await pm2Service.getProcessList()
    res.json({
      success: true,
      data: processes,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('获取PM2进程列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取PM2进程列表失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * GET /api/pm2/stats
 * 获取PM2统计信息 - operator可读
 */
router.get('/stats', requireOperator, async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 and ensure pm2 daemon is running if you need this feature'
      })
    }
    const stats = await pm2Service.getStats()
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('获取PM2统计信息失败:', error)
    res.status(500).json({
      success: false,
      error: '获取PM2统计信息失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/processes/:name/start
 * 启动PM2进程 - 仅admin
 */
router.post('/processes/:name/start', requireAdmin, auditLog('pm2-start'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }
    const { name } = req.params
    logger.info(`尝试启动PM2进程: ${name}`)
    
    try {
      await pm2Service.startProcess(name)
      logger.info(`PM2进程 ${name} 启动成功`)
    } catch (startError: any) {
      logger.error(`PM2进程 ${name} 启动失败:`, {
        error: startError.message,
        stack: startError.stack
      })
      
      // 返回更详细的错误信息
      return res.status(500).json({
        success: false,
        error: '启动PM2进程失败',
        message: startError.message || '未知错误',
        details: {
          processName: name,
          errorType: startError.name,
          suggestion: '建议使用"一键智能诊断"功能查看详细错误信息和解决方案'
        }
      })
    }
    
    res.json({
      success: true,
      message: `进程 ${name} 启动成功`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('启动PM2进程失败:', error)

    // 特殊处理 PM2 Windows 权限错误
    if (error instanceof Error && error.name === 'PM2WindowsPermissionError') {
      return res.status(503).json({
        success: false,
        error: 'PM2 Windows 权限问题',
        message: error.message,
        errorType: 'PM2_PERMISSION_ERROR',
        details: {
          processName: req.params.name,
          platform: 'Windows',
          suggestions: [
            '以管理员身份重新启动应用',
            '或者使用直接启动模式（不使用 PM2）',
            '检查防病毒软件设置'
          ]
        }
      })
    }

    res.status(500).json({
      success: false,
      error: '启动PM2进程失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/apps/:appId/start
 * 通过应用ID启动PM2进程（自动创建配置） - 仅admin
 */
router.post('/apps/:appId/start', requireAdmin, auditLog('pm2-app-start'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }
    const { appId } = req.params
    const bodyConfig = (req.body && typeof req.body === 'object') ? (req.body as any).config : undefined

    // 该接口语义：以“生产模式”启动应用（同时会更新 deploymentMode=production）。
    // 因此默认启用 env_production，让 PM2 配置生成走生产脚本选择与生产环境变量准备流程。
    const config: any = (bodyConfig && typeof bodyConfig === 'object') ? { ...bodyConfig } : {}
    config.env_production = {
      ...(config.env_production || {}),
      NODE_ENV: 'production'
    }

    // 尝试从应用服务获取应用信息
    const applicationService = (pm2Service as any).applicationService
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: '应用服务未初始化',
        message: '无法获取应用信息'
      })
    }

    // 查找应用
    let app
    try {
      app = await applicationService.findById(appId)
    } catch (error) {
      // 如果按ID找不到，尝试按名称查找
      const apps = await applicationService.findAll()
      app = apps.find((a: any) =>
        a.name.toLowerCase().replace(/\s+/g, '-') === appId ||
        a.name === appId
      )

      if (!app) {
        return res.status(404).json({
          success: false,
          error: '应用不存在',
          message: `未找到ID或名称为 "${appId}" 的应用`
        })
      }
    }

    // 🔍 全栈应用检测
    const { fullstackDetector } = await import('../services/fullstackDetector')
    let fullstackInfo = null
    
    if (app.directory) {
      try {
        logger.info('🔍 开始全栈应用检测', {
          appName: app.name,
          directory: app.directory,
          directoryLength: app.directory.length,
          lastChar: app.directory.charCodeAt(app.directory.length - 1)
        })
        const detection = await fullstackDetector.detect(app.directory)
        const advice = fullstackDetector.getStartupModeAdvice(detection)
        fullstackInfo = { detection, advice }
        logger.info('✅ 全栈应用检测完成', {
          appName: app.name,
          isFullStack: detection.isFullStack,
          frontendBuilt: detection.frontendBuilt,
          frontendDistPath: detection.frontendDistPath,
          deploymentMode: detection.deploymentMode
        })
        
        // 如果是全栈应用且不建议生产模式，返回警告
        if (detection.isFullStack && !advice.canUseProduction) {
          logger.warn('全栈应用启动警告', {
            appName: app.name,
            deploymentMode: detection.deploymentMode,
            frontendBuilt: detection.frontendBuilt,
            advice: advice.message
          })
          
          // 返回警告信息，但允许继续启动（用户可能知道自己在做什么）
          return res.status(400).json({
            success: false,
            code: 'FULLSTACK_DEPLOYMENT_WARNING',  // 🔧 修复：使用 code 字段而不是 error
            message: advice.message,
            details: {
              isFullStack: detection.isFullStack,
              deploymentMode: detection.deploymentMode,
              frontendBuilt: detection.frontendBuilt,
              hasBackend: detection.hasBackend,
              hasFrontend: detection.hasFrontend,
              warnings: detection.warnings,
              recommendations: detection.recommendations,
              adviceDetails: advice.details,
              // 🔍 调试信息
              _debug: {
                appDirectory: app.directory,
                frontendPath: detection.frontendPath,
                frontendDistPath: detection.frontendDistPath,
                backendPath: detection.backendPath
              }
            },
            timestamp: new Date().toISOString()
          })
        }
        
        // 记录检测信息
        if (detection.isFullStack) {
          logger.info('全栈应用检测通过', {
            appName: app.name,
            deploymentMode: detection.deploymentMode,
            frontendBuilt: detection.frontendBuilt
          })
        }
      } catch (detectionError) {
        logger.error('全栈应用检测失败，继续启动', {
          appName: app.name,
          error: detectionError
        })
      }
    }

    let pm2Config
    if (config && typeof (config as any).script === 'string' && (config as any).script.trim()) {
      pm2Config = await pm2Service.generateConfig([{ name: app.name, script: (config as any).script }], config)
    } else {
      pm2Config = await pm2Service.generateConfig([app.id], config)
    }

    if (pm2Config.apps.length === 0) {
      return res.status(400).json({
        success: false,
        error: '配置生成失败',
        message: '无法为该应用生成有效的PM2配置'
      })
    }

    // 🚀 使用配置启动进程（包含启动验证）
    logger.info('开始通过PM2启动应用...', { appId: app.id, appName: app.name })
    
    const startupWarnings: string[] = []
    let externalExePortInspection: any = null

    try {
      // 启动并验证进程
      await pm2Service.startWithConfig(pm2Config.apps[0])

      const repository = (applicationService as any).repository

      // external-exe 端口校验与自动同步
      if (isExternalExeApp(app)) {
        const expectedPort = resolvePrimaryPort(app)

        if (expectedPort) {
          await ensureReservedExternalExePort(expectedPort, app.name, 'pm2-start-expected')
        }

        externalExePortInspection = await pm2Service.inspectExternalExePort(
          pm2Config.apps[0].name,
          expectedPort || undefined,
          pm2Config.apps[0].script
        )

        if (!externalExePortInspection.ok && externalExePortInspection.actualPort === null) {
          throw new Error(
            `External EXE 进程已启动，但未检测到监听端口（进程: ${pm2Config.apps[0].name}, PID: ${externalExePortInspection.pid || 'unknown'}）`
          )
        }

        if (
          typeof externalExePortInspection.actualPort === 'number' &&
          expectedPort &&
          externalExePortInspection.actualPort !== expectedPort
        ) {
          if (typeof (applicationService as any).updateNetworkPorts === 'function') {
            await (applicationService as any).updateNetworkPorts(
              app.id,
              externalExePortInspection.actualPort,
              app.network?.secondaryPorts || []
            )
            await ensureReservedExternalExePort(
              externalExePortInspection.actualPort,
              app.name,
              'pm2-start-auto-sync'
            )

            startupWarnings.push(
              `检测到应用实际监听端口为 ${externalExePortInspection.actualPort}，已自动同步门户访问端口（原端口 ${expectedPort}）。`
            )

            logger.warn('external-exe 端口不一致，已自动同步', {
              appId: app.id,
              appName: app.name,
              expectedPort,
              actualPort: externalExePortInspection.actualPort,
              listeningPorts: externalExePortInspection.listeningPorts
            })

            app = await applicationService.findById(app.id)
          } else {
            logger.warn('applicationService.updateNetworkPorts 不可用，跳过 external-exe 自动同步', {
              appId: app.id,
              expectedPort,
              actualPort: externalExePortInspection.actualPort
            })
          }
        }
      }

      // ✅ 只有启动验证成功后，才更新数据库状态
      logger.info('PM2进程启动验证成功，更新数据库状态...', { appId: app.id, appName: app.name })

      if (repository && repository.updateState) {
        await repository.updateState(app.id, 'running')
        logger.info('应用状态已更新为running', { appId: app.id, appName: app.name })
      }
      
      // ✨ 更新部署模式为生产模式
      if (repository && repository.updateDeploymentMode) {
        await repository.updateDeploymentMode(app.id, 'production')
        logger.info('应用部署模式已更新为production', { appId: app.id, appName: app.name })
      }

      if (applicationService.setPM2ProcessName) {
        await applicationService.setPM2ProcessName(app.id, pm2Config.apps[0].name)
      } else if (repository && typeof repository.updatePM2ProcessName === 'function') {
        await repository.updatePM2ProcessName(app.id, pm2Config.apps[0].name)
      }

      // 🔔 广播WebSocket消息通知所有客户端（Portal页面）应用状态已更新
      try {
        const wsManager = webSocketManager
        if (wsManager) {
          // 获取更新后的完整应用信息
          const updatedApp = await applicationService.getById(app.id)
          if (updatedApp) {
            wsManager.broadcast({
              type: 'app_status_changed',
              payload: {
                appId: updatedApp.id,
                appName: updatedApp.name,
                state: 'running',
                deploymentMode: 'production',
                isRunning: true,
                timestamp: new Date().toISOString()
              }
            })
            logger.info('已广播应用状态更新WebSocket消息', { 
              appId: app.id, 
              appName: app.name,
              deploymentMode: 'production'
            })
          }
        }
      } catch (wsError) {
        logger.warn('广播WebSocket消息失败，但不影响PM2启动', {
          appId: app.id,
          error: wsError instanceof Error ? wsError.message : String(wsError)
        })
      }
      
      // 返回成功响应
      res.json({
        success: true,
        message: `应用 ${app.name} 已成功通过PM2启动并运行`,
        data: {
          appId: app.id,
          appName: app.name,
          pm2ProcessName: pm2Config.apps[0].name,
          config: pm2Config.apps[0],
          state: 'running',
          deploymentMode: 'production',
          warnings: startupWarnings,
          externalExePortInspection
        },
        timestamp: new Date().toISOString()
      })
      
    } catch (startError) {
      // ❌ PM2启动或验证失败，确保数据库状态为stopped
      logger.error('PM2启动失败，回滚数据库状态', { 
        appId: app.id, 
        appName: app.name,
        error: startError instanceof Error ? startError.message : String(startError)
      })
      
      try {
        const repository = (applicationService as any).repository
        if (repository && repository.updateState) {
          await repository.updateState(app.id, 'stopped')
          logger.info('已回滚应用状态为stopped', { appId: app.id })
        }
        if (repository && repository.updateDeploymentMode) {
          await repository.updateDeploymentMode(app.id, 'unknown')
          logger.info('已回滚部署模式为unknown', { appId: app.id })
        }
        if (applicationService.setPM2ProcessName) {
          await applicationService.setPM2ProcessName(app.id, null)
        } else if (repository && typeof repository.updatePM2ProcessName === 'function') {
          await repository.updatePM2ProcessName(app.id, null)
        }
      } catch (rollbackError) {
        logger.error('回滚数据库状态失败', {
          appId: app.id,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        })
      }
      
      // 重新抛出错误，让外层catch捕获
      throw startError
    }
  } catch (error) {
    logger.error('通过应用ID启动PM2进程失败:', {
      appId: req.params.appId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      config: req.body.config
    })

    // 特殊处理 PM2 Windows 权限错误
    if (error instanceof Error && error.name === 'PM2WindowsPermissionError') {
      res.status(503).json({
        success: false,
        error: 'PM2 Windows 权限问题',
        message: error.message,
        details: {
          appId: req.params.appId,
          platform: 'Windows',
          errorType: 'PM2_PERMISSION_ERROR',
          suggestions: [
            '以管理员身份重新启动应用',
            '或者使用直接启动模式（不使用 PM2）',
            '检查防病毒软件设置'
          ]
        }
      })
    } else if (error instanceof Error && error.message.includes('环境配置验证失败')) {
      // 特殊处理环境变量验证错误
      const errorLines = error.message.split('\n')
      const issues = errorLines.filter(line => line.startsWith('-')).map(line => line.substring(2))
      const suggestions = errorLines.find(line => line.startsWith('建议：'))?.replace('建议：', '').split('; ') || []

      res.status(400).json({
        success: false,
        error: '环境配置验证失败',
        code: 'ENV_VALIDATION_FAILED',
        message: '应用的环境变量配置不完整或不安全',
        details: {
          appId: req.params.appId,
          errorType: 'ENV_VALIDATION_ERROR',
          issues,
          suggestions: [
            ...suggestions,
            '大多数环境变量问题可以自动修复',
            '建议使用"配置预览"功能查看和编辑配置'
          ],
          autoFixable: error.message.includes('无法自动修复') ? false : true
        }
      })
    } else {
      res.status(500).json({
        success: false,
        error: '启动PM2进程失败',
        message: error instanceof Error ? error.message : '未知错误',
        details: {
          appId: req.params.appId,
          suggestion: '请查看后端日志获取详细错误信息'
        }
      })
    }
  }
})

/**
 * POST /api/pm2/apps/:appId/stop
 * 通过应用ID停止PM2进程 - 仅admin
 */
router.post('/apps/:appId/stop', requireAdmin, auditLog('pm2-app-stop'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }

    const { appId } = req.params
    const applicationService = (pm2Service as any).applicationService
    if (!applicationService) {
      return res.status(500).json({
        success: false,
        error: '应用服务未初始化',
        message: '无法获取应用信息'
      })
    }

    let app
    try {
      app = await applicationService.findById(appId)
    } catch {
      const apps = await applicationService.findAll()
      app = apps.find((candidate: any) => candidate?.id === appId || candidate?.name === appId)
    }

    if (!app) {
      return res.status(404).json({
        success: false,
        error: '应用不存在',
        message: `未找到ID或名称为 "${appId}" 的应用`
      })
    }

    const processes = await pm2Service.getProcessList()
    const matchedProcess = findPm2ProcessForApp(app, processes)
    const targetProcessName = matchedProcess?.name || app.pm2ProcessName

    if (!targetProcessName) {
      return res.status(404).json({
        success: false,
        error: '未找到对应PM2进程',
        message: `应用 ${app.name} 当前没有可识别的 PM2 进程`
      })
    }

    await pm2Service.stopProcess(targetProcessName)
    await syncStoppedApplicationState(applicationService, app)

    res.json({
      success: true,
      message: `应用 ${app.name} 已停止`,
      data: {
        appId: app.id,
        appName: app.name,
        processName: targetProcessName
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('按应用停止PM2进程失败:', error)
    res.status(500).json({
      success: false,
      error: '按应用停止PM2进程失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/processes/:name/stop
 * 停止PM2进程 - 仅admin
 */
router.post('/processes/:name/stop', requireAdmin, auditLog('pm2-stop'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }
    const { name } = req.params
    const processesBeforeStop = await pm2Service.getProcessList()
    const targetProcess = processesBeforeStop.find(processInfo => processInfo.name === name) || null
    await pm2Service.stopProcess(name)

    // 🔧 更新应用状态到数据库（修复状态同步问题）
    try {
      const applicationService = (pm2Service as any).applicationService
      if (applicationService) {
        const apps = await applicationService.findAll()
        const app = findManagedAppForPm2Process(
          apps as any[],
          name,
          targetProcess?.cwd,
          targetProcess?.script
        )

        if (app && app.id) {
          await syncStoppedApplicationState(applicationService, app)
        }
      }
    } catch (stateError) {
      logger.warn('更新应用状态失败，但PM2进程已停止', { 
        processName: name,
        error: stateError instanceof Error ? stateError.message : String(stateError)
      })
    }

    res.json({
      success: true,
      message: `进程 ${name} 停止成功`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('停止PM2进程失败:', error)
    res.status(500).json({
      success: false,
      error: '停止PM2进程失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/processes/:name/restart
 * 重启PM2进程 - 仅admin
 */
router.post('/processes/:name/restart', requireAdmin, auditLog('pm2-restart'), async (req, res) => {
  try {
    const { name } = req.params
    await pm2Service.restartProcess(name)
    res.json({
      success: true,
      message: `进程 ${name} 重启成功`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('重启PM2进程失败:', error)
    res.status(500).json({
      success: false,
      error: '重启PM2进程失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * DELETE /api/pm2/processes/:name
 * 删除PM2进程 - 仅admin
 */
router.delete('/processes/:name', requireAdmin, auditLog('pm2-delete'), async (req, res) => {
  try {
    const { name } = req.params
    await pm2Service.deleteProcess(name)
    res.json({
      success: true,
      message: `进程 ${name} 删除成功`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('删除PM2进程失败:', error)
    res.status(500).json({
      success: false,
      error: '删除PM2进程失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * GET /api/pm2/processes/:name/logs
 * 获取进程日志 - operator可读
 */
router.get('/processes/:name/logs', requireOperator, async (req, res) => {
  try {
    const { name } = req.params
    const { lines = 100, type = 'combined' } = req.query
    const t = (typeof type === 'string' ? type : 'combined') as 'out' | 'error' | 'combined'
    const logs = await pm2Service.getProcessLogsAdvanced(name, Number(lines), t)
    
    res.json({
      success: true,
      data: {
        logs,
        type,
        lines: Number(lines),
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('获取进程日志失败:', error)
    res.status(500).json({
      success: false,
      error: '获取进程日志失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * DELETE /api/pm2/processes/:name/logs
 * 清空进程日志 - 仅admin
 */
router.delete('/processes/:name/logs', requireAdmin, auditLog('pm2-clear-logs'), async (req, res) => {
  try {
    const { name } = req.params
    await pm2Service.clearProcessLogs(name)
    res.json({
      success: true,
      message: `进程 ${name} 日志清空成功`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('清空进程日志失败:', error)
    res.status(500).json({
      success: false,
      error: '清空进程日志失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/config/generate
 * 生成PM2配置 - operator可读（预览生成）
 */
router.post('/config/generate', requireOperator, async (req, res) => {
  try {
    const { apps, options = {} } = req.body
    
    if (!apps || !Array.isArray(apps)) {
      return res.status(400).json({
        success: false,
        error: '无效的应用列表',
        message: 'apps参数必须是数组'
      })
    }

    const config = await pm2Service.generateConfig(apps, options)

    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('生成PM2配置失败:', error)
    res.status(500).json({
      success: false,
      error: '生成PM2配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/config/apply
 * 应用PM2配置 - 仅admin
 */
router.post('/config/apply', requireAdmin, auditLog('pm2-config-apply'), async (req, res) => {
  try {
    const { config } = req.body

    logger.info('收到PM2配置应用请求:', { config })

    if (!config || !config.apps || !Array.isArray(config.apps)) {
      return res.status(400).json({
        success: false,
        error: '无效的PM2配置',
        message: '配置必须包含apps数组'
      })
    }

    // 应用配置中的每个应用
    for (const app of config.apps) {
      logger.info('正在启动应用:', { appName: app.name, script: app.script, cwd: app.cwd })
      await pm2Service.startWithConfig(app)
    }
    
    res.json({
      success: true,
      message: 'PM2配置应用成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('应用PM2配置失败:', error)
    res.status(500).json({
      success: false,
      error: '应用PM2配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/config/diff
 * 对比当前运行配置与目标配置 - operator可读
 */
router.post('/config/diff', requireOperator, async (req, res) => {
  try {
    const { config } = req.body
    if (!config || !Array.isArray(config.apps)) {
      return res.status(400).json({ success: false, error: '无效的配置', message: 'config.apps 必须是数组' })
    }
    const diff = await pm2Service.diffConfig(config)
    res.json({ success: true, data: diff, timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('配置对比失败:', error)
    res.status(500).json({ success: false, error: '配置对比失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * GET /api/pm2/config/export
 * 导出当前PM2配置 - operator可读
 */
router.get('/config/export', requireOperator, async (req, res) => {
  try {
    const processes = await pm2Service.getProcessList()

    const config = {
      apps: processes.map(proc => ({
        name: proc.name,
        script: proc.script || 'npm run dev',
        instances: proc.instances || 1,
        exec_mode: proc.exec_mode || 'fork',
        watch: proc.watch || false,
        max_memory_restart: proc.max_memory_restart || '500M',
        env: proc.env || {}
      }))
    }

    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('导出PM2配置失败:', error)
    res.status(500).json({
      success: false,
      error: '导出PM2配置失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/validate-script
 * 验证启动脚本 - operator可读
 */
router.post('/validate-script', requireOperator, async (req, res) => {
  try {
    const { script, cwd } = req.body

    if (!script || !cwd) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
        message: 'script和cwd参数都是必需的'
      })
    }

    const validation = await (pm2Service as any).validateScript(script, cwd)

    res.json({
      success: true,
      data: validation,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('验证脚本失败:', error)
    res.status(500).json({
      success: false,
      error: '验证脚本失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/validate-directory
 * 验证目录是否存在 - operator可读
 */
router.post('/validate-directory', requireOperator, async (req, res) => {
  try {
    const { directory } = req.body

    if (!directory) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
        message: 'directory参数是必需的'
      })
    }

    const fs = await import('fs/promises')
    let exists = false
    let error = null

    try {
      const stat = await fs.stat(directory)
      exists = stat.isDirectory()
      if (!exists) {
        error = '路径存在但不是目录'
      }
    } catch (e) {
      error = '目录不存在或无法访问'
    }

    res.json({
      success: true,
      data: { exists, error },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('验证目录失败:', error)
    res.status(500).json({
      success: false,
      error: '验证目录失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/scripts/autofix
 * 自动补全start脚本 - 仅admin（修改文件）
 */
router.post('/scripts/autofix', requireAdmin, auditLog('pm2-scripts-autofix'), async (req, res) => {
  try {
    const { appId, prefer = 'preview', dryRun = false } = req.body || {}

    if (!appId) {
      return res.status(400).json({ success: false, error: '缺少必要参数', message: 'appId 参数是必需的' })
    }

    const applicationService = (pm2Service as any).applicationService
    if (!applicationService) {
      return res.status(500).json({ success: false, error: '应用服务未初始化', message: '无法获取应用信息' })
    }

    let app: any
    try {
      app = await applicationService.findById(appId)
    } catch (e) {
      const apps = await applicationService.findAll()
      app = apps.find((a: any) => a.id === appId || a.name === appId || a.name.toLowerCase().replace(/\s+/g, '-') === String(appId))
      if (!app) {
        return res.status(404).json({ success: false, error: '应用不存在', message: `未找到ID或名称为 "${appId}" 的应用` })
      }
    }

    const pkgPath = join(app.directory, 'package.json')

    const access = await pathSecurityManager.checkAccess({
      path: pkgPath,
      operation: 'write',
      user: { id: (req as any).user?.id || 'system', role: 'system', permissions: ['file:read', 'file:write'] },
      context: { requestId: (req.headers['x-request-id'] as string) || 'pm2-autofix' }
    })

    if (!access.allowed) {
      return res.status(403).json({ success: false, error: '路径访问被拒绝', message: access.reason || '无写入权限' })
    }

    if (!existsSync(pkgPath)) {
      return res.status(404).json({ success: false, error: 'package.json 不存在', message: `路径 ${pkgPath} 不存在` })
    }

    let pkgRaw = ''
    try {
      pkgRaw = readFileSync(pkgPath, 'utf8')
    } catch (e: any) {
      return res.status(500).json({ success: false, error: '读取 package.json 失败', message: e.message })
    }

    let pkg: any
    try {
      pkg = JSON.parse(pkgRaw || '{}')
    } catch (e: any) {
      return res.status(400).json({ success: false, error: 'package.json 格式错误', message: e.message })
    }

    pkg.scripts = pkg.scripts || {}

    if (pkg.scripts.start) {
      return res.json({
        success: true,
        message: 'start 脚本已存在，无需修改',
        data: { changed: false, script: pkg.scripts.start }
      })
    }

    const order = prefer === 'serve'
      ? ['serve', 'preview', 'dev', 'build']
      : prefer === 'dev'
        ? ['dev', 'preview', 'serve', 'build']
        : ['preview', 'serve', 'dev', 'build']

    const chosen = order.find(k => pkg.scripts[k])

    if (!chosen) {
      return res.status(400).json({ success: false, error: '未找到可用脚本', message: '缺少 preview/serve/dev 脚本' })
    }

    const startScript = `npm run ${chosen}`

    if (dryRun) {
      return res.json({
        success: true,
        message: 'DryRun: 即将添加 start 脚本',
        data: { changed: true, script: startScript, used: chosen, dryRun: true }
      })
    }

    pkg.scripts.start = startScript

    try {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    } catch (e: any) {
      return res.status(500).json({ success: false, error: '写入 package.json 失败', message: e.message })
    }

    res.json({
      success: true,
      message: '已为应用添加 start 脚本',
      data: { changed: true, script: startScript, used: chosen }
    })
  } catch (error) {
    logger.error('自动补全 start 脚本失败:', error)
    res.status(500).json({ success: false, error: '自动补全 start 脚本失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * GET /api/pm2/info
 * 获取PM2信息 - operator可读
 */
router.get('/info', requireOperator, async (req, res) => {
  try {
    const info = await pm2Service.getPM2Info()
    res.json({ success: true, data: info, timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('获取PM2信息失败:', error)
    res.status(500).json({ success: false, error: '获取PM2信息失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/save
 * 保存PM2进程列表 - 仅admin
 */
router.post('/save', requireAdmin, auditLog('pm2-save'), async (req, res) => {
  try {
    await pm2Service.saveProcesses()
    res.json({ success: true, message: 'PM2进程列表已保存', timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('保存PM2进程失败:', error)
    res.status(500).json({ success: false, error: '保存PM2进程失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/resurrect
 * 仍ump恢复PM2进程 - 仅admin
 */
router.post('/resurrect', requireAdmin, auditLog('pm2-resurrect'), async (req, res) => {
  try {
    await pm2Service.resurrectProcesses()
    res.json({ success: true, message: 'PM2进程已从dump恢复', timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('恢复PM2进程失败:', error)
    res.status(500).json({ success: false, error: '恢复PM2进程失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/stop-all
 * 停止全部PM2进程 - 仅admin
 */
router.post('/stop-all', requireAdmin, auditLog('pm2-stop-all'), async (req, res) => {
  try {
    await pm2Service.stopAll()
    res.json({ success: true, message: '已停止全部PM2进程', timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('停止全部PM2进程失败:', error)
    res.status(500).json({ success: false, error: '停止全部PM2进程失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/restart-all
 * 重启全部PM2进程 - 仅admin
 */
router.post('/restart-all', requireAdmin, auditLog('pm2-restart-all'), async (req, res) => {
  try {
    await pm2Service.restartAll()
    res.json({ success: true, message: '已重启全部PM2进程', timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('重启全部PM2进程失败:', error)
    res.status(500).json({ success: false, error: '重启全部PM2进程失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/delete-all
 * 删除全部PM2进程 - 仅admin
 */
router.post('/delete-all', requireAdmin, auditLog('pm2-delete-all'), async (req, res) => {
  try {
    await pm2Service.deleteAll()
    res.json({ success: true, message: '已删除全部PM2进程', timestamp: new Date().toISOString() })
  } catch (error) {
    logger.error('删除全部PM2进程失败:', error)
    res.status(500).json({ success: false, error: '删除全部PM2进程失败', message: error instanceof Error ? error.message : '未知错误' })
  }
})

/**
 * POST /api/pm2/processes/:name/auto-diagnose
 * 自动诊断PM2进程问题 - 仅admin
 */
router.post('/processes/:name/auto-diagnose', requireAdmin, auditLog('pm2-auto-diagnose'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }

    const { name } = req.params
    logger.info(`开始自动诊断进程: ${name}`)

    const result = await pm2DiagnosticService.diagnose(name)

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('自动诊断失败:', error)
    res.status(500).json({
      success: false,
      error: '自动诊断失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/processes/:name/auto-fix
 * 自动修复PM2进程问题 - 仅admin
 */
router.post('/processes/:name/auto-fix', requireAdmin, auditLog('pm2-auto-fix'), async (req, res) => {
  try {
    if (process.platform === 'win32' && process.env.PM2_ENABLED !== '1') {
      return res.status(503).json({
        success: false,
        error: 'PM2 integration is disabled on Windows by default',
        message: 'Set PM2_ENABLED=1 to enable'
      })
    }

    const { name } = req.params
    const { issues } = req.body

    if (!issues || !Array.isArray(issues)) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
        message: '请提供需要修复的问题列表'
      })
    }

    logger.info(`开始自动修复进程 ${name} 的 ${issues.length} 个问题`)

    const result = await pm2DiagnosticService.autoFix(name, issues)

    res.json({
      success: result.success,
      data: result,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('自动修复失败:', error)
    res.status(500).json({
      success: false,
      error: '自动修复失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/sync-state
 * 🔄 手动同步PM2进程状态到数据库 - 仅admin
 */
router.post('/sync-state', requireOperator, auditLog('pm2-sync-state'), async (req, res) => {
  try {
    logger.info('收到PM2状态同步请求')

    // 从app.locals获取同步服务
    const pm2StateSyncService = (req.app as any).locals.pm2StateSyncService
    
    if (!pm2StateSyncService) {
      logger.error('PM2状态同步服务未注册')
      return res.status(500).json({
        success: false,
        error: 'PM2状态同步服务未初始化'
      })
    }

    // 执行同步
    const result = await pm2StateSyncService.syncNow()
    
    logger.info('PM2状态同步完成', result)

    res.json({
      success: true,
      data: {
        synced: result.synced,
        updated: result.updated,
        errors: result.errors,
        message: result.updated > 0 
          ? `成功同步 ${result.updated} 个应用的状态` 
          : '所有应用状态已是最新'
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    logger.error('PM2状态同步失败:', error)
    res.status(500).json({
      success: false,
      error: '状态同步失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * POST /api/pm2/sync-app/:appId
 * 🔄 同步指定应用的状态 - 仅admin
 */
router.post('/sync-app/:appId', requireOperator, auditLog('pm2-sync-app'), async (req, res) => {
  try {
    const { appId } = req.params
    logger.info('收到单个应用状态同步请求', { appId })

    const pm2StateSyncService = (req.app as any).locals.pm2StateSyncService
    
    if (!pm2StateSyncService) {
      return res.status(500).json({
        success: false,
        error: 'PM2状态同步服务未初始化'
      })
    }

    const updated = await pm2StateSyncService.syncAppState(appId)
    
    res.json({
      success: true,
      data: {
        appId,
        updated,
        message: updated ? '应用状态已同步' : '应用状态已是最新'
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    logger.error('应用状态同步失败:', error)
    res.status(500).json({
      success: false,
      error: '状态同步失败',
      message: error instanceof Error ? error.message : '未知错误'
    })
  }
})

export default router
