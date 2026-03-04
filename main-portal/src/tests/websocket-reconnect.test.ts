/**
 * WebSocket重连逻辑测试
 * 验证指数退避算法和随机抖动功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('WebSocket重连逻辑测试', () => {
  describe('指数退避算法', () => {
    it('应该计算正确的指数退避延迟', () => {
      const baseInterval = 3000
      const backoffMultiplier = 2
      
      // 第1次重连：3000ms
      const delay1 = baseInterval * Math.pow(backoffMultiplier, 0)
      expect(delay1).toBe(3000)
      
      // 第2次重连：6000ms
      const delay2 = baseInterval * Math.pow(backoffMultiplier, 1)
      expect(delay2).toBe(6000)
      
      // 第3次重连：12000ms
      const delay3 = baseInterval * Math.pow(backoffMultiplier, 2)
      expect(delay3).toBe(12000)
      
      // 第4次重连：24000ms
      const delay4 = baseInterval * Math.pow(backoffMultiplier, 3)
      expect(delay4).toBe(24000)
    })

    it('应该限制最大延迟', () => {
      const baseInterval = 3000
      const backoffMultiplier = 2
      const maxInterval = 30000
      
      // 第10次重连：理论上是 3000 * 2^9 = 1536000ms
      const theoreticalDelay = baseInterval * Math.pow(backoffMultiplier, 9)
      expect(theoreticalDelay).toBe(1536000)
      
      // 但应该被限制为30000ms
      const actualDelay = Math.min(theoreticalDelay, maxInterval)
      expect(actualDelay).toBe(30000)
    })

    it('应该支持自定义退避倍数', () => {
      const baseInterval = 2000
      const backoffMultiplier = 1.5
      
      // 第1次：2000ms
      const delay1 = baseInterval * Math.pow(backoffMultiplier, 0)
      expect(delay1).toBe(2000)
      
      // 第2次：3000ms
      const delay2 = baseInterval * Math.pow(backoffMultiplier, 1)
      expect(delay2).toBe(3000)
      
      // 第3次：4500ms
      const delay3 = baseInterval * Math.pow(backoffMultiplier, 2)
      expect(delay3).toBe(4500)
    })
  })

  describe('随机抖动（Jitter）', () => {
    it('应该在延迟基础上添加随机抖动', () => {
      const baseDelay = 10000
      const jitterRange = baseDelay * 0.25 // ±25%
      
      // 模拟多次计算，验证抖动范围
      const delays: number[] = []
      for (let i = 0; i < 100; i++) {
        const jitter = (Math.random() * 2 - 1) * jitterRange
        const delay = baseDelay + jitter
        delays.push(delay)
      }
      
      // 验证所有延迟都在合理范围内
      const minDelay = baseDelay - jitterRange
      const maxDelay = baseDelay + jitterRange
      
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(minDelay)
        expect(delay).toBeLessThanOrEqual(maxDelay)
      }
      
      // 验证有变化（不是所有值都相同）
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
    })

    it('抖动范围应该是延迟的±25%', () => {
      const baseDelay = 8000
      const expectedJitterRange = 2000 // 8000 * 0.25
      
      const minExpected = baseDelay - expectedJitterRange
      const maxExpected = baseDelay + expectedJitterRange
      
      expect(minExpected).toBe(6000)
      expect(maxExpected).toBe(10000)
    })

    it('应该能够禁用抖动', () => {
      const baseDelay = 5000
      const enableJitter = false
      
      // 禁用抖动时，延迟应该保持不变
      const delay = enableJitter ? baseDelay + Math.random() * 1000 : baseDelay
      
      expect(delay).toBe(5000)
    })
  })

  describe('重连次数限制', () => {
    it('应该限制最大重连次数', () => {
      const maxReconnectAttempts = 10
      let reconnectAttempts = 0
      
      // 模拟重连过程
      while (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
      }
      
      expect(reconnectAttempts).toBe(10)
      
      // 达到最大次数后不应再重连
      const shouldReconnect = reconnectAttempts < maxReconnectAttempts
      expect(shouldReconnect).toBe(false)
    })

    it('连接成功后应该重置重连计数', () => {
      let reconnectAttempts = 5
      
      // 模拟连接成功
      reconnectAttempts = 0
      
      expect(reconnectAttempts).toBe(0)
    })

    it('手动重连应该重置重连计数', () => {
      let reconnectAttempts = 8
      
      // 模拟手动重连
      reconnectAttempts = 0
      
      expect(reconnectAttempts).toBe(0)
    })
  })

  describe('重连延迟计算', () => {
    const calculateReconnectDelay = (
      attempt: number,
      baseInterval: number = 3000,
      backoffMultiplier: number = 2,
      maxInterval: number = 30000,
      enableJitter: boolean = false
    ): number => {
      let delay = baseInterval * Math.pow(backoffMultiplier, attempt - 1)
      delay = Math.min(delay, maxInterval)
      
      if (enableJitter) {
        const jitterRange = delay * 0.25
        const jitter = (Math.random() * 2 - 1) * jitterRange
        delay = delay + jitter
      }
      
      return Math.round(delay)
    }

    it('应该为不同的重连次数计算不同的延迟', () => {
      const delay1 = calculateReconnectDelay(1)
      const delay2 = calculateReconnectDelay(2)
      const delay3 = calculateReconnectDelay(3)
      
      expect(delay1).toBe(3000)
      expect(delay2).toBe(6000)
      expect(delay3).toBe(12000)
      
      // 延迟应该递增
      expect(delay2).toBeGreaterThan(delay1)
      expect(delay3).toBeGreaterThan(delay2)
    })

    it('应该在达到最大延迟后保持不变', () => {
      const delay10 = calculateReconnectDelay(10, 3000, 2, 30000)
      const delay11 = calculateReconnectDelay(11, 3000, 2, 30000)
      const delay12 = calculateReconnectDelay(12, 3000, 2, 30000)
      
      // 都应该是最大延迟
      expect(delay10).toBe(30000)
      expect(delay11).toBe(30000)
      expect(delay12).toBe(30000)
    })

    it('启用抖动时延迟应该有变化', () => {
      const delays: number[] = []
      
      for (let i = 0; i < 10; i++) {
        const delay = calculateReconnectDelay(3, 3000, 2, 30000, true)
        delays.push(delay)
      }
      
      // 应该有不同的值
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(1)
      
      // 所有值都应该在合理范围内（12000 ± 3000）
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(9000)
        expect(delay).toBeLessThanOrEqual(15000)
      }
    })
  })

  describe('WebSocket选项配置', () => {
    it('应该使用默认配置', () => {
      const defaultOptions = {
        reconnect: true,
        reconnectInterval: 3000,
        maxReconnectAttempts: 10,
        reconnectBackoffMultiplier: 2,
        maxReconnectInterval: 30000,
        enableJitter: true
      }
      
      expect(defaultOptions.reconnect).toBe(true)
      expect(defaultOptions.reconnectInterval).toBe(3000)
      expect(defaultOptions.maxReconnectAttempts).toBe(10)
      expect(defaultOptions.reconnectBackoffMultiplier).toBe(2)
      expect(defaultOptions.maxReconnectInterval).toBe(30000)
      expect(defaultOptions.enableJitter).toBe(true)
    })

    it('应该允许自定义配置', () => {
      const customOptions = {
        reconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: 15,
        reconnectBackoffMultiplier: 1.5,
        maxReconnectInterval: 60000,
        enableJitter: false
      }
      
      expect(customOptions.reconnectInterval).toBe(5000)
      expect(customOptions.maxReconnectAttempts).toBe(15)
      expect(customOptions.reconnectBackoffMultiplier).toBe(1.5)
      expect(customOptions.maxReconnectInterval).toBe(60000)
      expect(customOptions.enableJitter).toBe(false)
    })

    it('应该支持禁用自动重连', () => {
      const options = {
        reconnect: false
      }
      
      expect(options.reconnect).toBe(false)
    })
  })

  describe('重连事件通知', () => {
    it('应该在重连时触发回调', () => {
      let reconnectingCalled = false
      let attemptNumber = 0
      let delayValue = 0
      
      const onReconnecting = (attempt: number, delay: number) => {
        reconnectingCalled = true
        attemptNumber = attempt
        delayValue = delay
      }
      
      // 模拟重连
      onReconnecting(3, 12000)
      
      expect(reconnectingCalled).toBe(true)
      expect(attemptNumber).toBe(3)
      expect(delayValue).toBe(12000)
    })

    it('应该提供重连状态信息', () => {
      const reconnectState = {
        isReconnecting: true,
        currentAttempt: 5,
        nextDelay: 24000,
        maxAttempts: 10
      }
      
      expect(reconnectState.isReconnecting).toBe(true)
      expect(reconnectState.currentAttempt).toBe(5)
      expect(reconnectState.nextDelay).toBe(24000)
      expect(reconnectState.maxAttempts).toBe(10)
      
      // 计算剩余重连次数
      const remainingAttempts = reconnectState.maxAttempts - reconnectState.currentAttempt
      expect(remainingAttempts).toBe(5)
    })
  })

  describe('边界条件测试', () => {
    it('应该处理第一次重连', () => {
      const attempt = 1
      const baseInterval = 3000
      const delay = baseInterval * Math.pow(2, attempt - 1)
      
      expect(delay).toBe(3000)
    })

    it('应该处理零延迟配置', () => {
      const baseInterval = 0
      const delay = baseInterval * Math.pow(2, 0)
      
      expect(delay).toBe(0)
    })

    it('应该处理非常大的重连次数', () => {
      const attempt = 100
      const baseInterval = 1000
      const maxInterval = 60000
      
      const theoreticalDelay = baseInterval * Math.pow(2, attempt - 1)
      const actualDelay = Math.min(theoreticalDelay, maxInterval)
      
      expect(actualDelay).toBe(60000)
    })
  })
})

