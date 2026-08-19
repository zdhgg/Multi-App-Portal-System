import { describe, expect, it, vi } from 'vitest'
import {
  LifecycleOperationTimeoutError,
  pollLifecycleOperation,
  type LifecycleOperation
} from '@/types/lifecycleOperation'

const operation = (status: LifecycleOperation['status']): LifecycleOperation => ({
  id: 'operation-1',
  appId: 'app-1',
  action: 'start',
  status,
  requestedAt: '2026-08-17T00:00:00.000Z'
})

describe('lifecycle operation polling', () => {
  it('waits through a slow operation until it succeeds', async () => {
    const fetchOperation = vi.fn()
      .mockResolvedValueOnce(operation('running'))
      .mockResolvedValueOnce(operation('succeeded'))

    const result = await pollLifecycleOperation(operation('queued'), fetchOperation, {
      wait: async () => undefined
    })

    expect(result.status).toBe('succeeded')
    expect(fetchOperation).toHaveBeenCalledTimes(2)
  })

  it('treats status request failures as transient while the operation is pending', async () => {
    const transientError = new Error('temporary network error')
    const onTransientError = vi.fn()
    const fetchOperation = vi.fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(operation('succeeded'))

    const result = await pollLifecycleOperation(operation('running'), fetchOperation, {
      wait: async () => undefined,
      onTransientError
    })

    expect(result.status).toBe('succeeded')
    expect(onTransientError).toHaveBeenCalledWith(transientError)
  })

  it('reports an overall confirmation timeout without converting it to startup failure', async () => {
    let clock = 0

    await expect(pollLifecycleOperation(
      operation('running'),
      async () => operation('running'),
      {
        timeoutMs: 10,
        pollIntervalMs: 5,
        now: () => clock,
        wait: async delayMs => {
          clock += delayMs
        }
      }
    )).rejects.toBeInstanceOf(LifecycleOperationTimeoutError)
  })
})
