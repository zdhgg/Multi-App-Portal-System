import { describe, expect, it, vi } from 'vitest'
import {
  LifecycleOperationTimeoutError,
  isLifecycleObservationCancelled,
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
  it('does not publish updates or fetch after the view was already disposed', async () => {
    const controller = new AbortController()
    controller.abort()
    const onUpdate = vi.fn()
    const fetchOperation = vi.fn()
    await expect(pollLifecycleOperation(operation('running'), fetchOperation, {
      signal: controller.signal, onUpdate
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(fetchOperation).not.toHaveBeenCalled()
  })

  it('can resume the same server task after cancelling a page observer', async () => {
    const controller = new AbortController()
    const fetchOperation = vi.fn().mockResolvedValue(operation('succeeded'))
    await expect(pollLifecycleOperation(operation('running'), fetchOperation, {
      signal: controller.signal,
      wait: async () => { controller.abort() }
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchOperation).not.toHaveBeenCalled()
    const result = await pollLifecycleOperation(operation('running'), fetchOperation, {
      wait: async () => undefined
    })
    expect(result.status).toBe('succeeded')
    expect(fetchOperation).toHaveBeenCalledWith('operation-1')
  })

  it.each(['resolve', 'reject'])('does not publish a late %s after disposal during a request', async outcome => {
    const controller = new AbortController()
    const onUpdate = vi.fn()
    const onTransientError = vi.fn()
    await expect(pollLifecycleOperation(operation('running'), async () => {
      controller.abort()
      if (outcome === 'reject') throw new Error('connection closed')
      return operation('succeeded')
    }, {
      signal: controller.signal, onUpdate, onTransientError,
      wait: async () => undefined
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onTransientError).not.toHaveBeenCalled()
  })

  it('ignores only a local cancellation and preserves real failed operations', async () => {
    const controller = new AbortController()
    const abort = new DOMException('cancelled', 'AbortError')
    expect(isLifecycleObservationCancelled(abort, controller.signal)).toBe(false)
    controller.abort()
    expect(isLifecycleObservationCancelled(abort, controller.signal)).toBe(true)
    expect(isLifecycleObservationCancelled(new Error('startup failed'), controller.signal)).toBe(false)
    const failed = { ...operation('failed'), error: { message: 'port occupied' } }
    expect(await pollLifecycleOperation(operation('running'), async () => failed, {
      wait: async () => undefined
    })).toEqual(failed)
  })
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
