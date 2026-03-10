/**
 * 认证修复工具
 * 用于诊断和修复前端认证相关问题
 */

import { useAuthStore } from '@/stores/auth'
import { apiService } from '@/services/api'
import { clearStoredAuthData, readStoredAuthData, type AuthStorageMode } from './authStorage'
import { isDebugToolsEnabled } from './debugControl'

export interface AuthDiagnostic {
  hasToken: boolean
  hasRefreshToken: boolean
  hasUserInfo: boolean
  tokenValid: boolean
  tokenExpired: boolean
  storeInitialized: boolean
  isAuthenticated: boolean
  storageMode: AuthStorageMode | null
  errors: string[]
}

export const diagnoseAuth = (): AuthDiagnostic => {
  const authStore = useAuthStore()
  const errors: string[] = []
  const storedAuth = readStoredAuthData<any>()
  const token = storedAuth.accessToken
  const refreshToken = storedAuth.refreshToken
  const userInfo = storedAuth.userDataRaw

  let tokenValid = false
  let tokenExpired = false

  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const now = Math.floor(Date.now() / 1000)

      if (payload.exp) {
        tokenExpired = now > payload.exp
        tokenValid = !tokenExpired

        if (tokenExpired) {
          errors.push(`Token已过期，过期时间: ${new Date(payload.exp * 1000).toLocaleString()}`)
        }
      } else {
        errors.push('Token没有过期时间信息')
      }
    } catch (error) {
      errors.push('Token格式无效')
    }
  } else {
    errors.push('没有找到auth_token')
  }

  if (!refreshToken) {
    errors.push('没有找到refresh_token')
  }

  if (!userInfo) {
    errors.push('没有找到user_info')
  } else if (storedAuth.userData && !storedAuth.userData.is_active) {
    errors.push('用户账户已被禁用')
  }

  return {
    hasToken: !!token,
    hasRefreshToken: !!refreshToken,
    hasUserInfo: !!userInfo,
    tokenValid,
    tokenExpired,
    storeInitialized: authStore.isInitialized,
    isAuthenticated: authStore.isAuthenticated,
    storageMode: storedAuth.storageMode,
    errors
  }
}

export const clearAllAuthData = () => {
  clearStoredAuthData()

  try {
    const authStore = useAuthStore()
    void authStore.logout(false)
  } catch (error) {
    console.warn('清除authStore失败:', error)
  }

  console.log('✅ 已清除所有认证数据')
}

export const reloginAsAdmin = async (): Promise<boolean> => {
  const authStore = useAuthStore()

  try {
    console.log('🔄 尝试使用默认管理员账户登录...')

    const success = await authStore.login({
      username: 'admin',
      password: 'admin123'
    }, true)

    if (success) {
      console.log('✅ 管理员登录成功')
      return true
    }

    console.log('❌ 管理员登录失败')
    return false
  } catch (error) {
    console.error('❌ 管理员登录出错:', error)
    return false
  }
}

export const testApiAuth = async (): Promise<boolean> => {
  try {
    console.log('🔄 测试API认证...')

    const response = await apiService.get('/v2/applications')

    if (response.success) {
      console.log('✅ API认证测试成功')
      return true
    }

    console.log('❌ API认证测试失败:', response)
    return false
  } catch (error: any) {
    console.error('❌ API认证测试出错:', error.message)
    return false
  }
}

export const autoFixAuth = async (): Promise<boolean> => {
  console.log('🔧 开始自动修复认证问题...')

  const diagnostic = diagnoseAuth()
  console.log('📊 认证诊断结果:', diagnostic)

  if (diagnostic.errors.length > 0 || !diagnostic.isAuthenticated) {
    console.log('🧹 清除有问题的认证数据...')
    clearAllAuthData()

    console.log('🔐 尝试重新登录...')
    const loginSuccess = await reloginAsAdmin()

    if (!loginSuccess) {
      console.log('❌ 自动修复失败，请手动登录')
      return false
    }
  }

  const testSuccess = await testApiAuth()

  if (testSuccess) {
    console.log('✅ 认证问题修复成功')
    return true
  }

  console.log('❌ 修复后仍有问题，请检查服务器状态')
  return false
}

export const exposeAuthFixTools = () => {
  if (typeof window !== 'undefined' && isDebugToolsEnabled()) {
    ;(window as any).authFix = {
      diagnose: diagnoseAuth,
      clear: clearAllAuthData,
      relogin: reloginAsAdmin,
      testApi: testApiAuth,
      autoFix: autoFixAuth
    }

    console.log(`
🔧 认证修复工具已可用:
- window.authFix.diagnose()     // 诊断认证状态
- window.authFix.clear()        // 清除认证数据  
- window.authFix.relogin()      // 重新登录
- window.authFix.testApi()      // 测试API认证
- window.authFix.autoFix()      // 自动修复
    `)
  }
}
