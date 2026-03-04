/**
 * Service Container - Dependency Injection
 * 
 * This replaces the scattered service instantiation from v1.
 * Simple container that wires everything together cleanly.
 * 
 * "Dependency injection is not rocket science." - Clean Architecture
 */

import { Database } from 'better-sqlite3'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { Router, type Request, type Response, type NextFunction } from 'express'
import { logger } from '../utils/logger.js'
import { DatabaseManager } from './DatabaseManager.js'
import { ConfigManager } from '../services/configManager.js'
import { ConfigValidationService } from '../services/ConfigValidationService.js'
import { PortManagementService } from '../services/PortManagementService.js'
import { NetworkService } from './NetworkService.js'
import { SimpleProcessManager } from './SimpleServices.js'
import { SimpleFileScanner } from './SimpleServices.js'
import { SimpleTechStackAnalyzer } from './SimpleServices.js'
import { ApplicationService } from './ApplicationService.js'
import { DetectionService } from './DetectionService.js'
import { SQLiteApplicationRepository, SQLiteDetectionRepository } from './repositories.js'
import { IntelligentBuildService } from '../services/intelligentBuildService.js'
import { BuildHistoryService } from '../services/buildHistoryService.js'
import { PM2ConfigOptimizer } from '../services/pm2ConfigOptimizer.js'
import { BuildExecutionService } from '../services/buildExecutionService.js'
import { BuildQueueManager } from '../services/buildQueueManager.js'
import { BuildCacheService } from '../services/buildCacheService.js'
import { BuildTemplateService } from '../services/buildTemplateService.js'
import { BuildPerformanceService } from '../services/buildPerformanceService.js'
import { BuildBatchService } from '../services/buildBatchService.js'
import { BuildPipelineService } from '../services/buildPipelineService.js'
import { EnvironmentService } from '../services/environmentService.js'
import { SecurityScanService } from '../services/securityScanService.js'
import { AIOptimizationService } from '../services/aiOptimizationService.js'
import { BenchmarkService } from '../services/benchmarkService.js'
import { LogService } from '../services/logService.js'
import { AppPortBindingService } from '../services/AppPortBindingService.js'
import { ApplicationsController } from '../api/controllers/ApplicationsController.js'
import { DetectionController } from '../api/controllers/DetectionController.js'
import { PublicController } from '../api/controllers/PublicController.js'
import { AuthController } from '../api/controllers/AuthController.js'
import { PortConfigController } from '../api/controllers/PortConfigController.js'
import { UserSettingsController } from '../api/controllers/UserSettingsController.js'
import { FilesystemController } from '../api/controllers/FilesystemController.js'
import { BuildController } from '../api/controllers/BuildController.js'
import { MonitoringController } from '../api/controllers/MonitoringController.js'
import { SystemSettingsController } from '../controllers/SystemSettingsController.js'
import { WebSocketManager } from '../services/websocket.js'
import { websocketService } from '../services/websocketService.js'
import { pm2Service } from '../services/pm2Service.js'
import { PM2StateSyncService } from '../services/pm2StateSyncService.js'
import {
  LEGACY_APPS_MODE_ENV,
  LEGACY_APPS_MIGRATION_TARGET,
  buildLegacyAppsDeprecationHeaders,
  resolveLegacyAppsMode,
  shouldBlockLegacyAppsRequest
} from './legacyAppsPolicy.js'

export class ServiceContainer {
  private services = new Map<string, any>()
  private db: Database
  private wsManager: WebSocketManager

  constructor(database: Database, wsManager: WebSocketManager) {
    this.db = database
    this.wsManager = wsManager
    this.registerServices()
  }

  static async create(dbPath?: string, wsManager?: WebSocketManager): Promise<ServiceContainer> {
    const manager = DatabaseManager.getInstance()
    const database = await manager.getDatabase(dbPath)
    const wsManager_ = wsManager || new WebSocketManager()

    return new ServiceContainer(database, wsManager_)
  }

  private registerServices(): void {
    // Repositories
    this.services.set('applicationRepository',
      new SQLiteApplicationRepository(this.db))
    this.services.set('detectionRepository',
      new SQLiteDetectionRepository(this.db))

    // Configuration services (需要先创建，因为其他服务依赖它)
    this.services.set('configManager', new ConfigManager())
    this.services.set('configValidationService', new ConfigValidationService(this.get('configManager')))

    // Port Management Service - Unified
    this.services.set('portManagementService',
      new PortManagementService(this.db, this.get('configManager')))

    // Supporting services (现在可以传入 configManager)
    this.services.set('networkService', new NetworkService(this.get('configManager'), this.db))
    this.services.set('processManager', new SimpleProcessManager(websocketService, this.db))
    this.services.set('fileScanner', new SimpleFileScanner())
    this.services.set('techStackAnalyzer', new SimpleTechStackAnalyzer())

    // Core services
    this.services.set('applicationService',
      new ApplicationService(
        this.get('applicationRepository'),
        this.get('networkService'),
        this.get('processManager'),
        this.get('configManager')
      ))

    // Inject ApplicationService into PM2Service
    pm2Service.setApplicationService(this.get('applicationService'))

    // Register PM2Service in container so other services can access it
    this.services.set('pm2Service', pm2Service)

    // 🔄 PM2状态同步服务
    this.services.set('pm2StateSyncService',
      new PM2StateSyncService(pm2Service, this.get('applicationService')))

    this.services.set('detectionService',
      new DetectionService(
        this.get('detectionRepository'),
        this.get('fileScanner'),
        this.get('techStackAnalyzer'),
        this.get('configManager'),
        this.get('portManagementService'),
        this.get('applicationRepository')
      ))

    // Build execution services
    this.services.set('intelligentBuildService',
      new IntelligentBuildService(this.get('applicationService')))

    this.services.set('buildHistoryService',
      new BuildHistoryService(this.db))

    this.services.set('pm2ConfigOptimizer',
      new PM2ConfigOptimizer(this.db, this.get('applicationService')))

    this.services.set('buildExecutionService',
      new BuildExecutionService(
        this.get('applicationService'),
        this.get('intelligentBuildService'),
        this.wsManager
      ))

    this.services.set('buildQueueManager',
      new BuildQueueManager(this.get('buildExecutionService')))

    // Advanced build services
    this.services.set('buildCacheService',
      new BuildCacheService(this.db))

    this.services.set('buildTemplateService',
      new BuildTemplateService(this.db))

    this.services.set('buildPerformanceService',
      new BuildPerformanceService(this.db))

    this.services.set('buildBatchService',
      new BuildBatchService(
        this.db,
        this.get('buildExecutionService'),
        this.wsManager
      ))

    // Week 5 advanced services
    this.services.set('buildPipelineService',
      new BuildPipelineService(this.db))

    this.services.set('environmentService',
      new EnvironmentService(this.db))

    this.services.set('securityScanService',
      new SecurityScanService(this.db))

    this.services.set('aiOptimizationService',
      new AIOptimizationService(this.db))

    this.services.set('benchmarkService',
      new BenchmarkService(this.db))

    // Log services
    this.services.set('logService',
      new LogService(this.db))

    // App Port Binding Service
    this.services.set('appPortBindingService',
      new AppPortBindingService(this.db, this.get('configManager'), this.wsManager))

    // Controllers
    this.services.set('applicationsController',
      new ApplicationsController(this.get('applicationService'), this))
    this.services.set('detectionController',
      new DetectionController(this.get('detectionService'), this.get('configManager')))
    this.services.set('publicController',
      new PublicController(this.get('applicationService'), this.get('pm2Service')))
    this.services.set('authController',
      new AuthController())
    this.services.set('portConfigController',
      new PortConfigController(
        this.get('configManager'),
        this.get('appPortBindingService'),
        this.get('portManagementService'),
        this.get('applicationService')  // 🔧 传入 applicationService
      ))
    this.services.set('userSettingsController',
      new UserSettingsController())
    this.services.set('filesystemController',
      new FilesystemController())
    this.services.set('buildController',
      new BuildController(this.get('applicationService')))
    this.services.set('monitoringController',
      new MonitoringController())
    this.services.set('systemSettingsController',
      new SystemSettingsController(this))
  }

  get<T>(serviceName: string): T {
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }
    return service
  }

  getDatabase(): Database {
    return this.db
  }

  /**
   * 在数据库迁移完成后启动后台服务，避免与迁移写冲突
   */
  async startBackgroundServices(): Promise<void> {
    await this.initializeProcessManager()
    await this.initializePM2StateSync()
  }

  /**
   * 初始化进程管理器的状态恢复功能
   */
  private async initializeProcessManager(): Promise<void> {
    try {
      const processManager = this.get<any>('processManager')
      const applicationRepository = this.get<any>('applicationRepository')

      // 如果进程管理器有initialize方法，调用它
      if (typeof processManager.initialize === 'function') {
        await processManager.initialize(applicationRepository)
        logger.info('Process manager initialized with state recovery')
      }
    } catch (error) {
      logger.error('Failed to initialize process manager', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 🔄 初始化PM2状态同步服务
   */
  private async initializePM2StateSync(): Promise<void> {
    try {
      const pm2StateSyncService = this.get<PM2StateSyncService>('pm2StateSyncService')

      // 启动PM2状态同步
      pm2StateSyncService.start()
      logger.info('✅ PM2状态同步服务已启动（每30秒同步一次）')
    } catch (error) {
      logger.error('Failed to initialize PM2 state sync service', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  getApiRouter(): Router {
    const router = Router()

    // Mount controller routes
    router.use('/v2/applications', this.get<ApplicationsController>('applicationsController').getRouter())
    router.use('/v2/detection', this.get<DetectionController>('detectionController').getRouter())
    router.use('/v2/public', this.get<PublicController>('publicController').getRouter())
    router.use('/v2/auth', this.get<AuthController>('authController').getRouter())
    router.use('/v2/config/ports', this.get<PortConfigController>('portConfigController').getRouter())
    router.use('/v2/config', this.get<UserSettingsController>('userSettingsController').getRouter())
    router.use('/filesystem', this.get<FilesystemController>('filesystemController').getRouter())
    router.use('/build', this.get<BuildController>('buildController').getRouter())
    router.use('/public', this.get<MonitoringController>('monitoringController').getRouter())
    router.use('/port-performance', this.get<MonitoringController>('monitoringController').getRouter())
    router.use('/settings', this.get<SystemSettingsController>('systemSettingsController').getRouter())

    const legacyAppsRouter = Router()
    const legacyAppsMode = resolveLegacyAppsMode(process.env[LEGACY_APPS_MODE_ENV])

    logger.info('Legacy apps bridge mode initialized', {
      mode: legacyAppsMode,
      env: LEGACY_APPS_MODE_ENV
    })

    legacyAppsRouter.use((req: Request, res: Response, next: NextFunction) => {
      const headers = buildLegacyAppsDeprecationHeaders()
      for (const [headerName, headerValue] of Object.entries(headers)) {
        res.setHeader(headerName, headerValue)
      }
      next()
    })

    legacyAppsRouter.use((req: Request, res: Response, next: NextFunction) => {
      const blockedReason = shouldBlockLegacyAppsRequest(legacyAppsMode, req.method)
      if (!blockedReason) {
        next()
        return
      }

      if (blockedReason === 'disabled') {
        res.status(410).json({
          success: false,
          error: 'Legacy apps API disabled',
          code: 'LEGACY_APPS_API_DISABLED',
          message: `Legacy /api/apps endpoints are disabled. Please migrate to ${LEGACY_APPS_MIGRATION_TARGET}.`
        })
        return
      }

      res.status(403).json({
        success: false,
        error: 'Legacy apps API is read-only',
        code: 'LEGACY_APPS_API_READONLY',
        message: `Write operations on /api/apps are disabled in readonly mode. Please migrate to ${LEGACY_APPS_MIGRATION_TARGET}.`
      })
    })

    const mapStateToStatus = (state: string): 'online' | 'offline' | 'error' | 'maintenance' => {
      if (state === 'running') return 'online'
      if (state === 'failed') return 'error'
      return 'offline'
    }

    const toIsoString = (timestamp?: number): string => {
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        return new Date(timestamp * 1000).toISOString()
      }
      return new Date().toISOString()
    }

    const toLegacyApp = (app: any) => {
      const frontendPort = app?.network?.primaryPort ?? null
      const backendPort = Array.isArray(app?.network?.secondaryPorts) && app.network.secondaryPorts.length > 0
        ? app.network.secondaryPorts[0]
        : null

      return {
        id: app?.id,
        name: app?.name,
        description: app?.metadata?.description ?? '',
        directory: app?.directory ?? '',
        url: null,
        icon: app?.metadata?.icon ?? '',
        color: app?.metadata?.color ?? '',
        tech_stack: app?.techStack?.name ?? app?.techStack ?? 'unknown',
        status: mapStateToStatus(app?.state),
        frontend_port: frontendPort,
        backend_port: backendPort,
        access_path: app?.metadata?.accessPath ?? '',
        pinned_to_homepage: app?.metadata?.pinned ?? false,
        created_at: toIsoString(app?.metadata?.createdAt),
        updated_at: toIsoString(app?.metadata?.updatedAt)
      }
    }

    const mapLegacyCreateInput = (body: any) => ({
      name: body?.name,
      directory: body?.directory,
      techStack: body?.tech_stack || body?.techStack || 'unknown',
      description: body?.description,
      icon: body?.icon,
      color: body?.color,
      primaryPort: body?.frontend_port,
      secondaryPorts: body?.backend_port ? [body.backend_port] : undefined,
      protocol: body?.protocol || 'http'
    })

    const mapLegacyUpdateInput = (body: any) => {
      const input: Record<string, any> = {}
      if (typeof body?.name === 'string') input.name = body.name
      if (typeof body?.description === 'string') input.description = body.description
      if (typeof body?.icon === 'string') input.icon = body.icon
      if (typeof body?.color === 'string') input.color = body.color
      if (typeof body?.tech_stack === 'string') input.techStack = body.tech_stack
      if (typeof body?.techStack === 'string') input.techStack = body.techStack
      if (typeof body?.access_path === 'string') input.accessPath = body.access_path
      if (typeof body?.accessPath === 'string') input.accessPath = body.accessPath
      return input
    }

    legacyAppsRouter.get('/', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const apps = await applicationService.findAll()

        const limit = Math.max(1, parseInt((req.query.limit as string) || `${apps.length}`, 10))
        const page = Math.max(1, parseInt((req.query.page as string) || '1', 10))
        const statusFilter = (req.query.status as string)?.toLowerCase()
        const techStackFilter = (req.query.techStack as string)?.toLowerCase()
        const search = (req.query.search as string)?.toLowerCase()

        let filtered = apps

        if (statusFilter) {
          filtered = filtered.filter(app => {
            const status = mapStateToStatus(app.state).toLowerCase()
            if (statusFilter === 'online') return status === 'online'
            if (statusFilter === 'offline') return status === 'offline'
            if (statusFilter === 'error') return status === 'error'
            return true
          })
        }

        if (techStackFilter) {
          filtered = filtered.filter(app => (app.techStack?.name || '').toLowerCase() === techStackFilter)
        }

        if (search) {
          filtered = filtered.filter(app =>
            app.name?.toLowerCase().includes(search) ||
            app.metadata?.description?.toLowerCase().includes(search) ||
            app.techStack?.name?.toLowerCase().includes(search)
          )
        }

        const total = filtered.length
        const totalPages = Math.max(1, Math.ceil(total / limit))
        const start = Math.max(0, (page - 1) * limit)
        const data = filtered.slice(start, start + limit).map(toLegacyApp)

        res.json({
          success: true,
          data,
          pagination: {
            page,
            limit,
            total,
            totalPages
          }
        })
      } catch (error: any) {
        logger.error('Failed to fetch legacy applications list', { error: error?.message })
        res.status(500).json({
          success: false,
          error: 'Failed to fetch applications',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/pinned', async (_req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const apps = await applicationService.findAll()
        const pinnedApps = apps
          .filter(app => app.metadata?.pinned)
          .map(toLegacyApp)

        res.json({
          success: true,
          data: pinnedApps
        })
      } catch (error: any) {
        logger.error('Failed to fetch pinned applications', { error: error?.message })
        res.status(500).json({
          success: false,
          error: 'Failed to fetch pinned applications',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/stats/overview', async (_req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const apps = await applicationService.findAll()

        const stats = {
          total: apps.length,
          online: apps.filter(app => app.state === 'running').length,
          offline: apps.filter(app => app.state !== 'running').length,
          error: apps.filter(app => app.state === 'failed').length,
          maintenance: 0,
          byTechStack: apps.reduce<Record<string, number>>((acc, app) => {
            const key = app.techStack?.name || 'Unknown'
            acc[key] = (acc[key] || 0) + 1
            return acc
          }, {})
        }

        res.json({
          success: true,
          data: stats
        })
      } catch (error: any) {
        logger.error('Failed to fetch applications stats', { error: error?.message })
        res.status(500).json({
          success: false,
          error: 'Failed to fetch applications stats',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/group/tech-stack', async (_req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const apps = await applicationService.findAll()

        const grouped = apps.reduce<Record<string, any[]>>((acc, app) => {
          const key = app.techStack?.name || 'Unknown'
          if (!acc[key]) acc[key] = []
          acc[key].push(toLegacyApp(app))
          return acc
        }, {})

        res.json({
          success: true,
          data: grouped
        })
      } catch (error: any) {
        logger.error('Failed to group applications by tech stack', { error: error?.message })
        res.status(500).json({
          success: false,
          error: 'Failed to group applications',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/running/list', async (_req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const apps = await applicationService.findAll()
        const running = apps
          .filter(app => app.state === 'running')
          .map(app => ({
            app: toLegacyApp(app),
            process: null,
            url: null
          }))

        res.json({
          success: true,
          data: running
        })
      } catch (error: any) {
        logger.error('Failed to fetch running applications', { error: error?.message })
        res.status(500).json({
          success: false,
          error: 'Failed to fetch running applications',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/:id/status', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const app = await applicationService.findById(req.params.id)
        res.json({
          success: true,
          data: {
            app: toLegacyApp(app),
            isRunning: app.state === 'running',
            process: null,
            url: null
          }
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to fetch application status',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.get('/:id', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const app = await applicationService.findById(req.params.id)
        res.json({
          success: true,
          data: toLegacyApp(app)
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to fetch application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.post('/', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const app = await applicationService.create(mapLegacyCreateInput(req.body))
        res.status(201).json({
          success: true,
          data: toLegacyApp(app),
          message: 'Application created successfully'
        })
      } catch (error: any) {
        logger.error('Failed to create application (legacy)', { error: error?.message })
        const status =
          error?.code === 'VALIDATION_ERROR' ? 400 :
          error?.code === 'DIRECTORY_ALREADY_EXISTS' ? 409 :
          error?.code === 'APPLICATION_DIRECTORY_NOT_FOUND' ? 400 :
          500

        res.status(status).json({
          success: false,
          error: 'Failed to create application',
          code: error?.code,
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.put('/:id', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        const app = await applicationService.update(req.params.id, mapLegacyUpdateInput(req.body))
        res.json({
          success: true,
          data: toLegacyApp(app),
          message: 'Application updated successfully'
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to update application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.delete('/:id', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        await applicationService.delete(req.params.id)
        res.json({
          success: true,
          message: 'Application deleted successfully'
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to delete application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.post('/:id/start', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        await applicationService.start(req.params.id)
        const app = await applicationService.findById(req.params.id)
        res.json({
          success: true,
          data: {
            app: toLegacyApp(app),
            process: null,
            url: null,
            mode: req.body?.mode || 'legacy'
          },
          message: 'Application started successfully'
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to start application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.post('/:id/stop', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        await applicationService.stop(req.params.id)
        const app = await applicationService.findById(req.params.id)
        res.json({
          success: true,
          data: toLegacyApp(app),
          message: 'Application stopped successfully'
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to stop application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.post('/:id/restart', async (req, res) => {
      try {
        const applicationService = this.get<ApplicationService>('applicationService')
        try {
          await applicationService.stop(req.params.id)
        } catch {
          // ignore stop errors, attempt to start anyway
        }
        await applicationService.start(req.params.id)
        const app = await applicationService.findById(req.params.id)
        res.json({
          success: true,
          data: {
            app: toLegacyApp(app),
            process: null,
            url: null
          },
          message: 'Application restarted successfully'
        })
      } catch (error: any) {
        const status = (error?.code === 'APPLICATION_NOT_FOUND' || error?.message?.includes('not found')) ? 404 : 500
        res.status(status).json({
          success: false,
          error: 'Failed to restart application',
          message: error?.message || 'Internal server error'
        })
      }
    })

    legacyAppsRouter.post('/:id/status', (_req, res) => {
      res.status(405).json({
        success: false,
        error: 'Endpoint not supported',
        message: 'Use GET /api/apps/:id/status'
      })
    })

    legacyAppsRouter.post('/from-detection', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Detection based creation not yet supported in legacy bridge',
        message: 'Please use manual application registration'
      })
    })

    legacyAppsRouter.post('/:id/detect', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Directory detection not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.get('/:id/ports/detect', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Port detection not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.post('/ports/check-conflicts', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Port conflict check not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.put('/:id/ports', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Port update not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.post('/ports/:port/cleanup', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Port cleanup not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.post('/ports/cleanup-dev', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Development port cleanup not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.get('/ports/:port/status', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Port status check not available in legacy bridge',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.patch('/:id/status', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Status patch not available. Use start/stop endpoints.',
        message: 'Please use POST /api/apps/:id/start or /stop'
      })
    })

    legacyAppsRouter.patch('/:id/pin', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Pinning not supported in legacy bridge yet',
        message: 'Feature migration in progress'
      })
    })

    legacyAppsRouter.patch('/batch/status', (_req, res) => {
      res.status(501).json({
        success: false,
        error: 'Batch status updates not supported',
        message: 'Please update applications individually'
      })
    })

    router.use('/apps', legacyAppsRouter)

    return router
  }

  close(): void {
    // 🔄 停止PM2状态同步服务
    try {
      const pm2StateSyncService = this.get<PM2StateSyncService>('pm2StateSyncService')
      pm2StateSyncService.stop()
      logger.info('PM2 state sync service stopped')
    } catch (error) {
      logger.error('Failed to stop PM2 state sync service', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    this.db.close()
  }
}
