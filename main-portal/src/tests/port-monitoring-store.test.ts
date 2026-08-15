import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PortInventorySnapshot } from '@/services/portInventoryApi'

const {
  getInventory,
  forceRelease,
  realtimeOn,
  realtimeOff
} = vi.hoisted(() => ({
  getInventory: vi.fn(),
  forceRelease: vi.fn(),
  realtimeOn: vi.fn(),
  realtimeOff: vi.fn()
}))

vi.mock('@/services/portInventoryApi', () => ({
  portInventoryApi: {
    getInventory,
    forceRelease,
    previewZombieAllocations: vi.fn(),
    cleanupZombieAllocations: vi.fn()
  }
}))

vi.mock('@/services/portManagementApi', () => ({
  portRealtimeWebSocket: {
    on: realtimeOn,
    off: realtimeOff
  }
}))

import { usePortMonitoringStore } from '@/stores/portMonitoring'

const makeSnapshot = (overrides: Partial<PortInventorySnapshot> = {}): PortInventorySnapshot => ({
  snapshotId: 'snapshot-a',
  capturedAt: '2026-08-02T08:00:00.000Z',
  cached: false,
  cacheAgeMs: 0,
  quality: 'fresh',
  warnings: [],
  monitoring: { enabled: true, realtimeEnabled: true, pollIntervalMs: 60000 },
  scope: {
    frontend: { start: 3001, end: 3002, description: '前端' },
    backend: { start: 8001, end: 8002, description: '后端' },
    total: 4
  },
  summary: { total: 4, occupied: 1, available: 3, conflicts: 0, unmanaged: 0, unverified: 0 },
  ports: [{
    port: 3001,
    address: '0.0.0.0:3001',
    protocol: 'tcp',
    state: 'listening',
    observed: { pid: 101, processName: 'node.exe' },
    expectedApps: [{
      id: 'app-one',
      name: 'App One',
      role: 'frontend',
      state: 'running',
      deploymentMode: 'development'
    }],
    ownership: 'verified',
    conflict: false,
    conflictReason: null,
    reserved: null,
    protected: false,
    capabilities: { stopManagedApp: true, forceRelease: false },
    checkedAt: '2026-08-02T08:00:00.000Z'
  }],
  ...overrides
})

describe('port monitoring store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('updates list and statistics atomically from one snapshot', async () => {
    getInventory.mockResolvedValue(makeSnapshot())
    const store = usePortMonitoringStore()

    await store.refreshAll(true)

    expect(getInventory).toHaveBeenCalledWith(true)
    expect(store.dataState).toBe('ready')
    expect(store.quickStats).toMatchObject({ total: 4, occupied: 1, available: 3, conflicts: 0 })
    expect(store.occupiedPortsList).toHaveLength(1)
    expect(store.lastSuccessTime?.toISOString()).toBe('2026-08-02T08:00:00.000Z')
  })

  it('keeps the last successful snapshot and marks it stale after a refresh failure', async () => {
    getInventory.mockResolvedValueOnce(makeSnapshot()).mockRejectedValueOnce(new Error('network down'))
    const store = usePortMonitoringStore()
    await store.refreshAll(true)
    const lastSuccess = store.lastSuccessTime

    await expect(store.refreshAll(true)).rejects.toThrow('network down')

    expect(store.dataState).toBe('stale')
    expect(store.snapshot?.snapshotId).toBe('snapshot-a')
    expect(store.lastSuccessTime).toBe(lastSuccess)
    expect(store.currentError).toBe('network down')
  })

  it('reports an initial error without inventing statistics', async () => {
    getInventory.mockRejectedValue(new Error('unavailable'))
    const store = usePortMonitoringStore()

    await expect(store.refreshAll(false)).rejects.toThrow('unavailable')

    expect(store.dataState).toBe('error')
    expect(store.snapshot).toBeNull()
    expect(store.quickStats).toMatchObject({ total: 0, occupied: 0, available: 0, conflicts: 0 })
    expect(store.lastSuccessTime).toBeNull()
  })

  it('allows only the latest concurrent request to update visible state', async () => {
    let resolveFirst!: (value: PortInventorySnapshot) => void
    let resolveSecond!: (value: PortInventorySnapshot) => void
    getInventory
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve }))
    const store = usePortMonitoringStore()

    const first = store.refreshAll(true)
    const second = store.refreshAll(true)
    resolveSecond(makeSnapshot({ snapshotId: 'snapshot-new' }))
    await second
    resolveFirst(makeSnapshot({ snapshotId: 'snapshot-old' }))
    await first

    expect(store.snapshot?.snapshotId).toBe('snapshot-new')
  })
})
