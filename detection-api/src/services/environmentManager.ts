/**
 * Environment Manager Service
 * 环境变量和启动参数管理服务
 */

import { Database } from 'better-sqlite3';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type { EnvironmentVariable, StartupParameter } from '../models/AppConfiguration';

export interface EnvironmentProfile {
  id: string;
  name: string;
  description?: string;
  appId: string;
  isDefault: boolean;
  variables: EnvironmentVariable[];
  parameters: StartupParameter[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface EnvironmentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'development' | 'staging' | 'production' | 'testing' | 'custom';
  techStack?: string;
  variables: EnvironmentVariable[];
  parameters: StartupParameter[];
  isBuiltin: boolean;
  createdAt: Date;
}

export interface EnvironmentValidationRule {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'path' | 'email' | 'regex';
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  allowedValues?: string[];
  description?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    key: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export class EnvironmentManager {
  private db: Database;

  constructor(database: Database) {
    this.db = database;
    this.initializeDatabase();
  }

  /**
   * 初始化数据库
   */
  private initializeDatabase(): void {
    try {
      // 环境配置文件表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          app_id TEXT NOT NULL,
          is_default BOOLEAN DEFAULT false,
          variables_json TEXT NOT NULL,
          parameters_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by TEXT
        )
      `);

      // 环境模板表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          tech_stack TEXT,
          variables_json TEXT NOT NULL,
          parameters_json TEXT NOT NULL,
          is_builtin BOOLEAN DEFAULT false,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 环境变量验证规则表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_validation_rules (
          id TEXT PRIMARY KEY,
          key_pattern TEXT NOT NULL,
          type TEXT NOT NULL,
          required BOOLEAN DEFAULT false,
          pattern TEXT,
          min_length INTEGER,
          max_length INTEGER,
          allowed_values TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 敏感信息加密存储表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS encrypted_environment_values (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          key_name TEXT NOT NULL,
          encrypted_value TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_environment_profiles_app_id ON environment_profiles(app_id);
        CREATE INDEX IF NOT EXISTS idx_environment_templates_category ON environment_templates(category);
        CREATE INDEX IF NOT EXISTS idx_encrypted_values_profile ON encrypted_environment_values(profile_id, key_name);
      `);

      // 插入内置模板和验证规则
      this.insertBuiltinTemplates();
      this.insertDefaultValidationRules();

      logger.debug('Environment manager database initialized');
    } catch (error) {
      logger.error('Failed to initialize environment manager database', { error });
      throw error;
    }
  }

  /**
   * 插入内置环境模板
   */
  private insertBuiltinTemplates(): void {
    const templates: Omit<EnvironmentTemplate, 'id' | 'createdAt'>[] = [
      {
        name: '开发环境模板',
        description: '适用于本地开发环境的标准配置',
        category: 'development',
        isBuiltin: true,
        variables: [
          { key: 'NODE_ENV', value: 'development', description: '运行环境', required: true, sensitive: false },
          { key: 'DEBUG', value: '*', description: '调试开关', required: false, sensitive: false },
          { key: 'LOG_LEVEL', value: 'debug', description: '日志级别', required: false, sensitive: false },
          { key: 'DATABASE_URL', value: '', description: '数据库连接URL', required: false, sensitive: true },
          { key: 'API_KEY', value: '', description: 'API密钥', required: false, sensitive: true }
        ],
        parameters: [
          { name: '--inspect', value: '9229', description: 'Node.js调试端口', required: false, type: 'number' },
          { name: '--max-old-space-size', value: '2048', description: '内存限制(MB)', required: false, type: 'number' }
        ]
      },
      {
        name: '生产环境模板',
        description: '适用于生产环境的安全配置',
        category: 'production',
        isBuiltin: true,
        variables: [
          { key: 'NODE_ENV', value: 'production', description: '运行环境', required: true, sensitive: false },
          { key: 'LOG_LEVEL', value: 'info', description: '日志级别', required: false, sensitive: false },
          { key: 'CLUSTER_MODE', value: 'true', description: '集群模式', required: false, sensitive: false },
          { key: 'DATABASE_URL', value: '', description: '数据库连接URL', required: true, sensitive: true },
          { key: 'SECRET_KEY', value: '', description: '应用密钥', required: true, sensitive: true },
          { key: 'SSL_CERT_PATH', value: '', description: 'SSL证书路径', required: false, sensitive: false },
          { key: 'SSL_KEY_PATH', value: '', description: 'SSL私钥路径', required: false, sensitive: false }
        ],
        parameters: [
          { name: '--max-old-space-size', value: '4096', description: '内存限制(MB)', required: false, type: 'number' },
          { name: '--optimize-for-size', value: '', description: '内存优化', required: false, type: 'boolean' }
        ]
      },
      {
        name: 'React开发环境',
        description: '适用于React应用开发的环境配置',
        category: 'development',
        techStack: 'React',
        isBuiltin: true,
        variables: [
          { key: 'REACT_APP_API_URL', value: 'http://localhost:8002', description: 'API服务器地址', required: true, sensitive: false },
          { key: 'REACT_APP_ENV', value: 'development', description: '应用环境', required: true, sensitive: false },
          { key: 'GENERATE_SOURCEMAP', value: 'true', description: '生成源码映射', required: false, sensitive: false },
          { key: 'BROWSER', value: 'chrome', description: '默认浏览器', required: false, sensitive: false },
          { key: 'PORT', value: '3000', description: '开发服务器端口', required: false, sensitive: false }
        ],
        parameters: []
      },
      {
        name: 'Vue.js开发环境',
        description: '适用于Vue.js应用开发的环境配置',
        category: 'development',
        techStack: 'Vue',
        isBuiltin: true,
        variables: [
          { key: 'VUE_APP_API_URL', value: 'http://localhost:8002', description: 'API服务器地址', required: true, sensitive: false },
          { key: 'VUE_APP_ENV', value: 'development', description: '应用环境', required: true, sensitive: false },
          { key: 'VUE_APP_TITLE', value: '', description: '应用标题', required: false, sensitive: false },
          { key: 'PORT', value: '8080', description: '开发服务器端口', required: false, sensitive: false }
        ],
        parameters: [
          { name: '--port', value: '8080', description: '服务端口', required: false, type: 'number' },
          { name: '--host', value: '0.0.0.0', description: '绑定主机', required: false, type: 'string' }
        ]
      }
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO environment_templates 
      (id, name, description, category, tech_stack, variables_json, parameters_json, is_builtin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const template of templates) {
      insertStmt.run(
        uuidv4(),
        template.name,
        template.description,
        template.category,
        template.techStack,
        JSON.stringify(template.variables),
        JSON.stringify(template.parameters),
        template.isBuiltin ? 1 : 0,
        new Date().toISOString()
      );
    }
  }

  /**
   * 插入默认验证规则
   */
  private insertDefaultValidationRules(): void {
    const rules: Omit<EnvironmentValidationRule, 'id' | 'createdAt'>[] = [
      {
        key: 'NODE_ENV',
        type: 'string',
        required: true,
        allowedValues: ['development', 'production', 'staging', 'test'],
        description: 'Node.js运行环境'
      },
      {
        key: 'PORT',
        type: 'number',
        required: false,
        minLength: 1,
        maxLength: 65535,
        description: '应用端口号'
      },
      {
        key: '*_URL',
        type: 'url',
        required: false,
        pattern: '^https?://.+',
        description: 'URL格式验证'
      },
      {
        key: '*_PATH',
        type: 'path',
        required: false,
        description: '文件路径验证'
      },
      {
        key: '*_EMAIL',
        type: 'email',
        required: false,
        pattern: '^[^@]+@[^@]+\\.[^@]+$',
        description: '邮箱格式验证'
      },
      {
        key: 'DEBUG',
        type: 'string',
        required: false,
        description: '调试模式配置'
      }
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO environment_validation_rules 
      (id, key_pattern, type, required, pattern, min_length, max_length, allowed_values, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of rules) {
      insertStmt.run(
        uuidv4(),
        rule.key,
        rule.type,
        rule.required ? 1 : 0,
        rule.pattern,
        rule.minLength,
        rule.maxLength,
        rule.allowedValues ? JSON.stringify(rule.allowedValues) : null,
        rule.description,
        new Date().toISOString()
      );
    }
  }

  /**
   * 创建环境配置文件
   */
  async createProfile(profile: Omit<EnvironmentProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const id = uuidv4();
      const now = new Date().toISOString();

      // 如果设置为默认配置，先清除其他默认配置
      if (profile.isDefault) {
        await this.clearDefaultProfile(profile.appId);
      }

      // 验证环境变量
      const validation = await this.validateEnvironmentVariables(profile.variables);
      if (!validation.isValid) {
        const errorMessages = validation.errors
          .filter(e => e.severity === 'error')
          .map(e => `${e.key}: ${e.message}`)
          .join(', ');
        if (errorMessages) {
          throw new Error(`Environment validation failed: ${errorMessages}`);
        }
      }

      const stmt = this.db.prepare(`
        INSERT INTO environment_profiles 
        (id, name, description, app_id, is_default, variables_json, parameters_json, 
         created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        profile.name,
        profile.description,
        profile.appId,
        profile.isDefault ? 1 : 0,
        JSON.stringify(profile.variables),
        JSON.stringify(profile.parameters),
        now,
        now,
        profile.createdBy
      );

      // 处理敏感信息加密存储
      await this.storeSensitiveVariables(id, profile.variables);

      logger.info('Environment profile created', { id, name: profile.name, appId: profile.appId });
      return id;
    } catch (error) {
      logger.error('Failed to create environment profile', { error, profile: profile.name });
      throw error;
    }
  }

  /**
   * 获取环境配置文件
   */
  async getProfile(id: string): Promise<EnvironmentProfile | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM environment_profiles WHERE id = ?');
      const row = stmt.get(id) as any;

      if (!row) return null;

      // 加载敏感变量
      const variables = await this.loadVariablesWithSensitiveData(id, JSON.parse(row.variables_json));

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        appId: row.app_id,
        isDefault: row.is_default === 1,
        variables,
        parameters: JSON.parse(row.parameters_json),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        createdBy: row.created_by
      };
    } catch (error) {
      logger.error('Failed to get environment profile', { error, id });
      return null;
    }
  }

  /**
   * 获取应用的所有环境配置
   */
  async getProfilesByAppId(appId: string): Promise<EnvironmentProfile[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM environment_profiles 
        WHERE app_id = ? 
        ORDER BY is_default DESC, created_at DESC
      `);
      
      const rows = stmt.all(appId) as any[];
      const profiles = [];

      for (const row of rows) {
        const variables = await this.loadVariablesWithSensitiveData(row.id, JSON.parse(row.variables_json));
        
        profiles.push({
          id: row.id,
          name: row.name,
          description: row.description,
          appId: row.app_id,
          isDefault: row.is_default === 1,
          variables,
          parameters: JSON.parse(row.parameters_json),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          createdBy: row.created_by
        });
      }

      return profiles;
    } catch (error) {
      logger.error('Failed to get environment profiles by app ID', { error, appId });
      return [];
    }
  }

  /**
   * 更新环境配置文件
   */
  async updateProfile(id: string, updates: Partial<EnvironmentProfile>): Promise<void> {
    try {
      const existing = await this.getProfile(id);
      if (!existing) {
        throw new Error('Environment profile not found');
      }

      // 如果设置为默认配置，先清除其他默认配置
      if (updates.isDefault) {
        await this.clearDefaultProfile(existing.appId);
      }

      // 验证更新后的环境变量
      if (updates.variables) {
        const validation = await this.validateEnvironmentVariables(updates.variables);
        if (!validation.isValid) {
          const errorMessages = validation.errors
            .filter(e => e.severity === 'error')
            .map(e => `${e.key}: ${e.message}`)
            .join(', ');
          if (errorMessages) {
            throw new Error(`Environment validation failed: ${errorMessages}`);
          }
        }
      }

      const stmt = this.db.prepare(`
        UPDATE environment_profiles 
        SET name = ?, description = ?, is_default = ?, variables_json = ?, 
            parameters_json = ?, updated_at = ?
        WHERE id = ?
      `);

      const variables = updates.variables || existing.variables;
      const parameters = updates.parameters || existing.parameters;

      stmt.run(
        updates.name || existing.name,
        updates.description !== undefined ? updates.description : existing.description,
        (updates.isDefault !== undefined ? updates.isDefault : existing.isDefault) ? 1 : 0,
        JSON.stringify(variables),
        JSON.stringify(parameters),
        new Date().toISOString(),
        id
      );

      // 更新敏感信息
      if (updates.variables) {
        await this.storeSensitiveVariables(id, variables);
      }

      logger.info('Environment profile updated', { id, name: updates.name || existing.name });
    } catch (error) {
      logger.error('Failed to update environment profile', { error, id });
      throw error;
    }
  }

  /**
   * 验证环境变量
   */
  async validateEnvironmentVariables(variables: EnvironmentVariable[]): Promise<ValidationResult> {
    const errors: Array<{ key: string; message: string; severity: 'error' | 'warning' }> = [];

    try {
      // 获取验证规则
      const rulesStmt = this.db.prepare('SELECT * FROM environment_validation_rules');
      const rules = rulesStmt.all() as any[];

      for (const variable of variables) {
        // 查找匹配的验证规则
        const matchingRules = rules.filter(rule => {
          if (rule.key_pattern === variable.key) return true;
          if (rule.key_pattern.includes('*')) {
            const pattern = rule.key_pattern.replace('*', '.*');
            const regex = new RegExp(pattern, 'i');
            return regex.test(variable.key);
          }
          return false;
        });

        for (const rule of matchingRules) {
          // 必填验证
          if (rule.required && (!variable.value || variable.value.trim() === '')) {
            errors.push({
              key: variable.key,
              message: '必填字段不能为空',
              severity: 'error'
            });
            continue;
          }

          // 跳过空值的其他验证
          if (!variable.value || variable.value.trim() === '') continue;

          // 类型验证
          switch (rule.type) {
            case 'number':
              if (isNaN(Number(variable.value))) {
                errors.push({
                  key: variable.key,
                  message: '必须是有效的数字',
                  severity: 'error'
                });
              } else {
                const num = Number(variable.value);
                if (rule.min_length && num < rule.min_length) {
                  errors.push({
                    key: variable.key,
                    message: `数值不能小于 ${rule.min_length}`,
                    severity: 'error'
                  });
                }
                if (rule.max_length && num > rule.max_length) {
                  errors.push({
                    key: variable.key,
                    message: `数值不能大于 ${rule.max_length}`,
                    severity: 'error'
                  });
                }
              }
              break;

            case 'url':
              try {
                new URL(variable.value);
              } catch {
                errors.push({
                  key: variable.key,
                  message: '必须是有效的URL格式',
                  severity: 'error'
                });
              }
              break;

            case 'email':
              const emailPattern = /^[^@]+@[^@]+\.[^@]+$/;
              if (!emailPattern.test(variable.value)) {
                errors.push({
                  key: variable.key,
                  message: '必须是有效的邮箱格式',
                  severity: 'error'
                });
              }
              break;

            case 'path':
              if (variable.value && !path.isAbsolute(variable.value) && !variable.value.startsWith('./')) {
                errors.push({
                  key: variable.key,
                  message: '建议使用绝对路径或相对路径格式',
                  severity: 'warning'
                });
              }
              break;
          }

          // 正则表达式验证
          if (rule.pattern) {
            const regex = new RegExp(rule.pattern);
            if (!regex.test(variable.value)) {
              errors.push({
                key: variable.key,
                message: `格式不符合要求`,
                severity: 'error'
              });
            }
          }

          // 允许值验证
          if (rule.allowed_values) {
            const allowedValues = JSON.parse(rule.allowed_values);
            if (!allowedValues.includes(variable.value)) {
              errors.push({
                key: variable.key,
                message: `值必须是以下之一: ${allowedValues.join(', ')}`,
                severity: 'error'
              });
            }
          }

          // 长度验证
          if (rule.min_length && variable.value.length < rule.min_length) {
            errors.push({
              key: variable.key,
              message: `长度不能少于 ${rule.min_length} 个字符`,
              severity: 'error'
            });
          }

          if (rule.max_length && variable.value.length > rule.max_length) {
            errors.push({
              key: variable.key,
              message: `长度不能超过 ${rule.max_length} 个字符`,
              severity: 'error'
            });
          }
        }
      }

      return {
        isValid: errors.filter(e => e.severity === 'error').length === 0,
        errors
      };
    } catch (error) {
      logger.error('Failed to validate environment variables', { error });
      return {
        isValid: false,
        errors: [{
          key: 'validation',
          message: '验证过程发生错误',
          severity: 'error'
        }]
      };
    }
  }

  /**
   * 生成环境变量文件(.env)
   */
  async generateEnvFile(profileId: string, filePath: string): Promise<void> {
    try {
      const profile = await this.getProfile(profileId);
      if (!profile) {
        throw new Error('Environment profile not found');
      }

      const envContent = profile.variables
        .map(variable => {
          const value = variable.sensitive && !variable.value 
            ? '# SENSITIVE_VALUE_PLACEHOLDER' 
            : variable.value;
          const comment = variable.description ? `# ${variable.description}` : '';
          return `${comment}\n${variable.key}=${value}\n`;
        })
        .join('\n');

      await fs.writeFile(filePath, envContent, 'utf-8');
      
      logger.info('Environment file generated', { profileId, filePath });
    } catch (error) {
      logger.error('Failed to generate environment file', { error, profileId, filePath });
      throw error;
    }
  }

  /**
   * 从模板创建环境配置
   */
  async createFromTemplate(templateId: string, appId: string, customizations: Partial<EnvironmentProfile>): Promise<string> {
    try {
      const templateStmt = this.db.prepare('SELECT * FROM environment_templates WHERE id = ?');
      const templateRow = templateStmt.get(templateId) as any;

      if (!templateRow) {
        throw new Error('Environment template not found');
      }

      const profile: Omit<EnvironmentProfile, 'id' | 'createdAt' | 'updatedAt'> = {
        name: customizations.name || `${templateRow.name} - ${appId}`,
        description: customizations.description || templateRow.description,
        appId,
        isDefault: customizations.isDefault || false,
        variables: customizations.variables || JSON.parse(templateRow.variables_json),
        parameters: customizations.parameters || JSON.parse(templateRow.parameters_json),
        createdBy: customizations.createdBy
      };

      return await this.createProfile(profile);
    } catch (error) {
      logger.error('Failed to create environment profile from template', { error, templateId, appId });
      throw error;
    }
  }

  /**
   * 获取环境模板
   */
  async getTemplates(): Promise<EnvironmentTemplate[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM environment_templates 
        ORDER BY is_builtin DESC, category, created_at DESC
      `);
      
      const rows = stmt.all() as any[];
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        techStack: row.tech_stack,
        variables: JSON.parse(row.variables_json),
        parameters: JSON.parse(row.parameters_json),
        isBuiltin: row.is_builtin === 1,
        createdAt: new Date(row.created_at)
      }));
    } catch (error) {
      logger.error('Failed to get environment templates', { error });
      return [];
    }
  }

  /**
   * 清除默认配置文件标记
   */
  private async clearDefaultProfile(appId: string): Promise<void> {
    const stmt = this.db.prepare('UPDATE environment_profiles SET is_default = 0 WHERE app_id = ?');
    stmt.run(appId);
  }

  /**
   * 存储敏感环境变量（加密）
   */
  private async storeSensitiveVariables(profileId: string, variables: EnvironmentVariable[]): Promise<void> {
    try {
      // 删除现有的敏感变量
      const deleteStmt = this.db.prepare('DELETE FROM encrypted_environment_values WHERE profile_id = ?');
      deleteStmt.run(profileId);

      // 存储新的敏感变量（这里简化实现，实际应该使用真正的加密）
      const insertStmt = this.db.prepare(`
        INSERT INTO encrypted_environment_values 
        (id, profile_id, key_name, encrypted_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      
      for (const variable of variables) {
        if (variable.sensitive && variable.value) {
          // 简单的base64编码（实际应该使用真正的加密算法）
          const encryptedValue = Buffer.from(variable.value).toString('base64');
          
          insertStmt.run(
            uuidv4(),
            profileId,
            variable.key,
            encryptedValue,
            now,
            now
          );
        }
      }
    } catch (error) {
      logger.error('Failed to store sensitive variables', { error, profileId });
    }
  }

  /**
   * 加载包含敏感数据的环境变量
   */
  private async loadVariablesWithSensitiveData(profileId: string, variables: EnvironmentVariable[]): Promise<EnvironmentVariable[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM encrypted_environment_values WHERE profile_id = ?');
      const sensitiveRows = stmt.all(profileId) as any[];
      
      const sensitiveMap = new Map<string, string>();
      for (const row of sensitiveRows) {
        // 解密（这里是简单的base64解码）
        const decryptedValue = Buffer.from(row.encrypted_value, 'base64').toString('utf-8');
        sensitiveMap.set(row.key_name, decryptedValue);
      }

      return variables.map(variable => {
        if (variable.sensitive && sensitiveMap.has(variable.key)) {
          return {
            ...variable,
            value: sensitiveMap.get(variable.key) || variable.value
          };
        }
        return variable;
      });
    } catch (error) {
      logger.error('Failed to load sensitive variables', { error, profileId });
      return variables;
    }
  }
}