/**
 * Token Refresh Manager
 * 
 * 防止并发刷新导致的竞态条件
 */

import { authApiService } from '@/services/authApi'
import { ApiError } from '@/services/api'
import type { AuthTokens } from './auth'

export class TokenRefreshManager {
  private refreshPromise: Promise<boolean> | null = null
  private isRefreshing = false
  private lastRefreshTime = 0
  private minRefreshInterval = 5000 // 最小刷新间隔5秒

  /**
   * 防止并发刷新的 token 刷新
   *
   * onFailure 会收到失败原因，调用方据此区分
   * 「刷新令牌被后端拒绝」与「网络等临时故障」
   */
  async refreshToken(
    refreshToken: string,
    onSuccess: (tokens: AuthTokens) => void,
    onFailure: (error?: unknown) => void
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
    onFailure: (error?: unknown) => void
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
      // HTTP 200 但 success=false 视为后端明确拒绝
      onFailure(new ApiError(response.message || 'Refresh token无效', 401, 'REFRESH_REJECTED'))
      return false
    } catch (error) {
      console.error('Token refresh error', {
        error: error instanceof Error ? error.message : String(error)
      })
      onFailure(error)
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
