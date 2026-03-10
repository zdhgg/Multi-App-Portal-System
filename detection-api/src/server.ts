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

// 闁稿繈鍔岄惇顒勬煥濞嗘帩鍤栧璺哄閹﹪鏁嶅鑸敌╂慨?PM2 闁哄牜浜濆畷鐔兼嚔妞嬪孩鐣遍梺鎸庣懆椤曘倗鈧絻澹堥崵褎娼诲☉姘ｆ煠鐎规洍鏅滅花?
process.on('uncaughtException', (error: Error) => {
  const errorCode = (error as any).code
  const errorMessage = error.message || ''

  // 婵☆偀鍋撻柡灞诲劜濡叉悂宕ラ敂鑺バ?EPIPE 闂佹寧鐟ㄩ銈夋晬閸繍鍚傞柟鎾棑椤忣剟寮鐐电；閺夆晝鍋炵敮鎾晬?
  if (errorCode === 'EPIPE' || errorMessage.includes('EPIPE') || errorMessage.includes('broken pipe')) {
    // EPIPE 闁哄嫷鍨遍婊呮暜閸濄儲鐣辩紓鍐╁灩缁爼寮鐐电；闁挎稑濂旂粭澶嬫償閺冨浂鍤夐悹浣规緲缂嶅秵绋?error
    logger.debug('閻庡箍鍨洪崺娑氱博椤栨繄绠鹃柟鎭掑劜閺屽洤顕ｉ埀顒勬晬閸︽『IPE闁?', {
      message: error.message,
      code: errorCode,
      syscall: (error as any).syscall
    })
    // 濞戞挸绉烽鈧弶鈺傜〒閳荤厧鐣烽埡鍌滅毦闁挎稑濂旂粭澶屾媼閺夎法绉块梺鎸庣懆椤曘倝寮妷銉х
    return
  }

  // 婵☆偀鍋撻柡灞诲劜濡叉悂宕ラ敂鑺バ?PM2 闁烩晝顭堥崣褔鎯?EPERM 闂佹寧鐟ㄩ?
  if (errorMessage.includes('EPERM') && errorMessage.includes('rpc.sock')) {
    logger.warn('闁硅娲濋獮蹇涘礆?PM2 EPERM 闂佹寧鐟ㄩ銈夋晬閸繂鍤掗梻鍐帛椤掓稒娼诲☉姘ｆ煠鐎规洍鏅滅花婵嬫晬?', {
      message: error.message,
      code: errorCode,
      syscall: (error as any).syscall
    })
    // 濞戞挸绉烽鈧弶鈺傜〒閳荤厧鐣烽埡鍌滅毦闁挎稑鑻ぐ褏鎷嬮弶璺ㄧЭ閻犫偓閿曗偓閹?
    return
  }

  // 闁稿繑婀圭划顒勫嫉椤忓懎绀嬮柤楣冾棑濞堟垵顕ｉ崒姘卞煑濞寸姴绉堕崝褔妫侀埀顒傛啺娴ｇ瓔鍞剁憸鐗堟礀閼荤喖宕ｉ婵嗗幋閻庝絻澹堥崵褍鐣烽埡鍌滅毦
  logger.error('闁哄牜浜濆畷鐔兼嚔妞嬪孩鐣辩€殿喖鍊搁悥?', error)
  // 缂備焦鐟ょ粩瀛樼濞戞瑦顦ч梻鍌滎棎椤斺偓闁哄啨鍎辩换鏃堝礃濞嗗繐寮?
  setTimeout(() => {
    process.exit(1)
  }, 1000)
})

process.on('unhandledRejection', (reason: any) => {
  logger.error('闁哄牜浜滈ˇ鈺呮偠閸℃瑦鐣?Promise 闁归攱甯炵划?', reason)
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
    logger.info('妫ｅ啯鐣?Initializing Server v2...')

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

    // 闁告凹鍨版慨鈺傜▔婵犱胶鐐婂☉鎾崇摠濡炲倿寮崶锔筋偨婵炴挸鎳愰幃濠冪鐠囨彃顫ら柨娑樼墦濡茶顫㈤姀鐙€鍤ら柛蹇嬪劜閺嬪啯绂掔捄鐑樿含缁惧彞鑳跺ú蹇涘醇閸℃婵嬫晬?
    try {
      fileCleanupService.start()
    } catch (e) {
      logger.warn('File cleanup service failed to start', { error: e })
    }

    logger.info('闁?Server v2 initialization complete')
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

      // 妫ｅ啯鏁?PM2闁绘鍩栭埀顑跨閹挸顫㈤妷锔界疀闁?
      appAny.locals.pm2StateSyncService = this.container.get<any>('pm2StateSyncService')

      logger.info('闁?Bound services to app.locals for route modules')
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

      // 妫ｅ啯鏁?閺夆晜鍔橀、鎴︽焾閵娧嗩唹婵☆垪鈧磭纭€閺夆晙鑳朵簺闁挎稑鐗婇崸濠囧礉?deployment_mode 閻庢稒顨嗛宀勬晬?
      try {
        logger.info('Running deployment mode migration...')

        // 婵☆偀鍋撻柡灞诲劚閻⊙冣枔閸偅笑闁告熬绠戦崙锛勨偓娑櫭﹢?
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

          logger.info('闁?Deployment mode migration completed')
        } else {
          logger.info('闁?Deployment mode field already exists, skipping migration')
        }
      } catch (migrationError) {
        logger.warn('Deployment mode migration failed (non-critical)', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        })
      }

      // 妫ｅ啯鏁?閺夆晜鍔橀、?application_metadata 闁圭鏅涢惈宥団偓娑欘殕椤斿本娼绘担鐩掆晠鏁嶉崸顪痭ned/access_path闁?
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
          logger.info('闁?Added pinned column to application_metadata')
        } else {
          logger.info('闁?Pinned metadata field already exists, skipping migration')
        }

        if (!hasAccessPath) {
          database.prepare(`
            ALTER TABLE application_metadata 
            ADD COLUMN access_path TEXT
          `).run()
          logger.info('闁?Added access_path column to application_metadata')
        } else {
          logger.info('闁?access_path metadata field already exists, skipping migration')
        }
        }
      } catch (migrationError) {
        logger.warn('Application metadata migration failed (non-critical)', {
          error: migrationError instanceof Error ? migrationError.message : String(migrationError)
        })
      }

      logger.info('闁?Database migrations completed')
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
    // Phase 3: CORS 缁绢収鍓欑€垫煡鏌婂鍥╂瀭
    // 
    // 闁绘粠鍨伴。銊╁矗濮椻偓閸ｆ椽骞掕閸╂鏁?
    // - CORS_ORIGIN: 闁稿繋娴囬蹇涙儍閸曨偆鍘甸柛姘Т閸亞鎮伴…鎺旂闂侇偅顨呰ぐ鍧楀礆閸℃稒顓鹃柨娑橆檧缁辨繄鎷嬮崣銉ㄧ * 閻炴稏鍔庨妵姘跺礂娴ｇ瓔鍟呴柟纰樺亾闁?
    // - CORS_MODE: 'strict' | 'lan' | 'open'
    //   - strict: 濞寸姴鎳庨崢鎴犳媼?CORS_ORIGIN 濞戞搩鍙冮崢銈囩磾椤旂偓鐣遍柛鈺冨枎閹?
    //   - lan: 闁稿繋娴囬蹇曚沪閳ь剟宕洪悢铏圭Ч IP + CORS_ORIGIN闁挎稑鐗撶划顖滄媼閵堝繒绀?
    //   - open: 闁稿繋娴囬蹇涘箥閳ь剟寮垫径瀣檷婵犙勫姧缁辨瑦绂掗崨顓犵；闁告瑦鍨归獮鍡樻櫠閸愯法绀?
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
        // 闁稿繋娴囬蹇涘籍?origin 闁汇劌瀚顒€效閸岋妇绀勫┑鈥冲€搁幃鎾斥攦閹邦垼鍤炴慨鐟板€堕埀顑胯祴ostman闁靛棔鐒﹀﹢鍥礉閿涘嫷浼傞悹瀣暟閺併倝鏁?
        if (!origin) {
          return callback(null, true)
        }
        
        // 闁稿繋娴囬?localhost 闁?127.0.0.1闁挎稑鐗嗙槐鎴﹀矗閹存繃瀚查柡鍫墯濠р偓閻犱礁娼″Λ鍫曟晬?
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true)
        }
        
        // Phase 3: 闁哄秷顫夊畵?CORS_MODE 闁告劕鍟块悾鍓х驳閺嶎偅娈?
        const corsOrigin = process.env.CORS_ORIGIN
        
        // 1. open 婵☆垪鈧磭纭€闁挎稒鑹鹃崢鎴犳媼閸涘﹤顣查柡鍫濐檧缁辨瑦绂掗崨瀛樺闁汇垻鍠嶆鍥偝椤栨凹鏆旈柨?
        if (corsMode === 'open' && !isProduction) {
          return callback(null, true)
        }
        
        // 2. strict 婵☆垪鈧磭纭€闁挎稒鐭划搴ㄥ礂娴ｇ瓔鍟呴柣褑妫勯幃鏇㈠础?
        if (corsMode === 'strict') {
          if (!corsOrigin) {
            logger.warn('CORS strict mode enabled but CORS_ORIGIN is missing', { origin })
            return callback(null, false)
          }
          const allowedOrigins = corsOrigin.split(',').map(o => o.trim())
          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true)
          }
          logger.warn('CORS request rejected in strict mode', { origin, allowedOrigins })
          return callback(null, false)
        }
        
        // 3. lan 婵☆垪鈧磭纭€闁挎稑鐗撶划顖滄媼閵堝繒绀嗛柨娑欒壘閸樻垹鎷嬬粙璺ㄦ拱闁糕晝鍠撶紞?+ 闁谎嗘閹洟宕?
        // 闁稿繋娴囬蹇曚沪閳ь剟宕洪悢铏圭Ч IP闁?0.x.x.x, 172.16-31.x.x, 192.168.x.x, 25.x.x.x闁?
        // 闁告艾鏈鍌炲礂娴ｇ瓔鍟?Tailscale CGNAT 婵炲牏顣槐?00.64.0.0/10闁挎稑顦幏?MagicDNS 闁糕晝鍠庨幃鏇㈡晬?.ts.net闁?
        const lanPattern = /^https?:\/\/(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|25\.\d+\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|[a-zA-Z0-9.-]+\.ts\.net)(:\d+)?$/
        if (lanPattern.test(origin)) {
          return callback(null, true)
        }
        
        // 婵☆偀鍋撻柡灞诲劤濞呇囧触瀹ュ懎绀?
        if (corsOrigin) {
          const allowedOrigins = corsOrigin.split(',').map(o => o.trim())
          if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
            return callback(null, true)
          }
        }
        
        // 闁汇垻鍠嶆鍥偝椤栨凹鏆旈柟閿嬪笧缁兘寮甸鍡欏弨闁哄鍎茬花顕€鏁嶇仦鐣岀；闁告瑦鍨归獮鍡樻櫠閸愩劌甯掗悹?
        if (isProduction) {
          logger.warn('CORS request rejected in production', { origin, corsMode })
          return callback(null, false)
        }
        
        // 鐎殿喒鍋撻柛娆愬灩楠炲棙鏅堕崘銊ュ笒閻犱線娼荤槐娆愭媴閸℃凹鍞剁憸鐗堟礉椤掔喖宕ㄦ繝蹇曠
        logger.debug('CORS request allowed in development', { origin })
        return callback(null, true)
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With', 'X-Confirm-Action']
    }))
    
    logger.info('CORS configuration loaded', {
      mode: corsMode, 
      isProduction,
      helmetEnabled,
      rateLimitEnabled,
      requestBodyLimit,
      corsOrigin: process.env.CORS_ORIGIN || '(not configured)'
    })

    // JSON parsing
    this.app.use(express.json({ limit: requestBodyLimit }))
    this.app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }))

    // Standard response formatting middleware (Phase 3)
    this.app.use(standardResponseMiddleware)

    // 濠㈣泛瀚幃濠囧传瀹ュ懐瀹夐梺鎸庣懆椤曘倝鏁嶉崷妗篒PE缂佹稑顧€缁?
    this.app.use((req: any, res: any, next: any) => {
      // 闁烩晜鍨甸幆澶愬传瀹ュ懐瀹夐梺鎸庣懆椤?
      res.on('error', (error: any) => {
        // 闊洨鏅弳?EPIPE 闂佹寧鐟ㄩ銈夋晬閸繍鍚傞柟鎾棑椤忣剟寮鐐电；閺夆晝鍋炵敮鎾晬?
        if (error.code === 'EPIPE' || error.message?.includes('EPIPE') || error.message?.includes('broken pipe')) {
          logger.debug('闁告繂绉寸花鏌ュ礃濞嗗繐寮冲鎯扮簿鐟欙箓鏁嶉崼婵愬悅闁规挳顥撻顒€顔忛崣澶嬬劷鐎殿喒鍋撻柨?', {
            url: req.url,
            method: req.method,
            error: error.message
          })
          return
        }

        // 闁稿繑婀圭划顒勫传瀹ュ懐瀹夐梺鎸庣懆椤曘倗鎷嬮弶璺ㄧЭ濞戞捇缂氶鐔煎川?
        logger.warn('闁告繂绉寸花鏌ユ煥濞嗘帩鍤?', {
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

    logger.info('闁?Middleware configured')
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
    logger.info('妫ｅ啯鐣?Unified API Router mounted (Phase 4) - apiAdapter + ServiceContainer integrated')

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

    logger.info('闁?Routes configured')
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleError = (error: any) => {
        // Ignore EPIPE when clients disconnect early
        if (error.code === 'EPIPE') {
          logger.debug('Client disconnected (EPIPE)', { error: error.message })
          return
        }

        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${this.port} is already in use`)
        } else {
          logger.error('Server error', { error })
        }
        reject(error)
      }

      this.server.once('error', handleError)

      // 闁烩晜鍨甸幆?0.0.0.0 濞寸姰鍎查弫顕€骞愭担鍝ユ拱闁糕晝鍠撶紞澶屾媼閸ф锛?
      this.server.listen(this.port, '0.0.0.0', () => {
        this.server.off('error', handleError)
        logger.info(`妫ｅ啯鐣?Server v4 listening on port ${this.port} (Phase 4 - Unified Architecture)`)
        logger.info(`妫ｅ啯鎲?Unified API: http://localhost:${this.port}/api`)
        logger.info(`妫ｅ啯鎲?API Documentation: http://localhost:${this.port}/api/v2/docs`)
        logger.info(`妫ｅ啯鏁?Migration Guide: http://localhost:${this.port}/api/migration-guide`)
        logger.info(`妫ｅ啯瀵?Health: http://localhost:${this.port}/health`)
        logger.info(`妫ｅ啯鏁?WebSocket: ws://localhost:${this.port}/ws`)
        logger.info(`妫ｅ啫顕?LAN Access: Server is accessible from local network`)

        // PM2闁绘鍩栭埀顑跨閹挸顫㈤妷锔界疀闁告柡鈧啿鍤掗柛?ServiceContainer.startBackgroundServices() 濞戞搩鍘奸幆搴ㄥ礉?
        // 闁哄啰濞€濞撳爼鏌屽鍜佹Щ闁告凹鍨版慨?

        resolve()
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
        logger.info('妫ｅ啯纾?Server stopped')
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
export async function startServer() {
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
if (!(globalThis as any).__PORTAL_BOOTSTRAP__ && (import.meta.url.includes('server.ts') || process.argv[1]?.includes('server.ts'))) {
  startServer()
}


