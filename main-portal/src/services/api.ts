import { ElMessage } from 'element-plus'
import type { User } from '@/stores/auth'
import { getStoredAccessToken } from '@/utils/authStorage'
import { dispatchAuthInvalidation } from '@/utils/authInvalidation'

// API响应基础接口
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  metadata?: Record<string, any>
  warning?: string
}

// 分页响应接口
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  message?: string
}

// 请求配置接口
export interface RequestConfig extends RequestInit {
  timeout?: number
  showErrorMessage?: boolean
  requireAuth?: boolean
  retryCount?: number
  responseType?: 'json' | 'text' | 'blob'
}

// API错误类
export class ApiError extends Error {
  public status: number
  public code?: string
  public details?: any

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

// API服务类
export class ApiService {
  private baseUrl: string
  private defaultTimeout: number = 30000
  private maxRetries: number = 3
  private authStore: any = null

  constructor(baseUrl?: string) {
    // 优先使用代理（空字符串），降级到环境变量
    this.baseUrl = baseUrl || this.getOptimalBaseUrl()
  }

  /**
   * 获取最优的API基础URL
   * 支持局域网访问：自动使用当前页面地址
   */
  private getOptimalBaseUrl(): string {
    // 🔧 优先使用明确配置的环境变量
    const envUrl = import.meta.env.VITE_API_BASE_URL
    if (envUrl && envUrl.trim() !== '') {
      return envUrl.replace(/\/+$/, '')
    }

    // 开发环境使用代理（相对路径）
    if (import.meta.env.DEV) {
      return '' // 使用相对路径，通过Vite代理
    }

    // 🌐 生产环境：使用当前页面地址（支持局域网访问）
    if (typeof window !== 'undefined' && window.location) {
      // 直接使用当前页面的 origin（包含协议和主机）
      return window.location.origin
    }

    // 最终降级到 localhost
    return 'http://localhost:8002'
  }

  // 设置认证store引用
  setAuthStore(authStore: any) {
    this.authStore = authStore
  }

  // 获取访问令牌
  private getAccessToken(): string | null {
    // authStore.accessToken 是 computed，需要通过 .value 或直接访问
    // Pinia store 的 computed 在模板外需要 .value
    const storeToken = this.authStore?.accessToken
    const token = typeof storeToken === 'object' && storeToken !== null && 'value' in storeToken
      ? storeToken.value
      : storeToken
    return token || getStoredAccessToken()
  }

  // 检查是否需要刷新token
  private async checkAndRefreshToken(): Promise<boolean> {
    if (!this.authStore) return false

    try {
      // Pinia computed 属性可能需要 .value 访问
      const isExpiringSoon = this.unwrapComputed(this.authStore.isTokenExpiringSoon)
      const hasRefreshToken = !!this.unwrapComputed(this.authStore.refreshToken)
      
      // 如果token即将过期，尝试刷新
      if (isExpiringSoon && hasRefreshToken) {
        const success = await this.authStore.refreshAccessToken()
        if (!success) {
          // 刷新失败，清除认证状态
          await this.authStore.logout(false, false)
          return false
        }
      }
      return true
    } catch (error) {
      console.error('Token refresh failed:', error)
      return false
    }
  }
  
  // 解包 Pinia computed 属性
  private unwrapComputed<T>(value: T | { value: T }): T {
    if (typeof value === 'object' && value !== null && 'value' in value) {
      return (value as { value: T }).value
    }
    return value as T
  }

  // 构建请求头
  private buildHeaders(config: RequestConfig = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers as Record<string, string>)
    }

    // 如果需要认证，添加Authorization头
    if (config.requireAuth !== false) {
      const token = this.getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    // 🔧 新增：添加原始Host信息用于正确的URL生成
    if (typeof window !== 'undefined') {
      const originalHost = window.location.host
      if (originalHost && originalHost !== 'localhost:3000') {
        headers['X-Original-Host'] = originalHost
      }
    }

    return headers
  }

  // 处理API响应
  private async handleResponse<T>(response: Response, responseType?: 'json' | 'text' | 'blob'): Promise<T> {
    // Explicit responseType takes precedence
    if (response.ok && responseType) {
      if (responseType === 'blob') {
        const blob = await response.blob()
        return blob as unknown as T
      }
      if (responseType === 'text') {
        const text = await response.text()
        return text as unknown as T
      }
      // fallthrough to JSON handling below when 'json'
    }
    const contentType = response.headers.get('content-type')
    const isJson = contentType?.includes('application/json')

    let data: any
    try {
      if (response.ok && responseType === 'json') {
        data = await response.json()
      } else {
        data = isJson ? await response.json() : await response.text()
      }
    } catch (error) {
      throw new ApiError(
        'Invalid response format',
        response.status,
        'INVALID_RESPONSE'
      )
    }

    if (!response.ok) {
      // 提取错误信息 - 支持多种错误格式
      let message: string
      let code: string | undefined
      let details: any
      
      if (typeof data?.error === 'object' && data.error !== null) {
        // 新格式: { success: false, error: { code, message, details } }
        message = data.error.message || data.message || `HTTP ${response.status}: ${response.statusText}`
        code = data.error.code || data.code
        details = data.error.details || data.error
      } else if (typeof data?.error === 'string') {
        // 旧格式: { error: "错误消息" }
        message = data.error
        code = data.code
        details = data
      } else {
        // 其他格式: { code, message, details } or { success, code, message, details }
        message = data?.message || `HTTP ${response.status}: ${response.statusText}`
        code = data?.code
        // 如果有单独的 details 字段，使用它；否则使用整个 data
        details = data?.details || data
      }
      
      throw new ApiError(
        message,
        response.status,
        code,
        details
      )
    }

    return data
  }

  // 处理认证错误
  private async handleAuthError(error: ApiError): Promise<never> {
    if (error.status === 401) {
      // 认证已失效时只清理本地状态，避免再次等待失效会话的网络请求。
      if (this.authStore) {
        await this.authStore.logout(false, false)
      }

      dispatchAuthInvalidation({
        source: 'api',
        message: '登录已过期，请重新登录'
      })
      ElMessage.error('登录已过期，请重新登录')
    } else if (error.status === 403) {
      ElMessage.error('权限不足，无法执行此操作')
    }
    
    throw error
  }

  // 核心请求方法
  async request<T = any>(
    endpoint: string, 
    config: RequestConfig = {}
  ): Promise<T> {
    const {
      timeout = this.defaultTimeout,
      showErrorMessage = true,
      requireAuth = true,
      retryCount = 0,
      responseType,
      ...fetchConfig
    } = config

    // 如果需要认证，检查并刷新token
    if (requireAuth && this.authStore) {
      const tokenValid = await this.checkAndRefreshToken()
      if (!tokenValid) {
        return this.handleAuthError(new ApiError('Authentication failed', 401, 'AUTH_FAILED'))
      }
    }

    const isAbsoluteUrl = endpoint.startsWith('http')
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    const baseUrl = this.baseUrl.replace(/\/+$/, '')

    let url: string
    if (isAbsoluteUrl) {
      url = endpoint
    } else if (normalizedEndpoint.startsWith('/api/')) {
      url = `${baseUrl}${normalizedEndpoint}`
    } else {
      url = `${baseUrl}/api${normalizedEndpoint}`
    }
    const headers = this.buildHeaders(config)

    try {
      // 创建AbortController用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...fetchConfig,
        headers,
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      
      const result = await this.handleResponse<T>(response, responseType)
      return result

    } catch (error) {
      if (error instanceof ApiError) {
        // 仅认证请求触发全局认证处理，避免公共接口/访客态产生误报
        if (requireAuth && (error.status === 401 || error.status === 403)) {
          return this.handleAuthError(error)
        }

        // 显示错误消息
        if (showErrorMessage) {
          ElMessage.error(error.message)
        }
        
        throw error
      }

      // 处理网络错误和超时
      if (error instanceof TypeError) {
        const networkError = new ApiError(
          '网络连接失败，请检查网络状态',
          0,
          'NETWORK_ERROR'
        )
        
        if (showErrorMessage) {
          ElMessage.error(networkError.message)
        }
        
        throw networkError
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new ApiError(
          '请求超时，请稍后重试',
          408,
          'TIMEOUT'
        )
        
        if (showErrorMessage) {
          ElMessage.error(timeoutError.message)
        }
        
        throw timeoutError
      }

      // 重试机制
      if (retryCount < this.maxRetries) {
        console.warn(`Request failed, retrying... (${retryCount + 1}/${this.maxRetries})`)
        return this.request(endpoint, { ...config, retryCount: retryCount + 1 })
      }

      throw error
    }
  }

  // GET请求
  async get<T = any>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'GET'
    })
  }

  // POST请求
  async post<T = any>(endpoint: string, data?: any, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  // PUT请求
  async put<T = any>(endpoint: string, data?: any, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  // PATCH请求
  async patch<T = any>(endpoint: string, data?: any, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  // DELETE请求
  async delete<T = any>(endpoint: string, config: RequestConfig = {}): Promise<T> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'DELETE'
    })
  }

  // 上传文件
  async upload<T = any>(
    endpoint: string, 
    file: File | FormData, 
    config: RequestConfig = {}
  ): Promise<T> {
    const formData = file instanceof FormData ? file : new FormData()
    if (file instanceof File) {
      formData.append('file', file)
    }

    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: formData,
      headers: {
        // 不设置Content-Type，让浏览器自动设置
        ...config.headers
      }
    })
  }

  // 下载文件
  async download(endpoint: string, filename?: string, config: RequestConfig = {}): Promise<void> {
    try {
      const response = await fetch(
        endpoint.startsWith('http') ? endpoint : `${this.baseUrl}/api${endpoint}`,
        {
          ...config,
          headers: this.buildHeaders(config)
        }
      )

      if (!response.ok) {
        throw new ApiError(
          `Download failed: ${response.statusText}`,
          response.status
        )
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      
      link.href = url
      link.download = filename || 'download'
      document.body.appendChild(link)
      link.click()
      
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      if (config.showErrorMessage !== false) {
        ElMessage.error('文件下载失败')
      }
      throw error
    }
  }
}

// 创建默认API实例
export const apiService = new ApiService()

// 导出类型
// Types are already exported inline with their definitions
