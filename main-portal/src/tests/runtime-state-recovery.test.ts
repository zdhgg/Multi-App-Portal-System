import { describe, expect, it, vi } from 'vitest'
import { syncRunningApplicationState } from '@/utils/runtimeStateRecovery'

describe('syncRunningApplicationState', () => {
  it('syncs runtime state before accepting an online application', async () => {
    const callOrder: string[] = []
    const syncRuntimeState = vi.fn(async () => {
      callOrder.push('sync')
    })
    const getApplication = vi.fn(async () => {
      callOrder.push('lookup')
      return {
        success: true,
        data: { id: 'app-1', status: 'online' }
      }
    })

    const result = await syncRunningApplicationState(syncRuntimeState, getApplication)

    expect(callOrder).toEqual(['sync', 'lookup'])
    expect(result.app).toEqual({ id: 'app-1', status: 'online' })
  })

  it('keeps the conflict path when the refreshed application is offline', async () => {
    const result = await syncRunningApplicationState(
      vi.fn(async () => undefined),
      vi.fn(async () => ({ success: true, data: { status: 'offline' } }))
    )

    expect(result.app).toBeNull()
  })

  it('still checks the application when state synchronization fails', async () => {
    const syncError = new Error('sync unavailable')
    const result = await syncRunningApplicationState(
      vi.fn(async () => {
        throw syncError
      }),
      vi.fn(async () => ({ success: true, data: { status: 'online' } }))
    )

    expect(result.app).toEqual({ status: 'online' })
    expect(result.syncError).toBe(syncError)
  })

  it('returns the lookup error without masking the original conflict', async () => {
    const lookupError = new Error('lookup unavailable')
    const result = await syncRunningApplicationState(
      vi.fn(async () => undefined),
      vi.fn(async () => {
        throw lookupError
      })
    )

    expect(result.app).toBeNull()
    expect(result.lookupError).toBe(lookupError)
  })
})
