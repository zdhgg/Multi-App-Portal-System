/**
 * 认证调试和清理工具
 * 用于诊断和解决认证相关问题
 */

import { useAuthStore } from '@/stores/auth'
import { clearStoredAuthData, readStoredAuthData, type AuthStorageMode } from './authStorage'
import { isDebugToolsEnabled } from './debugControl'

export interface AuthStorageDebugState {
  storageMode: AuthStorageMode | null
  hasToken: boolean
  hasRefreshToken: boolean
  hasUserInfo: boolean
  userInfo?: any
}

export interface AuthDebugInfo {
  storage: AuthStorageDebugState
  localStorage: AuthStorageDebugState
  authStore: {
    isAuthenticated: boolean
    hasUser: boolean
    userActive?: boolean
    userRole?: string
  }
  issues: string[]
  recommendations: string[]
}

function getStorageDebugState(): AuthStorageDebugState {
  const storedAuth = readStoredAuthData<any>()

  return {
    storageMode: storedAuth.storageMode,
    hasToken: !!storedAuth.accessToken,
    hasRefreshToken: !!storedAuth.refreshToken,
    hasUserInfo: !!storedAuth.userDataRaw,
    userInfo: storedAuth.userData ?? undefined
  }
}

export function getAuthDebugInfo(): AuthDebugInfo {
  const authStore = useAuthStore()
  const issues: string[] = []
  const recommendations: string[] = []
  const storageInfo = getStorageDebugState()

  const storeInfo = {
    isAuthenticated: authStore.isAuthenticated,
    hasUser: !!authStore.user,
    userActive: authStore.user?.is_active,
    userRole: authStore.user?.role
  }

  if (storageInfo.hasToken && !authStore.isAuthenticated) {
    issues.push('浏览器存储中有token但authStore未认证')
    recommendations.push('重新初始化认证状态或清除无效token')
  }

  if (storageInfo.userInfo && !storageInfo.userInfo.is_active) {
    issues.push('浏览器存储中的用户账户已被禁用')
    recommendations.push('清除被禁用用户的认证数据')
  }

  if (authStore.user && !authStore.user.is_active) {
    issues.push('当前用户账户已被禁用')
    recommendations.push('登出用户并清除认证数据')
  }

  if (storageInfo.hasToken !== storageInfo.hasRefreshToken) {
    issues.push('token和refreshToken状态不一致')
    recommendations.push('清除所有认证数据并重新登录')
  }

  return {
    storage: storageInfo,
    localStorage: storageInfo,
    authStore: storeInfo,
    issues,
    recommendations
  }
}

export function clearAllAuthData(): void {
  clearStoredAuthData()

  try {
    const authStore = useAuthStore()
    void authStore.logout(false)
  } catch (error) {
    console.warn('清除authStore失败:', error)
  }

  console.log('所有认证数据已清除')
}

export function fixAuthIssues(): boolean {
  const debugInfo = getAuthDebugInfo()

  if (debugInfo.issues.length === 0) {
    console.log('未发现认证状态问题')
    return true
  }

  console.warn('发现认证状态问题:', debugInfo.issues)
  console.log('建议的修复方案:', debugInfo.recommendations)

  let fixed = false

  if (debugInfo.storage.userInfo && !debugInfo.storage.userInfo.is_active) {
    console.log('清除被禁用用户的认证数据...')
    clearAllAuthData()
    fixed = true
  }

  if (debugInfo.storage.hasToken !== debugInfo.storage.hasRefreshToken) {
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

export function exposeAuthDebugTools(): void {
  if (isDebugToolsEnabled()) {
    ;(window as any).authDebug = {
      getInfo: getAuthDebugInfo,
      clearAll: clearAllAuthData,
      fix: fixAuthIssues
    }
    console.log('认证调试工具已暴露到 window.authDebug')
  }
}
