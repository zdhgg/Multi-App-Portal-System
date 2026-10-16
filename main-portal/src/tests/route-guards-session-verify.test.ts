import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RouteGuardUtils } from '@/utils/routeGuards'
import { apiService, ApiError } from '@/services/api'

const protectedRoute = {
  meta: { requiresAuth: true, requiresAdmin: true },
  fullPath: '/management'
} as any

const resetSessionVerifyThrottle = () => {
  ;(RouteGuardUtils as any).verifiedSessionToken = ''
  ;(RouteGuardUtils as any).verifiedSessionAt = 0
}

describe('RouteGuardUtils.checkServerSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetSessionVerifyThrottle()
  })

  it('本地无访问令牌时按未登录处理', async () => {
    const result = await RouteGuardUtils.checkServerSession(protectedRoute, {
      accessToken: null
    } as any)

    expect(result).toEqual({
      allowed: false,
      reason: 'authentication_required',
      redirectTo: '/portal',
      redirectQuery: { redirect: '/management', authRequired: 'true' }
    })
  })

  it('后端拒绝该凭证时按会话失效处理', async () => {
    vi.spyOn(apiService, 'get').mockRejectedValue(new ApiError('认证失败', 401, 'AUTH_FAILED'))

    const result = await RouteGuardUtils.checkServerSession(protectedRoute, {
      accessToken: 'stale-token'
    } as any)

    expect(result).toEqual({
      allowed: false,
      reason: 'session_invalid',
      redirectTo: '/portal',
      redirectQuery: { redirect: '/management', authRequired: 'true' }
    })
  })

  it('后端确认有效时放行，并在窗口期内复用结果', async () => {
    const getSpy = vi
      .spyOn(apiService, 'get')
      .mockResolvedValue({ success: true, data: {} } as any)
    const store = { accessToken: 'valid-token' } as any

    expect(await RouteGuardUtils.checkServerSession(protectedRoute, store)).toEqual({ allowed: true })
    expect(await RouteGuardUtils.checkServerSession(protectedRoute, store)).toEqual({ allowed: true })
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  it('网络异常无法确认会话时放行，避免把已登录用户锁在门外', async () => {
    vi.spyOn(apiService, 'get').mockRejectedValue(new ApiError('网络连接失败', 0, 'NETWORK_ERROR'))

    const result = await RouteGuardUtils.checkServerSession(protectedRoute, {
      accessToken: 'token'
    } as any)

    expect(result).toEqual({ allowed: true })
  })
})

describe('受保护路由的未登录拦截', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetSessionVerifyThrottle()
  })

  it('未登录时拒绝访问并要求先登录', async () => {
    const result = await RouteGuardUtils.checkAllPermissions(protectedRoute, {
      isAuthenticated: false,
      user: null
    } as any)

    expect(result).toEqual({
      allowed: false,
      reason: 'authentication_required',
      redirectTo: '/portal',
      redirectQuery: { redirect: '/management', authRequired: 'true' }
    })
  })

  it('本地看似已登录但后端不认时，拒绝访问并清理残留会话', async () => {
    vi.spyOn(apiService, 'get').mockRejectedValue(new ApiError('认证失败', 401, 'AUTH_FAILED'))
    const logout = vi.fn().mockResolvedValue(undefined)

    const result = await RouteGuardUtils.checkAllPermissions(protectedRoute, {
      isAuthenticated: true,
      user: { role: 'admin', is_active: true, username: 'admin' },
      accessToken: 'stale-token',
      isTokenExpiringSoon: false,
      refreshToken: 'stale-refresh-token',
      logout
    } as any)

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('session_invalid')
    expect(logout).toHaveBeenCalledWith(false, false)
  })

  it('会话有效时放行受保护路由', async () => {
    vi.spyOn(apiService, 'get').mockResolvedValue({ success: true, data: {} } as any)

    const result = await RouteGuardUtils.checkAllPermissions(protectedRoute, {
      isAuthenticated: true,
      user: { role: 'admin', is_active: true, username: 'admin' },
      accessToken: 'valid-token',
      isTokenExpiringSoon: false,
      refreshToken: 'valid-refresh-token',
      isAdmin: true,
      isOperator: true,
      logout: vi.fn()
    } as any)

    expect(result).toEqual({ allowed: true })
  })
})
