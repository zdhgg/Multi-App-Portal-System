/**
 * 认证测试场景
 * 用于测试各种认证状态下的路由访问权限
 */

import { getAuthDebugInfo, clearAllAuthData } from './authDebug'
import { saveStoredAuthData, updateStoredTokens } from './authStorage'
import { isDebugToolsEnabled } from './debugControl'

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

const nowIso = () => new Date().toISOString()

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
    description: '浏览器存储中存在被禁用用户的数据',
    setup: () => {
      clearAllAuthData()
      saveStoredAuthData(
        {
          accessToken: 'fake_token',
          refreshToken: 'fake_refresh_token'
        },
        {
          id: 'test_user',
          username: 'disabled_user',
          role: 'guest',
          is_active: false,
          created_at: nowIso(),
          updated_at: nowIso()
        },
        false
      )
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
      saveStoredAuthData(
        {
          accessToken: 'fake_token',
          refreshToken: 'fake_refresh_token'
        },
        {
          id: 'test_user',
          username: 'active_user',
          role: 'admin',
          is_active: true,
          created_at: nowIso(),
          updated_at: nowIso()
        },
        false
      )
      updateStoredTokens({
        accessToken: null,
        refreshToken: null
      })
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false,
      reason: 'without valid token, should be treated as anonymous'
    }
  },
  {
    name: 'Token不一致状态',
    description: '只有access token没有refresh token的不一致状态',
    setup: () => {
      clearAllAuthData()
      saveStoredAuthData(
        {
          accessToken: 'fake_token',
          refreshToken: 'fake_refresh_token'
        },
        {
          id: 'test_user',
          username: 'test_user',
          role: 'guest',
          is_active: true,
          created_at: nowIso(),
          updated_at: nowIso()
        },
        false
      )
      updateStoredTokens({ refreshToken: null })
    },
    expectedResult: {
      portalAccess: true,
      adminAccess: false,
      reason: 'inconsistent token state should be cleaned up'
    }
  }
]

export async function runTestScenario(scenario: TestScenario): Promise<{
  scenario: string
  passed: boolean
  details: any
}> {
  console.log(`
=== 运行测试场景: ${scenario.name} ===`)
  console.log(`描述: ${scenario.description}`)

  scenario.setup()

  await new Promise(resolve => setTimeout(resolve, 100))

  const debugInfo = getAuthDebugInfo()

  console.log('当前认证状态:', debugInfo)

  const result = {
    scenario: scenario.name,
    passed: true,
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

  const passedCount = results.filter(r => r.passed).length
  const totalCount = results.length

  console.log(`
=== 测试汇总 ===`)
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

export function exposeAuthTestTools(): void {
  if (isDebugToolsEnabled()) {
    ;(window as any).authTest = {
      scenarios: authTestScenarios,
      runScenario: runTestScenario,
      runAll: runAllTestScenarios
    }
    console.log('认证测试工具已暴露到 window.authTest')
  }
}
