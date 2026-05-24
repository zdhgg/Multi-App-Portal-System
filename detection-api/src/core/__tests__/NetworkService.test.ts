import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkService } from '../NetworkService'
import { PortSnapshotManager } from '../../utils/portSnapshot'

const createConfigManagerStub = (
  ranges = {
    frontendRange: {
      start: 3001,
      end: 3100,
      description: 'frontend'
    },
    backendRange: {
      start: 8001,
      end: 8100,
      description: 'backend'
    }
  }
) => ({
  getPortConfig: () => ({
    frontendRange: ranges.frontendRange,
    backendRange: ranges.backendRange,
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

const createDatabaseStub = (apps: any[]) => ({
  prepare: vi.fn(() => ({
    all: vi.fn(() => apps)
  }))
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

  it('fails releasePort when the port is still occupied after cleanup attempt', async () => {
    const service = new NetworkService(createConfigManagerStub() as any)

    vi.spyOn(service as any, 'killProcessOnPort').mockResolvedValue(undefined)
    vi.spyOn(service as any, 'checkSystemPort').mockResolvedValue(false)

    await expect(service.releasePort(8010)).rejects.toThrow('Port 8010 remains occupied after release attempt')
  })

  it('allocates paired fullstack ports by offset and skips unavailable pairs', async () => {
    const service = new NetworkService(
      createConfigManagerStub({
        frontendRange: { start: 3011, end: 3012, description: 'frontend' },
        backendRange: { start: 8011, end: 8012, description: 'backend' }
      }) as any,
      createDatabaseStub([
        {
          id: 'existing-app',
          name: 'Existing App',
          network_config: JSON.stringify({
            primaryPort: 3009,
            secondaryPorts: [8011],
            protocol: 'http'
          })
        }
      ]) as any
    )

    vi.spyOn(service as any, 'checkSystemPort').mockResolvedValue(true)

    const pair = await service.allocatePortPair()

    expect(pair).toEqual({
      primaryPort: 3012,
      secondaryPort: 8012
    })
  })
})
