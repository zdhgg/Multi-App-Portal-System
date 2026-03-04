import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplicationsController } from '../ApplicationsController'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const createMockRes = () => {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

describe('ApplicationsController import workflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('precheck marks duplicate directory and port conflicts', async () => {
    const applicationService = {
      findAll: vi.fn(async () => [
        {
          id: 'app-existing',
          name: 'Existing App',
          directory: 'D:/Projects/existing',
          state: 'stopped',
          techStack: { name: 'vue', category: 'frontend', startCommand: 'npm run dev' },
          network: { primaryPort: 3001, secondaryPorts: [], protocol: 'http' },
          metadata: { createdAt: 1, updatedAt: 1 }
        }
      ])
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [{ port: 3001, reason: 'occupied' }])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const result = await (controller as any).buildImportPrecheck([
      {
        name: ' New App ',
        directory: 'D:\\Projects\\existing',
        tech_stack: 'react',
        frontend_port: 3001
      }
    ])

    expect(result.summary.total).toBe(1)
    expect(result.summary.blocked).toBe(1)
    expect(result.items[0].canImport).toBe(false)
    expect(result.items[0].errors.join(' ')).toContain('目录已存在应用')
    expect(result.items[0].errors.join(' ')).toContain('端口冲突')
  })

  it('precheck blocks backend port outside configured backend range', async () => {
    const applicationService = {
      findAll: vi.fn(async () => [])
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'configManager') {
          return {
            getPortConfig: vi.fn(() => ({
              frontendRange: { start: 3003, end: 3100 },
              backendRange: { start: 8003, end: 8100 }
            }))
          }
        }
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const result = await (controller as any).buildImportPrecheck([
      {
        name: 'Video CMS',
        directory: 'D:/Projects/video-cms',
        tech_stack: 'vue + express',
        frontend_port: 3004,
        backend_port: 3005
      }
    ])

    expect(result.summary.total).toBe(1)
    expect(result.summary.importable).toBe(0)
    expect(result.items[0].canImport).toBe(false)
    expect(result.items[0].errors.join(' ')).toContain('后端端口必须在 8003-8100 范围内')
  })

  it('batch import rolls back created apps when later candidate fails', async () => {
    const createdApps: any[] = []

    const applicationService = {
      findAll: vi.fn(async () => []),
      create: vi
        .fn()
        .mockImplementationOnce(async () => {
          const app = {
            id: 'app-created-1',
            name: 'Created One',
            directory: 'D:/Projects/one',
            state: 'stopped',
            techStack: { name: 'vue', category: 'frontend', startCommand: 'npm run dev' },
            network: { primaryPort: 3010, secondaryPorts: [], protocol: 'http' },
            metadata: { createdAt: 1, updatedAt: 1 }
          }
          createdApps.push(app)
          return app
        })
        .mockImplementationOnce(async () => {
          throw new Error('create failed')
        }),
      delete: vi.fn(async () => {})
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      auth: { userId: 'admin-1', username: 'admin', role: 'admin' },
      body: {
        rollbackOnError: true,
        candidates: [
          {
            name: 'App One',
            directory: 'D:/Projects/one',
            tech_stack: 'vue',
            frontend_port: 3010
          },
          {
            name: 'App Two',
            directory: 'D:/Projects/two',
            tech_stack: 'react',
            frontend_port: 3011
          }
        ]
      },
      method: 'POST',
      path: '/import/batch',
      ip: '127.0.0.1',
      headers: {}
    }
    const res = createMockRes()

    await controller.handleBatchImport(req, res)

    expect(applicationService.create).toHaveBeenCalledTimes(2)
    expect(applicationService.delete).toHaveBeenCalledTimes(1)
    expect(applicationService.delete).toHaveBeenCalledWith('app-created-1')

    const payload = (res.json as any).mock.calls[0][0]
    expect(payload.data.rolledBack).toBe(true)
    expect(payload.data.created).toHaveLength(0)
    expect(payload.data.failed).toHaveLength(1)
  })

  it('create rejects non-existent directory before calling applicationService.create', async () => {
    const applicationService = {
      findAll: vi.fn(async () => []),
      create: vi.fn(async () => ({}))
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      auth: { userId: 'admin-1', username: 'admin', role: 'admin' },
      body: {
        name: 'Missing Directory App',
        directory: `${process.cwd()}/__missing_dir_for_create_validation__`,
        techStack: 'react',
        primaryPort: 3055
      },
      method: 'POST',
      path: '/applications',
      ip: '127.0.0.1',
      headers: {}
    }
    const res = createMockRes()

    await controller.handleCreateApplication(req, res)

    expect(res.status).toHaveBeenCalledWith(422)
    expect(applicationService.create).not.toHaveBeenCalled()
    const payload = (res.json as any).mock.calls[0][0]
    expect(payload.success).toBe(false)
    expect(payload.error.code).toBe('APPLICATION_DIRECTORY_NOT_FOUND')
  })

  it('create rejects fullstack ports outside configured frontend/backend ranges', async () => {
    const applicationService = {
      findAll: vi.fn(async () => []),
      create: vi.fn(async () => ({}))
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'configManager') {
          return {
            getPortConfig: vi.fn(() => ({
              frontendRange: { start: 3003, end: 3100 },
              backendRange: { start: 8003, end: 8100 }
            }))
          }
        }
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      auth: { userId: 'admin-1', username: 'admin', role: 'admin' },
      body: {
        name: 'Video CMS',
        directory: process.cwd(),
        techStack: 'fullstack',
        primaryPort: 3004,
        secondaryPorts: [3005]
      },
      method: 'POST',
      path: '/applications',
      ip: '127.0.0.1',
      headers: {}
    }
    const res = createMockRes()

    await controller.handleCreateApplication(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(applicationService.create).not.toHaveBeenCalled()
    const payload = (res.json as any).mock.calls[0][0]
    expect(payload.success).toBe(false)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toContain('secondaryPorts 必须在后端端口范围 8003-8100 内')
  })

  it('create rejects external-exe when buildScript is missing', async () => {
    const applicationService = {
      findAll: vi.fn(async () => []),
      create: vi.fn(async () => ({}))
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      auth: { userId: 'admin-1', username: 'admin', role: 'admin' },
      body: {
        name: 'External EXE App',
        directory: process.cwd(),
        techStack: 'external-exe',
        primaryPort: 3056
      },
      method: 'POST',
      path: '/applications',
      ip: '127.0.0.1',
      headers: {}
    }
    const res = createMockRes()

    await controller.handleCreateApplication(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(applicationService.create).not.toHaveBeenCalled()
    const payload = (res.json as any).mock.calls[0][0]
    expect(payload.success).toBe(false)
    expect(payload.error.code).toBe('VALIDATION_ERROR')
    expect(payload.error.message).toContain('buildScript is required for external-exe')
  })

  it('create passes normalized buildScript for external-exe', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'external-exe-controller-test-'))
    const exePath = join(tempDir, 'cli-proxy-api.exe')
    writeFileSync(exePath, 'echo test')

    const createdApp = {
      id: 'external-exe-app',
      name: 'CLI Proxy API',
      directory: tempDir,
      state: 'stopped',
      techStack: { name: 'external-exe', category: 'backend', startCommand: exePath },
      network: { primaryPort: 3953, secondaryPorts: [], protocol: 'http' },
      metadata: { createdAt: 1, updatedAt: 1 },
      buildScript: exePath
    }

    const applicationService = {
      findAll: vi.fn(async () => []),
      create: vi.fn(async () => createdApp)
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      auth: { userId: 'admin-1', username: 'admin', role: 'admin' },
      body: {
        name: 'CLI Proxy API',
        directory: tempDir,
        techStack: 'external-exe',
        build_script: exePath,
        primaryPort: 3953
      },
      method: 'POST',
      path: '/applications',
      ip: '127.0.0.1',
      headers: {}
    }
    const res = createMockRes()

    try {
      await controller.handleCreateApplication(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(applicationService.create).toHaveBeenCalledTimes(1)
      const createInput = (applicationService.create as any).mock.calls[0][0]
      expect(String(createInput.buildScript || '')).toMatch(/cli-proxy-api\.exe$/i)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('checkPortConflicts returns wrapped data with hasConflicts and conflicts', async () => {
    const applicationService = {
      findAll: vi.fn(async () => [])
    }

    const serviceContainer = {
      get: vi.fn((name: string) => {
        if (name === 'portManagementService') {
          return {
            checkConflicts: vi.fn(async () => [{ port: 3001, reason: 'occupied' }])
          }
        }
        return null
      })
    }

    const controller = new ApplicationsController(applicationService as any, serviceContainer as any)
    const req: any = {
      body: {
        ports: [3001]
      }
    }
    const res = createMockRes()

    await controller.handleCheckPortConflicts(req, res)

    const payload = (res.json as any).mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(payload.data.hasConflicts).toBe(true)
    expect(Array.isArray(payload.data.conflicts)).toBe(true)
    expect(Array.isArray(payload.conflicts)).toBe(true)
    expect(payload.data.conflicts[0].port).toBe(3001)
  })
})
