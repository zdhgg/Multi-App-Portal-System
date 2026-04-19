import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_INVALIDATION_EVENT, dispatchAuthInvalidation, registerAuthInvalidationHandler } from '@/utils/authInvalidation'

describe('authInvalidation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('应在收到认证失效事件后立即清理本地认证并跳转到首页', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const replace = vi.fn().mockResolvedValue(undefined)
    const router = {
      currentRoute: {
        value: {
          path: '/management',
          query: {}
        }
      },
      replace
    } as any

    const dispose = registerAuthInvalidationHandler({
      authStore: { logout },
      router
    })

    dispatchAuthInvalidation({ source: 'websocket' })
    await Promise.resolve()
    await Promise.resolve()

    expect(logout).toHaveBeenCalledWith(false, false)
    expect(replace).toHaveBeenCalledWith({
      path: '/portal',
      query: undefined
    })

    dispose()
  })

  it('应忽略极短时间内重复触发的认证失效事件', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    const replace = vi.fn().mockResolvedValue(undefined)
    const router = {
      currentRoute: {
        value: {
          path: '/management',
          query: {}
        }
      },
      replace
    } as any

    const dispose = registerAuthInvalidationHandler({
      authStore: { logout },
      router
    })

    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATION_EVENT, { detail: { source: 'api' } }))
    window.dispatchEvent(new CustomEvent(AUTH_INVALIDATION_EVENT, { detail: { source: 'websocket' } }))
    await Promise.resolve()
    await Promise.resolve()

    expect(logout).toHaveBeenCalledTimes(1)
    expect(replace).toHaveBeenCalledTimes(1)

    dispose()
  })
})
