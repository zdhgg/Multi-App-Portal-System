/**
 * Configuration Import/Export Service
 * 配置导入导出服务
 */

import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { AppConfigurationService } from './appConfigurationService';
import { EnvironmentManager } from './environmentManager';
import type { ConfigurationExport, AppConfiguration } from '../models/AppConfiguration';
import type { EnvironmentProfile, EnvironmentTemplate } from './environmentManager';

export interface ExportOptions {
  includeEnvironments: boolean;
  includeTemplates: boolean;
  includeSensitiveData: boolean;
  format: 'json' | 'yaml' | 'zip';
  appIds?: string[]; // 如果指定，只导出特定应用的配置
}

export interface ImportOptions {
  overwriteExisting: boolean;
  validateBeforeImport: boolean;
  mergeEnvironments: boolean;
  createBackup: boolean;
}

export interface ImportResult {
  success: boolean;
  importedConfigurations: number;
  importedEnvironments: number;
  importedTemplates: number;
  errors: Array<{
    type: 'configuration' | 'environment' | 'template';
    item: string;
    error: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
  }>;
}

export interface BackupInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  size: number;
  filePath: string;
  includedApps: string[];
  metadata: {
    configurationsCount: number;
    environmentsCount: number;
    templatesCount: number;
  };
}

export class ConfigurationExporter {
  private db: Database;
  private configService: AppConfigurationService;
  private environmentManager: EnvironmentManager;

  constructor(
    database: Database,
    configService: AppConfigurationService,
    environmentManager: EnvironmentManager
  ) {
    this.db = database;
    this.configService = configService;
    this.environmentManager = environmentManager;
    this.initializeDatabase();
  }

  /**
   * 初始化数据库
   */
  private initializeDatabase(): void {
    try {
      // 备份记录表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS configuration_backups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          file_path TEXT NOT NULL,
          size INTEGER NOT NULL,
          included_apps TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT
        )
      `);

      // 导入导出历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS import_export_history (
          id TEXT PRIMARY KEY,
          operation TEXT NOT NULL, -- 'export' | 'import' | 'backup'
          file_path TEXT,
          options_json TEXT,
          result_json TEXT,
          status TEXT NOT NULL, -- 'success' | 'failed' | 'partial'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          duration_ms INTEGER
        )
      `);

      logger.debug('Config exporter service initialized');
    } catch (error) {
      logger.error('Failed to initialize configuration exporter database', { error });
      throw error;
    }
  }

  /**
   * 导出配置
   */
  async exportConfigurations(options: ExportOptions, exportPath: string, createdBy?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting configuration export', { options, exportPath });

      const exportData: ConfigurationExport = {
        version: '1.0.0',
        exportedAt: new Date(),
        exportedBy: createdBy,
        configurations: [],
        templates: [],
        metadata: {
          sourceSystem: 'Intelligent Multi-App Portal System',
          sourceVersion: '2.0.0',
          totalConfigurations: 0
        }
      };

      // 导出应用配置
      if (options.appIds && options.appIds.length > 0) {
        // 导出指定应用的配置
        for (const appId of options.appIds) {
          const configs = await this.configService.getConfigurationsByAppId(appId);
          exportData.configurations.push(...configs);
        }
      } else {
        // 导出所有配置（需要实现获取所有配置的方法）
        const allConfigs = await this.getAllConfigurations();
        exportData.configurations = allConfigs;
      }

      // 处理敏感数据
      if (!options.includeSensitiveData) {
        exportData.configurations = this.sanitizeConfigurations(exportData.configurations);
      }

      // 导出环境配置
      if (options.includeEnvironments) {
        (exportData as any).environments = await this.exportEnvironments(options.appIds, options.includeSensitiveData);
      }

      // 导出模板
      if (options.includeTemplates) {
        (exportData as any).templates = await this.environmentManager.getTemplates();
        if (!options.includeSensitiveData) {
          (exportData as any).templates = this.sanitizeTemplates((exportData as any).templates);
        }
      }

      // 更新元数据
      exportData.metadata.totalConfigurations = exportData.configurations.length;

      // 写入文件
      switch (options.format) {
        case 'json':
          await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf-8');
          break;
        case 'yaml':
          // TODO: 实现YAML导出
          throw new Error('YAML export not yet implemented');
        case 'zip':
          // TODO: 实现ZIP压缩导出
          throw new Error('ZIP export not yet implemented');
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      // 记录导出历史
      await this.recordImportExportHistory(
        'export',
        exportPath,
        options,
        { success: true, exportedCount: exportData.configurations.length },
        'success',
        Date.now() - startTime,
        createdBy
      );

      logger.info('Configuration export completed', { 
        exportPath, 
        configurationsCount: exportData.configurations.length,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      logger.error('Configuration export failed', { error, options, exportPath });
      
      // 记录失败历史
      await this.recordImportExportHistory(
        'export',
        exportPath,
        options,
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        'failed',
        Date.now() - startTime,
        createdBy
      );
      
      throw error;
    }
  }

  /**
   * 导入配置
   */
  async importConfigurations(importPath: string, options: ImportOptions, createdBy?: string): Promise<ImportResult> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting configuration import', { importPath, options });

      // 读取导入文件
      const importContent = await fs.readFile(importPath, 'utf-8');
      const importData: ConfigurationExport = JSON.parse(importContent);

      const result: ImportResult = {
        success: true,
        importedConfigurations: 0,
        importedEnvironments: 0,
        importedTemplates: 0,
        errors: [],
        warnings: []
      };

      // 创建备份（如果需要）
      if (options.createBackup) {
        const backupPath = `${importPath}.backup.${Date.now()}.json`;
        await this.createBackup({
          includeEnvironments: true,
          includeTemplates: true,
          includeSensitiveData: true,
          format: 'json'
        }, backupPath, createdBy);
        
        result.warnings.push({
          type: 'backup',
          message: `Backup created at: ${backupPath}`
        });
      }

      // 验证导入数据
      if (options.validateBeforeImport) {
        const validationResult = await this.validateImportData(importData);
        if (!validationResult.isValid) {
          result.success = false;
          result.errors.push(...validationResult.errors.map(error => ({
            type: 'configuration' as const,
            item: error.field,
            error: error.message
          })));
        }
      }

      // 导入应用配置
      if (importData.configurations && importData.configurations.length > 0) {
        for (const config of importData.configurations) {
          try {
            // 检查是否已存在
            const existing = await this.configService.getConfigurationsByAppId(config.appId);
            
            if (existing.length > 0 && !options.overwriteExisting) {
              result.warnings.push({
                type: 'configuration',
                message: `Configuration for app ${config.appId} already exists and will be skipped`
              });
              continue;
            }

            // 创建或更新配置
            const configData = {
              ...config,
              createdBy: createdBy
            };
            delete (configData as any).id;
            delete (configData as any).createdAt;
            delete (configData as any).updatedAt;

            await this.configService.createConfiguration(configData);
            result.importedConfigurations++;
            
          } catch (error) {
            result.errors.push({
              type: 'configuration',
              item: config.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // 导入环境配置
      if ((importData as any).environments && (importData as any).environments.length > 0) {
        for (const env of (importData as any).environments) {
          try {
            const envData = {
              ...env,
              createdBy: createdBy
            };
            delete (envData as any).id;
            delete (envData as any).createdAt;
            delete (envData as any).updatedAt;

            await this.environmentManager.createProfile(envData);
            result.importedEnvironments++;
            
          } catch (error) {
            result.errors.push({
              type: 'environment',
              item: env.name,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // 导入模板
      if ((importData as any).templates && (importData as any).templates.length > 0) {
        result.importedTemplates = (importData as any).templates.length;
        result.warnings.push({
          type: 'template',
          message: 'Template import is not yet implemented'
        });
      }

      // 判断整体成功状态
      result.success = result.errors.length === 0;

      // 记录导入历史
      await this.recordImportExportHistory(
        'import',
        importPath,
        options,
        result,
        result.success ? 'success' : (result.importedConfigurations > 0 || result.importedEnvironments > 0 ? 'partial' : 'failed'),
        Date.now() - startTime,
        createdBy
      );

      logger.info('Configuration import completed', { 
        importPath, 
        result,
        duration: Date.now() - startTime 
      });

      return result;
    } catch (error) {
      logger.error('Configuration import failed', { error, importPath, options });
      
      const result: ImportResult = {
        success: false,
        importedConfigurations: 0,
        importedEnvironments: 0,
        importedTemplates: 0,
        errors: [{
          type: 'configuration' as const,
          item: 'import process',
          error: error instanceof Error ? error.message : 'Unknown error'
        }],
        warnings: []
      };

      // 记录失败历史
      await this.recordImportExportHistory(
        'import',
        importPath,
        options,
        result,
        'failed',
        Date.now() - startTime,
        createdBy
      );

      return result;
    }
  }

  /**
   * 创建备份
   */
  async createBackup(options: ExportOptions, backupPath?: string, createdBy?: string): Promise<BackupInfo> {
    try {
      const backupId = uuidv4();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const finalBackupPath = backupPath || path.join(process.cwd(), 'backups', `backup-${timestamp}.json`);

      // 确保备份目录存在
      const backupDir = path.dirname(finalBackupPath);
      await fs.mkdir(backupDir, { recursive: true });

      // 导出配置到备份文件
      await this.exportConfigurations(options, finalBackupPath, createdBy);

      // 获取文件大小
      const stats = await fs.stat(finalBackupPath);
      
      // 获取包含的应用列表
      const includedApps = options.appIds || await this.getAllAppIds();

      const backupInfo: BackupInfo = {
        id: backupId,
        name: `Backup ${timestamp}`,
        description: `Automatic backup created at ${new Date().toISOString()}`,
        createdAt: new Date(),
        size: stats.size,
        filePath: finalBackupPath,
        includedApps,
        metadata: {
          configurationsCount: 0, // TODO: 从实际导出数据获取
          environmentsCount: 0,
          templatesCount: 0
        }
      };

      // 保存备份记录
      const stmt = this.db.prepare(`
        INSERT INTO configuration_backups 
        (id, name, description, file_path, size, included_apps, metadata_json, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        backupId,
        backupInfo.name,
        backupInfo.description,
        finalBackupPath,
        stats.size,
        JSON.stringify(includedApps),
        JSON.stringify(backupInfo.metadata),
        backupInfo.createdAt.toISOString(),
        createdBy
      );

      logger.info('Backup created successfully', { backupId, filePath: finalBackupPath });
      
      return backupInfo;
    } catch (error) {
      logger.error('Failed to create backup', { error, options });
      throw error;
    }
  }

  /**
   * 获取备份列表
   */
  async getBackups(): Promise<BackupInfo[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM configuration_backups 
        ORDER BY created_at DESC
      `);
      
      const rows = stmt.all() as any[];
      
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: new Date(row.created_at),
        size: row.size,
        filePath: row.file_path,
        includedApps: JSON.parse(row.included_apps),
        metadata: JSON.parse(row.metadata_json)
      }));
    } catch (error) {
      logger.error('Failed to get backups', { error });
      return [];
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      // 获取备份信息
      const stmt = this.db.prepare('SELECT * FROM configuration_backups WHERE id = ?');
      const backup = stmt.get(backupId) as any;
      
      if (!backup) {
        throw new Error('Backup not found');
      }

      // 删除备份文件
      try {
        await fs.unlink(backup.file_path);
      } catch (error) {
        logger.warn('Failed to delete backup file', { error, filePath: backup.file_path });
      }

      // 删除数据库记录
      const deleteStmt = this.db.prepare('DELETE FROM configuration_backups WHERE id = ?');
      deleteStmt.run(backupId);

      logger.info('Backup deleted successfully', { backupId });
    } catch (error) {
      logger.error('Failed to delete backup', { error, backupId });
      throw error;
    }
  }

  /**
   * 验证导入数据
   */
  private async validateImportData(importData: ConfigurationExport): Promise<{
    isValid: boolean;
    errors: Array<{ field: string; message: string }>;
  }> {
    const errors: Array<{ field: string; message: string }> = [];

    // 版本兼容性检查
    if (!importData.version) {
      errors.push({ field: 'version', message: 'Import data version is missing' });
    }

    // 配置验证
    if (importData.configurations) {
      for (let i = 0; i < importData.configurations.length; i++) {
        const config = importData.configurations[i];
        
        if (!config.name) {
          errors.push({ field: `configurations[${i}].name`, message: 'Configuration name is required' });
        }
        
        if (!config.appId) {
          errors.push({ field: `configurations[${i}].appId`, message: 'Configuration appId is required' });
        }

        // 使用现有的验证方法
        try {
          const validation = await this.configService.validateConfiguration(config);
          if (!validation.isValid) {
            errors.push(...validation.errors.map(error => ({
              field: `configurations[${i}].${error.field}`,
              message: error.message
            })));
          }
        } catch (error) {
          errors.push({
            field: `configurations[${i}]`,
            message: 'Configuration validation failed'
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 记录导入导出历史
   */
  private async recordImportExportHistory(
    operation: string,
    filePath: string | undefined,
    options: any,
    result: any,
    status: string,
    durationMs: number,
    createdBy?: string
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO import_export_history 
        (id, operation, file_path, options_json, result_json, status, created_at, created_by, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        uuidv4(),
        operation,
        filePath,
        JSON.stringify(options),
        JSON.stringify(result),
        status,
        new Date().toISOString(),
        createdBy,
        durationMs
      );
    } catch (error) {
      logger.error('Failed to record import/export history', { error });
    }
  }

  /**
   * 清理敏感信息（配置）
   */
  private sanitizeConfigurations(configurations: AppConfiguration[]): AppConfiguration[] {
    return configurations.map(config => ({
      ...config,
      environmentVariables: config.environmentVariables.map(env => ({
        ...env,
        value: env.sensitive ? '***SENSITIVE_VALUE***' : env.value
      }))
    }));
  }

  /**
   * 清理敏感信息（模板）
   */
  private sanitizeTemplates(templates: EnvironmentTemplate[]): EnvironmentTemplate[] {
    return templates.map(template => ({
      ...template,
      variables: template.variables.map(variable => ({
        ...variable,
        value: variable.sensitive ? '***SENSITIVE_VALUE***' : variable.value
      }))
    }));
  }

  /**
   * 导出环境配置
   */
  private async exportEnvironments(appIds?: string[], includeSensitive?: boolean): Promise<EnvironmentProfile[]> {
    const environments: EnvironmentProfile[] = [];
    
    if (appIds && appIds.length > 0) {
      for (const appId of appIds) {
        const profiles = await this.environmentManager.getProfilesByAppId(appId);
        environments.push(...profiles);
      }
    } else {
      // TODO: 实现获取所有环境配置的方法
    }

    if (!includeSensitive) {
      return environments.map(env => ({
        ...env,
        variables: env.variables.map(variable => ({
          ...variable,
          value: variable.sensitive ? '***SENSITIVE_VALUE***' : variable.value
        }))
      }));
    }

    return environments;
  }

  /**
   * 获取所有配置（需要实现）
   */
  private async getAllConfigurations(): Promise<AppConfiguration[]> {
    // TODO: 实现获取所有配置的方法
    return [];
  }

  /**
   * 获取所有应用ID
   */
  private async getAllAppIds(): Promise<string[]> {
    try {
      const stmt = this.db.prepare('SELECT DISTINCT app_id FROM app_configurations');
      const rows = stmt.all() as any[];
      return rows.map(row => row.app_id);
    } catch (error) {
      logger.error('Failed to get all app IDs', { error });
      return [];
    }
  }
}