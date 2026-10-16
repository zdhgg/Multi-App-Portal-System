import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiService, ApiError } from '@/services/api'
import { publicApiService } from '@/services/publicApi'

vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')

  return {
    ...actual,
    apiService: {
      get: vi.fn(),
      post: vi.fn()
    }
  }
})

const mockedGet = vi.mocked(apiService.get)

// 匿名开关经 import.meta.env 读取，测试环境无法重写（vi.stubEnv 改不到 Vite 内联的值），
// 因此直接把开关判定打桩成生产构建里的取值。
const setAnonymousMode = (enabled: boolean): void => {
  vi.spyOn(publicApiService as any, 'resolveAnonymousMode').mockReturnValue(enabled)
}

describe('公开接口的凭证携带', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    mockedGet.mockReset()
    mockedGet.mockResolvedValue({ success: true, data: { apps: [], total: 0, lastUpdated: '' } } as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 回归：匿名模式曾让已登录会话也不带 Authorization，公开接口对管理员同样返回 401
  it('匿名模式下仍为已登录会话携带凭证', async () => {
    setAnonymousMode(true)
    localStorage.setItem('auth_token', 'access-token')

    await publicApiService.getApps()

    expect(publicApiService.isAnonymousAccessEnabled()).toBe(true)
    expect(mockedGet).toHaveBeenCalledWith('/v2/public/apps', expect.objectContaining({ requireAuth: true }))
  })

  it('无本地会话时保持匿名请求，放行与否交给后端', async () => {
    setAnonymousMode(true)

    await publicApiService.getApps()

    expect(publicApiService.isAnonymousAccessEnabled()).toBe(true)
    expect(mockedGet).toHaveBeenCalledWith('/v2/public/apps', expect.objectContaining({ requireAuth: false }))
  })

  it('关闭匿名模式时行为不变：有会话带凭证，无会话不带', async () => {
    setAnonymousMode(false)

    await publicApiService.getPinnedApps()
    expect(mockedGet).toHaveBeenCalledWith('/v2/public/apps/pinned', expect.objectContaining({ requireAuth: false }))

    mockedGet.mockClear()
    localStorage.setItem('auth_token', 'access-token')

    await publicApiService.getPinnedApps()
    expect(mockedGet).toHaveBeenCalledWith('/v2/public/apps/pinned', expect.objectContaining({ requireAuth: true }))
  })

  it('仅无会话时才把 401/403 识别为游客受限', () => {
    const denied = new ApiError('未提供有效的认证信息', 401, 'AUTH_FAILED')

    expect(publicApiService.isGuestAccessDenied(denied)).toBe(true)
    expect(publicApiService.isGuestAccessDenied(new Error('boom'))).toBe(false)

    localStorage.setItem('auth_token', 'access-token')
    expect(publicApiService.hasAuthenticatedSession()).toBe(true)
    expect(publicApiService.isGuestAccessDenied(denied)).toBe(false)
  })
})
