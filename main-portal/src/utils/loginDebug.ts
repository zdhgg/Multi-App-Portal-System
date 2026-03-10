import { isDebugToolsEnabled } from './debugControl'

/**
 * 登录调试工具
 * 用于监控和调试登录请求，帮助发现重复请求问题
 */

interface LoginRequest {
  timestamp: number
  credentials: {
    username: string
    password: string // 不记录实际密码，只记录长度
    rememberMe: boolean
  }
  source: string // 请求来源
  status: 'pending' | 'success' | 'error'
  error?: string
}

class LoginDebugger {
  private requests: LoginRequest[] = []
  private isEnabled = false

  constructor() {
    // 在开发环境中自动启用
    this.isEnabled = import.meta.env.DEV
  }

  /**
   * 启用调试
   */
  enable() {
    this.isEnabled = true
    console.log('🔍 登录调试器已启用')
  }

  /**
   * 禁用调试
   */
  disable() {
    this.isEnabled = false
    console.log('🔍 登录调试器已禁用')
  }

  /**
   * 记录登录请求开始
   */
  logLoginStart(credentials: any, source: string = 'unknown') {
    if (!this.isEnabled) return

    const request: LoginRequest = {
      timestamp: Date.now(),
      credentials: {
        username: credentials.username,
        password: `[${credentials.password?.length || 0} chars]`,
        rememberMe: credentials.rememberMe || false
      },
      source,
      status: 'pending'
    }

    this.requests.push(request)

    // 检查是否有真正的重复HTTP请求（排除调用链中的记录）
    const recentHttpRequests = this.getRecentRequests(2000) // 2秒内的请求
      .filter(r => r.source !== 'authStore') // 排除authStore的记录，因为它是调用链的一部分

    if (recentHttpRequests.length > 1) {
      console.warn('⚠️ 检测到可能的重复HTTP请求:', {
        count: recentHttpRequests.length,
        requests: recentHttpRequests.map(r => ({
          source: r.source,
          timestamp: new Date(r.timestamp).toISOString(),
          username: r.credentials.username
        }))
      })
    }

    console.log('🔐 登录请求开始:', {
      source,
      username: credentials.username,
      timestamp: new Date().toISOString(),
      totalRequests: this.requests.length,
      isCallChain: source === 'authStore' ? '(调用链)' : '(用户触发)'
    })
  }

  /**
   * 记录登录请求成功
   */
  logLoginSuccess(source: string = 'unknown') {
    if (!this.isEnabled) return

    const request = this.findLatestRequest(source)
    if (request) {
      request.status = 'success'
    }

    console.log('✅ 登录请求成功:', {
      source,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 记录登录请求失败
   */
  logLoginError(error: string, source: string = 'unknown') {
    if (!this.isEnabled) return

    const request = this.findLatestRequest(source)
    if (request) {
      request.status = 'error'
      request.error = error
    }

    console.error('❌ 登录请求失败:', {
      source,
      error,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 获取最近的请求
   */
  private getRecentRequests(timeWindow: number): LoginRequest[] {
    const now = Date.now()
    return this.requests.filter(r => now - r.timestamp <= timeWindow)
  }

  /**
   * 查找最新的请求
   */
  private findLatestRequest(source: string): LoginRequest | undefined {
    return this.requests
      .filter(r => r.source === source)
      .sort((a, b) => b.timestamp - a.timestamp)[0]
  }

  /**
   * 获取调试报告
   */
  getReport() {
    if (!this.isEnabled) {
      return { message: '调试器未启用' }
    }

    const now = Date.now()
    const recentRequests = this.getRecentRequests(60000) // 1分钟内
    const duplicateGroups = this.findDuplicateGroups()

    return {
      totalRequests: this.requests.length,
      recentRequests: recentRequests.length,
      duplicateGroups: duplicateGroups.length,
      requests: this.requests.map(r => ({
        timestamp: new Date(r.timestamp).toISOString(),
        source: r.source,
        username: r.credentials.username,
        status: r.status,
        error: r.error,
        age: `${Math.round((now - r.timestamp) / 1000)}s ago`
      })),
      duplicates: duplicateGroups
    }
  }

  /**
   * 查找重复请求组
   */
  private findDuplicateGroups(): any[] {
    const groups: { [key: string]: LoginRequest[] } = {}
    
    this.requests.forEach(request => {
      const key = `${request.credentials.username}_${request.credentials.rememberMe}`
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(request)
    })

    return Object.entries(groups)
      .filter(([_, requests]) => requests.length > 1)
      .map(([key, requests]) => ({
        key,
        count: requests.length,
        requests: requests.map(r => ({
          timestamp: new Date(r.timestamp).toISOString(),
          source: r.source,
          status: r.status
        }))
      }))
  }

  /**
   * 清除历史记录
   */
  clear() {
    this.requests = []
    console.log('🧹 登录调试记录已清除')
  }

  /**
   * 导出调试数据
   */
  export() {
    return {
      timestamp: new Date().toISOString(),
      requests: this.requests,
      report: this.getReport()
    }
  }
}

// 创建全局实例
export const loginDebugger = new LoginDebugger()

// 暴露到window对象（仅开发环境）
if (isDebugToolsEnabled()) {
  ;(window as any).loginDebugger = loginDebugger
}

// 导出便捷方法
export const logLoginStart = (credentials: any, source?: string) => 
  loginDebugger.logLoginStart(credentials, source)

export const logLoginSuccess = (source?: string) => 
  loginDebugger.logLoginSuccess(source)

export const logLoginError = (error: string, source?: string) => 
  loginDebugger.logLoginError(error, source)

export const getLoginReport = () => 
  loginDebugger.getReport()

export default loginDebugger
