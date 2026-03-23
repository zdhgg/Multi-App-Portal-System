import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkService } from '../NetworkService'
import { PortSnapshotManager } from '../../utils/portSnapshot'

const createConfigManagerStub = () => ({
  getPortConfig: () => ({
    frontendRange: {
      start: 3001,
      end: 3100,
      description: 'frontend'
    },
    backendRange: {
      start: 8001,
      end: 8100,
      description: 'backend'
    },
    reservedPorts: [],
    allocationPolicy: {
      randomizeStartPort: true,
      description: 'stub',
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
  }),
  on: vi.fn()
})

describe('NetworkService conflict detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('ignores TIME_WAIT snapshot entries when the port is no longer listening', async () => {
    const service = new NetworkService(createConfigManagerStub() as any)

    vi.spyOn(PortSnapshotManager, 'getSnapshot').mockResolvedValue(
      new Map([[8004, { pid: 0, state: 'TIME_WAIT' }]])
    )
    const checkSystemPortSpy = vi.spyOn(service as any, 'checkSystemPort').mockResolvedValue(true)

    const conflicts = await service.checkConflicts([8004])

    expect(conflicts).toEqual([])
    expect(checkSystemPortSpy).toHaveBeenCalledWith(8004)
  })

  it('treats LISTENING snapshot entries as real conflicts', async () => {
    const service = new NetworkService(createConfigManagerStub() as any)

    vi.spyOn(PortSnapshotManager, 'getSnapshot').mockResolvedValue(
      new Map([[8004, { pid: 26952, state: 'LISTENING' }]])
    )
    const checkSystemPortSpy = vi.spyOn(service as any, 'checkSystemPort').mockResolvedValue(true)

    const conflicts = await service.checkConflicts([8004])

    expect(conflicts).toEqual([
      {
        port: 8004,
        currentOwner: 'system',
        requestedBy: 'application',
        pid: 26952
      }
    ])
    expect(checkSystemPortSpy).not.toHaveBeenCalled()
  })
})
