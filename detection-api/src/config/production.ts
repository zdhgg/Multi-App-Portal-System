/**
 * 生产环境配置 - Phase 5 生产就绪
 * 
 * 针对生产环境优化的配置设置
 */

import { logger } from '../utils/logger.js';

// ===============================================================================
// 生产环境配置接口
// ===============================================================================

export interface ProductionConfig {
  server: {
    port: number;
    host: string;
    maxConnections: number;
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
  };
  database: {
    connectionPoolSize: number;
    queryTimeout: number;
    backupEnabled: boolean;
    backupInterval: number;
    optimizeInterval: number;
  };
  performance: {
    compressionEnabled: boolean;
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
      skipSuccessfulRequests: boolean;
    };
    caching: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
    };
    clustering: {
      enabled: boolean;
      workers: number | 'auto';
    };
  };
  security: {
    helmetEnabled: boolean;
    corsOrigins: string[];
    csrfEnabled: boolean;
    rateLimitingStrict: boolean;
    encryptionEnabled: boolean;
  };
  monitoring: {
    metricsEnabled: boolean;
    healthCheckInterval: number;
    performanceAlertsEnabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    externalMonitoring: {
      enabled: boolean;
      endpoint?: string;
      interval: number;
    };
  };
  deployment: {
    environment: 'production';
    version: string;
    buildDate: string;
    commitHash?: string;
    gracefulShutdown: {
      enabled: boolean;
      timeout: number;
    };
  };
}

// ===============================================================================
// 默认生产配置
// ===============================================================================

export const defaultProductionConfig: ProductionConfig = {
  server: {
    port: parseInt(process.env.PORT || '8001'),
    host: process.env.HOST || '0.0.0.0',
    maxConnections: 1000,
    keepAliveTimeout: 65000,
    headersTimeout: 66000,
    requestTimeout: 30000
  },
  database: {
    connectionPoolSize: 20,
    queryTimeout: 30000,
    backupEnabled: true,
    backupInterval: 24 * 60 * 60 * 1000, // 24小时
    optimizeInterval: 7 * 24 * 60 * 60 * 1000 // 7天
  },
  performance: {
    compressionEnabled: true,
    rateLimiting: {
      windowMs: 15 * 60 * 1000, // 15分钟
      maxRequests: 1000,
      skipSuccessfulRequests: false
    },
    caching: {
      enabled: true,
      ttl: 300, // 5分钟
      maxSize: 1000
    },
    clustering: {
      enabled: process.env.CLUSTER_ENABLED === 'true',
      workers: process.env.CLUSTER_WORKERS ? parseInt(process.env.CLUSTER_WORKERS) : 'auto'
    }
  },
  security: {
    helmetEnabled: true,
    corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
    csrfEnabled: false, // API服务通常不需要CSRF
    rateLimitingStrict: true,
    encryptionEnabled: true
  },
  monitoring: {
    metricsEnabled: true,
    healthCheckInterval: 30000, // 30秒
    performanceAlertsEnabled: true,
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    externalMonitoring: {
      enabled: !!process.env.EXTERNAL_MONITOR_ENDPOINT,
      endpoint: process.env.EXTERNAL_MONITOR_ENDPOINT,
      interval: 60000 // 1分钟
    }
  },
  deployment: {
    environment: 'production',
    version: process.env.APP_VERSION || '5.0.0',
    buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    commitHash: process.env.GIT_COMMIT,
    gracefulShutdown: {
      enabled: true,
      timeout: 30000 // 30秒
    }
  }
};

// ===============================================================================
// 配置验证和优化
// ===============================================================================

export class ProductionConfigManager {
  private config: ProductionConfig;

  constructor(customConfig?: Partial<ProductionConfig>) {
    this.config = this.mergeConfigs(defaultProductionConfig, customConfig || {});
    this.validateConfig();
    this.logConfiguration();
  }

  /**
   * 合并配置
   */
  private mergeConfigs(defaultConfig: ProductionConfig, customConfig: Partial<ProductionConfig>): ProductionConfig {
    return {
      server: { ...defaultConfig.server, ...customConfig.server },
      database: { ...defaultConfig.database, ...customConfig.database },
      performance: {
        ...defaultConfig.performance,
        ...customConfig.performance,
        rateLimiting: {
          ...defaultConfig.performance.rateLimiting,
          ...customConfig.performance?.rateLimiting
        },
        caching: {
          ...defaultConfig.performance.caching,
          ...customConfig.performance?.caching
        },
        clustering: {
          ...defaultConfig.performance.clustering,
          ...customConfig.performance?.clustering
        }
      },
      security: { ...defaultConfig.security, ...customConfig.security },
      monitoring: {
        ...defaultConfig.monitoring,
        ...customConfig.monitoring,
        externalMonitoring: {
          ...defaultConfig.monitoring.externalMonitoring,
          ...customConfig.monitoring?.externalMonitoring
        }
      },
      deployment: {
        ...defaultConfig.deployment,
        ...customConfig.deployment,
        gracefulShutdown: {
          ...defaultConfig.deployment.gracefulShutdown,
          ...customConfig.deployment?.gracefulShutdown
        }
      }
    };
  }

  /**
   * 验证配置合理性
   */
  private validateConfig(): void {
    const issues: string[] = [];

    // 服务器配置验证
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      issues.push('Invalid server port');
    }

    if (this.config.server.maxConnections < 1) {
      issues.push('Max connections must be positive');
    }

    // 性能配置验证
    if (this.config.performance.rateLimiting.maxRequests < 1) {
      issues.push('Rate limiting max requests must be positive');
    }

    if (this.config.performance.caching.ttl < 0) {
      issues.push('Cache TTL must be non-negative');
    }

    // 集群配置验证
    if (this.config.performance.clustering.enabled) {
      const workers = this.config.performance.clustering.workers;
      if (typeof workers === 'number' && workers < 1) {
        issues.push('Cluster workers count must be positive');
      }
    }

    if (issues.length > 0) {
      throw new Error(`Production configuration validation failed: ${issues.join(', ')}`);
    }
  }

  /**
   * 记录配置信息
   */
  private logConfiguration(): void {
    logger.info('🚀 Production configuration loaded (Phase 5)', {
      environment: this.config.deployment.environment,
      version: this.config.deployment.version,
      port: this.config.server.port,
      clustering: this.config.performance.clustering.enabled,
      monitoring: this.config.monitoring.metricsEnabled,
      security: {
        helmet: this.config.security.helmetEnabled,
        cors: this.config.security.corsOrigins.length > 0
      }
    });
  }

  /**
   * 获取配置
   */
  getConfig(): ProductionConfig {
    return { ...this.config };
  }

  /**
   * 获取环境信息
   */
  getEnvironmentInfo(): any {
    return {
      environment: this.config.deployment.environment,
      version: this.config.deployment.version,
      buildDate: this.config.deployment.buildDate,
      commitHash: this.config.deployment.commitHash,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      loadAverage: require('os').loadavg()
    };
  }

  /**
   * 检查生产就绪状态
   */
  checkProductionReadiness(): { ready: boolean; issues: string[]; recommendations: string[] } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // 检查必要的环境变量
    const requiredEnvVars = ['NODE_ENV', 'PORT'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        issues.push(`Missing environment variable: ${envVar}`);
      }
    }

    // 检查数据库配置
    if (!this.config.database.backupEnabled) {
      recommendations.push('Enable database backups for production');
    }

    // 检查安全配置
    if (!this.config.security.helmetEnabled) {
      issues.push('Helmet security middleware not enabled');
    }

    if (this.config.security.corsOrigins.includes('*')) {
      recommendations.push('Configure specific CORS origins instead of wildcard');
    }

    // 检查监控配置
    if (!this.config.monitoring.metricsEnabled) {
      recommendations.push('Enable metrics collection for production monitoring');
    }

    if (!this.config.monitoring.externalMonitoring.enabled) {
      recommendations.push('Configure external monitoring for production alerts');
    }

    // 检查性能配置
    if (!this.config.performance.compressionEnabled) {
      recommendations.push('Enable compression for better performance');
    }

    if (!this.config.performance.clustering.enabled) {
      recommendations.push('Consider enabling clustering for better resource utilization');
    }

    return {
      ready: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * 应用运行时优化
   */
  applyRuntimeOptimizations(): void {
    // V8 优化
    if (global.gc) {
      // 定期手动垃圾回收（如果可用）
      setInterval(() => {
        if (global.gc) {
          global.gc();
        }
      }, 300000); // 5分钟
    }

    // 进程优化
    process.setMaxListeners(20);
    
    // 未处理异常处理
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception - Process will exit', { error });
      setTimeout(() => process.exit(1), 1000);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', { reason, promise });
    });

    // 优雅关闭处理
    if (this.config.deployment.gracefulShutdown.enabled) {
      this.setupGracefulShutdown();
    }

    logger.info('✅ Runtime optimizations applied (Phase 5)');
  }

  /**
   * 设置优雅关闭
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      const timeout = setTimeout(() => {
        logger.error('Graceful shutdown timeout exceeded. Force exit.');
        process.exit(1);
      }, this.config.deployment.gracefulShutdown.timeout);

      // 这里可以添加清理逻辑：
      // - 关闭数据库连接
      // - 完成正在进行的请求
      // - 保存状态数据
      
      Promise.all([
        // 添加清理 promises
      ]).then(() => {
        clearTimeout(timeout);
        logger.info('Graceful shutdown completed');
        process.exit(0);
      }).catch((error) => {
        clearTimeout(timeout);
        logger.error('Error during graceful shutdown', { error });
        process.exit(1);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// ===============================================================================
// 导出配置管理器实例
// ===============================================================================

export const productionConfig = new ProductionConfigManager();
export default productionConfig;
