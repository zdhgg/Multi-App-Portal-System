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

  it('在刷新 token 被拒绝（会话已清除）时应立即按认证失效处理，而不是继续发请求', async () => {
    const api = new ApiService('')
    const logout = vi.fn().mockResolvedValue(undefined)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')

    // 模拟真实行为：刷新令牌被后端明确拒绝时，store 会清除本地会话
    const fakeStore: Record<string, any> = {
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      accessToken: 'expired-access-token',
      logout,
      refreshAccessToken: vi.fn()
    }
    fakeStore.refreshAccessToken = vi.fn().mockImplementation(async () => {
      fakeStore.refreshToken = null
      return false
    })
    api.setAuthStore(fakeStore)

    await expect(api.get('/v2/apps')).rejects.toBeInstanceOf(ApiError)

    expect(fakeStore.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(logout).toHaveBeenCalledWith(false, false)
    expect(invalidationSpy).toHaveBeenCalledWith({
      source: 'api',
      message: '登录已过期，请重新登录'
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('刷新 token 遇到临时故障（会话仍在）时应保留会话并继续发请求', async () => {
    const api = new ApiService('')
    const logout = vi.fn().mockResolvedValue(undefined)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')

    // 刷新请求网络故障：refreshAccessToken 返回 false 但本地会话未被清除
    const fakeStore = {
      isTokenExpiringSoon: true,
      refreshToken: 'refresh-token',
      accessToken: 'still-valid-access-token',
      logout,
      refreshAccessToken: vi.fn().mockResolvedValue(false),
      isSessionRetainedAfterRefreshFailure: () => true
    }
    api.setAuthStore(fakeStore)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ success: true, data: {} })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/v2/apps')).resolves.toEqual({ success: true, data: {} })

    expect(fakeStore.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
    expect(invalidationSpy).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
