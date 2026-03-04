import { existsSync, readFileSync, writeFileSync, mkdirSync, watch } from 'fs'
import { join, dirname } from 'path'
import { logger } from '../utils/logger.js'
import { EventEmitter } from 'events'

/**
 * 端口配置接口
 */
export interface PortConfiguration {
  frontendRange: {
    start: number
    end: number
    description: string
  }
  backendRange: {
    start: number
    end: number
    description: string
  }
  reservedPorts: Array<{
    port: number
    description: string
    category: string
  }>
  allocationPolicy: {
    randomizeStartPort: boolean
    description: string
    maxRetries: number
    retryDelayMs: number
    conflictResolution: string
  }
  monitoring: {
    healthCheckIntervalMs: number
    stalePortCheckIntervalMs: number
    portUtilizationWarningThreshold: number
    portUtilizationCriticalThreshold: number
    enableRealTimeMonitoring: boolean
  }
}

export interface ApplicationConfiguration {
  defaultTechStackPorts: Record<string, { frontend: number | null, backend: number | null }>
  startupTimeout: number
  shutdownTimeout: number
  environmentVariables: Record<string, string>
}

export interface SystemConfiguration {
  dataDirectory: string
  logsDirectory: string
  backupRetentionDays: number
  configBackupIntervalHours: number
  enableConfigHistory: boolean
  maxConfigHistoryEntries: number
}

export interface SecurityConfiguration {
  allowPortRangeModification: boolean
  requireConfirmationForCriticalChanges: boolean
  allowedConfigModifiers: string[]
  configChangeAuditLog: boolean
  validateConfigIntegrity: boolean
}

export interface UIConfiguration {
  theme: { primaryColor: string, darkMode: boolean }
  dashboard: { refreshIntervalMs: number }
  portManagement: { showPortUsageChart: boolean }
}

export interface NotificationConfiguration {
  enabled: boolean
  channels: { log: { enabled: boolean } }
  events: Record<string, any>
}

export interface PerformanceConfiguration {
  caching: { enablePortStatusCache: boolean }
  optimization: { batchPortChecks: boolean }
}

export interface ExperimentalConfiguration {
  [key: string]: any
}

export interface CompleteConfiguration {
  portConfiguration: PortConfiguration
  applicationConfiguration: ApplicationConfiguration
  systemConfiguration: SystemConfiguration
  securityConfiguration: SecurityConfiguration
  ui: UIConfiguration
  notifications: NotificationConfiguration
  performance: PerformanceConfiguration
  experimental: ExperimentalConfiguration
}

/**
 * 配置管理器类
 */
export class ConfigManager extends EventEmitter {
  private configPath: string
  private currentConfig: CompleteConfiguration | null = null
  private configWatcher: any = null
  private readonly enableFileWatching: boolean = true
  private isLoading: boolean = false

  constructor(configPath: string = join(process.cwd(), 'config', 'system-config.json')) {
    super()
    this.configPath = configPath
  }

  /**
   * 获取基础默认配置
   */
  private getBasicDefaultConfig(): CompleteConfiguration {
    return {
      portConfiguration: {
        frontendRange: {
          start: 3001,
          end: 3100,
          description: '前端应用端口范围'
        },
        backendRange: {
          start: 8001,
          end: 8100,
          description: '后端应用端口范围'
        },
        reservedPorts: [
          { port: 22, description: 'SSH', category: 'system' },
          { port: 80, description: 'HTTP', category: 'system' },
          { port: 443, description: 'HTTPS', category: 'system' },
          { port: 3000, description: '门户系统主服务', category: 'portal' },
          { port: 8002, description: '门户系统后端API', category: 'portal' }
        ],
        allocationPolicy: {
          randomizeStartPort: true,
          description: '随机选择起始端口以避免总是从最小端口开始分配',
          maxRetries: 3,
          retryDelayMs: 100,
          conflictResolution: 'auto_reassign'
        },
        monitoring: {
          healthCheckIntervalMs: 60000,
          stalePortCheckIntervalMs: 300000,
          portUtilizationWarningThreshold: 80,
          portUtilizationCriticalThreshold: 95,
          enableRealTimeMonitoring: true
        }
      },
      applicationConfiguration: {
        defaultTechStackPorts: {
          'Vue 3 + Vite': { frontend: 5173, backend: null },
          'Node.js + Express': { frontend: null, backend: 3000 }
        },
        startupTimeout: 30000,
        shutdownTimeout: 10000,
        environmentVariables: {
          NODE_ENV: 'development'
        }
      },
      systemConfiguration: {
        dataDirectory: './data',
        logsDirectory: './logs',
        backupRetentionDays: 30,
        configBackupIntervalHours: 24,
        enableConfigHistory: true,
        maxConfigHistoryEntries: 50
      },
      securityConfiguration: {
        allowPortRangeModification: true,
        requireConfirmationForCriticalChanges: true,
        allowedConfigModifiers: ['admin', 'system'],
        configChangeAuditLog: true,
        validateConfigIntegrity: true
      },
      ui: {
        theme: { primaryColor: '#007bff', darkMode: false },
        dashboard: { refreshIntervalMs: 5000 },
        portManagement: { showPortUsageChart: true }
      },
      notifications: {
        enabled: true,
        channels: { log: { enabled: true } },
        events: {}
      },
      performance: {
        caching: { enablePortStatusCache: true },
        optimization: { batchPortChecks: true }
      },
      experimental: {}
    }
  }

  /**
   * 保存配置到文件
   */
  async saveConfig(config: CompleteConfiguration): Promise<void> {
    const configDir = dirname(this.configPath)
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8')
  }

  /**
   * 创建默认配置
   */
  private async createDefaultConfig(): Promise<void> {
    // 如果配置文件已存在，直接加载
    if (existsSync(this.configPath)) {
      return
    }

    try {
      // ✅ 使用统一的默认配置方法
      const defaultConfig = this.getBasicDefaultConfig()
      await this.saveConfig(defaultConfig)
      this.currentConfig = defaultConfig
      logger.info('默认配置创建成功')
    } catch (error) {
      logger.error('创建默认配置失败:', error)
      throw error
    }
  }

  /**
   * 加载配置：如果文件不存在则创建默认配置，然后加载到内存并启动文件监听
   */
  async loadConfig(): Promise<CompleteConfiguration> {
    if (this.isLoading) {
      return this.currentConfig || this.getBasicDefaultConfig()
    }
    this.isLoading = true
    try {
      if (!existsSync(this.configPath)) {
        await this.createDefaultConfig()
      }
      const raw = readFileSync(this.configPath, 'utf8')
      const parsed = JSON.parse(raw) as CompleteConfiguration
      this.currentConfig = parsed
      await this.startFileWatching()
      return parsed
    } catch (error) {
      // 回退到默认配置并保存
      logger.error('加载配置失败，使用默认配置', error as any)
      const def = this.getBasicDefaultConfig()
      await this.saveConfig(def)
      this.currentConfig = def
      await this.startFileWatching()
      return def
    } finally {
      this.isLoading = false
    }
  }

  /**
   * 返回完整配置对象（若未加载，将返回 null）
   */
  getConfig(): CompleteConfiguration | null {
    return this.currentConfig
  }

  /**
   * 和历史接口兼容，异步获取完整配置（必要时触发加载）
   */
  async getConfiguration(): Promise<CompleteConfiguration> {
    if (!this.currentConfig) {
      return await this.loadConfig()
    }
    return this.currentConfig
  }

  /**
   * 启动文件监控
   */
  private async startFileWatching(): Promise<void> {
    if (!this.enableFileWatching) {
      return
    }

    try {
      // ✅ 修复：使用动态导入替代require  
      const chokidar = await import('chokidar')
      this.configWatcher = chokidar.watch(this.configPath, { persistent: true })
      this.configWatcher.on('change', async () => {
        if (!this.isLoading) {
          logger.debug('检测到配置文件变更，重新加载配置')

          try {
            await this.loadConfig()
            this.emit('configReloaded', this.currentConfig)
          } catch (error) {
            logger.error('配置文件重新加载失败:', error)
            this.emit('configError', error)
          }
        }
      })

      logger.debug('配置文件监控已启动')

    } catch (error) {
      logger.error('启动配置文件监控失败:', error)
    }
  }

  /**
   * 停止文件监控
   */
  private stopFileWatching(): void {
    if (this.configWatcher) {
      this.configWatcher.close()
      this.configWatcher = null
      logger.debug('配置文件监控已停止')
    }
  }

  /**
   * 获取端口配置
   */
  getPortConfig(): PortConfiguration | null {
    if (!this.currentConfig) {
      logger.warn('配置未加载，无法获取端口配置')
      return null
    }

    return this.currentConfig.portConfiguration
  }

  /**
   * 获取配置统计信息
   */
  async getConfigStats(): Promise<any> {
    if (!this.currentConfig) {
      await this.loadConfig()
    }

    const config = this.currentConfig!
    const portConfig = config.portConfiguration

    // 计算统计信息
    const frontendPorts = portConfig.frontendRange.end - portConfig.frontendRange.start + 1
    const backendPorts = portConfig.backendRange.end - portConfig.backendRange.start + 1
    const totalAvailable = frontendPorts + backendPorts
    const reservedCount = portConfig.reservedPorts.length

    return {
      totalPorts: totalAvailable,
      frontendPorts,
      backendPorts,
      reservedPorts: reservedCount,
      ranges: {
        frontend: `${portConfig.frontendRange.start}-${portConfig.frontendRange.end}`,
        backend: `${portConfig.backendRange.start}-${portConfig.backendRange.end}`
      },
      monitoring: {
        enabled: portConfig.monitoring.enableRealTimeMonitoring,
        healthCheckInterval: portConfig.monitoring.healthCheckIntervalMs
      },
      allocationPolicy: {
        randomizeStartPort: portConfig.allocationPolicy.randomizeStartPort,
        conflictResolution: portConfig.allocationPolicy.conflictResolution
      }
    }
  }

  /**
   * 获取配置变更历史
   * 注意：当前简化实现，返回空数组
   * 如需完整历史记录功能，需要在updatePortRanges等方法中记录变更
   */
  getChangeHistory(limit?: number): any[] {
    // TODO: 实现完整的变更历史追踪
    // 目前返回空数组，避免500错误
    logger.info('获取配置变更历史（简化实现）', { limit })
    return []
  }

  /**
   * 更新端口范围
   */
  async updatePortRanges(
    frontendRange: { start: number; end: number },
    backendRange: { start: number; end: number },
    user: string,
    reason?: string
  ): Promise<void> {
    if (!this.currentConfig) {
      await this.loadConfig()
    }

    logger.info('更新端口范围', { frontendRange, backendRange, user, reason })

    // 验证端口范围
    if (frontendRange.start < 1024 || frontendRange.end > 65535 ||
      backendRange.start < 1024 || backendRange.end > 65535) {
      throw new Error('端口范围必须在 1024-65535 之间')
    }

    if (frontendRange.start >= frontendRange.end || backendRange.start >= backendRange.end) {
      throw new Error('端口范围起始值必须小于结束值')
    }

    // 更新配置
    this.currentConfig!.portConfiguration.frontendRange = {
      ...frontendRange,
      description: this.currentConfig!.portConfiguration.frontendRange.description
    }
    this.currentConfig!.portConfiguration.backendRange = {
      ...backendRange,
      description: this.currentConfig!.portConfiguration.backendRange.description
    }

    // 保存到文件
    await this.saveConfig(this.currentConfig!)

    // 触发事件
    this.emit('portRangesUpdated', { frontendRange, backendRange, user, reason })
  }

  /**
   * 添加保留端口
   */
  async addReservedPort(
    port: number,
    description: string,
    category: string,
    user: string
  ): Promise<void> {
    if (!this.currentConfig) {
      await this.loadConfig()
    }

    logger.info('添加保留端口', { port, description, category, user })

    // 验证端口号
    if (port < 1 || port > 65535) {
      throw new Error('端口号必须在 1-65535 之间')
    }

    // 检查是否已存在
    const exists = this.currentConfig!.portConfiguration.reservedPorts.some(p => p.port === port)
    if (exists) {
      throw new Error(`端口 ${port} 已被保留`)
    }

    // 添加保留端口
    this.currentConfig!.portConfiguration.reservedPorts.push({
      port,
      description,
      category
    })

    // 保存到文件
    await this.saveConfig(this.currentConfig!)

    // 触发事件
    this.emit('reservedPortAdded', { port, description, category, user })
  }

  /**
   * 移除保留端口
   */
  async removeReservedPort(port: number, user: string): Promise<void> {
    if (!this.currentConfig) {
      await this.loadConfig()
    }

    logger.info('移除保留端口', { port, user })

    // 查找并移除
    const index = this.currentConfig!.portConfiguration.reservedPorts.findIndex(p => p.port === port)
    if (index === -1) {
      throw new Error(`端口 ${port} 不在保留列表中`)
    }

    const removed = this.currentConfig!.portConfiguration.reservedPorts.splice(index, 1)[0]

    // 保存到文件
    await this.saveConfig(this.currentConfig!)

    // 触发事件
    this.emit('reservedPortRemoved', { port, removed, user })
  }

  /**
   * 更新监控配置
   */
  async updateMonitoringConfig(monitoring: any, user: string): Promise<void> {
    if (!this.currentConfig) {
      await this.loadConfig()
    }

    logger.info('更新监控配置', { user })

    // 更新配置（假设monitoring配置在systemConfiguration中）
    if (this.currentConfig && this.currentConfig.systemConfiguration) {
      this.currentConfig.systemConfiguration = {
        ...this.currentConfig.systemConfiguration,
        ...monitoring
      }
    }

    // 保存到文件
    await this.saveConfig(this.currentConfig!)

    // 触发事件
    this.emit('monitoringConfigUpdated', { monitoring, user })
  }

  /**
   * 关闭配置管理器
   */
  async shutdown(): Promise<void> {
    this.stopFileWatching()
    this.removeAllListeners()
    logger.info('配置管理器已关闭')
  }
}

// 创建默认实例
export const defaultConfigManager = new ConfigManager()

// 优雅关闭处理
process.on('SIGINT', async () => {
  await defaultConfigManager.shutdown()
})

process.on('SIGTERM', async () => {
  await defaultConfigManager.shutdown()
})
