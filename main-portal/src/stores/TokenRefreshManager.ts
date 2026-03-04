/**
 * Token Refresh Manager
 * 
 * 防止并发刷新导致的竞态条件
 */

import { authApiService } from '@/services/authApi'
import type { AuthTokens } from './auth'

export class TokenRefreshManager {
  private refreshPromise: Promise<boolean> | null = null
  private isRefreshing = false
  private lastRefreshTime = 0
  private minRefreshInterval = 5000 // 最小刷新间隔5秒

  /**
   * 防止并发刷新的 token 刷新
   */
  async refreshToken(
    refreshToken: string,
    onSuccess: (tokens: AuthTokens) => void,
    onFailure: () => void
  ): Promise<boolean> {
    // 检查是否刚刚刷新过
    const timeSinceLastRefresh = Date.now() - this.lastRefreshTime
    if (timeSinceLastRefresh < this.minRefreshInterval) {
      console.debug('Token refresh skipped (too soon)', { 
        timeSinceLastRefresh,
        minInterval: this.minRefreshInterval 
      })
      return true
    }

    // 如果正在刷新，返回现有的 Promise
    if (this.isRefreshing && this.refreshPromise) {
      console.debug('Token refresh already in progress, waiting...')
      return this.refreshPromise
    }
    
    this.isRefreshing = true
    this.refreshPromise = this.doRefresh(refreshToken, onSuccess, onFailure)
    
    try {
      const result = await this.refreshPromise
      return result
    } finally {
      this.isRefreshing = false
      this.refreshPromise = null
    }
  }
  
  /**
   * 执行实际的刷新操作
   */
  private async doRefresh(
    refreshToken: string,
    onSuccess: (tokens: AuthTokens) => void,
    onFailure: () => void
  ): Promise<boolean> {
    try {
      console.debug('Starting token refresh...')
      const response = await authApiService.refreshToken(refreshToken)
      
      if (response.success && response.data) {
        // 更新最后刷新时间
        this.lastRefreshTime = Date.now()
        
        // 调用成功回调
        onSuccess(response.data)
        
        console.info('Token refreshed successfully')
        return true
      }
      
      console.error('Token refresh failed', { response })
      onFailure()
      return false
    } catch (error) {
      console.error('Token refresh error', { 
        error: error instanceof Error ? error.message : String(error) 
      })
      onFailure()
      return false
    }
  }

  /**
   * 检查是否正在刷新
   */
  isCurrentlyRefreshing(): boolean {
    return this.isRefreshing
  }

  /**
   * 获取上次刷新时间
   */
  getLastRefreshTime(): number {
    return this.lastRefreshTime
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.isRefreshing = false
    this.refreshPromise = null
    this.lastRefreshTime = 0
  }
}
