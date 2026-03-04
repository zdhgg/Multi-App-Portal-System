/**
 * 认证修复工具
 * 用于诊断和修复前端认证相关问题
 */

import { useAuthStore } from '@/stores/auth'
import { apiService } from '@/services/api'

// 调试信息接口
export interface AuthDiagnostic {
  hasToken: boolean
  hasRefreshToken: boolean
  hasUserInfo: boolean
  tokenValid: boolean
  tokenExpired: boolean
  storeInitialized: boolean
  isAuthenticated: boolean
  errors: string[]
}

/**
 * 诊断认证状态
 */
export const diagnoseAuth = (): AuthDiagnostic => {
  const authStore = useAuthStore()
  const errors: string[] = []
  
  // 检查localStorage
  const token = localStorage.getItem('auth_token')
  const refreshToken = localStorage.getItem('refresh_token')
  const userInfo = localStorage.getItem('user_info')
  
  let tokenValid = false
  let tokenExpired = false
  
  if (token) {
    try {
      // 解析JWT payload
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
  } else {
    try {
      const user = JSON.parse(userInfo)
      if (!user.is_active) {
        errors.push('用户账户已被禁用')
      }
    } catch {
      errors.push('用户信息格式无效')
    }
  }
  
  return {
    hasToken: !!token,
    hasRefreshToken: !!refreshToken,
    hasUserInfo: !!userInfo,
    tokenValid,
    tokenExpired,
    storeInitialized: authStore.isInitialized,
    isAuthenticated: authStore.isAuthenticated,
    errors
  }
}

/**
 * 清除所有认证数据
 */
export const clearAllAuthData = () => {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')  
  localStorage.removeItem('user_info')
  
  console.log('✅ 已清除所有认证数据')
}

/**
 * 使用默认管理员账户重新登录
 */
export const reloginAsAdmin = async (): Promise<boolean> => {
  const authStore = useAuthStore()
  
  try {
    console.log('🔄 尝试使用默认管理员账户登录...')
    
    const success = await authStore.login({
      username: 'admin',
      password: 'admin123'
    }, true) // skipLogging=true避免重复日志
    
    if (success) {
      console.log('✅ 管理员登录成功')
      return true
    } else {
      console.log('❌ 管理员登录失败')
      return false
    }
  } catch (error) {
    console.error('❌ 管理员登录出错:', error)
    return false
  }
}

/**
 * 测试API认证
 */
export const testApiAuth = async (): Promise<boolean> => {
  try {
    console.log('🔄 测试API认证...')
    
    // 尝试调用需要认证的API
    const response = await apiService.get('/v2/applications')
    
    if (response.success) {
      console.log('✅ API认证测试成功')
      return true
    } else {
      console.log('❌ API认证测试失败:', response)
      return false
    }
  } catch (error: any) {
    console.error('❌ API认证测试出错:', error.message)
    return false
  }
}

/**
 * 自动修复认证问题
 */
export const autoFixAuth = async (): Promise<boolean> => {
  console.log('🔧 开始自动修复认证问题...')
  
  // 1. 诊断问题
  const diagnostic = diagnoseAuth()
  console.log('📊 认证诊断结果:', diagnostic)
  
  // 2. 如果有严重问题，清除并重新登录
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
  
  // 3. 测试修复结果
  const testSuccess = await testApiAuth()
  
  if (testSuccess) {
    console.log('✅ 认证问题修复成功')
    return true
  } else {
    console.log('❌ 修复后仍有问题，请检查服务器状态')
    return false
  }
}

/**
 * 暴露全局调试工具
 */
export const exposeAuthFixTools = () => {
  if (typeof window !== 'undefined') {
    (window as any).authFix = {
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
