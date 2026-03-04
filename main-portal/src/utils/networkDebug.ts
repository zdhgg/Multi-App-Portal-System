/**
 * 网络请求调试工具
 * 用于监控实际的HTTP请求，区分真正的重复请求和调用链记录
 */

interface NetworkRequest {
  url: string
  method: string
  timestamp: number
  status?: number
  response?: any
  error?: string
  duration?: number
}

class NetworkDebugger {
  private requests: NetworkRequest[] = []
  private isEnabled = false
  private originalFetch: typeof fetch

  constructor() {
    this.originalFetch = window.fetch
    this.isEnabled = import.meta.env.DEV
    
    if (this.isEnabled) {
      this.interceptFetch()
    }
  }

  /**
   * 拦截fetch请求
   */
  private interceptFetch() {
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method || 'GET'
      const startTime = Date.now()

      // 记录请求开始
      const request: NetworkRequest = {
        url,
        method,
        timestamp: startTime
      }

      // 只记录登录相关的请求
      if (url.includes('/auth/login')) {
        this.requests.push(request)
        
        // 检查是否有重复的登录请求
        const recentLoginRequests = this.getRecentLoginRequests(5000)
        if (recentLoginRequests.length > 1) {
          console.error('🚨 检测到重复的HTTP登录请求!', {
            count: recentLoginRequests.length,
            requests: recentLoginRequests.map(r => ({
              url: r.url,
              method: r.method,
              timestamp: new Date(r.timestamp).toISOString(),
              status: r.status
            }))
          })
        }

        console.log('🌐 HTTP登录请求发送:', {
          url,
          method,
          timestamp: new Date().toISOString(),
          totalLoginRequests: recentLoginRequests.length
        })
      }

      try {
        // 执行原始请求 - 修复this上下文问题
        const response = await this.originalFetch.call(window, input, init)
        const duration = Date.now() - startTime

        // 更新请求记录
        if (url.includes('/auth/login')) {
          request.status = response.status
          request.duration = duration

          if (response.status === 429) {
            console.error('🚨 收到429错误 - 请求过于频繁!', {
              url,
              status: response.status,
              duration: `${duration}ms`,
              recentRequests: this.getRecentLoginRequests(10000).length
            })
          } else {
            console.log('✅ HTTP登录请求完成:', {
              url,
              status: response.status,
              duration: `${duration}ms`
            })
          }
        }

        return response
      } catch (error: any) {
        const duration = Date.now() - startTime

        // 更新请求记录
        if (url.includes('/auth/login')) {
          request.error = error.message
          request.duration = duration

          console.error('❌ HTTP登录请求失败:', {
            url,
            error: error.message,
            duration: `${duration}ms`
          })
        }

        throw error
      }
    }
  }

  /**
   * 获取最近的登录请求
   */
  private getRecentLoginRequests(timeWindow: number): NetworkRequest[] {
    const now = Date.now()
    return this.requests.filter(r => 
      r.url.includes('/auth/login') && 
      now - r.timestamp <= timeWindow
    )
  }

  /**
   * 启用调试
   */
  enable() {
    this.isEnabled = true
    console.log('🔍 网络请求调试器已启用')
  }

  /**
   * 禁用调试
   */
  disable() {
    this.isEnabled = false
    console.log('🔍 网络请求调试器已禁用')
  }

  /**
   * 获取调试报告
   */
  getReport() {
    const loginRequests = this.requests.filter(r => r.url.includes('/auth/login'))
    const recentRequests = this.getRecentLoginRequests(60000) // 1分钟内

    return {
      totalLoginRequests: loginRequests.length,
      recentLoginRequests: recentRequests.length,
      requests: loginRequests.map(r => ({
        url: r.url,
        method: r.method,
        timestamp: new Date(r.timestamp).toISOString(),
        status: r.status,
        duration: r.duration ? `${r.duration}ms` : 'pending',
        error: r.error
      })),
      duplicateAnalysis: this.analyzeDuplicates()
    }
  }

  /**
   * 分析重复请求
   */
  private analyzeDuplicates() {
    const loginRequests = this.requests.filter(r => r.url.includes('/auth/login'))
    const groups: { [key: string]: NetworkRequest[] } = {}

    // 按时间窗口分组
    loginRequests.forEach(request => {
      const timeSlot = Math.floor(request.timestamp / 1000) // 按秒分组
      const key = `${timeSlot}_${request.method}_${request.url}`
      
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(request)
    })

    return Object.entries(groups)
      .filter(([_, requests]) => requests.length > 1)
      .map(([key, requests]) => ({
        timeSlot: key,
        count: requests.length,
        requests: requests.map(r => ({
          timestamp: new Date(r.timestamp).toISOString(),
          status: r.status,
          duration: r.duration
        }))
      }))
  }

  /**
   * 清除记录
   */
  clear() {
    this.requests = []
    console.log('🧹 网络请求记录已清除')
  }

  /**
   * 恢复原始fetch
   */
  restore() {
    window.fetch = this.originalFetch
    console.log('🔄 已恢复原始fetch函数')
  }
}

// 创建全局实例
export const networkDebugger = new NetworkDebugger()

// 暴露到window对象（仅开发环境）
if (import.meta.env.DEV) {
  ;(window as any).networkDebugger = networkDebugger
}

export default networkDebugger
