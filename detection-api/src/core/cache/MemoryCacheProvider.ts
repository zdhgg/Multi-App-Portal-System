/**
 * 内存缓存提供者
 * 
 * 基于 node-cache 实现的内存缓存，适用于开发环境和单机部署
 */

import NodeCache from 'node-cache'
import { EventEmitter } from 'events'
import { logger } from '../../utils/logger'
import {
  ICacheProvider,
  CacheOptions,
  CacheStats,
  CacheEntry,
  CacheConfig,
  CacheEvents
} from './ICacheProvider'
import { DetectionError, ErrorCode, ErrorFactory } from '../errors'

export class MemoryCacheProvider extends EventEmitter implements ICacheProvider {
  private cache: NodeCache
  private stats: {
    hits: number
    misses: number
    sets: number
    deletes: number
    startTime: number
  }
  private connected: boolean = false
  private config: CacheConfig

  constructor(config: CacheConfig) {
    super()
    this.config = config
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      startTime: Date.now()
    }

    // 初始化 NodeCache
    this.cache = new NodeCache({
      stdTTL: config.defaultTtl,
      checkperiod: config.memory?.checkPeriod || 600,
      useClones: config.memory?.useClones !== false,
      deleteOnExpire: config.memory?.deleteOnExpire !== false,
      maxKeys: config.maxKeys || 1000
    })

    this.setupEventListeners()
    logger.info('内存缓存提供者初始化完成', {
      defaultTtl: config.defaultTtl,
      maxKeys: config.maxKeys,
      checkPeriod: config.memory?.checkPeriod || 600
    })
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.cache.on('set', (key: string, value: any) => {
      this.stats.sets++
      this.emit('set', key, value)
      logger.debug('缓存设置', { key, type: typeof value })
    })

    this.cache.on('del', (key: string, value: any) => {
      this.stats.deletes++
      this.emit('del', key)
      logger.debug('缓存删除', { key })
    })

    this.cache.on('expired', (key: string, value: any) => {
      this.emit('expired', key, value)
      logger.debug('缓存过期', { key })
    })

    this.cache.on('error', (error: Error) => {
      this.emit('error', error)
      logger.error('缓存错误', error)
    })
  }

  /**
   * 连接到缓存服务
   */
  async connect(): Promise<void> {
    this.connected = true
    this.emit('connect')
    logger.info('内存缓存连接成功')
  }

  /**
   * 断开缓存服务连接
   */
  async disconnect(): Promise<void> {
    this.cache.close()
    this.connected = false
    this.emit('disconnect')
    logger.info('内存缓存连接断开')
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testKey = '__health_check__'
      const testValue = Date.now()
      
      await this.set(testKey, testValue, { ttl: 1 })
      const result = await this.get(testKey)
      await this.delete(testKey)
      
      return result === testValue
    } catch (error) {
      logger.error('内存缓存健康检查失败', error)
      return false
    }
  }

  /**
   * 获取缓存值
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = this.cache.get<T>(key)
      
      if (value !== undefined) {
        this.stats.hits++
        this.emit('hit', key)
        logger.debug('缓存命中', { key })
        return value
      } else {
        this.stats.misses++
        this.emit('miss', key)
        logger.debug('缓存未命中', { key })
        return null
      }
    } catch (error) {
      const cacheError = ErrorFactory.createCacheError(
        ErrorCode.CACHE_OPERATION_FAILED,
        `获取缓存失败: ${error instanceof Error ? error.message : String(error)}`,
        'get'
      )
      logger.error('获取缓存失败', { key, error: cacheError })
      this.emit('error', cacheError)
      return null
    }
  }

  /**
   * 设置缓存值
   */
  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl || this.config.defaultTtl
      const success = this.cache.set(key, value, ttl)
      
      if (!success) {
        throw new Error(`设置缓存失败: ${key}`)
      }

      logger.debug('缓存设置成功', { key, ttl })
    } catch (error) {
      const cacheError = ErrorFactory.createCacheError(
        ErrorCode.CACHE_OPERATION_FAILED,
        `设置缓存失败: ${error instanceof Error ? error.message : String(error)}`,
        'set'
      )
      logger.error('设置缓存失败', { key, error: cacheError })
      this.emit('error', cacheError)
      throw cacheError
    }
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    return this.cache.has(key)
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.cache.del(key)
    return deleted > 0
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.flushAll()
    logger.info('所有缓存已清空')
  }

  /**
   * 根据标签清理缓存
   */
  async clearByTags(tags: string[]): Promise<number> {
    // 内存缓存不直接支持标签，需要遍历所有键
    const keys = this.cache.keys()
    let deletedCount = 0

    for (const key of keys) {
      const info = await this.getInfo(key)
      if (info && info.tags && info.tags.some(tag => tags.includes(tag))) {
        await this.delete(key)
        deletedCount++
      }
    }

    logger.info('根据标签清理缓存完成', { tags, deletedCount })
    return deletedCount
  }

  /**
   * 根据模式清理缓存
   */
  async clearByPattern(pattern: string): Promise<number> {
    const keys = this.cache.keys()
    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    let deletedCount = 0

    for (const key of keys) {
      if (regex.test(key)) {
        await this.delete(key)
        deletedCount++
      }
    }

    logger.info('根据模式清理缓存完成', { pattern, deletedCount })
    return deletedCount
  }

  /**
   * 获取所有缓存键
   */
  async keys(pattern?: string): Promise<string[]> {
    const allKeys = this.cache.keys()
    
    if (!pattern) {
      return allKeys
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return allKeys.filter(key => regex.test(key))
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    const nodeStats = this.cache.getStats()
    const uptime = Date.now() - this.stats.startTime
    const totalRequests = this.stats.hits + this.stats.misses

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      keys: nodeStats.keys,
      memoryUsage: process.memoryUsage().heapUsed, // 近似值
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * 获取缓存详细信息
   */
  async getInfo(key: string): Promise<CacheEntry | null> {
    try {
      const value = this.cache.get(key)
      if (value === undefined) {
        return null
      }

      const ttl = this.cache.getTtl(key)
      const now = Date.now()

      return {
        value,
        createdAt: new Date(now).toISOString(),
        expiresAt: ttl > 0 ? new Date(ttl).toISOString() : undefined,
        tags: [], // 内存缓存暂不支持标签存储
        accessCount: 1, // 简化实现
        lastAccessed: new Date(now).toISOString()
      }
    } catch (error) {
      logger.error('获取缓存信息失败', { key, error })
      return null
    }
  }

  /**
   * 批量获取缓存
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = []
    
    for (const key of keys) {
      results.push(await this.get<T>(key))
    }

    return results
  }

  /**
   * 批量设置缓存
   */
  async mset<T = any>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.options)
    }
  }

  /**
   * 批量删除缓存
   */
  async mdel(keys: string[]): Promise<number> {
    let deletedCount = 0
    
    for (const key of keys) {
      if (await this.delete(key)) {
        deletedCount++
      }
    }

    return deletedCount
  }

  /**
   * 设置缓存过期时间
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    return this.cache.ttl(key, ttl)
  }

  /**
   * 获取缓存剩余过期时间
   */
  async ttl(key: string): Promise<number> {
    const ttlValue = this.cache.getTtl(key)
    
    if (ttlValue === undefined) {
      return -2 // 不存在
    }
    
    if (ttlValue === 0) {
      return -1 // 永不过期
    }

    const remaining = Math.max(0, Math.floor((ttlValue - Date.now()) / 1000))
    return remaining
  }
}
