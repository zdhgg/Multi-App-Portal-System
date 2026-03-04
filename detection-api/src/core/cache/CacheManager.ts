/**
 * 缓存管理器
 * 
 * 统一管理不同的缓存提供者，提供高级缓存功能
 */

import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { logger } from '../../utils/logger'
import { ICacheProvider, CacheConfig, CacheOptions, CacheStats } from './ICacheProvider'
import { MemoryCacheProvider } from './MemoryCacheProvider'
import { RedisCacheProvider } from './RedisCacheProvider'

export interface CacheKeyOptions {
  /** 基础键名 */
  base: string
  /** 参数对象，用于生成唯一键 */
  params?: Record<string, any>
  /** 文件路径，用于文件相关的缓存 */
  filePath?: string
  /** 文件修改时间，用于缓存失效 */
  fileModTime?: number
  /** 版本号，用于缓存版本控制 */
  version?: string
}

export interface DetectionCacheOptions extends CacheOptions {
  /** 是否启用文件修改时间检查 */
  enableFileTimeCheck?: boolean
  /** 是否启用目录内容哈希检查 */
  enableContentHash?: boolean
}

export class CacheManager extends EventEmitter {
  private provider: ICacheProvider
  private config: CacheConfig
  private keyGenerationStats: {
    generated: number
    collisions: number
  }

  constructor(config: CacheConfig) {
    super()
    this.config = config
    this.keyGenerationStats = {
      generated: 0,
      collisions: 0
    }

    // 根据配置创建缓存提供者
    this.provider = this.createProvider(config)
    this.setupEventListeners()

    logger.info('缓存管理器初始化完成', {
      type: config.type,
      defaultTtl: config.defaultTtl,
      maxKeys: config.maxKeys
    })
  }

  /**
   * 创建缓存提供者
   */
  private createProvider(config: CacheConfig): ICacheProvider {
    switch (config.type) {
      case 'memory':
        return new MemoryCacheProvider(config)
      case 'redis':
        return new RedisCacheProvider(config)
      default:
        throw new Error(`不支持的缓存类型: ${config.type}`)
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    this.provider.on('hit', (key: string) => {
      this.emit('hit', key)
    })

    this.provider.on('miss', (key: string) => {
      this.emit('miss', key)
    })

    this.provider.on('set', (key: string, value: any) => {
      this.emit('set', key, value)
    })

    this.provider.on('del', (key: string) => {
      this.emit('del', key)
    })

    this.provider.on('error', (error: Error) => {
      this.emit('error', error)
      logger.error('缓存提供者错误', error)
    })

    this.provider.on('connect', () => {
      this.emit('connect')
    })

    this.provider.on('disconnect', () => {
      this.emit('disconnect')
    })
  }

  /**
   * 生成缓存键
   */
  generateKey(options: CacheKeyOptions): string {
    this.keyGenerationStats.generated++

    const parts: string[] = [options.base]

    // 添加参数哈希
    if (options.params) {
      const paramsStr = JSON.stringify(options.params, Object.keys(options.params).sort())
      const paramsHash = createHash('md5').update(paramsStr).digest('hex').substring(0, 8)
      parts.push(`params:${paramsHash}`)
    }

    // 添加文件路径哈希
    if (options.filePath) {
      const pathHash = createHash('md5').update(options.filePath).digest('hex').substring(0, 8)
      parts.push(`path:${pathHash}`)
    }

    // 添加文件修改时间
    if (options.fileModTime) {
      parts.push(`mtime:${options.fileModTime}`)
    }

    // 添加版本号
    if (options.version) {
      parts.push(`v:${options.version}`)
    }

    const key = parts.join(':')
    logger.debug('生成缓存键', { key, options })
    return key
  }

  /**
   * 生成检测缓存键
   */
  generateDetectionKey(directory: string, options?: any): string {
    return this.generateKey({
      base: 'detection',
      params: options,
      filePath: directory
    })
  }

  /**
   * 生成文件相关的缓存键
   */
  async generateFileBasedKey(
    base: string, 
    filePath: string, 
    options?: any
  ): Promise<string> {
    try {
      const { statSync } = await import('fs')
      const stats = statSync(filePath)
      
      return this.generateKey({
        base,
        params: options,
        filePath,
        fileModTime: stats.mtimeMs
      })
    } catch (error) {
      // 文件不存在时使用基础键
      logger.debug('文件不存在，使用基础缓存键', { filePath, error })
      return this.generateKey({
        base,
        params: options,
        filePath
      })
    }
  }

  /**
   * 智能缓存获取
   * 支持文件修改时间检查和内容哈希验证
   */
  async smartGet<T = any>(
    keyOptions: CacheKeyOptions,
    options?: DetectionCacheOptions
  ): Promise<T | null> {
    const key = this.generateKey(keyOptions)
    
    // 基础缓存获取
    const cachedValue = await this.provider.get<T>(key)
    if (!cachedValue) {
      return null
    }

    // 文件修改时间检查
    if (options?.enableFileTimeCheck && keyOptions.filePath) {
      try {
        const { statSync } = await import('fs')
        const stats = statSync(keyOptions.filePath)
        
        if (keyOptions.fileModTime && stats.mtimeMs > keyOptions.fileModTime) {
          logger.debug('文件已修改，缓存失效', { 
            filePath: keyOptions.filePath,
            cachedTime: keyOptions.fileModTime,
            currentTime: stats.mtimeMs
          })
          await this.provider.delete(key)
          return null
        }
      } catch (error) {
        // 文件不存在，缓存失效
        logger.debug('文件不存在，缓存失效', { filePath: keyOptions.filePath })
        await this.provider.delete(key)
        return null
      }
    }

    return cachedValue
  }

  /**
   * 智能缓存设置
   */
  async smartSet<T = any>(
    keyOptions: CacheKeyOptions,
    value: T,
    options?: DetectionCacheOptions
  ): Promise<void> {
    const key = this.generateKey(keyOptions)
    await this.provider.set(key, value, options)
  }

  /**
   * 缓存检测结果
   */
  async cacheDetectionResult<T = any>(
    directory: string,
    result: T,
    options?: any,
    cacheOptions?: DetectionCacheOptions
  ): Promise<void> {
    const keyOptions: CacheKeyOptions = {
      base: 'detection',
      params: options,
      filePath: directory
    }

    // 如果启用文件时间检查，添加修改时间
    if (cacheOptions?.enableFileTimeCheck) {
      try {
        const { statSync, existsSync } = await import('fs')
        const { join } = await import('path')

        // 检查关键文件的修改时间
        const keyFiles = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
        let latestModTime = 0

        for (const fileName of keyFiles) {
          const filePath = join(directory, fileName)
          if (existsSync(filePath)) {
            const stats = statSync(filePath)
            latestModTime = Math.max(latestModTime, stats.mtimeMs)
          }
        }

        // 如果没有找到关键文件，使用目录修改时间
        if (latestModTime === 0) {
          const stats = statSync(directory)
          latestModTime = stats.mtimeMs
        }

        keyOptions.fileModTime = latestModTime
      } catch (error) {
        logger.debug('获取文件修改时间失败', { directory, error })
      }
    }

    await this.smartSet(keyOptions, result, cacheOptions)
  }

  /**
   * 获取缓存的检测结果
   */
  async getCachedDetectionResult<T = any>(
    directory: string,
    options?: any,
    cacheOptions?: DetectionCacheOptions
  ): Promise<T | null> {
    const keyOptions: CacheKeyOptions = {
      base: 'detection',
      params: options,
      filePath: directory
    }

    // 如果启用文件时间检查，添加修改时间
    if (cacheOptions?.enableFileTimeCheck) {
      try {
        const { statSync, existsSync } = await import('fs')
        const { join } = await import('path')

        // 检查关键文件的修改时间
        const keyFiles = ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
        let latestModTime = 0

        for (const fileName of keyFiles) {
          const filePath = join(directory, fileName)
          if (existsSync(filePath)) {
            const stats = statSync(filePath)
            latestModTime = Math.max(latestModTime, stats.mtimeMs)
          }
        }

        // 如果没有找到关键文件，使用目录修改时间
        if (latestModTime === 0) {
          const stats = statSync(directory)
          latestModTime = stats.mtimeMs
        }

        keyOptions.fileModTime = latestModTime
      } catch (error) {
        logger.debug('获取文件修改时间失败', { directory, error })
        return null
      }
    }

    return await this.smartGet<T>(keyOptions, cacheOptions)
  }

  /**
   * 清理检测相关的缓存
   */
  async clearDetectionCache(pattern?: string): Promise<number> {
    const searchPattern = pattern ? `detection:${pattern}` : 'detection:*'
    return await this.provider.clearByPattern(searchPattern)
  }

  /**
   * 清理特定目录的缓存
   */
  async clearDirectoryCache(directory: string): Promise<number> {
    const pathHash = createHash('md5').update(directory).digest('hex').substring(0, 8)
    const pattern = `*path:${pathHash}*`
    return await this.provider.clearByPattern(pattern)
  }

  /**
   * 预热缓存
   */
  async warmupCache(directories: string[], options?: any): Promise<void> {
    logger.info('开始缓存预热', { directories: directories.length })
    
    // 这里可以实现批量检测和缓存的逻辑
    // 暂时留空，等待与检测系统集成
    
    logger.info('缓存预热完成')
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats & { keyGeneration: typeof this.keyGenerationStats }> {
    const providerStats = await this.provider.getStats()
    
    return {
      ...providerStats,
      keyGeneration: { ...this.keyGenerationStats }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return await this.provider.healthCheck()
  }

  /**
   * 连接到缓存服务
   */
  async connect(): Promise<void> {
    await this.provider.connect()
  }

  /**
   * 断开缓存服务连接
   */
  async disconnect(): Promise<void> {
    await this.provider.disconnect()
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.provider.isConnected()
  }

  /**
   * 获取底层缓存提供者
   */
  getProvider(): ICacheProvider {
    return this.provider
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    await this.provider.clear()
    this.keyGenerationStats.generated = 0
    this.keyGenerationStats.collisions = 0
  }
}
