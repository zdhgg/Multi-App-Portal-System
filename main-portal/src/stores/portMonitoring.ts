import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  portInventoryApi,
  type PortInventoryRow,
  type PortInventorySnapshot
} from '@/services/portInventoryApi'
import {
  portRealtimeWebSocket,
  type PortRealtimeConnectionState
} from '@/services/portManagementApi'

export type PortInventoryDataState =
  | 'idle'
  | 'initial-loading'
  | 'refreshing'
  | 'ready'
  | 'partial'
  | 'stale'
  | 'error'

export interface PortStatus {
  port: number
  status: 'listening' | 'allocated' | 'closed' | 'error'
  process?: { name: string; pid: number; user?: string }
  application?: { id: string; name: string; type: string }
  performance: { responseTime: number; lastCheck: Date }
  security?: { riskLevel: 'low' | 'medium' | 'high'; issues: string[] }
}

export interface PortStatistics {
  total: number
  occupied: number
  available: number
  conflicts: number
  byType: Record<string, number>
  byStatus: Record<string, number>
}

export interface OccupiedPortCompatibilityRow {
  port: number
  process: string
  pid: number
  status: string
  appId?: string
  appName?: string
  portType?: string
  ownership: PortInventoryRow['ownership']
  address: string
  protocol: string
}

export const usePortMonitoringStore = defineStore('portMonitoring', () => {
  const snapshot = ref<PortInventorySnapshot | null>(null)
  const dataState = ref<PortInventoryDataState>('idle')
  const connectionState = ref<PortRealtimeConnectionState>('polling')
  const lastAttemptTime = ref<Date | null>(null)
  const lastSuccessTime = ref<Date | null>(null)
  const lastScanTime = ref<Date | null>(null)
  const currentError = ref<string | null>(null)

  const quickStats = reactive({ total: 0, occupied: 0, available: 0, conflicts: 0 })
  const statistics = ref<PortStatistics>({
    total: 0,
    occupied: 0,
    available: 0,
    conflicts: 0,
    byType: {},
    byStatus: {}
  })
  const ports = ref<Map<number, PortStatus>>(new Map())
  const occupiedPortsList = ref<OccupiedPortCompatibilityRow[]>([])
  const loadingStates = reactive({
    refresh: false,
    stats: false,
    scan: false,
    cleanup: false,
    release: new Map<number, boolean>()
  })
  const errors = ref<Array<{
    id: string
    type: 'scan' | 'api' | 'network'
    message: string
    timestamp: Date
    details?: unknown
  }>>([])

  let requestVersion = 0
  let currentRequest: Promise<PortInventorySnapshot> | null = null
  let pollingTimer: ReturnType<typeof setTimeout> | null = null
  let invalidationTimer: ReturnType<typeof setTimeout> | null = null
  let monitoringConsumers = 0

  const cache = reactive({
    statsTimestamp: 0,
    portsTimestamp: 0,
    isValid: () => Boolean(snapshot.value && Date.now() - cache.statsTimestamp < 10000),
    invalidate: () => {
      cache.statsTimestamp = 0
      cache.portsTimestamp = 0
    }
  })

  const activePorts = computed(() => [...ports.value.values()])
  const conflictPorts = computed(() => activePorts.value.filter(port => port.status === 'error'))
  const portsByType = computed(() => {
    const result: Record<string, PortStatus[]> = {}
    for (const port of activePorts.value) {
      const type = port.application?.type || 'unknown'
      if (!result[type]) result[type] = []
      result[type].push(port)
    }
    return result
  })
  const isInitialLoading = computed(() => dataState.value === 'initial-loading')
  const isRefreshing = computed(() => dataState.value === 'refreshing')
  const hasUsableData = computed(() => Boolean(snapshot.value))

  const addError = (
    type: 'scan' | 'api' | 'network',
    message: string,
    details?: unknown
  ) => {
    errors.value.push({
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date(),
      details
    })
    if (errors.value.length > 50) errors.value = errors.value.slice(-50)
  }

  const clearErrors = () => {
    errors.value = []
  }

  const applySnapshot = (next: PortInventorySnapshot) => {
    snapshot.value = next
    quickStats.total = next.summary.total
    quickStats.occupied = next.summary.occupied
    quickStats.available = next.summary.available
    quickStats.conflicts = next.summary.conflicts
    statistics.value = {
      total: next.summary.total,
      occupied: next.summary.occupied,
      available: next.summary.available,
      conflicts: next.summary.conflicts,
      byType: {},
      byStatus: { listening: next.ports.length }
    }

    const nextPorts = new Map<number, PortStatus>()
    occupiedPortsList.value = next.ports.map(row => {
      const expectedApp = row.expectedApps[0]
      nextPorts.set(row.port, {
        port: row.port,
        status: row.conflict ? 'error' : 'listening',
        process: row.observed.pid
          ? { name: row.observed.processName || '未知进程', pid: row.observed.pid }
          : undefined,
        application: expectedApp
          ? { id: expectedApp.id, name: expectedApp.name, type: expectedApp.role }
          : undefined,
        performance: { responseTime: 0, lastCheck: new Date(row.checkedAt) },
        security: row.conflict
          ? { riskLevel: 'high', issues: row.conflictReason ? [row.conflictReason] : [] }
          : undefined
      })
      return {
        port: row.port,
        process: row.observed.processName || '未知进程',
        pid: row.observed.pid || 0,
        status: row.state,
        appId: expectedApp?.id,
        appName: expectedApp?.name || row.reserved?.description,
        portType: expectedApp?.role || row.reserved?.category || 'other',
        ownership: row.ownership,
        address: row.address,
        protocol: row.protocol
      }
    })
    ports.value = nextPorts

    const capturedAt = new Date(next.capturedAt)
    lastSuccessTime.value = capturedAt
    lastScanTime.value = capturedAt
    cache.statsTimestamp = Date.now()
    cache.portsTimestamp = Date.now()
    currentError.value = null
    dataState.value = next.quality === 'stale'
      ? 'stale'
      : next.quality === 'partial' ? 'partial' : 'ready'
    schedulePolling()
  }

  const refreshAll = async (force = true): Promise<PortInventorySnapshot> => {
    if (!force && currentRequest) return currentRequest

    const version = ++requestVersion
    const hadSnapshot = Boolean(snapshot.value)
    lastAttemptTime.value = new Date()
    loadingStates.refresh = true
    loadingStates.stats = true
    dataState.value = hadSnapshot ? 'refreshing' : 'initial-loading'

    const request = portInventoryApi.getInventory(force)
    currentRequest = request

    try {
      const result = await request
      if (version === requestVersion) applySnapshot(result)
      return result
    } catch (error) {
      if (version === requestVersion) {
        const message = error instanceof Error ? error.message : '端口清单刷新失败'
        currentError.value = message
        dataState.value = snapshot.value ? 'stale' : 'error'
        addError('api', message, error)
      }
      throw error
    } finally {
      if (version === requestVersion) {
        loadingStates.refresh = false
        loadingStates.stats = false
        currentRequest = null
        schedulePolling()
      }
    }
  }

  const fetchStatistics = async (force = false): Promise<void> => {
    await refreshAll(force)
  }

  const fetchOccupiedPorts = async (force = false): Promise<void> => {
    await refreshAll(force)
  }

  const smartRefresh = async (options: { force?: boolean } = {}): Promise<void> => {
    await refreshAll(Boolean(options.force))
  }

  const forceReleasePort = async (
    port: number,
    _options: { reason?: string; confirmationToken?: string; bypassSafetyCheck?: boolean } = {}
  ): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    const row = snapshot.value?.ports.find(item => item.port === port)
    if (!row?.observed.pid || !row.capabilities.forceRelease || !snapshot.value) {
      throw new Error('当前快照不允许强制释放该端口，请刷新后查看详情')
    }

    loadingStates.release.set(port, true)
    try {
      await portInventoryApi.forceRelease(port, row.observed.pid, snapshot.value.snapshotId)
      await refreshAll(true)
      return { success: true }
    } finally {
      loadingStates.release.set(port, false)
    }
  }

  const clearPollingTimer = () => {
    if (pollingTimer) clearTimeout(pollingTimer)
    pollingTimer = null
  }

  function schedulePolling(): void {
    clearPollingTimer()
    if (monitoringConsumers === 0) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    const interval = snapshot.value?.monitoring.pollIntervalMs || 60000
    pollingTimer = setTimeout(() => {
      refreshAll(false).catch(() => undefined)
    }, Math.max(5000, interval))
  }

  const requestInvalidationRefresh = () => {
    if (invalidationTimer) clearTimeout(invalidationTimer)
    invalidationTimer = setTimeout(() => {
      invalidationTimer = null
      refreshAll(true).catch(() => undefined)
    }, 300)
  }

  const handleConnectionState = (state: PortRealtimeConnectionState) => {
    const wasConnected = connectionState.value === 'connected'
    connectionState.value = state
    if (state === 'connected' && !wasConnected) requestInvalidationRefresh()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearPollingTimer()
      return
    }
    refreshAll(false).catch(() => undefined)
  }

  const startMonitoring = async (): Promise<void> => {
    monitoringConsumers++
    if (monitoringConsumers > 1) return

    portRealtimeWebSocket.on('connection_state', handleConnectionState)
    portRealtimeWebSocket.on('port_inventory_invalidated', requestInvalidationRefresh)
    portRealtimeWebSocket.on('port_allocation', requestInvalidationRefresh)
    portRealtimeWebSocket.on('port_conflict', requestInvalidationRefresh)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    if (!snapshot.value) await refreshAll(false)
    else schedulePolling()
  }

  const stopMonitoring = () => {
    monitoringConsumers = Math.max(0, monitoringConsumers - 1)
    if (monitoringConsumers > 0) return

    clearPollingTimer()
    if (invalidationTimer) clearTimeout(invalidationTimer)
    invalidationTimer = null
    portRealtimeWebSocket.off('connection_state', handleConnectionState)
    portRealtimeWebSocket.off('port_inventory_invalidated', requestInvalidationRefresh)
    portRealtimeWebSocket.off('port_allocation', requestInvalidationRefresh)
    portRealtimeWebSocket.off('port_conflict', requestInvalidationRefresh)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    connectionState.value = 'polling'
  }

  return {
    snapshot,
    dataState,
    connectionState,
    lastAttemptTime,
    lastSuccessTime,
    lastScanTime,
    currentError,
    quickStats,
    statistics,
    ports,
    occupiedPortsList,
    loadingStates,
    errors,
    cache,
    activePorts,
    conflictPorts,
    portsByType,
    isInitialLoading,
    isRefreshing,
    hasUsableData,
    refreshAll,
    fetchStatistics,
    fetchOccupiedPorts,
    smartRefresh,
    forceReleasePort,
    addError,
    clearErrors,
    startMonitoring,
    stopMonitoring
  }
})
