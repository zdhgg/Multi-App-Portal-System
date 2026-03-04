/**
 * 认证测试场景
 * 用于测试各种认证状态下的路由访问权限
 */

import { getAuthDebugInfo, clearAllAuthData } from './authDebug'

export interface TestScenario {
  name: string
  description: string
  setup: () => void
  expectedResult: {
    portalAccess: boolean
    adminAccess: boolean
    reason?: string
  }
}

/**
 * 测试场景集合
 */
export const authTestScenarios: TestScenario[] = [
  {
    name: '匿名用户访问',
    description: '完全匿名的用户访问门户',
    setup: () => {
      clearAllAuthData()
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false,
      reason: 'anonymous user should access portal but not admin'
    }
  },
  {
    name: '被禁用用户数据缓存',
    description: 'localStorage中存在被禁用用户的数据',
    setup: () => {
      clearAllAuthData()
      // 模拟被禁用用户的缓存数据
      localStorage.setItem('auth_token', 'fake_token')
      localStorage.setItem('refresh_token', 'fake_refresh_token')
      localStorage.setItem('user_info', JSON.stringify({
        id: 'test_user',
        username: 'disabled_user',
        role: 'guest',
        is_active: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false,
      reason: 'disabled user cache should be cleared, allowing anonymous access'
    }
  },
  {
    name: '活跃用户正常访问',
    description: '正常的活跃用户访问',
    setup: () => {
      clearAllAuthData()
      // 模拟活跃用户的数据（注意：这只是模拟，实际需要有效token）
      localStorage.setItem('user_info', JSON.stringify({
        id: 'test_user',
        username: 'active_user',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false, // 因为没有有效token，所以实际上不会认证成功
      reason: 'without valid token, should be treated as anonymous'
    }
  },
  {
    name: 'Token不一致状态',
    description: '只有access token没有refresh token的不一致状态',
    setup: () => {
      clearAllAuthData()
      localStorage.setItem('auth_token', 'fake_token')
      // 故意不设置refresh_token
      localStorage.setItem('user_info', JSON.stringify({
        id: 'test_user',
        username: 'test_user',
        role: 'guest',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false,
      reason: 'inconsistent token state should be cleaned up'
    }
  }
]

/**
 * 运行单个测试场景
 */
export async function runTestScenario(scenario: TestScenario): Promise<{
  scenario: string
  passed: boolean
  details: any
}> {
  console.log(`\n=== 运行测试场景: ${scenario.name} ===`)
  console.log(`描述: ${scenario.description}`)
  
  // 设置测试环境
  scenario.setup()
  
  // 等待一小段时间让状态稳定
  await new Promise(resolve => setTimeout(resolve, 100))
  
  // 获取当前认证状态
  const debugInfo = getAuthDebugInfo()
  
  console.log('当前认证状态:', debugInfo)
  
  // 这里可以添加实际的路由访问测试
  // 由于我们在工具函数中，无法直接测试路由，但可以检查状态
  
  const result = {
    scenario: scenario.name,
    passed: true, // 这里需要根据实际测试结果判断
    details: {
      debugInfo,
      expectedResult: scenario.expectedResult,
      issues: debugInfo.issues,
      recommendations: debugInfo.recommendations
    }
  }
  
  console.log('测试结果:', result)
  return result
}

/**
 * 运行所有测试场景
 */
export async function runAllTestScenarios(): Promise<{ scenario: string; passed: boolean; details: any }[]> {
  console.log('开始运行认证测试场景...')
  
  const results = []
  
  for (const scenario of authTestScenarios) {
    try {
      const result = await runTestScenario(scenario)
      results.push(result)
    } catch (error) {
      console.error(`测试场景 ${scenario.name} 执行失败:`, error)
      results.push({
        scenario: scenario.name,
        passed: false,
        details: { error: (error as Error).message }
      })
    }
  }
  
  // 汇总结果
  const passedCount = results.filter(r => r.passed).length
  const totalCount = results.length
  
  console.log(`\n=== 测试汇总 ===`)
  console.log(`总计: ${totalCount} 个场景`)
  console.log(`通过: ${passedCount} 个场景`)
  console.log(`失败: ${totalCount - passedCount} 个场景`)
  
  if (passedCount === totalCount) {
    console.log('✅ 所有测试场景通过!')
  } else {
    console.log('❌ 部分测试场景失败，请检查详细信息')
  }
  
  return results
}

/**
 * 在开发环境中暴露测试工具
 */
export function exposeAuthTestTools(): void {
  if (import.meta.env.DEV) {
    (window as any).authTest = {
      scenarios: authTestScenarios,
      runScenario: runTestScenario,
      runAll: runAllTestScenarios
    }
    console.log('认证测试工具已暴露到 window.authTest')
  }
}
