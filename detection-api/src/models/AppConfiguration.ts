/**
 * Application Configuration Model
 * 应用配置数据模型
 */

export interface EnvironmentVariable {
  key: string;
  value: string;
  description?: string;
  required: boolean;
  sensitive: boolean; // 是否为敏感信息（密码、API密钥等）
}

export interface StartupParameter {
  name: string;
  value: string;
  description?: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'path';
}

export interface PortConfiguration {
  port: number;
  type: 'frontend' | 'backend' | 'api' | 'websocket';
  protocol: 'http' | 'https' | 'ws' | 'wss';
  description?: string;
  autoAllocate: boolean;
  preferredRange?: {
    start: number;
    end: number;
  };
}

export interface BuildConfiguration {
  buildCommand?: string;
  buildDirectory?: string;
  outputDirectory?: string;
  preInstallCommand?: string;
  postBuildCommand?: string;
  dependencies?: string[];
}

export interface RuntimeConfiguration {
  nodeVersion?: string;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  startupTimeout: number; // 启动超时时间（毫秒）
  healthCheckUrl?: string;
  healthCheckInterval: number;
  restartOnFailure: boolean;
  maxRestartAttempts: number;
}

export interface AppConfiguration {
  id: string;
  appId: string;
  name: string;
  description?: string;
  version: string;
  
  // 基础配置
  workingDirectory: string;
  startCommand: string;
  stopCommand?: string;
  accessPath?: string;
  
  // 端口配置
  ports: PortConfiguration[];
  
  // 环境变量
  environmentVariables: EnvironmentVariable[];
  
  // 启动参数
  startupParameters: StartupParameter[];
  
  // 构建配置
  buildConfig: BuildConfiguration;
  
  // 运行时配置
  runtimeConfig: RuntimeConfiguration;
  
  // 元数据
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  tags: string[];
  
  // 配置状态
  isActive: boolean;
  lastValidated?: Date;
  validationErrors?: string[];
}

export interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  techStack: string;
  category: 'frontend' | 'backend' | 'fullstack' | 'static' | 'api';
  template: Partial<AppConfiguration>;
  createdAt: Date;
  isBuiltin: boolean;
}

export interface ConfigurationHistory {
  id: string;
  appId: string;
  configId: string;
  changeType: 'created' | 'updated' | 'deleted' | 'imported' | 'exported';
  changes: Record<string, any>;
  changedBy?: string;
  changedAt: Date;
  reason?: string;
}

// 配置验证结果
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

// 配置导入导出格式
export interface ConfigurationExport {
  version: string;
  exportedAt: Date;
  exportedBy?: string;
  configurations: AppConfiguration[];
  templates?: ConfigurationTemplate[];
  metadata: {
    sourceSystem: string;
    sourceVersion: string;
    totalConfigurations: number;
  };
}
