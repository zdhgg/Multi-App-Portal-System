import { describe, it, expect, vi } from 'vitest'
import { PublicController } from '../PublicController'

const createMockReq = () => ({
  get: vi.fn((header: string) => {
    if (header === 'host') return 'localhost:3000'
    return undefined
  })
})

describe('PublicController uptime mapping', () => {
  it('uses process manager start time for directly managed running apps', async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000)
    const processManager = {
      getRunningProcesses: vi.fn(() => new Map([
        ['app-dev', { startedAt }]
      ]))
    }

    const controller = new PublicController({} as any, undefined, processManager as any)
    const publicApp = await (controller as any).toPublicApp({
      id: 'app-dev',
      name: 'NovelOS',
      directory: 'D:/Apps/novelos',
      state: 'running',
      deploymentMode: 'development',
      techStack: { name: 'vue' },
      network: { primaryPort: 3010, secondaryPorts: [], protocol: 'http' },
      metadata: { createdAt: 1, updatedAt: 1 }
    }, createMockReq())

    expect(publicApp.isRunning).toBe(true)
    expect(publicApp.uptime).toBeGreaterThanOrEqual(299000)
    expect(publicApp.uptime).toBeLessThanOrEqual(301000)
  })

  it('converts PM2 start timestamp into elapsed uptime for production apps', async () => {
    const pm2StartedAt = Date.now() - 15 * 60 * 1000
    const pm2Service = {
      getProcessList: vi.fn(async () => [
        {
          name: 'educore',
          pm_id: 1,
          status: 'online',
          cpu: 0,
          memory: 0,
          uptime: pm2StartedAt,
          restarts: 0
        }
      ])
    }

    const controller = new PublicController({} as any, pm2Service as any)
    const publicApp = await (controller as any).toPublicApp({
      id: 'app-pm2',
      name: 'educore',
      directory: 'D:/Apps/educore',
      state: 'running',
      deploymentMode: 'production',
      pm2ProcessName: 'educore',
      techStack: { name: 'nodejs' },
      network: { primaryPort: 3003, secondaryPorts: [], protocol: 'http' },
      metadata: { createdAt: 1, updatedAt: 1 }
    }, createMockReq())

    expect(publicApp.isRunning).toBe(true)
    expect(publicApp.uptime).toBeGreaterThanOrEqual(899000)
    expect(publicApp.uptime).toBeLessThanOrEqual(901000)
  })
})
