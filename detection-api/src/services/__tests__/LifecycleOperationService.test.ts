import { describe, expect, it, vi } from 'vitest'
import { LifecycleOperationService } from '../LifecycleOperationService'

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('LifecycleOperationService', () => {
  it('returns immediately and reuses the active operation for duplicate starts', async () => {
    const service = new LifecycleOperationService()
    const deferred = createDeferred<unknown>()
    const executor = vi.fn(() => deferred.promise)

    const first = service.enqueue('app-1', 'start', executor)
    const duplicate = service.enqueue('app-1', 'start', executor)

    expect(first.reused).toBe(false)
    expect(first.operation.status).toBe('queued')
    expect(duplicate.reused).toBe(true)
    expect(duplicate.operation.id).toBe(first.operation.id)

    await vi.waitFor(() => {
      expect(service.get(first.operation.id)?.status).toBe('running')
    })
    expect(executor).toHaveBeenCalledTimes(1)

    deferred.resolve({ status: 'running' })
    await vi.waitFor(() => {
      expect(service.get(first.operation.id)?.status).toBe('succeeded')
    })
  })

  it('retains structured startup failures for status polling', async () => {
    const service = new LifecycleOperationService()
    const failure = Object.assign(new Error('端口 3006 已被占用'), {
      code: 'PORT_CONFLICTS',
      context: { conflicts: [{ port: 3006 }] }
    })

    const { operation } = service.enqueue('app-2', 'start', async () => {
      throw failure
    })

    await vi.waitFor(() => {
      expect(service.get(operation.id)?.status).toBe('failed')
    })

    expect(service.get(operation.id)?.error).toEqual({
      code: 'PORT_CONFLICTS',
      message: '端口 3006 已被占用',
      details: { conflicts: [{ port: 3006 }] }
    })
    expect(service.getActiveForApp('app-2')).toBeNull()
  })
})
