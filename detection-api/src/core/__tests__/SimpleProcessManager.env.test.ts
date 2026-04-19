import { afterEach, describe, expect, it, vi } from 'vitest'
import { SimpleProcessManager } from '../SimpleServices'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'

function createMockChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess
  ;(child as any).pid = 43210
  ;(child as any).killed = false
  ;(child as any).exitCode = null
  return child
}

describe('SimpleProcessManager environment handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('prefers child process NODE_ENV over portal NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production')

    const manager = new SimpleProcessManager()
    const env = (manager as any).buildProcessEnvironmentVariables('backend', {
      workingDirectory: process.cwd(),
      startCommand: 'npm run dev',
      port: 8006,
      environmentVariables: {
        NODE_ENV: 'development',
        HOST: '0.0.0.0'
      }
    })

    expect(env.NODE_ENV).toBe('development')
    expect(env.HOST).toBe('0.0.0.0')
    expect(env.PORT).toBe('8006')
    expect(env.SERVER_PORT).toBe('8006')
  })

  it('generates a Vite proxy config that preserves the app base config when one exists', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'portal-vite-proxy-base-'))

    try {
      await writeFile(
        join(tempDir, 'vite.config.ts'),
        'export default { plugins: ["placeholder-plugin"] }\n',
        'utf-8'
      )

      const manager = new SimpleProcessManager()
      await (manager as any).createViteProxyConfig(tempDir, '8123')

      const generatedConfig = await readFile(join(tempDir, 'vite.config.proxy.ts'), 'utf-8')

      expect(generatedConfig).toContain('const baseConfigFile = "vite.config.ts"')
      expect(generatedConfig).toContain('loadConfigFromFile')
      expect(generatedConfig).toContain("target: 'http://localhost:8123'")
      expect(generatedConfig).toContain("'/uploads':")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back to a generated Vite config when no base vite config exists', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'portal-vite-proxy-fallback-'))

    try {
      const manager = new SimpleProcessManager()
      await (manager as any).createViteProxyConfig(tempDir, '8456')

      const generatedConfig = await readFile(join(tempDir, 'vite.config.proxy.ts'), 'utf-8')

      expect(generatedConfig).toContain('const baseConfigFile = null')
      expect(generatedConfig).toContain('plugins: [vue()]')
      expect(generatedConfig).toContain("target: 'http://localhost:8456'")
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('preserves versioned API prefixes discovered from frontend source files', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'portal-api-prefix-source-'))

    try {
      await mkdir(join(tempDir, 'src', 'utils'), { recursive: true })
      await writeFile(
        join(tempDir, 'src', 'utils', 'request.js'),
        [
          'import axios from "axios";',
          'export default axios.create({',
          '  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8003/api/v1",',
          '  timeout: 10000',
          '});',
          ''
        ].join('\n'),
        'utf-8'
      )

      const manager = new SimpleProcessManager()
      const resolvedBasePath = (manager as any).resolveRelativeApiBasePath(tempDir, {})

      expect(resolvedBasePath).toBe('/api/v1')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('normalizes absolute API env vars to relative proxy paths', () => {
    const manager = new SimpleProcessManager()
    const resolvedBasePath = (manager as any).resolveRelativeApiBasePath(process.cwd(), {
      VITE_API_BASE_URL: 'http://localhost:8123/api/v2'
    })

    expect(resolvedBasePath).toBe('/api/v2')
  })

  it('uses TCP probing instead of netstat scanning for post-start health checks', async () => {
    const manager = new SimpleProcessManager()
    const isPortListeningSpy = vi.spyOn(manager as any, 'isPortListening').mockResolvedValue(true)
    const checkProcessRunningSpy = vi.spyOn(manager as any, 'checkProcessRunning').mockResolvedValue(false)

    const isHealthy = await (manager as any).checkProcessHealth('app-1', {
      process: createMockChildProcess(),
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8123,
      logs: [],
      processType: 'backend',
      appName: 'app-1-backend'
    })

    expect(isHealthy).toBe(true)
    expect(isPortListeningSpy).toHaveBeenCalledWith(8123)
    expect(checkProcessRunningSpy).not.toHaveBeenCalled()
  })

  it('requires consecutive health check failures before cleaning a process', async () => {
    const manager = new SimpleProcessManager()
    const repository = {
      updateState: vi.fn().mockResolvedValue(undefined)
    }

    ;(manager as any).applicationRepository = repository

    const processInfo = {
      process: createMockChildProcess(),
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8003,
      logs: [],
      processType: 'backend',
      parentAppId: 'educore-app',
      appName: 'educore-app-backend'
    }

    ;(manager as any).processes.set('educore-app-backend', processInfo)

    vi.spyOn(manager as any, 'checkProcessHealth').mockResolvedValue(false)
    const cleanupSpy = vi.spyOn(manager as any, 'forceCleanupProcess').mockResolvedValue(undefined)

    await (manager as any).performHealthCheck()

    expect((manager as any).healthFailureCounts.get('educore-app-backend')).toBe(1)
    expect(cleanupSpy).not.toHaveBeenCalled()
    expect(repository.updateState).not.toHaveBeenCalled()

    await (manager as any).performHealthCheck()

    expect(cleanupSpy).toHaveBeenCalledWith('educore-app-backend', 'educore-app', processInfo)
    expect(repository.updateState).toHaveBeenCalledWith('educore-app', 'stopped')
    expect((manager as any).healthFailureCounts.has('educore-app-backend')).toBe(false)
  })

  it('clears health failure counts when a tracked process is stopped', async () => {
    const manager = new SimpleProcessManager()
    const processInfo = {
      process: createMockChildProcess(),
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8003,
      logs: [],
      processType: 'backend',
      appName: 'portal-api'
    }

    ;(manager as any).processes.set('portal-api', processInfo)
    ;(manager as any).healthFailureCounts.set('portal-api', 1)

    vi.spyOn(manager as any, 'terminateChildProcess').mockResolvedValue(undefined)

    await manager.stop('portal-api')

    expect((manager as any).processes.has('portal-api')).toBe(false)
    expect((manager as any).healthFailureCounts.has('portal-api')).toBe(false)
  })

  it('clears health failure counts when exited processes are swept', () => {
    const manager = new SimpleProcessManager()
    const exitedProcess = createMockChildProcess()
    ;(exitedProcess as any).exitCode = 1

    ;(manager as any).processes.set('portal-api', {
      process: exitedProcess,
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8003,
      logs: [],
      processType: 'backend',
      appName: 'portal-api'
    })
    ;(manager as any).healthFailureCounts.set('portal-api', 2)

    manager.cleanupExitedProcesses()

    expect((manager as any).processes.has('portal-api')).toBe(false)
    expect((manager as any).healthFailureCounts.has('portal-api')).toBe(false)
  })

  it('clears health failure counts before auto-restarting an application', async () => {
    const manager = new SimpleProcessManager()
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: 'portal-api',
        name: 'portal-api',
        directory: process.cwd(),
        techStack: { name: 'Node.js' },
        network: { primaryPort: 8003 }
      }),
      updateState: vi.fn().mockResolvedValue(undefined)
    }

    ;(manager as any).applicationRepository = repository
    ;(manager as any).processes.set('portal-api', {
      process: createMockChildProcess(),
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8003,
      logs: [],
      processType: 'backend',
      appName: 'portal-api'
    })
    ;(manager as any).healthFailureCounts.set('portal-api', 2)

    vi.spyOn(manager, 'start').mockResolvedValue(createMockChildProcess())

    const restarted = await manager.autoRestart('portal-api')

    expect(restarted).toBe(true)
    expect((manager as any).healthFailureCounts.has('portal-api')).toBe(false)
    expect(repository.updateState).toHaveBeenCalledWith('portal-api', 'running')
  })

  it('stops the whole fullstack group when an unhealthy child process is cleaned up', async () => {
    const manager = new SimpleProcessManager()
    const processInfo = {
      process: createMockChildProcess(),
      startedAt: new Date(Date.now() - 60_000),
      command: 'npm',
      args: ['run', 'dev'],
      cwd: process.cwd(),
      port: 8003,
      logs: [],
      processType: 'backend',
      parentAppId: 'educore-app',
      appName: 'educore-app-backend'
    }

    ;(manager as any).processes.set('educore-app-backend', processInfo)
    ;(manager as any).fullStackGroups.set('educore-app', {
      appId: 'educore-app',
      backendProcess: processInfo,
      startedAt: new Date()
    })
    ;(manager as any).healthFailureCounts.set('educore-app-backend', 2)

    const stopFullStackSpy = vi.spyOn(manager as any, 'stopFullStack').mockResolvedValue(undefined)

    await (manager as any).forceCleanupProcess('educore-app-backend', 'educore-app', processInfo)

    expect(stopFullStackSpy).toHaveBeenCalledWith('educore-app')
    expect((manager as any).healthFailureCounts.has('educore-app-backend')).toBe(false)
  })
})
