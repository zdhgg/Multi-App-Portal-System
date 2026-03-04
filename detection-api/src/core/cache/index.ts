/**
 * 缓存模块统一导出
 * 
 * 提供完整的缓存功能，包括内存缓存、Redis缓存和智能缓存管理
 */

// 核心接口和类型
export type {
  ICacheProvider,
  CacheOptions,
  CacheStats,
  CacheEntry,
  CacheConfig,
  CacheEvents
} from './ICacheProvider'

// 缓存提供者实现
export { MemoryCacheProvider } from './MemoryCacheProvider'
export { RedisCacheProvider } from './RedisCacheProvider'

// 缓存管理器
import { CacheManager } from './CacheManager'
export { CacheManager }
export type { CacheKeyOptions, DetectionCacheOptions } from './CacheManager'

// 导入类型用于本模块
import type { CacheConfig, CacheOptions } from './ICacheProvider'
import type { DetectionCacheOptions } from './CacheManager'

// 缓存工厂
import { CacheFactory, cacheFactory as cacheFactoryInstance, createDefaultDetectionCache } from './CacheFactory'
export { CacheFactory, createDefaultDetectionCache }
export { cacheFactoryInstance as cacheFactory }

// Local reference for use in this module
const cacheFactory = cacheFactoryInstance

// 便捷函数和默认实例
let defaultCacheManager: CacheManager | null = null

/**
 * 获取默认的缓存管理器
 */
export function getDefaultCacheManager(): CacheManager {
  if (!defaultCacheManager) {
    defaultCacheManager = createDefaultDetectionCache()
  }
  return defaultCacheManager
}

/**
 * 初始化缓存系统
 */
export async function initializeCacheSystem(config?: Partial<CacheConfig>): Promise<CacheManager> {
  const manager = config 
    ? cacheFactory.createDetectionCacheManager(config)
    : getDefaultCacheManager()

  await manager.connect()
  
  // 设置为默认管理器
  defaultCacheManager = manager

  return manager
}

/**
 * 关闭缓存系统
 */
export async function shutdownCacheSystem(): Promise<void> {
  if (defaultCacheManager) {
    await defaultCacheManager.disconnect()
    defaultCacheManager = null
  }
  await cacheFactory.disconnectAll()
}

/**
 * 缓存装饰器
 * 用于自动缓存函数结果
 */
export function cached(
  keyGenerator: (...args: any[]) => string,
  options?: CacheOptions
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const cacheManager = getDefaultCacheManager()
      const key = keyGenerator(...args)

      // 尝试从缓存获取
      const cachedResult = await cacheManager.getProvider().get(key)
      if (cachedResult !== null) {
        return cachedResult
      }

      // 执行原方法
      const result = await method.apply(this, args)

      // 缓存结果
      await cacheManager.getProvider().set(key, result, options)

      return result
    }

    return descriptor
  }
}

/**
 * 检测结果缓存装饰器
 * 专门用于检测相关的方法缓存
 */
export function cachedDetection(
  options?: DetectionCacheOptions
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (directory: string, ...args: any[]) {
      const cacheManager = getDefaultCacheManager()

      // 尝试从缓存获取
      const cachedResult = await cacheManager.getCachedDetectionResult(
        directory,
        args.length > 0 ? args[0] : undefined,
        options
      )

      if (cachedResult !== null) {
        return cachedResult
      }

      // 执行原方法
      const result = await method.apply(this, [directory, ...args])

      // 缓存结果
      await cacheManager.cacheDetectionResult(
        directory,
        result,
        args.length > 0 ? args[0] : undefined,
        options
      )

      return result
    }

    return descriptor
  }
}

/**
 * 缓存健康检查
 */
export async function checkCacheHealth(): Promise<{
  status: 'healthy' | 'unhealthy' | 'partial'
  details: Map<string, boolean>
  summary: {
    total: number
    healthy: number
    unhealthy: number
  }
}> {
  const healthResults = await cacheFactory.healthCheckAll()
  const total = healthResults.size
  const healthy = Array.from(healthResults.values()).filter(Boolean).length
  const unhealthy = total - healthy

  let status: 'healthy' | 'unhealthy' | 'partial'
  if (healthy === total) {
    status = 'healthy'
  } else if (healthy === 0) {
    status = 'unhealthy'
  } else {
    status = 'partial'
  }

  return {
    status,
    details: healthResults,
    summary: {
      total,
      healthy,
      unhealthy
    }
  }
}

/**
 * 获取缓存系统统计信息
 */
export async function getCacheSystemStats(): Promise<{
  managers: Map<string, any>
  summary: {
    totalManagers: number
    totalHits: number
    totalMisses: number
    averageHitRate: number
    totalKeys: number
  }
}> {
  const allStats = await cacheFactory.getAllStats()
  
  let totalHits = 0
  let totalMisses = 0
  let totalKeys = 0
  let validManagers = 0

  for (const stats of allStats.values()) {
    if (stats.error) continue
    
    totalHits += stats.hits || 0
    totalMisses += stats.misses || 0
    totalKeys += stats.keys || 0
    validManagers++
  }

  const totalRequests = totalHits + totalMisses
  const averageHitRate = totalRequests > 0 ? totalHits / totalRequests : 0

  return {
    managers: allStats,
    summary: {
      totalManagers: allStats.size,
      totalHits,
      totalMisses,
      averageHitRate,
      totalKeys
    }
  }
}

/**
 * 清理过期缓存
 */
export async function cleanupExpiredCache(): Promise<{
  managersProcessed: number
  totalKeysRemoved: number
  errors: string[]
}> {
  const managers = cacheFactory.getAllCacheManagers()
  let totalKeysRemoved = 0
  const errors: string[] = []

  for (const [name, manager] of managers) {
    try {
      // 这里可以实现更复杂的清理逻辑
      // 暂时只是触发健康检查
      await manager.healthCheck()
    } catch (error) {
      errors.push(`${name}: ${error.message}`)
    }
  }

  return {
    managersProcessed: managers.size,
    totalKeysRemoved,
    errors
  }
}

/**
 * 缓存预热
 */
export async function warmupCache(
  directories: string[],
  options?: any
): Promise<{
  processed: number
  cached: number
  errors: string[]
}> {
  const cacheManager = getDefaultCacheManager()
  const errors: string[] = []
  let cached = 0

  for (const directory of directories) {
    try {
      // 这里将与检测系统集成，执行实际的预热逻辑
      await cacheManager.warmupCache([directory], options)
      cached++
    } catch (error) {
      errors.push(`${directory}: ${error.message}`)
    }
  }

  return {
    processed: directories.length,
    cached,
    errors
  }
}

// 默认导出
export default {
  getDefaultCacheManager,
  initializeCacheSystem,
  shutdownCacheSystem,
  checkCacheHealth,
  getCacheSystemStats,
  cleanupExpiredCache,
  warmupCache,
  cacheFactory: cacheFactoryInstance
}
