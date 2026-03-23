/**
 * Public API Controller - 公共访问API
 * 
 * 提供无需认证的公共API端点，用于门户展示
 */

import { Router, Request, Response } from 'express'
import { networkInterfaces } from 'os'
import net from 'net'
import { existsSync } from 'fs'
import { join } from 'path'
import { ApplicationService } from '../../core/ApplicationService'
import { logger } from '../../utils/logger'
import { PM2Service } from '../../services/pm2Service'

export class PublicController {
  private router = Router()
  private pm2Service: PM2Service | null = null
  private lanHostCache: { value: string | null; resolvedAt: number } | null = null

  constructor(
    private applicationService: ApplicationService,
    pm2Service?: PM2Service
  ) {
    this.pm2Service = pm2Service || null
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // GET /api/public/apps - 获取所有公共应用
    this.router.get('/apps', this.handleGetPublicApps.bind(this))

    // GET /api/public/apps/pinned - 获取固定到首页的应用 (必须在 :id 路由之前)
    this.router.get('/apps/pinned', this.handleGetPinnedApps.bind(this))

    // GET /api/public/apps/:id - 获取单个应用
    this.router.get('/apps/:id', this.handleGetPublicApp.bind(this))

    // GET /api/public/health - 系统健康状态
    this.router.get('/health', this.handleGetHealth.bind(this))

    // GET /api/public/stats - 系统统计
    this.router.get('/stats', this.handleGetStats.bind(this))
  }

  async handleGetPublicApps(req: Request, res: Response): Promise<void> {
    try {
      const applications = await this.applicationService.findAll()

      // 转换为公共API格式（现在是async）
      const publicApps = await Promise.all(
        applications.map(app => this.toPublicApp(app, req))
      )

      res.json({
        success: true,
        data: {
          apps: publicApps,
          total: publicApps.length,
          lastUpdated: new Date().toISOString()
        }
      })

    } catch (error) {
      logger.error('Failed to fetch public apps', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch applications'
      })
    }
  }

  async handleGetPublicApp(req: Request, res: Response): Promise<void> {
    try {
      const application = await this.applicationService.findById(req.params.id)
      const publicApp = await this.toPublicApp(application, req)

      res.json({
        success: true,
        data: publicApp
      })

    } catch (error) {
      logger.error('Failed to fetch public app', error)
      res.status(404).json({
        success: false,
        error: 'Application not found'
      })
    }
  }

  async handleGetPinnedApps(req: Request, res: Response): Promise<void> {
    try {
      const applications = await this.applicationService.findAll()

      // 只返回固定到首页的应用，避免语义漂移
      const pinned = applications.filter(app => this.isPinned(app))
      const pinnedApps = await Promise.all(
        pinned.map(app => this.toPublicApp(app, req))
      )

      res.json({
        success: true,
        data: pinnedApps
      })

    } catch (error) {
      logger.error('Failed to fetch pinned apps', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch pinned applications'
      })
    }
  }

  async handleGetHealth(req: Request, res: Response): Promise<void> {
    try {
      const applications = await this.applicationService.findAll()
      const onlineApps = applications.filter(app => app.state === 'running')

      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: true,
            appManager: true,
            proxyService: true
          },
          apps: {
            total: applications.length,
            online: onlineApps.length,
            running: onlineApps.length,
            offline: applications.length - onlineApps.length
          },
          uptime: process.uptime(),
          memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
          }
        }
      })

    } catch (error) {
      logger.error('Failed to get health status', error)
      res.status(500).json({
        success: false,
        error: 'Health check failed'
      })
    }
  }

  async handleGetStats(req: Request, res: Response): Promise<void> {
    try {
      const applications = await this.applicationService.findAll()
      const onlineApps = applications.filter(app => app.state === 'running')

      // 技术栈统计
      const techStacks: Record<string, number> = {}
      applications.forEach(app => {
        techStacks[app.techStack.name] = (techStacks[app.techStack.name] || 0) + 1
      })

      res.json({
        success: true,
        data: {
          apps: {
            total: applications.length,
            online: onlineApps.length,
            offline: applications.length - onlineApps.length,
            running: onlineApps.length
          },
          techStacks,
          recentActivity: [],
          performance: {
            avgResponseTime: 120,
            successRate: 99.5,
            errorRate: 0.5
          }
        }
      })

    } catch (error) {
      logger.error('Failed to get stats', error)
      res.status(500).json({
        success: false,
        error: 'Stats fetch failed'
      })
    }
  }

  /**
   * 获取基础URL（支持局域网访问和代理转发）
   */
  private getBaseUrl(
    req: Request,
    app: any
  ): { protocol: 'http' | 'https'; hostname: string; lanHost: string | null } {
    const protocol = this.resolveProtocol(app, req)
    const hostname = this.resolveHostname(req)
    const lanHost = this.resolveLanHost()

    return {
      protocol,
      hostname,
      lanHost
    }
  }

  /**
   * 转换应用为公共API格式
   */
  private async toPublicApp(app: any, req: Request) {
    const baseInfo = this.getBaseUrl(req, app)
    const protocol = baseInfo.protocol
    const hostname = baseInfo.hostname
    const lanHost = baseInfo.lanHost
    const primaryPort = app.network?.primaryPort || 3000
    const secondaryPorts = app.network?.secondaryPorts || []

    // 🎯 全栈应用智能端口选择
    const isFullStack = app.fullStack && secondaryPorts.length > 0
    const backendPort = secondaryPorts[0]

    // 决定访问端口的逻辑：
    // 1. 优先使用数据库持久化的 deploymentMode（避免启动时查询延迟）
    // 2. 对于全栈应用，根据 deploymentMode 选择端口
    // 3. 生产模式（PM2） → 使用backend端口（backend提供前端+API）
    // 4. 开发模式 → 使用frontend端口（Vite开发服务器）
    // 5. 对于非全栈应用 → 使用primary端口

    let accessPort = primaryPort
    let deploymentMode: 'production' | 'development' | 'unknown' = app.deploymentMode || 'unknown'
    let frontendListening: boolean | null = null
    let backendListening: boolean | null = null

    const inspectRuntimePorts = async () => {
      if (frontendListening === null) {
        frontendListening = await this.isLocalPortListening(primaryPort)
      }

      if (backendPort && backendListening === null) {
        backendListening = await this.isLocalPortListening(backendPort)
      }

      return {
        frontendListening,
        backendListening: backendListening ?? false
      }
    }

    if (deploymentMode === 'production' && app.state === 'running' && isFullStack && backendPort) {
      const isPM2Running = await this.checkIfPM2Running(app.name, app.pm2ProcessName)

      if (!isPM2Running) {
        const runtimePorts = await inspectRuntimePorts()
        deploymentMode = runtimePorts.frontendListening ? 'development' : 'unknown'

        logger.warn('检测到陈旧的production模式标记，已按实时运行态修正展示', {
          appName: app.name,
          appId: app.id,
          pm2ProcessName: app.pm2ProcessName || null,
          frontendListening: runtimePorts.frontendListening,
          backendListening: runtimePorts.backendListening,
          fallbackDeploymentMode: deploymentMode
        })
      }
    }

    // 如果数据库中的 deploymentMode 为 unknown 且应用正在运行，尝试实时查询
    if (deploymentMode === 'unknown' && app.state === 'running' && isFullStack && backendPort) {
      const isPM2Running = await this.checkIfPM2Running(app.name, app.pm2ProcessName)

      if (isPM2Running) {
        deploymentMode = 'production'
        const runtimePorts = await inspectRuntimePorts()
        accessPort = runtimePorts.backendListening ? backendPort : primaryPort
        logger.debug('实时检测到PM2运行，更新为生产模式', {
          appName: app.name,
          port: accessPort,
          backendPort,
          backendListening: runtimePorts.backendListening
        })
        if (!runtimePorts.backendListening) {
          logger.warn('PM2运行中但后端端口未监听，回退到前端端口', {
            appName: app.name,
            backendPort,
            frontendPort: primaryPort
          })
        }
      } else if (app.state === 'running') {
        const runtimePorts = await inspectRuntimePorts()

        if (runtimePorts.frontendListening) {
          // 应用在运行但不在PM2中，且前端开发端口在线 → 开发模式
          deploymentMode = 'development'
          accessPort = primaryPort
          logger.debug('应用运行中但非PM2，判定为开发模式', {
            appName: app.name,
            port: accessPort
          })
        } else if (runtimePorts.backendListening) {
          // 仅后端端口在线，但没有PM2证据，保留 unknown，避免误标记为 PM2。
          accessPort = backendPort
          logger.warn('应用仅检测到后端端口监听，保留unknown模式展示', {
            appName: app.name,
            backendPort
          })
        }
      }
    } else if (deploymentMode === 'production' && isFullStack && backendPort) {
      // 数据库已标记为生产模式，优先使用backend端口。
      // 兼容性兜底：若backend端口当前未监听（例如只启动了frontend preview），回退到frontend端口。
      const runtimePorts = await inspectRuntimePorts()
      if (runtimePorts.backendListening) {
        accessPort = backendPort
        logger.debug('使用数据库中的生产模式端口', {
          appName: app.name,
          port: accessPort,
          mode: 'PM2'
        })
      } else {
        accessPort = primaryPort
        logger.warn('生产模式后端端口未监听，回退到前端端口', {
          appName: app.name,
          backendPort,
          frontendPort: primaryPort
        })
      }
    } else if (deploymentMode === 'development' && isFullStack) {
      // 数据库已标记为开发模式，使用frontend端口
      accessPort = primaryPort
      logger.debug('使用数据库中的开发模式端口', {
        appName: app.name,
        port: accessPort,
        mode: 'npm run dev'
      })
    }

    const accessPath = this.resolveExternalExeAccessPath(app)
    const accessUrl = this.buildAccessUrl(protocol, hostname, accessPort, accessPath)
    const lanAccessUrl = lanHost ? this.buildAccessUrl(protocol, lanHost, accessPort, accessPath) : null

    return {
      id: app.id,
      name: app.name,
      description: app.metadata?.description || '',
      icon: app.metadata?.icon || '🌐',
      color: app.metadata?.color || '#667eea',
      techStack: app.techStack?.name || '',
      pinned: this.isPinned(app),
      status: app.state === 'running' ? 'online' : 'offline',
      isRunning: app.state === 'running',
      accessUrl,
      directUrl: accessUrl,
      accessPath: accessPath || undefined,
      accessHost: hostname,
      accessProtocol: protocol,
      lanAccessUrl,
      port: accessPort,
      // ✅ 新增：完整端口信息
      frontend_port: primaryPort,
      backend_port: backendPort || null,
      ports: [
        {
          port: primaryPort,
          type: 'frontend',
          protocol: protocol,
          isMain: true
        },
        ...(secondaryPorts.map((port: number) => ({
          port,
          type: 'backend',
          protocol: protocol,
          isMain: false
        })))
      ],
      // ✅ 新增：运行模式信息
      deploymentMode: deploymentMode,
      isFullStack: isFullStack,
      uptime: 0,
      lastUpdated: app.metadata?.updatedAt ? new Date(app.metadata.updatedAt * 1000).toISOString() : new Date().toISOString(),
      network: {
        protocol,
        primaryPort,
        secondaryPorts
      }
    }
  }

  private isExternalExeApp(app: any): boolean {
    const tech = String(app?.techStack?.name || app?.techStack || '').trim().toLowerCase()
    return tech === 'external-exe'
  }

  private normalizeAccessPath(pathValue?: string | null): string {
    if (typeof pathValue !== 'string') return ''
    const trimmed = pathValue.trim()
    if (!trimmed || trimmed === '/') return ''
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }

  private resolveExternalExeAccessPath(app: any): string {
    if (!this.isExternalExeApp(app)) {
      return ''
    }

    const explicitPath = this.normalizeAccessPath(
      app?.metadata?.accessPath || app?.accessPath || app?.metadata?.entryPath
    )
    if (explicitPath) {
      return explicitPath
    }

    const directory = typeof app?.directory === 'string' ? app.directory.trim() : ''
    if (!directory) {
      return ''
    }

    try {
      // external-exe 常见内置前端入口优先级：management.html > index.html
      const managementFile = join(directory, 'management.html')
      if (existsSync(managementFile)) {
        return '/management.html'
      }

      const indexFile = join(directory, 'index.html')
      if (existsSync(indexFile)) {
        return '/index.html'
      }
    } catch (error) {
      logger.debug('解析 external-exe 前端入口失败', {
        appName: app?.name,
        directory,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return ''
  }

  private buildAccessUrl(
    protocol: 'http' | 'https',
    host: string,
    port: number,
    accessPath: string
  ): string {
    return `${protocol}://${host}:${port}${accessPath || ''}`
  }

  private isPinned(app: any): boolean {
    return app?.metadata?.pinned === true
  }

  /**
   * 检查应用是否通过PM2运行
   */
  private async checkIfPM2Running(appName: string, pm2ProcessName?: string | null): Promise<boolean> {
    if (!this.pm2Service) {
      return false
    }

    try {
      const processes = await this.pm2Service.getProcessList()
      const normalizedAppName = appName.toLowerCase().replace(/\s+/g, '-')
      const normalizedPm2Name = typeof pm2ProcessName === 'string' && pm2ProcessName.trim() !== ''
        ? pm2ProcessName.toLowerCase().replace(/\s+/g, '-')
        : null

      // 检查是否有同名的PM2进程在运行
      const pm2Process = processes.find(p =>
        (!!normalizedPm2Name && (
          p.name === pm2ProcessName ||
          p.name.toLowerCase() === normalizedPm2Name
        )) ||
        p.name === normalizedAppName ||
        p.name === appName ||
        p.name.toLowerCase().replace(/\s+/g, '-') === normalizedAppName
      )

      return pm2Process?.status === 'online'
    } catch (error) {
      logger.error('检查PM2进程失败', { appName, error })
      return false
    }
  }

  /**
   * 检查本机端口是否可连通（用于访问URL兜底选择）
   */
  private async isLocalPortListening(port: number, timeoutMs: number = 500): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      let settled = false

      const finish = (result: boolean) => {
        if (settled) return
        settled = true
        socket.destroy()
        resolve(result)
      }

      socket.setTimeout(timeoutMs)
      socket.once('connect', () => finish(true))
      socket.once('timeout', () => finish(false))
      socket.once('error', () => finish(false))

      try {
        socket.connect(port, '127.0.0.1')
      } catch {
        finish(false)
      }
    })
  }

  private resolveHostname(req: Request): string {
    const manualHost = process.env.PORTAL_PUBLIC_HOST || process.env.PUBLIC_APP_HOST
    if (manualHost && manualHost.trim().length > 0) {
      return manualHost.trim()
    }

    const headerCandidates = [
      req.get('x-forwarded-host'),
      req.get('x-original-host'),
      req.get('host')
    ].filter(Boolean) as string[]

    const rawHost = headerCandidates.length > 0 ? headerCandidates[0] : 'localhost'
    const hostPart = rawHost.split(',')[0]?.trim() || 'localhost'

    try {
      const parsed = new URL(`http://${hostPart}`)
      if (parsed.hostname) {
        return parsed.hostname
      }
    } catch (error) {
      logger.warn('Failed to parse host header, falling back to localhost', {
        hostPart,
        error: (error as Error).message
      })
    }

    return 'localhost'
  }

  private prefersHttps(app: any): boolean {
    try {
      const ports = new Set<number>()
      const primary = app?.network?.primaryPort
      if (typeof primary === 'number') {
        ports.add(primary)
      }

      if (Array.isArray(app?.network?.secondaryPorts)) {
        for (const port of app.network.secondaryPorts) {
          if (typeof port === 'number') {
            ports.add(port)
          }
        }
      }

      if (Array.isArray(app?.ports)) {
        for (const item of app.ports) {
          if (typeof item?.port === 'number') {
            ports.add(item.port)
          }
          if (item?.protocol === 'https') {
            return true
          }
        }
      }

      for (const port of ports) {
        if (port === 443 || port === 8443) {
          return true
        }
      }

      return false
    } catch (error) {
      logger.warn('Failed to inspect ports for HTTPS preference', {
        error: (error as Error).message
      })
      return false
    }
  }

  private resolveProtocol(app: any, req: Request): 'http' | 'https' {
    const networkProtocol = app?.network?.protocol
    if (networkProtocol === 'https' || networkProtocol === 'http') {
      return networkProtocol
    }

    if (Array.isArray(app?.ports)) {
      for (const item of app.ports) {
        if (item?.protocol === 'https') {
          return 'https'
        }
        if (item?.protocol === 'http') {
          return 'http'
        }
      }
    }

    const httpsPreferred = this.prefersHttps(app)
    const forwardedProto = req.get('x-forwarded-proto')
    if (forwardedProto) {
      const proto = forwardedProto.split(',')[0]?.trim().toLowerCase()
      if (proto === 'https' && httpsPreferred) {
        return 'https'
      }
    }

    if (req.secure && httpsPreferred) {
      return 'https'
    }

    return 'http'
  }

  private resolveLanHost(): string | null {
    const manualLanHost =
      process.env.PORTAL_LAN_HOST ||
      process.env.PUBLIC_APP_LAN_HOST ||
      process.env.LAN_HOST

    if (manualLanHost && manualLanHost.trim().length > 0) {
      return manualLanHost.trim()
    }

    const cacheTTL = 5 * 60 * 1000
    if (this.lanHostCache && Date.now() - this.lanHostCache.resolvedAt < cacheTTL) {
      return this.lanHostCache.value
    }

    try {
      const interfaces = networkInterfaces()
      for (const interfaceInfo of Object.values(interfaces)) {
        if (!interfaceInfo) continue
        for (const addressInfo of interfaceInfo) {
          if (addressInfo.family === 'IPv4' && !addressInfo.internal) {
            this.lanHostCache = { value: addressInfo.address, resolvedAt: Date.now() }
            return addressInfo.address
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to resolve LAN host', {
        error: (error as Error).message
      })
    }

    this.lanHostCache = { value: null, resolvedAt: Date.now() }
    return null
  }

  getRouter(): Router {
    return this.router
  }
}
