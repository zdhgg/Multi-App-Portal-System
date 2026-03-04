/**
 * 测试应用刷新功能修复
 * 验证 refreshAppStatus 方法是否正确使用应用ID而不是转换后的名称
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePortalStore } from '../stores/portal'
import { publicApiService } from '../services/publicApi'

// Mock publicApiService
vi.mock('../services/publicApi', () => ({
  publicApiService: {
    getApp: vi.fn(),
    getPinnedApps: vi.fn()
  }
}))

describe('Portal Store - refreshAppStatus 修复测试', () => {
  let portalStore: ReturnType<typeof usePortalStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    portalStore = usePortalStore()
    vi.clearAllMocks()
  })

  it('应该使用应用ID而不是转换后的名称调用API', async () => {
    // 准备测试数据
    const mockApp = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Training System V3.2',
      techStack: 'vue',
      status: 'online',
      isRunning: true
    }

    const mockApiResponse = {
      success: true,
      data: {
        ...mockApp,
        status: 'offline',
        isRunning: false
      }
    }

    // 设置初始应用列表
    portalStore.apps = [mockApp as any]

    // Mock API 响应
    vi.mocked(publicApiService.getApp).mockResolvedValue(mockApiResponse as any)

    // 执行刷新操作
    await portalStore.refreshAppStatus(mockApp.id)

    // 验证：应该使用UUID格式的应用ID调用API，而不是转换后的名称
    expect(publicApiService.getApp).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    expect(publicApiService.getApp).not.toHaveBeenCalledWith('training-system-v3-2')
  })

  it('应该正确更新应用状态', async () => {
    // 准备测试数据
    const mockApp = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Training System V3.2',
      techStack: 'vue',
      status: 'online',
      isRunning: true
    }

    const updatedAppData = {
      ...mockApp,
      status: 'offline',
      isRunning: false,
      lastUpdated: '2025-08-30T02:10:00.000Z'
    }

    const mockApiResponse = {
      success: true,
      data: updatedAppData
    }

    // 设置初始应用列表
    portalStore.apps = [mockApp as any]

    // Mock API 响应
    vi.mocked(publicApiService.getApp).mockResolvedValue(mockApiResponse as any)

    // 执行刷新操作
    await portalStore.refreshAppStatus(mockApp.id)

    // 验证应用状态已更新
    expect(portalStore.apps[0]).toEqual(expect.objectContaining({
      id: mockApp.id,
      status: 'offline',
      isRunning: false,
      lastUpdated: '2025-08-30T02:10:00.000Z'
    }))
  })

  it('当应用不存在时应该直接返回', async () => {
    // 设置空的应用列表
    portalStore.apps = []

    // 尝试刷新不存在的应用
    await portalStore.refreshAppStatus('non-existent-id')

    // 验证：不应该调用API
    expect(publicApiService.getApp).not.toHaveBeenCalled()
  })

  it('当API调用失败时应该抛出错误', async () => {
    // 准备测试数据
    const mockApp = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Training System V3.2',
      techStack: 'vue',
      status: 'online',
      isRunning: true
    }

    // 设置初始应用列表
    portalStore.apps = [mockApp as any]

    // Mock API 失败响应
    const apiError = new Error('Application not found')
    vi.mocked(publicApiService.getApp).mockRejectedValue(apiError)

    // 验证：应该抛出错误
    await expect(portalStore.refreshAppStatus(mockApp.id)).rejects.toThrow('Application not found')
  })

  it('验证修复前后的行为差异', async () => {
    // 这个测试用于确保我们确实修复了问题
    const mockApp = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Training System V3.2!@#$%^&*()',  // 包含特殊字符的名称
      techStack: 'vue',
      status: 'online',
      isRunning: true
    }

    portalStore.apps = [mockApp as any]

    const mockApiResponse = {
      success: true,
      data: mockApp
    }

    vi.mocked(publicApiService.getApp).mockResolvedValue(mockApiResponse as any)

    await portalStore.refreshAppStatus(mockApp.id)

    // 验证：使用的是原始UUID，不是转换后的名称
    expect(publicApiService.getApp).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
    
    // 确保没有使用转换后的名称（修复前的错误行为）
    expect(publicApiService.getApp).not.toHaveBeenCalledWith('training-system-v3-2')
    expect(publicApiService.getApp).not.toHaveBeenCalledWith('training-system-v3-2-')
  })
})
