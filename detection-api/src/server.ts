/**
 * Server v2 - Clean Architecture Entry Point
 *
 * This replaces the messy server.ts from v1.
 * Clean, focused, easy to understand.
 *
 * "Simplicity is the ultimate sophistication." - Da Vinci
 */

// Load environment variables from .env file FIRST
import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { createServer } from 'http'
import { ServiceContainer } from './core/ServiceContainer.js'
import standardResponseMiddleware from './middleware/standardResponse.js'
import { createGlobalApiRateLimiter } from './middleware/rateLimit.js'
import UnifiedApiRouter from './core/UnifiedApiRouter.js'
import pm2 from 'pm2'
import { runMigration } from './core/migration.js'
import { runBuildMigration, BuildMigration } from './core/buildMigration.js'
import { runPortTableMigration } from './core/runPortMigration.js'
import { websocketService } from './services/websocketService.js'
import { fileCleanupService } from './services/FileCleanupService.js'
import { logger } from './utils/logger.js'
import { WebSocketManager } from './services/websocket.js'
// Note: apiAdapter.js now integrated into UnifiedApiRouter (Phase 4)

// 全局错误处理：防止 PM2 未捕获的错误导致进程崩溃
process.on('uncaughtException', (error: Error) => {
  const errorCode = (error as any).code
  const errorMessage = error.message || ''

  // 检查是否是 EPIPE 错误（客户端断开连接）
  if (errorCode === 'EPIPE' || errorMessage.includes('EPIPE') || errorMessage.includes('broken pipe')) {
    // EPIPE 是正常的网络断开，不应该记录为 error
    logger.debug('客户端连接断开（EPIPE）:', {
      message: error.message,
      code: errorCode,
      syscall: (error as any).syscall
    })
    // 不让进程崩溃，不记录错误日志
    return
  }

  // 检查是否是 PM2 相关的 EPERM 错误
  if (errorMessage.includes('EPERM') && errorMessage.includes('rpc.sock')) {
    logger.warn('捕获到 PM2 EPERM 错误（已阻止进程崩溃）:', {
      message: error.message,
      code: errorCode,
      syscall: (error as any).syscall
    })
    // 不让进程崩溃，只记录警告
    return
  }

  // 其他未捕获的异常仍然需要记录并可能导致崩溃
  logger.error('未捕获的异常:', error)
  // 给一些时间让日志写入
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

process.on('unhandledRejection', (reason: any) => {
  logger.error('未处理的 Promise 拒绝:', reason)
})

export class Server {
  private app = express()
  private server = createServer(this.app)
  private container!: ServiceContainer  // Using definite assignment assertion
  private port: number
  private wsManager = new WebSocketManager()
  private pm2Connected = false

  constructor(port: number = 8002) {
    this.port = port
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Initializing Server v2...')

    // Initialize container with WebSocket manager
    this.container = await ServiceContainer.create(undefined, this.wsManager)

    // Optionally load configuration early to avoid default/fallback warnings
    try {
      const cfgMgr = this.container.get<any>('configManager')
      if (cfgMgr && typeof cfgMgr.loadConfig === 'function') {
        await cfgMgr.loadConfig()
      }
    } catch (e) {
      logger.warn('Failed to load initial configuration', { error: e })
    }

    // Check and run database migration if needed
    await this.ensureDatabase()

    // Bind container services to Express app.locals for legacy/route modules
    this.bindServicesToAppLocals()

    // Setup Express middleware
    this.setupMiddleware()

    // Setup routes
    this.setupRoutes()

    // Initialize WebSocket
    this.wsManager.initialize(this.server)

    // Start background services after all migrations and routes are ready
    try {
      await this.container.startBackgroundServices()
    } catch (e) {
      logger.warn('Background services failed to start', { error: e })
    }

    // 启动上传临时文件清理任务（防止导入文件在磁盘堆积）
    try {
      fileCleanupService.start()
    } catch (e) {
      logger.warn('File cleanup service failed to start', { error: e })
    }

    logger.info('✅ Server v2 initialization complete')
  }

  /**
   * Bind important services into Express app.locals for route modules that access req.app.locals
   */
  private bindServicesToAppLocals(): void {
    try {
      const appAny: any = this.app
      // Build execution pipeline services
      appAny.locals.buildExecutionService = this.container.get<any>('buildExecutionService')
      appAny.locals.buildQueueManager = this.container.get<any>('buildQueueManager')
      appAny.locals.buildHistoryService = this.container.get<any>('buildHistoryService')
      appAny.locals.buildCacheService = this.container.get<any>('buildCacheService')
      appAny.locals.buildTemplateService = this.container.get<any>('buildTemplateService')
      appAny.locals.buildPerformanceService = this.container.get<any>('buildPerformanceService')
      appAny.locals.buildBatchService = this.container.get<any>('buildBatchService')
      appAny.locals.buildPipelineService = this.container.get<any>('buildPipelineService')

      // Other dependent services
      appAny.locals.environmentService = this.container.get<any>('environmentService')
      appAny.locals.pm2ConfigOptimizer = this.container.get<any>('pm2ConfigOptimizer')
      appAny.locals.securityScanService = this.container.get<any>('securityScanService')
      appAny.locals.aiOptimizationService = this.container.get<any>('aiOptimizationService')
      appAny.locals.benchmarkService = this.container.get<any>('benchmarkService')

      // 🔄 PM2状态同步服务
      appAny.locals.pm2StateSyncService = this.container.get<any>('pm2StateSyncService')

      logger.info('✅ Bound services to app.locals for route modules')
    } catch (error) {
      logger.error('Failed to bind services to app.locals', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async ensureDatabase(): Promise<void> {
    try {
      logger.info('Running database migrations...')

      // Use database from container
      const database = this.container.getDatabase()
      const dbPath = database.name || './data/portal.db'

      // Run core migrations
      await runMigration(dbPath)

      // Run build migrations using existing database connection
      await runBuildMigration(database)
      await runPortTableMigration(database)

      // 🔄 运行部署模式迁移（添加 deployment_mode 字段）
      try {
        logger.info('Running deployment mode migration...')

        // 检查字段是否已存在
        const columns = database.prepare("PRAGMA table_info(applications)").all() as any[]
        const hasDeploymentMode = columns.some((col: any) => col.name === 'deployment_mode')

        if (!hasDeploymentMode) {
          database.prepare(`
            ALTER TABLE applications ADD COLUMN deployment_mode TEXT DEFAULT 'unknown' 
            CHECK (deployment_mode IN ('development', 'production', 'unknown'))
          `).run()

          database.prepare(`
            CREATE INDEX IF NOT EXISTS idx_applications_deployment_mode 
            ON applications(deployment_mode)
          `).run()

          logger.info('✅ Deployment mode migration completed')
        } else {
          logger.info('✅ Deployment mode field already exists, skipping migration')
        }
      } catch (migrationError) {
        logger.warn('Deployment mode migration failed (non-critical)', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        })
      }

      // 🔄 运行 application_metadata 扩展字段迁移（pinned/access_path）
      try {
        logger.info('Running application metadata migration...')

        const metadataTable = database.prepare(`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name = 'application_metadata'
        `).get() as { name: string } | undefined

        if (!metadataTable) {
          logger.warn('application_metadata table not found, skipping pinned migration')
        } else {
        const metadataColumns = database.prepare("PRAGMA table_info(application_metadata)").all() as any[]
        const hasPinned = metadataColumns.some((col: any) => col.name === 'pinned')
        const hasAccessPath = metadataColumns.some((col: any) => col.name === 'access_path')

        if (!hasPinned) {
          database.prepare(`
            ALTER TABLE application_metadata 
            ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 
            CHECK (pinned IN (0, 1))
          `).run()
          logger.info('✅ Added pinned column to application_metadata')
        } else {
          logger.info('✅ Pinned metadata field already exists, skipping migration')
        }

        if (!hasAccessPath) {
          database.prepare(`
            ALTER TABLE application_metadata 
            ADD COLUMN access_path TEXT
          `).run()
          logger.info('✅ Added access_path column to application_metadata')
        } else {
          logger.info('✅ access_path metadata field already exists, skipping migration')
        }
        }
      } catch (migrationError) {
        logger.warn('Application metadata migration failed (non-critical)', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        })
      }

      logger.info('✅ Database migrations completed')
    } catch (error) {
      logger.error('Database migration failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      throw error
    }
  }

  private setupMiddleware(): void {
    // ===============================================================================
    // Phase 3: CORS 硬化配置
    // 
    // 环境变量控制：
    // - CORS_ORIGIN: 允许的域名列表（逗号分隔），设为 * 表示允许所有
    // - CORS_MODE: 'strict' | 'lan' | 'open'
    //   - strict: 仅允许 CORS_ORIGIN 中配置的域名
    //   - lan: 允许局域网 IP + CORS_ORIGIN（默认）
    //   - open: 允许所有来源（仅开发环境）
    // ===============================================================================
    const corsMode = process.env.CORS_MODE || 'lan'
    const isProduction = process.env.NODE_ENV === 'production'
    const trustProxy = (process.env.TRUST_PROXY || '1').trim().toLowerCase()
    const helmetEnabled = process.env.HELMET_ENABLED !== 'false'
    const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false'
    const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '5mb'

    if (trustProxy === 'true' || trustProxy === '1') {
      this.app.set('trust proxy', 1)
    } else if (trustProxy === 'false' || trustProxy === '0') {
      this.app.set('trust proxy', false)
    } else {
      const trustedHopCount = Number.parseInt(trustProxy, 10)
      if (Number.isFinite(trustedHopCount) && trustedHopCount >= 0) {
        this.app.set('trust proxy', trustedHopCount)
      }
    }

    this.app.disable('x-powered-by')

    if (helmetEnabled) {
      this.app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        hsts: isProduction ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        } : false
      }))
    }

    if (rateLimitEnabled) {
      this.app.use('/api', createGlobalApiRateLimiter())
    }
    
    this.app.use(cors({
      origin: (origin, callback) => {
        // 允许无 origin 的请求（如同源请求、Postman、服务端调用）
        if (!origin) {
          return callback(null, true)
        }
        
        // 允许 localhost 和 127.0.0.1（开发和本机访问）
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true)
        }
        
        // Phase 3: 根据 CORS_MODE 决定策略
        const corsOrigin = process.env.CORS_ORIGIN
        
        // 1. open 模式：允许所有（仅非生产环境）
        if (corsMode === 'open' && !isProduction) {
          return callback(null, true)
        }
        
        // 2. strict 模式：仅允许白名单
        if (corsMode === 'strict') {
          if (!corsOrigin) {
            logger.warn('CORS strict 模式但未配置 CORS_ORIGIN，拒绝请求', { origin })
            return callback(null, false)
          }
          const allowedOrigins = corsOrigin.split(',').map(o => o.trim())
          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true)
          }
          logger.warn('CORS 请求被拒绝（strict 模式）', { origin, allowedOrigins })
          return callback(null, false)
        }
        
        // 3. lan 模式（默认）：允许局域网 + 白名单
        // 允许局域网 IP（10.x.x.x, 172.16-31.x.x, 192.168.x.x, 25.x.x.x）
        // 同时允许 Tailscale CGNAT 段（100.64.0.0/10）和 MagicDNS 域名（*.ts.net）
        const lanPattern = /^https?:\/\/(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|25\.\d+\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[a-zA-Z0-9.-]+\.ts\.net)(:\d+)?$/
        if (lanPattern.test(origin)) {
          return callback(null, true)
        }
        
        // 检查白名单
        if (corsOrigin) {
          const allowedOrigins = corsOrigin.split(',').map(o => o.trim())
          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true)
          }
        }
        
        // 生产环境拒绝未知来源，开发环境允许
        if (isProduction) {
          logger.warn('CORS 请求被拒绝（生产环境）', { origin, corsMode })
          return callback(null, false)
        }
        
        // 开发环境允许（但记录警告）
        logger.debug('CORS 请求被允许（开发环境）', { origin })
        return callback(null, true)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With', 'X-Confirm-Action']
    }))
    
    logger.info('CORS 配置已加载', { 
      mode: corsMode, 
      isProduction,
      helmetEnabled,
      rateLimitEnabled,
      requestBodyLimit,
      corsOrigin: process.env.CORS_ORIGIN || '(未配置)'
    })

    // JSON parsing
    this.app.use(express.json({ limit: requestBodyLimit }))
    this.app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }))

    // Standard response formatting middleware (Phase 3)
    this.app.use(standardResponseMiddleware)

    // 处理响应错误（EPIPE等）
    this.app.use((req: any, res: any, next: any) => {
      // 监听响应错误
      res.on('error', (error: any) => {
        // 忽略 EPIPE 错误（客户端断开连接）
        if (error.code === 'EPIPE' || error.message?.includes('EPIPE') || error.message?.includes('broken pipe')) {
          logger.debug('响应写入失败（客户端已断开）:', {
            url: req.url,
            method: req.method,
            error: error.message
          })
          return
        }

        // 其他响应错误记录为警告
        logger.warn('响应错误:', {
          url: req.url,
          method: req.method,
          error: error.message,
          code: error.code
        })
      })
      next()
    })

    // Static files
    const frontendPath = join(process.cwd(), '../main-portal/dist')
    if (existsSync(frontendPath)) {
      this.app.use(express.static(frontendPath))
    }

    logger.info('✅ Middleware configured')
  }

  private setupRoutes(): void {
    // Phase 4: Use Unified API Router - integrates both apiAdapter and ServiceContainer
    const unifiedApiRouter = new UnifiedApiRouter(this.container, {
      enableV1Compatibility: true,
      enableV2Standard: true,
      enableMigrationTools: true,
      enableVersionNegotiation: true
    });

    this.app.use('/api', unifiedApiRouter.getRouter())
    logger.info('🚀 Unified API Router mounted (Phase 4) - apiAdapter + ServiceContainer integrated')

    // Health check (using Phase 3 standard response format)
    this.app.get('/health', (req, res) => {
      res.apiSuccess({
        status: 'ok',
        version: '4.0.0', // Phase 4 version
        architecture: 'Unified API Router',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }, 'System health check successful')
    })

    // Frontend fallback
    const frontendPath = join(process.cwd(), '../main-portal/dist')
    if (existsSync(frontendPath)) {
      this.app.get('*', (req, res) => {
        res.sendFile(join(frontendPath, 'index.html'))
      })
    }

    logger.info('✅ Routes configured')
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 监听 0.0.0.0 以支持局域网访问
      this.server.listen(this.port, '0.0.0.0', () => {
        logger.info(`🚀 Server v4 listening on port ${this.port} (Phase 4 - Unified Architecture)`)
        logger.info(`📡 Unified API: http://localhost:${this.port}/api`)
        logger.info(`📚 API Documentation: http://localhost:${this.port}/api/v2/docs`)
        logger.info(`🔄 Migration Guide: http://localhost:${this.port}/api/migration-guide`)
        logger.info(`💚 Health: http://localhost:${this.port}/health`)
        logger.info(`🔌 WebSocket: ws://localhost:${this.port}/ws`)
        logger.info(`🌐 LAN Access: Server is accessible from local network`)

        // PM2状态同步服务已在 ServiceContainer.startBackgroundServices() 中启动
        // 无需重复启动

        resolve()
      })

      this.server.on('error', (error: any) => {
        // 忽略 EPIPE 错误（客户端断开连接）
        if (error.code === 'EPIPE') {
          logger.debug('客户端连接断开（EPIPE）', { error: error.message })
          return
        }

        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use`)
        } else {
          logger.error('Server error', { error })
        }
        reject(error)
      })
    })
  }

  async stop(): Promise<void> {
    try {
      fileCleanupService.stop()
    } catch (error) {
      logger.warn('Failed to stop file cleanup service', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      this.wsManager.close()
    } catch (error) {
      logger.warn('Failed to close WebSocket manager', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      websocketService.close()
    } catch (error) {
      logger.warn('Failed to close websocket service', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    try {
      this.container?.close()
    } catch (error) {
      logger.warn('Failed to close service container', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('🛑 Server stopped')
        resolve()
      })
    })
  }

  getApp() {
    return this.app
  }

  getServer() {
    return this.server
  }
}

// Main execution
async function startServer() {
  try {
    // Read PORT from environment variable, default to 8002
    const port = parseInt(process.env.PORT || '8002', 10)
    const server = new Server(port)

    await server.initialize()
    await server.start()

    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...')
      await server.stop()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...')
      await server.stop()
      process.exit(0)
    })

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    process.exit(1)
  }
}

// Start the server if this file is run directly
if (import.meta.url.includes('server.ts') || process.argv[1]?.includes('server.ts')) {
  startServer()
}


