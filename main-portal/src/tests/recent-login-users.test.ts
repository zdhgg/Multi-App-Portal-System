
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_RECENT_LOGIN_USERS,
  clearRecentLoginUsernames,
  readRecentLoginUserSuggestions,
  readRecentLoginUsernames,
  saveRecentLoginUsername
} from '../utils/recentLoginUsers'

describe('recentLoginUsers', () => {
  beforeEach(() => {
    vi.useRealTimers()
    localStorage.clear()
    sessionStorage.clear()
    clearRecentLoginUsernames()
  })

  it('只在指定存储中记录成功用户名', () => {
    saveRecentLoginUsername('admin', true)
    saveRecentLoginUsername('operator', false)

    expect(localStorage.getItem('recent_login_usernames_persistent')).toContain('admin')
    expect(sessionStorage.getItem('recent_login_usernames_session')).toContain('operator')
    expect(readRecentLoginUsernames()).toEqual(['operator', 'admin'])
  })

  it('应按最近成功登录顺序去重并限制最多5个用户名', () => {
    vi.useFakeTimers()

    const usernames = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank']
    usernames.forEach((username, index) => {
      vi.setSystemTime(new Date(2026, 2, 7, 10, 0, index))
      saveRecentLoginUsername(username, true)
    })

    vi.setSystemTime(new Date(2026, 2, 7, 10, 1, 0))
    saveRecentLoginUsername('carol', true)

    expect(readRecentLoginUsernames()).toEqual(['carol', 'frank', 'erin', 'dave', 'bob'])
    expect(readRecentLoginUsernames()).toHaveLength(MAX_RECENT_LOGIN_USERS)
  })

  it('应生成下拉建议格式', () => {
    saveRecentLoginUsername('admin', true)
    saveRecentLoginUsername('operator', true)

    expect(readRecentLoginUserSuggestions()).toEqual([
      { value: 'operator' },
      { value: 'admin' }
    ])
  })

  it('清空历史后应不再返回任何建议', () => {
    saveRecentLoginUsername('admin', true)
    saveRecentLoginUsername('operator', false)

    clearRecentLoginUsernames()

    expect(readRecentLoginUsernames()).toEqual([])
    expect(readRecentLoginUserSuggestions()).toEqual([])
    expect(localStorage.getItem('recent_login_usernames_persistent')).toBeNull()
    expect(sessionStorage.getItem('recent_login_usernames_session')).toBeNull()
  })
})
