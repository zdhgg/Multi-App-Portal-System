/**
 * 缓存工厂
 * 
 * 负责创建和管理缓存实例，支持配置驱动的缓存创建
 */

import { logger } from '../../utils/logger'
import { CacheConfig } from './ICacheProvider'
import { CacheManager } from './CacheManager'

export class CacheFactory {
  private static instance: CacheFactory
  private cacheManagers: Map<string, CacheManager> = new Map()
  private defaultConfig: CacheConfig

  private constructor() {
    // 默认配置
    this.defaultConfig = {
      type: 'memory',
      defaultTtl: 3600, // 1小时
      maxKeys: 1000,
      enableCompression: false,
      enableStats: true,
      cleanupInterval: 600, // 10分钟
      memory: {
        checkPeriod: 600,
        useClones: false,
        deleteOnExpire: true
      },
      redis: {
        host: 'localhost',
        port: 6379,
        db: 0,
        keyPrefix: 'detection:',
        connectTimeout: 5000,
        lazyConnect: true
      }
    }
  }

  /**
   * 获取工厂单例
   */
  static getInstance(): CacheFactory {
    if (!CacheFactory.instance) {
      CacheFactory.instance = new CacheFactory()
    }
    return CacheFactory.instance
  }

  /**
   * 创建缓存管理器
   */
  createCacheManager(name: string, config?: Partial<CacheConfig>): CacheManager {
    const finalConfig: CacheConfig = {
      ...this.defaultConfig,
      ...config
    }

    // 环境变量覆盖
    this.applyEnvironmentOverrides(finalConfig)

    const cacheManager = new CacheManager(finalConfig)
    this.cacheManagers.set(name, cacheManager)

    logger.info('缓存管理器创建成功', {
      name,
      type: finalConfig.type,
      defaultTtl: finalConfig.defaultTtl
    })

    return cacheManager
  }

  /**
   * 获取缓存管理器
   */
  getCacheManager(name: string): CacheManager | undefined {
    return this.cacheManagers.get(name)
  }

  /**
   * 获取或创建缓存管理器
   */
  getOrCreateCacheManager(name: string, config?: Partial<CacheConfig>): CacheManager {
    let manager = this.getCacheManager(name)
    if (!manager) {
      manager = this.createCacheManager(name, config)
    }
    return manager
  }

  /**
   * 创建检测专用缓存管理器
   */
  createDetectionCacheManager(config?: Partial<CacheConfig>): CacheManager {
    const detectionConfig: Partial<CacheConfig> = {
      defaultTtl: 1800, // 30分钟，检测结果相对稳定
      maxKeys: 2000, // 支持更多项目
      enableStats: true,
      ...config
    }

    return this.createCacheManager('detection', detectionConfig)
  }

  /**
   * 创建开发环境缓存配置
   */
  createDevelopmentConfig(): Partial<CacheConfig> {
    return {
      type: 'memory',
      defaultTtl: 600, // 10分钟，开发时更短的缓存时间
      maxKeys: 500,
      enableStats: true,
      memory: {
        checkPeriod: 300,
        useClones: false,
        deleteOnExpire: true
      }
    }
  }

  /**
   * 创建生产环境缓存配置
   */
  createProductionConfig(): Partial<CacheConfig> {
    return {
      type: 'redis',
      defaultTtl: 3600, // 1小时
      maxKeys: 5000,
      enableStats: true,
      enableCompression: true,
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'detection:',
        connectTimeout: 10000,
        lazyConnect: true
      }
    }
  }

  /**
   * 根据环境创建配置
   */
  createConfigForEnvironment(env: string = process.env.NODE_ENV || 'development'): Partial<CacheConfig> {
    switch (env) {
      case 'production':
        return this.createProductionConfig()
      case 'test':
        return {
          type: 'memory',
          defaultTtl: 60, // 1分钟，测试时短缓存
          maxKeys: 100,
          enableStats: false
        }
      case 'development':
      default:
        return this.createDevelopmentConfig()
    }
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvironmentOverrides(config: CacheConfig): void {
    // 缓存类型
    if (process.env.CACHE_TYPE) {
      config.type = process.env.CACHE_TYPE as 'memory' | 'redis'
    }

    // 默认TTL
    if (process.env.CACHE_DEFAULT_TTL) {
      config.defaultTtl = parseInt(process.env.CACHE_DEFAULT_TTL)
    }

    // 最大键数量
    if (process.env.CACHE_MAX_KEYS) {
      config.maxKeys = parseInt(process.env.CACHE_MAX_KEYS)
    }

    // Redis配置
    if (config.type === 'redis' && config.redis) {
      if (process.env.REDIS_HOST) {
        config.redis.host = process.env.REDIS_HOST
      }
      if (process.env.REDIS_PORT) {
        config.redis.port = parseInt(process.env.REDIS_PORT)
      }
      if (process.env.REDIS_PASSWORD) {
        config.redis.password = process.env.REDIS_PASSWORD
      }
      if (process.env.REDIS_DB) {
        config.redis.db = parseInt(process.env.REDIS_DB)
      }
      if (process.env.REDIS_KEY_PREFIX) {
        config.redis.keyPrefix = process.env.REDIS_KEY_PREFIX
      }
    }

    logger.debug('应用环境变量覆盖完成', { config })
  }

  /**
   * 获取所有缓存管理器
   */
  getAllCacheManagers(): Map<string, CacheManager> {
    return new Map(this.cacheManagers)
  }

  /**
   * 连接所有缓存管理器
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.cacheManagers.values()).map(manager => 
      manager.connect().catch(error => {
        logger.error('缓存管理器连接失败', error)
        return Promise.resolve() // 不阻塞其他连接
      })
    )

    await Promise.all(promises)
    logger.info('所有缓存管理器连接完成')
  }

  /**
   * 断开所有缓存管理器
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.cacheManagers.values()).map(manager => 
      manager.disconnect().catch(error => {
        logger.error('缓存管理器断开连接失败', error)
        return Promise.resolve()
      })
    )

    await Promise.all(promises)
    this.cacheManagers.clear()
    logger.info('所有缓存管理器断开连接完成')
  }

  /**
   * 健康检查所有缓存管理器
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>()

    for (const [name, manager] of this.cacheManagers) {
      try {
        const isHealthy = await manager.healthCheck()
        results.set(name, isHealthy)
      } catch (error) {
        logger.error(`缓存管理器健康检查失败: ${name}`, error)
        results.set(name, false)
      }
    }

    return results
  }

  /**
   * 获取所有缓存统计信息
   */
  async getAllStats(): Promise<Map<string, any>> {
    const stats = new Map<string, any>()

    for (const [name, manager] of this.cacheManagers) {
      try {
        const managerStats = await manager.getStats()
        stats.set(name, managerStats)
      } catch (error) {
        logger.error(`获取缓存统计失败: ${name}`, error)
        stats.set(name, { error: error.message })
      }
    }

    return stats
  }

  /**
   * 清空所有缓存
   */
  async clearAll(): Promise<void> {
    const promises = Array.from(this.cacheManagers.values()).map(manager => 
      manager.clear().catch(error => {
        logger.error('清空缓存失败', error)
        return Promise.resolve()
      })
    )

    await Promise.all(promises)
    logger.info('所有缓存已清空')
  }

  /**
   * 移除缓存管理器
   */
  async removeCacheManager(name: string): Promise<boolean> {
    const manager = this.cacheManagers.get(name)
    if (!manager) {
      return false
    }

    try {
      await manager.disconnect()
      this.cacheManagers.delete(name)
      logger.info(`缓存管理器已移除: ${name}`)
      return true
    } catch (error) {
      logger.error(`移除缓存管理器失败: ${name}`, error)
      return false
    }
  }
}

// 导出默认实例
export const cacheFactory = CacheFactory.getInstance()

// 创建默认的检测缓存管理器
export function createDefaultDetectionCache(): CacheManager {
  const config = cacheFactory.createConfigForEnvironment()
  return cacheFactory.createDetectionCacheManager(config)
}

// 优雅关闭处理
process.on('SIGINT', async () => {
  logger.info('正在关闭缓存系统...')
  await cacheFactory.disconnectAll()
})

process.on('SIGTERM', async () => {
  logger.info('正在关闭缓存系统...')
  await cacheFactory.disconnectAll()
})
