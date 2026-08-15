import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortInventoryService } from '../PortInventoryService.js'
import { PortSnapshotManager, type PortStatusInfo } from '../../utils/portSnapshot.js'
import type { Application } from '../../core/types.js'
import type { PortConfiguration } from '../configManager.js'

const portConfig: PortConfiguration = {
  frontendRange: { start: 3001, end: 3003, description: '前端范围' },
  backendRange: { start: 8001, end: 8002, description: '后端范围' },
  reservedPorts: [{ port: 8002, description: '门户 API', category: 'portal' }],
  allocationPolicy: {
    randomizeStartPort: true,
    description: '',
    maxRetries: 3,
    retryDelayMs: 100,
    conflictResolution: 'auto_reassign'
  },
  monitoring: {
    healthCheckIntervalMs: 30000,
    stalePortCheckIntervalMs: 300000,
    portUtilizationWarningThreshold: 80,
    portUtilizationCriticalThreshold: 95,
    enableRealTimeMonitoring: true
  }
}

const createApp = (
  id: string,
  port: number,
  state: Application['state'] = 'running'
): Application => ({
  id,
  name: id.toUpperCase(),
  directory: `C:/apps/${id}`,
  techStack: {
    name: 'Vue',
    category: 'frontend',
    startCommand: 'npm start'
  },
  network: { primaryPort: port, secondaryPorts: [], protocol: 'http' },
  state,
  metadata: { createdAt: 1, updatedAt: 1 },
  deploymentMode: 'development',
  pm2ProcessName: null
})

const snapshot = new Map<number, PortStatusInfo>([
  [3001, { pid: 101, state: 'LISTENING', protocol: 'tcp', localAddress: '0.0.0.0:3001' }],
  [3002, { pid: 999, state: 'LISTENING', protocol: 'tcp', localAddress: '127.0.0.1:3002' }],
  [3003, { pid: 303, state: 'LISTENING', protocol: 'tcp', localAddress: '0.0.0.0:3003' }],
  [8001, { pid: 404, state: 'LISTENING', protocol: 'tcp', localAddress: '0.0.0.0:8001' }],
  [8002, { pid: 505, state: 'LISTENING', protocol: 'tcp', localAddress: '0.0.0.0:8002' }],
  [9000, { pid: 606, state: 'LISTENING', protocol: 'tcp', localAddress: '0.0.0.0:9000' }]
])

const buildService = () => {
  const configManager = {
    getPortConfig: vi.fn(() => portConfig),
    on: vi.fn()
  }
  const apps = [
    createApp('app-one', 3001),
    createApp('app-two', 3002),
    createApp('app-three', 3003),
    createApp('app-four', 3003)
  ]
  const applicationService = { findAll: vi.fn(async () => apps) }
  const processManager = {
    getRunningProcesses: vi.fn(() => new Map([
      ['app-one', { process: { pid: 101 } }],
      ['app-two', { process: { pid: 202 } }],
      ['app-three', { process: { pid: 303 } }],
      ['app-four', { process: { pid: 304 } }]
    ]))
  }
  const wsManager = { broadcast: vi.fn() }

  return {
    service: new PortInventoryService(
      configManager as never,
      applicationService as never,
      processManager,
      undefined,
      undefined,
      wsManager
    ),
    configManager,
    wsManager
  }
}

describe('PortInventoryService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(PortSnapshotManager, 'getSnapshot').mockResolvedValue(snapshot)
    vi.spyOn(PortSnapshotManager, 'getMetadata').mockReturnValue({
      capturedAt: Date.parse('2026-08-02T08:00:00.000Z'),
      stale: false,
      error: null
    })
    vi.spyOn(PortInventoryService.prototype as any, 'loadProcessDetails').mockResolvedValue({
      names: new Map(),
      parents: new Map()
    })
  })

  it('derives summary, conflicts and ownership from one complete listening snapshot', async () => {
    const { service } = buildService()
    const inventory = await service.getInventory(true)

    expect(inventory.scope.total).toBe(5)
    expect(inventory.summary).toMatchObject({
      total: 5,
      occupied: 5,
      available: 0,
      conflicts: 2,
      unmanaged: 1,
      unverified: 0
    })
    expect(inventory.ports.map(row => [row.port, row.ownership])).toEqual([
      [3001, 'verified'],
      [3002, 'mismatch'],
      [3003, 'duplicate-config'],
      [8001, 'unmanaged'],
      [8002, 'reserved']
    ])
    expect(inventory.ports.some(row => row.port === 9000)).toBe(false)
    expect(inventory.ports.find(row => row.port === 8002)?.protected).toBe(true)
  })

  it('reuses the inventory cache unless a forced refresh is requested', async () => {
    const { service } = buildService()
    const getSnapshot = vi.mocked(PortSnapshotManager.getSnapshot)

    const first = await service.getInventory(false)
    const cached = await service.getInventory(false)
    const forced = await service.getInventory(true)

    expect(getSnapshot).toHaveBeenCalledTimes(2)
    expect(cached.snapshotId).toBe(first.snapshotId)
    expect(cached.cached).toBe(true)
    expect(forced.snapshotId).not.toBe(first.snapshotId)
  })

  it('rejects protected, verified or changed processes before force release', async () => {
    const { service } = buildService()

    await expect(service.validateForceRelease(8002, 505)).rejects.toMatchObject({
      statusCode: 403
    })
    await expect(service.validateForceRelease(3001, 101)).rejects.toMatchObject({
      statusCode: 409
    })
    await expect(service.validateForceRelease(8001, 999)).rejects.toThrow('PID 404')
    await expect(service.validateForceRelease(8001, 404)).resolves.toMatchObject({
      port: 8001,
      ownership: 'unmanaged'
    })
  })

  it('invalidates the cache and broadcasts a lightweight realtime event', () => {
    const { service, wsManager } = buildService()

    service.invalidate('test-change')

    expect(wsManager.broadcast).toHaveBeenCalledWith({
      type: 'port_inventory_invalidated',
      payload: { reason: 'test-change' }
    })
  })

  it('accepts a listening child process as belonging to a tracked application', async () => {
    const { service } = buildService()
    const collectRuntimePids = service as unknown as {
      collectRuntimePids: (
        apps: readonly Application[],
        warnings: string[],
        parents: Map<number, number>
      ) => Promise<Map<string, Set<number>>>
    }

    const result = await collectRuntimePids.collectRuntimePids(
      [createApp('app-one', 3001)],
      [],
      new Map([[102, 101], [103, 102]])
    )

    expect(result.get('app-one')).toEqual(new Set([101, 102, 103]))
  })
})
