/**
 * PM2 Service - Process Management
 *
 * Handles PM2 process management operations
 */

import pm2 from 'pm2'
import { logger } from '../utils/logger'
import { spawn } from 'child_process'

import { ApplicationService } from '../core/ApplicationService'
import fs from 'fs/promises'
import path from 'path'
import { pathSecurityManager } from '../core/security/PathSecurityManager'
import { envValidator, type EnvValidationResult } from './envValidator'

export interface PM2Process {
  name: string
  pm_id: number
  pid?: number
  status: 'online' | 'stopped' | 'error' | 'stopping' | 'launching'
  cpu: number
  memory: number
  uptime: number
  restarts: number
  script?: string
  cwd?: string
  instances?: number | string
  exec_mode?: 'fork' | 'cluster'
  watch?: boolean
  max_memory_restart?: string
  env?: Record<string, string>
  log_file?: string
  error_file?: string
  out_file?: string
}

export interface PM2Config {
  name: string
  script: string
  args?: string | string[]
  cwd?: string
  instances?: number | string
  exec_mode?: 'fork' | 'cluster'
  watch?: boolean
  ignore_watch?: string[]
  max_memory_restart?: string
  env?: Record<string, string>
  env_production?: Record<string, string>
  log_file?: string
  error_file?: string
  out_file?: string
  time?: boolean
  restart_delay?: number
  max_restarts?: number
  min_uptime?: string
  autorestart?: boolean
  merge_logs?: boolean
}

export interface PM2EcosystemConfig {
  apps: PM2Config[]
}

export interface PM2Stats {
  total: number
  online: number
  stopped: number
  error: number
  launching: number
}

export interface ExternalExePortInspection {
  ok: boolean
  processName: string
  pid: number | null
  expectedPort: number | null
  actualPort: number | null
  listeningPorts: number[]
  reason?: string
}

export class PM2Service {
  private isConnected = false
  private applicationService?: ApplicationService
  private disconnectTimer: NodeJS.Timeout | null = null
  private idleMs = 60 * 1000 // 60s 自动断开，降低资源占用

  constructor() {
    // 设置全局的 PM2 错误处理，防止未捕获的错误导致进程崩溃
    this.setupGlobalPM2ErrorHandling()
  }

  /**
   * 设置全局 PM2 错误处理
   */
  private setupGlobalPM2ErrorHandling() {
    // 捕获 PM2 内部可能触发的未处理错误事件
    const pm2Any = pm2 as any

    // 尝试访问 PM2 的内部 bus/client
    if (pm2Any.Client && pm2Any.Client.prototype) {
      const originalEmit = pm2Any.Client.prototype.emit
      pm2Any.Client.prototype.emit = function (event: string, ...args: any[]) {
        if (event === 'error') {
          const err = args[0]
          logger.error('捕获到 PM2 内部错误事件:', err)
          // 不让错误传播，避免进程崩溃
          return false
        }
        return originalEmit.apply(this, [event, ...args])
      }
    }
  }

  /**
   * 注入 ApplicationService 以便按ID查询应用信息
   */
  setApplicationService(service: ApplicationService) {
    this.applicationService = service
  }

  /**
   * 当前环境是否允许使用 PM2
   * - Windows 默认禁用（避免命名管道权限/EPERM 问题），除非显式设置 PM2_ENABLED=1
   * - 其他平台默认启用，可通过 PM2_ENABLED=0 强制禁用
   */
  private isPm2Enabled(): boolean {
    const flag = process.env.PM2_ENABLED
    if (process.platform === 'win32') {
      return flag === '1'
    }
    return flag !== '0'
  }


  /**
   * 连接到PM2
   */
  async connect(): Promise<void> {
    if (!this.isPm2Enabled()) {
      throw new Error('PM2 integration is disabled (set PM2_ENABLED=1 to enable)')
    }
    if (this.isConnected) {
      this.scheduleAutoDisconnect()
      return
    }

    // 创建超时定时器（5秒超时）
    let timeoutId: NodeJS.Timeout | null = null

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new Error(
          'PM2 连接超时。这通常是由于 Windows 权限问题导致的。\n' +
          '可能的解决方案：\n' +
          '1. 以管理员身份运行命令提示符\n' +
          '2. 重启 PM2 守护进程：pm2 kill && pm2 ping\n' +
          '3. 检查防病毒软件是否阻止了 PM2\n' +
          '4. 或者暂时禁用 PM2 功能使用直接启动'
        )
        timeoutError.name = 'PM2WindowsPermissionError'
        logger.error('PM2 连接超时（5秒）')
        reject(timeoutError)
      }, 5000) // 5秒超时
    })

    // 创建连接 Promise
    const connectPromise = new Promise<void>((resolve, reject) => {
      // 添加全局错误事件监听器，防止未捕获的错误导致进程崩溃
      const errorHandler = (err: any) => {
        logger.error('PM2 内部错误事件:', err)
        // 不要让这个错误导致进程崩溃
        // 只记录日志
      }

      // 监听 PM2 的错误事件
      const pm2Any = pm2 as any
      if (pm2Any.bus && typeof pm2Any.bus.on === 'function') {
        pm2Any.bus.on('error', errorHandler)
      }

      pm2.connect((err) => {
        // 无论成功或失败，都清除超时定时器
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        if (err) {
          logger.error('PM2连接失败:', err)

          // Windows 特殊处理：如果是权限错误，提供更详细的错误信息
          if (process.platform === 'win32' && (err as NodeJS.ErrnoException).code === 'EPERM') {
            const detailedError = new Error(
              'PM2 在 Windows 上遇到权限问题。可能的解决方案：\n' +
              '1. 以管理员身份运行命令提示符\n' +
              '2. 重启 PM2 守护进程：pm2 kill && pm2 ping\n' +
              '3. 检查防病毒软件是否阻止了 PM2\n' +
              '4. 或者暂时禁用 PM2 功能使用直接启动'
            )
            detailedError.name = 'PM2WindowsPermissionError'
            reject(detailedError)
          } else {
            reject(err)
          }
        } else {
          this.isConnected = true
          logger.info('PM2连接成功')
          this.scheduleAutoDisconnect()
          resolve()
        }
      })
    })

    // 使用 Promise.race 来竞争连接和超时
    // 如果 5 秒内连接不成功，就抛出超时错误
    try {
      await Promise.race([connectPromise, timeoutPromise])
    } finally {
      // 确保定时器被清除
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * 断开PM2连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return

    return new Promise((resolve) => {
      pm2.disconnect()
      this.isConnected = false
      logger.info('PM2连接已断开')
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer)
        this.disconnectTimer = null
      }
      resolve()
    })
  }

  /** 在空闲一段时间后自动断开 PM2 连接 */
  private scheduleAutoDisconnect() {
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer)
    this.disconnectTimer = setTimeout(() => {
      if (this.isConnected) {
        try {
          pm2.disconnect()
          this.isConnected = false
          logger.info('PM2连接空闲超时，已自动断开')
        } catch (e) {
          logger.warn('PM2自动断开失败', e)
        }
      }
    }, this.idleMs)
  }

  /**
   * 获取PM2进程列表
   */
  /**
   * 检查进程是否为门户系统自身
   */
  private isPortalProcess(processName: string): boolean {
    const portalProcessNames = [
      'detection-api',
      'main-portal',
      'portal-api',
      'portal-backend',
      'portal-frontend',
      'Intelligent Multi-App Portal System',
      'portal-system'
    ]

    return portalProcessNames.some(name =>
      processName.toLowerCase().includes(name.toLowerCase())
    )
  }

  async getProcessList(): Promise<PM2Process[]> {
    await this.connect()

    return new Promise((resolve, reject) => {
      pm2.list((err, list) => {
        if (err) {
          logger.error('获取PM2进程列表失败:', err)
          reject(err)
        } else {
          const allProcesses = list.map(proc => ({
            name: proc.name || '',
            pm_id: proc.pm_id || 0,
            pid: proc.pid,
            status: this.mapStatus(proc.pm2_env?.status),
            cpu: proc.monit?.cpu || 0,
            memory: proc.monit?.memory || 0,
            uptime: proc.pm2_env?.pm_uptime || 0,
            restarts: proc.pm2_env?.restart_time || 0,
            script: proc.pm2_env?.pm_exec_path,
            cwd: (proc.pm2_env as any)?.pm_cwd || (proc.pm2_env as any)?.cwd,
            instances: proc.pm2_env?.instances,
            exec_mode: (proc.pm2_env as any)?.exec_mode as 'fork' | 'cluster',
            watch: (proc.pm2_env as any)?.watch,
            max_memory_restart: (proc.pm2_env as any)?.max_memory_restart,
            env: (proc.pm2_env as any)?.env,
            out_file: (proc.pm2_env as any)?.pm_out_log_path,
            error_file: (proc.pm2_env as any)?.pm_err_log_path,
            log_file: (proc.pm2_env as any)?.pm_log_path
          }))

          // 过滤掉门户系统自己的进程
          const filteredProcesses = allProcesses.filter(proc => {
            const isPortal = this.isPortalProcess(proc.name)
            if (isPortal) {
              logger.debug(`过滤掉门户系统进程: ${proc.name}`, {
                reason: '门户系统不应该被自己管理'
              })
            }
            return !isPortal
          })

          logger.debug(`PM2进程列表获取成功`, {
            totalProcesses: allProcesses.length,
            filteredProcesses: filteredProcesses.length,
            filteredOut: allProcesses.length - filteredProcesses.length
          })

          resolve(filteredProcesses)
        }
      })
    })
  }

  /**
   * 获取PM2统计信息
   */
  async getStats(): Promise<PM2Stats> {
    const processes = await this.getProcessList()

    const stats = {
      total: processes.length,
      online: processes.filter(p => p.status === 'online').length,
      stopped: processes.filter(p => p.status === 'stopped').length,
      error: processes.filter(p => p.status === 'error').length,
      launching: processes.filter(p => p.status === 'launching').length
    }

    return stats
  }

  /**
   * 启动PM2进程
   */
  async startProcess(name: string): Promise<void> {
    await this.connect()

    // 首先检查进程是否已经存在于PM2进程列表中
    const existingProcesses = await this.getProcessList()
    const existingProcess = existingProcesses.find(p => p.name === name)

    if (existingProcess) {
      // 进程存在，检查状态
      if (existingProcess.status === 'online') {
        logger.info(`进程 ${name} 已经在运行`)
        return
      }

      // 进程存在但未运行：使用 restart 恢复（pm2.start(name) 会被当作“脚本路径”导致 Script not found）
      return new Promise((resolve, reject) => {
        pm2.restart(name, (err) => {
          if (err) {
            logger.error(`启动进程 ${name} 失败:`, err)
            reject(new Error(`启动进程失败: ${err.message || '未知错误'}`))
          } else {
            logger.info(`进程 ${name} 启动成功`)
            resolve()
          }
        })
      })
    } else {
      // 进程不存在，尝试从应用数据库查找并创建配置
      logger.warn(`PM2进程 ${name} 不存在，尝试从应用数据库创建配置`)

      if (this.applicationService) {
        try {
          // 尝试通过应用名称查找应用
          const apps = await (this.applicationService as any).findAll()
          const matchedApp = (apps as any[]).find(app =>
            app.name.toLowerCase().replace(/\s+/g, '-') === name ||
            app.id === name ||
            app.name === name
          )

          if (matchedApp) {
            logger.info(`找到匹配的应用，为 ${name} 创建PM2配置`, { appId: matchedApp.id })

            // 生成PM2配置并启动
            const config = await this.generateConfig([matchedApp.id])
            if (config.apps.length > 0) {
              await this.startWithConfig(config.apps[0])
              return
            }
          }
        } catch (error) {
          logger.error(`从应用数据库创建PM2配置失败:`, error)
        }
      }

      // 无法创建配置，返回详细错误信息
      const errorMessage = [
        `PM2进程 "${name}" 不存在。`,
        `请检查以下可能的原因：`,
        `1. 进程名称是否正确`,
        `2. 是否已通过PM2配置文件注册该进程`,
        `3. 是否需要先创建应用配置`,
        ``,
        `当前已注册的PM2进程: ${existingProcesses.map(p => p.name).join(', ') || '无'}`,
        ``,
        `建议操作：`,
        `- 检查PM2进程列表: pm2 list`,
        `- 或在应用管理中先添加该应用`
      ].join('\n')

      throw new Error(errorMessage)
    }
  }

  /**
   * 停止PM2进程
   */
  async stopProcess(name: string): Promise<void> {
    await this.connect()

    return new Promise((resolve, reject) => {
      pm2.stop(name, (err) => {
        if (err) {
          logger.error(`停止进程 ${name} 失败:`, err)
          reject(err)
        } else {
          logger.info(`进程 ${name} 停止成功`)
          resolve()
        }
      })
    })
  }

  /**
   * 重启PM2进程
   */
  async restartProcess(name: string): Promise<void> {
    await this.connect()

    return new Promise((resolve, reject) => {
      pm2.restart(name, (err) => {
        if (err) {
          logger.error(`重启进程 ${name} 失败:`, err)
          reject(err)
        } else {
          logger.info(`进程 ${name} 重启成功`)
          resolve()
        }
      })
    })
  }

  /**
   * 删除PM2进程
   */
  async deleteProcess(name: string): Promise<void> {
    await this.connect()

    return new Promise((resolve, reject) => {
      pm2.delete(name, (err) => {
        if (err) {
          logger.error(`删除进程 ${name} 失败:`, err)
          reject(err)
        } else {
          logger.info(`进程 ${name} 删除成功`)
          resolve()
        }
      })
    })
  }

  /**
   * 验证PM2进程是否真正启动成功
   * @param processName 进程名称
   * @param maxWaitTime 最大等待时间（毫秒）
   * @param checkInterval 检查间隔（毫秒）
   * @returns 是否成功启动
   */
  private async verifyProcessStarted(
    processName: string,
    maxWaitTime: number = 10000,
    checkInterval: number = 500
  ): Promise<{ success: boolean; status?: string; error?: string }> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const processes = await this.getProcessList()
        const process = processes.find(p => p.name === processName)

        if (process) {
          if (process.status === 'online') {
            logger.info(`进程 ${processName} 已成功启动并处于 online 状态`)
            return { success: true, status: 'online' }
          } else if (process.status === 'error' || process.status === 'stopped') {
            // 进程启动失败或已停止
            logger.error(`进程 ${processName} 启动失败`, { status: process.status, restarts: process.restarts })
            return {
              success: false,
              status: process.status,
              error: `进程状态为 ${process.status}，启动失败。可能原因：端口冲突、配置错误、依赖缺失等`
            }
          } else if (process.status === 'launching') {
            // 还在启动中，继续等待
            logger.debug(`进程 ${processName} 正在启动中...`, { elapsed: Date.now() - startTime })
          }
        } else {
          logger.warn(`在PM2进程列表中未找到进程 ${processName}`)
        }

        // 等待一段时间后再检查
        await new Promise(resolve => setTimeout(resolve, checkInterval))
      } catch (error) {
        logger.error(`检查进程状态时出错`, {
          processName,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // 超时
    logger.error(`进程 ${processName} 启动超时`, { maxWaitTime })
    return {
      success: false,
      error: `进程启动超时（${maxWaitTime}ms）。进程可能启动缓慢或配置有误。请检查日志。`
    }
  }

  /**
   * 使用配置启动PM2进程（增强版：包含启动验证）
   */
  async startWithConfig(config: PM2Config): Promise<void> {
    try {
      await this.connect()
    } catch (err: any) {
      // 如果是 PM2 连接错误，重新抛出以便上层处理
      if (err.name === 'PM2WindowsPermissionError') {
        throw err
      }
      // Windows EPERM 错误
      if (process.platform === 'win32' && err.code === 'EPERM') {
        const detailedError = new Error(
          'PM2 在 Windows 上遇到权限问题。可能的解决方案：\n' +
          '1. 以管理员身份运行命令提示符\n' +
          '2. 重启 PM2 守护进程：pm2 kill && pm2 ping\n' +
          '3. 检查防病毒软件是否阻止了 PM2\n' +
          '4. 或者暂时禁用 PM2 功能使用直接启动'
        )
        detailedError.name = 'PM2WindowsPermissionError'
        throw detailedError
      }
      throw err
    }

    // 验证工作目录是否存在
    if (config.cwd) {
      try {
        const stat = await fs.stat(config.cwd)
        if (!stat.isDirectory()) {
          throw new Error(`工作目录不是有效目录: ${config.cwd}`)
        }
      } catch (e) {
        throw new Error(`无法访问工作目录: ${config.cwd}`)
      }

      // 路径安全校验（执行权限）
      const access = await pathSecurityManager.checkAccess({
        path: config.cwd,
        operation: 'execute',
        user: {
          id: 'pm2-service',
          role: 'system',
          permissions: ['file:read', 'file:write', 'file:execute', 'file:delete']
        },
        context: { requestId: 'pm2-start-with-config', ip: 'local', userAgent: 'pm2-service' }
      })
      if (!access.allowed) {
        throw new Error(`工作目录不被允许访问: ${config.cwd}，原因: ${access.reason || '路径访问被拒绝'}`)
      }
    }

    // 验证启动脚本是否有效
    if (config.script && config.cwd) {
      const validationResult = await this.validateScript(config.script, config.cwd)
      if (!validationResult.isValid) {
        throw new Error(`启动脚本验证失败: ${validationResult.error}`)
      }
    }

    // 环境变量验证和自动修复
    if (config.cwd && config.env_production) {
      const isProduction = config.env_production.NODE_ENV === 'production'
      if (isProduction) {
        logger.info('生产模式启动，验证环境变量配置...', { appPath: config.cwd })

        const envValidation = await envValidator.validate(
          config.cwd,
          config.env_production
        )

        if (!envValidation.valid) {
          logger.warn('环境变量验证失败，尝试自动修复', {
            missing: envValidation.missing,
            invalid: envValidation.invalid,
            warnings: envValidation.warnings
          })

          if (envValidation.autoFixable) {
            // 自动修复环境变量
            const fixedEnv = await envValidator.autoFix(
              config.cwd,
              config.env_production
            )

            // 更新配置
            config.env_production = { ...config.env_production, ...fixedEnv }

            // 持久化到.env文件
            try {
              await envValidator.persistEnvToFile(config.cwd, fixedEnv)
              logger.info('环境变量已自动修复并持久化', { fixes: Object.keys(fixedEnv) })
            } catch (persistError) {
              logger.warn('环境变量持久化失败，但仍使用修复后的配置', { error: persistError })
            }
          } else {
            // 无法自动修复，记录警告但继续启动
            const errorDetails = [
              ...envValidation.missing.map(k => `- 缺少必需环境变量: ${k}`),
              ...envValidation.invalid.map(msg => `- ${msg}`)
            ]
            logger.warn('环境配置验证失败，但将继续启动（允许用户手动配置）', {
              cwd: config.cwd,
              missing: envValidation.missing,
              invalid: envValidation.invalid,
              details: errorDetails
            })

            // 不抛出错误，允许继续启动
            // 用户可以在启动后手动配置环境变量
          }
        } else {
          logger.info('环境变量验证通过')
        }
      }
    }

    // 验证和清理配置，移除可能导致问题的字段
    const cleanConfig: any = {
      name: config.name,
      script: this.convertScriptForPM2(config.script),
      args: this.getScriptArgs(config.script),
      cwd: config.cwd,
      instances: typeof config.instances === 'string' ? parseInt(config.instances) : (config.instances || 1),
      exec_mode: config.exec_mode === 'cluster' ? 'cluster' : 'fork',
      watch: Boolean(config.watch),
      autorestart: Boolean(config.autorestart),
      max_memory_restart: config.max_memory_restart || '500M',
      env: config.env || {},
      env_production: config.env_production || {},
      // 添加 Windows interpreter 配置
      ...this.getWindowsInterpreter(config.script)
    }

    // PM2 默认只应用 env；如果配置提供了 env_production 且当前为生产模式，则合并进去确保生效。
    const envNodeEnv = String(cleanConfig.env?.NODE_ENV || '').toLowerCase()
    const prodNodeEnv = String(cleanConfig.env_production?.NODE_ENV || '').toLowerCase()
    const wantsProduction = envNodeEnv === 'production' || prodNodeEnv === 'production'
    if (wantsProduction && cleanConfig.env_production && Object.keys(cleanConfig.env_production).length > 0) {
      cleanConfig.env = { ...cleanConfig.env, ...cleanConfig.env_production }
    }

    // 兼容性修复：当脚本为 npm 命令时，强制使用 fork + 单实例。
    // PM2 的 cluster 模式仅适用于直接由 Node.js 解释的脚本文件，
    // 在 Windows 上使用 npm.cmd（批处理）配合 cluster/instances:max 往往会直接报错或无日志退出。
    const isNpmScript = typeof config.script === 'string' && (config.script.startsWith('npm run ') || config.script === 'npm start')
    if (isNpmScript) {
      if (cleanConfig.exec_mode !== 'fork' || cleanConfig.instances !== 1) {
        logger.info('检测到 npm 脚本，已强制使用 fork 模式并设置为单实例以保证兼容性', {
          originalExecMode: config.exec_mode,
          originalInstances: config.instances
        })
      }
      cleanConfig.exec_mode = 'fork'
      cleanConfig.instances = 1

      // 进一步优化：如果是 npm start，并且 package.json 的 start 为 'node dist/xxx.js'
      // 则将 PM2 配置转换为直接运行入口 JS 文件，避免通过 npm.cmd 层导致的进程不可见/瞬退
      const isStartOrRunStart = config.script === 'npm start' || config.script.startsWith('npm run start')
      if (isStartOrRunStart && config.cwd) {
        try {
          const pkg = await this.readPackageJson(config.cwd)
          const scriptName = config.script === 'npm start' ? 'start' : config.script.replace(/^npm run /, '')
          const startCmd: string | undefined = pkg?.scripts?.[scriptName]
          if (startCmd) {
            // 匹配 npx tsx xxx.ts
            const tsxMatch = startCmd.match(/npx\s+tsx\s+([\w./\\-]+\.ts)/)
            if (tsxMatch && tsxMatch[1]) {
              const entryRel = tsxMatch[1]
              const entryAbs = path.isAbsolute(entryRel) ? entryRel : path.join(config.cwd, entryRel)
              cleanConfig.script = entryAbs
              cleanConfig.args = undefined
              cleanConfig.interpreter = 'node'
              cleanConfig.interpreter_args = '--import=tsx/esm'
              // 从命令中提取环境变量
              const envVars = startCmd.match(/cross-env\s+([^n]+)\s+npx/)
              if (envVars && envVars[1]) {
                const vars = envVars[1].split(/\s+/)
                vars.forEach(v => {
                  const [key, value] = v.split('=')
                  if (key && value && cleanConfig.env) {
                    cleanConfig.env[key] = value
                  }
                })
              }
              logger.info('将 npm 脚本转换为直接 tsx 执行以提升稳定性', {
                name: cleanConfig.name,
                entry: entryAbs,
                interpreter: 'node --import=tsx/esm'
              })
            } else {
              // 匹配类似：cross-env VAR=xxx node dist/server.js 或 node ./dist/server.js
              const m = startCmd.match(/node\s+([\w./\\-]+\.js)(\s.*)?$/i)
              if (m && m[1]) {
                const entryRel = m[1].replace(/^"|"$/g, '')
                const entryAbs = path.isAbsolute(entryRel) ? entryRel : path.join(config.cwd, entryRel)
                // 直接使用入口文件作为脚本，移除 npm 解释器
                cleanConfig.script = entryAbs
                cleanConfig.args = undefined
                if (cleanConfig.interpreter) delete cleanConfig.interpreter
                if ((cleanConfig as any).interpreter_args) delete (cleanConfig as any).interpreter_args
                logger.info('将 npm start 转换为直接 Node 入口以提升稳定性', {
                  name: cleanConfig.name,
                  entry: entryAbs
                })
              }
            }
          }
        } catch (e) {
          logger.warn('解析 package.json start 脚本失败，保持 npm 启动方式', {
            cwd: config.cwd,
            error: e instanceof Error ? e.message : String(e)
          })
        }
      }

      // Windows 兼容性修复：
      // 1) Vite 类脚本直接转换为 node node_modules/vite/bin/vite.js，避免 npm.cmd + interpreter:none 的 spawn EINVAL
      // 2) 其他 npm 脚本回退到 cmd.exe /c 包装，保证 PM2 可稳定拉起
      await this.optimizeWindowsNpmCommand(cleanConfig, config.script, config.cwd)
    }

    // 移除可能导致问题的字段
    delete cleanConfig.merge_logs  // 这个字段可能导致PM2错误
    delete cleanConfig.username    // 移除自动添加的用户名

    // external-exe 在 Windows 下可能留下同名“僵尸”记录（online 但 pid 无效），
    // 或者同名进程仍指向旧目录。启动前先做一致性校验，不一致则删除后重建。
    try {
      const existingProcesses = await this.getProcessList()
      const existingProcess = existingProcesses.find(p => p.name === cleanConfig.name)

      if (existingProcess) {
        const existingPid = Number(existingProcess.pid)
        const pidUnavailable = !Number.isInteger(existingPid) || existingPid <= 0

        const existingScript = this.normalizePathForCompare(existingProcess.script)
        const nextScript = this.normalizePathForCompare(cleanConfig.script)
        const scriptMismatch = Boolean(existingScript && nextScript && existingScript !== nextScript)

        const existingCwd = this.normalizePathForCompare(existingProcess.cwd)
        const nextCwd = this.normalizePathForCompare(cleanConfig.cwd)
        const cwdMismatch = Boolean(existingCwd && nextCwd && existingCwd !== nextCwd)

        if (pidUnavailable || scriptMismatch || cwdMismatch) {
          logger.warn('检测到同名 PM2 进程状态异常或配置不一致，启动前先删除重建', {
            name: cleanConfig.name,
            existingPid: existingProcess.pid ?? null,
            pidUnavailable,
            existingScript: existingProcess.script,
            nextScript: cleanConfig.script,
            scriptMismatch,
            existingCwd: existingProcess.cwd,
            nextCwd: cleanConfig.cwd,
            cwdMismatch
          })

          await this.deleteProcess(cleanConfig.name)
        }
      }
    } catch (error) {
      logger.warn('启动前同名进程一致性检查失败（忽略，继续启动）', {
        name: cleanConfig.name,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    logger.info('清理后的PM2配置:', cleanConfig)

    return new Promise((resolve, reject) => {
      pm2.start(cleanConfig, async (err, proc) => {
        if (err) {
          // 提供更详细的错误信息
          const errorDetails = {
            error: err,
            config: cleanConfig,
            errorMessage: err.message || '未知错误',
            errorDetails: JSON.stringify(err),
            possibleCauses: this.analyzePM2Error(err, cleanConfig)
          }

          logger.error(`使用配置启动进程失败:`, errorDetails)

          const detailedMessage = this.buildDetailedErrorMessage(err, cleanConfig)
          reject(new Error(detailedMessage))
        } else {
          logger.info(`PM2已接受启动请求: ${cleanConfig.name}，开始验证进程状态...`, { processInfo: proc })

          // 🔍 新增：验证进程是否真正启动成功
          try {
            const verifyTimeout = this.resolvePm2StartVerifyTimeoutMs()
            const verifyResult = await this.verifyProcessStarted(cleanConfig.name, verifyTimeout, 500)

            if (verifyResult.success) {
              logger.info(`✅ 进程 ${cleanConfig.name} 已成功启动并运行`, { status: verifyResult.status })
              resolve()
            } else {
              // 启动失败，尝试清理进程
              logger.error(`❌ 进程 ${cleanConfig.name} 启动验证失败`, {
                status: verifyResult.status,
                error: verifyResult.error
              })

              // 尝试清理失败的进程
              try {
                await this.deleteProcess(cleanConfig.name)
                logger.info(`已清理失败的进程: ${cleanConfig.name}`)
              } catch (cleanupError) {
                logger.warn(`清理失败进程时出错（忽略）`, {
                  processName: cleanConfig.name,
                  error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
                })
              }

              reject(new Error(verifyResult.error || `进程 ${cleanConfig.name} 启动失败，请检查日志`))
            }
          } catch (verifyError) {
            logger.error(`验证进程状态时发生异常`, {
              processName: cleanConfig.name,
              error: verifyError instanceof Error ? verifyError.message : String(verifyError)
            })
            reject(new Error(`无法验证进程状态: ${verifyError instanceof Error ? verifyError.message : '未知错误'}`))
          }
        }
      })
    })
  }

  /**
   * 获取进程日志
   */
  async getProcessLogs(name: string, lines: number = 100): Promise<string> {
    return this.getProcessLogsAdvanced(name, lines, 'combined')
  }


  /**
   * 清空进程日志
   */
  async clearProcessLogs(name: string): Promise<void> {
    await this.connect()

    return new Promise((resolve, reject) => {
      pm2.flush(name, (err) => {
        if (err) {
          logger.error(`清空进程 ${name} 日志失败:`, err)
          reject(err)
        } else {
          logger.info(`进程 ${name} 日志清空成功`)
          resolve()
        }
      })
    })
  }

  /**
   * 读取 package.json
   */
  private async readPackageJson(cwd: string): Promise<any | null> {
    try {
      const pkgPath = path.join(cwd, 'package.json')
      const content = await fs.readFile(pkgPath, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      logger.warn('读取 package.json 失败', { cwd, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }

  /**
   * 确定实际的工作目录（考虑全栈项目）
   */
  private async determineActualWorkingDirectory(
    directory: string,
    preferProduction: boolean = false
  ): Promise<string> {
    const { existsSync, readdirSync } = await import('fs')
    const { join, resolve } = await import('path')

    // 确保使用绝对路径
    const absoluteDirectory = resolve(directory)

    // 首先检查目录是否存在
    if (!existsSync(absoluteDirectory)) {
      logger.warn(`目录不存在: ${absoluteDirectory}`)
      throw new Error(`Directory does not exist: ${absoluteDirectory}`)
    }

    // 检查是否为全栈项目（同时兼容 frontend/backend 与 client/server 命名）
    const frontendDirCandidates = ['frontend', 'client']
    const backendDirCandidates = ['backend', 'server']
    const detectedFrontendDir = frontendDirCandidates
      .map(dir => join(absoluteDirectory, dir))
      .find(dir => existsSync(dir))
    const detectedBackendDir = backendDirCandidates
      .map(dir => join(absoluteDirectory, dir))
      .find(dir => existsSync(dir))

    if (detectedFrontendDir && detectedBackendDir) {
      logger.info(`检测到全栈项目: ${absoluteDirectory}`)

      // 生产模式优先使用 backend 目录，避免误走根目录 dev 并拉起 concurrently。
      // 这对 frontend/backend 分离项目尤为关键：生产启动应由 backend 托管静态资源。
      const backendPackageJson = join(detectedBackendDir, 'package.json')
      if (preferProduction && existsSync(backendPackageJson)) {
        logger.info(`生产模式：使用后端目录（全栈项目）: ${detectedBackendDir}`)
        return detectedBackendDir
      }

      // 如果后端没有 package.json，回退到前端目录（开发模式兜底）
      const frontendPackageJson = join(detectedFrontendDir, 'package.json')
      if (existsSync(frontendPackageJson)) {
        logger.warn(`后端无package.json，使用前端目录: ${detectedFrontendDir}`)
        return detectedFrontendDir
      }

      // 非生产模式下保留原行为：优先使用根目录（方便 dev 聚合脚本）
      if (!preferProduction) {
        const rootPackageJson = join(absoluteDirectory, 'package.json')
        if (existsSync(rootPackageJson)) {
          logger.info(`开发模式：使用根目录（有package.json）: ${absoluteDirectory}`)
          return absoluteDirectory
        }
      }
    }

    // 非全栈项目（或生产模式下未命中 backend）再走根目录优先逻辑
    const rootPackageJson = join(absoluteDirectory, 'package.json')
    if (existsSync(rootPackageJson)) {
      logger.info(`使用根目录（有package.json）: ${absoluteDirectory}`)
      return absoluteDirectory
    }

    // 常见前端子目录兜底（如 client / web / app / ui）
    const preferredSubDirs = ['client', 'frontend', 'server', 'backend', 'web', 'app', 'ui']
    for (const subDir of preferredSubDirs) {
      const candidateDir = join(absoluteDirectory, subDir)
      const candidatePkg = join(candidateDir, 'package.json')
      if (existsSync(candidateDir) && existsSync(candidatePkg)) {
        logger.info(`根目录无package.json，使用子目录: ${candidateDir}`)
        return candidateDir
      }
    }

    // 在一级子目录中自动挑选最可能的项目目录
    try {
      const ignored = new Set([
        'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
        'logs', 'log', 'temp', 'tmp', 'data', 'uploads'
      ])

      const scoreDir = (name: string): number => {
        const n = name.toLowerCase()
        if (n === 'client' || n === 'frontend' || n === 'web') return 100
        if (n.includes('client') || n.includes('front') || n.includes('web')) return 90
        if (n === 'backend' || n === 'server') return 70
        if (n.includes('back') || n.includes('server')) return 60
        return 40
      }

      const candidates: Array<{ dir: string; score: number; name: string }> = []
      const entries = readdirSync(absoluteDirectory, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (ignored.has(entry.name.toLowerCase())) continue
        const candidateDir = join(absoluteDirectory, entry.name)
        const candidatePkg = join(candidateDir, 'package.json')
        if (existsSync(candidatePkg)) {
          candidates.push({ dir: candidateDir, score: scoreDir(entry.name), name: entry.name })
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score)
        const selected = candidates[0]
        logger.info('根目录无package.json，自动选择子目录作为工作目录', {
          baseDirectory: absoluteDirectory,
          selected: selected.dir,
          candidateCount: candidates.length
        })
        return selected.dir
      }
    } catch (error) {
      logger.warn('扫描子目录失败，继续使用原目录', {
        directory: absoluteDirectory,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    // 如果都没有package.json，但目录存在，仍然返回目录
    logger.warn(`目录 ${absoluteDirectory} 中没有找到package.json，但仍将使用此目录`)
    return absoluteDirectory
  }

  /**
   * 验证启动脚本是否有效
   */
  async validateScript(script: string, cwd: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      // 确定实际的工作目录（考虑全栈项目）
      const actualCwd = await this.determineActualWorkingDirectory(cwd)

      // 如果是npm脚本，验证package.json中是否存在
      if (script.startsWith('npm run ')) {
        // 提取脚本名称，忽略参数（例如 "npm run dev -- --host 0.0.0.0" -> "dev"）
        let scriptName = script.replace('npm run ', '').trim()

        // 如果包含 " -- "，只取第一部分作为脚本名称
        if (scriptName.includes(' -- ')) {
          scriptName = scriptName.split(' -- ')[0].trim()
        }

        // 如果包含空格，只取第一个单词作为脚本名称
        if (scriptName.includes(' ')) {
          scriptName = scriptName.split(' ')[0].trim()
        }

        const pkg = await this.readPackageJson(actualCwd)

        if (!pkg) {
          return {
            isValid: false,
            error: `在目录 ${actualCwd} 中未找到 package.json 文件`
          }
        }

        if (!pkg.scripts) {
          return {
            isValid: false,
            error: `package.json 中没有 scripts 字段，无法执行 "${script}"`
          }
        }

        if (!pkg.scripts[scriptName]) {
          const availableScripts = Object.keys(pkg.scripts).join(', ')
          return {
            isValid: false,
            error: `package.json 中不存在脚本 "${scriptName}"。可用脚本: ${availableScripts || '无'}`
          }
        }
      }

      // 如果是npm start，验证package.json中是否有start脚本或main字段
      if (script === 'npm start' || script.startsWith('npm start ')) {
        const pkg = await this.readPackageJson(actualCwd)

        if (!pkg) {
          return {
            isValid: false,
            error: `在目录 ${actualCwd} 中未找到 package.json 文件`
          }
        }

        // npm start可以通过scripts.start或main字段工作
        if (!pkg.scripts?.start && !pkg.main) {
          return {
            isValid: false,
            error: `package.json 中既没有 "start" 脚本也没有 "main" 字段，无法执行 "npm start"`
          }
        }
      }

      return { isValid: true }
    } catch (error) {
      return {
        isValid: false,
        error: `脚本验证时发生错误: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 从 package.json 的 scripts 推断启动脚本
   * 开发优先级：dev > start > serve > preview
   * 生产优先级：build+start > preview > serve > start > dev
   * 
   * 增强逻辑：
   * - 生产模式下，如果没有 start 脚本，智能选择其他可用脚本
   * - 对于前端项目，preview 脚本通常是生产构建后的预览，优先级高
   * - 确保总能找到一个可用的脚本
   */
  private inferScriptFromPackageJson(pkg: any | null, preferProd: boolean): string | null {
    if (!pkg || !pkg.scripts) return null
    const scripts = pkg.scripts as Record<string, string>

    if (preferProd) {
      // 生产模式：更智能的脚本选择

      // 1. 如果有 build 和 start 脚本，这通常是完整的生产配置
      if (scripts.build && scripts.start) {
        logger.info('生产模式：使用 build + start 脚本组合')
        return 'npm run start'
      }

      // 2. preview 脚本通常用于预览生产构建，优先级高
      if (scripts.preview) {
        logger.info('生产模式：使用 preview 脚本（生产构建预览）')
        return 'npm run preview'
      }

      // 3. serve 脚本可能是生产服务器
      if (scripts.serve) {
        logger.info('生产模式：使用 serve 脚本')
        return 'npm run serve'
      }

      // 4. 如果有 start 脚本，使用它
      if (scripts.start) {
        logger.info('生产模式：使用 start 脚本')
        return 'npm run start'
      }

      // 5. 最后的选择：dev 脚本（至少能运行）
      if (scripts.dev) {
        logger.warn('生产模式：没有找到生产脚本，降级使用 dev 脚本')
        return 'npm run dev'
      }

      logger.error('生产模式：没有找到任何可用的启动脚本')
      return null
    } else {
      // 开发模式：优先 dev，其次 start/serve/preview
      if (scripts.dev) return 'npm run dev'
      if (scripts.start) return 'npm run start'
      if (scripts.serve) return 'npm run serve'
      if (scripts.preview) return 'npm run preview'
      return null
    }
  }

  /**
   * 根据技术栈兜底推断脚本
   */
  private inferScriptByTech(tech?: string, preferProd: boolean = false): string {
    const t = (tech || '').toLowerCase()
    if (!preferProd) {
      if (t.includes('vue') || t.includes('nuxt') || t.includes('vite')) return 'npm run dev'
      if (t.includes('react') || t.includes('next')) return 'npm start'
      if (t.includes('node') || t.includes('express') || t.includes('nest') || t.includes('koa') || t.includes('fastify')) return 'npm start'
      return 'npm run dev'
    } else {
      // 生产环境：前端框架优先使用 preview，其它使用 start
      if (t.includes('vite') || t.includes('vue') || t.includes('nuxt')) return 'npm run preview'
      if (t.includes('react') || t.includes('next')) return 'npm start'
      if (t.includes('node') || t.includes('express') || t.includes('nest') || t.includes('koa') || t.includes('fastify')) return 'npm start'
      return 'npm start'
    }
  }

  /**
   * 为前端（Vite/Vue/Nuxt 等）添加 --host/--port 参数，支持局域网访问与固定端口。
   * - 支持 dev/serve/preview 三种常见脚本
   */
  private addHostParameter(script: string, tech?: string, port?: number): string {
    const t = (tech || '').toLowerCase()

    // 仅在前端技术栈下处理
    if (t.includes('vite') || t.includes('vue') || t.includes('nuxt')) {
      const needsHost = !script.includes('--host')
      const needsPort = typeof port === 'number' && !Number.isNaN(port) && !script.includes('--port')

      // 支持 dev/serve/preview
      const isDev = script.includes('npm run dev')
      const isServe = script.includes('npm run serve')
      const isPreview = script.includes('npm run preview')

      if ((isDev || isServe || isPreview) && (needsHost || needsPort)) {
        const extras: string[] = []
        if (needsHost) extras.push('--host', '0.0.0.0')
        if (needsPort && port) extras.push('--port', String(port))
        if (extras.length > 0) {
          return `${script} -- ${extras.join(' ')}`
        }
      }
    }

    return script
  }

  /**
   * 获取备用脚本
   */
  private getFallbackScript(pkg: any | null, preferProd: boolean): string | null {
    if (!pkg || !pkg.scripts) return null

    const scripts = pkg.scripts as Record<string, string>
    const availableScripts = Object.keys(scripts)

    if (availableScripts.length === 0) return null

    // 按优先级尝试备用脚本
    const fallbackPriority = preferProd
      ? ['start', 'preview', 'serve', 'dev', 'build']
      : ['dev', 'start', 'serve', 'preview', 'build']

    for (const scriptName of fallbackPriority) {
      if (scripts[scriptName]) {
        return scriptName === 'start' ? 'npm start' : `npm run ${scriptName}`
      }
    }

    // 如果没有找到常见脚本，返回第一个可用脚本
    const firstScript = availableScripts[0]
    return firstScript === 'start' ? 'npm start' : `npm run ${firstScript}`
  }

  /**
   * 将npm脚本转换为PM2可以理解的格式
   * Windows 上返回 'npm.cmd'，其他平台返回 'npm'
   */
  private convertScriptForPM2(script: string): string {
    if (script.startsWith('npm run ') || script === 'npm start') {
      // Windows 上使用 npm.cmd，其他平台使用 npm
      return process.platform === 'win32' ? 'npm.cmd' : 'npm'
    }
    return script
  }

  /**
   * 获取脚本参数
   * 包括 npm 命令参数和额外的参数（如 --host 0.0.0.0）
   */
  private getScriptArgs(script: string): string[] | undefined {
    if (script.startsWith('npm run ')) {
      // 提取脚本名称和额外参数
      const afterNpmRun = script.replace('npm run ', '')

      // 检查是否包含 " -- " 分隔符
      if (afterNpmRun.includes(' -- ')) {
        const [scriptName, ...extraArgs] = afterNpmRun.split(' -- ')

        // 构建参数数组: ['run', 'dev', '--', '--host', '0.0.0.0']
        const args = ['run', scriptName.trim()]

        // 添加 -- 分隔符和额外参数
        if (extraArgs.length > 0) {
          args.push('--')
          // 将所有额外参数合并后再分割(处理多个参数的情况)
          const allExtraArgs = extraArgs.join(' -- ').trim().split(/\s+/)
          args.push(...allExtraArgs)
        }

        return args
      } else {
        // 没有额外参数,只有脚本名称
        const parts = afterNpmRun.split(/\s+/)
        const scriptName = parts[0]
        const extraArgs = parts.slice(1)

        const args = ['run', scriptName]

        // 如果有额外参数(不是通过 -- 分隔的),也添加
        if (extraArgs.length > 0) {
          args.push('--')
          args.push(...extraArgs)
        }

        return args
      }
    }
    if (script === 'npm start') {
      return ['start']
    }
    return undefined
  }

  /**
   * 获取 Windows 上 npm 脚本的 interpreter 配置
   * 在Windows上，npm.cmd是批处理文件，需要设置 interpreter: 'none' 让PM2直接执行
   */
  private getWindowsInterpreter(script: string): { interpreter?: string; interpreter_args?: string[] } {
    // 如果是npm脚本且在Windows上，显式设置 interpreter: 'none'
    if (process.platform === 'win32' && (script.startsWith('npm run ') || script === 'npm start')) {
      return { interpreter: 'none' }
    }
    return {}
  }

  /**
   * 解析 PM2 启动验证超时时间（毫秒）
   * 默认 30s，可通过 PM2_START_VERIFY_TIMEOUT_MS 覆盖（最小 5s）
   */
  private resolvePm2StartVerifyTimeoutMs(): number {
    const raw = String(process.env.PM2_START_VERIFY_TIMEOUT_MS || '').trim()
    const parsed = Number.parseInt(raw, 10)

    if (!Number.isNaN(parsed) && parsed >= 5000) {
      return parsed
    }

    return 30000
  }

  /**
   * Windows 上优化 npm 脚本启动：
   * - Vite 常见脚本改为直接执行 vite.js，避免 npm.cmd + interpreter:none 触发 spawn EINVAL
   * - 其他 npm 脚本使用 cmd.exe /c 包装，提升 PM2 兼容性
   */
  private async optimizeWindowsNpmCommand(cleanConfig: any, rawScript: string, cwd?: string): Promise<void> {
    if (process.platform !== 'win32') return
    if (!rawScript || (!rawScript.startsWith('npm run ') && rawScript !== 'npm start')) return
    if (!cleanConfig || (cleanConfig.script !== 'npm.cmd' && cleanConfig.script !== 'npm')) return

    const args = Array.isArray(cleanConfig.args)
      ? cleanConfig.args.map((arg: unknown) => String(arg))
      : []

    const isRunCommand = args[0] === 'run'
    const scriptName = isRunCommand ? args[1] : (args[0] === 'start' ? 'start' : '')
    const separatorIndex = args.indexOf('--')
    const extraArgs = separatorIndex >= 0
      ? args.slice(separatorIndex + 1)
      : (isRunCommand ? args.slice(2) : args.slice(1))

    // 优先尝试将 vite 脚本转换为直接 Node 入口，避免 npm.cmd 兼容问题
    if (cwd && ['dev', 'preview', 'serve'].includes(scriptName)) {
      const viteEntry = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js')
      try {
        const stat = await fs.stat(viteEntry)
        if (stat.isFile()) {
          cleanConfig.script = viteEntry
          cleanConfig.args = [scriptName, ...extraArgs]
          if (cleanConfig.interpreter) delete cleanConfig.interpreter
          if ((cleanConfig as any).interpreter_args) delete (cleanConfig as any).interpreter_args

          logger.info('Windows npm 脚本已转换为直接 vite 入口，规避 npm.cmd 启动异常', {
            name: cleanConfig.name,
            viteEntry,
            scriptName
          })
          return
        }
      } catch {
        // vite 入口不存在时走通用回退
      }
    }

    // 通用回退：通过 cmd.exe /c 执行 npm 命令，避免 PM2 直接 spawn npm.cmd 的 EINVAL
    const comSpec = process.env.ComSpec || 'cmd.exe'
    cleanConfig.script = comSpec
    cleanConfig.args = ['/d', '/s', '/c', rawScript]
    if (cleanConfig.interpreter) delete cleanConfig.interpreter
    if ((cleanConfig as any).interpreter_args) delete (cleanConfig as any).interpreter_args

    logger.warn('Windows npm 脚本已切换为 cmd 包装启动模式（兼容回退）', {
      name: cleanConfig.name,
      command: cleanConfig.script,
      rawScript
    })
  }

  /** 在 Windows 上定位 npm.cmd 路径 */
  private findNpmCommand(): string {
    if (process.platform !== 'win32') return 'npm'
    const candidates = [
      'npm.cmd',
      'npm',
      process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'npm.cmd') : '',
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'npm.cmd') : '',
      process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'] as string, 'nodejs', 'npm.cmd') : ''
    ].filter(Boolean) as string[]
    for (const p of candidates) {
      try {
        const fsSync = require('fs') as typeof import('fs')
        if (fsSync.existsSync(p)) return p
      } catch { }
    }
    return 'npm.cmd'
  }

  /**
   * 检测应用实际使用的端口
   */
  private async detectActualPort(cwd: string, configuredPort?: number): Promise<number> {
    if (!cwd) {
      return configuredPort || 3000
    }

    try {
      const { readFileSync, existsSync } = await import('fs')
      const { join } = await import('path')

      // 检查主要的启动文件
      const possibleFiles = ['index.js', 'server.js', 'app.js', 'main.js']

      for (const file of possibleFiles) {
        const filePath = join(cwd, file)
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf-8')

            // 查找硬编码的端口号
            const portMatches = content.match(/\.listen\s*\(\s*(\d+)/g)
            if (portMatches && portMatches.length > 0) {
              const portMatch = portMatches[0].match(/(\d+)/)
              if (portMatch) {
                const detectedPort = parseInt(portMatch[1])
                logger.info('检测到应用硬编码端口', {
                  file: filePath,
                  detectedPort,
                  configuredPort
                })
                return detectedPort
              }
            }
          } catch (error) {
            // 忽略文件读取错误，继续检查下一个文件
          }
        }
      }
    } catch (error) {
      logger.warn('端口检测失败，使用配置端口', { cwd, error })
    }

    return configuredPort || 3000
  }

  /**
   * 检测应用实际使用的端口
   * 
   * 🔧 重要修复：门户系统分配的端口具有最高优先级
   * - 如果门户已分配端口（configuredPort），直接使用，不再检测应用配置
   * - 只有当门户未分配端口时，才从应用 .env 文件中检测
   * 
   * 这确保了从门户启动的应用始终使用门户分配的端口
   */
  private async detectActualPortEnhanced(cwd: string, configuredPort?: number): Promise<number> {
    // 🔧 修复：如果门户已分配端口，直接使用，不再检测应用自己的配置
    // 这是根本性修复：确保门户分配的端口优先级最高
    if (configuredPort && configuredPort > 0) {
      logger.info('使用门户系统分配的端口（优先级最高）', { configuredPort, cwd })
      return configuredPort
    }

    if (!cwd) return 3000

    try {
      const { readFileSync, existsSync } = await import('fs')
      const { join } = await import('path')

      // 只有当门户未分配端口时，才从应用 .env 文件中检测
      logger.info('门户未分配端口，从应用配置中检测', { cwd })

      // .env files
      const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local']
      for (const env of envFiles) {
        const p = join(cwd, env)
        if (existsSync(p)) {
          try {
            const text = readFileSync(p, 'utf-8')
            const m = text.match(/^(PORT|VITE_PORT|NEXT_PUBLIC_PORT|NUXT_PORT)\s*=\s*(\d+)/m)
            if (m && m[2]) {
              const detected = parseInt(m[2])
              if (!Number.isNaN(detected)) {
                logger.info('从应用 .env 检测到端口', { file: env, detected })
                return detected
              }
            }
          } catch { }
        }
      }

      // package.json scripts
      const pkgPath = join(cwd, 'package.json')
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
          const scripts = pkg.scripts || {}
          for (const key of Object.keys(scripts)) {
            const s = String(scripts[key])
            const byArg = s.match(/--port\s+(\d{2,5})/)
            if (byArg && byArg[1]) {
              const detected = parseInt(byArg[1])
              if (!Number.isNaN(detected)) return detected
            }
            const byEnv = s.match(/PORT\s*=\s*(\d{2,5})/)
            if (byEnv && byEnv[1]) {
              const detected = parseInt(byEnv[1])
              if (!Number.isNaN(detected)) return detected
            }
          }
        } catch { }
      }

      // Inspect common JS entry files
      const possibleFiles = ['index.js', 'server.js', 'app.js', 'main.js']
      for (const file of possibleFiles) {
        const filePath = join(cwd, file)
        if (existsSync(filePath)) {
          try {
            const content = readFileSync(filePath, 'utf-8')
            const portMatches = content.match(/\.listen\s*\(\s*(\d+)/g)
            if (portMatches && portMatches.length > 0) {
              const m = portMatches[0].match(/(\d+)/)
              if (m) return parseInt(m[1])
            }
          } catch { }
        }
      }

      // Framework defaults
      try {
        const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'))
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
        if (deps.vite) return 5173
        if (deps.next) return 3000
        if (deps.nuxt || deps['nuxt3']) return 3000
        if (deps['@angular/cli']) return 4200
        if (deps['react-scripts']) return 3000
      } catch { }
    } catch { }

    return configuredPort || 3000
  }

  private async ensurePortAvailable(desiredPort: number, attempts: number = 20): Promise<number> {
    const net = await import('node:net')

    const canListen = (port: number) =>
      new Promise<boolean>((resolve) => {
        const server = net.createServer()
        server.once('error', () => {
          server.close(() => resolve(false))
        })
        server.once('listening', () => {
          server.close(() => resolve(true))
        })
        server.listen(port, '0.0.0.0')
      })

    for (let i = 0; i < attempts; i++) {
      const port = desiredPort + i
      if (await canListen(port)) {
        return port
      }
    }

    logger.warn('No available port found near desired port', { desiredPort })
    return desiredPort
  }

  private normalizeProcessName(input: string): string {
    return String(input || '').trim().toLowerCase().replace(/[-_\s]/g, '')
  }

  private normalizePathForCompare(input?: string): string | null {
    if (!input || typeof input !== 'string') return null
    try {
      const resolved = path.resolve(input.trim())
      return process.platform === 'win32' ? resolved.toLowerCase() : resolved
    } catch {
      return null
    }
  }

  private async getListeningPortsByPid(pid: number): Promise<number[]> {
    if (!Number.isInteger(pid) || pid <= 0) {
      return []
    }

    if (process.platform !== 'win32') {
      logger.debug('仅在 Windows 平台执行 PID 端口检测', { pid })
      return []
    }

    return new Promise<number[]>((resolve) => {
      const ports = new Set<number>()
      const child = spawn('netstat', ['-ano'], { shell: true, windowsHide: true })
      let output = ''
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        const result = Array.from(ports).sort((a, b) => a - b)
        resolve(result)
      }

      const timeout = setTimeout(() => {
        try { child.kill() } catch { }
        finish()
      }, 3000)

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        logger.warn('执行 netstat 失败，无法检测 EXE 实际监听端口', {
          pid,
          error: error instanceof Error ? error.message : String(error)
        })
        finish()
      })

      child.on('close', () => {
        clearTimeout(timeout)
        const lines = output.split(/\r?\n/)

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue

          // Windows netstat 样例:
          // TCP    0.0.0.0:8317    0.0.0.0:0    LISTENING    5344
          // TCP    [::]:8317       [::]:0       LISTENING    5344
          const parts = line.split(/\s+/)
          if (parts.length < 5) continue

          const state = parts[3]
          const linePid = Number(parts[4])
          if (state !== 'LISTENING' || linePid !== pid) continue

          const localAddress = parts[1]
          const portMatch = localAddress.match(/:(\d+)$/)
          if (!portMatch) continue

          const port = Number(portMatch[1])
          if (Number.isInteger(port) && port > 0 && port <= 65535) {
            ports.add(port)
          }
        }

        finish()
      })
    })
  }

  private async getListeningPidsByPort(port: number): Promise<number[]> {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      return []
    }

    if (process.platform !== 'win32') {
      logger.debug('仅在 Windows 平台执行端口 -> PID 检测', { port })
      return []
    }

    return new Promise<number[]>((resolve) => {
      const pids = new Set<number>()
      const child = spawn('netstat', ['-ano'], { shell: true, windowsHide: true })
      let output = ''
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        resolve(Array.from(pids).sort((a, b) => a - b))
      }

      const timeout = setTimeout(() => {
        try { child.kill() } catch { }
        finish()
      }, 3000)

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        logger.warn('执行 netstat 失败，无法按端口反查 PID', {
          port,
          error: error instanceof Error ? error.message : String(error)
        })
        finish()
      })

      child.on('close', () => {
        clearTimeout(timeout)
        const lines = output.split(/\r?\n/)
        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue

          const parts = line.split(/\s+/)
          if (parts.length < 5) continue

          const state = parts[3]
          if (state !== 'LISTENING') continue

          const localAddress = parts[1]
          const portMatch = localAddress.match(/:(\d+)$/)
          if (!portMatch) continue

          const linePort = Number(portMatch[1])
          if (linePort !== port) continue

          const pid = Number(parts[4])
          if (Number.isInteger(pid) && pid > 0) {
            pids.add(pid)
          }
        }
        finish()
      })
    })
  }

  private async getProcessImageNameByPid(pid: number): Promise<string | null> {
    if (!Number.isInteger(pid) || pid <= 0) {
      return null
    }

    if (process.platform !== 'win32') {
      return null
    }

    return new Promise<string | null>((resolve) => {
      const child = spawn(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { shell: true, windowsHide: true }
      )
      let output = ''
      let settled = false

      const finish = (value: string | null = null) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const timeout = setTimeout(() => {
        try { child.kill() } catch { }
        finish(null)
      }, 2000)

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString()
      })

      child.on('error', () => {
        clearTimeout(timeout)
        finish(null)
      })

      child.on('close', () => {
        clearTimeout(timeout)
        const firstLine = output
          .split(/\r?\n/)
          .map(line => line.trim())
          .find(line => line.length > 0)

        if (!firstLine || /^INFO:/i.test(firstLine)) {
          finish(null)
          return
        }

        const match = firstLine.match(/^"([^"]+)"/)
        finish(match?.[1] || null)
      })
    })
  }

  async inspectExternalExePort(
    processName: string,
    expectedPort?: number,
    scriptPath?: string
  ): Promise<ExternalExePortInspection> {
    const normalizedExpected = Number.isInteger(expectedPort)
      ? Number(expectedPort)
      : null
    const expectedImageName = typeof scriptPath === 'string' && scriptPath.trim().length > 0
      ? path.basename(scriptPath).toLowerCase()
      : null

    const normalizedTarget = this.normalizeProcessName(processName)
    const processes = await this.getProcessList()
    const processInfo = processes.find((proc) => {
      if (proc.name === processName) return true
      return this.normalizeProcessName(proc.name) === normalizedTarget
    })

    if (!processInfo) {
      return {
        ok: false,
        processName,
        pid: null,
        expectedPort: normalizedExpected,
        actualPort: null,
        listeningPorts: [],
        reason: 'PM2 process not found'
      }
    }

    const pid = Number(processInfo.pid)
    if (!Number.isInteger(pid) || pid <= 0) {
      // Windows + external EXE 场景下，PM2 偶发出现 online 但 pid=N/A。
      // 此时尝试通过 expectedPort 反查监听 PID 进行兜底，避免误报“未监听端口”。
      if (normalizedExpected !== null) {
        const candidatePids = await this.getListeningPidsByPort(normalizedExpected)
        if (candidatePids.length > 0) {
          let matchedPid: number | null = null
          let matchedByImage = false

          if (expectedImageName) {
            for (const candidatePid of candidatePids) {
              const imageName = await this.getProcessImageNameByPid(candidatePid)
              if (imageName && imageName.toLowerCase() === expectedImageName) {
                matchedPid = candidatePid
                matchedByImage = true
                break
              }
            }
          }

          // 如果无法获取镜像名，且端口仅被一个进程占用，仍允许作为兜底通过
          if (matchedPid === null && candidatePids.length === 1) {
            matchedPid = candidatePids[0]
          }

          if (matchedPid !== null) {
            logger.warn('PM2 PID 不可用，已通过端口反查确认 external-exe 监听', {
              processName: processInfo.name,
              expectedPort: normalizedExpected,
              matchedPid,
              candidatePids,
              expectedImageName,
              matchedByImage
            })

            return {
              ok: true,
              processName: processInfo.name,
              pid: matchedPid,
              expectedPort: normalizedExpected,
              actualPort: normalizedExpected,
              listeningPorts: [normalizedExpected],
              reason: 'PM2 PID unavailable; matched listening port via fallback probe'
            }
          }

          return {
            ok: false,
            processName: processInfo.name,
            pid: null,
            expectedPort: normalizedExpected,
            actualPort: null,
            listeningPorts: [],
            reason: expectedImageName
              ? `Expected port ${normalizedExpected} is listening, but no PID matched image ${expectedImageName}`
              : `Expected port ${normalizedExpected} is listening, but unable to map PID reliably`
          }
        }
      }

      return {
        ok: false,
        processName: processInfo.name,
        pid: null,
        expectedPort: normalizedExpected,
        actualPort: null,
        listeningPorts: [],
        reason: 'PM2 process PID is not available'
      }
    }

    const listeningPorts = await this.getListeningPortsByPid(pid)
    const expectedListening = normalizedExpected !== null
      ? listeningPorts.includes(normalizedExpected)
      : false

    let actualPort: number | null = null
    if (expectedListening && normalizedExpected !== null) {
      actualPort = normalizedExpected
    } else if (listeningPorts.length === 1) {
      actualPort = listeningPorts[0]
    } else if (listeningPorts.length > 1) {
      actualPort = listeningPorts[0]
    }

    return {
      ok: normalizedExpected !== null ? expectedListening : listeningPorts.length > 0,
      processName: processInfo.name,
      pid,
      expectedPort: normalizedExpected,
      actualPort,
      listeningPorts,
      reason: listeningPorts.length === 0 ? 'No listening TCP port detected for process PID' : undefined
    }
  }

  private analyzePM2Error(err: any, config: any): string[] {
    const causes: string[] = []

    // 检查常见错误模式
    if (err.message?.includes('ENOENT') || err.code === 'ENOENT') {
      causes.push('文件或目录不存在，请检查工作目录和脚本路径')
    }

    if (err.message?.includes('EACCES') || err.code === 'EACCES') {
      causes.push('权限不足，请检查目录和文件权限')
    }

    if (config.script?.startsWith('npm')) {
      causes.push('npm脚本可能不存在，请检查package.json中的scripts字段')
    }

    if (!config.cwd) {
      causes.push('未指定工作目录，可能导致脚本执行失败')
    }

    return causes
  }

  /**
   * 构建详细的错误消息
   */
  private buildDetailedErrorMessage(err: any, config: any): string {
    const causes = this.analyzePM2Error(err, config)
    let message = `PM2启动失败: ${err.message || '未知错误'}`

    if (causes.length > 0) {
      message += `\n\n可能的原因:\n${causes.map(cause => `• ${cause}`).join('\n')}`
    }

    message += `\n\n配置信息:\n• 应用名称: ${config.name}\n• 启动脚本: ${config.script}\n• 工作目录: ${config.cwd || '未指定'}`

    return message
  }

  /**
   * 映射PM2状态
   */
  private mapStatus(status: any): PM2Process['status'] {
    switch (status) {
      case 'online':
        return 'online'
      case 'stopped':
        return 'stopped'
      case 'stopping':
        return 'stopping'
      case 'launching':
        return 'launching'
      case 'errored':
        return 'error'
      default:
        return 'stopped'
    }
  }

  /**
   * 生成PM2配置
   */
  async generateConfig(
    apps: Array<{ name?: string; script?: string; port?: number } | string>,
    options: Partial<PM2Config> = {}
  ): Promise<PM2EcosystemConfig> {
    // 优先根据 env_production 或 NODE_ENV=production 判断生产模式
    // exec_mode 和 watch 不应该影响脚本选择
    const preferProd =
      Boolean(options.env_production) ||
      String((options.env && (options.env as any).NODE_ENV) || '').toLowerCase() === 'production' ||
      String((options.env_production && (options.env_production as any).NODE_ENV) || '').toLowerCase() === 'production'

    const results: PM2Config[] = []

    for (const item of apps) {
      try {
        let name = 'app'
        let scriptFromInput: string | undefined
        let port: number | undefined
        let cwd: string | undefined
        let tech: string | undefined
        let secondaryPort: number | undefined  // 🔧 新增：用于保存backend端口

        if (typeof item === 'string') {
          // Treat as application ID, resolve via ApplicationService if available
          const appId = item
          if (this.applicationService) {
            try {
              const app: any = await (this.applicationService as any).findById(appId)
              name = app?.name || appId
              cwd = app?.directory
              // 先获取primary port
              port = app?.network?.primaryPort
              // 正确提取techStack字符串值
              tech = app?.techStack?.name || app?.techStack?.category || app?.fullStack?.type || ''
              const normalizedTech = String(tech || '').toLowerCase()

              if (!scriptFromInput && normalizedTech === 'external-exe') {
                const storedBuildScript = app?.buildScript || app?.build_script
                if (typeof storedBuildScript === 'string' && storedBuildScript.trim()) {
                  scriptFromInput = storedBuildScript.trim()
                  logger.info('external-exe 应用使用已保存脚本', {
                    appName: name,
                    script: scriptFromInput
                  })
                }
              }

              // 🔧 修复：对于全栈项目，始终获取 secondaryPort（后端端口）
              // 这样当工作目录切换到 backend 时可以使用正确的端口
              if (app?.network?.secondaryPorts && app?.network?.secondaryPorts.length > 0) {
                secondaryPort = app.network.secondaryPorts[0]
                logger.info('检测到全栈项目端口配置', {
                  appName: name,
                  primaryPort: port,
                  secondaryPort,
                  hasSecondaryPorts: true
                })
              }

              // 🔧 额外检查：如果应用目录包含 backend 子目录，很可能是全栈项目
              // 这种情况下 secondaryPort 就是后端端口
              if (!secondaryPort && app?.directory) {
                const { existsSync } = await import('fs')
                const { join } = await import('path')
                const backendDir = join(app.directory, 'backend')
                const serverDir = join(app.directory, 'server')
                if (existsSync(backendDir) || existsSync(serverDir)) {
                  // 如果有 backend 目录但没有 secondaryPort，使用 primaryPort + 5000 作为后端端口的猜测
                  // 或者直接检查 backend/.env 中的端口
                  logger.info('检测到全栈项目结构（有backend目录）', {
                    appName: name,
                    backendDir: existsSync(backendDir) ? backendDir : serverDir,
                    note: '将在确定工作目录后选择正确端口'
                  })
                }
              }
            } catch (err) {
              logger.warn('按ID查询应用信息失败，将使用兜底信息继续', { appId, error: err instanceof Error ? err.message : String(err) })
              name = appId
            }
          } else {
            logger.warn('ApplicationService 未注入，无法按ID查询应用，继续使用传入基本信息', { appId })
            name = appId
          }
        } else {
          // Direct object
          name = item.name || 'app'
          scriptFromInput = item.script
          port = item.port
          // Try resolve extra info via applicationService if available (by name)
          if (this.applicationService) {
            try {
              const apps = await (this.applicationService as any).findAll()
              const matched = (apps as any[]).find(a => a.name === name)
              if (matched) {
                cwd = matched.directory
                if (!port) port = matched.network?.primaryPort
                tech = matched?.techStack?.name || matched?.techStack?.category || matched?.techStack || matched?.fullStack?.type || tech
              }
            } catch { }
          }
        }

        // Ensure cwd exists if provided and determine actual working directory
        if (cwd) {
          try {
            const stat = await fs.stat(cwd)
            if (!stat.isDirectory()) {
              logger.warn('应用目录不是目录，将忽略 cwd', { name, cwd })
              cwd = undefined
            } else {
              // 确定实际的工作目录（考虑全栈项目）
              const originalCwd = cwd
              cwd = await this.determineActualWorkingDirectory(cwd, preferProd)
              logger.info('确定实际工作目录', { name, originalCwd, actualCwd: cwd })

              // 🔧 修复：如果工作目录切换到了backend子目录，使用backend端口
              const workingDirName = path.basename(cwd).toLowerCase()
              const isBackendWorkingDir = workingDirName === 'backend' || workingDirName === 'server'
              if (cwd !== originalCwd && isBackendWorkingDir && secondaryPort) {
                logger.info('工作目录切换到backend，使用backend端口', {
                  name,
                  originalPort: port,
                  backendPort: secondaryPort
                })
                port = secondaryPort
              }
            }
          } catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e)
            logger.error('无法访问应用目录', { name, cwd, error: errorMessage })

            // 如果是路径不存在的错误，抛出更明确的错误
            if (errorMessage.includes('does not exist')) {
              throw new Error(`Script not found: ${cwd}`)
            }

            cwd = undefined
          }
        }

        // Try read package.json and infer best script
        let script = scriptFromInput
        let pkg: any | null = null
        if (cwd) {
          pkg = await this.readPackageJson(cwd)
        }
        if (!script) {
          script = this.inferScriptFromPackageJson(pkg, preferProd) || this.inferScriptByTech(tech, preferProd)
        }
        if (!script) {
          script = preferProd ? 'npm start' : 'npm run dev'
        }

        // 验证生成的脚本是否有效
        if (cwd && script) {
          const validation = await this.validateScript(script, cwd)
          if (!validation.isValid) {
            logger.warn(`应用 ${name} 的脚本验证失败，将尝试使用备用脚本`, {
              name,
              script,
              cwd,
              error: validation.error
            })

            // 尝试使用备用脚本
            const fallbackScript = this.getFallbackScript(pkg, preferProd)
            if (fallbackScript) {
              const fallbackValidation = await this.validateScript(fallbackScript, cwd)
              if (fallbackValidation.isValid) {
                script = fallbackScript
                logger.info(`应用 ${name} 使用备用脚本: ${script}`)
              } else {
                logger.warn(`应用 ${name} 的备用脚本也无效，将保持原脚本但可能启动失败`, {
                  fallbackScript,
                  error: fallbackValidation.error
                })
              }
            }
          }
        }

        const safeName = String(name || 'app').toLowerCase().replace(/\s+/g, '-')

        // 检测应用实际使用的端口
        const detectedPort = cwd ? await this.detectActualPortEnhanced(cwd, port) : (port ?? 3000)
        const availablePort = await this.ensurePortAvailable(detectedPort)
        if (availablePort !== detectedPort) {
          logger.warn('Port is occupied, using fallback port', { name: safeName, requestedPort: detectedPort, fallbackPort: availablePort })
        }

        // 为前端应用添加 --host/--port 参数以支持局域网访问和固定端口
        // external-exe 类型不添加 --host/--port（EXE 文件不支持这些参数）
        const normalizedTechForScript = String(tech || '').toLowerCase()
        const isExternalExe = normalizedTechForScript === 'external-exe'
        const finalScript = isExternalExe ? script : this.addHostParameter(script, tech, availablePort)

        // 获取 Windows interpreter 配置（如果需要）
        // external-exe 类型：强制 interpreter: 'none'，让 PM2 直接执行 .exe 文件
        const interpreterConfig = isExternalExe
          ? { interpreter: 'none' }
          : this.getWindowsInterpreter(finalScript)

        logger.info('PM2 配置生成', {
          name: safeName,
          script: finalScript,
          isExternalExe,
          interpreter: (interpreterConfig as any).interpreter
        })

        // 根据脚本/技术栈在生产环境强制前端使用单实例 + fork
        let instances = typeof options.instances === 'string' ? parseInt(options.instances) : (options.instances ?? 1)
        let execMode: 'fork' | 'cluster' = (options.exec_mode as 'fork' | 'cluster') ?? 'fork'

        const isNpmScript = typeof finalScript === 'string' && (finalScript.startsWith('npm run ') || finalScript === 'npm start')
        const isPreviewOrServe = finalScript.includes('npm run preview') || finalScript.includes('npm run serve')
        const isFrontendTech = (tech || '').toLowerCase().includes('vite') || (tech || '').toLowerCase().includes('vue') || (tech || '').toLowerCase().includes('nuxt')
        if (preferProd && isNpmScript && (isPreviewOrServe || isFrontendTech)) {
          if (instances !== 1 || execMode !== 'fork') {
            logger.info('生产环境前端应用：强制使用 fork + 单实例 以避免端口冲突', { name: safeName, originalInstances: instances, originalExecMode: execMode })
          }
          instances = 1
          execMode = 'fork'
        }

        const productionEnv = preferProd
          ? await this.prepareProductionEnv(cwd, availablePort, options.env_production)
          : {}

        const developmentEnv = {
          NODE_ENV: 'development',
          PORT: availablePort.toString(),
          HOST: '0.0.0.0', // 支持局域网访问
          ...(options.env || {})
        }

        results.push({
          name: safeName,
          script: finalScript,
          cwd,
          ...interpreterConfig, // 添加 Windows interpreter 配置
          instances,
          exec_mode: execMode,
          watch: options.watch ?? !preferProd,
          max_memory_restart: options.max_memory_restart || '500M',
          autorestart: options.autorestart ?? true,
          // 移除 merge_logs，这个字段可能导致PM2启动问题
          // 生产模式：将生产环境变量直接写入 env（PM2 默认只使用 env，不会自动套用 env_production）
          env: preferProd
            ? { ...productionEnv, ...(options.env || {}) }
            : developmentEnv,
          env_production: productionEnv
        })
      } catch (e) {
        logger.error('生成单个应用PM2配置失败，已跳过该应用', {
          error: e instanceof Error ? e.message : String(e),
          item
        })
        continue
      }
    }

    return { apps: results }
  }

  /**
   * 准备生产环境变量（包括验证和自动修复）
   * 
   * 🔧 重要：此方法会强制同步门户分配的端口到应用的 .env 文件
   */
  private async prepareProductionEnv(
    cwd: string | undefined,
    port: number,
    userEnv?: Record<string, any>
  ): Promise<Record<string, string>> {
    const baseEnv = {
      NODE_ENV: 'production',
      PORT: port.toString(),
      HOST: '0.0.0.0',
      ...(userEnv || {})
    }

    // 如果没有应用目录，直接返回基础环境变量
    if (!cwd) {
      return baseEnv
    }

    try {
      // 🔧 强制同步门户分配的端口到应用 .env 文件
      // 这确保应用使用 dotenv 加载 .env 文件时，使用的是门户分配的端口
      await this.syncPortToEnvFile(cwd, port)

      // 使用 envValidator 验证并自动修复环境变量
      const result = await envValidator.validateAndAutoFix(cwd, baseEnv)

      if (result.fixes && Object.keys(result.fixes).length > 0) {
        logger.info('自动生成生产环境变量', {
          cwd,
          generated: Object.keys(result.fixes)
        })

        // 持久化到 .env 文件
        try {
          await envValidator.persistEnvToFile(cwd, result.fixes)
          logger.info('环境变量已持久化到 .env 文件', { cwd })
        } catch (error) {
          logger.warn('持久化环境变量失败（不影响启动）', { error })
        }
      }

      if (!result.validation.valid && !result.validation.autoFixable) {
        logger.warn('环境变量验证失败且无法自动修复', {
          cwd,
          missing: result.validation.missing,
          invalid: result.validation.invalid
        })
      }

      return result.mergedEnv as Record<string, string>

    } catch (error) {
      logger.error('准备生产环境变量失败，使用默认配置', {
        error: error instanceof Error ? error.message : String(error),
        cwd
      })
      return baseEnv
    }
  }

  /**
   * 🔧 同步门户分配的端口到应用的 .env 文件
   * 
   * 这是确保PM2启动应用时使用正确端口的关键方法：
   * - 更新应用 .env 文件中的 PORT 变量
   * - 同时更新 API_PORT（用于后端服务）
   * - 确保应用使用 dotenv 加载时，读取到的是门户分配的端口
   */
  private async syncPortToEnvFile(cwd: string, port: number): Promise<void> {
    try {
      const { readFileSync, writeFileSync, existsSync } = await import('fs')
      const { join } = await import('path')

      // 需要更新的 .env 文件列表（按优先级）
      const envFiles = ['.env', '.env.production', '.env.local']

      for (const envFileName of envFiles) {
        const envPath = join(cwd, envFileName)

        if (existsSync(envPath)) {
          try {
            let content = readFileSync(envPath, 'utf-8')
            const originalContent = content
            let updated = false

            // 更新 PORT 变量
            if (/^PORT\s*=\s*\d+/m.test(content)) {
              content = content.replace(/^PORT\s*=\s*\d+/m, `PORT=${port}`)
              updated = true
            }

            // 更新 API_PORT 变量（后端服务常用）
            if (/^API_PORT\s*=\s*\d+/m.test(content)) {
              content = content.replace(/^API_PORT\s*=\s*\d+/m, `API_PORT=${port}`)
              updated = true
            }

            // 如果有变化，写回文件
            if (updated && content !== originalContent) {
              writeFileSync(envPath, content, 'utf-8')
              logger.info('✅ 已同步门户端口到应用 .env 文件', {
                file: envFileName,
                port,
                cwd
              })
            }
          } catch (err) {
            logger.warn('更新 .env 文件失败', {
              file: envFileName,
              error: err instanceof Error ? err.message : String(err)
            })
          }
        }
      }
    } catch (error) {
      logger.warn('同步端口到 .env 文件失败（不影响启动）', {
        error: error instanceof Error ? error.message : String(error),
        cwd,
        port
      })
    }
  }

  /**
   * 进阶：读取真实日志文件（支持 out/error/combined）
   */
  async getProcessLogsAdvanced(
    name: string,
    lines: number = 100,
    type: 'out' | 'error' | 'combined' = 'combined'
  ): Promise<string> {
    logger.debug('getProcessLogsAdvanced 开始', { name, lines, type })

    await this.connect()
    const desc = await this.describeProcessSafe(name)

    if (!desc) {
      logger.warn('获取进程描述失败', { name })
      return `无法获取进程 "${name}" 的信息，请确认进程名称正确`
    }

    const outPath = (desc?.pm2_env as any)?.pm_out_log_path as string | undefined
    const errPath = (desc?.pm2_env as any)?.pm_err_log_path as string | undefined
    const allPath = (desc?.pm2_env as any)?.pm_log_path as string | undefined

    logger.debug('日志路径信息', { name, outPath, errPath, allPath })

    const target = type === 'out' ? outPath : type === 'error' ? errPath : allPath || outPath || errPath
    if (!target) {
      logger.warn('日志文件路径未找到', { name, type, outPath, errPath, allPath })
      return 'Log file path not found'
    }

    logger.debug('目标日志文件', { name, type, target })

    const access = await pathSecurityManager.checkAccess({
      path: target,
      operation: 'read',
      user: {
        id: 'pm2-service',
        role: 'system',
        permissions: ['file:read']
      },
      context: {
        requestId: 'pm2-log-read-' + name + '-' + Date.now(),
        ip: 'local',
        userAgent: 'pm2-service'
      }
    })

    if (!access.allowed) {
      logger.warn('Log access denied', { name, type, file: target, reason: access.reason })
      return 'Unable to read logs: ' + (access.reason || 'access denied')
    }

    try {
      const logContent = await this.readLastLinesSafe(target, Math.max(1, Math.min(lines, 2000)))
      logger.debug('日志读取完成', { name, contentLength: logContent.length, preview: logContent.substring(0, 100) })
      return logContent
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('Failed to read log file', { name, type, file: target, error: msg })
      return 'Failed to read log file: ' + msg
    }
  }

  /** 包装：pm2.describe */
  private async describeProcessSafe(name: string): Promise<any | null> {
    try {
      await this.connect()
      return await new Promise((resolve, reject) => {
        pm2.describe(name, (err, list) => {
          if (err) return reject(err)
          resolve(list && list[0] ? list[0] : null)
        })
      })
    } catch (e) {
      logger.warn('describe 进程失败', { name, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }

  /** 读取文件最后 N 行（安全） */
  private async readLastLinesSafe(filePath: string, lineCount: number): Promise<string> {
    const fsNative = await import('fs')
    try {
      if (!fsNative.existsSync(filePath)) {
        return '日志文件不存在或尚未生成'
      }
      const fd = fsNative.openSync(filePath, 'r')
      try {
        const stat = fsNative.statSync(filePath)
        const chunkSize = 64 * 1024
        let position = Math.max(0, stat.size - chunkSize)
        let size = Math.min(chunkSize, stat.size)
        let buffer = Buffer.alloc(size)
        fsNative.readSync(fd, buffer, 0, size, position)
        let data = buffer.toString('utf8')
        let lines = data.split(/\r?\n/)
        while (lines.length <= lineCount && position > 0) {
          const nextPos = Math.max(0, position - chunkSize)
          size = position - nextPos
          buffer = Buffer.alloc(size)
          fsNative.readSync(fd, buffer, 0, size, nextPos)
          data = buffer.toString('utf8') + data
          lines = data.split(/\r?\n/)
          position = nextPos
        }
        return lines.slice(-lineCount).join('\n')
      } finally {
        fsNative.closeSync(fd)
      }
    } catch (e) {
      throw e
    }
  }

  /** 保存当前进程列表（pm2 save） */
  async saveProcesses(): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      const anyPm2 = pm2 as any
      const dump = typeof anyPm2.dump === 'function' ? anyPm2.dump : anyPm2.save
      if (typeof dump === 'function') {
        dump((err: any) => (err ? reject(err) : resolve()))
      } else {
        import('child_process').then(({ exec }) => {
          exec('pm2 save', (err) => (err ? reject(err) : resolve()))
        })
      }
    })
  }

  /** 从 dump 恢复（pm2 resurrect） */
  async resurrectProcesses(): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      const anyPm2 = pm2 as any
      if (typeof anyPm2.resurrect === 'function') {
        anyPm2.resurrect((err: any) => (err ? reject(err) : resolve()))
      } else {
        import('child_process').then(({ exec }) => {
          exec('pm2 resurrect', (err) => (err ? reject(err) : resolve()))
        })
      }
    })
  }

  async stopAll(): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      pm2.stop('all', (err) => (err ? reject(err) : resolve()))
    })
  }

  async restartAll(): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      pm2.restart('all', (err) => (err ? reject(err) : resolve()))
    })
  }

  async deleteAll(): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      pm2.delete('all', (err) => (err ? reject(err) : resolve()))
    })
  }

  async reloadProcess(name: string): Promise<void> {
    await this.connect()
    await new Promise<void>((resolve, reject) => {
      const anyPm2 = pm2 as any
      if (typeof anyPm2.reload === 'function') {
        anyPm2.reload(name, (err: any) => (err ? reject(err) : resolve()))
      } else {
        pm2.restart(name, (err) => (err ? reject(err) : resolve()))
      }
    })
  }

  async getPM2Info(): Promise<{ version: string; nodeVersion: string; platform: string; arch: string; pm2Home: string }> {
    const { homedir } = await import('os')
    const { join } = await import('path')
    let version = 'unknown'
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      version = require('pm2/package.json').version || 'unknown'
    } catch { }
    return {
      version,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pm2Home: process.env.PM2_HOME || join(homedir(), '.pm2')
    }
  }

  /**
   * 计算给定 PM2 配置与当前运行配置的差异
   */
  async diffConfig(target: PM2EcosystemConfig): Promise<{
    added: string[]
    removed: string[]
    changed: Array<{ name: string; before: Partial<PM2Config> | null; after: Partial<PM2Config> | null; changedFields: string[] }>
  }> {
    // 尝试获取当前进程列表，如果PM2未启用则使用空列表
    let processes: PM2Process[] = []
    try {
      processes = await this.getProcessList()
    } catch (error) {
      // PM2未启用或连接失败时，使用空进程列表
      logger.info('PM2未启用或连接失败，使用空进程列表进行配置对比', {
        error: error instanceof Error ? error.message : String(error)
      })
      processes = []
    }

    const current: Record<string, Partial<PM2Config>> = {}
    for (const p of processes) {
      current[p.name] = {
        name: p.name,
        script: p.script,
        cwd: p.cwd,
        instances: p.instances,
        exec_mode: p.exec_mode,
        watch: p.watch,
        max_memory_restart: p.max_memory_restart,
        env: p.env
      }
    }

    const desired: Record<string, Partial<PM2Config>> = {}
    for (const a of target.apps || []) {
      desired[String(a.name)] = {
        name: a.name,
        script: a.script,
        cwd: a.cwd,
        instances: a.instances,
        exec_mode: a.exec_mode,
        watch: a.watch,
        max_memory_restart: a.max_memory_restart,
        env: a.env
      }
    }

    const currentNames = new Set(Object.keys(current))
    const desiredNames = new Set(Object.keys(desired))

    const added = [...desiredNames].filter(n => !currentNames.has(n))
    const removed = [...currentNames].filter(n => !desiredNames.has(n))

    const intersect = [...desiredNames].filter(n => currentNames.has(n))
    const changed = intersect.map(name => {
      const before = current[name]
      const after = desired[name]
      const fields = ['script', 'cwd', 'instances', 'exec_mode', 'watch', 'max_memory_restart', 'env']
      const changedFields = fields.filter(f => JSON.stringify((before as any)?.[f]) !== JSON.stringify((after as any)?.[f]))
      return { name, before, after, changedFields }
    }).filter(x => x.changedFields.length > 0)

    return { added, removed, changed }
  }
}

export const pm2Service = new PM2Service()

