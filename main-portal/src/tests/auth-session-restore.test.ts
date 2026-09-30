import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, type User } from '../stores/auth'
import { ApiError } from '../services/api'
import { clearStoredAuthData, readStoredAuthData, saveStoredAuthData } from '../utils/authStorage'

vi.mock('../services/authApi', () => ({
  authApiService: {
    login: vi.fn(),
    logout: vi.fn(),
    verifyToken: vi.fn(),
    refreshToken: vi.fn(),
    getUserProfile: vi.fn(),
    changePassword: vi.fn()
  }
}))

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

import { authApiService } from '../services/authApi'

const mockedRefreshToken = vi.mocked(authApiService.refreshToken)

const createJwt = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

const buildUser = (): User => ({
  id: 'user-1',
  username: 'admin',
  role: 'admin',
  is_active: true,
  created_at: '2026-04-06T00:00:00.000Z',
  updated_at: '2026-04-06T00:00:00.000Z'
})

const refreshSuccessResponse = (accessToken: string, refreshToken: string) => ({
  success: true as const,
  data: {
    accessToken,
    refreshToken,
    expiresIn: 3600,
    tokenType: 'Bearer'
  }
})

describe('Auth Store - 过期访问令牌的恢复续期', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    clearStoredAuthData()
    vi.clearAllMocks()
  })

  afterEach(() => {
    useAuthStore().stopTokenRefreshTimer()
    clearStoredAuthData()
  })

  it('访问令牌已过期时应通过刷新令牌续期并恢复会话', async () => {
    const authStore = useAuthStore()
    const expiredAccess = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 7200
    })

    saveStoredAuthData(
      { accessToken: expiredAccess, refreshToken: 'refresh-token' },
      buildUser(),
      true
    )

    mockedRefreshToken.mockResolvedValue(
      refreshSuccessResponse('new-access', 'new-refresh') as any
    )

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(true)
    expect(authStore.isInitialized).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.accessToken).toBe('new-access')

    const stored = readStoredAuthData<User>()
    expect(stored.refreshToken).toBe('new-refresh')
  })

  it('刷新令牌被后端拒绝(401)时应清除会话', async () => {
    const authStore = useAuthStore()
    const expiredAccess = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 7200
    })

    saveStoredAuthData(
      { accessToken: expiredAccess, refreshToken: 'refresh-token' },
      buildUser(),
      true
    )

    mockedRefreshToken.mockRejectedValue(new ApiError('Refresh token无效或已过期', 401))

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(localStorage.getItem('auth_token')).toBeNull()
    expect(sessionStorage.getItem('auth_token')).toBeNull()
  })

  it('刷新遇到网络故障时应保留本地会话', async () => {
    const authStore = useAuthStore()
    const expiredAccess = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 7200
    })

    saveStoredAuthData(
      { accessToken: expiredAccess, refreshToken: 'refresh-token' },
      buildUser(),
      true
    )

    mockedRefreshToken.mockRejectedValue(new ApiError('网络连接失败', 0, 'NETWORK_ERROR'))

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.accessToken).toBe(expiredAccess)
  })

  it('刷新令牌被并发刷新轮换撤销时应使用最新令牌重试', async () => {
    const authStore = useAuthStore()
    const expiredAccess = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 7200
    })

    saveStoredAuthData(
      { accessToken: expiredAccess, refreshToken: 'old-refresh' },
      buildUser(),
      true
    )

    mockedRefreshToken
      .mockImplementationOnce(async () => {
        // 模拟另一个标签页完成刷新轮换并把新令牌写入共享存储
        saveStoredAuthData(
          { accessToken: 'other-tab-access', refreshToken: 'other-tab-refresh' },
          buildUser(),
          true
        )
        throw new ApiError('Refresh token已被撤销', 401)
      })
      .mockImplementationOnce(async () =>
        refreshSuccessResponse('retry-access', 'retry-refresh') as any
      )

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(true)
    expect(mockedRefreshToken).toHaveBeenCalledTimes(2)
    expect(authStore.accessToken).toBe('retry-access')
  })

  it('未过期的访问令牌恢复时不应触发刷新请求', async () => {
    const authStore = useAuthStore()
    const validAccess = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })

    saveStoredAuthData(
      { accessToken: validAccess, refreshToken: 'refresh-token' },
      buildUser(),
      true
    )

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(mockedRefreshToken).not.toHaveBeenCalled()
  })
})
