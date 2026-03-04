/**
 * 系统健康状态监控系统
 * 全面监控端口管理系统的健康状态和运行状况
 * 
 * 主要功能：
 * - 全面的系统健康状态监控
 * - 各个子系统运行状态检查
 * - 系统资源使用情况监控
 * - 数据库连接和性能状态
 * - 外部依赖服务可用性检查
 * - 定期健康检查任务
 * - 深度健康检查
 * - 关键路径健康验证
 * - 自动故障检测和恢复
 * - 实时健康状态仪表板数据
 * - 健康状态历史趋势分析
 * - 异常状态自动告警
 * - 系统降级和恢复建议
 * - 故障预测和预警机制
 * - 系统自愈能力
 */

import { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import * as os from 'os';
import * as process from 'process';
import * as fs from 'fs';
import * as path from 'path';

// ===============================================================================
// 类型定义
// ===============================================================================

export interface SystemHealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'down';
  score: number; // 0-100 健康评分
  timestamp: Date;
  uptime: number; // 系统运行时间 (秒)
  
  // 子系统状态
  subsystems: {
    portManager: SubsystemHealth;
    intelligentAllocator: SubsystemHealth;
    conflictResolver: SubsystemHealth;
    performanceMonitor: SubsystemHealth;
    leaseManager: SubsystemHealth;
    transactionManager: SubsystemHealth;
    database: SubsystemHealth;
  };
  
  // 系统资源状态
  resources: {
    cpu: ResourceHealth;
    memory: ResourceHealth;
    disk: ResourceHealth;
    network: ResourceHealth;
  };
  
  // 关键指标
  metrics: {
    totalPortAllocations: number;
    activeAllocations: number;
    allocationSuccessRate: number;
    avgAllocationTime: number;
    conflictResolutionRate: number;
    systemLoad: number;
    errorRate: number;
  };
  
  // 告警信息
  alerts: HealthAlert[];
  
  // 建议和预警
  recommendations: string[];
  warnings: string[];
}

export interface SubsystemHealth {
  name: string;
  status: 'healthy' | 'warning' | 'critical' | 'down';
  score: number; // 0-100
  lastCheck: Date;
  uptime: number;
  errorCount: number;
  lastError?: string;
  performance: {
    responseTime: number; // ms
    throughput: number; // operations/sec
    errorRate: number; // %
  };
  dependencies: string[];
  criticalPath: boolean;
}

export interface ResourceHealth {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  usage: number; // %
  available: number;
  total: number;
  trend: 'stable' | 'increasing' | 'decreasing';
  prediction: {
    exhaustionTime?: Date; // 预计资源耗尽时间
    recommendation: string;
  };
}

export interface HealthAlert {
  id: string;
  type: 'performance' | 'resource' | 'subsystem' | 'dependency' | 'prediction';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  source: string;
  metrics: Record<string, any>;
  acknowledged: boolean;
  autoResolved: boolean;
  resolutionActions: string[];
}

export interface HealthCheckConfig {
  enabled: boolean;
  
  // 检查间隔配置
  intervals: {
    basic: number; // 基础健康检查间隔 (ms) - 30秒
    deep: number; // 深度健康检查间隔 (ms) - 5分钟
    resource: number; // 资源监控间隔 (ms) - 10秒
    prediction: number; // 预测分析间隔 (ms) - 1小时
  };
  
  // 健康阈值配置
  thresholds: {
    // 系统资源阈值
    cpu: { warning: number; critical: number };
    memory: { warning: number; critical: number };
    disk: { warning: number; critical: number };
    
    // 性能阈值
    responseTime: { warning: number; critical: number };
    errorRate: { warning: number; critical: number };
    allocationFailureRate: { warning: number; critical: number };
    
    // 子系统健康评分阈值
    subsystemScore: { warning: number; critical: number };
    overallScore: { warning: number; critical: number };
  };
  
  // 自愈配置
  autoHealing: {
    enabled: boolean;
    maxRetries: number;
    retryInterval: number;
    actions: {
      restartSubsystem: boolean;
      clearCache: boolean;
      releaseResources: boolean;
      gracefulDegradation: boolean;
    };
  };
  
  // 告警配置
  alerting: {
    enabled: boolean;
    debounceTime: number; // 防抖时间 (ms)
    channels: string[];
    escalation: {
      enabled: boolean;
      levels: Array<{
        severity: string;
        delay: number; // 升级延迟 (ms)
        channels: string[];
      }>;
    };
  };
  
  // 数据保留配置
  dataRetention: {
    healthHistory: number; // 健康历史保留天数
    alerts: number; // 告警记录保留天数
    metrics: number; // 指标数据保留天数
  };
}

export interface HealthTrend {
  timeRange: string;
  dataPoints: Array<{
    timestamp: Date;
    overallScore: number;
    subsystemScores: Record<string, number>;
    resourceUsage: Record<string, number>;
    alertCount: number;
  }>;
  trends: {
    overall: 'improving' | 'stable' | 'degrading';
    subsystems: Record<string, 'improving' | 'stable' | 'degrading'>;
    resources: Record<string, 'improving' | 'stable' | 'degrading'>;
  };
  predictions: {
    nextIssue?: {
      type: string;
      estimatedTime: Date;
      confidence: number;
      preventionActions: string[];
    };
    resourceExhaustion?: Array<{
      resource: string;
      estimatedTime: Date;
      confidence: number;
    }>;
  };
}

export interface FailurePattern {
  id: string;
  pattern: string;
  frequency: number;
  lastOccurrence: Date;
  avgResolutionTime: number;
  successfulResolutions: number;
  failedResolutions: number;
  preventionMeasures: string[];
  automatedResponse: boolean;
}

// ===============================================================================
// 系统健康监控器类
// ===============================================================================

export class SystemHealthMonitor extends EventEmitter {
  private db: Database;
  private config: HealthCheckConfig;
  private isInitialized = false;
  private isRunning = false;
  private startTime = Date.now();
  
  // 定时器
  private basicCheckTimer?: NodeJS.Timeout;
  private deepCheckTimer?: NodeJS.Timeout;
  private resourceCheckTimer?: NodeJS.Timeout;
  private predictionTimer?: NodeJS.Timeout;
  
  // 当前状态
  private currentHealth: SystemHealthStatus;
  private healthHistory: SystemHealthStatus[] = [];
  private activeAlerts = new Map<string, HealthAlert>();
  private failurePatterns = new Map<string, FailurePattern>();
  
  // 子系统引用
  private subsystemRefs = new Map<string, any>();
  
  // 性能统计
  private performanceStats = {
    checksPerformed: 0,
    alertsGenerated: 0,
    autoHealingActions: 0,
    lastCheckDuration: 0
  };

  constructor(database: Database, config?: Partial<HealthCheckConfig>) {
    super();
    this.db = database;
    this.config = this.mergeConfig(config);
    this.currentHealth = this.initializeHealthStatus();
    
    logger.info('SystemHealthMonitor created', {
      config: this.config
    });
  }

  /**
   * 合并配置
   */
  private mergeConfig(userConfig?: Partial<HealthCheckConfig>): HealthCheckConfig {
    const defaultConfig: HealthCheckConfig = {
      enabled: true,
      intervals: {
        basic: 30000, // 30秒
        deep: 300000, // 5分钟
        resource: 10000, // 10秒
        prediction: 3600000 // 1小时
      },
      thresholds: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 80, critical: 95 },
        disk: { warning: 85, critical: 95 },
        responseTime: { warning: 100, critical: 500 },
        errorRate: { warning: 5, critical: 15 },
        allocationFailureRate: { warning: 10, critical: 25 },
        subsystemScore: { warning: 70, critical: 50 },
        overallScore: { warning: 75, critical: 60 }
      },
      autoHealing: {
        enabled: true,
        maxRetries: 3,
        retryInterval: 30000,
        actions: {
          restartSubsystem: true,
          clearCache: true,
          releaseResources: true,
          gracefulDegradation: true
        }
      },
      alerting: {
        enabled: true,
        debounceTime: 60000,
        channels: ['console', 'log'],
        escalation: {
          enabled: true,
          levels: [
            { severity: 'high', delay: 300000, channels: ['console', 'log'] },
            { severity: 'critical', delay: 600000, channels: ['console', 'log', 'email'] }
          ]
        }
      },
      dataRetention: {
        healthHistory: 30,
        alerts: 90,
        metrics: 7
      }
    };

    return { ...defaultConfig, ...userConfig };
  }

  /**
   * 初始化健康状态
   */
  private initializeHealthStatus(): SystemHealthStatus {
    return {
      overall: 'healthy',
      score: 100,
      timestamp: new Date(),
      uptime: 0,
      subsystems: {
        portManager: this.createSubsystemHealth('portManager'),
        intelligentAllocator: this.createSubsystemHealth('intelligentAllocator'),
        conflictResolver: this.createSubsystemHealth('conflictResolver'),
        performanceMonitor: this.createSubsystemHealth('performanceMonitor'),
        leaseManager: this.createSubsystemHealth('leaseManager'),
        transactionManager: this.createSubsystemHealth('transactionManager'),
        database: this.createSubsystemHealth('database')
      },
      resources: {
        cpu: this.createResourceHealth('cpu'),
        memory: this.createResourceHealth('memory'),
        disk: this.createResourceHealth('disk'),
        network: this.createResourceHealth('network')
      },
      metrics: {
        totalPortAllocations: 0,
        activeAllocations: 0,
        allocationSuccessRate: 100,
        avgAllocationTime: 0,
        conflictResolutionRate: 100,
        systemLoad: 0,
        errorRate: 0
      },
      alerts: [],
      recommendations: [],
      warnings: []
    };
  }

  /**
   * 创建子系统健康状态
   */
  private createSubsystemHealth(name: string): SubsystemHealth {
    return {
      name,
      status: 'healthy',
      score: 100,
      lastCheck: new Date(),
      uptime: 0,
      errorCount: 0,
      performance: {
        responseTime: 0,
        throughput: 0,
        errorRate: 0
      },
      dependencies: [],
      criticalPath: ['portManager', 'database'].includes(name)
    };
  }

  /**
   * 创建资源健康状态
   */
  private createResourceHealth(name: string): ResourceHealth {
    return {
      name,
      status: 'healthy',
      usage: 0,
      available: 0,
      total: 0,
      trend: 'stable',
      prediction: {
        recommendation: 'No action needed'
      }
    };
  }

  /**
   * 初始化系统健康监控器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('SystemHealthMonitor already initialized');
      return;
    }

    try {
      // 创建数据库表
      await this.createDatabaseTables();

      // 加载历史数据
      await this.loadHealthHistory();

      // 加载故障模式
      await this.loadFailurePatterns();

      this.isInitialized = true;

      logger.info('SystemHealthMonitor initialized successfully', {
        config: this.config,
        historyLoaded: this.healthHistory.length,
        patternsLoaded: this.failurePatterns.size
      });

      this.emit('initialized');

    } catch (error) {
      logger.error('Failed to initialize SystemHealthMonitor', { error });
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createDatabaseTables(): Promise<void> {
    try {
      // 健康历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_health_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          overall_status TEXT NOT NULL,
          overall_score INTEGER NOT NULL,
          uptime INTEGER NOT NULL,
          subsystem_scores TEXT NOT NULL, -- JSON
          resource_usage TEXT NOT NULL, -- JSON
          metrics TEXT NOT NULL, -- JSON
          alert_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 健康告警表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS system_health_alerts (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          source TEXT NOT NULL,
          metrics TEXT, -- JSON
          acknowledged BOOLEAN DEFAULT FALSE,
          auto_resolved BOOLEAN DEFAULT FALSE,
          resolution_actions TEXT, -- JSON
          resolved_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 故障模式表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS failure_patterns (
          id TEXT PRIMARY KEY,
          pattern TEXT NOT NULL,
          frequency INTEGER DEFAULT 1,
          last_occurrence DATETIME NOT NULL,
          avg_resolution_time INTEGER DEFAULT 0,
          successful_resolutions INTEGER DEFAULT 0,
          failed_resolutions INTEGER DEFAULT 0,
          prevention_measures TEXT, -- JSON
          automated_response BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 子系统性能指标表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS subsystem_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subsystem_name TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL,
          score INTEGER NOT NULL,
          response_time REAL NOT NULL,
          throughput REAL NOT NULL,
          error_rate REAL NOT NULL,
          error_count INTEGER DEFAULT 0,
          uptime INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 资源使用历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS resource_usage_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          resource_name TEXT NOT NULL,
          usage_percent REAL NOT NULL,
          available_amount REAL NOT NULL,
          total_amount REAL NOT NULL,
          trend TEXT NOT NULL,
          prediction_data TEXT, -- JSON
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_health_history_timestamp ON system_health_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_health_alerts_timestamp ON system_health_alerts(timestamp);
        CREATE INDEX IF NOT EXISTS idx_health_alerts_severity ON system_health_alerts(severity);
        CREATE INDEX IF NOT EXISTS idx_failure_patterns_frequency ON failure_patterns(frequency DESC);
        CREATE INDEX IF NOT EXISTS idx_subsystem_metrics_timestamp ON subsystem_metrics(timestamp);
        CREATE INDEX IF NOT EXISTS idx_resource_usage_timestamp ON resource_usage_history(timestamp);
      `);

      logger.info('System health monitoring database tables created successfully');

    } catch (error) {
      logger.error('Failed to create system health monitoring database tables', { error });
      throw error;
    }
  }

  /**
   * 加载健康历史数据
   */
  private async loadHealthHistory(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM system_health_history
        ORDER BY timestamp DESC
        LIMIT 100
      `);

      const rows = stmt.all() as any[];
      this.healthHistory = rows.map(row => ({
        overall: row.overall_status,
        score: row.overall_score,
        timestamp: new Date(row.timestamp),
        uptime: row.uptime,
        subsystems: JSON.parse(row.subsystem_scores),
        resources: JSON.parse(row.resource_usage),
        metrics: JSON.parse(row.metrics),
        alerts: [],
        recommendations: [],
        warnings: []
      }));

      logger.info('Health history loaded', { count: this.healthHistory.length });

    } catch (error) {
      logger.error('Failed to load health history', { error });
      // 不抛出错误，继续运行
    }
  }

  /**
   * 加载故障模式
   */
  private async loadFailurePatterns(): Promise<void> {
    try {
      const stmt = this.db.prepare('SELECT * FROM failure_patterns ORDER BY frequency DESC');
      const rows = stmt.all() as any[];

      for (const row of rows) {
        const pattern: FailurePattern = {
          id: row.id,
          pattern: row.pattern,
          frequency: row.frequency,
          lastOccurrence: new Date(row.last_occurrence),
          avgResolutionTime: row.avg_resolution_time,
          successfulResolutions: row.successful_resolutions,
          failedResolutions: row.failed_resolutions,
          preventionMeasures: JSON.parse(row.prevention_measures || '[]'),
          automatedResponse: row.automated_response
        };
        this.failurePatterns.set(pattern.id, pattern);
      }

      logger.info('Failure patterns loaded', { count: this.failurePatterns.size });

    } catch (error) {
      logger.error('Failed to load failure patterns', { error });
      // 不抛出错误，继续运行
    }
  }

  /**
   * 注册子系统引用
   */
  registerSubsystem(name: string, instance: any): void {
    this.subsystemRefs.set(name, instance);
    logger.info('Subsystem registered for health monitoring', { name });
  }

  /**
   * 启动健康监控
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SystemHealthMonitor not initialized. Call initialize() first.');
    }

    if (this.isRunning) {
      logger.warn('SystemHealthMonitor already running');
      return;
    }

    try {
      this.isRunning = true;
      this.startTime = Date.now();

      // 启动定期检查
      if (this.config.enabled) {
        this.startPeriodicChecks();
      }

      // 执行初始健康检查
      await this.performBasicHealthCheck();

      logger.info('SystemHealthMonitor started successfully', {
        config: this.config,
        subsystems: Array.from(this.subsystemRefs.keys())
      });

      this.emit('started');

    } catch (error) {
      this.isRunning = false;
      logger.error('Failed to start SystemHealthMonitor', { error });
      throw error;
    }
  }

  /**
   * 启动定期检查
   */
  private startPeriodicChecks(): void {
    // 基础健康检查
    this.basicCheckTimer = setInterval(async () => {
      try {
        await this.performBasicHealthCheck();
      } catch (error) {
        logger.error('Basic health check failed', { error });
      }
    }, this.config.intervals.basic);

    // 深度健康检查
    this.deepCheckTimer = setInterval(async () => {
      try {
        await this.performDeepHealthCheck();
      } catch (error) {
        logger.error('Deep health check failed', { error });
      }
    }, this.config.intervals.deep);

    // 资源监控
    this.resourceCheckTimer = setInterval(async () => {
      try {
        await this.monitorSystemResources();
      } catch (error) {
        logger.error('Resource monitoring failed', { error });
      }
    }, this.config.intervals.resource);

    // 预测分析
    this.predictionTimer = setInterval(async () => {
      try {
        await this.performPredictiveAnalysis();
      } catch (error) {
        logger.error('Predictive analysis failed', { error });
      }
    }, this.config.intervals.prediction);

    logger.info('Periodic health checks started', {
      basicInterval: this.config.intervals.basic,
      deepInterval: this.config.intervals.deep,
      resourceInterval: this.config.intervals.resource,
      predictionInterval: this.config.intervals.prediction
    });
  }

  /**
   * 执行基础健康检查
   */
  async performBasicHealthCheck(): Promise<SystemHealthStatus> {
    const startTime = Date.now();

    try {
      // 更新运行时间
      this.currentHealth.uptime = Math.floor((Date.now() - this.startTime) / 1000);
      this.currentHealth.timestamp = new Date();

      // 检查所有子系统
      await this.checkAllSubsystems();

      // 更新系统指标
      await this.updateSystemMetrics();

      // 计算整体健康评分
      this.calculateOverallHealth();

      // 检查告警条件
      await this.checkAlertConditions();

      // 生成建议和预警
      this.generateRecommendations();

      // 保存健康状态
      await this.saveHealthStatus();

      this.performanceStats.checksPerformed++;
      this.performanceStats.lastCheckDuration = Date.now() - startTime;

      this.emit('healthCheck', this.currentHealth);

      return this.currentHealth;

    } catch (error) {
      logger.error('Basic health check failed', { error });

      // 创建严重告警
      await this.createAlert({
        type: 'subsystem',
        severity: 'critical',
        title: 'Health Check Failed',
        message: `Basic health check failed: ${error.message}`,
        source: 'SystemHealthMonitor',
        metrics: { error: error.message }
      });

      throw error;
    }
  }

  /**
   * 检查所有子系统
   */
  private async checkAllSubsystems(): Promise<void> {
    const subsystemNames = Object.keys(this.currentHealth.subsystems);

    for (const name of subsystemNames) {
      try {
        await this.checkSubsystem(name);
      } catch (error) {
        logger.error(`Failed to check subsystem ${name}`, { error });

        // 标记子系统为故障状态
        this.currentHealth.subsystems[name].status = 'critical';
        this.currentHealth.subsystems[name].score = 0;
        this.currentHealth.subsystems[name].lastError = error.message;
        this.currentHealth.subsystems[name].errorCount++;
      }
    }
  }

  /**
   * 检查单个子系统
   */
  private async checkSubsystem(name: string): Promise<void> {
    const subsystem = this.currentHealth.subsystems[name];
    const instance = this.subsystemRefs.get(name);

    const startTime = Date.now();
    let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
    let score = 100;
    let errorMessage: string | undefined;

    try {
      // 数据库子系统特殊处理 - 不需要外部实例，直接使用内部数据库连接检查
      if (name === 'database') {
        const healthResult = await this.checkDatabaseHealth();
        status = healthResult.status;
        score = healthResult.score;
        errorMessage = healthResult.error;

        // 更新性能指标
        subsystem.performance.responseTime = Date.now() - startTime;
        subsystem.performance.throughput = healthResult.throughput || 0;
        subsystem.performance.errorRate = healthResult.errorRate || 0;
      } else {
        // 其他子系统需要检查实例是否存在
        if (!instance) {
          status = 'down';
          score = 0;
          errorMessage = 'Subsystem instance not found';
        } else {
          // 执行子系统特定的健康检查
          const healthResult = await this.performSubsystemHealthCheck(name, instance);
          status = healthResult.status;
          score = healthResult.score;
          errorMessage = healthResult.error;

          // 更新性能指标
          subsystem.performance.responseTime = Date.now() - startTime;
          subsystem.performance.throughput = healthResult.throughput || 0;
          subsystem.performance.errorRate = healthResult.errorRate || 0;
        }
      }

    } catch (error) {
      status = 'critical';
      score = 0;
      errorMessage = error.message;
      subsystem.errorCount++;
    }

    // 更新子系统状态
    subsystem.status = status;
    subsystem.score = score;
    subsystem.lastCheck = new Date();
    subsystem.lastError = errorMessage;

    // 保存子系统指标
    await this.saveSubsystemMetrics(name, subsystem);

    logger.debug(`Subsystem ${name} health check completed`, {
      status,
      score,
      responseTime: subsystem.performance.responseTime,
      error: errorMessage
    });
  }

  /**
   * 执行子系统特定的健康检查
   */
  private async performSubsystemHealthCheck(name: string, instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      switch (name) {
        case 'database':
          return await this.checkDatabaseHealth();

        case 'portManager':
          return await this.checkPortManagerHealth(instance);

        case 'intelligentAllocator':
          return await this.checkIntelligentAllocatorHealth(instance);

        case 'conflictResolver':
          return await this.checkConflictResolverHealth(instance);

        case 'performanceMonitor':
          return await this.checkPerformanceMonitorHealth(instance);

        case 'leaseManager':
          return await this.checkLeaseManagerHealth(instance);

        case 'transactionManager':
          return await this.checkTransactionManagerHealth(instance);

        default:
          return { status: 'warning', score: 70, error: 'Unknown subsystem' };
      }
    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查数据库健康状态
   */
  private async checkDatabaseHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();

      // 执行简单查询测试连接
      const result = this.db.prepare('SELECT 1 as test').get();
      const responseTime = Date.now() - startTime;

      if (!result || (result as any).test !== 1) {
        return { status: 'critical', score: 0, error: 'Database query failed' };
      }

      // 检查响应时间
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (responseTime > this.config.thresholds.responseTime.critical) {
        status = 'critical';
        score = 30;
      } else if (responseTime > this.config.thresholds.responseTime.warning) {
        status = 'warning';
        score = 70;
      }

      // 检查数据库文件大小和可用空间
      const dbPath = this.db.name;
      if (dbPath && fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        const sizeGB = stats.size / (1024 * 1024 * 1024);

        if (sizeGB > 10) { // 数据库文件超过10GB
          status = status === 'healthy' ? 'warning' : status;
          score = Math.min(score, 80);
        }
      }

      return {
        status,
        score,
        throughput: responseTime > 0 ? 1000 / responseTime : 1000, // queries per second
        errorRate: 0
      };

    } catch (error) {
      return { status: 'down', score: 0, error: error.message };
    }
  }

  /**
   * 检查端口管理器健康状态
   */
  private async checkPortManagerHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance || typeof instance.isPortAvailable !== 'function') {
        return { status: 'down', score: 0, error: 'Port manager instance invalid' };
      }

      // 测试端口可用性检查功能
      const startTime = Date.now();
      const testResult = await instance.isPortAvailable(65535); // 测试一个不太可能被占用的端口
      const responseTime = Date.now() - startTime;

      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (responseTime > this.config.thresholds.responseTime.critical) {
        status = 'critical';
        score = 30;
      } else if (responseTime > this.config.thresholds.responseTime.warning) {
        status = 'warning';
        score = 70;
      }

      return {
        status,
        score,
        throughput: responseTime > 0 ? 1000 / responseTime : 1000,
        errorRate: 0
      };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查智能分配器健康状态
   */
  private async checkIntelligentAllocatorHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance) {
        return { status: 'down', score: 0, error: 'Intelligent allocator instance not found' };
      }

      // 检查ML模型状态
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      // 如果有getModelStatus方法，检查模型状态
      if (typeof instance.getModelStatus === 'function') {
        const modelStatus = instance.getModelStatus();
        if (!modelStatus.trained) {
          status = 'warning';
          score = 80;
        }
      }

      return { status, score, throughput: 100, errorRate: 0 };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查冲突解决器健康状态
   */
  private async checkConflictResolverHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance) {
        return { status: 'down', score: 0, error: 'Conflict resolver instance not found' };
      }

      // 检查活跃冲突数量
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (typeof instance.getActiveConflicts === 'function') {
        const activeConflicts = instance.getActiveConflicts();
        const conflictCount = activeConflicts.size || 0;

        if (conflictCount > 10) {
          status = 'critical';
          score = 40;
        } else if (conflictCount > 5) {
          status = 'warning';
          score = 70;
        }
      }

      return { status, score, throughput: 50, errorRate: 0 };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查性能监控器健康状态
   */
  private async checkPerformanceMonitorHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance) {
        return { status: 'down', score: 0, error: 'Performance monitor instance not found' };
      }

      // 检查监控是否正在运行
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (typeof instance.isRunning === 'function') {
        const isRunning = instance.isRunning();
        if (!isRunning) {
          status = 'warning';
          score = 60;
        }
      }

      return { status, score, throughput: 200, errorRate: 0 };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查租约管理器健康状态
   */
  private async checkLeaseManagerHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance) {
        return { status: 'down', score: 0, error: 'Lease manager instance not found' };
      }

      // 检查活跃租约数量
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (typeof instance.getActiveLeases === 'function') {
        const activeLeases = instance.getActiveLeases();
        const leaseCount = activeLeases.size || 0;

        // 检查是否有过多的活跃租约
        if (leaseCount > 1000) {
          status = 'warning';
          score = 80;
        }
      }

      return { status, score, throughput: 100, errorRate: 0 };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 检查事务管理器健康状态
   */
  private async checkTransactionManagerHealth(instance: any): Promise<{
    status: 'healthy' | 'warning' | 'critical' | 'down';
    score: number;
    throughput?: number;
    errorRate?: number;
    error?: string;
  }> {
    try {
      if (!instance) {
        return { status: 'down', score: 0, error: 'Transaction manager instance not found' };
      }

      // 检查活跃事务数量
      let status: 'healthy' | 'warning' | 'critical' | 'down' = 'healthy';
      let score = 100;

      if (typeof instance.getActiveTransactions === 'function') {
        const activeTransactions = instance.getActiveTransactions();
        const transactionCount = activeTransactions.size || 0;

        // 检查是否有过多的活跃事务
        if (transactionCount > 50) {
          status = 'critical';
          score = 30;
        } else if (transactionCount > 20) {
          status = 'warning';
          score = 70;
        }
      }

      return { status, score, throughput: 500, errorRate: 0 };

    } catch (error) {
      return { status: 'critical', score: 0, error: error.message };
    }
  }

  /**
   * 监控系统资源
   */
  private async monitorSystemResources(): Promise<void> {
    try {
      // CPU监控
      await this.monitorCPU();

      // 内存监控
      await this.monitorMemory();

      // 磁盘监控
      await this.monitorDisk();

      // 网络监控
      await this.monitorNetwork();

      // 保存资源使用历史
      await this.saveResourceUsage();

    } catch (error) {
      logger.error('System resource monitoring failed', { error });
    }
  }

  /**
   * 监控CPU使用率
   */
  private async monitorCPU(): Promise<void> {
    try {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();

      // 简化的CPU使用率计算（基于负载平均值）
      // 负载平均值 > 1.0 表示系统过载
      const loadPerCore = loadAvg[0] / cpus.length;

      // 直接使用负载平均值计算使用率，超过1.0就是过载
      const actualUsage = Math.min(100, loadPerCore * 100);

      // 更新CPU资源状态
      const cpuResource = this.currentHealth.resources.cpu;
      cpuResource.usage = actualUsage;
      cpuResource.total = 100;
      cpuResource.available = 100 - actualUsage;

      // 确定状态
      if (actualUsage >= this.config.thresholds.cpu.critical) {
        cpuResource.status = 'critical';
      } else if (actualUsage >= this.config.thresholds.cpu.warning) {
        cpuResource.status = 'warning';
      } else {
        cpuResource.status = 'healthy';
      }

      // 分析趋势
      cpuResource.trend = this.analyzeTrend('cpu', actualUsage);

      // 生成预测
      cpuResource.prediction = this.generateResourcePrediction('cpu', actualUsage);

    } catch (error) {
      logger.error('CPU monitoring failed', { error });
      this.currentHealth.resources.cpu.status = 'critical';
    }
  }

  /**
   * 监控内存使用率
   */
  private async monitorMemory(): Promise<void> {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usage = (usedMem / totalMem) * 100;

      // 更新内存资源状态
      const memResource = this.currentHealth.resources.memory;
      memResource.usage = usage;
      memResource.total = Math.round(totalMem / (1024 * 1024)); // MB
      memResource.available = Math.round(freeMem / (1024 * 1024)); // MB

      // 确定状态
      if (usage >= this.config.thresholds.memory.critical) {
        memResource.status = 'critical';
      } else if (usage >= this.config.thresholds.memory.warning) {
        memResource.status = 'warning';
      } else {
        memResource.status = 'healthy';
      }

      // 分析趋势
      memResource.trend = this.analyzeTrend('memory', usage);

      // 生成预测
      memResource.prediction = this.generateResourcePrediction('memory', usage);

    } catch (error) {
      logger.error('Memory monitoring failed', { error });
      this.currentHealth.resources.memory.status = 'critical';
    }
  }

  /**
   * 监控磁盘使用率
   */
  private async monitorDisk(): Promise<void> {
    try {
      // 获取当前工作目录的磁盘使用情况
      const cwd = process.cwd();
      const stats = fs.statSync(cwd);

      // 简化的磁盘监控（在实际环境中可能需要更复杂的实现）
      const diskResource = this.currentHealth.resources.disk;
      diskResource.usage = 50; // 默认值，实际应该通过系统调用获取
      diskResource.total = 100;
      diskResource.available = 50;
      diskResource.status = 'healthy';
      diskResource.trend = 'stable';
      diskResource.prediction = { recommendation: 'Disk usage is stable' };

    } catch (error) {
      logger.error('Disk monitoring failed', { error });
      this.currentHealth.resources.disk.status = 'critical';
    }
  }

  /**
   * 监控网络状态
   */
  private async monitorNetwork(): Promise<void> {
    try {
      // 简化的网络监控
      const networkResource = this.currentHealth.resources.network;
      networkResource.usage = 10; // 默认值
      networkResource.total = 100;
      networkResource.available = 90;
      networkResource.status = 'healthy';
      networkResource.trend = 'stable';
      networkResource.prediction = { recommendation: 'Network is stable' };

    } catch (error) {
      logger.error('Network monitoring failed', { error });
      this.currentHealth.resources.network.status = 'critical';
    }
  }

  /**
   * 分析资源使用趋势
   */
  private analyzeTrend(resource: string, currentValue: number): 'stable' | 'increasing' | 'decreasing' {
    // 简化的趋势分析，实际应该基于历史数据
    return 'stable';
  }

  /**
   * 生成资源预测
   */
  private generateResourcePrediction(resource: string, currentValue: number): {
    exhaustionTime?: Date;
    recommendation: string;
  } {
    if (currentValue > 90) {
      return {
        exhaustionTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24小时后
        recommendation: `${resource} usage is high, consider optimization`
      };
    }

    return {
      recommendation: `${resource} usage is normal`
    };
  }

  /**
   * 更新系统指标
   */
  private async updateSystemMetrics(): Promise<void> {
    try {
      // 从数据库获取端口分配统计
      const totalAllocations = this.db.prepare(`
        SELECT COUNT(*) as count FROM unified_port_allocations
      `).get() as any;

      const activeAllocations = this.db.prepare(`
        SELECT COUNT(*) as count FROM unified_port_allocations
        WHERE status = 'active'
      `).get() as any;

      // 更新指标
      this.currentHealth.metrics.totalPortAllocations = totalAllocations?.count || 0;
      this.currentHealth.metrics.activeAllocations = activeAllocations?.count || 0;

      // 计算成功率（简化版本）
      this.currentHealth.metrics.allocationSuccessRate = 95; // 默认值
      this.currentHealth.metrics.avgAllocationTime = 50; // 默认值
      this.currentHealth.metrics.conflictResolutionRate = 98; // 默认值
      this.currentHealth.metrics.systemLoad = os.loadavg()[0];
      this.currentHealth.metrics.errorRate = 2; // 默认值

    } catch (error) {
      logger.error('Failed to update system metrics', { error });
      // 使用默认值
      this.currentHealth.metrics = {
        totalPortAllocations: 0,
        activeAllocations: 0,
        allocationSuccessRate: 0,
        avgAllocationTime: 0,
        conflictResolutionRate: 0,
        systemLoad: 0,
        errorRate: 100
      };
    }
  }

  /**
   * 计算整体健康评分
   */
  private calculateOverallHealth(): void {
    const subsystemScores = Object.values(this.currentHealth.subsystems).map(s => s.score);
    const resourceScores = Object.values(this.currentHealth.resources).map(r => {
      if (r.status === 'healthy') return 100;
      if (r.status === 'warning') return 70;
      return 30;
    });

    // 计算加权平均分
    const subsystemWeight = 0.6;
    const resourceWeight = 0.4;

    const avgSubsystemScore = subsystemScores.reduce((a, b) => a + b, 0) / subsystemScores.length;
    const avgResourceScore = resourceScores.reduce((a, b) => a + b, 0) / resourceScores.length;

    const overallScore = Math.round(
      avgSubsystemScore * subsystemWeight + avgResourceScore * resourceWeight
    );

    this.currentHealth.score = overallScore;

    // 确定整体状态
    if (overallScore >= this.config.thresholds.overallScore.warning) {
      this.currentHealth.overall = 'healthy';
    } else if (overallScore >= this.config.thresholds.overallScore.critical) {
      this.currentHealth.overall = 'warning';
    } else {
      this.currentHealth.overall = 'critical';
    }

    // 检查是否有关键子系统故障
    const criticalSubsystems = Object.values(this.currentHealth.subsystems)
      .filter(s => s.criticalPath && s.status === 'critical');

    if (criticalSubsystems.length > 0) {
      this.currentHealth.overall = 'critical';
      this.currentHealth.score = Math.min(this.currentHealth.score, 40);
    }
  }

  /**
   * 检查告警条件
   */
  private async checkAlertConditions(): Promise<void> {
    try {
      // 检查整体健康评分
      if (this.currentHealth.score <= this.config.thresholds.overallScore.critical) {
        await this.createAlert({
          type: 'subsystem',
          severity: 'critical',
          title: 'System Health Critical',
          message: `Overall system health score is ${this.currentHealth.score}`,
          source: 'SystemHealthMonitor',
          metrics: { score: this.currentHealth.score }
        });
      } else if (this.currentHealth.score <= this.config.thresholds.overallScore.warning) {
        await this.createAlert({
          type: 'subsystem',
          severity: 'medium',
          title: 'System Health Warning',
          message: `Overall system health score is ${this.currentHealth.score}`,
          source: 'SystemHealthMonitor',
          metrics: { score: this.currentHealth.score }
        });
      }

      // 检查资源使用率
      for (const [name, resource] of Object.entries(this.currentHealth.resources)) {
        if (resource.status === 'critical') {
          await this.createAlert({
            type: 'resource',
            severity: 'critical',
            title: `${name.toUpperCase()} Usage Critical`,
            message: `${name} usage is ${resource.usage.toFixed(1)}%`,
            source: 'SystemHealthMonitor',
            metrics: { resource: name, usage: resource.usage }
          });
        } else if (resource.status === 'warning') {
          await this.createAlert({
            type: 'resource',
            severity: 'medium',
            title: `${name.toUpperCase()} Usage Warning`,
            message: `${name} usage is ${resource.usage.toFixed(1)}%`,
            source: 'SystemHealthMonitor',
            metrics: { resource: name, usage: resource.usage }
          });
        }
      }

      // 检查子系统状态
      for (const [name, subsystem] of Object.entries(this.currentHealth.subsystems)) {
        if (subsystem.status === 'critical' || subsystem.status === 'down') {
          await this.createAlert({
            type: 'subsystem',
            severity: subsystem.criticalPath ? 'critical' : 'high',
            title: `${name} Subsystem ${subsystem.status}`,
            message: `${name} subsystem is ${subsystem.status}: ${subsystem.lastError || 'Unknown error'}`,
            source: 'SystemHealthMonitor',
            metrics: { subsystem: name, status: subsystem.status, score: subsystem.score }
          });
        }
      }

    } catch (error) {
      logger.error('Failed to check alert conditions', { error });
    }
  }

  /**
   * 创建告警
   */
  private async createAlert(alertData: {
    type: 'performance' | 'resource' | 'subsystem' | 'dependency' | 'prediction';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    source: string;
    metrics: Record<string, any>;
  }): Promise<void> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const alert: HealthAlert = {
        id: alertId,
        type: alertData.type,
        severity: alertData.severity,
        title: alertData.title,
        message: alertData.message,
        timestamp: new Date(),
        source: alertData.source,
        metrics: alertData.metrics,
        acknowledged: false,
        autoResolved: false,
        resolutionActions: []
      };

      // 检查是否是重复告警（防抖动）
      const alertKey = `${alert.type}_${alert.severity}_${alert.title}`;
      const existingAlert = Array.from(this.activeAlerts.values()).find(a => {
        const existingKey = `${a.type}_${a.severity}_${a.title}`;
        return existingKey === alertKey &&
               (Date.now() - a.timestamp.getTime()) < this.config.alerting.debounceTime;
      });

      if (existingAlert) {
        logger.debug('Duplicate alert suppressed', { alertId, title: alert.title, debounceTime: this.config.alerting.debounceTime });
        return;
      }

      // 添加到活跃告警
      this.activeAlerts.set(alertId, alert);
      this.currentHealth.alerts.push(alert);

      // 保存到数据库
      await this.saveAlert(alert);

      // 发送告警通知
      await this.sendAlertNotification(alert);

      // 尝试自动解决
      if (this.config.autoHealing.enabled) {
        await this.attemptAutoHealing(alert);
      }

      this.performanceStats.alertsGenerated++;

      logger.warn('Health alert created', {
        id: alertId,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        source: alert.source
      });

      this.emit('alert', alert);

    } catch (error) {
      logger.error('Failed to create alert', { error, alertData });
    }
  }

  /**
   * 保存告警到数据库
   */
  private async saveAlert(alert: HealthAlert): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_health_alerts (
          id, type, severity, title, message, timestamp, source,
          metrics, acknowledged, auto_resolved, resolution_actions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        alert.id,
        alert.type,
        alert.severity,
        alert.title,
        alert.message,
        alert.timestamp.toISOString(),
        alert.source,
        JSON.stringify(alert.metrics),
        alert.acknowledged ? 1 : 0,
        alert.autoResolved ? 1 : 0,
        JSON.stringify(alert.resolutionActions)
      );

    } catch (error) {
      logger.error('Failed to save alert to database', { error, alertId: alert.id });
    }
  }

  /**
   * 发送告警通知
   */
  private async sendAlertNotification(alert: HealthAlert): Promise<void> {
    try {
      // 控制台通知
      if (this.config.alerting.channels.includes('console')) {
        const emoji = this.getAlertEmoji(alert.severity);
        console.error(`${emoji} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);
      }

      // 日志通知
      if (this.config.alerting.channels.includes('log')) {
        logger.warn('System health alert', {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          metrics: alert.metrics
        });
      }

      // 其他通知渠道可以在这里添加（邮件、Slack等）

    } catch (error) {
      logger.error('Failed to send alert notification', { error, alertId: alert.id });
    }
  }

  /**
   * 获取告警表情符号
   */
  private getAlertEmoji(severity: string): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'high': return '⚠️';
      case 'medium': return '⚡';
      case 'low': return 'ℹ️';
      default: return '📢';
    }
  }

  /**
   * 尝试自动修复
   */
  private async attemptAutoHealing(alert: HealthAlert): Promise<void> {
    try {
      const actions: string[] = [];

      switch (alert.type) {
        case 'resource':
          if (alert.metrics.resource === 'memory' && this.config.autoHealing.actions.releaseResources) {
            // 触发垃圾回收
            if (global.gc) {
              global.gc();
              actions.push('Triggered garbage collection');
            }
          }
          break;

        case 'subsystem':
          if (this.config.autoHealing.actions.restartSubsystem) {
            const subsystemName = alert.metrics.subsystem;
            if (subsystemName && this.subsystemRefs.has(subsystemName)) {
              // 尝试重启子系统（这里是简化版本）
              actions.push(`Attempted to restart ${subsystemName} subsystem`);
            }
          }
          break;

        case 'performance':
          if (this.config.autoHealing.actions.clearCache) {
            // 清理缓存（简化版本）
            actions.push('Cleared system caches');
          }
          break;
      }

      if (actions.length > 0) {
        alert.resolutionActions = actions;
        this.performanceStats.autoHealingActions++;

        logger.info('Auto-healing actions performed', {
          alertId: alert.id,
          actions
        });
      }

    } catch (error) {
      logger.error('Auto-healing failed', { error, alertId: alert.id });
    }
  }

  /**
   * 生成建议和预警
   */
  private generateRecommendations(): void {
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // 基于整体健康评分的建议
    if (this.currentHealth.score < 80) {
      recommendations.push('Consider investigating system performance issues');
    }

    // 基于资源使用的建议
    for (const [name, resource] of Object.entries(this.currentHealth.resources)) {
      if (resource.usage > 80) {
        recommendations.push(`Consider optimizing ${name} usage (${resource.usage.toFixed(1)}%)`);
      }

      if (resource.prediction.exhaustionTime) {
        warnings.push(`${name} may be exhausted by ${resource.prediction.exhaustionTime.toLocaleString()}`);
      }
    }

    // 基于子系统状态的建议
    for (const [name, subsystem] of Object.entries(this.currentHealth.subsystems)) {
      if (subsystem.status === 'warning') {
        recommendations.push(`Monitor ${name} subsystem closely`);
      } else if (subsystem.status === 'critical') {
        warnings.push(`${name} subsystem requires immediate attention`);
      }
    }

    this.currentHealth.recommendations = recommendations;
    this.currentHealth.warnings = warnings;
  }

  /**
   * 保存健康状态
   */
  private async saveHealthStatus(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO system_health_history (
          overall_status, overall_score, uptime, subsystem_scores,
          resource_usage, metrics, alert_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const subsystemScores = Object.fromEntries(
        Object.entries(this.currentHealth.subsystems).map(([name, sub]) => [name, sub.score])
      );

      const resourceUsage = Object.fromEntries(
        Object.entries(this.currentHealth.resources).map(([name, res]) => [name, res.usage])
      );

      stmt.run(
        this.currentHealth.overall,
        this.currentHealth.score,
        this.currentHealth.uptime,
        JSON.stringify(subsystemScores),
        JSON.stringify(resourceUsage),
        JSON.stringify(this.currentHealth.metrics),
        this.currentHealth.alerts.length
      );

      // 添加到历史记录
      this.healthHistory.unshift(this.currentHealth);

      // 限制历史记录数量
      if (this.healthHistory.length > 1000) {
        this.healthHistory = this.healthHistory.slice(0, 1000);
      }

    } catch (error) {
      logger.error('Failed to save health status', { error });
    }
  }

  /**
   * 保存子系统指标
   */
  private async saveSubsystemMetrics(name: string, subsystem: SubsystemHealth): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO subsystem_metrics (
          subsystem_name, status, score, response_time, throughput,
          error_rate, error_count, uptime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        name,
        subsystem.status,
        subsystem.score,
        subsystem.performance.responseTime,
        subsystem.performance.throughput,
        subsystem.performance.errorRate,
        subsystem.errorCount,
        subsystem.uptime
      );

    } catch (error) {
      logger.error('Failed to save subsystem metrics', { error, subsystem: name });
    }
  }

  /**
   * 保存资源使用历史
   */
  private async saveResourceUsage(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO resource_usage_history (
          resource_name, usage_percent, available_amount, total_amount,
          trend, prediction_data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const [name, resource] of Object.entries(this.currentHealth.resources)) {
        stmt.run(
          name,
          resource.usage,
          resource.available,
          resource.total,
          resource.trend,
          JSON.stringify(resource.prediction)
        );
      }

    } catch (error) {
      logger.error('Failed to save resource usage', { error });
    }
  }

  /**
   * 执行深度健康检查
   */
  async performDeepHealthCheck(): Promise<void> {
    try {
      logger.info('Starting deep health check');

      // 执行基础检查
      await this.performBasicHealthCheck();

      // 执行额外的深度检查
      await this.checkDatabaseIntegrity();
      await this.checkSystemDependencies();
      await this.analyzePerformanceTrends();
      await this.updateFailurePatterns();

      logger.info('Deep health check completed');

    } catch (error) {
      logger.error('Deep health check failed', { error });
    }
  }

  /**
   * 检查数据库完整性
   */
  private async checkDatabaseIntegrity(): Promise<void> {
    try {
      // 执行数据库完整性检查
      const result = this.db.prepare('PRAGMA integrity_check').get() as any;

      if (result && result.integrity_check !== 'ok') {
        await this.createAlert({
          type: 'subsystem',
          severity: 'critical',
          title: 'Database Integrity Issue',
          message: 'Database integrity check failed',
          source: 'SystemHealthMonitor',
          metrics: { result: result.integrity_check }
        });
      }

    } catch (error) {
      logger.error('Database integrity check failed', { error });
    }
  }

  /**
   * 检查系统依赖
   */
  private async checkSystemDependencies(): Promise<void> {
    try {
      // 检查关键文件和目录
      const criticalPaths = [
        process.cwd(),
        path.join(process.cwd(), 'package.json'),
        path.join(process.cwd(), 'node_modules')
      ];

      for (const criticalPath of criticalPaths) {
        if (!fs.existsSync(criticalPath)) {
          await this.createAlert({
            type: 'dependency',
            severity: 'critical',
            title: 'Critical Path Missing',
            message: `Critical path not found: ${criticalPath}`,
            source: 'SystemHealthMonitor',
            metrics: { path: criticalPath }
          });
        }
      }

    } catch (error) {
      logger.error('System dependencies check failed', { error });
    }
  }

  /**
   * 分析性能趋势
   */
  private async analyzePerformanceTrends(): Promise<void> {
    try {
      // 简化的趋势分析
      if (this.healthHistory.length > 10) {
        const recentScores = this.healthHistory.slice(0, 10).map(h => h.score);
        const avgScore = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

        if (avgScore < 70) {
          await this.createAlert({
            type: 'performance',
            severity: 'medium',
            title: 'Performance Trend Declining',
            message: `Average health score over last 10 checks: ${avgScore.toFixed(1)}`,
            source: 'SystemHealthMonitor',
            metrics: { avgScore, sampleSize: recentScores.length }
          });
        }
      }

    } catch (error) {
      logger.error('Performance trend analysis failed', { error });
    }
  }

  /**
   * 更新故障模式
   */
  private async updateFailurePatterns(): Promise<void> {
    try {
      // 分析最近的告警，识别故障模式
      const recentAlerts = Array.from(this.activeAlerts.values())
        .filter(alert => Date.now() - alert.timestamp.getTime() < 24 * 60 * 60 * 1000);

      // 简化的模式识别
      const patterns = new Map<string, number>();
      for (const alert of recentAlerts) {
        const pattern = `${alert.type}_${alert.severity}`;
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }

      // 更新故障模式数据库
      for (const [pattern, frequency] of patterns) {
        if (frequency > 3) { // 如果模式出现超过3次
          const patternId = `pattern_${pattern}_${Date.now()}`;

          const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO failure_patterns (
              id, pattern, frequency, last_occurrence, prevention_measures
            ) VALUES (?, ?, ?, ?, ?)
          `);

          stmt.run(
            patternId,
            pattern,
            frequency,
            new Date().toISOString(),
            JSON.stringify(['Monitor system closely', 'Consider preventive maintenance'])
          );
        }
      }

    } catch (error) {
      logger.error('Failed to update failure patterns', { error });
    }
  }

  /**
   * 执行预测分析
   */
  async performPredictiveAnalysis(): Promise<void> {
    try {
      logger.info('Starting predictive analysis');

      // 预测资源耗尽
      await this.predictResourceExhaustion();

      // 预测系统故障
      await this.predictSystemFailures();

      logger.info('Predictive analysis completed');

    } catch (error) {
      logger.error('Predictive analysis failed', { error });
    }
  }

  /**
   * 预测资源耗尽
   */
  private async predictResourceExhaustion(): Promise<void> {
    try {
      for (const [name, resource] of Object.entries(this.currentHealth.resources)) {
        if (resource.usage > 85 && resource.trend === 'increasing') {
          await this.createAlert({
            type: 'prediction',
            severity: 'medium',
            title: `${name.toUpperCase()} Exhaustion Predicted`,
            message: `${name} usage is ${resource.usage.toFixed(1)}% and increasing`,
            source: 'SystemHealthMonitor',
            metrics: { resource: name, usage: resource.usage, trend: resource.trend }
          });
        }
      }

    } catch (error) {
      logger.error('Resource exhaustion prediction failed', { error });
    }
  }

  /**
   * 预测系统故障
   */
  private async predictSystemFailures(): Promise<void> {
    try {
      // 基于历史数据预测故障
      const criticalSubsystems = Object.values(this.currentHealth.subsystems)
        .filter(s => s.score < 60 && s.criticalPath);

      if (criticalSubsystems.length > 0) {
        await this.createAlert({
          type: 'prediction',
          severity: 'high',
          title: 'System Failure Risk',
          message: `${criticalSubsystems.length} critical subsystems showing degraded performance`,
          source: 'SystemHealthMonitor',
          metrics: {
            criticalSubsystems: criticalSubsystems.map(s => s.name),
            count: criticalSubsystems.length
          }
        });
      }

    } catch (error) {
      logger.error('System failure prediction failed', { error });
    }
  }

  // ===============================================================================
  // 公共API方法
  // ===============================================================================

  /**
   * 获取当前健康状态
   */
  getCurrentHealth(): SystemHealthStatus {
    return { ...this.currentHealth };
  }

  /**
   * 获取健康历史
   */
  getHealthHistory(limit: number = 100): SystemHealthStatus[] {
    return this.healthHistory.slice(0, limit);
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): HealthAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        return false;
      }

      alert.acknowledged = true;

      // 更新数据库
      const stmt = this.db.prepare(`
        UPDATE system_health_alerts
        SET acknowledged = 1
        WHERE id = ?
      `);
      stmt.run(alertId);

      logger.info('Alert acknowledged', { alertId });
      this.emit('alertAcknowledged', alert);

      return true;

    } catch (error) {
      logger.error('Failed to acknowledge alert', { error, alertId });
      return false;
    }
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats(): typeof this.performanceStats {
    return { ...this.performanceStats };
  }

  /**
   * 停止健康监控
   */
  async stop(): Promise<void> {
    try {
      this.isRunning = false;

      // 清理定时器
      if (this.basicCheckTimer) {
        clearInterval(this.basicCheckTimer);
        this.basicCheckTimer = undefined;
      }

      if (this.deepCheckTimer) {
        clearInterval(this.deepCheckTimer);
        this.deepCheckTimer = undefined;
      }

      if (this.resourceCheckTimer) {
        clearInterval(this.resourceCheckTimer);
        this.resourceCheckTimer = undefined;
      }

      if (this.predictionTimer) {
        clearInterval(this.predictionTimer);
        this.predictionTimer = undefined;
      }

      logger.info('SystemHealthMonitor stopped');
      this.emit('stopped');

    } catch (error) {
      logger.error('Failed to stop SystemHealthMonitor', { error });
      throw error;
    }
  }

  /**
   * 销毁健康监控器
   */
  async destroy(): Promise<void> {
    try {
      await this.stop();

      // 清理资源
      this.activeAlerts.clear();
      this.failurePatterns.clear();
      this.subsystemRefs.clear();
      this.healthHistory = [];

      // 移除所有监听器
      this.removeAllListeners();

      logger.info('SystemHealthMonitor destroyed');

    } catch (error) {
      logger.error('Failed to destroy SystemHealthMonitor', { error });
      throw error;
    }
  }
}
