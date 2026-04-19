import { describe, expect, it, vi } from 'vitest'
import { RouteGuardUtils } from '@/utils/routeGuards'

describe('RouteGuardUtils.checkTokenStatus', () => {
  it('当 refreshAccessToken 返回 false 时应按 token 过期处理', async () => {
    const result = await RouteGuardUtils.checkTokenStatus({
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken: vi.fn().mockResolvedValue(false)
    } as any)

    expect(result).toEqual({
      allowed: false,
      reason: 'token_refresh_failed',
      redirectTo: '/portal',
      redirectQuery: {
        message: 'token_expired'
      }
    })
  })
})
