/**
 * PM2 State Cache
 * 
 * 缓存 PM2 进程状态，减少频繁查询
 */

import { logger } from '../utils/logger.js'
import type { PM2Process } from './pm2Service.js'

interface CachedProcessState {
  state: PM2Process
  timestamp: number
}

interface CachedProcessList {
  processes: PM2Process[]
  timestamp: number
}

export class PM2StateCache {
  private processCache = new Map<string, CachedProcessState>()
  private listCache: CachedProcessList | null = null
  private cacheTTL = 5000 // 5秒缓存
  private statsCache: { data: any; timestamp: number } | null = null

  /**
   * 获取进程状态（带缓存）
   */
  async getProcessState(
    processName: string,
    fetcher: () => Promise<PM2Process>
  ): Promise<PM2Process> {
    const cached = this.processCache.get(processName)
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      logger.debug('Using cached PM2 process state', { processName })
      return cached.state
    }
    
    logger.debug('Fetching fresh PM2 process state', { processName })
    const state = await fetcher()
    
    this.processCache.set(processName, {
      state,
      timestamp: Date.now()
    })
    
    return state
  }
  
  /**
   * 获取进程列表（带缓存）
   */
  async getProcessList(
    fetcher: () => Promise<PM2Process[]>
  ): Promise<PM2Process[]> {
    if (this.listCache && Date.now() - this.listCache.timestamp < this.cacheTTL) {
      logger.debug('Using cached PM2 process list', { 
        count: this.listCache.processes.length 
      })
      return this.listCache.processes
    }
    
    logger.debug('Fetching fresh PM2 process list')
    const processes = await fetcher()
    
    this.listCache = {
      processes,
      timestamp: Date.now()
    }
    
    processes.forEach(proc => {
      this.processCache.set(proc.name, {
        state: proc,
        timestamp: Date.now()
      })
    })
    
    return processes
  }

  /**
   * 获取统计信息（带缓存）
   */
  async getStats(
    fetcher: () => Promise<any>
  ): Promise<any> {
    if (this.statsCache && Date.now() - this.statsCache.timestamp < this.cacheTTL) {
      logger.debug('Using cached PM2 stats')
      return this.statsCache.data
    }
    
    logger.debug('Fetching fresh PM2 stats')
    const stats = await fetcher()
    
    this.statsCache = {
      data: stats,
      timestamp: Date.now()
    }
    
    return stats
  }
  
  /**
   * 清除缓存
   */
  invalidate(processName?: string): void {
    if (processName) {
      this.processCache.delete(processName)
      logger.debug('Invalidated PM2 process cache', { processName })
    } else {
      this.processCache.clear()
      this.listCache = null
      this.statsCache = null
      logger.debug('Invalidated all PM2 caches')
    }
  }

  /**
   * 清除过期缓存
   */
  cleanupExpired(): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [name, cached] of this.processCache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        this.processCache.delete(name)
        cleanedCount++
      }
    }

    if (this.listCache && now - this.listCache.timestamp > this.cacheTTL) {
      this.listCache = null
      cleanedCount++
    }

    if (this.statsCache && now - this.statsCache.timestamp > this.cacheTTL) {
      this.statsCache = null
      cleanedCount++
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired PM2 caches', { count: cleanedCount })
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    processCount: number
    hasListCache: boolean
    hasStatsCache: boolean
    oldestEntry: number | null
  } {
    let oldestTimestamp: number | null = null

    for (const cached of this.processCache.values()) {
      if (oldestTimestamp === null || cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp
      }
    }

    return {
      processCount: this.processCache.size,
      hasListCache: this.listCache !== null,
      hasStatsCache: this.statsCache !== null,
      oldestEntry: oldestTimestamp
    }
  }
}

// 单例实例
let cacheInstance: PM2StateCache | null = null

export function getPM2StateCache(): PM2StateCache {
  if (!cacheInstance) {
    cacheInstance = new PM2StateCache()
  }
  return cacheInstance
}
