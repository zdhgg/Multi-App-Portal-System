/**
 * 统一配置管理器 - 第一阶段配置系统重构
 * 
 * 提供统一的配置管理服务，支持：
 * - 环境区分（development, production, testing）
 * - 热更新和动态重载
 * - 配置验证和类型安全
 * - 版本管理和变更跟踪
 * - 配置备份和恢复
 * - 分层配置（默认 < 环境 < 用户）
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, mkdirSync, watchFile, unwatchFile } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../utils/logger';
import Joi from 'joi';

// ===============================================================================
// 类型定义和接口
// ===============================================================================

export interface ConfigSchema {
  // 系统配置
  system: {
    name: string;
    version: string;
    environment: 'development' | 'production' | 'testing';
    mode: 'development' | 'production';
    projectRoot: string;
    dataDirectory: string;
    logsDirectory: string;
    configDirectory: string;
  };

  // 端口配置
  ports: {
    // 服务端口
    frontend: number;
    backend: number;
    monitoring: number;
    websocket: number;
    
    // 端口范围
    ranges: {
      frontend: { start: number; end: number; description: string };
      backend: { start: number; end: number; description: string };
      api: { start: number; end: number; description: string };
      websocket: { start: number; end: number; description: string };
      database: { start: number; end: number; description: string };
    };
    
    // 保留端口
    reserved: Array<{
      port: number;
      description: string;
      category: 'system' | 'portal' | 'database' | 'custom';
    }>;
    
    // 分配策略
    allocation: {
      strategy: 'sequential' | 'random' | 'optimized';
      maxRetries: number;
      retryDelayMs: number;
      conflictResolution: 'auto_reassign' | 'manual' | 'fail';
      randomizeStartPort: boolean;
    };
  };

  // 性能配置
  performance: {
    caching: {
      enabled: boolean;
      portStatusCacheTimeout: number;
      configCacheTimeout: number;
      maxCacheSize: number;
    };
    optimization: {
      batchPortChecks: boolean;
      parallelProcessing: boolean;
      maxConcurrency: number;
    };
    monitoring: {
      enableRealTimeMonitoring: boolean;
      healthCheckInterval: number;
      performanceMetricsInterval: number;
      resourceCheckEnabled: boolean;
    };
  };

  // 日志配置
  logging: {
    enabled: boolean;
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    retentionDays: number;
    maxLogSize: number;
    components: string[];
    rotateOnSize: boolean;
    compressOldLogs: boolean;
  };

  // 安全配置
  security: {
    allowPortRangeModification: boolean;
    requireConfirmationForCriticalChanges: boolean;
    allowedConfigModifiers: string[];
    configChangeAuditLog: boolean;
    validateConfigIntegrity: boolean;
    encryptSensitiveData: boolean;
  };

  // 通知配置
  notifications: {
    enabled: boolean;
    channels: {
      log: { enabled: boolean };
      console: { enabled: boolean };
      email?: { enabled: boolean; recipients: string[] };
      webhook?: { enabled: boolean; url: string };
    };
    events: {
      startup: boolean;
      shutdown: boolean;
      error: boolean;
      recovery: boolean;
      configChange: boolean;
      portConflict: boolean;
    };
  };

  // UI配置
  ui: {
    theme: {
      primaryColor: string;
      darkMode: boolean;
      customStyles?: Record<string, any>;
    };
    dashboard: {
      refreshInterval: number;
      animationEnabled: boolean;
      showAdvancedMetrics: boolean;
    };
    portManagement: {
      showPortUsageChart: boolean;
      showPerformanceMetrics: boolean;
      autoRefreshStatus: boolean;
    };
  };

  // 恢复配置
  recovery: {
    enabled: boolean;
    autoRecover: boolean;
    maxRetries: number;
    retryDelay: number;
    checkInterval: number;
    strategies: {
      serviceRepair: { enabled: boolean; configReset: boolean; rebuildOnFailure: boolean };
      portCleanup: { enabled: boolean; forceKill: boolean; waitTime: number };
      processRestart: { enabled: boolean; cooldownPeriod: number; maxAttempts: number };
    };
  };

  // 实验性功能
  experimental: {
    features: Record<string, boolean>;
    flags: Record<string, any>;
  };
}

export interface ConfigChangeEvent {
  type: 'update' | 'reload' | 'reset';
  changes: Array<{
    path: string;
    oldValue: any;
    newValue: any;
  }>;
  timestamp: Date;
  source: 'file' | 'api' | 'system';
  user?: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
    value: any;
  }>;
  warnings: Array<{
    path: string;
    message: string;
    value: any;
  }>;
}

export interface ConfigBackup {
  id: string;
  timestamp: Date;
  environment: string;
  version: string;
  config: Partial<ConfigSchema>;
  metadata: {
    reason: string;
    user?: string;
    size: number;
  };
}

// ===============================================================================
// 统一配置管理器实现
// ===============================================================================

export class UnifiedConfigManager extends EventEmitter {
  private config: ConfigSchema;
  private environment: string;
  private configPath: string;
  private backupPath: string;
  private watchedFiles: Set<string> = new Set();
  private validationSchema: Joi.ObjectSchema;
  private lastUpdateTime: Date;
  private configHistory: ConfigBackup[] = [];
  private hotReloadEnabled: boolean = true;

  constructor(options: {
    environment?: string;
    configPath?: string;
    backupPath?: string;
    enableHotReload?: boolean;
  } = {}) {
    super();

    this.environment = options.environment || process.env.NODE_ENV || 'development';
    this.configPath = options.configPath || join(process.cwd(), 'configs');
    this.backupPath = options.backupPath || join(this.configPath, 'backups');
    this.hotReloadEnabled = options.enableHotReload !== false;

    // 确保目录存在
    this.ensureDirectories();

    // 创建验证模式
    this.validationSchema = this.createValidationSchema();

    // 加载配置
    this.loadConfiguration();

    // 设置文件监听
    if (this.hotReloadEnabled) {
      this.setupFileWatching();
    }

    // 定期清理备份
    this.scheduleBackupCleanup();

    logger.info('UnifiedConfigManager initialized', {
      environment: this.environment,
      configPath: this.configPath,
      hotReload: this.hotReloadEnabled
    });
  }

  // ===============================================================================
  // 配置加载和保存
  // ===============================================================================

  /**
   * 加载配置
   */
  private loadConfiguration(): void {
    try {
      // 1. 加载默认配置
      const defaultConfig = this.loadDefaultConfig();

      // 2. 加载环境特定配置
      const envConfig = this.loadEnvironmentConfig(this.environment);

      // 3. 加载用户自定义配置
      const userConfig = this.loadUserConfig();

      // 4. 合并配置（默认 < 环境 < 用户）
      this.config = this.mergeConfigs(defaultConfig, envConfig, userConfig);

      // 5. 验证配置
      const validation = this.validateConfig(this.config);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // 6. 处理验证警告
      if (validation.warnings.length > 0) {
        validation.warnings.forEach(warning => {
          logger.warn('Configuration warning', { path: warning.path, message: warning.message });
        });
      }

      // 7. 后处理配置
      this.postProcessConfig();

      this.lastUpdateTime = new Date();

      logger.info('Configuration loaded successfully', {
        environment: this.environment,
        configSize: JSON.stringify(this.config).length,
        lastUpdate: this.lastUpdateTime
      });

    } catch (error) {
      logger.error('Failed to load configuration', { error: error.message });
      
      // 尝试加载最近的备份
      const backup = this.getLatestBackup();
      if (backup) {
        logger.warn('Loading configuration from latest backup', { backupId: backup.id });
        this.config = backup.config as ConfigSchema;
      } else {
        throw error;
      }
    }
  }

  /**
   * 加载默认配置
   */
  private loadDefaultConfig(): Partial<ConfigSchema> {
    const defaultConfigPath = join(this.configPath, 'default.json');
    
    if (existsSync(defaultConfigPath)) {
      return JSON.parse(readFileSync(defaultConfigPath, 'utf-8'));
    }

    // 返回硬编码的默认配置
    return this.getHardcodedDefaults();
  }

  /**
   * 加载环境配置
   */
  private loadEnvironmentConfig(environment: string): Partial<ConfigSchema> {
    const envConfigPath = join(this.configPath, `${environment}.json`);
    
    if (existsSync(envConfigPath)) {
      return JSON.parse(readFileSync(envConfigPath, 'utf-8'));
    }

    // 尝试加载模板配置
    const templatePath = join(this.configPath, 'templates', `${environment}.json`);
    if (existsSync(templatePath)) {
      return JSON.parse(readFileSync(templatePath, 'utf-8'));
    }

    return {};
  }

  /**
   * 加载用户配置
   */
  private loadUserConfig(): Partial<ConfigSchema> {
    const userConfigPath = join(this.configPath, 'user.json');
    
    if (existsSync(userConfigPath)) {
      return JSON.parse(readFileSync(userConfigPath, 'utf-8'));
    }

    return {};
  }

  /**
   * 合并配置对象
   */
  private mergeConfigs(...configs: Partial<ConfigSchema>[]): ConfigSchema {
    const merged = {};
    
    for (const config of configs) {
      this.deepMerge(merged, config);
    }

    return merged as ConfigSchema;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          this.deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
  }

  /**
   * 保存配置
   */
  async saveConfiguration(config: Partial<ConfigSchema>, options: {
    user?: string;
    reason?: string;
    createBackup?: boolean;
  } = {}): Promise<void> {
    try {
      // 1. 创建备份
      if (options.createBackup !== false) {
        await this.createBackup(options.reason || 'Configuration update', options.user);
      }

      // 2. 合并新配置
      const newConfig = this.mergeConfigs(this.config, config);

      // 3. 验证新配置
      const validation = this.validateConfig(newConfig);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // 4. 检测变更
      const changes = this.detectChanges(this.config, newConfig);

      // 5. 保存到文件
      const configPath = join(this.configPath, `${this.environment}.json`);
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');

      // 6. 更新内存中的配置
      this.config = newConfig;
      this.lastUpdateTime = new Date();

      // 7. 发出变更事件
      this.emit('configChanged', {
        type: 'update',
        changes,
        timestamp: this.lastUpdateTime,
        source: 'api',
        user: options.user
      } as ConfigChangeEvent);

      logger.info('Configuration saved successfully', {
        environment: this.environment,
        changes: changes.length,
        user: options.user
      });

    } catch (error) {
      logger.error('Failed to save configuration', { error: error.message });
      throw error;
    }
  }

  // ===============================================================================
  // 配置访问方法
  // ===============================================================================

  /**
   * 获取完整配置
   */
  getConfig(): ConfigSchema {
    return JSON.parse(JSON.stringify(this.config)); // 返回深拷贝
  }

  /**
   * 获取配置值
   */
  get<T = any>(path: string, defaultValue?: T): T {
    const value = this.getNestedValue(this.config, path);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值
   */
  async set(path: string, value: any, options?: {
    user?: string;
    reason?: string;
  }): Promise<void> {
    const pathParts = path.split('.');
    const config = JSON.parse(JSON.stringify(this.config));
    
    let current = config;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {};
      }
      current = current[pathParts[i]];
    }
    
    current[pathParts[pathParts.length - 1]] = value;
    
    await this.saveConfiguration(config, options);
  }

  /**
   * 检查配置值是否存在
   */
  has(path: string): boolean {
    return this.getNestedValue(this.config, path) !== undefined;
  }

  // ===============================================================================
  // 特定配置获取方法
  // ===============================================================================

  /**
   * 获取端口配置
   */
  getPortConfig() {
    return this.get('ports');
  }

  /**
   * 获取性能配置
   */
  getPerformanceConfig() {
    return this.get('performance');
  }

  /**
   * 获取日志配置
   */
  getLoggingConfig() {
    return this.get('logging');
  }

  /**
   * 获取安全配置
   */
  getSecurityConfig() {
    return this.get('security');
  }

  // ===============================================================================
  // 配置验证
  // ===============================================================================

  /**
   * 创建验证模式
   */
  private createValidationSchema(): Joi.ObjectSchema {
    return Joi.object({
      system: Joi.object({
        name: Joi.string().required(),
        version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
        environment: Joi.string().valid('development', 'production', 'testing').required(),
        mode: Joi.string().valid('development', 'production').required(),
        projectRoot: Joi.string().required(),
        dataDirectory: Joi.string().required(),
        logsDirectory: Joi.string().required(),
        configDirectory: Joi.string().required()
      }).required(),

      ports: Joi.object({
        frontend: Joi.number().port().required(),
        backend: Joi.number().port().required(),
        monitoring: Joi.number().port().required(),
        websocket: Joi.number().port().required(),
        
        ranges: Joi.object({
          frontend: Joi.object({
            start: Joi.number().port().required(),
            end: Joi.number().port().min(Joi.ref('start')).required(),
            description: Joi.string().required()
          }).required(),
          backend: Joi.object({
            start: Joi.number().port().required(),
            end: Joi.number().port().min(Joi.ref('start')).required(),
            description: Joi.string().required()
          }).required(),
          api: Joi.object({
            start: Joi.number().port().required(),
            end: Joi.number().port().min(Joi.ref('start')).required(),
            description: Joi.string().required()
          }).required(),
          websocket: Joi.object({
            start: Joi.number().port().required(),
            end: Joi.number().port().min(Joi.ref('start')).required(),
            description: Joi.string().required()
          }).required(),
          database: Joi.object({
            start: Joi.number().port().required(),
            end: Joi.number().port().min(Joi.ref('start')).required(),
            description: Joi.string().required()
          }).required()
        }).required(),

        reserved: Joi.array().items(
          Joi.object({
            port: Joi.number().port().required(),
            description: Joi.string().required(),
            category: Joi.string().valid('system', 'portal', 'database', 'custom').required()
          })
        ).required(),

        allocation: Joi.object({
          strategy: Joi.string().valid('sequential', 'random', 'optimized').required(),
          maxRetries: Joi.number().min(1).max(10).required(),
          retryDelayMs: Joi.number().min(0).max(5000).required(),
          conflictResolution: Joi.string().valid('auto_reassign', 'manual', 'fail').required(),
          randomizeStartPort: Joi.boolean().required()
        }).required()
      }).required(),

      performance: Joi.object({
        caching: Joi.object({
          enabled: Joi.boolean().required(),
          portStatusCacheTimeout: Joi.number().min(1000).required(),
          configCacheTimeout: Joi.number().min(1000).required(),
          maxCacheSize: Joi.number().min(10).required()
        }).required(),
        optimization: Joi.object({
          batchPortChecks: Joi.boolean().required(),
          parallelProcessing: Joi.boolean().required(),
          maxConcurrency: Joi.number().min(1).max(100).required()
        }).required(),
        monitoring: Joi.object({
          enableRealTimeMonitoring: Joi.boolean().required(),
          healthCheckInterval: Joi.number().min(1000).required(),
          performanceMetricsInterval: Joi.number().min(1000).required(),
          resourceCheckEnabled: Joi.boolean().required()
        }).required()
      }).required(),

      logging: Joi.object({
        enabled: Joi.boolean().required(),
        level: Joi.string().valid('DEBUG', 'INFO', 'WARN', 'ERROR').required(),
        retentionDays: Joi.number().min(1).max(365).required(),
        maxLogSize: Joi.number().min(1024).required(),
        components: Joi.array().items(Joi.string()).required(),
        rotateOnSize: Joi.boolean().required(),
        compressOldLogs: Joi.boolean().required()
      }).required(),

      security: Joi.object({
        allowPortRangeModification: Joi.boolean().required(),
        requireConfirmationForCriticalChanges: Joi.boolean().required(),
        allowedConfigModifiers: Joi.array().items(Joi.string()).required(),
        configChangeAuditLog: Joi.boolean().required(),
        validateConfigIntegrity: Joi.boolean().required(),
        encryptSensitiveData: Joi.boolean().required()
      }).required(),

      notifications: Joi.object({
        enabled: Joi.boolean().required(),
        channels: Joi.object({
          log: Joi.object({ enabled: Joi.boolean().required() }).required(),
          console: Joi.object({ enabled: Joi.boolean().required() }).required(),
          email: Joi.object({
            enabled: Joi.boolean().required(),
            recipients: Joi.array().items(Joi.string().email())
          }).optional(),
          webhook: Joi.object({
            enabled: Joi.boolean().required(),
            url: Joi.string().uri()
          }).optional()
        }).required(),
        events: Joi.object({
          startup: Joi.boolean().required(),
          shutdown: Joi.boolean().required(),
          error: Joi.boolean().required(),
          recovery: Joi.boolean().required(),
          configChange: Joi.boolean().required(),
          portConflict: Joi.boolean().required()
        }).required()
      }).required(),

      ui: Joi.object({
        theme: Joi.object({
          primaryColor: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).required(),
          darkMode: Joi.boolean().required(),
          customStyles: Joi.object().optional()
        }).required(),
        dashboard: Joi.object({
          refreshInterval: Joi.number().min(1000).required(),
          animationEnabled: Joi.boolean().required(),
          showAdvancedMetrics: Joi.boolean().required()
        }).required(),
        portManagement: Joi.object({
          showPortUsageChart: Joi.boolean().required(),
          showPerformanceMetrics: Joi.boolean().required(),
          autoRefreshStatus: Joi.boolean().required()
        }).required()
      }).required(),

      recovery: Joi.object({
        enabled: Joi.boolean().required(),
        autoRecover: Joi.boolean().required(),
        maxRetries: Joi.number().min(1).max(10).required(),
        retryDelay: Joi.number().min(1000).required(),
        checkInterval: Joi.number().min(5000).required(),
        strategies: Joi.object({
          serviceRepair: Joi.object({
            enabled: Joi.boolean().required(),
            configReset: Joi.boolean().required(),
            rebuildOnFailure: Joi.boolean().required()
          }).required(),
          portCleanup: Joi.object({
            enabled: Joi.boolean().required(),
            forceKill: Joi.boolean().required(),
            waitTime: Joi.number().min(0).required()
          }).required(),
          processRestart: Joi.object({
            enabled: Joi.boolean().required(),
            cooldownPeriod: Joi.number().min(1000).required(),
            maxAttempts: Joi.number().min(1).max(10).required()
          }).required()
        }).required()
      }).required(),

      experimental: Joi.object({
        features: Joi.object().pattern(Joi.string(), Joi.boolean()).required(),
        flags: Joi.object().required()
      }).required()
    });
  }

  /**
   * 验证配置
   */
  validateConfig(config: any): ConfigValidationResult {
    const result = this.validationSchema.validate(config, {
      abortEarly: false,
      allowUnknown: true
    });

    return {
      valid: !result.error,
      errors: result.error ? result.error.details.map(detail => ({
        path: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      })) : [],
      warnings: [] // 可以添加自定义警告逻辑
    };
  }

  // ===============================================================================
  // 继续在下一个文件中实现其余方法...
  // ===============================================================================
  
  // 私有方法存根，将在扩展文件中实现
  private ensureDirectories(): void {
    [this.configPath, this.backupPath].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  private setupFileWatching(): void {
    // 将在扩展文件中实现
  }
  
  private scheduleBackupCleanup(): void {
    // 将在扩展文件中实现
  }
  
  private postProcessConfig(): void {
    // 将在扩展文件中实现
  }
  
  private getHardcodedDefaults(): Partial<ConfigSchema> {
    // 将在扩展文件中实现
    return {};
  }
  
  private detectChanges(oldConfig: any, newConfig: any): Array<{path: string; oldValue: any; newValue: any}> {
    // 将在扩展文件中实现
    return [];
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
  
  private async createBackup(reason: string, user?: string): Promise<ConfigBackup> {
    // 将在扩展文件中实现
    return {} as ConfigBackup;
  }
  
  private getLatestBackup(): ConfigBackup | null {
    // 将在扩展文件中实现
    return null;
  }
}
