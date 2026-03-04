/**
 * 统一配置管理器 - 扩展功能实现
 * 
 * 包含热重载、备份管理、变更检测等高级功能
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import { ConfigSchema, ConfigBackup, ConfigChangeEvent } from './UnifiedConfigManager';

export class UnifiedConfigManagerExtended {
  
  // ===============================================================================
  // 文件监听和热重载
  // ===============================================================================

  static setupFileWatching(
    instance: any,
    configPath: string,
    environment: string
  ): void {
    // 监听的配置文件
    const filesToWatch = [
      join(configPath, 'default.json'),
      join(configPath, `${environment}.json`),
      join(configPath, 'user.json'),
      join(configPath, 'templates', `${environment}.json`)
    ];

    filesToWatch.forEach(file => {
      if (existsSync(file)) {
        instance.watchedFiles.add(file);
        
        watchFile(file, { interval: 1000 }, (curr, prev) => {
          if (curr.mtime !== prev.mtime) {
            logger.info('Configuration file changed, reloading...', { file });
            instance.handleFileChange(file);
          }
        });

        logger.debug('Watching configuration file', { file });
      }
    });
  }

  static handleFileChange(instance: any, filePath: string): void {
    try {
      // 延迟重载以避免文件写入过程中的读取
      setTimeout(() => {
        const oldConfig = JSON.parse(JSON.stringify(instance.config));
        
        // 重新加载配置
        instance.loadConfiguration();
        
        // 检测变更
        const changes = this.detectChanges(oldConfig, instance.config);
        
        if (changes.length > 0) {
          // 发出变更事件
          instance.emit('configChanged', {
            type: 'reload',
            changes,
            timestamp: new Date(),
            source: 'file'
          } as ConfigChangeEvent);

          logger.info('Configuration reloaded due to file change', {
            file: filePath,
            changes: changes.length
          });
        }
      }, 100);
    } catch (error) {
      logger.error('Failed to reload configuration after file change', {
        file: filePath,
        error: error.message
      });
    }
  }

  static stopFileWatching(watchedFiles: Set<string>): void {
    watchedFiles.forEach(file => {
      unwatchFile(file);
    });
    watchedFiles.clear();
  }

  // ===============================================================================
  // 配置变更检测
  // ===============================================================================

  static detectChanges(
    oldConfig: any, 
    newConfig: any, 
    basePath: string = ''
  ): Array<{path: string; oldValue: any; newValue: any}> {
    const changes: Array<{path: string; oldValue: any; newValue: any}> = [];

    // 检查所有新配置的键
    for (const key in newConfig) {
      const currentPath = basePath ? `${basePath}.${key}` : key;
      const oldValue = oldConfig?.[key];
      const newValue = newConfig[key];

      if (oldValue === undefined && newValue !== undefined) {
        // 新增的配置
        changes.push({
          path: currentPath,
          oldValue: undefined,
          newValue
        });
      } else if (oldValue !== undefined && newValue === undefined) {
        // 删除的配置
        changes.push({
          path: currentPath,
          oldValue,
          newValue: undefined
        });
      } else if (typeof newValue === 'object' && newValue !== null && !Array.isArray(newValue)) {
        // 递归检查对象
        const nestedChanges = this.detectChanges(oldValue, newValue, currentPath);
        changes.push(...nestedChanges);
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        // 值发生变化
        changes.push({
          path: currentPath,
          oldValue,
          newValue
        });
      }
    }

    // 检查被删除的键
    for (const key in oldConfig) {
      if (!(key in newConfig)) {
        const currentPath = basePath ? `${basePath}.${key}` : key;
        changes.push({
          path: currentPath,
          oldValue: oldConfig[key],
          newValue: undefined
        });
      }
    }

    return changes;
  }

  // ===============================================================================
  // 配置备份管理
  // ===============================================================================

  static async createBackup(
    instance: any,
    reason: string,
    user?: string
  ): Promise<ConfigBackup> {
    try {
      const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date();
      
      const backup: ConfigBackup = {
        id: backupId,
        timestamp,
        environment: instance.environment,
        version: instance.config.system.version,
        config: JSON.parse(JSON.stringify(instance.config)),
        metadata: {
          reason,
          user,
          size: JSON.stringify(instance.config).length
        }
      };

      // 保存备份文件
      const backupFilePath = join(instance.backupPath, `${backupId}.json`);
      writeFileSync(backupFilePath, JSON.stringify(backup, null, 2), 'utf-8');

      // 添加到历史记录
      instance.configHistory.push(backup);

      // 限制历史记录数量
      const maxHistory = instance.config.system?.maxConfigHistoryEntries || 50;
      if (instance.configHistory.length > maxHistory) {
        const removed = instance.configHistory.shift();
        if (removed) {
          const oldBackupPath = join(instance.backupPath, `${removed.id}.json`);
          if (existsSync(oldBackupPath)) {
            unlinkSync(oldBackupPath);
          }
        }
      }

      logger.info('Configuration backup created', {
        backupId,
        reason,
        user,
        size: backup.metadata.size
      });

      return backup;
    } catch (error) {
      logger.error('Failed to create configuration backup', {
        reason,
        user,
        error: error.message
      });
      throw error;
    }
  }

  static async restoreFromBackup(
    instance: any,
    backupId: string,
    options: { user?: string; reason?: string } = {}
  ): Promise<void> {
    try {
      const backup = instance.configHistory.find((b: ConfigBackup) => b.id === backupId);
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // 创建当前配置的备份
      await this.createBackup(instance, 'Before restore operation', options.user);

      // 恢复配置
      const oldConfig = JSON.parse(JSON.stringify(instance.config));
      instance.config = JSON.parse(JSON.stringify(backup.config));

      // 保存到文件
      const configPath = join(instance.configPath, `${instance.environment}.json`);
      writeFileSync(configPath, JSON.stringify(instance.config, null, 2), 'utf-8');

      // 检测变更
      const changes = this.detectChanges(oldConfig, instance.config);

      // 发出变更事件
      instance.emit('configChanged', {
        type: 'reload',
        changes,
        timestamp: new Date(),
        source: 'api',
        user: options.user
      } as ConfigChangeEvent);

      logger.info('Configuration restored from backup', {
        backupId,
        changes: changes.length,
        user: options.user
      });

    } catch (error) {
      logger.error('Failed to restore configuration from backup', {
        backupId,
        error: error.message
      });
      throw error;
    }
  }

  static getLatestBackup(configHistory: ConfigBackup[]): ConfigBackup | null {
    if (configHistory.length === 0) return null;
    
    return configHistory.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );
  }

  static loadBackupHistory(backupPath: string): ConfigBackup[] {
    try {
      if (!existsSync(backupPath)) return [];

      const backupFiles = readdirSync(backupPath)
        .filter(file => file.endsWith('.json') && file.startsWith('backup_'))
        .map(file => join(backupPath, file));

      const backups: ConfigBackup[] = [];

      for (const file of backupFiles) {
        try {
          const backup = JSON.parse(readFileSync(file, 'utf-8'));
          backups.push(backup);
        } catch (error) {
          logger.warn('Failed to load backup file', { file, error: error.message });
        }
      }

      // 按时间戳排序
      return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      logger.error('Failed to load backup history', { backupPath, error: error.message });
      return [];
    }
  }

  static scheduleBackupCleanup(instance: any): void {
    // 每天清理一次过期备份
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24小时
    
    setInterval(() => {
      this.cleanupExpiredBackups(instance);
    }, cleanupInterval);

    // 立即执行一次清理
    setTimeout(() => {
      this.cleanupExpiredBackups(instance);
    }, 5000);
  }

  static cleanupExpiredBackups(instance: any): void {
    try {
      const retentionDays = instance.config?.system?.backupRetentionDays || 30;
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      let cleanedCount = 0;

      for (let i = instance.configHistory.length - 1; i >= 0; i--) {
        const backup = instance.configHistory[i];
        if (new Date(backup.timestamp) < cutoffDate) {
          // 删除备份文件
          const backupFilePath = join(instance.backupPath, `${backup.id}.json`);
          if (existsSync(backupFilePath)) {
            unlinkSync(backupFilePath);
          }

          // 从历史记录中移除
          instance.configHistory.splice(i, 1);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired configuration backups', {
          cleanedCount,
          retentionDays,
          remainingBackups: instance.configHistory.length
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired backups', { error: error.message });
    }
  }

  // ===============================================================================
  // 配置后处理
  // ===============================================================================

  static postProcessConfig(instance: any): void {
    try {
      // 1. 解析环境变量
      this.resolveEnvironmentVariables(instance.config);

      // 2. 计算派生值
      this.calculateDerivedValues(instance.config);

      // 3. 验证端口范围
      this.validatePortRanges(instance.config);

      // 4. 标准化路径
      this.normalizePaths(instance.config);

      logger.debug('Configuration post-processing completed');
    } catch (error) {
      logger.error('Configuration post-processing failed', { error: error.message });
      throw error;
    }
  }

  private static resolveEnvironmentVariables(config: any): void {
    // 递归处理配置对象，解析环境变量
    const resolve = (obj: any) => {
      for (const key in obj) {
        if (typeof obj[key] === 'string') {
          // 替换环境变量 ${VAR_NAME} 格式
          obj[key] = obj[key].replace(/\$\{([^}]+)\}/g, (match: string, varName: string) => {
            return process.env[varName] || match;
          });
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          resolve(obj[key]);
        }
      }
    };

    resolve(config);
  }

  private static calculateDerivedValues(config: any): void {
    // 计算配置的派生值
    if (config.ports?.ranges) {
      // 计算端口范围大小
      for (const rangeName in config.ports.ranges) {
        const range = config.ports.ranges[rangeName];
        if (range.start && range.end) {
          range.size = range.end - range.start + 1;
        }
      }
    }

    // 设置默认值
    if (!config.system?.dataDirectory) {
      config.system.dataDirectory = join(config.system.projectRoot, 'data');
    }

    if (!config.system?.logsDirectory) {
      config.system.logsDirectory = join(config.system.projectRoot, 'logs');
    }
  }

  private static validatePortRanges(config: any): void {
    if (!config.ports?.ranges) return;

    const usedPorts = new Set<number>();
    const ranges = config.ports.ranges;

    // 检查范围重叠
    for (const rangeName1 in ranges) {
      for (const rangeName2 in ranges) {
        if (rangeName1 !== rangeName2) {
          const range1 = ranges[rangeName1];
          const range2 = ranges[rangeName2];

          if (this.rangesOverlap(range1, range2)) {
            logger.warn('Port ranges overlap', {
              range1: `${rangeName1} (${range1.start}-${range1.end})`,
              range2: `${rangeName2} (${range2.start}-${range2.end})`
            });
          }
        }
      }
    }

    // 检查保留端口是否在分配范围内
    if (config.ports.reserved) {
      for (const reserved of config.ports.reserved) {
        for (const rangeName in ranges) {
          const range = ranges[rangeName];
          if (reserved.port >= range.start && reserved.port <= range.end) {
            logger.warn('Reserved port within allocation range', {
              port: reserved.port,
              range: `${rangeName} (${range.start}-${range.end})`
            });
          }
        }
      }
    }
  }

  private static rangesOverlap(range1: any, range2: any): boolean {
    return range1.start <= range2.end && range2.start <= range1.end;
  }

  private static normalizePaths(config: any): void {
    const pathFields = [
      'system.projectRoot',
      'system.dataDirectory',
      'system.logsDirectory',
      'system.configDirectory'
    ];

    for (const pathField of pathFields) {
      const value = this.getNestedValue(config, pathField);
      if (value && typeof value === 'string') {
        // 标准化路径分隔符
        const normalizedPath = value.replace(/\\/g, '/');
        this.setNestedValue(config, pathField, normalizedPath);
      }
    }
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private static setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  // ===============================================================================
  // 硬编码默认配置
  // ===============================================================================

  static getHardcodedDefaults(): Partial<ConfigSchema> {
    return {
      system: {
        name: 'Intelligent Multi-App Portal System',
        version: '2.0.0',
        environment: 'development',
        mode: 'development',
        projectRoot: process.cwd(),
        dataDirectory: join(process.cwd(), 'data'),
        logsDirectory: join(process.cwd(), 'logs'),
        configDirectory: join(process.cwd(), 'configs')
      },

      ports: {
        frontend: 3000,
        backend: 8001,
        monitoring: 8002,
        websocket: 8003,

        ranges: {
          frontend: { start: 3001, end: 3100, description: '前端应用端口范围' },
          backend: { start: 8001, end: 8100, description: '后端服务端口范围' },
          api: { start: 8101, end: 8200, description: 'API服务端口范围' },
          websocket: { start: 8201, end: 8300, description: 'WebSocket端口范围' },
          database: { start: 8301, end: 8400, description: '数据库连接端口范围' }
        },

        reserved: [
          { port: 22, description: 'SSH', category: 'system' },
          { port: 80, description: 'HTTP', category: 'system' },
          { port: 443, description: 'HTTPS', category: 'system' },
          { port: 3000, description: '主门户服务', category: 'portal' },
          { port: 8000, description: '备用门户服务', category: 'portal' }
        ],

        allocation: {
          strategy: 'optimized',
          maxRetries: 3,
          retryDelayMs: 100,
          conflictResolution: 'auto_reassign',
          randomizeStartPort: true
        }
      },

      performance: {
        caching: {
          enabled: true,
          portStatusCacheTimeout: 30000,
          configCacheTimeout: 300000,
          maxCacheSize: 1000
        },
        optimization: {
          batchPortChecks: true,
          parallelProcessing: true,
          maxConcurrency: 10
        },
        monitoring: {
          enableRealTimeMonitoring: true,
          healthCheckInterval: 60000,
          performanceMetricsInterval: 300000,
          resourceCheckEnabled: true
        }
      },

      logging: {
        enabled: true,
        level: 'INFO',
        retentionDays: 30,
        maxLogSize: 10485760, // 10MB
        components: ['SYSTEM', 'API', 'MONITOR', 'RECOVERY'],
        rotateOnSize: true,
        compressOldLogs: true
      },

      security: {
        allowPortRangeModification: true,
        requireConfirmationForCriticalChanges: true,
        allowedConfigModifiers: ['admin', 'system'],
        configChangeAuditLog: true,
        validateConfigIntegrity: true,
        encryptSensitiveData: false
      },

      notifications: {
        enabled: true,
        channels: {
          log: { enabled: true },
          console: { enabled: true }
        },
        events: {
          startup: true,
          shutdown: true,
          error: true,
          recovery: true,
          configChange: true,
          portConflict: true
        }
      },

      ui: {
        theme: {
          primaryColor: '#007bff',
          darkMode: false
        },
        dashboard: {
          refreshInterval: 5000,
          animationEnabled: true,
          showAdvancedMetrics: false
        },
        portManagement: {
          showPortUsageChart: true,
          showPerformanceMetrics: true,
          autoRefreshStatus: true
        }
      },

      recovery: {
        enabled: true,
        autoRecover: true,
        maxRetries: 3,
        retryDelay: 10000,
        checkInterval: 30000,
        strategies: {
          serviceRepair: { enabled: true, configReset: true, rebuildOnFailure: false },
          portCleanup: { enabled: true, forceKill: false, waitTime: 5000 },
          processRestart: { enabled: true, cooldownPeriod: 60000, maxAttempts: 3 }
        }
      },

      experimental: {
        features: {},
        flags: {}
      }
    };
  }
}
