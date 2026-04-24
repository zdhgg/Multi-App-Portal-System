/**
 * Configuration Import/Export Service
 * 配置导入导出服务
 */

import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { createWriteStream } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import fg from 'fast-glob';
import { logger } from '../utils/logger';
import { getSystemConfigFilePath } from '../utils/systemConfigPath.js';
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

export interface BackupCreateOptions extends ExportOptions {
  mode?: 'configuration' | 'archive';
  backupName?: string;
  outputDirectory?: string;
  archiveType?: 'full' | 'incremental' | 'config' | 'logs' | 'api' | 'custom';
  includePaths?: string[];
  excludePaths?: string[];
  compress?: boolean;
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
  restoredFiles?: number;
  restoreSource?: BackupInfo['source'];
  restoreType?: string;
  errors: Array<{
    type: 'configuration' | 'environment' | 'template' | 'file';
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
  originalFilePath?: string;
  includedApps: string[];
  source: 'configuration-export' | 'script-registry';
  backupType: string;
  format: 'json' | 'zip' | 'directory';
  metadata: {
    configurationsCount: number;
    environmentsCount: number;
    templatesCount: number;
    creator?: string;
    systemVersion?: string;
    version?: string;
    machine?: string;
  };
  status?: string;
  compressed?: boolean;
  checksum?: string;
  filesCount?: number;
  includedFiles?: string[];
  available?: boolean;
}

interface ExportSummary {
  configurationsCount: number;
  environmentsCount: number;
  templatesCount: number;
  includedApps: string[];
}

interface LegacyBackupRegistry {
  version?: string;
  lastUpdated?: string;
  backups: LegacyBackupEntry[];
  statistics?: {
    totalBackups: number;
    successfulBackups: number;
    failedBackups: number;
    lastBackup: string | null;
    totalSize: number;
  };
}

interface LegacyBackupEntry {
  id: string;
  name: string;
  type?: string;
  path: string;
  size?: number;
  compressed?: boolean;
  createdAt?: string;
  description?: string;
  status?: string;
  checksum?: string;
  filesCount?: number;
  includedFiles?: string[];
  metadata?: {
    creator?: string;
    systemVersion?: string;
    version?: string;
    machine?: string;
  };
}

interface ArchiveBackupConfig {
  version: string;
  lastUpdated: string;
  settings: {
    defaultBackupPath: string;
    maxBackupRetention: number;
    compressionEnabled: boolean;
    verificationEnabled: boolean;
    incrementalEnabled: boolean;
    scheduleEnabled: boolean;
  };
  paths: {
    configs: string[];
    logs: string[];
    data: string[];
    scripts: string[];
    exclude: string[];
  };
}

const execFileAsync = promisify(execFile);

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
  async exportConfigurations(options: ExportOptions, exportPath: string, createdBy?: string): Promise<ExportSummary> {
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

      const environments = ((exportData as any).environments || []) as EnvironmentProfile[];
      const templates = ((exportData as any).templates || []) as EnvironmentTemplate[];

      // 更新元数据
      exportData.metadata.totalConfigurations = exportData.configurations.length;

      const includedApps = Array.from(new Set([
        ...exportData.configurations.map(config => config.appId),
        ...environments.map(env => env.appId)
      ]));

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

      return {
        configurationsCount: exportData.configurations.length,
        environmentsCount: environments.length,
        templatesCount: templates.length,
        includedApps: includedApps.length > 0 ? includedApps : (options.appIds || [])
      };
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

      // 验证通过后再创建恢复前备份，避免无效文件产生额外备份
      if (options.createBackup) {
        const backupPath = `${importPath}.backup.${Date.now()}.json`;
        const backupInfo = await this.createBackup({
          includeEnvironments: true,
          includeTemplates: true,
          includeSensitiveData: true,
          format: 'json'
        }, backupPath, createdBy);
        
        result.warnings.push({
          type: 'backup',
          message: `Backup created at: ${backupInfo.filePath}`
        });
      }

      const hasImportWork = Boolean(
        (importData.configurations && importData.configurations.length > 0) ||
        ((importData as any).environments && (importData as any).environments.length > 0)
      );
      let transactionStarted = false;

      if (hasImportWork) {
        this.db.exec('BEGIN');
        transactionStarted = true;
      }

      // 导入应用配置
      if (importData.configurations && importData.configurations.length > 0) {
        for (const config of importData.configurations) {
          try {
            const configData = this.normalizeImportedConfiguration(config, createdBy);

            // 检查是否已存在
            const existing = await this.configService.getConfigurationsByAppId(configData.appId);
            
            if (existing.length > 0 && !options.overwriteExisting) {
              result.warnings.push({
                type: 'configuration',
                message: `Configuration for app ${configData.appId} already exists and will be skipped`
              });
              continue;
            }

            if (existing.length > 0) {
              const matchedConfiguration = existing.find(item => item.name === configData.name) || existing[0];
              await this.configService.updateConfiguration(matchedConfiguration.id, configData, createdBy);
            } else {
              await this.configService.createConfiguration(configData);
            }
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
            const envData = this.normalizeImportedEnvironmentProfile(env, createdBy);
            const existingProfiles = await this.environmentManager.getProfilesByAppId(envData.appId);
            const matchedProfile = existingProfiles.find(profile => profile.name === envData.name);

            if (matchedProfile && !options.overwriteExisting) {
              result.warnings.push({
                type: 'environment',
                message: `Environment profile ${envData.name} for app ${envData.appId} already exists and will be skipped`
              });
              continue;
            }

            if (matchedProfile) {
              const profileUpdates = options.mergeEnvironments
                ? this.mergeEnvironmentProfile(matchedProfile, envData)
                : envData;
              await this.environmentManager.updateProfile(matchedProfile.id, profileUpdates);
            } else {
              await this.environmentManager.createProfile(envData);
            }
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
        result.warnings.push({
          type: 'template',
          message: 'Template import is not yet implemented'
        });
      }

      if (transactionStarted) {
        if (result.errors.length > 0) {
          this.db.exec('ROLLBACK');
          transactionStarted = false;
          result.importedConfigurations = 0;
          result.importedEnvironments = 0;
          result.importedTemplates = 0;
          result.warnings.push({
            type: 'transaction',
            message: 'Import changes were rolled back because one or more items failed to import'
          });
        } else {
          this.db.exec('COMMIT');
          transactionStarted = false;
        }
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
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors when no transaction is active
      }
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
  async createBackup(options: BackupCreateOptions, backupPath?: string, createdBy?: string): Promise<BackupInfo> {
    if (options.mode === 'archive') {
      return this.createArchiveBackup(options, backupPath, createdBy);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = this.resolveBackupName(options.backupName, `backup-${timestamp}`);
    const exportOptions: ExportOptions = {
      includeEnvironments: options.includeEnvironments ?? true,
      includeTemplates: options.includeTemplates ?? true,
      includeSensitiveData: options.includeSensitiveData ?? false,
      format: options.format || 'json',
      appIds: options.appIds
    };

    try {
      const backupId = uuidv4();
      const outputDirectory = this.resolveBackupOutputDirectory(
        options.outputDirectory,
        path.join(this.getWorkspaceRoot(), 'backups')
      );
      const finalBackupPath = backupPath || path.join(outputDirectory, this.ensureFileExtension(backupName, '.json'));

      // 确保备份目录存在
      const backupDir = path.dirname(finalBackupPath);
      await fs.mkdir(backupDir, { recursive: true });

      // 导出配置到备份文件
      const exportSummary = await this.exportConfigurations(exportOptions, finalBackupPath, createdBy);

      // 获取文件大小
      const stats = await fs.stat(finalBackupPath);

      const backupInfo: BackupInfo = {
        id: backupId,
        name: backupName,
        description: `Automatic backup created at ${new Date().toISOString()}`,
        createdAt: new Date(),
        size: stats.size,
        filePath: finalBackupPath,
        source: 'configuration-export',
        backupType: 'config-export',
        format: 'json',
        includedApps: exportSummary.includedApps.length > 0 ? exportSummary.includedApps : await this.getAllAppIds(),
        metadata: {
          configurationsCount: exportSummary.configurationsCount,
          environmentsCount: exportSummary.environmentsCount,
          templatesCount: exportSummary.templatesCount
        },
        status: 'completed',
        compressed: false,
        filesCount: exportSummary.configurationsCount + exportSummary.environmentsCount + exportSummary.templatesCount,
        available: true
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
        JSON.stringify(backupInfo.includedApps),
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
    const backups: BackupInfo[] = [];

    try {
      backups.push(...await this.getDatabaseBackups());
    } catch (error) {
      logger.error('Failed to get database backups', { error });
    }

    try {
      backups.push(...await this.getLegacyRegistryBackups());
    } catch (error) {
      logger.error('Failed to get legacy registry backups', { error });
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupId: string): Promise<void> {
    const databaseBackup = this.getDatabaseBackupRow(backupId);
    if (databaseBackup) {
      try {
        await fs.unlink(databaseBackup.file_path);
      } catch (error) {
        logger.warn('Failed to delete backup file', { error, filePath: databaseBackup.file_path });
      }

      const deleteStmt = this.db.prepare('DELETE FROM configuration_backups WHERE id = ?');
      deleteStmt.run(backupId);
      logger.info('Database backup deleted successfully', { backupId });
      return;
    }

    const registry = await this.readLegacyBackupRegistry();
    const index = registry.backups.findIndex(backup => backup.id === backupId);
    if (index === -1) {
      throw new Error('Backup not found');
    }

    const legacyBackup = registry.backups[index];
    const resolvedPath = await this.resolveLegacyBackupPath(legacyBackup.path);

    try {
      if (resolvedPath && await this.pathExists(resolvedPath)) {
        await fs.rm(resolvedPath, { recursive: true, force: false });
      }
    } catch (error) {
      logger.warn('Failed to delete legacy backup file', {
        error,
        filePath: resolvedPath || legacyBackup.path
      });
    }

    registry.backups.splice(index, 1);
    this.recalculateLegacyRegistryStatistics(registry);
    await this.writeLegacyBackupRegistry(registry);
    logger.info('Legacy backup deleted successfully', { backupId, filePath: resolvedPath || legacyBackup.path });
  }

  async restoreBackup(
    backupId: string,
    options: ImportOptions,
    createdBy?: string
  ): Promise<ImportResult> {
    const backup = await this.getBackupById(backupId);

    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.source === 'configuration-export') {
      return this.importConfigurations(backup.filePath, options, createdBy);
    }

    return this.restoreLegacyBackup(backup, options, createdBy);
  }

  async cleanupBackups(retentionDays: number): Promise<{ deletedCount: number }> {
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const backups = await this.getBackups();
    let deletedCount = 0;

    for (const backup of backups) {
      if (backup.createdAt.getTime() >= cutoffTime) {
        continue;
      }

      try {
        await this.deleteBackup(backup.id);
        deletedCount++;
      } catch (error) {
        logger.warn('Failed to cleanup expired backup', {
          backupId: backup.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (deletedCount > 0) {
      logger.info('Expired backups cleaned up', { deletedCount, retentionDays });
    }

    return { deletedCount };
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
    let environments: EnvironmentProfile[] = [];
    
    if (appIds && appIds.length > 0) {
      for (const appId of appIds) {
        const profiles = await this.environmentManager.getProfilesByAppId(appId);
        environments.push(...profiles);
      }
    } else {
      environments = await this.environmentManager.getAllProfiles();
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
    return this.configService.getAllConfigurations();
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

  private async createArchiveBackup(
    options: BackupCreateOptions,
    backupPath?: string,
    createdBy?: string
  ): Promise<BackupInfo> {
    const config = await this.getArchiveBackupConfig();
    const archiveType = options.archiveType || 'full';
    const compress = options.compress ?? config.settings.compressionEnabled;
    const files = await this.collectArchiveBackupFiles(
      archiveType,
      config,
      options.includePaths || [],
      options.excludePaths || []
    );

    if (files.length === 0) {
      throw new Error(`No files were found for archive backup type: ${archiveType}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = this.resolveBackupName(options.backupName, `${archiveType}-backup-${timestamp}`);
    const outputDirectory = this.resolveBackupOutputDirectory(
      options.outputDirectory,
      config.settings.defaultBackupPath
    );
    const basePath = backupPath || path.join(outputDirectory, backupName);
    const finalBackupPath = compress
      ? (basePath.toLowerCase().endsWith('.zip') ? basePath : `${basePath}.zip`)
      : basePath;

    await fs.mkdir(path.dirname(finalBackupPath), { recursive: true });

    let totalSize = 0;
    if (compress) {
      await this.createZipArchive(files, finalBackupPath);
      totalSize = (await fs.stat(finalBackupPath)).size;
    } else {
      totalSize = await this.copyFilesToDirectory(files, finalBackupPath);
    }

    const checksum = compress ? await this.computeFileChecksum(finalBackupPath) : undefined;
    const registry = await this.readLegacyBackupRegistry();

    const entry: LegacyBackupEntry = {
      id: uuidv4(),
      name: backupName,
      type: archiveType,
      path: finalBackupPath,
      size: totalSize,
      compressed: compress,
      createdAt: new Date().toISOString(),
      description: `Archive backup created from current workspace (${archiveType})`,
      status: 'completed',
      checksum,
      filesCount: files.length,
      includedFiles: files.map(file => file.absolutePath),
      metadata: {
        creator: createdBy || process.env.USERNAME || 'system',
        machine: process.env.COMPUTERNAME,
        systemVersion: os.release(),
        version: registry.version || config.version
      }
    };

    registry.backups.push(entry);
    this.recalculateLegacyRegistryStatistics(registry);
    await this.writeLegacyBackupRegistry(registry);

    logger.info('Archive backup created successfully', {
      backupId: entry.id,
      archiveType,
      filePath: finalBackupPath,
      filesCount: files.length
    });

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      createdAt: new Date(entry.createdAt),
      size: totalSize,
      filePath: finalBackupPath,
      source: 'script-registry',
      backupType: archiveType,
      format: compress ? 'zip' : 'directory',
      includedApps: [],
      metadata: {
        configurationsCount: 0,
        environmentsCount: 0,
        templatesCount: 0,
        creator: entry.metadata?.creator,
        systemVersion: entry.metadata?.systemVersion,
        version: entry.metadata?.version,
        machine: entry.metadata?.machine
      },
      status: entry.status,
      compressed: compress,
      checksum,
      filesCount: files.length,
      includedFiles: files.map(file => file.absolutePath),
      available: true
    };
  }

  private async getArchiveBackupConfig(): Promise<ArchiveBackupConfig> {
    const configPath = this.getLegacyBackupConfigPath();
    const defaultConfig = this.createDefaultArchiveBackupConfig();
    let config = defaultConfig;
    let shouldWrite = false;

    if (await this.pathExists(configPath)) {
      try {
        const parsed = JSON.parse(await fs.readFile(configPath, 'utf-8')) as Partial<ArchiveBackupConfig>;
        config = {
          version: parsed.version || defaultConfig.version,
          lastUpdated: parsed.lastUpdated || defaultConfig.lastUpdated,
          settings: {
            ...defaultConfig.settings,
            ...(parsed.settings || {})
          },
          paths: {
            ...defaultConfig.paths,
            ...(parsed.paths || {}),
            configs: Array.isArray(parsed.paths?.configs) ? parsed.paths.configs : defaultConfig.paths.configs,
            logs: Array.isArray(parsed.paths?.logs) ? parsed.paths.logs : defaultConfig.paths.logs,
            data: Array.isArray(parsed.paths?.data) ? parsed.paths.data : defaultConfig.paths.data,
            scripts: Array.isArray(parsed.paths?.scripts) ? parsed.paths.scripts : defaultConfig.paths.scripts,
            exclude: Array.isArray(parsed.paths?.exclude) ? parsed.paths.exclude : defaultConfig.paths.exclude
          }
        };
      } catch (error) {
        logger.warn('Failed to parse backup-config.json, fallback to defaults', { error });
        shouldWrite = true;
      }
    } else {
      shouldWrite = true;
    }

    const normalizedBackupPath = await this.normalizeArchiveBackupPath(config.settings.defaultBackupPath);
    if (path.normalize(config.settings.defaultBackupPath) !== path.normalize(normalizedBackupPath)) {
      config.settings.defaultBackupPath = normalizedBackupPath;
      shouldWrite = true;
    }

    await fs.mkdir(config.settings.defaultBackupPath, { recursive: true });

    if (shouldWrite) {
      config.lastUpdated = new Date().toISOString();
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }

    return config;
  }

  private createDefaultArchiveBackupConfig(): ArchiveBackupConfig {
    return {
      version: '2.0.0',
      lastUpdated: new Date().toISOString(),
      settings: {
        defaultBackupPath: path.join(this.getWorkspaceRoot(), 'backups', 'data'),
        maxBackupRetention: 30,
        compressionEnabled: true,
        verificationEnabled: true,
        incrementalEnabled: true,
        scheduleEnabled: false
      },
      paths: {
        configs: [
          'configs/system-config.json',
          'configs/api-config.json',
          'configs/api-registry.json',
          'detection-api/configs/portal-config.json'
        ],
        logs: [
          'logs/*.log',
          'detection-api/logs/*.log'
        ],
        data: [
          'detection-api/data/*'
        ],
        scripts: [
          '*.ps1',
          'ecosystem.config.js',
          'package.json'
        ],
        exclude: [
          'node_modules/**',
          '*.tmp',
          '*.temp',
          '.git/**'
        ]
      }
    };
  }

  private async normalizeArchiveBackupPath(candidatePath: string): Promise<string> {
    const currentDefaultPath = path.join(this.getWorkspaceRoot(), 'backups', 'data');
    if (!candidatePath || candidatePath.trim() === '') {
      return currentDefaultPath;
    }

    const normalizedCandidate = path.normalize(candidatePath);
    if (path.normalize(normalizedCandidate) === path.normalize(currentDefaultPath)) {
      return currentDefaultPath;
    }

    if (this.isLikelyStaleGeneratedBackupPath(normalizedCandidate)) {
      return currentDefaultPath;
    }

    return normalizedCandidate;
  }

  private resolveBackupName(candidateName: string | undefined, fallbackName: string): string {
    const trimmed = typeof candidateName === 'string' ? candidateName.trim() : '';
    if (!trimmed) {
      return fallbackName;
    }

    const sanitized = path.basename(trimmed).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim().replace(/[. ]+$/g, '');
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      return fallbackName;
    }

    return sanitized;
  }

  private ensureFileExtension(fileName: string, extension: string): string {
    return fileName.toLowerCase().endsWith(extension.toLowerCase()) ? fileName : `${fileName}${extension}`;
  }

  private resolveBackupOutputDirectory(outputDirectory: string | undefined, fallbackPath: string): string {
    const normalizedCandidate = typeof outputDirectory === 'string' ? outputDirectory.trim() : '';
    const selectedPath = normalizedCandidate || fallbackPath;

    return path.isAbsolute(selectedPath)
      ? path.resolve(selectedPath)
      : path.resolve(this.getWorkspaceRoot(), selectedPath);
  }

  private isLikelyStaleGeneratedBackupPath(candidatePath: string): boolean {
    const normalizedCandidate = path.normalize(candidatePath).toLowerCase();
    const normalizedCurrentRoot = path.normalize(this.getWorkspaceRoot()).toLowerCase();

    if (normalizedCandidate.startsWith(normalizedCurrentRoot)) {
      return false;
    }

    if (/intelligent multi-app portal systemv\d/i.test(candidatePath)) {
      return true;
    }

    return normalizedCandidate.endsWith(path.normalize(path.join('backups', 'data')).toLowerCase());
  }

  private async collectArchiveBackupFiles(
    archiveType: BackupCreateOptions['archiveType'],
    config: ArchiveBackupConfig,
    includePaths: string[],
    excludePaths: string[]
  ): Promise<Array<{ relativeFile: string; absolutePath: string }>> {
    const basePatterns = this.getArchivePatternsByType(archiveType, config);
    const positivePatterns = [...basePatterns, ...includePaths]
      .map(pattern => this.normalizePatternForGlob(pattern))
      .filter(Boolean);
    const ignorePatterns = [...config.paths.exclude, ...excludePaths]
      .map(pattern => this.normalizePatternForGlob(pattern))
      .filter(Boolean);

    const matchedPaths = await fg(positivePatterns, {
      cwd: this.getWorkspaceRoot(),
      onlyFiles: true,
      absolute: true,
      dot: true,
      unique: true,
      suppressErrors: true,
      followSymbolicLinks: false,
      ignore: ignorePatterns
    });

    const uniqueFiles = new Map<string, { relativeFile: string; absolutePath: string }>();
    for (const matchedPath of matchedPaths) {
      const normalizedAbsolute = path.normalize(matchedPath);
      if (!normalizedAbsolute.startsWith(path.normalize(this.getWorkspaceRoot()))) {
        continue;
      }

      const relativeFile = path.relative(this.getWorkspaceRoot(), normalizedAbsolute);
      if (!relativeFile || relativeFile.startsWith('..') || path.isAbsolute(relativeFile)) {
        continue;
      }

      uniqueFiles.set(relativeFile.toLowerCase(), {
        relativeFile,
        absolutePath: normalizedAbsolute
      });
    }

    return Array.from(uniqueFiles.values()).sort((left, right) => left.relativeFile.localeCompare(right.relativeFile));
  }

  private getArchivePatternsByType(
    archiveType: BackupCreateOptions['archiveType'],
    config: ArchiveBackupConfig
  ): string[] {
    switch (archiveType) {
      case 'config':
        return [...config.paths.configs];
      case 'logs':
        return [...config.paths.logs];
      case 'api':
        return ['configs/api-config.json', 'configs/api-registry.json'];
      case 'custom':
        return [];
      case 'incremental':
      case 'full':
      default:
        return [
          ...config.paths.configs,
          ...config.paths.logs,
          ...config.paths.data,
          ...config.paths.scripts
        ];
    }
  }

  private normalizePatternForGlob(pattern: string): string {
    return pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  private async copyFilesToDirectory(
    files: Array<{ relativeFile: string; absolutePath: string }>,
    destinationRoot: string
  ): Promise<number> {
    await fs.rm(destinationRoot, { recursive: true, force: true });
    await fs.mkdir(destinationRoot, { recursive: true });

    let totalSize = 0;
    for (const file of files) {
      const destinationPath = path.join(destinationRoot, file.relativeFile);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(file.absolutePath, destinationPath);
      totalSize += (await fs.stat(file.absolutePath)).size;
    }

    return totalSize;
  }

  private async getDatabaseBackups(): Promise<BackupInfo[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM configuration_backups
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];

    return Promise.all(rows.map(async row => {
      const available = await this.pathExists(row.file_path);
      return this.mapDatabaseBackupRow(row, available);
    }));
  }

  private getDatabaseBackupRow(backupId: string): any | undefined {
    const stmt = this.db.prepare('SELECT * FROM configuration_backups WHERE id = ?');
    return stmt.get(backupId) as any;
  }

  private async getBackupById(backupId: string): Promise<BackupInfo | null> {
    const databaseBackup = this.getDatabaseBackupRow(backupId);
    if (databaseBackup) {
      return this.mapDatabaseBackupRow(databaseBackup, await this.pathExists(databaseBackup.file_path));
    }

    const legacyBackups = await this.getLegacyRegistryBackups();
    return legacyBackups.find(backup => backup.id === backupId) || null;
  }

  private mapDatabaseBackupRow(row: any, available: boolean): BackupInfo {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: new Date(row.created_at),
      size: row.size,
      filePath: row.file_path,
      source: 'configuration-export' as const,
      backupType: 'config-export',
      format: 'json' as const,
      includedApps: JSON.parse(row.included_apps),
      metadata: JSON.parse(row.metadata_json),
      status: available ? 'completed' : 'missing',
      compressed: false,
      available
    };
  }

  private async getLegacyRegistryBackups(): Promise<BackupInfo[]> {
    const registry = await this.readLegacyBackupRegistry();
    const backups: BackupInfo[] = [];

    for (const entry of registry.backups || []) {
      const resolvedPath = await this.resolveLegacyBackupPath(entry.path);
      const available = resolvedPath ? await this.pathExists(resolvedPath) : false;

      backups.push({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(0),
        size: entry.size || 0,
        filePath: resolvedPath || entry.path,
        originalFilePath: entry.path,
        source: 'script-registry',
        backupType: entry.type || 'custom',
        format: this.detectLegacyBackupFormat(entry, resolvedPath || entry.path),
        includedApps: [],
        metadata: {
          configurationsCount: 0,
          environmentsCount: 0,
          templatesCount: 0,
          creator: entry.metadata?.creator,
          systemVersion: entry.metadata?.systemVersion,
          version: entry.metadata?.version,
          machine: entry.metadata?.machine
        },
        status: entry.status,
        compressed: entry.compressed,
        checksum: entry.checksum,
        filesCount: entry.filesCount,
        includedFiles: entry.includedFiles || [],
        available
      });
    }

    return backups;
  }

  private detectLegacyBackupFormat(
    entry: LegacyBackupEntry,
    filePath: string
  ): BackupInfo['format'] {
    if (entry.compressed || filePath.toLowerCase().endsWith('.zip')) {
      return 'zip';
    }

    if (filePath.toLowerCase().endsWith('.json')) {
      return 'json';
    }

    return 'directory';
  }

  private async restoreLegacyBackup(
    backup: BackupInfo,
    options: ImportOptions,
    createdBy?: string
  ): Promise<ImportResult> {
    if (!backup.available) {
      throw new Error(`Legacy backup file is unavailable: ${backup.filePath}`);
    }

    const startTime = Date.now();
    const extractedDir = await this.prepareLegacyRestoreSource(backup);

    try {
      const relativeFiles = await this.collectRelativeFiles(extractedDir);
      if (relativeFiles.length === 0) {
        throw new Error('Legacy backup archive does not contain restorable files');
      }

      const result: ImportResult = {
        success: true,
        importedConfigurations: 0,
        importedEnvironments: 0,
        importedTemplates: 0,
        restoredFiles: 0,
        restoreSource: backup.source,
        restoreType: backup.backupType,
        errors: [],
        warnings: []
      };

      if (options.createBackup) {
        const preRestoreBackup = await this.createLegacyPreRestoreBackup(relativeFiles, backup, createdBy);
        if (preRestoreBackup) {
          result.warnings.push({
            type: 'backup',
            message: `Pre-restore archive created at: ${preRestoreBackup.filePath}`
          });
        } else {
          result.warnings.push({
            type: 'backup',
            message: 'Pre-restore archive was skipped because no current files matched the restore payload'
          });
        }
      }

      for (const relativeFile of relativeFiles) {
        const sourcePath = path.join(extractedDir, relativeFile);
        const destinationPath = this.resolveProjectRelativePath(relativeFile);
        const liveDatabaseMessage = this.getLiveDatabaseRestoreBlockMessage(destinationPath);
        if (liveDatabaseMessage) {
          result.errors.push({
            type: 'file',
            item: relativeFile,
            error: liveDatabaseMessage
          });
          continue;
        }

        try {
          await fs.mkdir(path.dirname(destinationPath), { recursive: true });
          await fs.copyFile(sourcePath, destinationPath);
          result.restoredFiles = (result.restoredFiles || 0) + 1;
        } catch (error) {
          result.errors.push({
            type: 'file',
            item: relativeFile,
            error: this.formatLegacyRestoreFileError(relativeFile, destinationPath, error)
          });
        }
      }

      result.success = result.errors.length === 0;
      const restoreStatus = result.success
        ? 'success'
        : ((result.restoredFiles || 0) > 0 ? 'partial' : 'failed');

      if (!result.success) {
        const blockedDatabaseFiles = result.errors.filter(error => error.error.includes('数据库文件'));
        if (blockedDatabaseFiles.length > 0) {
          result.warnings.push({
            type: 'restore',
            message: `已跳过 ${blockedDatabaseFiles.length} 个正在使用中的数据库文件。若要完整恢复数据库，请先停止 Detection API 或整个门户服务，再执行离线恢复。`
          });
        }
      }

      await this.recordImportExportHistory(
        'import',
        backup.filePath,
        { ...options, backupSource: backup.source, backupType: backup.backupType },
        result,
        restoreStatus,
        Date.now() - startTime,
        createdBy
      );

      const logPayload = {
        backupId: backup.id,
        backupType: backup.backupType,
        restoredFiles: result.restoredFiles || 0,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length
      };

      if (result.success) {
        logger.info('Legacy backup restored successfully', logPayload);
      } else {
        logger.warn('Legacy backup restore completed with warnings', logPayload);
      }

      return result;
    } finally {
      if (path.normalize(extractedDir) !== path.normalize(backup.filePath)) {
        await fs.rm(extractedDir, { recursive: true, force: true });
      }
    }
  }

  private async prepareLegacyRestoreSource(backup: BackupInfo): Promise<string> {
    if (backup.format === 'directory') {
      return backup.filePath;
    }

    if (backup.format !== 'zip') {
      throw new Error(`Unsupported legacy backup format: ${backup.format}`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'portal-legacy-restore-'));
    await this.expandZipArchive(backup.filePath, tempDir);
    return tempDir;
  }

  private async collectRelativeFiles(rootDir: string): Promise<string[]> {
    const relativeFiles: string[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        const relativePath = path.relative(rootDir, fullPath);
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
          continue;
        }

        relativeFiles.push(relativePath);
      }
    };

    await walk(rootDir);
    return relativeFiles;
  }

  private resolveProjectRelativePath(relativeFile: string): string {
    const normalizedRelative = path.normalize(relativeFile);
    if (!normalizedRelative || normalizedRelative.startsWith('..') || path.isAbsolute(normalizedRelative)) {
      throw new Error(`Unsafe restore path detected: ${relativeFile}`);
    }

    return path.join(this.getWorkspaceRoot(), normalizedRelative);
  }

  private getLiveDatabaseRestoreBlockMessage(destinationPath: string): string | null {
    const currentDatabasePath = typeof this.db.name === 'string' ? this.db.name : '';
    if (!currentDatabasePath || currentDatabasePath === ':memory:') {
      return null;
    }

    const normalizedDestination = path.normalize(destinationPath).toLowerCase();
    const normalizedDatabase = path.normalize(currentDatabasePath).toLowerCase();
    const blockedTargets = new Set([
      normalizedDatabase,
      `${normalizedDatabase}-wal`,
      `${normalizedDatabase}-shm`
    ]);

    if (!blockedTargets.has(normalizedDestination)) {
      return null;
    }

    return `数据库文件当前正被 Detection API 使用，无法在服务运行中覆盖：${destinationPath}。如需完整恢复数据库，请先停止 Detection API 或整个门户服务，再执行离线恢复。`;
  }

  private formatLegacyRestoreFileError(relativeFile: string, destinationPath: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `恢复文件失败（${relativeFile} -> ${destinationPath}）：${message}`;
  }

  private async createLegacyPreRestoreBackup(
    relativeFiles: string[],
    backup: BackupInfo,
    createdBy?: string
  ): Promise<BackupInfo | null> {
    const filesToArchive = relativeFiles
      .map(relativeFile => ({
        relativeFile,
        absolutePath: this.resolveProjectRelativePath(relativeFile)
      }))
      .filter(file => path.normalize(file.absolutePath).startsWith(path.normalize(this.getWorkspaceRoot())));

    const existingFiles: Array<{ relativeFile: string; absolutePath: string }> = [];
    for (const file of filesToArchive) {
      if (await this.pathExists(file.absolutePath)) {
        existingFiles.push(file);
      }
    }

    if (existingFiles.length === 0) {
      return null;
    }

    const backupDir = path.join(this.getWorkspaceRoot(), 'backups', 'data');
    await fs.mkdir(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `pre-restore-${backup.backupType}-${timestamp}`;
    const archivePath = path.join(backupDir, `${backupName}.zip`);
    await this.createZipArchive(existingFiles, archivePath);

    const stats = await fs.stat(archivePath);
    const checksum = await this.computeFileChecksum(archivePath);
    const registry = await this.readLegacyBackupRegistry();

    const entry: LegacyBackupEntry = {
      id: uuidv4(),
      name: backupName,
      type: backup.backupType,
      path: archivePath,
      size: stats.size,
      compressed: true,
      createdAt: new Date().toISOString(),
      description: `Pre-restore backup created before restoring ${backup.name}`,
      status: 'completed',
      checksum,
      filesCount: existingFiles.length,
      includedFiles: existingFiles.map(file => file.absolutePath),
      metadata: {
        creator: createdBy || process.env.USERNAME || 'system',
        machine: process.env.COMPUTERNAME,
        version: registry.version || '2.0.0'
      }
    };

    registry.backups.push(entry);
    this.recalculateLegacyRegistryStatistics(registry);
    await this.writeLegacyBackupRegistry(registry);

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      createdAt: new Date(entry.createdAt),
      size: entry.size || 0,
      filePath: archivePath,
      source: 'script-registry',
      backupType: entry.type || backup.backupType,
      format: 'zip',
      includedApps: [],
      metadata: {
        configurationsCount: 0,
        environmentsCount: 0,
        templatesCount: 0,
        creator: entry.metadata?.creator,
        machine: entry.metadata?.machine,
        version: entry.metadata?.version
      },
      status: entry.status,
      compressed: true,
      checksum,
      filesCount: existingFiles.length,
      includedFiles: existingFiles.map(file => file.absolutePath),
      available: true
    };
  }

  private async createZipArchive(
    files: Array<{ relativeFile: string; absolutePath: string }>,
    archivePath: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(archivePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);

      archive.pipe(output);

      for (const file of files) {
        archive.file(file.absolutePath, { name: file.relativeFile.replace(/\\/g, '/') });
      }

      void archive.finalize();
    });
  }

  private async computeFileChecksum(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return createHash('sha256').update(buffer).digest('hex').toUpperCase();
  }

  private async expandZipArchive(archivePath: string, destinationPath: string): Promise<void> {
    const script = `
$ErrorActionPreference = 'Stop'
$source = ${this.toPowerShellStringLiteral(archivePath)}
$destination = ${this.toPowerShellStringLiteral(destinationPath)}
if (Test-Path -LiteralPath $destination) {
  Remove-Item -LiteralPath $destination -Recurse -Force
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Expand-Archive -LiteralPath $source -DestinationPath $destination -Force
`;

    const shells = process.platform === 'win32'
      ? ['pwsh.exe', 'powershell.exe']
      : ['pwsh', 'powershell'];

    let lastError: unknown;

    for (const shell of shells) {
      try {
        await execFileAsync(shell, ['-NoProfile', '-Command', script], { windowsHide: true });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to expand archive: ${archivePath}`);
  }

  private async readLegacyBackupRegistry(): Promise<LegacyBackupRegistry> {
    const registryPath = this.getLegacyRegistryPath();

    if (!await this.pathExists(registryPath)) {
      return {
        version: '2.0.0',
        lastUpdated: new Date().toISOString(),
        backups: [],
        statistics: {
          totalBackups: 0,
          successfulBackups: 0,
          failedBackups: 0,
          lastBackup: null,
          totalSize: 0
        }
      };
    }

    const content = await fs.readFile(registryPath, 'utf-8');
    const registry = JSON.parse(content) as LegacyBackupRegistry;
    registry.backups = Array.isArray(registry.backups) ? registry.backups : [];
    return registry;
  }

  private async writeLegacyBackupRegistry(registry: LegacyBackupRegistry): Promise<void> {
    const registryPath = this.getLegacyRegistryPath();
    await fs.mkdir(path.dirname(registryPath), { recursive: true });
    registry.lastUpdated = new Date().toISOString();
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  private recalculateLegacyRegistryStatistics(registry: LegacyBackupRegistry): void {
    const backups = registry.backups || [];
    const sorted = [...backups].sort((a, b) => {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    registry.statistics = {
      totalBackups: backups.length,
      successfulBackups: backups.filter(backup => backup.status === 'completed').length,
      failedBackups: backups.filter(backup => backup.status && backup.status !== 'completed').length,
      lastBackup: sorted[0]?.createdAt || null,
      totalSize: backups.reduce((sum, backup) => sum + (backup.size || 0), 0)
    };
  }

  private getLegacyRegistryPath(): string {
    return path.join(this.getWorkspaceRoot(), 'backups', 'backup-registry.json');
  }

  private getLegacyBackupConfigPath(): string {
    return path.join(this.getWorkspaceRoot(), 'backups', 'backup-config.json');
  }

  private async resolveLegacyBackupPath(legacyPath: string): Promise<string> {
    const normalizedLegacyPath = path.normalize(legacyPath);
    const candidates = [normalizedLegacyPath];
    const fileName = path.basename(normalizedLegacyPath);

    if (fileName) {
      candidates.push(path.join(this.getWorkspaceRoot(), 'backups', 'data', fileName));
    }

    const projectRelative = this.extractProjectRelativePath(normalizedLegacyPath);
    if (projectRelative) {
      candidates.push(path.join(this.getWorkspaceRoot(), projectRelative));
    }

    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    return candidates[0];
  }

  private extractProjectRelativePath(legacyPath: string): string | null {
    const normalizedPath = path.normalize(legacyPath);
    const markers = [
      `${path.sep}configs${path.sep}`,
      `${path.sep}logs${path.sep}`,
      `${path.sep}backups${path.sep}`,
      `${path.sep}detection-api${path.sep}`,
      `${path.sep}package.json`,
      `${path.sep}ecosystem.config.js`
    ];

    for (const marker of markers) {
      const index = normalizedPath.toLowerCase().indexOf(marker.toLowerCase());
      if (index >= 0) {
        return normalizedPath.slice(index + 1);
      }
    }

    return null;
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private toPowerShellStringLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private getWorkspaceRoot(): string {
    const overrideRoot = process.env.PORTAL_WORKSPACE_ROOT?.trim();
    if (overrideRoot) {
      return path.resolve(overrideRoot);
    }

    return path.resolve(path.dirname(getSystemConfigFilePath()), '..');
  }

  private normalizeImportedConfiguration(
    config: AppConfiguration,
    createdBy?: string
  ): Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'> {
    const runtimeConfig = config.runtimeConfig || ({} as AppConfiguration['runtimeConfig']);

    return {
      appId: config.appId,
      name: config.name,
      description: config.description,
      version: config.version || '1.0.0',
      workingDirectory: config.workingDirectory,
      startCommand: config.startCommand,
      stopCommand: config.stopCommand,
      accessPath: config.accessPath || '',
      ports: Array.isArray(config.ports) ? config.ports : [],
      environmentVariables: Array.isArray(config.environmentVariables) ? config.environmentVariables : [],
      startupParameters: Array.isArray(config.startupParameters) ? config.startupParameters : [],
      buildConfig: config.buildConfig || {},
      runtimeConfig: {
        packageManager: runtimeConfig.packageManager || 'npm',
        startupTimeout: runtimeConfig.startupTimeout ?? 30000,
        healthCheckUrl: runtimeConfig.healthCheckUrl,
        healthCheckInterval: runtimeConfig.healthCheckInterval ?? 5000,
        restartOnFailure: runtimeConfig.restartOnFailure ?? true,
        maxRestartAttempts: runtimeConfig.maxRestartAttempts ?? 3,
        nodeVersion: runtimeConfig.nodeVersion
      },
      createdBy,
      tags: Array.isArray(config.tags) ? config.tags : [],
      isActive: config.isActive !== false
    };
  }

  private normalizeImportedEnvironmentProfile(
    profile: EnvironmentProfile,
    createdBy?: string
  ): Omit<EnvironmentProfile, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: profile.name,
      description: profile.description,
      appId: profile.appId,
      isDefault: Boolean(profile.isDefault),
      variables: Array.isArray(profile.variables) ? profile.variables : [],
      parameters: Array.isArray(profile.parameters) ? profile.parameters : [],
      createdBy
    };
  }

  private mergeEnvironmentProfile(
    existing: EnvironmentProfile,
    incoming: Omit<EnvironmentProfile, 'id' | 'createdAt' | 'updatedAt'>
  ): Partial<EnvironmentProfile> {
    const variables = new Map(existing.variables.map(variable => [variable.key, variable]));
    for (const variable of incoming.variables) {
      variables.set(variable.key, variable);
    }

    const parameters = new Map(existing.parameters.map(parameter => [parameter.name, parameter]));
    for (const parameter of incoming.parameters) {
      parameters.set(parameter.name, parameter);
    }

    return {
      name: incoming.name,
      description: incoming.description,
      isDefault: incoming.isDefault,
      variables: Array.from(variables.values()),
      parameters: Array.from(parameters.values())
    };
  }
}
