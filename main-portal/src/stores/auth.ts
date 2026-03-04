import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { authApiService } from '@/services/authApi'
import { logLoginStart, logLoginSuccess, logLoginError } from '@/utils/loginDebug'
import { TokenRefreshManager } from './TokenRefreshManager'

// 用户信息接口
export interface User {
  id: string
  username: string
  role: 'admin' | 'operator' | 'guest'
  is_active: boolean
  last_login?: string
  created_at: string
  updated_at: string
}

// 认证令牌信息
export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
}

// 登录请求参数
export interface LoginCredentials {
  username: string
  password: string
  rememberMe?: boolean
}

// 登录响应
export interface LoginResponse {
  success: boolean
  data: {
    user: User
    tokens: AuthTokens
  }
  message: string
}

// API响应基础接口
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'user_info'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const isLoading = ref(false)
  const tokenExpiresAt = ref<Date | null>(null)
  const isInitialized = ref(false) // 新增：用于标记初始化是否完成
  
  // Token 刷新管理器
  const tokenRefreshManager = new TokenRefreshManager()

  // 计算属性
  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin' && user.value?.is_active)
  const isOperator = computed(() => user.value?.role === 'operator' && user.value?.is_active)
  const isGuest = computed(() => !isAuthenticated.value)
  const currentUser = computed(() => user.value)
  const userDisplayName = computed(() => user.value?.username || '访客')


  // 保存认证信息到本地存储
  const saveAuthData = (tokens: AuthTokens, userData: User) => {
    accessToken.value = tokens.accessToken
    refreshToken.value = tokens.refreshToken
    user.value = userData

    // 计算token过期时间
    tokenExpiresAt.value = new Date(Date.now() + tokens.expiresIn * 1000)

    // 保存到localStorage
    localStorage.setItem(TOKEN_KEY, tokens.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))
  }

  // 清除认证信息
  const clearAuthData = () => {
    accessToken.value = null
    refreshToken.value = null
    user.value = null
    tokenExpiresAt.value = null

    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  // 从本地存储恢复认证信息
  const restoreAuthData = async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const refreshTokenValue = localStorage.getItem(REFRESH_TOKEN_KEY)
      const userDataStr = localStorage.getItem(USER_KEY)

      if (token && refreshTokenValue && userDataStr) {
        const userData = JSON.parse(userDataStr)

        // 检查恢复的用户数据是否有效
        if (!userData.is_active) {
          console.warn('恢复的用户账户已被禁用，清除认证数据')
          clearAuthData()
          return false
        }

        // 先设置store状态，确保UI立即反映认证状态
        accessToken.value = token
        refreshToken.value = refreshTokenValue
        user.value = userData

        // 兼容不同token格式的验证
        try {
          // 检查是否为JWT格式（三个部分用点分隔）
          const tokenParts = token.split('.')
          if (tokenParts.length === 3) {
            // 标准JWT token验证
            try {
              const payload = JSON.parse(atob(tokenParts[1]))
              const now = Math.floor(Date.now() / 1000)
              
              // 如果token已过期超过1小时，才清除状态
              if (payload.exp && (now - payload.exp) > 3600) {
                console.warn('JWT Token已过期超过1小时，清除认证数据')
                clearAuthData()
                return false
              }
            } catch (jwtError) {
              console.warn('JWT Token格式无效，清除认证数据')
              clearAuthData()
              return false
            }
          } else if (token.startsWith('mock-jwt-token-')) {
            // 检查是否为生产环境
            if (import.meta.env.PROD) {
              console.error('生产环境不允许使用Mock Token')
              clearAuthData()
              return false
            }

            // 开发环境：检查是否过旧（超过24小时）
            const timestampMatch = token.match(/mock-jwt-token-\w+-(\d+)/)
            if (timestampMatch) {
              const tokenTimestamp = parseInt(timestampMatch[1])
              const now = Date.now()
              const tokenAge = now - tokenTimestamp

              if (tokenAge > 24 * 60 * 60 * 1000) {
                console.warn('Mock Token已过期，清除认证数据')
                clearAuthData()
                return false
              }
            }
            console.warn('使用Mock Token（仅限开发环境）')
          } else {
            // 其他格式的token，暂时允许通过但记录警告
            console.warn('未知token格式，允许通过:', token.substring(0, 20) + '...')
          }
        } catch (tokenError) {
          console.warn('Token验证过程出错，清除认证数据:', tokenError)
          clearAuthData()
          return false
        }

        return true
      }
    } catch (error) {
      console.error('恢复认证数据失败:', error)
      clearAuthData()
    }
    return false
  }

  // 用户登录
  const login = async (credentials: LoginCredentials, skipLogging: boolean = false): Promise<boolean> => {
    // 防重复提交检查
    if (isLoading.value) {
      console.warn('登录请求正在处理中，忽略重复请求')
      return false
    }

    try {
      isLoading.value = true

      // 只在直接调用时记录（避免重复记录）
      if (!skipLogging) {
        logLoginStart(credentials, 'authStore')
      }

      const response = await authApiService.login(credentials)

      if (response.success && response.data) {
        saveAuthData(response.data.tokens, response.data.user)
        if (!skipLogging) {
          logLoginSuccess('authStore')
        }
        ElMessage.success(response.message || '登录成功')
        return true
      } else {
        const errorMsg = response.message || '登录失败'
        if (!skipLogging) {
          logLoginError(errorMsg, 'authStore')
        }
        throw new Error(errorMsg)
      }
    } catch (error: any) {
      const errorMsg = error.message || '登录失败，请稍后重试'
      if (!skipLogging) {
        logLoginError(errorMsg, 'authStore')
      }
      ElMessage.error(errorMsg)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 用户登出
  const logout = async (showMessage = true) => {
    try {
      if (accessToken.value) {
        // 调用后端登出接口
        await authApiService.logout().catch(() => {
          // 忽略登出API错误，因为token可能已经无效
        })
      }

      clearAuthData()
      
      if (showMessage) {
        ElMessage.success('已安全登出')
      }
    } catch (error) {
      console.error('登出失败:', error)
      // 即使API调用失败，也要清除本地数据
      clearAuthData()
    }
  }

  // 验证当前token
  const verifyToken = async (): Promise<boolean> => {
    try {
      if (!accessToken.value) {
        return false
      }

      const response = await authApiService.verifyToken()
      
      if (response.success && response.data) {
        user.value = response.data
        return true
      } else {
        // 只有明确的认证错误才清除状态，其他错误保持状态
        console.warn('Token验证失败，但保持当前状态')
        return false
      }
    } catch (error: any) {
      console.error('Token验证网络错误:', error)
      // 网络错误不清除认证状态，返回true让用户继续使用
      // 后续的API请求会处理真正的认证问题
      return true
    }
  }

  // 刷新访问token（使用 TokenRefreshManager 防止竞态）
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken.value) {
      return false
    }

    return await tokenRefreshManager.refreshToken(
      refreshToken.value,
      // 成功回调
      (tokens: AuthTokens) => {
        accessToken.value = tokens.accessToken
        tokenExpiresAt.value = new Date(Date.now() + tokens.expiresIn * 1000)
        localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      },
      // 失败回调
      () => {
        clearAuthData()
      }
    )
  }

  // 获取用户信息
  const fetchUserProfile = async (): Promise<User | null> => {
    try {
      const response = await authApiService.getUserProfile()
      
      if (response.success && response.data) {
        user.value = response.data
        localStorage.setItem(USER_KEY, JSON.stringify(response.data))
        return response.data
      }
      return null
    } catch (error) {
      console.error('获取用户信息失败:', error)
      return null
    }
  }

  // 修改密码
  const changePassword = async (
    currentPassword: string, 
    newPassword: string, 
    confirmPassword: string
  ): Promise<boolean> => {
    try {
      isLoading.value = true

      const response = await authApiService.changePassword({
        currentPassword,
        newPassword,
        confirmPassword
      })

      if (response.success) {
        ElMessage.success(response.message || '密码修改成功，请重新登录')
        // 密码修改成功后需要重新登录
        clearAuthData()
        return true
      } else {
        throw new Error(response.message || '密码修改失败')
      }
    } catch (error: any) {
      ElMessage.error(error.message || '密码修改失败')
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 检查token是否即将过期
  const isTokenExpiringSoon = computed(() => {
    if (!tokenExpiresAt.value) return false
    const now = new Date()
    const fifteenMinutes = 15 * 60 * 1000
    return tokenExpiresAt.value.getTime() - now.getTime() < fifteenMinutes
  })

  // 自动刷新token
  const autoRefreshToken = async () => {
    if (isTokenExpiringSoon.value && refreshToken.value) {
      await refreshAccessToken()
    }
  }

  // 检查权限
  const hasPermission = (requiredRole: 'admin' | 'operator' | 'guest' = 'guest'): boolean => {
    if (!isAuthenticated.value) {
      return requiredRole === 'guest'
    }

    if (requiredRole === 'admin') {
      return isAdmin.value
    }

    if (requiredRole === 'operator') {
      // operator 或 admin 都可以
      return isOperator.value || isAdmin.value
    }

    return true
  }

  // 初始化认证状态
  const initializeAuth = async (): Promise<boolean> => {
    // 如果已经初始化过，则直接返回当前认证状态，避免重复执行
    if (isInitialized.value) {
      return isAuthenticated.value
    }

    try {
      isLoading.value = true
      // 标记为即将开始初始化
      isInitialized.value = false
      
      const result = await restoreAuthData()
      
      // 确保在初始化完成后才设置标记
      isInitialized.value = true
      return result
    } catch (error) {
      console.error('初始化认证状态失败:', error)
      clearAuthData() // 确保在失败时清除状态
      isInitialized.value = true // 即使失败也要标记为已完成
      return false
    } finally {
      isLoading.value = false
    }
  }

  // 设置定时器自动刷新token
  let refreshTokenTimer: number | null = null

  const startTokenRefreshTimer = () => {
    // 清除现有定时器
    if (refreshTokenTimer) {
      clearInterval(refreshTokenTimer)
    }

    // 每5分钟检查一次是否需要刷新token
    refreshTokenTimer = window.setInterval(() => {
      if (isAuthenticated.value) {
        autoRefreshToken()
      }
    }, 5 * 60 * 1000)
  }

  const stopTokenRefreshTimer = () => {
    if (refreshTokenTimer) {
      clearInterval(refreshTokenTimer)
      refreshTokenTimer = null
    }
  }

  return {
    // 状态
    user: computed(() => user.value),
    isLoading: computed(() => isLoading.value),
    isInitialized: computed(() => isInitialized.value), // 暴露初始化状态
    accessToken: computed(() => accessToken.value),
    refreshToken: computed(() => refreshToken.value),
    
    // 计算属性
    isAuthenticated,
    isAdmin,
    isOperator,
    isGuest,
    currentUser,
    userDisplayName,
    isTokenExpiringSoon,
    
    // 方法
    login,
    logout,
    verifyToken,
    refreshAccessToken,
    fetchUserProfile,
    changePassword,
    hasPermission,
    initializeAuth,
    startTokenRefreshTimer,
    stopTokenRefreshTimer,
    
  }
})