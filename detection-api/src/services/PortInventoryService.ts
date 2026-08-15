import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Application } from '../core/types.js'
import type { ApplicationService } from '../core/ApplicationService.js'
import type { PM2Process, PM2Service } from './pm2Service.js'
import type { ConfigManager, PortConfiguration } from './configManager.js'
import type { PortManagementService } from './PortManagementService.js'
import type { WebSocketManager } from './websocket.js'
import { PortSnapshotManager } from '../utils/portSnapshot.js'
import type {
  ExpectedPortApplication,
  PortInventoryRow,
  PortInventorySnapshot,
  PortOwnership
} from '../types/portInventory.js'
import { logger } from '../utils/logger.js'

const execAsync = promisify(exec)
const INVENTORY_CACHE_TTL_MS = 10000

interface ProcessManagerLike {
  getRunningProcesses?: () => Map<string, {
    process?: { pid?: number }
    parentAppId?: string
  }>
}

interface ReservedPort {
  port: number
  description: string
  category: string
}

interface ProcessDetails {
  names: Map<number, string>
  parents: Map<number, number>
}

const normalizePath = (value: string | undefined): string => (
  String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
)

const normalizeName = (value: string | undefined): string => (
  String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
)

export class PortInventoryService {
  private cachedSnapshot: PortInventorySnapshot | null = null
  private cacheTimestamp = 0
  private processDetailsCache: ProcessDetails | null = null
  private processDetailsTimestamp = 0

  constructor(
    private readonly configManager: ConfigManager,
    private readonly applicationService: Pick<ApplicationService, 'findAll'>,
    private readonly processManager?: ProcessManagerLike,
    private readonly pm2Service?: Pick<PM2Service, 'getProcessList'>,
    private readonly portManager?: PortManagementService,
    private readonly wsManager?: Pick<WebSocketManager, 'broadcast'>
  ) {
    for (const event of [
      'portRangesUpdated',
      'reservedPortAdded',
      'reservedPortRemoved',
      'monitoringConfigUpdated',
      'configReloaded'
    ]) {
      this.configManager.on(event, () => this.invalidate(event))
    }

    this.portManager?.on('portAllocated', () => this.invalidate('portAllocated'))
    this.portManager?.on('portReleased', () => this.invalidate('portReleased'))
    this.portManager?.on('zombiePortCleaned', () => this.invalidate('zombiePortCleaned'))
  }

  invalidate(reason: string, broadcast = true): void {
    this.cachedSnapshot = null
    this.cacheTimestamp = 0
    PortSnapshotManager.clearCache()

    if (broadcast) {
      this.wsManager?.broadcast({
        type: 'port_inventory_invalidated',
        payload: { reason }
      })
    }
  }

  async getInventory(force = false): Promise<PortInventorySnapshot> {
    const now = Date.now()
    if (!force && this.cachedSnapshot && now - this.cacheTimestamp < INVENTORY_CACHE_TTL_MS) {
      return {
        ...this.cachedSnapshot,
        cached: true,
        cacheAgeMs: now - this.cacheTimestamp
      }
    }

    const warnings: string[] = []
    const config = this.resolveConfig()
    const apps = await this.loadApplications(warnings)
    const snapshot = await PortSnapshotManager.getSnapshot(force)
    const metadata = PortSnapshotManager.getMetadata()
    const capturedAtMs = metadata.capturedAt || Date.now()

    if (metadata.error) {
      warnings.push(`系统端口快照刷新失败，正在使用上一次结果：${metadata.error}`)
    }

    const processDetails = await this.loadProcessDetails(warnings, force)
    const runtimePids = await this.collectRuntimePids(apps, warnings, processDetails.parents)
    const expectedByPort = this.buildExpectedApps(apps)
    const reservedByPort = new Map(config.reservedPorts.map(port => [port.port, port]))
    const monitoredPorts = new Set<number>()

    for (let port = config.frontendRange.start; port <= config.frontendRange.end; port++) {
      monitoredPorts.add(port)
    }
    for (let port = config.backendRange.start; port <= config.backendRange.end; port++) {
      monitoredPorts.add(port)
    }
    for (const port of expectedByPort.keys()) monitoredPorts.add(port)
    for (const port of reservedByPort.keys()) monitoredPorts.add(port)

    const checkedAt = new Date(capturedAtMs).toISOString()
    const rows: PortInventoryRow[] = []

    for (const [port, observed] of snapshot.entries()) {
      if (!monitoredPorts.has(port) || observed.state !== 'LISTENING') continue

      const expectedApps = expectedByPort.get(port) || []
      const reserved = reservedByPort.get(port) || null
      const protectedPort = Boolean(reserved && ['system', 'portal'].includes(reserved.category))
      const ownership = this.resolveOwnership(expectedApps, observed.pid, runtimePids, reserved)
      const conflictReason = this.resolveConflictReason(ownership, protectedPort, expectedApps)

      rows.push({
        port,
        address: observed.localAddress || '*',
        protocol: 'tcp',
        state: 'listening',
        observed: {
          pid: observed.pid && observed.pid > 0 ? observed.pid : null,
          processName: observed.pid ? processDetails.names.get(observed.pid) || null : null
        },
        expectedApps,
        ownership,
        conflict: Boolean(conflictReason),
        conflictReason,
        reserved: reserved
          ? { description: reserved.description, category: reserved.category }
          : null,
        protected: protectedPort,
        capabilities: {
          stopManagedApp: ownership === 'verified' && expectedApps.length === 1,
          forceRelease: !protectedPort && ownership !== 'verified' && Boolean(observed.pid)
        },
        checkedAt
      })
    }

    rows.sort((left, right) => left.port - right.port)

    const scopePorts = this.buildRangePortSet(config)
    const occupied = rows.filter(row => scopePorts.has(row.port)).length
    const total = scopePorts.size
    const quality = metadata.stale ? 'stale' : warnings.length > 0 ? 'partial' : 'fresh'

    const inventory: PortInventorySnapshot = {
      snapshotId: randomUUID(),
      capturedAt: checkedAt,
      cached: false,
      cacheAgeMs: 0,
      quality,
      warnings,
      monitoring: {
        enabled: true,
        realtimeEnabled: config.monitoring.enableRealTimeMonitoring,
        pollIntervalMs: Math.max(5000, config.monitoring.healthCheckIntervalMs)
      },
      scope: {
        frontend: config.frontendRange,
        backend: config.backendRange,
        total
      },
      summary: {
        total,
        occupied,
        available: Math.max(0, total - occupied),
        conflicts: rows.filter(row => row.conflict).length,
        unmanaged: rows.filter(row => row.ownership === 'unmanaged').length,
        unverified: rows.filter(row => row.ownership === 'unverified').length
      },
      ports: rows
    }

    this.cachedSnapshot = inventory
    this.cacheTimestamp = Date.now()
    return inventory
  }

  async validateForceRelease(port: number, expectedPid: number): Promise<PortInventoryRow> {
    const inventory = await this.getInventory(true)
    const row = inventory.ports.find(item => item.port === port)

    if (!row) {
      throw new PortInventorySafetyError('端口已不再监听，请刷新后重试', 409)
    }
    if (row.protected) {
      throw new PortInventorySafetyError('系统或门户保留端口禁止强制释放', 403)
    }
    if (!row.observed.pid) {
      throw new PortInventorySafetyError('无法确认端口占用进程，已拒绝强制释放', 409)
    }
    if (row.observed.pid !== expectedPid) {
      throw new PortInventorySafetyError(
        `端口占用进程已变化（当前 PID ${row.observed.pid}），请刷新后重试`,
        409
      )
    }
    if (!row.capabilities.forceRelease) {
      throw new PortInventorySafetyError('该端口应通过停止应用释放，禁止直接终止进程', 409)
    }

    return row
  }

  private resolveConfig(): PortConfiguration {
    return this.configManager.getPortConfig() || {
      frontendRange: { start: 3001, end: 3100, description: '前端应用端口范围' },
      backendRange: { start: 8001, end: 8100, description: '后端应用端口范围' },
      reservedPorts: [],
      allocationPolicy: {
        randomizeStartPort: true,
        description: '',
        maxRetries: 3,
        retryDelayMs: 100,
        conflictResolution: 'auto_reassign'
      },
      monitoring: {
        healthCheckIntervalMs: 60000,
        stalePortCheckIntervalMs: 300000,
        portUtilizationWarningThreshold: 80,
        portUtilizationCriticalThreshold: 95,
        enableRealTimeMonitoring: true
      }
    }
  }

  private async loadApplications(warnings: string[]): Promise<readonly Application[]> {
    try {
      return await this.applicationService.findAll()
    } catch (error) {
      warnings.push(`应用配置读取失败：${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  private async collectRuntimePids(
    apps: readonly Application[],
    warnings: string[],
    processParents: Map<number, number>
  ): Promise<Map<string, Set<number>>> {
    const result = new Map<string, Set<number>>()
    const addPid = (appId: string, pid: number | undefined) => {
      if (!appId || !pid || pid <= 0) return
      const pids = result.get(appId) || new Set<number>()
      pids.add(pid)
      result.set(appId, pids)
    }

    try {
      const running = this.processManager?.getRunningProcesses?.() || new Map()
      for (const [processId, info] of running.entries()) {
        const appId = info.parentAppId || processId.replace(/-(frontend|backend)$/, '')
        addPid(appId, info.process?.pid)
      }
    } catch (error) {
      warnings.push(`门户进程状态读取失败：${error instanceof Error ? error.message : String(error)}`)
    }

    const pm2Enabled = process.platform !== 'win32'
      ? process.env.PM2_ENABLED !== '0'
      : process.env.PM2_ENABLED === '1'

    if (this.pm2Service && pm2Enabled) {
      try {
        const processes = await this.pm2Service.getProcessList()
        for (const processInfo of processes) {
          if (processInfo.status !== 'online') continue
          const app = apps.find(candidate => this.matchesPm2Process(candidate, processInfo))
          if (app) addPid(app.id, processInfo.pid)
        }
      } catch (error) {
        warnings.push(`PM2 进程状态读取失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }

    let addedDescendant = true
    while (addedDescendant) {
      addedDescendant = false
      for (const [pid, parentPid] of processParents.entries()) {
        for (const pids of result.values()) {
          if (pids.has(parentPid) && !pids.has(pid)) {
            pids.add(pid)
            addedDescendant = true
          }
        }
      }
    }

    return result
  }

  private matchesPm2Process(app: Application, processInfo: PM2Process): boolean {
    if (app.pm2ProcessName && processInfo.name === app.pm2ProcessName) return true
    if (normalizeName(app.name) && normalizeName(app.name) === normalizeName(processInfo.name)) return true

    const appDirectory = normalizePath(app.directory)
    const processDirectory = normalizePath(processInfo.cwd)
    const script = normalizePath(processInfo.script)
    return Boolean(appDirectory && (
      processDirectory === appDirectory ||
      processDirectory.startsWith(`${appDirectory}/`) ||
      script.startsWith(`${appDirectory}/`)
    ))
  }

  private buildExpectedApps(apps: readonly Application[]): Map<number, ExpectedPortApplication[]> {
    const result = new Map<number, ExpectedPortApplication[]>()
    const add = (port: number, app: Application, role: ExpectedPortApplication['role']) => {
      if (!Number.isInteger(port) || port < 1 || port > 65535) return
      const values = result.get(port) || []
      values.push({
        id: app.id,
        name: app.name,
        role,
        state: app.state,
        deploymentMode: app.deploymentMode || 'unknown'
      })
      result.set(port, values)
    }

    for (const app of apps) {
      add(app.network.primaryPort, app, app.techStack.category === 'backend' ? 'backend' : 'frontend')
      for (const port of app.network.secondaryPorts || []) add(port, app, 'backend')
    }

    return result
  }

  private resolveOwnership(
    expectedApps: ExpectedPortApplication[],
    observedPid: number | undefined,
    runtimePids: Map<string, Set<number>>,
    reserved: ReservedPort | null
  ): PortOwnership {
    if (reserved) return 'reserved'
    if (expectedApps.length > 1) return 'duplicate-config'
    if (expectedApps.length === 0) return observedPid ? 'unmanaged' : 'unverified'
    if (!observedPid) return 'unverified'

    const expectedApp = expectedApps[0]
    const expectedPids = runtimePids.get(expectedApp.id)
    if (expectedPids?.has(observedPid)) return 'verified'
    if (expectedPids?.size || expectedApp.state !== 'running') return 'mismatch'
    return 'unverified'
  }

  private resolveConflictReason(
    ownership: PortOwnership,
    protectedPort: boolean,
    expectedApps: ExpectedPortApplication[]
  ): string | null {
    if (ownership === 'duplicate-config') return '多个应用配置了同一端口'
    if (ownership === 'mismatch') return '实际监听进程与配置应用不一致'
    if (protectedPort && expectedApps.length > 0) return '应用配置占用了受保护端口'
    return null
  }

  private buildRangePortSet(config: PortConfiguration): Set<number> {
    const result = new Set<number>()
    for (let port = config.frontendRange.start; port <= config.frontendRange.end; port++) result.add(port)
    for (let port = config.backendRange.start; port <= config.backendRange.end; port++) result.add(port)
    return result
  }

  private async loadProcessDetails(warnings: string[], force = false): Promise<ProcessDetails> {
    if (
      !force &&
      this.processDetailsCache &&
      Date.now() - this.processDetailsTimestamp < 2000
    ) {
      return this.processDetailsCache
    }

    try {
      if (process.platform === 'win32') {
        const command = 'powershell.exe -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation"'
        const { stdout } = await execAsync(command, { windowsHide: true, timeout: 4000 })
        const names = new Map<number, string>()
        const parents = new Map<number, number>()
        for (const line of stdout.split(/\r?\n/).slice(1)) {
          const match = line.match(/^"(\d+)","(\d+)","([^"]*)"/)
          if (!match) continue
          const pid = Number.parseInt(match[1], 10)
          const parentPid = Number.parseInt(match[2], 10)
          names.set(pid, match[3])
          parents.set(pid, parentPid)
        }
        const result = { names, parents }
        this.processDetailsCache = result
        this.processDetailsTimestamp = Date.now()
        return result
      }

      const { stdout } = await execAsync('ps -eo pid=,ppid=,comm=', { windowsHide: true })
      const names = new Map<number, string>()
      const parents = new Map<number, number>()
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
        if (!match) continue
        const pid = Number.parseInt(match[1], 10)
        names.set(pid, match[3])
        parents.set(pid, Number.parseInt(match[2], 10))
      }
      const result = { names, parents }
      this.processDetailsCache = result
      this.processDetailsTimestamp = Date.now()
      return result
    } catch (error) {
      logger.warn('端口进程名称读取失败', { error })
      warnings.push('进程名称及父子关系读取失败，PID 与监听状态仍可用')
      return { names: new Map(), parents: new Map() }
    }
  }
}

export class PortInventorySafetyError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message)
    this.name = 'PortInventorySafetyError'
  }
}
