import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore, type User } from '../stores/auth'
import { clearStoredAuthData, saveStoredAuthData } from '../utils/authStorage'

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

const createJwt = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.signature`
}

describe('Auth Store - remember me restore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    clearStoredAuthData()
  })

  afterEach(() => {
    useAuthStore().stopTokenRefreshTimer()
    clearStoredAuthData()
  })

  it('应能从 localStorage 恢复 base64url 编码的 JWT 登录态', async () => {
    const authStore = useAuthStore()
    const user: User = {
      id: 'user-1',
      username: 'admin',
      role: 'admin',
      is_active: true,
      created_at: '2026-04-06T00:00:00.000Z',
      updated_at: '2026-04-06T00:00:00.000Z'
    }

    const accessToken = createJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      extra: '~~4-pJo%'
    })

    saveStoredAuthData(
      {
        accessToken,
        refreshToken: 'refresh-token'
      },
      user,
      true
    )

    const restored = await authStore.initializeAuth()

    expect(restored).toBe(true)
    expect(authStore.isInitialized).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.user?.username).toBe('admin')
    expect(authStore.accessToken).toBe(accessToken)
  })
})
