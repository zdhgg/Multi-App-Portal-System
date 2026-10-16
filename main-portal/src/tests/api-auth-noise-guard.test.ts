import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
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

const unauthorizedResponse = () => ({
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
  headers: { get: () => 'application/json' },
  json: async () => ({ success: false, error: { code: 'AUTH_FAILED', message: '认证失败' } })
})

const errorMock = vi.mocked(ElMessage.error as unknown as (...args: unknown[]) => void)

describe('访客态与认证失效的请求噪音治理', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    errorMock.mockClear()
  })

  // 回归：未登录时每个鉴权接口都会真实发出一次请求并换回 401
  it('本地无任何凭证时不发出网络请求，且不触发登出与全局提示', async () => {
    const api = new ApiService('')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const logout = vi.fn().mockResolvedValue(undefined)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')
    api.setAuthStore({
      accessToken: null,
      refreshToken: null,
      isTokenExpiringSoon: false,
      logout
    })

    await expect(api.get('/v2/applications?limit=100')).rejects.toBeInstanceOf(ApiError)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
    expect(invalidationSpy).not.toHaveBeenCalled()
  })

  // 回归：管理页 onMounted 并发三个鉴权请求，曾各自走一遍登出与提示
  it('并发到达的 401 只登出、只派发失效事件、只提示一次', async () => {
    const api = new ApiService('')
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse())
    vi.stubGlobal('fetch', fetchMock)

    const logout = vi.fn().mockResolvedValue(undefined)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')
    api.setAuthStore({
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      isTokenExpiringSoon: false,
      logout
    })

    const results = await Promise.allSettled([
      api.get('/v2/applications?limit=100'),
      api.get('/v2/applications?limit=1000'),
      api.get('/build/supported-tools')
    ])

    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(logout).toHaveBeenCalledTimes(1)
    expect(invalidationSpy).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledTimes(1)
  })

  it('冷却窗口内先后到达的 401 同样不会重复处理', async () => {
    const api = new ApiService('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorizedResponse()))

    const logout = vi.fn().mockResolvedValue(undefined)
    const invalidationSpy = vi.spyOn(authInvalidation, 'dispatchAuthInvalidation')
    api.setAuthStore({
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      isTokenExpiringSoon: false,
      logout
    })

    await expect(api.get('/v2/applications')).rejects.toBeInstanceOf(ApiError)
    await expect(api.get('/build/supported-tools')).rejects.toBeInstanceOf(ApiError)

    expect(logout).toHaveBeenCalledTimes(1)
    expect(invalidationSpy).toHaveBeenCalledTimes(1)
    expect(errorMock).toHaveBeenCalledTimes(1)
  })
})
