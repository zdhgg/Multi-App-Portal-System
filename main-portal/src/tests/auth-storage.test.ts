import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredAuthData,
  readStoredAuthData,
  saveStoredAuthData,
  updateStoredTokens,
  updateStoredUserData
} from '../utils/authStorage'

describe('authStorage', () => {
  const mockTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token'
  }

  const mockUser = {
    id: 'user-1',
    username: 'tester',
    role: 'admin',
    is_active: true,
    created_at: '2026-03-07T00:00:00.000Z',
    updated_at: '2026-03-07T00:00:00.000Z'
  }

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearStoredAuthData()
  })

  it('未勾选记住我时应写入 sessionStorage', () => {
    saveStoredAuthData(mockTokens, mockUser, false)

    expect(sessionStorage.getItem('auth_token')).toBe('access-token')
    expect(sessionStorage.getItem('refresh_token')).toBe('refresh-token')
    expect(localStorage.getItem('auth_token')).toBeNull()

    const stored = readStoredAuthData<typeof mockUser>()
    expect(stored.storageMode).toBe('session')
    expect(stored.rememberMe).toBe(false)
    expect(stored.userData).toEqual(mockUser)
  })

  it('勾选记住我时应写入 localStorage', () => {
    saveStoredAuthData(mockTokens, mockUser, true)

    expect(localStorage.getItem('auth_token')).toBe('access-token')
    expect(localStorage.getItem('refresh_token')).toBe('refresh-token')
    expect(sessionStorage.getItem('auth_token')).toBeNull()

    const stored = readStoredAuthData<typeof mockUser>()
    expect(stored.storageMode).toBe('persistent')
    expect(stored.rememberMe).toBe(true)
    expect(stored.userData).toEqual(mockUser)
  })

  it('应在当前活跃存储中更新 token 和用户信息', () => {
    saveStoredAuthData(mockTokens, mockUser, false)
    updateStoredTokens({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token'
    })
    updateStoredUserData({
      ...mockUser,
      username: 'updated-user'
    })

    const stored = readStoredAuthData<typeof mockUser>()
    expect(stored.accessToken).toBe('next-access-token')
    expect(stored.refreshToken).toBe('next-refresh-token')
    expect(stored.userData?.username).toBe('updated-user')
    expect(sessionStorage.getItem('auth_token')).toBe('next-access-token')
    expect(localStorage.getItem('auth_token')).toBeNull()
  })
})
