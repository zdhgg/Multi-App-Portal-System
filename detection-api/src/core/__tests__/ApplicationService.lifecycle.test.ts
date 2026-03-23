import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplicationService } from '../ApplicationService'
import type { Application } from '../types'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type MutableApp = Omit<Application, 'state' | 'deploymentMode' | 'pm2ProcessName'> & {
  state: Application['state'] | string
  deploymentMode?: 'development' | 'production' | 'unknown'
  pm2ProcessName?: string | null
}

class InMemoryApplicationRepository {
  private apps = new Map<string, MutableApp>()

  constructor(initialApps: MutableApp[]) {
    for (const app of initialApps) {
      this.apps.set(app.id, { ...app })
    }
  }

  async save(app: Application): Promise<void> {
    this.apps.set(app.id, { ...(app as MutableApp) })
  }

  async findById(id: string): Promise<Application | null> {
    return (this.apps.get(id) as Application) || null
  }

  async findByDirectory(directory: string): Promise<Application | null> {
    for (const app of this.apps.values()) {
      if (app.directory === directory) {
        return app as Application
      }
    }
    return null
  }

  async findAll(): Promise<readonly Application[]> {
    return Array.from(this.apps.values()) as Application[]
  }

  async delete(id: string): Promise<void> {
    this.apps.delete(id)
  }

  async updateState(id: string, state: Application['state']): Promise<void> {
    const app = this.apps.get(id)
    if (!app) {
      throw new Error(`Application not found: ${id}`)
    }
    app.state = state
    this.apps.set(id, app)
  }

  async updatePM2ProcessName(id: string, pm2ProcessName: string | null): Promise<void> {
    const app = this.apps.get(id)
    if (!app) {
      throw new Error(`Application not found: ${id}`)
    }
    app.pm2ProcessName = pm2ProcessName
    this.apps.set(id, app)
  }

  async updateDeploymentMode(id: string, deploymentMode: 'development' | 'production' | 'unknown'): Promise<void> {
    const app = this.apps.get(id)
    if (!app) {
      throw new Error(`Application not found: ${id}`)
    }
    app.deploymentMode = deploymentMode
    this.apps.set(id, app)
  }

  async findByState(state: Application['state']): Promise<readonly Application[]> {
    return Array.from(this.apps.values()).filter(app => app.state === state) as Application[]
  }
}

const createBaseApp = (overrides: Partial<MutableApp> = {}): MutableApp => ({
  id: 'app-1',
  name: 'Lifecycle Test App',
  directory: process.cwd(),
  techStack: {
    name: 'vite',
    category: 'frontend',
    startCommand: 'npm run dev'
  },
  network: {
    primaryPort: 3100,
    secondaryPorts: [],
    protocol: 'http'
  },
  state: 'stopped',
  metadata: {
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    pinned: false
  },
  ...overrides
})

describe('ApplicationService lifecycle policy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('blocks tech stack update while application is running', async () => {
    const app = createBaseApp({ state: 'running' })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await expect(
      service.update(app.id, { techStack: 'react' })
    ).rejects.toMatchObject({
      code: 'STATE_POLICY_VIOLATION'
    })
  })

  it('marks state as failed when process startup throws', async () => {
    const app = createBaseApp({ state: 'stopped' })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {
        throw new Error('process crashed')
      }),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await expect(service.start(app.id)).rejects.toThrow('process crashed')

    const stored = await repository.findById(app.id)
    expect(stored?.state).toBe('failed')
  })

  it('marks direct starts as development and clears stale PM2 metadata', async () => {
    const app = createBaseApp({
      deploymentMode: 'production',
      pm2ProcessName: 'video-cms'
    })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)
    vi.spyOn(service as any, 'checkPortRealTime').mockResolvedValue({ isInUse: false })

    await service.start(app.id)

    const stored = await repository.findById(app.id)
    expect(stored?.state).toBe('running')
    expect(stored?.deploymentMode).toBe('development')
    expect(stored?.pm2ProcessName).toBeNull()
  })

  it('keeps stopped applications untouched when no runtime ports are active', async () => {
    const app = createBaseApp({ state: 'stopped' })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await service.stop(app.id)

    expect(networkService.checkConflicts).toHaveBeenCalledWith([3100])
    expect(processManager.stop).not.toHaveBeenCalled()
    expect(networkService.releasePort).not.toHaveBeenCalled()
  })

  it('cleans up stale runtime ports even when application state is already stopped', async () => {
    const app = createBaseApp({
      state: 'stopped',
      network: {
        primaryPort: 3005,
        secondaryPorts: [8005],
        protocol: 'http'
      }
    })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [
        { port: 3005, currentOwner: 'node', requestedBy: 'application' },
        { port: 8005, currentOwner: 'node', requestedBy: 'application' }
      ])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await service.stop(app.id)

    expect(networkService.checkConflicts).toHaveBeenCalledWith([3005, 8005])
    expect(processManager.stop).toHaveBeenCalledWith(app.id)
    expect(networkService.releasePort).toHaveBeenCalledTimes(2)
    expect(networkService.releasePort).toHaveBeenNthCalledWith(1, 3005)
    expect(networkService.releasePort).toHaveBeenNthCalledWith(2, 8005)

    const stored = await repository.findById(app.id)
    expect(stored?.state).toBe('stopped')
    expect(stored?.deploymentMode).toBe('unknown')
    expect(stored?.pm2ProcessName).toBeNull()
  })

  it('rejects start when directory does not exist', async () => {
    const app = createBaseApp({
      state: 'stopped',
      directory: 'Z:/definitely-not-existing-path-for-lifecycle-test'
    })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await expect(service.start(app.id)).rejects.toMatchObject({
      code: 'APPLICATION_DIRECTORY_NOT_FOUND'
    })
    expect(processManager.start).not.toHaveBeenCalled()
  })

  it('resets runtime markers when stopping a running direct app', async () => {
    const app = createBaseApp({
      state: 'running',
      deploymentMode: 'development',
      pm2ProcessName: 'stale-process-name',
      network: {
        primaryPort: 3005,
        secondaryPorts: [8005],
        protocol: 'http'
      }
    })
    const repository = new InMemoryApplicationRepository([app])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await service.stop(app.id)

    const stored = await repository.findById(app.id)
    expect(processManager.stop).toHaveBeenCalledWith(app.id)
    expect(stored?.state).toBe('stopped')
    expect(stored?.deploymentMode).toBe('unknown')
    expect(stored?.pm2ProcessName).toBeNull()
  })

  it('rejects external-exe creation when buildScript is missing', async () => {
    const repository = new InMemoryApplicationRepository([])
    const networkService = {
      allocatePort: vi.fn(async () => 3200),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    await expect(
      service.create({
        name: 'External EXE App',
        directory: process.cwd(),
        techStack: 'external-exe'
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })

  it('creates external-exe app and stores build_script', async () => {
    const repository = new InMemoryApplicationRepository([])
    const networkService = {
      allocatePort: vi.fn(async () => 3320),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'external-exe-test-'))
    const exePath = join(tempDir, 'cli-proxy-api.exe')
    writeFileSync(exePath, 'echo test')

    const service = new ApplicationService(repository as any, networkService as any, processManager as any)

    try {
      const created = await service.create({
        name: 'CLI Proxy API',
        directory: tempDir,
        techStack: 'external-exe',
        build_script: exePath
      })

      expect(created.build_script).toBe(exePath)
      expect(created.buildScript).toBe(exePath)
      expect(created.network.primaryPort).toBe(3320)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('auto allocates fullstack secondary port from backend range', async () => {
    const repository = new InMemoryApplicationRepository([])
    const networkService = {
      allocatePort: vi.fn(async (scope?: 'frontend' | 'backend' | 'unified') => {
        if (scope === 'frontend') return 3004
        if (scope === 'backend') return 8004
        return 3004
      }),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }
    const configManager = {
      getPortConfig: vi.fn(() => ({
        frontendRange: { start: 3003, end: 3100, description: 'frontend' },
        backendRange: { start: 8003, end: 8100, description: 'backend' }
      }))
    }

    const service = new ApplicationService(
      repository as any,
      networkService as any,
      processManager as any,
      configManager as any
    )

    const created = await service.create({
      name: 'Video CMS',
      directory: process.cwd(),
      techStack: 'fullstack'
    })

    expect(created.network.primaryPort).toBe(3004)
    expect(created.network.secondaryPorts).toEqual([8004])
    expect(networkService.allocatePort).toHaveBeenCalledWith('frontend')
    expect(networkService.allocatePort).toHaveBeenCalledWith('backend')
  })

  it('rejects out-of-range backend port for fullstack creation', async () => {
    const repository = new InMemoryApplicationRepository([])
    const networkService = {
      allocatePort: vi.fn(async () => 3004),
      releasePort: vi.fn(async () => {}),
      checkConflicts: vi.fn(async () => [])
    }
    const processManager = {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {})
    }
    const configManager = {
      getPortConfig: vi.fn(() => ({
        frontendRange: { start: 3003, end: 3100, description: 'frontend' },
        backendRange: { start: 8003, end: 8100, description: 'backend' }
      }))
    }

    const service = new ApplicationService(
      repository as any,
      networkService as any,
      processManager as any,
      configManager as any
    )

    await expect(
      service.create({
        name: 'Video CMS',
        directory: process.cwd(),
        techStack: 'fullstack',
        primaryPort: 3004,
        secondaryPorts: [3005]
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })
})
