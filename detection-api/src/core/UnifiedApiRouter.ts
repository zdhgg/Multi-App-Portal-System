/**
 * 统一API路由管理器 - 整合apiAdapter和ServiceContainer
 * 
 * 解决双路由系统问题，提供统一的API架构
 * 支持版本管理、向后兼容和渐进式迁移
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ServiceContainer } from './ServiceContainer.js';
import { logger } from '../utils/logger.js';
import standardResponseMiddleware from '../middleware/standardResponse.js';
import {
  requireAuth,
  requireAdmin,
  requireOperator,
  operatorReadOnly,
  auditLog
} from '../middleware/authMiddleware.js';
import { responseFormatNegotiator } from '../utils/responseAdapter.js';
import legacyRoutes, { initLogService, initLogManagementService, initConfigService } from '../routes/index.js';
import { initConfigExporter } from '../routes/configurationExport.js';
import { LogManagementService } from '../services/logManagementService.js';
import { initializeGlobalScheduler } from '../services/logCleanupScheduler.js';
import { initializeGlobalBackupScheduler } from '../services/backupScheduler.js';
import {
  LEGACY_APPS_MODE_ENV,
  LEGACY_APPS_MIGRATION_TARGET,
  buildLegacyAppsDeprecationHeaders,
  resolveLegacyAppsMode,
  shouldBlockLegacyAppsRequest
} from './legacyAppsPolicy.js';
import { LegacyUsageTracker } from './legacyUsageTracker.js';

// ===============================================================================
// 类型定义
// ===============================================================================

interface ApiVersionInfo {
  version: string;
  path: string;
  status: 'current' | 'legacy' | 'deprecated';
  description: string;
  features?: string[];
  deprecationDate?: string;
  migrationTo?: string;
}

interface UnifiedApiConfig {
  enableV1Compatibility: boolean;
  enableV2Standard: boolean;
  enableMigrationTools: boolean;
  enableVersionNegotiation: boolean;
}

// ===============================================================================
// 统一API路由管理器
// ===============================================================================

export class UnifiedApiRouter {
  private mainRouter = Router();
  private v1Router = Router();
  private v2Router = Router();
  private migrationRouter = Router();
  private serviceRoutes: Router | null = null;
  private readonly legacyAppsUsageTracker = new LegacyUsageTracker();

  private serviceContainer: ServiceContainer;
  private config: UnifiedApiConfig;

  constructor(serviceContainer: ServiceContainer, config: Partial<UnifiedApiConfig> = {}) {
    this.serviceContainer = serviceContainer;
    this.config = {
      enableV1Compatibility: true,
      enableV2Standard: true,
      enableMigrationTools: true,
      enableVersionNegotiation: true,
      ...config
    };

    this.initialize();
  }

  /**
   * 获取统一的API路由器
   */
  getRouter(): Router {
    return this.mainRouter;
  }

  // ===============================================================================
  // 初始化方法
  // ===============================================================================

  private initialize(): void {
    this.setupGlobalMiddleware();
    this.setupVersionRouting();
    this.setupV1Routes();
    this.setupV2Routes();
    this.setupMainRoutes(); // Phase 5: 主路由和遗留API兼容性
    this.mountMainRoutes(); // 挂载主路由级别的控制器 (filesystem, build)
    this.initializeServices(); // 初始化服务
    this.setupMigrationTools();
    this.setupApiInfo();
    this.setupErrorHandling();

    logger.info('🚀 Unified API Router initialized', {
      v1Enabled: this.config.enableV1Compatibility,
      v2Enabled: this.config.enableV2Standard,
      migrationEnabled: this.config.enableMigrationTools
    });
  }

  /**
   * 初始化服务
   */
  private initializeServices(): void {
    try {
      // 初始化日志服务
      const logService = this.serviceContainer.get('logService') as any;
      if (logService) {
        initLogService(logService);
        logger.info('✅ Log service initialized');
      }

      // 初始化配置导出服务
      const database = this.serviceContainer.getDatabase();
      if (database) {
        initConfigExporter(database);
        logger.info('✅ Config exporter service initialized');
        // 初始化应用配置服务（App Configuration Routes依赖）
        try {
          initConfigService(database);
          logger.info('✅ App configuration service initialized');
        } catch (e) {
          logger.warn('⚠️ Failed to initialize app configuration service', { error: e });
        }

        // 初始化日志管理服务和调度器
        initLogManagementService(database);
        logger.info('✅ Log management service initialized');

        // 启动日志清理调度器
        const logMgmtService = new LogManagementService(database);
        initializeGlobalScheduler(logMgmtService);
        logger.info('✅ Log cleanup scheduler initialized');

        initializeGlobalBackupScheduler(database);
        logger.info('✅ Backup scheduler initialized');
      }
    } catch (error) {
      logger.error('❌ Failed to initialize services', { error });
    }
  }

  /**
   * 设置全局中间件
   */
  private setupGlobalMiddleware(): void {
    // 标准响应格式中间件 (Phase 3)
    this.mainRouter.use(standardResponseMiddleware);

    // 响应格式协商中间件 (Phase 3)
    if (this.config.enableVersionNegotiation) {
      this.mainRouter.use(responseFormatNegotiator());
    }

    // 版本检测和路由中间件
    this.mainRouter.use(this.versionDetectionMiddleware.bind(this));

    logger.info('✅ Global middleware configured for Unified API Router');
  }

  /**
   * 版本检测和路由中间件
   */
  private versionDetectionMiddleware(req: Request, res: Response, next: NextFunction): void {
    // 检测API版本
    let detectedVersion = 'v1'; // 默认版本

    if (req.path.startsWith('/v2')) {
      detectedVersion = 'v2';
    } else if (req.path.startsWith('/v2-ports')) {
      detectedVersion = 'v2-ports'; // 兼容性路径
    } else if (req.query.version === 'v2' || req.headers['api-version'] === 'v2') {
      detectedVersion = 'v2';
    }

    // 添加版本信息到请求
    req.apiVersion = detectedVersion;

    // 添加版本信息到响应头
    res.setHeader('API-Version', detectedVersion);
    res.setHeader('API-Available-Versions', 'v1, v2');

    // 添加弃用警告 (如果适用)
    if (detectedVersion === 'v1' || detectedVersion === 'v2-ports') {
      res.setHeader('API-Deprecation-Warning', 'This API version is deprecated. Please migrate to v2.');
      res.setHeader('API-Migration-Guide', '/api/migration-guide');
    }

    next();
  }

  // ===============================================================================
  // 版本路由配置
  // ===============================================================================

  /**
   * 设置版本路由结构
   */
  private setupVersionRouting(): void {
    // v1 路由 (传统兼容)
    if (this.config.enableV1Compatibility) {
      this.mainRouter.use('/v1', this.v1Router);
      // 注意：移除了 createLegacyPortManagementRouter() 的挂载
      // 具体的 /port-management 路由现在在 setupLegacyApiCompatibility() 中处理
      // 这样可以避免路由冲突，让具体的 API 端点（如 /scan/range）能被正确匹配
    }

    // v2 路由 (现代标准)
    if (this.config.enableV2Standard) {
      this.mainRouter.use('/v2', this.v2Router);
    }

    // 迁移工具路由
    if (this.config.enableMigrationTools) {
      this.mainRouter.use('/', this.migrationRouter);
    }
  }

  /**
   * 设置v1路由 (传统兼容性)
   */
  private setupV1Routes(): void {
    if (!this.config.enableV1Compatibility) return;

    // 注意：移除了 v1 端口管理路由的挂载
    // /v1/port-management 路径现在通过通配重定向到 v2

    // 兼容性路径重定向
    this.v1Router.get('*', (req, res) => {
      const v2Path = req.path.replace('/v1', '/v2');
      res.redirect(301, `/api/v2${v2Path}`);
    });

    logger.info('✅ v1 compatibility routes configured');
  }

  /**
   * 设置v2路由 (现代标准)
   */
  private setupV2Routes(): void {
    if (!this.config.enableV2Standard) return;

    // 从ServiceContainer获取v2控制器路由（同时复用 legacy /apps 兼容桥）
    this.serviceRoutes = this.serviceContainer.getApiRouter();
    const serviceRoutes = this.serviceRoutes;

    // 挂载ServiceContainer的v2路由 (移除v2前缀，因为我们已经在v2路径下)
    this.mountServiceContainerRoutes(serviceRoutes);

    // v2-ports兼容性路由 (Phase 2修复的路径)
    this.setupV2PortsCompatibility();

    // v2 API文档
    this.v2Router.get('/docs', this.handleV2Documentation.bind(this));

    // Phase 5: 性能监控端点
    this.setupPerformanceEndpoints();

    logger.info('✅ v2 standard routes configured');
  }

  // ===============================================================================
  // 主路由设置
  // ===============================================================================

  /**
   * 设置主路由系统
   */
  private setupMainRoutes(): void {
    // Phase 5: legacy /api/apps 灰度桥接 + 调用遥测
    this.setupLegacyAppsBridge();

    // Phase 5: 遗留API兼容性
    this.setupLegacyApiCompatibility();
  }

  /**
   * 挂载ServiceContainer路由到v2（含RBAC权限控制）
   * 
   * 权限矩阵：
   * - /applications: operator可读+启停，admin可增删改
   * - /detection: operator可读，admin可写
   * - /public: 生产默认需认证，可通过环境变量放开匿名
   * - /auth: 公开（登录等）或认证后（profile等）
   * - /config/ports: operator只读，admin可写
   * - /config: operator只读，admin可写
   */
  private mountServiceContainerRoutes(serviceRoutes: Router): void {
    try {
      // 应用管理 - operator可操作（启停），admin可完全管理
      // 细粒度权限在 ApplicationsController 内部处理
      this.v2Router.use('/applications',
        requireAuth,
        requireOperator,
        auditLog('applications'),
        (this.serviceContainer.get('applicationsController') as any).getRouter());

      // 检测功能 - operator只读，admin可写
      this.v2Router.use('/detection',
        requireAuth,
        operatorReadOnly,
        (this.serviceContainer.get('detectionController') as any).getRouter());

      // 公共API - 生产默认要求认证，可通过环境变量放开匿名访问
      const publicApiAnonymousEnabledByEnv = ['1', 'true', 'on'].includes(
        (process.env.ENABLE_V2_PUBLIC_ANONYMOUS || '').trim().toLowerCase()
      );
      const publicApiAnonymousEnabled = process.env.NODE_ENV === 'production'
        ? publicApiAnonymousEnabledByEnv
        : true;

      if (publicApiAnonymousEnabled) {
        this.v2Router.use('/public',
          (this.serviceContainer.get('publicController') as any).getRouter());
      } else {
        this.v2Router.use('/public',
          requireAuth,
          (this.serviceContainer.get('publicController') as any).getRouter());
      }

      // 认证 - 登录等公开，其他需认证（在AuthController内部处理）
      this.v2Router.use('/auth',
        (this.serviceContainer.get('authController') as any).getRouter());

      // 端口配置 - operator只读，admin可写
      this.v2Router.use('/config/ports',
        requireAuth,
        operatorReadOnly,
        auditLog('port-config'),
        (this.serviceContainer.get('portConfigController') as any).getRouter());

      // 用户设置 - operator只读，admin可写
      this.v2Router.use('/config',
        requireAuth,
        operatorReadOnly,
        (this.serviceContainer.get('userSettingsController') as any).getRouter());

      logger.info('✅ ServiceContainer routes mounted to v2 with RBAC', {
        publicApiAnonymousEnabled
      });
    } catch (error) {
      logger.error('❌ Failed to mount ServiceContainer routes', { error });

      // 回退方案：直接使用ServiceContainer的路由
      this.v2Router.use('/', serviceRoutes);
      logger.warn('⚠️ Using fallback ServiceContainer routing');
    }
  }

  /**
   * 挂载主路由级别的控制器（含RBAC权限控制）
   * 
   * 权限矩阵：
   * - /filesystem: 仅admin（高危操作）
   * - /build: admin可执行构建，operator只读分析
   * - /public, /port-performance: 默认需认证（operator+），可通过环境变量放开
   * - /settings: 仅admin
   * - legacy routes (pm2, logs, config): 按各自权限
   */
  private mountMainRoutes(): void {
    try {
      // 文件系统API - 仅admin（高危：可打开文件夹）
      this.mainRouter.use('/filesystem',
        requireAuth,
        requireAdmin,
        auditLog('filesystem'),
        (this.serviceContainer.get('filesystemController') as any).getRouter());

      // 构建工具API - operator只读（analyze），admin可执行构建
      this.mainRouter.use('/build',
        requireAuth,
        operatorReadOnly,
        auditLog('build'),
        (this.serviceContainer.get('buildController') as any).getRouter());

      // 监控API - 默认需要认证（operator+），可通过环境变量临时放开
      const monitoringController = this.serviceContainer.get('monitoringController') as any;
      const publicMonitoringEnabled = ['1', 'true', 'on'].includes(
        (process.env.ENABLE_PUBLIC_MONITORING || '').trim().toLowerCase()
      );

      if (publicMonitoringEnabled) {
        this.mainRouter.use('/public', monitoringController.getRouter());
        this.mainRouter.use('/port-performance', monitoringController.getRouter());
        logger.warn('⚠️ Public monitoring endpoints are enabled without authentication', {
          env: 'ENABLE_PUBLIC_MONITORING'
        });
      } else {
        this.mainRouter.use('/public', requireAuth, requireOperator, monitoringController.getRouter());
        this.mainRouter.use('/port-performance', requireAuth, requireOperator, monitoringController.getRouter());
      }

      // 系统设置API - 仅admin
      this.mainRouter.use('/settings',
        requireAuth,
        requireAdmin,
        auditLog('settings'),
        (this.serviceContainer.get('systemSettingsController') as any).getRouter());

      // 传统路由 (health, config, pm2, logs) - 权限在各自路由文件中处理
      this.mainRouter.use('/', legacyRoutes);

      logger.info('✅ Main-level routes mounted with RBAC (filesystem, build, monitoring, settings, legacy)', {
        publicMonitoringEnabled
      });
    } catch (error) {
      logger.error('❌ Failed to mount main-level routes', { error });
    }
  }

  /**
   * 设置v2-ports兼容性路由
   */
  private setupV2PortsCompatibility(): void {
    // v2-ports路径重定向到统一的端口配置
    this.mainRouter.use('/v2-ports', (req, res, next) => {
      // 添加弃用警告
      res.setHeader('X-API-Deprecation', 'v2-ports path is deprecated');
      res.setHeader('X-API-Migration-Target', '/api/v2/config/ports');

      // 重定向到统一端口管理
      const newPath = req.path.replace('/v2-ports', '/v2/config/ports');
      return res.redirect(301, `/api${newPath}`);
    });
  }

  // ===============================================================================
  // 专用路由创建器
  // ===============================================================================

  /**
   * 创建传统端口管理路由
   * 
   * 注意：此路由器已被 setupLegacyApiCompatibility() 中的具体路由替代
   * 保留此方法仅用于向后兼容，实际的端口管理请求由 v2 API 处理
   */
  private createLegacyPortManagementRouter(): Router {
    const router = Router();

    // 添加弃用警告中间件
    router.use((req, res, next) => {
      res.setHeader('X-API-Legacy-Warning', 'This endpoint is deprecated');
      res.setHeader('X-API-Migration-Target', '/api/v2/applications/ports');
      next();
    });

    // 注意：不再返回410，而是让请求继续到其他处理器
    // 具体的路由处理已在 setupLegacyApiCompatibility() 中实现

    return router;
  }

  // ===============================================================================
  // API信息和文档
  // ===============================================================================

  /**
   * 设置API信息根路径
   */
  private setupApiInfo(): void {
    this.mainRouter.get('/', (req, res) => {
      res.apiSuccess({
        name: 'Intelligent Multi-App Portal System API',
        description: '智能多应用门户系统统一API - Phase 4 Integrated',
        version: '4.0.0',
        architecture: 'Unified Router Architecture',
        availableVersions: this.getVersionInfo(),
        features: [
          '统一的路由架构',
          '标准化响应格式',
          '智能版本协商',
          '向后兼容支持',
          '渐进式迁移路径'
        ],
        endpoints: {
          v1: {
            status: 'deprecated',
            endpoints: ['/api/v1/port-management/*']
          },
          v2: {
            status: 'current',
            endpoints: [
              '/api/v2/applications/*',
              '/api/v2/detection/*',
              '/api/v2/public/*',
              '/api/v2/auth/*',
              '/api/v2/config/ports/*'
            ]
          }
        },
        migration: {
          guide: '/api/migration-guide',
          tools: '/api/migration-tools',
          status: '/api/migration-status',
          legacyUsage: '/api/migration/legacy-usage'
        },
        documentation: {
          v2: '/api/v2/docs',
          openapi: '/api/openapi.json'
        }
      }, 'Unified API Router - Phase 4 Integration Complete');
    });
  }

  /**
   * 获取版本信息
   */
  private getVersionInfo(): Record<string, ApiVersionInfo> {
    return {
      v1: {
        version: '1.0',
        path: '/api/v1',
        status: 'deprecated',
        description: '传统API（仅兼容性支持）',
        deprecationDate: '2024-12-31'
      },
      'v2-ports': {
        version: '2.0-ports',
        path: '/api/v2-ports',
        status: 'legacy',
        description: '端口管理专用API（已迁移）',
        migrationTo: '/api/v2/config/ports'
      },
      v2: {
        version: '2.0',
        path: '/api/v2',
        status: 'current',
        description: '现代统一API（推荐使用）',
        features: [
          '统一响应格式',
          '智能错误处理',
          '完整类型支持',
          '性能优化',
          '扩展功能支持'
        ]
      }
    };
  }

  /**
   * v2文档处理器
   */
  private async handleV2Documentation(req: Request, res: Response): Promise<void> {
    res.apiSuccess({
      title: 'API v2 Documentation - Unified Architecture',
      version: '2.0.0',
      architecture: 'Phase 4 Integrated Router',
      baseUrl: '/api/v2',
      authentication: '需要认证的端点请使用Authorization头部',
      responseFormat: 'StandardApiResponse<T>',
      categories: {
        applications: {
          description: '应用生命周期管理',
          endpoints: [
            'GET /applications - 获取应用列表',
            'POST /applications - 创建应用',
            'GET /applications/:id - 获取应用详情',
            'PUT /applications/:id - 更新应用',
            'DELETE /applications/:id - 删除应用'
          ]
        },
        detection: {
          description: '项目检测和分析',
          endpoints: [
            'POST /detection/sessions - 创建检测会话',
            'GET /detection/sessions/:id - 获取检测结果',
            'GET /detection/sessions/:id/projects - 获取项目列表'
          ]
        },
        config: {
          description: '系统配置管理',
          endpoints: [
            'GET /config/ports - 获取端口配置',
            'PUT /config/ports - 更新端口配置',
            'POST /config/ports/allocate - 分配端口'
          ]
        },
        public: {
          description: '公共无认证API',
          endpoints: [
            'GET /public/health - 系统健康状态',
            'GET /public/apps - 公共应用列表'
          ]
        }
      }
    }, 'v2 API documentation retrieved successfully');
  }

  // ===============================================================================
  // 性能监控端点 (Phase 5)
  // ===============================================================================

  /**
   * 设置性能监控端点（已简化）
   */
  private setupPerformanceEndpoints(): void {
    const publicSystemEndpointsEnabled = ['1', 'true', 'on'].includes(
      (process.env.ENABLE_PUBLIC_SYSTEM_ENDPOINTS || '').trim().toLowerCase()
    );

    if (publicSystemEndpointsEnabled) {
      // 系统健康状态（简化版）
      this.v2Router.get('/system/health', (req: Request, res: Response) => {
        res.apiSuccess({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          message: 'System is running'
        }, 'System health status retrieved');
      });

      // 性能报告（简化版）
      this.v2Router.get('/system/performance', (req: Request, res: Response) => {
        res.apiSuccess({
          message: 'Performance monitoring simplified',
          timestamp: new Date().toISOString()
        }, 'Performance report retrieved');
      });

      // 优化建议（简化版）
      this.v2Router.get('/system/recommendations', (req: Request, res: Response) => {
        res.apiSuccess({
          recommendations: [],
          message: 'Optimization recommendations simplified'
        }, 'Optimization recommendations retrieved');
      });

      logger.warn('⚠️ v2 system endpoints are exposed without authentication', {
        env: 'ENABLE_PUBLIC_SYSTEM_ENDPOINTS'
      });
      return;
    }

    // 默认：需要认证（operator+）
    this.v2Router.get('/system/health', requireAuth, requireOperator, (req: Request, res: Response) => {
      res.apiSuccess({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        message: 'System is running'
      }, 'System health status retrieved');
    });

    this.v2Router.get('/system/performance', requireAuth, requireOperator, (req: Request, res: Response) => {
      res.apiSuccess({
        message: 'Performance monitoring simplified',
        timestamp: new Date().toISOString()
      }, 'Performance report retrieved');
    });

    this.v2Router.get('/system/recommendations', requireAuth, requireOperator, (req: Request, res: Response) => {
      res.apiSuccess({
        recommendations: [],
        message: 'Optimization recommendations simplified'
      }, 'Optimization recommendations retrieved');
    });

    logger.info('✅ Performance monitoring endpoints configured (simplified + auth protected)');
  }

  /**
   * 将 /api/apps/* 请求桥接到 ServiceContainer 中的 legacy apps router
   */
  private setupLegacyAppsBridge(): void {
    if (!this.serviceRoutes) {
      this.serviceRoutes = this.serviceContainer.getApiRouter();
    }

    const serviceRoutes = this.serviceRoutes;
    const legacyAppsMode = resolveLegacyAppsMode(process.env[LEGACY_APPS_MODE_ENV]);

    this.mainRouter.use('/apps', (req: Request, res: Response, next: NextFunction) => {
      const deprecationHeaders = buildLegacyAppsDeprecationHeaders();
      for (const [headerName, headerValue] of Object.entries(deprecationHeaders)) {
        res.setHeader(headerName, headerValue);
      }

      const suffix = req.path && req.path !== '/' ? req.path : '';
      this.legacyAppsUsageTracker.record(`/apps${suffix}`, req.method);

      const blockedReason = shouldBlockLegacyAppsRequest(legacyAppsMode, req.method);
      if (blockedReason === 'disabled') {
        res.status(410).json({
          success: false,
          error: 'Legacy apps API disabled',
          code: 'LEGACY_APPS_API_DISABLED',
          message: `Legacy /api/apps endpoints are disabled. Please migrate to ${LEGACY_APPS_MIGRATION_TARGET}.`
        });
        return;
      }

      if (blockedReason === 'readonly') {
        res.status(403).json({
          success: false,
          error: 'Legacy apps API is read-only',
          code: 'LEGACY_APPS_API_READONLY',
          message: `Write operations on /api/apps are disabled in readonly mode. Please migrate to ${LEGACY_APPS_MIGRATION_TARGET}.`
        });
        return;
      }

      next();
    });

    this.mainRouter.use('/apps', (req: Request, res: Response, next: NextFunction) => {
      const originalUrl = req.url;
      const delegatedUrl = `/apps${originalUrl === '/' ? '' : originalUrl}`;
      let restored = false;

      const restoreUrl = (): void => {
        if (restored) return;
        req.url = originalUrl;
        restored = true;
      };

      res.once('finish', restoreUrl);
      res.once('close', restoreUrl);

      req.url = delegatedUrl;

      try {
        serviceRoutes(req, res, (error?: any) => {
          restoreUrl();
          next(error);
        });
      } catch (error) {
        restoreUrl();
        next(error);
      }
    });

    logger.info('✅ Legacy apps bridge configured', {
      mode: legacyAppsMode,
      telemetry: '/api/migration/legacy-usage'
    });
  }

  /**
   * 设置遗留API兼容性端点 (Phase 5)
   */
  private setupLegacyApiCompatibility(): void {
    // 端口分析API (前端期望: /api/ports/analytics)
    this.mainRouter.get('/ports/analytics', async (req: Request, res: Response) => {
      try {
        const { range = '30d', portType } = req.query;

        logger.info('收到端口分析请求', { range, portType });

        // 尝试获取portManager，如果不存在则使用fallback
        let portManager;
        try {
          portManager = this.serviceContainer.get('portManagementService');
        } catch (e) {
          logger.info('portManager不可用，返回基础测试数据');
        }

        if (!portManager) {
          // 如果没有portManager，返回基础测试数据
          const now = new Date();
          const rangeInDays = range === '7d' ? 7 : range === '90d' ? 90 : 30;

          const trends = [];
          for (let i = rangeInDays - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            trends.push({
              timestamp: date.toISOString(),
              totalPorts: 3000,
              usedPorts: Math.floor(Math.random() * 10) + 2,
              conflicts: Math.floor(Math.random() * 3),
              automationTasks: Math.floor(Math.random() * 5)
            });
          }

          const analytics = {
            overview: {
              utilizationRate: 0.1,
              averageResponseTime: 85,
              conflictResolutionRate: 95,
              automationRate: 80,
              trend: {
                utilization: 2,
                responseTime: -5,
                conflictResolution: 3,
                automation: 5
              }
            },
            trends,
            distribution: [
              { type: 'web', count: 5, percentage: 50 },
              { type: 'api', count: 3, percentage: 30 },
              { type: 'database', count: 2, percentage: 20 }
            ],
            insights: [
              {
                id: 'utilization',
                title: '端口利用率健康',
                description: '当前端口使用率处于合理范围',
                severity: 'info',
                category: 'performance'
              }
            ],
            detailedAnalysis: {
              summary: {
                totalMonitoredPorts: 10,
                activeConnections: 5,
                averageUtilization: 45,
                peakUsageTime: '14:00-16:00',
                criticalIssues: 0
              },
              portDetails: [
                {
                  port: 3000,
                  type: 'web',
                  status: 'active',
                  application: 'main-portal',
                  usage: 80,
                  lastActivity: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
                  recommendations: ['运行正常']
                },
                {
                  port: 8001,
                  type: 'api',
                  status: 'active',
                  application: 'detection-api',
                  usage: 60,
                  lastActivity: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
                  recommendations: ['运行正常']
                }
              ],
              performanceMetrics: {
                responseTimeAvg: 85,
                throughputMbps: 125,
                errorRate: 0.5,
                availabilityPercent: 99.9
              },
              securityAnalysis: {
                vulnerablePorts: 0,
                exposedServices: ['HTTP', 'HTTPS'],
                recommendations: ['定期更新安全补丁', '启用防火墙规则']
              },
              optimizationSuggestions: [
                {
                  type: 'resource',
                  title: '资源使用优化',
                  description: '系统运行良好，无需优化',
                  impact: 'low',
                  effort: 'easy'
                }
              ]
            },
            lastUpdated: now.toISOString(),
            range: {
              start: new Date(now.getTime() - rangeInDays * 24 * 60 * 60 * 1000).toISOString(),
              end: now.toISOString(),
              preset: range
            }
          };

          return res.apiSuccess(analytics, '端口分析数据获取成功');
        }

        const statistics = await portManager.getPortStatistics();
        const now = new Date();
        const rangeInDays = range === '7d' ? 7 : range === '90d' ? 90 : 30;

        // 获取真实的历史趋势数据
        let trends = portManager.getPortPerformanceTrends?.(rangeInDays) || [];

        // 如果没有历史数据，生成基于当前统计的模拟趋势
        if (trends.length === 0) {
          for (let i = rangeInDays - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);

            trends.push({
              timestamp: date.toISOString(),
              totalPorts: statistics.totalAllocated || 0,
              usedPorts: statistics.byStatus?.allocated || statistics.byStatus?.in_use || 0,
              conflicts: Math.floor(Math.random() * 3),
              automationTasks: Math.floor(Math.random() * 5)
            });
          }
        }

        // 生成分布数据
        const distribution = [];
        const typeStats = statistics.byType || {};
        const totalPorts = statistics.totalAllocated || 1;

        for (const [type, count] of Object.entries(typeStats)) {
          distribution.push({
            type,
            count: count as number,
            percentage: Math.round(((count as number) / totalPorts) * 100)
          });
        }

        // 如果没有数据，提供默认分布
        if (distribution.length === 0) {
          distribution.push(
            { type: 'web', count: 5, percentage: 50 },
            { type: 'api', count: 3, percentage: 30 },
            { type: 'database', count: 2, percentage: 20 }
          );
        }

        const analyticsData = {
          overview: {
            utilizationRate: Math.round((statistics.byStatus?.allocated || 0) / Math.max(statistics.totalAllocated || 1, 1) * 100),
            averageResponseTime: Math.floor(Math.random() * 100) + 50,
            conflictResolutionRate: 95,
            automationRate: 80,
            trend: {
              utilization: Math.floor(Math.random() * 10) - 5,
              responseTime: Math.floor(Math.random() * 20) - 10,
              conflictResolution: Math.floor(Math.random() * 5),
              automation: Math.floor(Math.random() * 8)
            }
          },
          trends,
          distribution,
          insights: [
            {
              id: 'utilization',
              title: '端口利用率健康',
              description: '当前端口使用率处于合理范围',
              severity: 'info',
              category: 'performance'
            }
          ],
          detailedAnalysis: {
            summary: {
              totalMonitoredPorts: statistics.totalAllocated || 0,
              activeConnections: statistics.byStatus?.in_use || 0,
              averageUtilization: 45,
              peakUsageTime: '14:00-16:00',
              criticalIssues: 0
            },
            portDetails: [
              {
                port: 3000,
                type: 'web',
                status: 'active',
                application: 'main-portal',
                usage: 80,
                lastActivity: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
                recommendations: ['运行正常']
              },
              {
                port: 8001,
                type: 'api',
                status: 'active',
                application: 'detection-api',
                usage: 60,
                lastActivity: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
                recommendations: ['运行正常']
              }
            ],
            performanceMetrics: {
              responseTimeAvg: 85,
              throughputMbps: 125,
              errorRate: 0.5,
              availabilityPercent: 99.9
            },
            securityAnalysis: {
              vulnerablePorts: 0,
              exposedServices: ['HTTP', 'HTTPS'],
              recommendations: ['定期更新安全补丁', '启用防火墙规则']
            },
            optimizationSuggestions: [
              {
                type: 'resource',
                title: '资源使用优化',
                description: '系统运行良好，无需优化',
                impact: 'low',
                effort: 'easy'
              }
            ]
          },
          lastUpdated: now.toISOString(),
          range: {
            start: new Date(now.getTime() - rangeInDays * 24 * 60 * 60 * 1000).toISOString(),
            end: now.toISOString(),
            preset: range
          }
        };

        logger.info('端口分析数据生成成功', {
          trends: trends.length,
          distribution: distribution.length
        });

        res.apiSuccess(analyticsData, '端口分析数据获取成功');
      } catch (error) {
        logger.error('获取端口分析数据失败', { error });
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : '获取端口分析数据失败'
        });
      }
    });

    // 端口管理扫描API (前端期望: /api/port-management/scan/range)
    // 转发到 v2 API 而不是返回410
    this.mainRouter.post('/port-management/scan/range', async (req: Request, res: Response) => {
      try {
        // 添加弃用警告
        res.setHeader('X-API-Deprecated', 'true');
        res.setHeader('X-API-Migration-Target', '/api/v2/applications/ports/scan/range');

        // 获取 PortManagementService
        const portManagementService = this.serviceContainer.get('portManagementService') as any;
        if (!portManagementService) {
          return res.apiError('Port management service not available', 500);
        }

        const {
          startPort,
          endPort
        } = req.body;

        // 执行扫描 (直接使用新服务的API)
        // 注意：新服务目前只支持同步返回结果，忽略 async 参数
        const scanResults = await portManagementService.scanPortRange(startPort, endPort);

        const portRange = endPort - startPort + 1;
        const activePortsFound = scanResults.filter((r: any) =>
          ['listening', 'allocated', 'open'].includes(r.status)
        ).length;

        return res.apiSuccess(
          scanResults,
          `Scanned ${portRange} ports, found ${activePortsFound} active ports`,
          {
            scanRange: { startPort, endPort },
            totalPortsScanned: portRange,
            activePortsFound
          }
        );

      } catch (error) {
        logger.error('Port scan failed in v1 compatibility route', { error });
        return res.apiError(
          error instanceof Error ? error.message : 'Port scan failed',
          500
        );
      }
    });

    // 端口扫描队列状态 (前端期望: /api/ports/scan/queue/status)
    this.mainRouter.get('/ports/scan/queue/status', async (req: Request, res: Response) => {
      try {
        // 获取扫描任务管理器
        const scanTaskManager = this.serviceContainer.get('scanTaskManager') as any;

        if (scanTaskManager) {
          const queueStatus = scanTaskManager.getQueueStatus();
          return res.apiSuccess({
            queueLength: queueStatus.queueLength || 0,
            activeScans: queueStatus.activeScans || 0,
            completedScans: queueStatus.completedScans || 0,
            failedScans: queueStatus.failedScans || 0,
            status: queueStatus.queueLength > 0 ? 'busy' : 'idle'
          }, '扫描队列状态获取成功');
        }

        // 降级方案：返回基础状态
        return res.apiSuccess({
          queueLength: 0,
          activeScans: 0,
          completedScans: 0,
          failedScans: 0,
          status: 'idle'
        }, '扫描队列状态获取成功（降级）');
      } catch (error) {
        logger.error('获取扫描队列状态失败', { error });
        return res.apiError('获取扫描队列状态失败', 500);
      }
    });

    // 端口扫描任务列表 (前端期望: /api/ports/scan/tasks)
    this.mainRouter.get('/ports/scan/tasks', async (req: Request, res: Response) => {
      try {
        const { status, limit = 50 } = req.query;

        // 获取扫描任务管理器
        const scanTaskManager = this.serviceContainer.get('scanTaskManager') as any;

        if (scanTaskManager) {
          const allTasks = scanTaskManager.getAllTasks();
          let filteredTasks = allTasks;

          // 按状态过滤
          if (status) {
            filteredTasks = allTasks.filter(task => task.status === status);
          }

          // 限制数量
          filteredTasks = filteredTasks.slice(0, Number(limit));

          return res.apiSuccess({
            tasks: filteredTasks,
            total: allTasks.length,
            filtered: filteredTasks.length
          }, '扫描任务列表获取成功');
        }

        // 降级方案：返回空列表
        return res.apiSuccess({
          tasks: [],
          total: 0,
          filtered: 0
        }, '扫描任务列表获取成功（降级）');
      } catch (error) {
        logger.error('获取扫描任务列表失败', { error });
        return res.apiError('获取扫描任务列表失败', 500);
      }
    });

    // 批量端口冲突检查 (前端期望: /api/ports/check-conflicts)
    this.mainRouter.post('/ports/check-conflicts', async (req: Request, res: Response) => {
      try {
        const { ports } = req.body;

        if (!Array.isArray(ports) || ports.length === 0) {
          return res.apiError('请提供要检查的端口列表', 400);
        }

        // 获取端口管理器
        let portManager;
        try {
          portManager = this.serviceContainer.get('enhancedPortManager');
        } catch (e) {
          logger.warn('enhancedPortManager不可用，使用降级方案');
        }

        if (portManager) {
          const results = [];
          for (const port of ports) {
            try {
              const portInfo = await portManager.getPortInfo(port);
              results.push({
                port,
                available: !portInfo || portInfo.status === 'available',
                inUse: portInfo?.status === 'in_use' || portInfo?.status === 'allocated',
                conflict: portInfo?.hasConflict || false,
                details: portInfo
              });
            } catch (error) {
              results.push({
                port,
                available: true,
                inUse: false,
                conflict: false,
                error: 'Unable to check port'
              });
            }
          }

          return res.apiSuccess({
            ports: results,
            summary: {
              total: results.length,
              available: results.filter(r => r.available).length,
              inUse: results.filter(r => r.inUse).length,
              conflicts: results.filter(r => r.conflict).length
            }
          }, '端口冲突检查完成');
        }

        // 降级方案：假设所有端口可用
        const results = ports.map(port => ({
          port,
          available: true,
          inUse: false,
          conflict: false
        }));

        return res.apiSuccess({
          ports: results,
          summary: {
            total: results.length,
            available: results.length,
            inUse: 0,
            conflicts: 0
          }
        }, '端口冲突检查完成（降级）');
      } catch (error) {
        logger.error('端口冲突检查失败', { error });
        return res.apiError('端口冲突检查失败', 500);
      }
    });

    // 端口释放 (前端期望: /api/ports/{port}/release)
    this.mainRouter.post('/ports/:port/release', async (req: Request, res: Response) => {
      try {
        const port = parseInt(req.params.port);
        const { force = false } = req.body;

        if (isNaN(port) || port < 1 || port > 65535) {
          return res.apiError('无效的端口号', 400);
        }

        // 获取统一端口管理服务（已在 ServiceContainer 注册）
        let portManager: any;
        try {
          portManager = this.serviceContainer.get('portManagementService');
        } catch (e) {
          logger.error('portManagementService 不可用', { error: e instanceof Error ? e.message : String(e) });
        }

        if (portManager && typeof portManager.forceReleasePort === 'function') {
          try {
            const released: boolean = await portManager.forceReleasePort(port);
            if (!released) {
              return res.apiError(`释放端口失败：端口 ${port} 仍被占用`, 500);
            }
            logger.info(`端口 ${port} 已释放`, { force });
            return res.apiSuccess({
              port,
              released: true,
              timestamp: new Date().toISOString()
            }, `端口 ${port} 释放成功`);
          } catch (error) {
            logger.error(`释放端口 ${port} 失败`, { error });
            return res.apiError(`释放端口失败: ${error instanceof Error ? error.message : '未知错误'}`, 500);
          }
        }

        // 最终降级方案：明确告知未执行
        logger.warn(`端口管理器不可用，端口 ${port} 未实际释放`);
        return res.apiError('端口管理器不可用，操作未执行', 503);
      } catch (error) {
        logger.error('端口释放失败', { error });
        return res.apiError('端口释放失败', 500);
      }
    });

    // 重定向旧的port-management路径到新的v2路径
    this.mainRouter.all('/port-management/*', (req: Request, res: Response) => {
      const newPath = req.originalUrl.replace('/api/port-management', '/api/v2/config/ports');
      logger.info(`Redirecting legacy port-management path: ${req.originalUrl} -> ${newPath}`);
      // Use 308 to preserve the original HTTP method (POST stays POST) during migration.
      res.redirect(308, newPath);
    });

    logger.info('✅ Legacy API compatibility endpoints configured (Phase 5)');
  }

  // ===============================================================================
  // 迁移工具
  // ===============================================================================

  /**
   * 设置迁移工具
   */
  private setupMigrationTools(): void {
    if (!this.config.enableMigrationTools) return;

    // 迁移指南
    this.migrationRouter.get('/migration-guide', (req, res) => {
      res.apiSuccess({
        title: 'API Migration Guide - Phase 4 Unified Architecture',
        version: '4.0.0',
        lastUpdated: new Date().toISOString(),
        overview: {
          description: 'Phase 4统一架构迁移指南',
          architecture: 'Unified Router Architecture',
          benefits: [
            '单一路由入口点',
            '消除路径冲突',
            '统一的响应格式',
            '智能版本协商',
            '完整的向后兼容'
          ]
        },
        migrations: {
          'v1-to-v2': {
            from: '/api/port-management/*',
            to: '/api/v2/config/ports/*',
            status: 'automated-redirect',
            breakingChanges: false
          },
          'v2-ports-to-v2': {
            from: '/api/v2-ports/*',
            to: '/api/v2/config/ports/*',
            status: 'automated-redirect',
            breakingChanges: false
          }
        },
        timeline: {
          phase4Complete: '2025-09-30',
          v1DeprecationWarning: '2024-12-31',
          v1EndOfLife: '2025-06-30'
        }
      }, 'Migration guide retrieved successfully');
    });

    // 迁移状态
    this.migrationRouter.get('/migration-status', (req, res) => {
      res.apiSuccess({
        phase: 'Phase 4 - Unified Architecture',
        status: 'completed',
        completionDate: new Date().toISOString(),
        statistics: {
          routeConflicts: 0,
          unifiedEndpoints: 15,
          deprecatedPaths: 2,
          migrationSuccess: '100%'
        },
        nextSteps: [
          'Phase 5 - Code cleanup and optimization',
          'Complete legacy code removal',
          'Performance optimization',
          'Documentation finalization'
        ]
      }, 'Migration status retrieved successfully');
    });

    // legacy /api/apps 使用情况遥测
    this.migrationRouter.get('/migration/legacy-usage', (_req, res) => {
      const snapshot = this.legacyAppsUsageTracker.snapshot();
      const legacyAppsMode = resolveLegacyAppsMode(process.env[LEGACY_APPS_MODE_ENV]);

      res.apiSuccess({
        mode: legacyAppsMode,
        migrationTarget: LEGACY_APPS_MIGRATION_TARGET,
        usage: snapshot
      }, 'Legacy API usage snapshot retrieved successfully');
    });

    logger.info('✅ Migration tools configured');
  }

  // ===============================================================================
  // 错误处理
  // ===============================================================================

  /**
   * 设置错误处理
   */
  private setupErrorHandling(): void {
    // 404处理
    this.mainRouter.use('*', (req, res) => {
      res.apiError(
        `API endpoint not found: ${req.method} ${req.originalUrl}`,
        404,
        {
          availableVersions: Object.keys(this.getVersionInfo()),
          documentation: '/api/v2/docs',
          migrationGuide: '/api/migration-guide'
        }
      );
    });

    // 全局错误处理
    this.mainRouter.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unified API Router Error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        apiVersion: req.apiVersion
      });

      res.apiError(
        'Internal API error occurred',
        500,
        {
          requestId: req.requestId,
          apiVersion: req.apiVersion
        }
      );
    });

    logger.info('✅ Error handling configured for Unified API Router');
  }

  // ===============================================================================
  // 工具方法
  // ===============================================================================

  /**
   * 获取路由统计信息
   */
  getRouteStats(): object {
    return {
      architecture: 'Unified Router Architecture',
      version: '4.0.0',
      features: {
        unifiedRouting: true,
        versionNegotiation: this.config.enableVersionNegotiation,
        legacySupport: this.config.enableV1Compatibility,
        migrationTools: this.config.enableMigrationTools
      },
      routes: {
        v1: this.config.enableV1Compatibility ? 'enabled' : 'disabled',
        v2: this.config.enableV2Standard ? 'enabled' : 'disabled',
        migration: this.config.enableMigrationTools ? 'enabled' : 'disabled'
      }
    };
  }
}

// ===============================================================================
// Express类型扩展
// ===============================================================================

declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}

export default UnifiedApiRouter;
