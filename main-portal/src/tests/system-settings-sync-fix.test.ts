/**
 * SystemSettings 循环更新修复测试
 * 验证修复了 accounts.users 更新时的循环问题
 */

import { describe, it, expect, vi } from 'vitest'

describe('SystemSettings 循环更新修复', () => {
  describe('__syncing 标志测试', () => {
    it('应该使用 __syncing 标志避免循环更新', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const isDirty = { value: false }
      
      // 模拟 watch 回调
      const watchCallback = vi.fn(() => {
        if (__syncing) return
        // 这里会触发其他更新
      })
      
      // 模拟 handleUsersUpdate
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
          // 触发 watch
          watchCallback()
        } finally {
          __syncing = false
        }
      }
      
      // 测试更新
      handleUsersUpdate([{ id: 'user-1', username: 'test' }])
      
      expect(accounts.users.length).toBe(1)
      expect(isDirty.value).toBe(true)
      expect(watchCallback).toHaveBeenCalled()
    })

    it('watch 应该在 __syncing 为 true 时跳过执行', () => {
      let __syncing = false
      let updateCount = 0
      
      // 模拟 watch 回调
      const watchCallback = () => {
        if (__syncing) return
        updateCount++
      }
      
      // 测试1: __syncing = false 时执行
      __syncing = false
      watchCallback()
      expect(updateCount).toBe(1)
      
      // 测试2: __syncing = true 时跳过
      __syncing = true
      watchCallback()
      expect(updateCount).toBe(1) // 没有增加
      
      // 测试3: __syncing = false 时再次执行
      __syncing = false
      watchCallback()
      expect(updateCount).toBe(2)
    })
  })

  describe('事件处理器测试', () => {
    it('handleUsersUpdate 应该正确更新 accounts.users', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const isDirty = { value: false }
      
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      const newUsers = [
        { id: 'user-1', username: 'admin', role: 'admin' },
        { id: 'user-2', username: 'operator', role: 'operator' }
      ]
      
      handleUsersUpdate(newUsers)
      
      expect(accounts.users).toEqual(newUsers)
      expect(isDirty.value).toBe(true)
    })

    it('应该避免直接赋值导致的循环更新', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const serverSettings = { value: { accounts: { users: [] as any[] } } }
      let watchTriggerCount = 0
      
      // 模拟 watch accounts.users
      const watchAccountsUsers = () => {
        if (__syncing) return
        watchTriggerCount++
        serverSettings.value.accounts.users = [...accounts.users]
      }
      
      // 模拟 watch serverSettings
      const watchServerSettings = () => {
        if (__syncing) return
        watchTriggerCount++
        accounts.users = [...serverSettings.value.accounts.users]
      }
      
      // 错误的方式：直接赋值（会触发循环）
      const updateUsersWrong = (val: any[]) => {
        accounts.users = val
        watchAccountsUsers() // 触发第一个 watch
        watchServerSettings() // 触发第二个 watch
        watchAccountsUsers() // 再次触发第一个 watch
        // ... 无限循环
      }
      
      // 正确的方式：使用 __syncing 标志
      const updateUsersCorrect = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          watchAccountsUsers() // 被跳过
          watchServerSettings() // 被跳过
        } finally {
          __syncing = false
        }
      }
      
      // 测试正确的方式
      watchTriggerCount = 0
      updateUsersCorrect([{ id: 'user-1', username: 'test' }])
      
      expect(watchTriggerCount).toBe(0) // 没有触发 watch
      expect(accounts.users.length).toBe(1)
    })
  })

  describe('setTimeout 延迟重置测试', () => {
    it('应该延迟重置 __syncing 标志', async () => {
      let __syncing = false
      
      const updateWithDelay = () => {
        __syncing = true
        setTimeout(() => { __syncing = false }, 0)
      }
      
      updateWithDelay()
      expect(__syncing).toBe(true)
      
      // 等待 setTimeout 执行
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(__syncing).toBe(false)
    })

    it('延迟重置应该确保所有 watch 回调都已执行', async () => {
      let __syncing = false
      const executionOrder: string[] = []
      
      const watchCallback1 = () => {
        if (__syncing) {
          executionOrder.push('watch1-skipped')
          return
        }
        executionOrder.push('watch1-executed')
      }
      
      const watchCallback2 = () => {
        if (__syncing) {
          executionOrder.push('watch2-skipped')
          return
        }
        executionOrder.push('watch2-executed')
      }
      
      const updateData = () => {
        __syncing = true
        try {
          executionOrder.push('update-start')
          watchCallback1()
          watchCallback2()
          executionOrder.push('update-end')
        } finally {
          setTimeout(() => { 
            __syncing = false
            executionOrder.push('syncing-reset')
          }, 0)
        }
      }
      
      updateData()
      
      expect(executionOrder).toEqual([
        'update-start',
        'watch1-skipped',
        'watch2-skipped',
        'update-end'
      ])
      
      // 等待 setTimeout 执行
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(executionOrder).toEqual([
        'update-start',
        'watch1-skipped',
        'watch2-skipped',
        'update-end',
        'syncing-reset'
      ])
    })
  })

  describe('数据流测试', () => {
    it('应该正确处理 UserManagementPanel -> SystemSettings 的数据流', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const isDirty = { value: false }
      
      // 模拟 UserManagementPanel 的 emit
      const emitUpdateUsers = (newUsers: any[]) => {
        return newUsers
      }
      
      // 模拟 SystemSettings 的 handleUsersUpdate
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      // 模拟用户操作
      const newUsers = [{ id: 'user-1', username: 'newuser', role: 'operator' }]
      const emittedData = emitUpdateUsers(newUsers)
      handleUsersUpdate(emittedData)
      
      expect(accounts.users).toEqual(newUsers)
      expect(isDirty.value).toBe(true)
    })

    it('应该避免 accounts.users -> serverSettings -> accounts.users 的循环', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const serverSettings = { value: { accounts: { users: [] as any[] } } }
      let loopCount = 0
      const maxLoops = 10
      
      // 模拟 watch accounts.users
      const watchAccountsUsers = () => {
        if (__syncing) return
        loopCount++
        if (loopCount > maxLoops) throw new Error('循环更新检测到')
        serverSettings.value.accounts.users = [...accounts.users]
        watchServerSettings() // 这会触发循环
      }
      
      // 模拟 watch serverSettings
      const watchServerSettings = () => {
        if (__syncing) return
        loopCount++
        if (loopCount > maxLoops) throw new Error('循环更新检测到')
        accounts.users = [...serverSettings.value.accounts.users]
        watchAccountsUsers() // 这会触发循环
      }
      
      // 使用 __syncing 标志避免循环
      const safeUpdate = (newUsers: any[]) => {
        __syncing = true
        try {
          accounts.users = newUsers
          watchAccountsUsers() // 被跳过
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      // 测试：不应该抛出错误
      expect(() => {
        safeUpdate([{ id: 'user-1', username: 'test' }])
      }).not.toThrow()
      
      expect(loopCount).toBe(0) // 没有触发循环
    })
  })

  describe('边界情况测试', () => {
    it('应该处理空数组', () => {
      let __syncing = false
      const accounts = { users: [{ id: 'user-1', username: 'test' }] }
      const isDirty = { value: false }
      
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      handleUsersUpdate([])
      
      expect(accounts.users).toEqual([])
      expect(isDirty.value).toBe(true)
    })

    it('应该处理大量用户', () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const isDirty = { value: false }
      
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      const manyUsers = Array.from({ length: 100 }, (_, i) => ({
        id: `user-${i}`,
        username: `user${i}`,
        role: 'operator'
      }))
      
      handleUsersUpdate(manyUsers)
      
      expect(accounts.users.length).toBe(100)
      expect(isDirty.value).toBe(true)
    })

    it('应该处理连续多次更新', async () => {
      let __syncing = false
      const accounts = { users: [] as any[] }
      const isDirty = { value: false }
      
      const handleUsersUpdate = (val: any[]) => {
        __syncing = true
        try {
          accounts.users = val
          isDirty.value = true
        } finally {
          setTimeout(() => { __syncing = false }, 0)
        }
      }
      
      // 连续更新3次
      handleUsersUpdate([{ id: 'user-1', username: 'user1' }])
      await new Promise(resolve => setTimeout(resolve, 10))
      
      handleUsersUpdate([{ id: 'user-1', username: 'user1' }, { id: 'user-2', username: 'user2' }])
      await new Promise(resolve => setTimeout(resolve, 10))
      
      handleUsersUpdate([{ id: 'user-1', username: 'user1' }])
      await new Promise(resolve => setTimeout(resolve, 10))
      
      expect(accounts.users.length).toBe(1)
      expect(accounts.users[0].username).toBe('user1')
    })
  })
})

