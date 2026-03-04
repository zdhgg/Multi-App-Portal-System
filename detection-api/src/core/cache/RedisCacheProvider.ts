/**
 * Redis缓存提供者
 * 
 * 基于 Redis 实现的分布式缓存，适用于生产环境和集群部署
 */

import { createClient, RedisClientType } from 'redis'
import { EventEmitter } from 'events'
import { logger } from '../../utils/logger'
import { 
  ICacheProvider, 
  CacheOptions, 
  CacheStats, 
  CacheEntry, 
  CacheConfig 
} from './ICacheProvider'

export class RedisCacheProvider extends EventEmitter implements ICacheProvider {
  private client: RedisClientType
  private stats: {
    hits: number
    misses: number
    sets: number
    deletes: number
    startTime: number
  }
  private connected: boolean = false
  private config: CacheConfig
  private keyPrefix: string

  constructor(config: CacheConfig) {
    super()
    this.config = config
    this.keyPrefix = config.redis?.keyPrefix || 'detection:'
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      startTime: Date.now()
    }

    // 创建Redis客户端
    this.client = createClient({
      socket: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        connectTimeout: config.redis?.connectTimeout || 5000
      },
      password: config.redis?.password,
      database: config.redis?.db || 0
    })

    this.setupEventListeners()
    logger.info('Redis缓存提供者初始化完成', {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      db: config.redis?.db || 0,
      keyPrefix: this.keyPrefix
    })
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.client.on('connect', () => {
      this.connected = true
      this.emit('connect')
      logger.info('Redis连接建立')
    })

    this.client.on('disconnect', () => {
      this.connected = false
      this.emit('disconnect')
      logger.warn('Redis连接断开')
    })

    this.client.on('error', (error: Error) => {
      this.emit('error', error)
      logger.error('Redis错误', error)
    })

    this.client.on('ready', () => {
      logger.info('Redis客户端就绪')
    })

    this.client.on('reconnecting', () => {
      logger.info('Redis重新连接中...')
    })
  }

  /**
   * 生成完整的缓存键
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`
  }

  /**
   * 移除键前缀
   */
  private removeKeyPrefix(fullKey: string): string {
    return fullKey.startsWith(this.keyPrefix) 
      ? fullKey.substring(this.keyPrefix.length) 
      : fullKey
  }

  /**
   * 连接到缓存服务
   */
  async connect(): Promise<void> {
    try {
      await this.client.connect()
      this.connected = true
      logger.info('Redis缓存连接成功')
    } catch (error) {
      logger.error('Redis缓存连接失败', error)
      throw error
    }
  }

  /**
   * 断开缓存服务连接
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect()
      this.connected = false
      logger.info('Redis缓存连接断开')
    } catch (error) {
      logger.error('Redis缓存断开连接失败', error)
      throw error
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected && this.client.isReady
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping()
      return result === 'PONG'
    } catch (error) {
      logger.error('Redis健康检查失败', error)
      return false
    }
  }

  /**
   * 获取缓存值
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = this.getFullKey(key)
      const value = await this.client.get(fullKey)
      
      if (value !== null) {
        this.stats.hits++
        this.emit('hit', key)
        logger.debug('Redis缓存命中', { key })
        return JSON.parse(value as string)
      } else {
        this.stats.misses++
        this.emit('miss', key)
        logger.debug('Redis缓存未命中', { key })
        return null
      }
    } catch (error) {
      logger.error('获取Redis缓存失败', { key, error })
      this.emit('error', error as Error)
      return null
    }
  }

  /**
   * 设置缓存值
   */
  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.getFullKey(key)
      const serializedValue = JSON.stringify(value)
      const ttl = options?.ttl || this.config.defaultTtl

      if (ttl > 0) {
        await this.client.setEx(fullKey, ttl, serializedValue)
      } else {
        await this.client.set(fullKey, serializedValue)
      }

      this.stats.sets++
      this.emit('set', key, value)
      logger.debug('Redis缓存设置成功', { key, ttl })
    } catch (error) {
      logger.error('设置Redis缓存失败', { key, error })
      this.emit('error', error as Error)
      throw error
    }
  }

  /**
   * 检查缓存是否存在
   */
  async has(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key)
      const exists = await this.client.exists(fullKey)
      return exists === 1
    } catch (error) {
      logger.error('检查Redis缓存存在性失败', { key, error })
      return false
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key)
      const deleted = await this.client.del(fullKey)
      
      if (deleted > 0) {
        this.stats.deletes++
        this.emit('del', key)
        logger.debug('Redis缓存删除成功', { key })
      }
      
      return deleted > 0
    } catch (error) {
      logger.error('删除Redis缓存失败', { key, error })
      return false
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}*`
      const keys = await this.client.keys(pattern)
      
      if (keys.length > 0) {
        await this.client.del(keys)
        logger.info('Redis缓存清空完成', { deletedKeys: keys.length })
      }
    } catch (error) {
      logger.error('清空Redis缓存失败', error)
      throw error
    }
  }

  /**
   * 根据标签清理缓存
   */
  async clearByTags(tags: string[]): Promise<number> {
    // Redis实现需要额外的标签索引，这里简化实现
    logger.warn('Redis缓存暂不支持标签清理，请使用模式清理')
    return 0
  }

  /**
   * 根据模式清理缓存
   */
  async clearByPattern(pattern: string): Promise<number> {
    try {
      const fullPattern = `${this.keyPrefix}${pattern}`
      const keys = await this.client.keys(fullPattern)
      
      if (keys.length > 0) {
        await this.client.del(keys)
        logger.info('根据模式清理Redis缓存完成', { pattern, deletedCount: keys.length })
        return keys.length
      }
      
      return 0
    } catch (error) {
      logger.error('根据模式清理Redis缓存失败', { pattern, error })
      return 0
    }
  }

  /**
   * 获取所有缓存键
   */
  async keys(pattern?: string): Promise<string[]> {
    try {
      const searchPattern = pattern 
        ? `${this.keyPrefix}${pattern}` 
        : `${this.keyPrefix}*`
      
      const keys = await this.client.keys(searchPattern)
      return keys.map(key => this.removeKeyPrefix(key))
    } catch (error) {
      logger.error('获取Redis缓存键失败', { pattern, error })
      return []
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.client.info('memory')
      const keyCount = await this.client.dbSize()
      const totalRequests = this.stats.hits + this.stats.misses

      // 解析内存使用信息
      const memoryMatch = info.match(/used_memory:(\d+)/)
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : undefined

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
        keys: keyCount,
        memoryUsage,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      logger.error('获取Redis统计信息失败', error)
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
        keys: 0,
        lastUpdated: new Date().toISOString()
      }
    }
  }

  /**
   * 获取缓存详细信息
   */
  async getInfo(key: string): Promise<CacheEntry | null> {
    try {
      const fullKey = this.getFullKey(key)
      const value = await this.client.get(fullKey)
      
      if (value === null) {
        return null
      }

      const ttl = await this.client.ttl(fullKey)
      const now = Date.now()

      return {
        value: JSON.parse(value as string),
        createdAt: new Date(now).toISOString(),
        expiresAt: ttl > 0 ? new Date(now + ttl * 1000).toISOString() : undefined,
        tags: [], // 简化实现
        accessCount: 1, // 简化实现
        lastAccessed: new Date(now).toISOString()
      }
    } catch (error) {
      logger.error('获取Redis缓存信息失败', { key, error })
      return null
    }
  }

  /**
   * 批量获取缓存
   */
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.getFullKey(key))
      const values = await this.client.mGet(fullKeys)
      
      return values.map(value => {
        if (value !== null) {
          this.stats.hits++
          return JSON.parse(value as string)
        } else {
          this.stats.misses++
          return null
        }
      })
    } catch (error) {
      logger.error('批量获取Redis缓存失败', { keys, error })
      return keys.map(() => null)
    }
  }

  /**
   * 批量设置缓存
   */
  async mset<T = any>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    try {
      // Redis MSET不支持TTL，需要分别设置
      for (const entry of entries) {
        await this.set(entry.key, entry.value, entry.options)
      }
    } catch (error) {
      logger.error('批量设置Redis缓存失败', error)
      throw error
    }
  }

  /**
   * 批量删除缓存
   */
  async mdel(keys: string[]): Promise<number> {
    try {
      const fullKeys = keys.map(key => this.getFullKey(key))
      const deleted = await this.client.del(fullKeys)
      this.stats.deletes += deleted
      return deleted
    } catch (error) {
      logger.error('批量删除Redis缓存失败', { keys, error })
      return 0
    }
  }

  /**
   * 设置缓存过期时间
   */
  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key)
      const result = await this.client.expire(fullKey, ttl)
      return result === 1 || (result as any) === true
    } catch (error) {
      logger.error('设置Redis缓存过期时间失败', { key, ttl, error })
      return false
    }
  }

  /**
   * 获取缓存剩余过期时间
   */
  async ttl(key: string): Promise<number> {
    try {
      const fullKey = this.getFullKey(key)
      return await this.client.ttl(fullKey)
    } catch (error) {
      logger.error('获取Redis缓存TTL失败', { key, error })
      return -2
    }
  }
}
