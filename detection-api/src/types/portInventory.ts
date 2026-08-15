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
