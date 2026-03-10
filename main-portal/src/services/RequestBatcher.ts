/**
 * API 请求批处理和去重
 * 
 * 防止短时间内重复请求，支持请求合并
 */

import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'

interface PendingRequest {
  promise: Promise<any>
  timestamp: number
  resolvers: Array<(value: any) => void>
  rejecters: Array<(reason: any) => void>
}

export class RequestBatcher {
  private pendingRequests = new Map<string, PendingRequest>()
  private batchDelay = 50 // 50ms 内的请求合并
  private requestCache = new Map<string, { data: any; timestamp: number }>()
  private cacheTTL = 5000 // 5秒缓存

  /**
   * 生成请求键
   */
  private getRequestKey(config: AxiosRequestConfig): string {
    const { method = 'GET', url = '', params, data } = config
    return `${method}:${url}:${JSON.stringify(params)}:${JSON.stringify(data)}`
  }

  /**
   * 批量请求（去重 + 合并）
   */
  async batch<T>(config: AxiosRequestConfig): Promise<T> {
    const key = this.getRequestKey(config)

    // 1. 检查缓存
    const cached = this.requestCache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.debug('Using cached request result', { key })
      return cached.data
    }

    // 2. 检查是否有正在进行的相同请求
    const pending = this.pendingRequests.get(key)
    if (pending) {
      console.debug('Merging duplicate request', { key })
      return new Promise((resolve, reject) => {
        pending.resolvers.push(resolve)
        pending.rejecters.push(reject)
      })
    }

    // 3. 创建新请求
    const resolvers: Array<(value: any) => void> = []
    const rejecters: Array<(reason: any) => void> = []

    const promise = new Promise<T>((resolve, reject) => {
      resolvers.push(resolve)
      rejecters.push(reject)

      // 延迟执行，等待可能的重复请求
      setTimeout(async () => {
        try {
          const response = await axios(config)
          const data = response.data

          // 缓存结果
          this.requestCache.set(key, {
            data,
            timestamp: Date.now()
          })

          // 解决所有等待的 Promise
          resolvers.forEach(r => r(data))
        } catch (error) {
          // 拒绝所有等待的 Promise
          rejecters.forEach(r => r(error))
        } finally {
          // 清理
          this.pendingRequests.delete(key)
        }
      }, this.batchDelay)
    })

    // 记录待处理请求
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
      resolvers,
      rejecters
    })

    return promise
  }

  /**
   * 清除缓存
   */
  clearCache(pattern?: string): void {
    if (pattern) {
      // 清除匹配的缓存
      for (const key of this.requestCache.keys()) {
        if (key.includes(pattern)) {
          this.requestCache.delete(key)
        }
      }
    } else {
      // 清除所有缓存
      this.requestCache.clear()
    }
  }

  /**
   * 清除过期缓存
   */
  cleanupExpired(): void {
    const now = Date.now()
    for (const [key, cached] of this.requestCache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        this.requestCache.delete(key)
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    pendingCount: number
    cacheSize: number
    cacheHitRate: number
  } {
    return {
      pendingCount: this.pendingRequests.size,
      cacheSize: this.requestCache.size,
      cacheHitRate: 0 // TODO: 实现命中率统计
    }
  }
}

// 全局实例
const requestBatcher = new RequestBatcher()

// 定期清理过期缓存
setInterval(() => {
  requestBatcher.cleanupExpired()
}, 60000) // 每分钟清理一次

/**
 * 创建批处理的 API 客户端
 */
export function createBatchedApi(baseURL: string) {
  return {
    get: <T = any>(url: string, config?: AxiosRequestConfig) =>
      requestBatcher.batch<T>({
        method: 'GET',
        url,
        baseURL,
        ...config
      }),

    post: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
      requestBatcher.batch<T>({
        method: 'POST',
        url,
        data,
        baseURL,
        ...config
      }),

    put: <T = any>(url: string, data?: any, config?: AxiosRequestConfig) =>
      requestBatcher.batch<T>({
        method: 'PUT',
        url,
        data,
        baseURL,
        ...config
      }),

    delete: <T = any>(url: string, config?: AxiosRequestConfig) =>
      requestBatcher.batch<T>({
        method: 'DELETE',
        url,
        baseURL,
        ...config
      }),

    clearCache: (pattern?: string) => requestBatcher.clearCache(pattern),
    
    getStats: () => requestBatcher.getStats()
  }
}

export { requestBatcher }
