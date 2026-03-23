import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PM2StateSyncService } from '../pm2StateSyncService'
import type { Application, ApplicationState, DeploymentMode } from '../../core/types'

type MutableApp = Omit<Application, 'state' | 'deploymentMode' | 'pm2ProcessName'> & {
  state: ApplicationState
  deploymentMode?: DeploymentMode
  pm2ProcessName?: string | null
}

class InMemoryApplicationRepository {
  private apps = new Map<string, MutableApp>()

  constructor(initialApps: MutableApp[]) {
    for (const app of initialApps) {
      this.apps.set(app.id, { ...app })
    }
  }

  get(id: string): MutableApp | undefined {
    return this.apps.get(id)
  }

  async updateState(id: string, state: ApplicationState): Promise<void> {
    const app = this.apps.get(id)
    if (!app) {
      throw new Error(`Application not found: ${id}`)
    }
    app.state = state
    this.apps.set(id, app)
  }

  async updateDeploymentMode(id: string, deploymentMode: DeploymentMode): Promise<void> {
    const app = this.apps.get(id)
    if (!app) {
      throw new Error(`Application not found: ${id}`)
    }
    app.deploymentMode = deploymentMode
    this.apps.set(id, app)
  }
}

const createApp = (overrides: Partial<MutableApp> = {}): MutableApp => ({
  id: 'video-cms',
  name: 'video-cms',
  directory: 'd:/my programs/video cms',
  techStack: {
    name: 'fullstack',
    category: 'fullstack',
    startCommand: 'npm run dev'
  },
  network: {
    primaryPort: 3004,
    secondaryPorts: [8004],
    protocol: 'http'
  },
  state: 'stopped',
  metadata: {
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000)
  },
  deploymentMode: 'unknown',
  pm2ProcessName: null,
  ...overrides
})

describe('PM2StateSyncService manual runtime detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('promotes manually started fullstack apps to running development when primary port is active', async () => {
    const repository = new InMemoryApplicationRepository([createApp()])
    const applicationService = {
      repository,
      findAll: vi.fn(async () => {
        const app = repository.get('video-cms')
        return app ? [app] : []
      }),
      findById: vi.fn(async (id: string) => repository.get(id) ?? null)
    }
    const pm2Service = {
      getProcessList: vi.fn(async () => [])
    }
    const networkService = {
      checkConflicts: vi.fn(async () => [
        { port: 3004, currentOwner: 'node', requestedBy: 'application', pid: 25604 },
        { port: 8004, currentOwner: 'node', requestedBy: 'application', pid: 28480 }
      ])
    }

    const service = new PM2StateSyncService(
      pm2Service as any,
      applicationService as any,
      networkService as any
    )

    const result = await service.syncNow()
    const stored = repository.get('video-cms')

    expect(result).toMatchObject({ synced: 1, updated: 1, errors: 0 })
    expect(stored?.state).toBe('running')
    expect(stored?.deploymentMode).toBe('development')
    expect(networkService.checkConflicts).toHaveBeenCalledWith([3004, 8004])
  })

  it('keeps manually stopped apps offline when no configured ports are active', async () => {
    const repository = new InMemoryApplicationRepository([createApp()])
    const applicationService = {
      repository,
      findAll: vi.fn(async () => {
        const app = repository.get('video-cms')
        return app ? [app] : []
      }),
      findById: vi.fn(async (id: string) => repository.get(id) ?? null)
    }
    const pm2Service = {
      getProcessList: vi.fn(async () => [])
    }
    const networkService = {
      checkConflicts: vi.fn(async () => [])
    }

    const service = new PM2StateSyncService(
      pm2Service as any,
      applicationService as any,
      networkService as any
    )

    const result = await service.syncNow()
    const stored = repository.get('video-cms')

    expect(result).toMatchObject({ synced: 1, updated: 0, errors: 0 })
    expect(stored?.state).toBe('stopped')
    expect(stored?.deploymentMode).toBe('unknown')
  })

  it('downgrades stale production labels when no PM2 process name is recorded', async () => {
    const repository = new InMemoryApplicationRepository([
      createApp({
        state: 'running',
        deploymentMode: 'production',
        pm2ProcessName: null
      })
    ])
    const applicationService = {
      repository,
      findAll: vi.fn(async () => {
        const app = repository.get('video-cms')
        return app ? [app] : []
      }),
      findById: vi.fn(async (id: string) => repository.get(id) ?? null)
    }
    const pm2Service = {
      getProcessList: vi.fn(async () => [])
    }
    const networkService = {
      checkConflicts: vi.fn(async () => [
        { port: 3004, currentOwner: 'node', requestedBy: 'application', pid: 25604 },
        { port: 8004, currentOwner: 'node', requestedBy: 'application', pid: 28480 }
      ])
    }

    const service = new PM2StateSyncService(
      pm2Service as any,
      applicationService as any,
      networkService as any
    )

    const result = await service.syncNow()
    const stored = repository.get('video-cms')

    expect(result).toMatchObject({ synced: 1, updated: 1, errors: 0 })
    expect(stored?.state).toBe('running')
    expect(stored?.deploymentMode).toBe('development')
  })
})
