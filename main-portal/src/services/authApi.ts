import { apiService } from './api'
import type { ApiResponse } from './api'
import type { User, LoginCredentials, AuthTokens } from '@/stores/auth'

// 认证相关的API响应类型
export interface LoginResponse {
  success: boolean
  data: {
    user: User
    tokens: AuthTokens
  }
  message: string
}

export interface TokenRefreshResponse {
  success: boolean
  data: AuthTokens
  message?: string
}

export interface UserProfileResponse {
  success: boolean
  data: User
  message?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// 认证API服务类
export class AuthApiService {
  
  /**
   * 用户登录
   */
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return apiService.post<LoginResponse>('/v2/auth/login', credentials, {
      requireAuth: false,
      showErrorMessage: false, // 让组件自己处理错误消息
      retryCount: 0 // 登录请求不重试，避免触发频率限制
    })
  }

  /**
   * 用户登出
   */
  async logout(): Promise<ApiResponse> {
    return apiService.post<ApiResponse>('/v2/auth/logout', undefined, {
      showErrorMessage: false
    })
  }

  /**
   * 验证当前token
   */
  async verifyToken(): Promise<UserProfileResponse> {
    return apiService.get<UserProfileResponse>('/v2/auth/verify', {
      showErrorMessage: false
    })
  }

  /**
   * 刷新访问token
   */
  async refreshToken(refreshToken: string): Promise<TokenRefreshResponse> {
    return apiService.post<TokenRefreshResponse>('/v2/auth/refresh', {
      refreshToken
    }, {
      requireAuth: false,
      showErrorMessage: false
    })
  }

  /**
   * 获取用户信息
   */
  async getUserProfile(): Promise<UserProfileResponse> {
    return apiService.get<UserProfileResponse>('/v2/auth/profile')
  }

  /**
   * 修改密码
   */
  async changePassword(data: ChangePasswordRequest): Promise<ApiResponse> {
    return apiService.post<ApiResponse>('/v2/auth/change-password', data, {
      showErrorMessage: false // 让组件自己处理错误消息
    })
  }

  /**
   * 获取当前用户的会话列表
   */
  async getUserSessions(): Promise<ApiResponse<any[]>> {
    return apiService.get<ApiResponse<any[]>>('/v2/auth/sessions')
  }

  /**
   * 撤销指定会话
   */
  async revokeSession(sessionId: string): Promise<ApiResponse> {
    return apiService.delete<ApiResponse>(`/v2/auth/sessions/${sessionId}`)
  }

  /**
   * 撤销所有其他会话（除当前会话外）
   */
  async revokeAllOtherSessions(): Promise<ApiResponse> {
    return apiService.post<ApiResponse>('/v2/auth/sessions/revoke-all-others')
  }
}

// 创建认证API服务实例
export const authApiService = new AuthApiService()