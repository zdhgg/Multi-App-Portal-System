import { apiService } from './api'
import type { ApiResponse } from './api'

export interface DynamicPortConfiguration {
  frontend?: number
  backend?: number
  api?: number
  websocket?: number
}

export interface TechStackConfigOptions {
  techStack: string
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

export interface PortConfigurationResult {
  appId: string
  ports: DynamicPortConfiguration
  configuredAt: string
}

/**
 * 应用配置管理API服务
 */
const APP_CONFIGURATION_BASE_PATH = '/app-configurations'

export class AppConfigurationApiService {
  /**
   * 动态配置应用端口
   */
  async configureAppPorts(appId: string, ports: DynamicPortConfiguration): Promise<ApiResponse<PortConfigurationResult>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/${appId}/configure-ports`, ports)
  }

  /**
   * 回滚应用配置
   */
  async rollbackConfiguration(appId: string): Promise<ApiResponse<{ appId: string, rolledBackAt: string }>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/${appId}/rollback`)
  }

  /**
   * 获取技术栈配置选项
   */
  async getTechStackConfigOptions(techStack: string): Promise<ApiResponse<TechStackConfigOptions>> {
    return await apiService.get(`${APP_CONFIGURATION_BASE_PATH}/tech-stacks/${encodeURIComponent(techStack)}/config-options`)
  }

  /**
   * 测试端口配置
   */
  async testPortConfiguration(appPath: string, techStack: string, ports: DynamicPortConfiguration): Promise<ApiResponse<{
    appPath: string
    techStack: string
    ports: DynamicPortConfiguration
    testedAt: string
  }>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/test-port-config`, {
      appPath,
      techStack,
      ports
    })
  }

  /**
   * 清理配置备份
   */
  async clearBackups(appId: string): Promise<ApiResponse<{ appId: string, clearedAt: string }>> {
    return await apiService.delete(`${APP_CONFIGURATION_BASE_PATH}/${appId}/backups`)
  }

  /**
   * 智能端口配置建议
   * 根据应用类型和技术栈提供端口配置建议
   */
  async getPortConfigurationSuggestions(appId: string): Promise<ApiResponse<{
    suggestions: DynamicPortConfiguration
    reasoning: string[]
    alternatives: DynamicPortConfiguration[]
  }>> {
    return await apiService.get(`${APP_CONFIGURATION_BASE_PATH}/${appId}/port-suggestions`)
  }

  /**
   * 批量配置多个应用的端口
   */
  async batchConfigurePorts(configurations: Array<{
    appId: string
    ports: DynamicPortConfiguration
  }>): Promise<ApiResponse<{
    successful: string[]
    failed: Array<{ appId: string, error: string }>
    summary: {
      total: number
      successful: number
      failed: number
    }
  }>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/batch-configure-ports`, {
      configurations
    })
  }

  /**
   * 验证端口配置
   * 检查端口是否可用，是否与其他应用冲突
   */
  async validatePortConfiguration(ports: DynamicPortConfiguration): Promise<ApiResponse<{
    valid: boolean
    conflicts: Array<{
      port: number
      reason: string
      conflictingApp?: string
    }>
    warnings: string[]
    suggestions: DynamicPortConfiguration
  }>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/validate-ports`, { ports })
  }

  /**
   * 获取应用当前的端口配置
   */
  async getCurrentPortConfiguration(appId: string): Promise<ApiResponse<{
    appId: string
    currentPorts: DynamicPortConfiguration
    configuredPorts: DynamicPortConfiguration
    lastConfiguredAt?: string
    hasBackup: boolean
  }>> {
    return await apiService.get(`${APP_CONFIGURATION_BASE_PATH}/${appId}/current-ports`)
  }

  /**
   * 预览端口配置更改
   * 显示配置更改将影响哪些文件
   */
  async previewPortConfiguration(appId: string, ports: DynamicPortConfiguration): Promise<ApiResponse<{
    appId: string
    ports: DynamicPortConfiguration
    affectedFiles: Array<{
      filePath: string
      changes: Array<{
        key: string
        oldValue: string
        newValue: string
      }>
    }>
    warnings: string[]
  }>> {
    return await apiService.post(`${APP_CONFIGURATION_BASE_PATH}/${appId}/preview-port-config`, { ports })
  }
}

export const appConfigurationApiService = new AppConfigurationApiService()
