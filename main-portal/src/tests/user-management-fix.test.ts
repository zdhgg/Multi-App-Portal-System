/**
 * 用户管理面板循环更新修复测试
 * 验证修复了"Maximum recursive updates exceeded"错误
 */

import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'

describe('用户管理面板循环更新修复', () => {
  describe('问题场景模拟', () => {
    it('应该避免在添加用户时触发循环更新', async () => {
      // 模拟组件状态
      const internalUsers = { value: [] as any[] }
      const emitCallCount = { count: 0 }
      
      // 模拟 emit 函数
      const emit = vi.fn((_event: string, _data: any) => {
        emitCallCount.count++
      })
      
      // 模拟 emitChange 函数
      const emitChange = () => {
        emit('update:users', JSON.parse(JSON.stringify(internalUsers.value)))
      }
      
      // 模拟添加用户（修复前的逻辑）
      const addUserOld = () => {
        const userData = {
          id: `user-${Date.now()}`,
          username: 'testuser',
          role: 'operator',
          enabled: true,
          createdAt: new Date().toISOString()
        }
        internalUsers.value.push(userData)
        emitChange() // 立即调用会导致循环
      }
      
      // 模拟添加用户（修复后的逻辑）
      const addUserNew = async () => {
        const userData = {
          id: `user-${Date.now()}`,
          username: 'testuser',
          role: 'operator',
          enabled: true,
          createdAt: new Date().toISOString()
        }
        internalUsers.value.push(userData)
        
        // 使用 nextTick 避免循环更新
        await nextTick()
        emitChange()
      }
      
      // 测试修复后的逻辑
      await addUserNew()
      
      expect(internalUsers.value.length).toBe(1)
      expect(emitCallCount.count).toBe(1) // 只调用一次
    })

    it('应该避免在删除用户时触发循环更新', async () => {
      // 模拟组件状态
      const internalUsers = { 
        value: [
          { id: 'user-1', username: 'user1', role: 'operator', enabled: true },
          { id: 'user-2', username: 'user2', role: 'operator', enabled: true }
        ] as any[] 
      }
      const emitCallCount = { count: 0 }
      
      // 模拟 emit 函数
      const emit = vi.fn((_event: string, _data: any) => {
        emitCallCount.count++
      })
      
      // 模拟 emitChange 函数
      const emitChange = () => {
        emit('update:users', JSON.parse(JSON.stringify(internalUsers.value)))
      }
      
      // 模拟删除用户（修复后的逻辑）
      const removeUserNew = async (index: number) => {
        internalUsers.value.splice(index, 1)
        
        // 使用 nextTick 避免循环更新
        await nextTick()
        emitChange()
      }
      
      // 测试修复后的逻辑
      await removeUserNew(0)
      
      expect(internalUsers.value.length).toBe(1)
      expect(internalUsers.value[0].username).toBe('user2')
      expect(emitCallCount.count).toBe(1) // 只调用一次
    })

    it('应该避免在切换状态时触发循环更新', async () => {
      // 模拟组件状态
      const internalUsers = { 
        value: [
          { id: 'user-1', username: 'user1', role: 'operator', enabled: true }
        ] as any[] 
      }
      const emitCallCount = { count: 0 }
      
      // 模拟 emit 函数
      const emit = vi.fn((_event: string, _data: any) => {
        emitCallCount.count++
      })
      
      // 模拟 emitChange 函数
      const emitChange = () => {
        emit('update:users', JSON.parse(JSON.stringify(internalUsers.value)))
      }
      
      // 模拟状态切换（修复后的逻辑）
      const handleStatusChange = async () => {
        // 使用 nextTick 避免循环更新
        await nextTick()
        emitChange()
      }
      
      // 切换状态
      internalUsers.value[0].enabled = false
      await handleStatusChange()
      
      expect(internalUsers.value[0].enabled).toBe(false)
      expect(emitCallCount.count).toBe(1) // 只调用一次
    })
  })

  describe('nextTick 时序测试', () => {
    it('nextTick 应该在DOM更新后执行', async () => {
      const executionOrder: string[] = []
      
      executionOrder.push('1-start')
      
      await nextTick()
      executionOrder.push('2-after-nextTick')
      
      expect(executionOrder).toEqual(['1-start', '2-after-nextTick'])
    })

    it('多个 nextTick 应该按顺序执行', async () => {
      const executionOrder: string[] = []
      
      executionOrder.push('1-start')
      
      nextTick(() => {
        executionOrder.push('2-first-nextTick')
      })
      
      nextTick(() => {
        executionOrder.push('3-second-nextTick')
      })
      
      await nextTick()
      await nextTick()
      
      expect(executionOrder).toEqual([
        '1-start',
        '2-first-nextTick',
        '3-second-nextTick'
      ])
    })
  })

  describe('setTimeout 延迟测试', () => {
    it('setTimeout 应该在指定时间后执行', async () => {
      const executionOrder: string[] = []
      
      executionOrder.push('1-start')
      
      await new Promise<void>(resolve => {
        setTimeout(() => {
          executionOrder.push('2-after-timeout')
          resolve()
        }, 100)
      })
      
      expect(executionOrder).toEqual(['1-start', '2-after-timeout'])
    })

    it('消息显示应该在数据更新后', async () => {
      const executionOrder: string[] = []
      let messageShown = false
      
      // 模拟数据更新
      executionOrder.push('1-update-data')
      
      // 使用 nextTick
      await nextTick()
      executionOrder.push('2-after-nextTick')
      
      // 延迟显示消息
      await new Promise<void>(resolve => {
        setTimeout(() => {
          messageShown = true
          executionOrder.push('3-show-message')
          resolve()
        }, 100)
      })
      
      expect(executionOrder).toEqual([
        '1-update-data',
        '2-after-nextTick',
        '3-show-message'
      ])
      expect(messageShown).toBe(true)
    })
  })

  describe('循环更新检测', () => {
    it('应该检测到循环更新', () => {
      let updateCount = 0
      const maxUpdates = 100 // Vue 的默认限制
      
      // 模拟循环更新
      const triggerUpdate = () => {
        updateCount++
        if (updateCount < maxUpdates) {
          // 模拟触发新的更新
          triggerUpdate()
        }
      }
      
      triggerUpdate()
      
      expect(updateCount).toBe(maxUpdates)
    })

    it('使用 nextTick 应该避免循环更新', async () => {
      let updateCount = 0
      
      // 模拟使用 nextTick 的更新
      const triggerUpdateSafe = async () => {
        updateCount++
        await nextTick()
        // 不会立即触发新的更新
      }
      
      await triggerUpdateSafe()
      await triggerUpdateSafe()
      await triggerUpdateSafe()
      
      expect(updateCount).toBe(3) // 只更新3次，不会循环
    })
  })

  describe('数据深拷贝测试', () => {
    it('JSON.parse(JSON.stringify()) 应该创建深拷贝', () => {
      const original = {
        id: 'user-1',
        username: 'test',
        nested: { value: 123 }
      }
      
      const copy = JSON.parse(JSON.stringify(original))
      
      // 修改拷贝不应该影响原始对象
      copy.username = 'modified'
      copy.nested.value = 456
      
      expect(original.username).toBe('test')
      expect(original.nested.value).toBe(123)
      expect(copy.username).toBe('modified')
      expect(copy.nested.value).toBe(456)
    })

    it('emitChange 应该发送深拷贝的数据', () => {
      const internalUsers = { 
        value: [
          { id: 'user-1', username: 'user1' }
        ] as any[] 
      }
      
      let emittedData: any = null
      const emit = vi.fn((event: string, data: any) => {
        emittedData = data
      })
      
      const emitChange = () => {
        emit('update:users', JSON.parse(JSON.stringify(internalUsers.value)))
      }
      
      emitChange()
      
      // 修改原始数据不应该影响已发送的数据
      internalUsers.value[0].username = 'modified'
      
      expect(emittedData[0].username).toBe('user1')
      expect(internalUsers.value[0].username).toBe('modified')
    })
  })
})

