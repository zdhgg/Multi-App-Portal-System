import { apiService } from './api'
import type { ApiResponse } from './api'

// 应用配置相关的类型定义
export interface EnvironmentVariable {
  key: string
  value: string
  description?: string
  required: boolean
  sensitive: boolean // 是否为敏感信息（密码、API密钥等）
}

export interface StartupParameter {
  name: string
  value: string
  description?: string
  required: boolean
  type: 'string' | 'number' | 'boolean' | 'path'
}

export interface PortConfiguration {
  port: number
  type: 'frontend' | 'backend' | 'api' | 'websocket'
  protocol: 'http' | 'https' | 'ws' | 'wss'
  description?: string
  autoAllocate: boolean
  preferredRange?: {
    start: number
    end: number
  }
}

export interface BuildConfiguration {
  buildCommand?: string
  buildDirectory?: string
  outputDirectory?: string
  preInstallCommand?: string
  postBuildCommand?: string
  dependencies?: string[]
}

export interface RuntimeConfiguration {
  nodeVersion?: string
  packageManager: 'npm' | 'yarn' | 'pnpm'
  launchMethod?: 'development' | 'production' // 启动模式：开发模式（直接启动）或生产模式（PM2守护）
  startupTimeout: number // 启动超时时间（毫秒）
  healthCheckUrl?: string
  healthCheckInterval: number
  restartOnFailure: boolean
  maxRestartAttempts: number
}

export interface AppConfiguration {
  id?: string
  appId: string
  name: string
  description?: string
  version: string
  
  // 基础配置
  workingDirectory: string
  startCommand: string
  stopCommand?: string
  accessPath?: string
  
  // 端口配置
  ports: PortConfiguration[]
  
  // 环境变量
  environmentVariables: EnvironmentVariable[]
  
  // 启动参数
  startupParameters: StartupParameter[]
  
  // 构建配置
  buildConfig: BuildConfiguration
  
  // 运行时配置
  runtimeConfig: RuntimeConfiguration
  
  // 元数据
  createdAt?: Date
  updatedAt?: Date
  createdBy?: string
  tags: string[]
  
  // 配置状态
  isActive: boolean
  lastValidated?: Date
  validationErrors?: string[]
}

export interface ConfigurationTemplate {
  id: string
  name: string
  description: string
  techStack: string
  category: 'frontend' | 'backend' | 'fullstack' | 'static' | 'api'
  template: Partial<AppConfiguration>
  createdAt: Date
  isBuiltin: boolean
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  code: string
}

// 应用配置API服务类
export class AppConfigApiService {

  /**
   * 获取应用的配置
   */
  async getAppConfiguration(appId: string): Promise<ApiResponse<AppConfiguration>> {
    // 后端返回的是该应用的配置列表（按创建时间降序），这里取最新的一条供页面使用
    const resp = await apiService.get<ApiResponse<AppConfiguration[]>>(`/app-configurations/app/${appId}`, {
      requireAuth: true
    })
    const list = (resp && Array.isArray(resp.data)) ? resp.data : []
    const latest = list.length > 0 ? list[0] : undefined
    return { success: true, data: latest }
  }

  /**
   * 获取配置详情
   */
  async getConfiguration(configId: string): Promise<ApiResponse<AppConfiguration>> {
    return apiService.get<ApiResponse<AppConfiguration>>(`/app-configurations/${configId}`, {
      requireAuth: true
    })
  }

  /**
   * 创建应用配置
   */
  async createConfiguration(config: Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<{ id: string }>> {
    return apiService.post<ApiResponse<{ id: string }>>('/app-configurations', config, {
      requireAuth: true
    })
  }

  /**
   * 更新应用配置
   */
  async updateConfiguration(configId: string, config: Partial<AppConfiguration>): Promise<ApiResponse<AppConfiguration>> {
    return apiService.put<ApiResponse<AppConfiguration>>(`/app-configurations/${configId}`, config, {
      requireAuth: true
    })
  }

  /**
   * 删除应用配置
   */
  async deleteConfiguration(configId: string): Promise<ApiResponse<void>> {
    return apiService.delete<ApiResponse<void>>(`/app-configurations/${configId}`, {
      requireAuth: true
    })
  }

  /**
   * 验证配置
   */
  async validateConfiguration(config: AppConfiguration): Promise<ApiResponse<ValidationResult>> {
    return apiService.post<ApiResponse<ValidationResult>>('/app-configurations/validate', config, {
      requireAuth: true
    })
  }

  /**
   * 获取配置模板列表
   */
  async getConfigurationTemplates(techStack?: string): Promise<ApiResponse<ConfigurationTemplate[]>> {
    const params = techStack ? `?techStack=${encodeURIComponent(techStack)}` : ''
    return apiService.get<ApiResponse<ConfigurationTemplate[]>>(`/app-configurations/templates/list${params}`, {
      requireAuth: true
    })
  }

  /**
   * 根据模板创建配置
   */
  async createConfigurationFromTemplate(
    templateId: string, 
    appId: string, 
    customizations?: Partial<AppConfiguration>
  ): Promise<ApiResponse<{ id: string }>> {
    return apiService.post<ApiResponse<{ id: string }>>(`/app-configurations/from-template/${templateId}`, {
      appId,
      customizations
    }, {
      requireAuth: true
    })
  }

  /**
   * 获取配置历史
   */
  async getConfigurationHistory(appId: string): Promise<ApiResponse<any[]>> {
    return apiService.get<ApiResponse<any[]>>(`/app-configurations/app/${appId}/history`, {
      requireAuth: true
    })
  }

  /**
   * 应用配置（激活配置）
   */
  async applyConfiguration(configId: string): Promise<ApiResponse<void>> {
    return apiService.post<ApiResponse<void>>(`/app-configurations/${configId}/apply`, {}, {
      requireAuth: true
    })
  }

  /**
   * 导出配置
   */
  async exportConfiguration(configId: string): Promise<ApiResponse<any>> {
    return apiService.get<ApiResponse<any>>(`/app-configurations/${configId}/export`, {
      requireAuth: true
    })
  }

  /**
   * 导入配置
   */
  async importConfiguration(appId: string, configData: any): Promise<ApiResponse<{ id: string }>> {
    return apiService.post<ApiResponse<{ id: string }>>(`/app-configurations/import`, {
      appId,
      configData
    }, {
      requireAuth: true
    })
  }

  /**
   * 获取默认配置（基于技术栈）
   */
  getDefaultConfiguration(techStack: string, appName: string, workingDirectory: string): AppConfiguration {
    const baseConfig: AppConfiguration = {
      appId: '',
      name: `${appName} 配置`,
      description: `${appName} 的应用配置`,
      version: '1.0.0',
      workingDirectory,
      startCommand: this.getDefaultStartCommand(techStack),
      stopCommand: '',
      accessPath: '',
      ports: this.getDefaultPorts(techStack),
      environmentVariables: this.getDefaultEnvironmentVariables(techStack),
      startupParameters: [],
      buildConfig: this.getDefaultBuildConfig(techStack),
      runtimeConfig: this.getDefaultRuntimeConfig(techStack),
      tags: [techStack],
      isActive: true
    }

    return baseConfig
  }

  /**
   * 获取默认启动命令
   */
  private getDefaultStartCommand(techStack: string): string {
    const commands: Record<string, string> = {
      'Vue': 'npm run dev',
      'React': 'npm start',
      'Angular': 'ng serve',
      'Node.js': 'npm start',
      'Express': 'npm start',
      'Next.js': 'npm run dev',
      'Nuxt.js': 'npm run dev',
      'Svelte': 'npm run dev',
      'Static': 'npx serve dist'
    }
    
    return commands[techStack] || 'npm start'
  }

  /**
   * 获取默认端口配置
   */
  private getDefaultPorts(techStack: string): PortConfiguration[] {
    const portConfigs: Record<string, PortConfiguration[]> = {
      'Vue': [{
        port: 5173,
        type: 'frontend',
        protocol: 'http',
        description: 'Vue开发服务器端口',
        autoAllocate: true,
        preferredRange: { start: 3001, end: 3100 }
      }],
      'React': [{
        port: 3000,
        type: 'frontend',
        protocol: 'http',
        description: 'React开发服务器端口',
        autoAllocate: true,
        preferredRange: { start: 3001, end: 3100 }
      }],
      'Node.js': [{
        port: 3000,
        type: 'backend',
        protocol: 'http',
        description: 'Node.js服务端口',
        autoAllocate: true,
        preferredRange: { start: 8001, end: 8100 }
      }]
    }
    
    return portConfigs[techStack] || [{
      port: 3000,
      type: 'frontend',
      protocol: 'http',
      description: '应用端口',
      autoAllocate: true,
      preferredRange: { start: 3001, end: 3100 }
    }]
  }

  /**
   * 获取默认环境变量
   */
  private getDefaultEnvironmentVariables(techStack: string): EnvironmentVariable[] {
    const envVars: Record<string, EnvironmentVariable[]> = {
      'Vue': [
        { key: 'VITE_APP_TITLE', value: '', description: '应用标题', required: false, sensitive: false },
        { key: 'VITE_API_URL', value: '', description: 'API服务器地址', required: false, sensitive: false }
      ],
      'React': [
        { key: 'REACT_APP_API_URL', value: '', description: 'API服务器地址', required: false, sensitive: false },
        { key: 'PORT', value: '3000', description: '应用端口', required: false, sensitive: false }
      ],
      'Node.js': [
        { key: 'NODE_ENV', value: 'development', description: '运行环境', required: true, sensitive: false },
        { key: 'PORT', value: '3000', description: '服务端口', required: true, sensitive: false }
      ]
    }
    
    return envVars[techStack] || [
      { key: 'NODE_ENV', value: 'development', description: '运行环境', required: false, sensitive: false }
    ]
  }

  /**
   * 获取默认构建配置
   */
  private getDefaultBuildConfig(techStack: string): BuildConfiguration {
    const buildConfigs: Record<string, BuildConfiguration> = {
      'Vue': {
        buildCommand: 'npm run build',
        buildDirectory: '.',
        outputDirectory: 'dist',
        preInstallCommand: 'npm install'
      },
      'React': {
        buildCommand: 'npm run build',
        buildDirectory: '.',
        outputDirectory: 'build',
        preInstallCommand: 'npm install'
      },
      'Node.js': {
        preInstallCommand: 'npm install'
      }
    }
    
    return buildConfigs[techStack] || {
      preInstallCommand: 'npm install'
    }
  }

  /**
   * 获取默认运行时配置
   */
  private getDefaultRuntimeConfig(techStack: string): RuntimeConfiguration {
    return {
      packageManager: 'npm',
      launchMethod: 'development', // 默认使用开发模式（直接启动）
      startupTimeout: 30000,
      healthCheckInterval: 10000,
      restartOnFailure: true,
      maxRestartAttempts: 3
    }
  }
}

// 导出服务实例
export const appConfigApiService = new AppConfigApiService()
