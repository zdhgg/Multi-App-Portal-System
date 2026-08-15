import { apiService, type ApiResponse } from '@/services/api'

export type PortOwnership =
  | 'verified'
  | 'mismatch'
  | 'duplicate-config'
  | 'unmanaged'
  | 'unverified'
  | 'reserved'

export type PortInventoryQuality = 'fresh' | 'partial' | 'stale'

export interface ExpectedPortApplication {
  id: string
  name: string
  role: 'frontend' | 'backend' | 'other'
  state: 'stopped' | 'running' | 'failed'
  deploymentMode: 'development' | 'production' | 'unknown'
}

export interface PortInventoryRow {
  port: number
  address: string
  protocol: 'tcp'
  state: 'listening'
  observed: {
    pid: number | null
    processName: string | null
  }
  expectedApps: ExpectedPortApplication[]
  ownership: PortOwnership
  conflict: boolean
  conflictReason: string | null
  reserved: {
    description: string
    category: string
  } | null
  protected: boolean
  capabilities: {
    stopManagedApp: boolean
    forceRelease: boolean
  }
  checkedAt: string
}

export interface PortInventorySnapshot {
  snapshotId: string
  capturedAt: string
  cached: boolean
  cacheAgeMs: number
  quality: PortInventoryQuality
  warnings: string[]
  monitoring: {
    enabled: boolean
    realtimeEnabled: boolean
    pollIntervalMs: number
  }
  scope: {
    frontend: { start: number; end: number; description: string }
    backend: { start: number; end: number; description: string }
    total: number
  }
  summary: {
    total: number
    occupied: number
    available: number
    conflicts: number
    unmanaged: number
    unverified: number
  }
  ports: PortInventoryRow[]
}

export interface ZombieAllocationPreview {
  count: number
  ports: number[]
  items: Array<{
    port: number
    appId: string
    appName: string | null
    allocatedAt: string
    reason: string
  }>
}

export interface ZombieCleanupResult {
  cleanedCount: number
  cleanedPorts: number[]
  errors: Array<{ port: number; error: string }>
  message: string
}

const requireData = <T>(response: ApiResponse<T>, label: string): T => {
  const nested = response.data as T | { data?: T } | undefined
  const data = nested && typeof nested === 'object' && 'data' in nested
    ? nested.data
    : nested as T | undefined

  if (!response.success || data === undefined) {
    throw new Error(response.message || response.error || `${label}未返回有效数据`)
  }
  return data
}

export const portInventoryApi = {
  async getInventory(force = false): Promise<PortInventorySnapshot> {
    const endpoint = force
      ? '/v2/config/ports/inventory?refresh=true'
      : '/v2/config/ports/inventory'
    const response = await apiService.get<ApiResponse<PortInventorySnapshot>>(endpoint, {
      timeout: 30000,
      showErrorMessage: false
    })
    return requireData(response, '端口清单')
  },

  async previewZombieAllocations(): Promise<ZombieAllocationPreview> {
    const response = await apiService.get<ApiResponse<ZombieAllocationPreview>>(
      '/v2/config/ports/cleanup/zombies',
      { showErrorMessage: false }
    )
    return requireData(response, '失效分配预览')
  },

  async cleanupZombieAllocations(): Promise<ZombieCleanupResult> {
    const response = await apiService.post<ApiResponse<ZombieCleanupResult>>(
      '/v2/config/ports/cleanup/zombies',
      undefined,
      { showErrorMessage: false }
    )
    return requireData(response, '失效分配清理')
  },

  async forceRelease(port: number, expectedPid: number, snapshotId: string): Promise<void> {
    const response = await apiService.post<ApiResponse<null>>(
      `/v2/config/ports/${port}/force-release`,
      { expectedPid, snapshotId },
      { showErrorMessage: false }
    )
    if (!response.success) {
      throw new Error(response.message || response.error || `端口 ${port} 释放失败`)
    }
  }
}
