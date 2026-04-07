import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilesystemController } from '../FilesystemController'

const createRequest = (): Request =>
  ({
    ip: '127.0.0.1',
    headers: {
      'user-agent': 'vitest'
    }
  }) as Request

const createResponse = () => {
  const status = vi.fn().mockReturnThis()
  const json = vi.fn().mockReturnThis()

  return {
    status,
    json
  } as unknown as Response
}

describe('FilesystemController', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the default browse directory when it is accessible', async () => {
    const controller = new FilesystemController()
    const req = createRequest()
    const res = createResponse()

    vi.spyOn(controller as never, 'getDefaultBrowsePath' as never).mockReturnValue('D:\\My Programs')
    vi.spyOn(controller as never, 'evaluatePathState' as never).mockResolvedValue({
      normalizedPath: 'D:\\My Programs',
      exists: true,
      isDirectory: true,
      isFile: false,
      accessible: true,
      policyAllowed: true
    })

    await controller.getHomeDirectory(req, res)

    expect((res as any).status).not.toHaveBeenCalled()
    expect((res as any).json).toHaveBeenCalledWith({
      success: true,
      data: {
        path: 'D:\\My Programs',
        name: 'My Programs'
      }
    })
  })

  it('rejects the default browse directory when it exists but is not readable', async () => {
    const controller = new FilesystemController()
    const req = createRequest()
    const res = createResponse()

    vi.spyOn(controller as never, 'getDefaultBrowsePath' as never).mockReturnValue('D:\\Restricted')
    vi.spyOn(controller as never, 'evaluatePathState' as never).mockResolvedValue({
      normalizedPath: 'D:\\Restricted',
      exists: true,
      isDirectory: true,
      isFile: false,
      accessible: false,
      policyAllowed: true
    })

    await controller.getHomeDirectory(req, res)

    expect((res as any).status).toHaveBeenCalledWith(403)
    expect((res as any).json).toHaveBeenCalledWith({
      success: false,
      error: '默认目录不可访问'
    })
  })
})
