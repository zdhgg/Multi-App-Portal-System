/**
 * 认证调试和清理工具
 * 用于诊断和解决认证相关问题
 */

import { useAuthStore } from '@/stores/auth'

export interface AuthDebugInfo {
  localStorage: {
    hasToken: boolean
    hasRefreshToken: boolean
    hasUserInfo: boolean
    userInfo?: any
  }
  authStore: {
    isAuthenticated: boolean
    hasUser: boolean
    userActive?: boolean
    userRole?: string
  }
  issues: string[]
  recommendations: string[]
}

/**
 * 获取认证状态调试信息
 */
export function getAuthDebugInfo(): AuthDebugInfo {
  const authStore = useAuthStore()
  const issues: string[] = []
  const recommendations: string[] = []

  // 检查localStorage
  const hasToken = !!localStorage.getItem('auth_token')
  const hasRefreshToken = !!localStorage.getItem('refresh_token')
  const hasUserInfo = !!localStorage.getItem('user_info')
  
  let userInfo: any = null
  try {
    const userInfoStr = localStorage.getItem('user_info')
    if (userInfoStr) {
      userInfo = JSON.parse(userInfoStr)
    }
  } catch (error) {
    issues.push('localStorage中的用户信息格式无效')
    recommendations.push('清除localStorage中的认证数据')
  }

  // 检查authStore状态
  const storeInfo = {
    isAuthenticated: authStore.isAuthenticated,
    hasUser: !!authStore.user,
    userActive: authStore.user?.is_active,
    userRole: authStore.user?.role
  }

  // 检测问题
  if (hasToken && !authStore.isAuthenticated) {
    issues.push('localStorage中有token但authStore未认证')
    recommendations.push('重新初始化认证状态或清除无效token')
  }

  if (userInfo && !userInfo.is_active) {
    issues.push('localStorage中存储的用户账户已被禁用')
    recommendations.push('清除被禁用用户的认证数据')
  }

  if (authStore.user && !authStore.user.is_active) {
    issues.push('当前用户账户已被禁用')
    recommendations.push('登出用户并清除认证数据')
  }

  if (hasToken !== hasRefreshToken) {
    issues.push('token和refreshToken状态不一致')
    recommendations.push('清除所有认证数据并重新登录')
  }

  return {
    localStorage: {
      hasToken,
      hasRefreshToken,
      hasUserInfo,
      userInfo
    },
    authStore: storeInfo,
    issues,
    recommendations
  }
}

/**
 * 清理所有认证数据
 */
export function clearAllAuthData(): void {
  // 清除localStorage
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_info')

  // 清除authStore（如果可用）
  try {
    const authStore = useAuthStore()
    authStore.logout(false) // 不显示消息
  } catch (error) {
    console.warn('清除authStore失败:', error)
  }

  console.log('所有认证数据已清除')
}

/**
 * 修复认证状态问题
 */
export function fixAuthIssues(): boolean {
  const debugInfo = getAuthDebugInfo()
  
  if (debugInfo.issues.length === 0) {
    console.log('未发现认证状态问题')
    return true
  }

  console.warn('发现认证状态问题:', debugInfo.issues)
  console.log('建议的修复方案:', debugInfo.recommendations)

  // 自动修复常见问题
  let fixed = false

  // 修复被禁用用户的数据
  if (debugInfo.localStorage.userInfo && !debugInfo.localStorage.userInfo.is_active) {
    console.log('清除被禁用用户的认证数据...')
    clearAllAuthData()
    fixed = true
  }

  // 修复token状态不一致
  if (debugInfo.localStorage.hasToken !== debugInfo.localStorage.hasRefreshToken) {
    console.log('修复token状态不一致问题...')
    clearAllAuthData()
    fixed = true
  }

  if (fixed) {
    console.log('认证状态问题已修复')
  } else {
    console.log('需要手动处理认证状态问题')
  }

  return fixed
}

/**
 * 在开发环境中暴露调试工具到全局
 */
export function exposeAuthDebugTools(): void {
  if (import.meta.env.DEV) {
    (window as any).authDebug = {
      getInfo: getAuthDebugInfo,
      clearAll: clearAllAuthData,
      fix: fixAuthIssues
    }
    console.log('认证调试工具已暴露到 window.authDebug')
  }
}
