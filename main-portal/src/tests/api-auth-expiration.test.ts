import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiService, ApiError } from '@/services/api'
import * as authInvalidation from '@/utils/authInvalidation'

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')

  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn()
    }
  }
})

describe('ApiService 认证失效处理', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('在刷新 token 失败时应立即按认证失效处理，而不是继续发请求', async () => {
    const api = new ApiService('')
    const logout = vi.fn().mockResolvedValue(undefined)
    const refreshAccessToken = vi.fn().mockResolvedValue(false)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')

    api.setAuthStore({
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      refreshAccessToken,
      logout,
      accessToken: 'expired-access-token'
    })

    await expect(api.get('/v2/apps')).rejects.toBeInstanceOf(ApiError)

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith(false, false)
    expect(invalidationSpy).toHaveBeenCalledWith({
      source: 'api',
      message: '登录已过期，请重新登录'
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
