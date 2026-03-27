/**
 * Application Configuration Service
 * 应用配置管理服务
 */

import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type {
  AppConfiguration,
  ConfigurationTemplate,
  ConfigurationHistory,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConfigurationExport,
  EnvironmentVariable,
  StartupParameter,
  PortConfiguration
} from '../models/AppConfiguration';

// 动态端口配置相关类型
export interface DynamicPortConfiguration {
  frontend?: number
  backend?: number
  api?: number
  websocket?: number
}

export interface ConfigurationBackup {
  filePath: string
  originalContent: string | null
  existed: boolean
  timestamp: Date
}

export interface TechStackConfig {
  name: string
  configFiles: string[]
  envFiles: string[]
  portKeys: {
    frontend?: string[]
    backend?: string[]
    api?: string[]
  }
  startCommand?: string
  buildCommand?: string
}

export class AppConfigurationService {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
    this.initializeDatabase();
  }

  /**
   * 初始化数据库表
   */
  private initializeDatabase(): void {
    try {
      // 应用配置表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS app_configurations (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          version TEXT NOT NULL DEFAULT '1.0.0',
          working_directory TEXT NOT NULL,
          start_command TEXT NOT NULL,
          stop_command TEXT,
          config_json TEXT NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT,
          tags TEXT,
          last_validated DATETIME,
          validation_errors TEXT
        )
      `);

      // 配置模板表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS configuration_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          tech_stack TEXT NOT NULL,
          category TEXT NOT NULL,
          template_json TEXT NOT NULL,
          is_builtin BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 配置历史表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS configuration_history (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          config_id TEXT NOT NULL,
          change_type TEXT NOT NULL,
          changes_json TEXT NOT NULL,
          changed_by TEXT,
          changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reason TEXT
        )
      `);

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_app_configurations_app_id ON app_configurations(app_id);
        CREATE INDEX IF NOT EXISTS idx_configuration_history_app_id ON configuration_history(app_id);
        CREATE INDEX IF NOT EXISTS idx_configuration_history_config_id ON configuration_history(config_id);
      `);

      // 清理并约束内置模板，防止重复累积
      this.ensureBuiltinTemplateUniqueness();

      // 插入内置模板
      this.insertBuiltinTemplates();

      logger.debug('App configuration service initialized');
    } catch (error) {
      logger.error('Failed to initialize app configuration database', { error });
      throw error;
    }
  }

  /**
   * 清理重复内置模板并建立唯一约束
   * 历史版本会在每次服务启动时重复插入内置模板，这里做一次性修复并持续兜底
   */
  private ensureBuiltinTemplateUniqueness(): void {
    try {
      const dedupeResult = this.db.prepare(`
        DELETE FROM configuration_templates
        WHERE is_builtin = 1
          AND rowid NOT IN (
            SELECT MIN(rowid)
            FROM configuration_templates
            WHERE is_builtin = 1
            GROUP BY name, tech_stack, category
          )
      `).run();

      if (dedupeResult.changes > 0) {
        logger.warn('Removed duplicated builtin templates', { removed: dedupeResult.changes });
      }

      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_configuration_templates_builtin_unique
        ON configuration_templates(name, tech_stack, category)
        WHERE is_builtin = 1
      `);
    } catch (error) {
      logger.warn('Failed to ensure builtin template uniqueness', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * 插入内置配置模板
   */
  private insertBuiltinTemplates(): void {
    const templates: Omit<ConfigurationTemplate, 'id' | 'createdAt'>[] = [
      {
        name: 'React应用模板',
        description: '适用于React前端应用的标准配置',
        techStack: 'React',
        category: 'frontend',
        isBuiltin: true,
        template: {
          ports: [{
            port: 3000,
            type: 'frontend',
            protocol: 'http',
            description: '前端开发服务器端口',
            autoAllocate: true,
            preferredRange: { start: 3001, end: 3100 }
          }],
          environmentVariables: [
            { key: 'REACT_APP_API_URL', value: '', description: 'API服务器地址', required: true, sensitive: false },
            { key: 'PORT', value: '3000', description: '应用端口', required: false, sensitive: false }
          ],
          startupParameters: [
            { name: '--port', value: '3000', description: '指定端口', required: false, type: 'number' }
          ],
          buildConfig: {
            buildCommand: 'npm run build',
            buildDirectory: '.',
            outputDirectory: 'build',
            preInstallCommand: 'npm install'
          },
          runtimeConfig: {
            packageManager: 'npm',
            startupTimeout: 30000,
            healthCheckInterval: 5000,
            restartOnFailure: true,
            maxRestartAttempts: 3
          }
        }
      },
      {
        name: 'Vue.js应用模板',
        description: '适用于Vue.js前端应用的标准配置',
        techStack: 'Vue',
        category: 'frontend',
        isBuiltin: true,
        template: {
          ports: [{
            port: 8080,
            type: 'frontend',
            protocol: 'http',
            description: 'Vue开发服务器端口',
            autoAllocate: true,
            preferredRange: { start: 3001, end: 3100 }
          }],
          environmentVariables: [
            { key: 'VUE_APP_API_URL', value: '', description: 'API服务器地址', required: true, sensitive: false },
            { key: 'PORT', value: '8080', description: '应用端口', required: false, sensitive: false }
          ],
          startupParameters: [
            { name: '--port', value: '8080', description: '指定端口', required: false, type: 'number' }
          ],
          buildConfig: {
            buildCommand: 'npm run build',
            buildDirectory: '.',
            outputDirectory: 'dist',
            preInstallCommand: 'npm install'
          },
          runtimeConfig: {
            packageManager: 'npm',
            startupTimeout: 30000,
            healthCheckInterval: 5000,
            restartOnFailure: true,
            maxRestartAttempts: 3
          }
        }
      },
      {
        name: 'Node.js API模板',
        description: '适用于Node.js后端API的标准配置',
        techStack: 'Node.js',
        category: 'backend',
        isBuiltin: true,
        template: {
          ports: [{
            port: 8001,
            type: 'api',
            protocol: 'http',
            description: 'API服务端口',
            autoAllocate: true,
            preferredRange: { start: 8001, end: 8100 }
          }],
          environmentVariables: [
            { key: 'NODE_ENV', value: 'development', description: '运行环境', required: true, sensitive: false },
            { key: 'PORT', value: '8001', description: '服务端口', required: true, sensitive: false },
            { key: 'HOST', value: '0.0.0.0', description: '网络绑定地址', required: true, sensitive: false },
            { key: 'DATABASE_URL', value: '', description: '数据库连接URL', required: false, sensitive: true }
          ],
          startupParameters: [],
          buildConfig: {
            preInstallCommand: 'npm install'
          },
          runtimeConfig: {
            packageManager: 'npm',
            startupTimeout: 15000,
            healthCheckUrl: '/health',
            healthCheckInterval: 10000,
            restartOnFailure: true,
            maxRestartAttempts: 5
          }
        }
      }
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO configuration_templates 
      (id, name, description, tech_stack, category, template_json, is_builtin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const template of templates) {
      insertStmt.run(
        uuidv4(),
        template.name,
        template.description,
        template.techStack,
        template.category,
        JSON.stringify(template.template),
        template.isBuiltin ? 1 : 0,
        new Date().toISOString()
      );
    }
  }

  /**
   * 创建应用配置
   */
  async createConfiguration(config: Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = uuidv4();

    try {
      // 验证配置
      const validation = await this.validateConfiguration(config as AppConfiguration);
      if (!validation.isValid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      const stmt = this.db.prepare(`
        INSERT INTO app_configurations 
        (id, app_id, name, description, version, working_directory, start_command, stop_command, 
         config_json, is_active, created_at, updated_at, created_by, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      const configJson = JSON.stringify({
        accessPath: config.accessPath || '',
        ports: config.ports,
        environmentVariables: config.environmentVariables,
        startupParameters: config.startupParameters,
        buildConfig: config.buildConfig,
        runtimeConfig: config.runtimeConfig
      });

      stmt.run(
        id,
        config.appId,
        config.name,
        config.description,
        config.version,
        config.workingDirectory,
        config.startCommand,
        config.stopCommand,
        configJson,
        config.isActive ? 1 : 0,
        now,
        now,
        config.createdBy,
        JSON.stringify(config.tags)
      );

      // 记录历史
      await this.recordConfigurationHistory(config.appId, id, 'created', config, config.createdBy);

      logger.info('Configuration created successfully', { id, appId: config.appId, name: config.name });
      return id;
    } catch (error) {
      logger.error('Failed to create configuration', { error, config: config.name });
      throw error;
    }
  }

  /**
   * 获取应用配置
   */
  async getConfiguration(id: string): Promise<AppConfiguration | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM app_configurations WHERE id = ?
      `);

      const row = stmt.get(id) as any;
      if (!row) return null;

      return this.mapRowToConfiguration(row);
    } catch (error) {
      logger.error('Failed to get configuration', { error, id });
      throw error;
    }
  }

  /**
   * 获取应用的所有配置
   */
  async getConfigurationsByAppId(appId: string): Promise<AppConfiguration[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM app_configurations 
        WHERE app_id = ? 
        ORDER BY created_at DESC
      `);

      const rows = stmt.all(appId) as any[];
      return rows.map(row => this.mapRowToConfiguration(row));
    } catch (error) {
      logger.error('Failed to get configurations by app ID', { error, appId });
      throw error;
    }
  }

  /**
   * 获取全部应用配置
   */
  async getAllConfigurations(): Promise<AppConfiguration[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM app_configurations
        ORDER BY updated_at DESC, created_at DESC
      `);

      const rows = stmt.all() as any[];
      return rows.map(row => this.mapRowToConfiguration(row));
    } catch (error) {
      logger.error('Failed to get all configurations', { error });
      throw error;
    }
  }

  /**
   * 更新配置
   */
  async updateConfiguration(id: string, updates: Partial<AppConfiguration>, updatedBy?: string): Promise<void> {
    try {
      const existing = await this.getConfiguration(id);
      if (!existing) {
        throw new Error('Configuration not found');
      }

      const updated = { ...existing, ...updates, updatedAt: new Date() };

      // 验证更新后的配置
      const validation = await this.validateConfiguration(updated);
      if (!validation.isValid) {
        throw new Error(`Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      const stmt = this.db.prepare(`
        UPDATE app_configurations 
        SET name = ?, description = ?, version = ?, working_directory = ?, 
            start_command = ?, stop_command = ?, config_json = ?, is_active = ?, 
            updated_at = ?, tags = ?
        WHERE id = ?
      `);

      const configJson = JSON.stringify({
        accessPath: updated.accessPath || '',
        ports: updated.ports,
        environmentVariables: updated.environmentVariables,
        startupParameters: updated.startupParameters,
        buildConfig: updated.buildConfig,
        runtimeConfig: updated.runtimeConfig
      });

      stmt.run(
        updated.name,
        updated.description,
        updated.version,
        updated.workingDirectory,
        updated.startCommand,
        updated.stopCommand,
        configJson,
        updated.isActive ? 1 : 0,
        updated.updatedAt.toISOString(),
        JSON.stringify(updated.tags),
        id
      );

      // 记录历史
      await this.recordConfigurationHistory(updated.appId, id, 'updated', updates, updatedBy);

      logger.info('Configuration updated successfully', { id, appId: updated.appId });
    } catch (error) {
      logger.error('Failed to update configuration', { error, id });
      throw error;
    }
  }

  /**
   * 验证配置
   */
  async validateConfiguration(config: AppConfiguration): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 基本字段验证
    if (!config.name?.trim()) {
      errors.push({ field: 'name', message: '配置名称不能为空', code: 'REQUIRED' });
    }

    if (!config.workingDirectory?.trim()) {
      errors.push({ field: 'workingDirectory', message: '工作目录不能为空', code: 'REQUIRED' });
    }

    if (!config.startCommand?.trim()) {
      errors.push({ field: 'startCommand', message: '启动命令不能为空', code: 'REQUIRED' });
    }

    if (typeof config.accessPath === 'string' && config.accessPath.trim() !== '') {
      const normalizedPath = config.accessPath.trim();
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedPath) || normalizedPath.includes('://')) {
        errors.push({
          field: 'accessPath',
          message: '前端入口路径必须是相对路径，不支持完整URL',
          code: 'INVALID_FORMAT'
        });
      } else if (normalizedPath.includes('..')) {
        errors.push({
          field: 'accessPath',
          message: '前端入口路径不能包含 ..',
          code: 'INVALID_PATH'
        });
      }
    }

    // 端口配置验证
    for (let i = 0; i < config.ports.length; i++) {
      const port = config.ports[i];
      if (port.port < 1 || port.port > 65535) {
        errors.push({
          field: `ports[${i}].port`,
          message: `端口号必须在1-65535范围内`,
          code: 'INVALID_RANGE'
        });
      }
    }

    // 环境变量验证
    const envKeys = new Set();
    for (let i = 0; i < config.environmentVariables.length; i++) {
      const env = config.environmentVariables[i];
      if (!env.key?.trim()) {
        errors.push({
          field: `environmentVariables[${i}].key`,
          message: '环境变量名不能为空',
          code: 'REQUIRED'
        });
      } else if (envKeys.has(env.key)) {
        errors.push({
          field: `environmentVariables[${i}].key`,
          message: `重复的环境变量: ${env.key}`,
          code: 'DUPLICATE'
        });
      } else {
        envKeys.add(env.key);
      }

      if (env.required && !env.value?.trim()) {
        errors.push({
          field: `environmentVariables[${i}].value`,
          message: `必需的环境变量 ${env.key} 值不能为空`,
          code: 'REQUIRED'
        });
      }
    }

    // 运行时配置验证
    if (config.runtimeConfig) {
      if (config.runtimeConfig.startupTimeout < 1000) {
        warnings.push({
          field: 'runtimeConfig.startupTimeout',
          message: '启动超时时间建议不少于1秒',
          code: 'LOW_VALUE'
        });
      }

      if (config.runtimeConfig.maxRestartAttempts > 10) {
        warnings.push({
          field: 'runtimeConfig.maxRestartAttempts',
          message: '最大重启次数建议不超过10次',
          code: 'HIGH_VALUE'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 记录配置历史
   */
  private async recordConfigurationHistory(
    appId: string,
    configId: string,
    changeType: string,
    changes: any,
    changedBy?: string,
    reason?: string
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO configuration_history 
        (id, app_id, config_id, change_type, changes_json, changed_by, changed_at, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        uuidv4(),
        appId,
        configId,
        changeType,
        JSON.stringify(changes),
        changedBy,
        new Date().toISOString(),
        reason
      );
    } catch (error) {
      logger.error('Failed to record configuration history', { error, appId, configId });
    }
  }

  /**
   * 将数据库行映射为配置对象
   */
  private mapRowToConfiguration(row: any): AppConfiguration {
    const config = JSON.parse(row.config_json);

    return {
      id: row.id,
      appId: row.app_id,
      name: row.name,
      description: row.description,
      version: row.version,
      workingDirectory: row.working_directory,
      startCommand: row.start_command,
      stopCommand: row.stop_command,
      accessPath: config.accessPath || '',
      ports: config.ports || [],
      environmentVariables: config.environmentVariables || [],
      startupParameters: config.startupParameters || [],
      buildConfig: config.buildConfig || {},
      runtimeConfig: config.runtimeConfig || {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isActive: row.is_active === 1,
      lastValidated: row.last_validated ? new Date(row.last_validated) : undefined,
      validationErrors: row.validation_errors ? JSON.parse(row.validation_errors) : undefined
    };
  }

  /**
   * 获取配置模板
   */
  async getTemplates(): Promise<ConfigurationTemplate[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM configuration_templates 
        ORDER BY is_builtin DESC, created_at DESC
      `);

      const rows = stmt.all() as any[];
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        techStack: row.tech_stack,
        category: row.category as any,
        template: JSON.parse(row.template_json),
        createdAt: new Date(row.created_at),
        isBuiltin: row.is_builtin === 1
      }));
    } catch (error) {
      logger.error('Failed to get configuration templates', { error });
      throw error;
    }
  }

  /**
   * 根据模板创建配置
   */
  async createFromTemplate(templateId: string, appId: string, customizations: Partial<AppConfiguration>): Promise<string> {
    try {
      const stmt = this.db.prepare(`SELECT * FROM configuration_templates WHERE id = ?`);
      const templateRow = stmt.get(templateId) as any;

      if (!templateRow) {
        throw new Error('Template not found');
      }

      const template = JSON.parse(templateRow.template_json);
      const config: Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'> = {
        appId,
        name: customizations.name || `${templateRow.name} - ${appId}`,
        description: customizations.description || template.description,
        version: '1.0.0',
        workingDirectory: customizations.workingDirectory || '.',
        startCommand: customizations.startCommand || 'npm start',
        stopCommand: customizations.stopCommand,
        accessPath: customizations.accessPath || template.accessPath || '',
        ports: customizations.ports || template.ports || [],
        environmentVariables: customizations.environmentVariables || template.environmentVariables || [],
        startupParameters: customizations.startupParameters || template.startupParameters || [],
        buildConfig: { ...template.buildConfig, ...customizations.buildConfig },
        runtimeConfig: { ...template.runtimeConfig, ...customizations.runtimeConfig },
        createdBy: customizations.createdBy,
        tags: customizations.tags || [templateRow.tech_stack],
        isActive: customizations.isActive !== undefined ? customizations.isActive : true
      };

      return await this.createConfiguration(config);
    } catch (error) {
      logger.error('Failed to create configuration from template', { error, templateId, appId });
      throw error;
    }
  }

  /**
   * 动态端口配置功能
   * 根据门户系统分配的端口修改应用配置文件
   */

  // 技术栈配置映射
  private techStackConfigs: Map<string, TechStackConfig> = new Map([
    ['Vue.js', {
      name: 'Vue.js',
      configFiles: ['vite.config.ts', 'vite.config.js', 'vue.config.js'],
      envFiles: ['.env', '.env.local', '.env.development', '.env.production'],
      portKeys: {
        frontend: ['VITE_PORT', 'VITE_DEV_PORT', 'PORT', 'DEV_PORT'],
        backend: ['VITE_API_BASE_URL', 'VITE_API_PORT', 'API_PORT'],
        api: ['VITE_API_BASE_URL']
      },
      startCommand: 'npm run dev',
      buildCommand: 'npm run build'
    }],
    ['React', {
      name: 'React',
      configFiles: ['webpack.config.js', 'craco.config.js', 'vite.config.ts'],
      envFiles: ['.env', '.env.local', '.env.development', '.env.production'],
      portKeys: {
        frontend: ['PORT', 'REACT_APP_PORT', 'VITE_PORT'],
        backend: ['REACT_APP_API_URL', 'REACT_APP_API_PORT'],
        api: ['REACT_APP_API_URL']
      },
      startCommand: 'npm start',
      buildCommand: 'npm run build'
    }],
    ['Node.js', {
      name: 'Node.js',
      configFiles: ['package.json', 'server.js', 'app.js', 'index.js'],
      envFiles: ['.env', '.env.local', '.env.development', '.env.production'],
      portKeys: {
        backend: ['PORT', 'SERVER_PORT', 'API_PORT'],
        api: ['PORT', 'API_PORT']
      },
      startCommand: 'npm start',
      buildCommand: 'npm run build'
    }],
    ['Express', {
      name: 'Express',
      configFiles: ['package.json', 'server.js', 'app.js', 'index.js'],
      envFiles: ['.env', '.env.local', '.env.development', '.env.production'],
      portKeys: {
        backend: ['PORT', 'SERVER_PORT', 'EXPRESS_PORT'],
        api: ['PORT', 'API_PORT']
      },
      startCommand: 'npm start',
      buildCommand: 'npm run build'
    }],
    ['Next.js', {
      name: 'Next.js',
      configFiles: ['next.config.js', 'next.config.mjs'],
      envFiles: ['.env', '.env.local', '.env.development', '.env.production'],
      portKeys: {
        frontend: ['PORT', 'NEXT_PORT'],
        backend: ['NEXT_PUBLIC_API_URL', 'API_PORT'],
        api: ['NEXT_PUBLIC_API_URL']
      },
      startCommand: 'npm run dev',
      buildCommand: 'npm run build'
    }]
  ])

  private configBackups: Map<string, ConfigurationBackup[]> = new Map()
  private readonly subProjectEnvFiles = ['.env', '.env.local', '.env.development'] as const
  private readonly frontendDirCandidates = ['frontend', 'client'] as const
  private readonly backendDirCandidates = ['backend', 'server'] as const

  /**
   * 为应用配置端口
   */
  async configureAppPorts(app: any, ports: DynamicPortConfiguration): Promise<boolean> {
    logger.info('开始配置应用端口', {
      appId: app.id,
      appName: app.name,
      techStack: app.techStack?.name,
      ports
    })

    try {
      // 1. 获取技术栈配置
      const techStackConfig = this.getTechStackConfig(app.techStack?.name || '')
      if (!techStackConfig) {
        logger.warn('未找到技术栈配置，使用通用配置', { techStack: app.techStack?.name })
        return await this.configureGenericApp(app, ports)
      }

      // 2. 备份现有配置
      await this.backupConfigurations(app, techStackConfig)

      // 3. 修改环境变量文件
      await this.updateEnvironmentFiles(app, techStackConfig, ports)

      // 4. 处理全栈项目
      if (app.fullStack?.isFullStack) {
        await this.configureFullStackApp(app, ports)
      }

      logger.info('应用端口配置完成', { appId: app.id, ports })
      return true

    } catch (error) {
      logger.error('应用端口配置失败', { error, appId: app.id })

      // 回滚配置
      await this.rollbackConfigurations(app.id)
      return false
    }
  }

  /**
   * 获取技术栈配置
   */
  private getTechStackConfig(techStackName: string): TechStackConfig | undefined {
    // 精确匹配
    if (this.techStackConfigs.has(techStackName)) {
      return this.techStackConfigs.get(techStackName)
    }

    // 模糊匹配
    for (const [key, config] of this.techStackConfigs) {
      if (techStackName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(techStackName.toLowerCase())) {
        return config
      }
    }

    return undefined
  }

  /**
   * 备份配置文件
   */
  private async backupConfigurations(app: any, config: TechStackConfig): Promise<void> {
    const backups: ConfigurationBackup[] = []
    const appDir = app.directory
    const filesToBackup = new Set<string>()

    // 备份环境变量文件
    for (const envFile of config.envFiles) {
      filesToBackup.add(path.join(appDir, envFile))
    }

    if (app.fullStack?.isFullStack) {
      const frontendPath = await this.resolveFullStackProjectPath(app, 'frontend')
      const backendPath = await this.resolveFullStackProjectPath(app, 'backend')

      for (const envFile of this.subProjectEnvFiles) {
        if (frontendPath) {
          filesToBackup.add(path.join(frontendPath, envFile))
        }

        if (backendPath) {
          filesToBackup.add(path.join(backendPath, envFile))
        }
      }
    }

    for (const filePath of filesToBackup) {
      await this.backupConfigurationFile(backups, filePath)
    }

    this.configBackups.set(app.id, backups)
    logger.debug('配置文件备份完成', { appId: app.id, backupCount: backups.length })
  }

  private async backupConfigurationFile(backups: ConfigurationBackup[], filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      backups.push({
        filePath,
        originalContent: content,
        existed: true,
        timestamp: new Date()
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        backups.push({
          filePath,
          originalContent: null,
          existed: false,
          timestamp: new Date()
        })
        return
      }

      throw error
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(targetPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  private async resolveFullStackProjectPath(
    app: any,
    type: 'frontend' | 'backend'
  ): Promise<string | undefined> {
    const fullStackConfig = app.fullStack
    const processConfig = type === 'frontend'
      ? fullStackConfig?.frontendConfig
      : fullStackConfig?.backendConfig
    const legacyDir = type === 'frontend'
      ? fullStackConfig?.frontendDir
      : fullStackConfig?.backendDir
    const directoryCandidates = type === 'frontend'
      ? this.frontendDirCandidates
      : this.backendDirCandidates
    const candidatePaths = new Set<string>()

    if (typeof processConfig?.workingDirectory === 'string' && processConfig.workingDirectory.trim()) {
      candidatePaths.add(path.resolve(app.directory, processConfig.workingDirectory))
    }

    if (typeof legacyDir === 'string' && legacyDir.trim()) {
      candidatePaths.add(path.resolve(app.directory, legacyDir))
    }

    for (const candidate of directoryCandidates) {
      candidatePaths.add(path.join(app.directory, candidate))
    }

    for (const candidatePath of candidatePaths) {
      if (await this.pathExists(candidatePath)) {
        return candidatePath
      }
    }

    logger.warn('未找到全栈子项目目录', {
      appId: app.id,
      type,
      candidates: Array.from(candidatePaths)
    })
    return undefined
  }

  private buildAbsoluteApiUrl(port: number): string {
    const host = process.env.HOST || '0.0.0.0'
    return host === "0.0.0.0" ? `http://localhost:${port}` : `http://${host}:${port}`
  }

  private buildFrontendUrl(port: number): string {
    return `http://localhost:${port}`
  }

  private buildFrontendCorsOrigins(port: number): string {
    const origins = new Set<string>([
      this.buildFrontendUrl(port),
      `http://127.0.0.1:${port}`
    ])
    const host = (process.env.HOST || '').trim()

    if (host && host !== '0.0.0.0' && host !== 'localhost' && host !== '127.0.0.1') {
      origins.add(`http://${host}:${port}`)
    }

    return Array.from(origins).join(',')
  }

  /**
   * 更新环境变量文件
   */
  private async updateEnvironmentFiles(
    app: any,
    config: TechStackConfig,
    ports: DynamicPortConfiguration
  ): Promise<void> {
    const appDir = app.directory

    for (const envFile of config.envFiles) {
      const filePath = path.join(appDir, envFile)

      try {
        let content = ''
        try {
          content = await fs.readFile(filePath, 'utf-8')
        } catch {
          // 文件不存在，创建新文件
          content = `# 由门户管理系统自动生成\n# 生成时间: ${new Date().toISOString()}\n\n`
        }

        let modified = false

        // 更新前端端口
        if (ports.frontend && config.portKeys.frontend) {
          for (const key of config.portKeys.frontend) {
            const result = this.updateEnvVariable(content, key, ports.frontend.toString())
            content = result.content
            modified = modified || result.modified
          }
        }

        // 更新后端端口
        if (ports.backend && config.portKeys.backend) {
          for (const key of config.portKeys.backend) {
            if (key.includes('URL') || key.includes('BASE')) {
              const apiUrl = app.fullStack?.isFullStack && config.name === 'Vue.js'
                ? '/api'
                : this.buildAbsoluteApiUrl(ports.backend)
              const result = this.updateEnvVariable(content, key, apiUrl)
              content = result.content
              modified = modified || result.modified
            } else {
              // 端口号格式
              const result = this.updateEnvVariable(content, key, ports.backend.toString())
              content = result.content
              modified = modified || result.modified
            }
          }
        }

        if (modified) {
          await fs.writeFile(filePath, content, 'utf-8')
          logger.debug('环境变量文件已更新', { filePath, ports })
        }

      } catch (error) {
        logger.warn('更新环境变量文件失败', { error, filePath })
      }
    }
  }

  /**
   * 更新环境变量
   */
  private updateEnvVariable(content: string, key: string, value: string): { content: string, modified: boolean } {
    const regex = new RegExp(`^${key}\\s*=.*$`, 'm')
    const newLine = `${key}=${value}`

    if (regex.test(content)) {
      // 更新现有变量
      return {
        content: content.replace(regex, newLine),
        modified: true
      }
    } else {
      // 添加新变量
      return {
        content: content + `\n${newLine}`,
        modified: true
      }
    }
  }

  /**
   * 配置全栈应用
   */
  private async configureFullStackApp(app: any, ports: DynamicPortConfiguration): Promise<void> {
    if (!app.fullStack) return

    const frontendPath = await this.resolveFullStackProjectPath(app, 'frontend')
    const backendPath = await this.resolveFullStackProjectPath(app, 'backend')

    // 处理前端配置
    if (frontendPath && ports.frontend) {
      await this.configureSubProject(frontendPath, 'frontend', ports.frontend, ports.backend)
    }

    // 处理后端配置
    if (backendPath && ports.backend) {
      await this.configureSubProject(backendPath, 'backend', ports.backend, ports.frontend)
    }
  }

  /**
   * 配置子项目
   */
  private async configureSubProject(
    projectPath: string,
    type: 'frontend' | 'backend',
    primaryPort: number,
    secondaryPort?: number
  ): Promise<void> {
    for (const envFile of this.subProjectEnvFiles) {
      const filePath = path.join(projectPath, envFile)

      try {
        let content = ''
        try {
          content = await fs.readFile(filePath, 'utf-8')
        } catch {
          content = `# 由门户管理系统自动生成\n# 生成时间: ${new Date().toISOString()}\n\n`
        }

        if (type === 'frontend') {
          // 前端配置
          const portResult = this.updateEnvVariable(content, 'VITE_PORT', primaryPort.toString())
          content = portResult.content

          const devPortResult = this.updateEnvVariable(content, 'VITE_DEV_PORT', primaryPort.toString())
          content = devPortResult.content

          if (secondaryPort) {
            const apiBaseResult = this.updateEnvVariable(content, 'VITE_API_BASE_URL', '/api')
            content = apiBaseResult.content

            const apiPortResult = this.updateEnvVariable(content, 'VITE_API_PORT', secondaryPort.toString())
            content = apiPortResult.content

            const sharedApiPortResult = this.updateEnvVariable(content, 'API_PORT', secondaryPort.toString())
            content = sharedApiPortResult.content
          }
        } else {
          // 后端配置
          const portResult = this.updateEnvVariable(content, 'PORT', primaryPort.toString())
          content = portResult.content

          const hostResult = this.updateEnvVariable(content, 'HOST', '0.0.0.0')
          content = hostResult.content

          if (secondaryPort) {
            const frontendUrl = this.buildFrontendUrl(secondaryPort)
            const corsOrigins = this.buildFrontendCorsOrigins(secondaryPort)

            const corsResult = this.updateEnvVariable(content, 'FRONTEND_URL', frontendUrl)
            content = corsResult.content

            const corsOriginsResult = this.updateEnvVariable(content, 'CORS_ORIGINS', corsOrigins)
            content = corsOriginsResult.content
          }
        }

        await fs.writeFile(filePath, content, 'utf-8')
        logger.debug('子项目配置已更新', { projectPath, type, primaryPort, secondaryPort })

      } catch (error) {
        logger.warn('更新子项目配置失败', { error, projectPath, type })
      }
    }
  }

  /**
   * 通用应用配置
   */
  private async configureGenericApp(app: any, ports: DynamicPortConfiguration): Promise<boolean> {
    const appDir = app.directory
    const envFile = path.join(appDir, '.env')

    try {
      let content = ''
      try {
        content = await fs.readFile(envFile, 'utf-8')
      } catch {
        content = `# 由门户管理系统自动生成\n# 生成时间: ${new Date().toISOString()}\n\n`
      }

      // 添加网络绑定配置
      const hostResult = this.updateEnvVariable(content, 'HOST', '0.0.0.0')
      content = hostResult.content

      // 添加通用端口配置
      if (ports.frontend) {
        const result = this.updateEnvVariable(content, 'PORT', ports.frontend.toString())
        content = result.content
      }

      if (ports.backend) {
        const result = this.updateEnvVariable(content, 'API_PORT', ports.backend.toString())
        content = result.content
      }

      await fs.writeFile(envFile, content, 'utf-8')
      logger.info('通用应用配置完成', { appId: app.id, envFile })
      return true

    } catch (error) {
      logger.error('通用应用配置失败', { error, appId: app.id })
      return false
    }
  }

  /**
   * 回滚配置
   */
  async rollbackConfigurations(appId: string): Promise<void> {
    const backups = this.configBackups.get(appId)
    if (!backups) {
      logger.warn('未找到配置备份，无法回滚', { appId })
      return
    }

    try {
      for (const backup of backups) {
        if (backup.existed && backup.originalContent !== null) {
          await fs.writeFile(backup.filePath, backup.originalContent, 'utf-8')
          continue
        }

        try {
          await fs.unlink(backup.filePath)
        } catch (error) {
          if ((error as { code?: string }).code !== 'ENOENT') {
            throw error
          }
        }
      }

      this.configBackups.delete(appId)
      logger.info('配置回滚完成', { appId, backupCount: backups.length })

    } catch (error) {
      logger.error('配置回滚失败', { error, appId })
    }
  }

  /**
   * 清理备份
   */
  clearBackups(appId: string): void {
    this.configBackups.delete(appId)
  }
}
