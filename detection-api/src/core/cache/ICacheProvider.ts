/**
 * 缓存提供者接口
 * 
 * 定义了统一的缓存操作接口，支持多种缓存后端实现
 */

export interface CacheOptions {
  /** 过期时间（秒），0表示永不过期 */
  ttl?: number
  /** 是否压缩存储 */
  compress?: boolean
  /** 缓存标签，用于批量清理 */
  tags?: string[]
}

export interface CacheStats {
  /** 缓存命中次数 */
  hits: number
  /** 缓存未命中次数 */
  misses: number
  /** 缓存命中率 */
  hitRate: number
  /** 缓存项总数 */
  keys: number
  /** 内存使用量（字节） */
  memoryUsage?: number
  /** 最后更新时间 */
  lastUpdated: string
}

export interface CacheEntry<T = any> {
  /** 缓存值 */
  value: T
  /** 创建时间 */
  createdAt: string
  /** 过期时间 */
  expiresAt?: string
  /** 缓存标签 */
  tags?: string[]
  /** 访问次数 */
  accessCount: number
  /** 最后访问时间 */
  lastAccessed: string
}

/**
 * 缓存提供者接口
 */
export interface ICacheProvider {
  /**
   * 事件监听器方法
   */
  on(event: string | symbol, listener: (...args: any[]) => void): this
  once(event: string | symbol, listener: (...args: any[]) => void): this
  off(event: string | symbol, listener: (...args: any[]) => void): this
  emit(event: string | symbol, ...args: any[]): boolean
  
  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值，不存在或已过期返回null
   */
  get<T = any>(key: string): Promise<T | null>

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   * @param options 缓存选项
   */
  set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void>

  /**
   * 检查缓存是否存在
   * @param key 缓存键
   */
  has(key: string): Promise<boolean>

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): Promise<boolean>

  /**
   * 清空所有缓存
   */
  clear(): Promise<void>

  /**
   * 根据标签清理缓存
   * @param tags 标签列表
   */
  clearByTags(tags: string[]): Promise<number>

  /**
   * 根据模式清理缓存
   * @param pattern 键名模式（支持通配符）
   */
  clearByPattern(pattern: string): Promise<number>

  /**
   * 获取所有缓存键
   * @param pattern 可选的键名模式
   */
  keys(pattern?: string): Promise<string[]>

  /**
   * 获取缓存统计信息
   */
  getStats(): Promise<CacheStats>

  /**
   * 获取缓存详细信息
   * @param key 缓存键
   */
  getInfo(key: string): Promise<CacheEntry | null>

  /**
   * 批量获取缓存
   * @param keys 缓存键列表
   */
  mget<T = any>(keys: string[]): Promise<(T | null)[]>

  /**
   * 批量设置缓存
   * @param entries 缓存条目
   */
  mset<T = any>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void>

  /**
   * 批量删除缓存
   * @param keys 缓存键列表
   */
  mdel(keys: string[]): Promise<number>

  /**
   * 设置缓存过期时间
   * @param key 缓存键
   * @param ttl 过期时间（秒）
   */
  expire(key: string, ttl: number): Promise<boolean>

  /**
   * 获取缓存剩余过期时间
   * @param key 缓存键
   * @returns 剩余秒数，-1表示永不过期，-2表示不存在
   */
  ttl(key: string): Promise<number>

  /**
   * 连接到缓存服务
   */
  connect(): Promise<void>

  /**
   * 断开缓存服务连接
   */
  disconnect(): Promise<void>

  /**
   * 检查连接状态
   */
  isConnected(): boolean

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>
}

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  /** 缓存类型 */
  type: 'memory' | 'redis'
  /** 默认TTL（秒） */
  defaultTtl: number
  /** 最大缓存项数量 */
  maxKeys: number
  /** 是否启用压缩 */
  enableCompression: boolean
  /** 是否启用统计 */
  enableStats: boolean
  /** 清理间隔（秒） */
  cleanupInterval: number
  /** Redis配置（当type为redis时） */
  redis?: {
    host: string
    port: number
    password?: string
    db: number
    keyPrefix: string
    connectTimeout: number
    lazyConnect: boolean
  }
  /** 内存缓存配置（当type为memory时） */
  memory?: {
    checkPeriod: number
    useClones: boolean
    deleteOnExpire: boolean
  }
}

/**
 * 缓存事件接口
 */
export interface CacheEvents {
  /** 缓存命中 */
  hit: (key: string) => void
  /** 缓存未命中 */
  miss: (key: string) => void
  /** 缓存设置 */
  set: (key: string, value: any) => void
  /** 缓存删除 */
  del: (key: string) => void
  /** 缓存过期 */
  expired: (key: string, value: any) => void
  /** 缓存错误 */
  error: (error: Error) => void
  /** 连接建立 */
  connect: () => void
  /** 连接断开 */
  disconnect: () => void
}
