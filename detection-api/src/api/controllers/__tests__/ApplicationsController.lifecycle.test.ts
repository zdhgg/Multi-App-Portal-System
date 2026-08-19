import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsController } from '../ApplicationsController'
import { auditLogService } from '../../../services/auditLogService'

const createMockRes = () => {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('ApplicationsController lifecycle operations', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(auditLogService, 'log').mockResolvedValue(undefined as never)
  })

  it('accepts a slow start immediately and exposes its eventual status', async () => {
    let releaseStart!: () => void
    const startGate = new Promise<void>(resolve => {
      releaseStart = resolve
    })
    const app = {
      id: 'app-slow',
      name: 'Slow App',
      state: 'stopped',
      network: { primaryPort: 3006, secondaryPorts: [8006], protocol: 'http' }
    }
    const applicationService = {
      findById: vi.fn(async () => ({ ...app })),
      findAll: vi.fn(async () => [{ ...app }]),
      start: vi.fn(async () => {
        await startGate
        app.state = 'running'
      })
    }
    const controller = new ApplicationsController(applicationService as any, null as any)
    const req: any = {
      params: { id: app.id },
      method: 'PUT',
      path: `/${app.id}/start`,
      headers: {},
      get: (name: string) => name.toLowerCase() === 'host' ? 'localhost:8002' : undefined
    }
    const res = createMockRes()

    await controller.handleStartApplication(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    const accepted = res.json.mock.calls[0][0]
    expect(accepted.success).toBe(true)
    expect(['queued', 'running']).toContain(accepted.data.status)

    const listRes = createMockRes()
    await controller.handleGetApplications({ query: {} } as any, listRes)
    expect(listRes.json.mock.calls[0][0].data[0].lifecycleOperation.id).toBe(accepted.data.id)

    const duplicateRes = createMockRes()
    await controller.handleStartApplication(req, duplicateRes)
    expect(duplicateRes.json.mock.calls[0][0].data.id).toBe(accepted.data.id)
    expect(duplicateRes.json.mock.calls[0][0].data.reused).toBe(true)
    expect(applicationService.start).toHaveBeenCalledTimes(1)

    releaseStart()
    await vi.waitFor(() => {
      const operation = (controller as any).lifecycleOperationService.get(accepted.data.id)
      expect(operation?.status).toBe('succeeded')
    })
  })
})
