
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRememberMePreference,
  readRememberMePreference,
  saveRememberMePreference
} from '../utils/rememberMePreference'

describe('rememberMePreference', () => {
  beforeEach(() => {
    localStorage.clear()
    clearRememberMePreference()
  })

  it('首次读取时应默认勾选记住我', () => {
    expect(readRememberMePreference()).toBe(true)
  })

  it('应记住用户上次取消勾选的选择', () => {
    saveRememberMePreference(false)
    expect(readRememberMePreference()).toBe(false)
  })

  it('应记住用户上次勾选的选择', () => {
    saveRememberMePreference(true)
    expect(readRememberMePreference()).toBe(true)
  })
})
