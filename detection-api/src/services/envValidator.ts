/**
 * 环境变量验证器
 * 负责验证、生成和修复应用的环境变量配置
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

// ==================== 类型定义 ====================

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
  warnings: string[];
  autoFixable: boolean;
}

export interface EnvRequirement {
  key: string;
  required: boolean;
  minLength?: number;
  pattern?: RegExp;
  description?: string;
  defaultGenerator?: () => string;
}

export interface EnvFixResult {
  [key: string]: string;
}

// ==================== 环境变量验证器类 ====================

export class EnvValidator {
  /**
   * 从应用目录读取环境变量文件（不会写入 process.env）
   * 加载顺序：.env -> .env.production -> .env.local（后者覆盖前者）
   */
  private loadEnvFromFiles(appPath: string): Record<string, string> {
    const envFiles = ['.env', '.env.production', '.env.local']
    const merged: Record<string, string> = {}

    for (const fileName of envFiles) {
      const envFilePath = path.join(appPath, fileName)
      if (!fs.existsSync(envFilePath)) continue

      try {
        const content = fs.readFileSync(envFilePath, 'utf-8')
        Object.assign(merged, this.parseEnvFile(content))
      } catch (error) {
        logger.warn('读取环境变量文件失败（忽略）', {
          envFilePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return merged
  }

  /**
   * 判断是否为敏感变量（避免从门户自身 process.env 误继承）
   */
  private isSensitiveKey(key: string): boolean {
    return /(SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CERT)/i.test(key)
  }

  /**
   * 验证应用的环境变量
   */
  async validate(
    appPath: string,
    currentEnv: Record<string, any> = {}
  ): Promise<EnvValidationResult> {
    try {
      // 检测应用的环境变量需求
      const requirements = await this.detectEnvRequirements(appPath);
      const fileEnv = this.loadEnvFromFiles(appPath)
      const effectiveEnv = { ...fileEnv, ...currentEnv }
      
      const missing: string[] = [];
      const invalid: string[] = [];
      const warnings: string[] = [];

      // 验证每个必需的环境变量
      for (const req of requirements) {
        const value =
          effectiveEnv[req.key] ??
          (!this.isSensitiveKey(req.key) ? process.env[req.key] : undefined)

        if (!value) {
          if (req.required) {
            missing.push(req.key);
          } else {
            warnings.push(`可选环境变量 ${req.key} 未设置`);
          }
          continue;
        }

        // 验证长度
        if (req.minLength && value.length < req.minLength) {
          invalid.push(`${req.key} 长度不足（需要至少 ${req.minLength} 个字符，当前 ${value.length} 个）`);
        }

        // 验证格式
        if (req.pattern && !req.pattern.test(value)) {
          invalid.push(`${req.key} 格式不正确`);
        }
      }

      const valid = missing.length === 0 && invalid.length === 0;
      const autoFixable = missing.every(key => {
        const req = requirements.find(r => r.key === key);
        return req?.defaultGenerator !== undefined;
      });

      return {
        valid,
        missing,
        invalid,
        warnings,
        autoFixable
      };

    } catch (error) {
      logger.error('环境变量验证失败', { error, appPath });
      return {
        valid: false,
        missing: [],
        invalid: ['验证过程出错'],
        warnings: [],
        autoFixable: false
      };
    }
  }

  /**
   * 自动修复环境变量
   */
  async autoFix(
    appPath: string,
    currentEnv: Record<string, any> = {}
  ): Promise<EnvFixResult> {
    const requirements = await this.detectEnvRequirements(appPath);
    const fileEnv = this.loadEnvFromFiles(appPath)
    const effectiveEnv = { ...fileEnv, ...currentEnv }
    const fixes: EnvFixResult = {};

    for (const req of requirements) {
      const value =
        effectiveEnv[req.key] ??
        (!this.isSensitiveKey(req.key) ? process.env[req.key] : undefined)

      // 如果缺失且有默认生成器
      if (!value && req.defaultGenerator) {
        const generated = req.defaultGenerator();
        fixes[req.key] = generated;
        logger.info(`自动生成环境变量 ${req.key}`, { length: generated.length });
      }

      // 如果值无效且有默认生成器
      else if (value) {
        let needsRegenerate = false;

        if (req.minLength && value.length < req.minLength) {
          needsRegenerate = true;
        }

        if (req.pattern && !req.pattern.test(value)) {
          needsRegenerate = true;
        }

        if (needsRegenerate && req.defaultGenerator) {
          const generated = req.defaultGenerator();
          fixes[req.key] = generated;
          logger.warn(`重新生成无效的环境变量 ${req.key}`, { 
            oldLength: value.length,
            newLength: generated.length 
          });
        }
      }
    }

    return fixes;
  }

  /**
   * 检测应用的环境变量需求
   */
  async detectEnvRequirements(appPath: string): Promise<EnvRequirement[]> {
    const requirements: EnvRequirement[] = [];

    // 1. 尝试读取 .env.example 文件
    const envExamplePath = path.join(appPath, '.env.example');
    if (fs.existsSync(envExamplePath)) {
      const exampleContent = fs.readFileSync(envExamplePath, 'utf-8');
      const exampleVars = this.parseEnvFile(exampleContent);

      for (const key of Object.keys(exampleVars)) {
        requirements.push(this.createRequirement(key, exampleVars[key]));
      }
    }

    // 2. 分析 package.json 依赖，推断可能的环境变量需求
    const packageJsonPath = path.join(appPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // 如果使用 JWT 相关库，需要 JWT_SECRET
      if (deps['jsonwebtoken'] || deps['@nestjs/jwt'] || deps['express-jwt']) {
        if (!requirements.some(r => r.key === 'JWT_SECRET')) {
          requirements.push({
            key: 'JWT_SECRET',
            required: true,
            minLength: 32,
            description: 'JWT签名密钥',
            defaultGenerator: () => this.generateJwtSecret()
          });
        }
      }

      // 如果使用数据库，可能需要数据库配置
      if (deps['pg'] || deps['mysql2'] || deps['mongodb']) {
        if (!requirements.some(r => r.key === 'DATABASE_URL')) {
          requirements.push({
            key: 'DATABASE_URL',
            required: false,
            description: '数据库连接URL'
          });
        }
      }
    }

    // 3. 通用的必需环境变量
    if (!requirements.some(r => r.key === 'NODE_ENV')) {
      requirements.push({
        key: 'NODE_ENV',
        required: true,
        description: '运行环境',
        defaultGenerator: () => 'production'
      });
    }

    return requirements;
  }

  /**
   * 解析 .env 文件内容
   */
  private parseEnvFile(content: string): Record<string, string> {
    const env: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过注释和空行
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const key = match[1];
        const value = match[2].trim();
        env[key] = value;
      }
    }

    return env;
  }

  /**
   * 根据键和示例值创建环境变量需求
   */
  private createRequirement(key: string, exampleValue: string): EnvRequirement {
    const req: EnvRequirement = {
      key,
      required: true,
      description: `环境变量 ${key}`
    };

    // 根据键名推断要求
    if (key.includes('SECRET') || key.includes('KEY')) {
      req.minLength = 32;
      req.description = `密钥 - ${key}`;
      
      if (key.includes('JWT')) {
        req.defaultGenerator = () => this.generateJwtSecret();
      } else {
        req.defaultGenerator = () => this.generateRandomSecret(32);
      }
    }

    if (key.includes('PORT')) {
      req.pattern = /^\d+$/;
      req.description = `端口号 - ${key}`;
    }

    if (key.includes('URL') || key.includes('HOST')) {
      req.description = `URL或主机 - ${key}`;
    }

    // 如果示例值为空或占位符，标记为可选
    if (!exampleValue || exampleValue === '' || 
        exampleValue.includes('your-') || 
        exampleValue.includes('<') || 
        exampleValue.includes('example')) {
      req.required = false;
    }

    return req;
  }

  /**
   * 生成 JWT 密钥
   * 使用 crypto.randomBytes 生成 64 字符的十六进制字符串
   */
  generateJwtSecret(): string {
    return crypto.randomBytes(32).toString('hex'); // 32 bytes = 64 hex chars
  }

  /**
   * 生成随机密钥
   */
  private generateRandomSecret(length: number): string {
    const bytes = Math.ceil(length / 2);
    return crypto.randomBytes(bytes).toString('hex').slice(0, length);
  }

  /**
   * 将环境变量持久化到 .env 文件
   */
  async persistEnvToFile(
    appPath: string,
    env: Record<string, string>
  ): Promise<void> {
    try {
      const envFilePath = path.join(appPath, '.env');
      
      // 读取现有的 .env 文件（如果存在）
      let existingEnv: Record<string, string> = {};
      if (fs.existsSync(envFilePath)) {
        const content = fs.readFileSync(envFilePath, 'utf-8');
        existingEnv = this.parseEnvFile(content);
      }

      // 合并新的环境变量
      const mergedEnv = { ...existingEnv, ...env };

      // 生成 .env 文件内容
      const lines: string[] = [
        '# 环境变量配置',
        `# 自动生成时间: ${new Date().toISOString()}`,
        ''
      ];

      for (const [key, value] of Object.entries(mergedEnv)) {
        lines.push(`${key}=${value}`);
      }

      // 写入文件
      fs.writeFileSync(envFilePath, lines.join('\n'), 'utf-8');
      
      logger.info('环境变量已持久化到 .env 文件', { 
        path: envFilePath,
        keys: Object.keys(env)
      });

    } catch (error) {
      logger.error('持久化环境变量失败', { error, appPath });
      throw error;
    }
  }

  /**
   * 验证并自动修复（一步到位）
   */
  async validateAndAutoFix(
    appPath: string,
    currentEnv: Record<string, any> = {}
  ): Promise<{
    validation: EnvValidationResult;
    fixes: EnvFixResult;
    mergedEnv: Record<string, any>;
  }> {
    const fileEnv = this.loadEnvFromFiles(appPath)
    const effectiveCurrentEnv = { ...fileEnv, ...currentEnv }

    // 先验证
    const validation = await this.validate(appPath, effectiveCurrentEnv);

    // 如果需要修复
    let fixes: EnvFixResult = {};
    if (!validation.valid && validation.autoFixable) {
      fixes = await this.autoFix(appPath, effectiveCurrentEnv);
    }

    // 合并环境变量
    const mergedEnv = { ...effectiveCurrentEnv, ...fixes };

    return {
      validation,
      fixes,
      mergedEnv
    };
  }
}

// 导出单例
export const envValidator = new EnvValidator();
