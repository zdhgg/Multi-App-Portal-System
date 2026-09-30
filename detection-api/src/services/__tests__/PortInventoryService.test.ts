import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortInventoryService } from '../PortInventoryService.js'
import { PortSnapshotManager, type PortStatusInfo } from '../../utils/portSnapshot.js'
import type { Application } from '../../core/types.js'
import type { PortConfiguration } from '../configManager.js'
import type { ExpectedPortApplication } from '../../types/portInventory.js'

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

const buildDeps = () => {
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

  return { configManager, applicationService, processManager, wsManager }
}

const buildService = (ServiceClass: typeof PortInventoryService = PortInventoryService) => {
  const deps = buildDeps()

  return {
    service: new ServiceClass(
      deps.configManager as never,
      deps.applicationService as never,
      deps.processManager,
      undefined,
      undefined,
      deps.wsManager
    ),
    configManager: deps.configManager,
    wsManager: deps.wsManager
  }
}

describe('PortInventoryService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // 模块级 mock 不受 restoreAllMocks 影响，显式兜底防止跨用例泄漏
    vi.doUnmock('child_process')
    vi.spyOn(PortSnapshotManager, 'getSnapshot').mockResolvedValue(snapshot)
    vi.spyOn(PortSnapshotManager, 'getMetadata').mockReturnValue({
      capturedAt: Date.parse('2026-08-02T08:00:00.000Z'),
      stale: false,
      error: null
    })
    // 默认构造“进程树读取成功”的场景，用于验证正常判定路径。
    vi.spyOn(PortInventoryService.prototype as any, 'loadProcessDetails').mockResolvedValue({
      names: new Map(),
      parents: new Map(),
      treeAvailable: true
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

  it('degrades a running application to unverified instead of mismatch when the process tree is unavailable', async () => {
    vi.spyOn(PortInventoryService.prototype as any, 'loadProcessDetails').mockResolvedValue({
      names: new Map(),
      parents: new Map(),
      treeAvailable: false
    })

    const { service } = buildService()
    const inventory = await service.getInventory(true)

    const degraded = inventory.ports.find(item => item.port === 3002)
    expect(degraded?.ownership).toBe('unverified')
    expect(degraded?.conflict).toBe(false)
    expect(degraded?.conflictReason).toBeNull()
    // 3001 的 PID 来自门户进程表，不依赖父子关系，降级不应影响它
    expect(inventory.ports.find(item => item.port === 3001)?.ownership).toBe('verified')
    // 仅剩 3003 的重复配置仍构成冲突
    expect(inventory.summary.conflicts).toBe(1)
    expect(inventory.summary.unverified).toBe(1)
  })

  it('keeps mismatch for a non-running application even when the process tree is unavailable', () => {
    const { service } = buildService()
    const resolver = service as unknown as {
      resolveOwnership: (
        expectedApps: ExpectedPortApplication[],
        observedPid: number | undefined,
        runtimePids: Map<string, Set<number>>,
        reserved: null,
        processTreeAvailable: boolean
      ) => string
    }
    const stoppedApp: ExpectedPortApplication = {
      id: 'app-two',
      name: 'APP-TWO',
      role: 'frontend',
      state: 'stopped',
      deploymentMode: 'development'
    }
    const runtimePids = new Map([['app-two', new Set([202])]])

    expect(resolver.resolveOwnership([stoppedApp], 999, runtimePids, null, false)).toBe('mismatch')
    expect(resolver.resolveOwnership([stoppedApp], 999, runtimePids, null, true)).toBe('mismatch')
  })

  it('still reports mismatch when the listener belongs to another managed application', () => {
    const { service } = buildService()
    const resolver = service as unknown as {
      resolveOwnership: (
        expectedApps: ExpectedPortApplication[],
        observedPid: number | undefined,
        runtimePids: Map<string, Set<number>>,
        reserved: null,
        processTreeAvailable: boolean
      ) => string
    }
    const runningApp: ExpectedPortApplication = {
      id: 'app-nine',
      name: 'APP-NINE',
      role: 'frontend',
      state: 'running',
      deploymentMode: 'development'
    }
    // 101 是另一个受管应用的根进程，不依赖进程树即可判定
    const runtimePids = new Map([['app-one', new Set([101])]])

    // 该判定不依赖进程树，健康态与降级态结论必须一致
    expect(resolver.resolveOwnership([runningApp], 101, runtimePids, null, false)).toBe('mismatch')
    expect(resolver.resolveOwnership([runningApp], 101, runtimePids, null, true)).toBe('mismatch')
    // 既不属于本应用也不属于其它受管应用时，只能算证据不足
    expect(resolver.resolveOwnership([runningApp], 777, runtimePids, null, false)).toBe('unverified')
    expect(resolver.resolveOwnership([runningApp], 777, runtimePids, null, true)).toBe('unverified')
  })

  it('reports the timeout reason and degrades ownership when the process snapshot query is killed', async () => {
    vi.resetModules()
    const execMock = vi.fn((_command: string, _options: unknown, callback: (error: unknown) => void) => {
      callback(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' }))
    })
    vi.doMock('child_process', () => ({ exec: execMock }))

    try {
      // 走真实的 loadProcessDetails，仅替换底层 exec
      const { PortInventoryService: Service } = await import('../PortInventoryService.js')
      const { PortSnapshotManager: Snapshot } = await import('../../utils/portSnapshot.js')
      vi.spyOn(Snapshot, 'getSnapshot').mockResolvedValue(snapshot)
      vi.spyOn(Snapshot, 'getMetadata').mockReturnValue({
        capturedAt: Date.parse('2026-08-02T08:00:00.000Z'),
        stale: false,
        error: null
      })

      const { service } = buildService(Service)
      const inventory = await service.getInventory(true)

      expect(execMock).toHaveBeenCalledTimes(1)
      if (process.platform === 'win32') {
        expect(execMock.mock.calls[0][0]).toContain('Get-CimInstance Win32_Process')
        expect(execMock.mock.calls[0][1]).toMatchObject({ timeout: 4000 })
      }
      expect(inventory.warnings.join('；')).toContain('超时')
      expect(inventory.quality).toBe('partial')
      const degraded = inventory.ports.find(item => item.port === 3002)
      expect(degraded?.ownership).toBe('unverified')
      expect(degraded?.conflict).toBe(false)
      // 降级只改标签，不改变可执行的危险操作
      expect(degraded?.capabilities.forceRelease).toBe(true)
    } finally {
      vi.doUnmock('child_process')
      vi.resetModules()
    }
  })

  it('treats an empty process list as unavailable and replays the warning when the cache is reused', async () => {
    vi.resetModules()
    const execMock = vi.fn((
      _command: string,
      _options: unknown,
      callback: (error: unknown, result?: { stdout: string; stderr: string }) => void
    ) => {
      // 命令成功但只返回表头，模拟进程表解析为空
      callback(null, { stdout: '"ProcessId","ParentProcessId","Name"\r\n', stderr: '' })
    })
    vi.doMock('child_process', () => ({ exec: execMock }))

    try {
      const { PortInventoryService: Service } = await import('../PortInventoryService.js')
      const { PortSnapshotManager: Snapshot } = await import('../../utils/portSnapshot.js')
      vi.spyOn(Snapshot, 'getSnapshot').mockResolvedValue(snapshot)
      vi.spyOn(Snapshot, 'getMetadata').mockReturnValue({
        capturedAt: Date.parse('2026-08-02T08:00:00.000Z'),
        stale: false,
        error: null
      })

      const { service } = buildService(Service)
      const inventory = await service.getInventory(true)

      expect(execMock).toHaveBeenCalledTimes(1)
      expect(inventory.warnings.join('；')).toContain('进程列表为空')
      expect(inventory.quality).toBe('partial')
      // 空树不能静默退回严格判定
      expect(inventory.ports.find(item => item.port === 3002)?.ownership).toBe('unverified')

      // 命中进程表缓存时必须重放警告，否则相邻快照会在 partial/fresh 之间跳动
      const replayed: string[] = []
      await (service as unknown as {
        loadProcessDetails: (target: string[], force?: boolean) => Promise<unknown>
      }).loadProcessDetails(replayed, false)

      expect(execMock).toHaveBeenCalledTimes(1)
      expect(replayed.join('；')).toContain('进程列表为空')
    } finally {
      vi.doUnmock('child_process')
      vi.resetModules()
    }
  })
})
