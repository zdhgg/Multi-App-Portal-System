import { describe, expect, it, vi } from 'vitest'
import { RouteGuardUtils } from '@/utils/routeGuards'

describe('RouteGuardUtils.checkTokenStatus', () => {
  it('刷新成功时应放行导航', async () => {
    const result = await RouteGuardUtils.checkTokenStatus({
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken: vi.fn().mockResolvedValue(true),
      isSessionRetainedAfterRefreshFailure: () => true
    } as any)

    expect(result).toEqual({ allowed: true })
  })

  it('刷新失败但会话仍在（临时故障）时应放行导航', async () => {
    const result = await RouteGuardUtils.checkTokenStatus({
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken: vi.fn().mockResolvedValue(false),
      isSessionRetainedAfterRefreshFailure: () => true
    } as any)

    expect(result).toEqual({ allowed: true })
  })

  it('刷新失败且会话已清除（认证失效）时应按 token 过期处理', async () => {
    // 入口时刷新令牌仍存在；刷新失败后 store 清除会话，判定为不可恢复
    const fakeStore = {
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken: vi.fn().mockResolvedValue(false),
      isSessionRetainedAfterRefreshFailure: () => false
    }

    const result = await RouteGuardUtils.checkTokenStatus(fakeStore as any)

    expect(result).toEqual({
      allowed: false,
      reason: 'token_refresh_failed',
      redirectTo: '/portal',
      redirectQuery: {
        message: 'token_expired'
      }
    })
  })

  it('刷新抛出异常但会话仍在（临时故障）时应放行导航', async () => {
    const result = await RouteGuardUtils.checkTokenStatus({
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken: vi.fn().mockRejectedValue(new Error('network down')),
      isSessionRetainedAfterRefreshFailure: () => true
    } as any)

    expect(result).toEqual({ allowed: true })
  })
})
