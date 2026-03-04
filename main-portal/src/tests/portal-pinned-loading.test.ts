import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePortalStore } from '../stores/portal'
import { publicApiService } from '../services/publicApi'

vi.mock('../services/publicApi', () => ({
  publicApiService: {
    getPinnedApps: vi.fn(),
    getApps: vi.fn(),
    getApp: vi.fn(),
    getSystemHealth: vi.fn(),
    getSystemStats: vi.fn()
  }
}))

describe('Portal Store - pinned loading behavior', () => {
  let portalStore: ReturnType<typeof usePortalStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    portalStore = usePortalStore()
    vi.clearAllMocks()
  })

  it('uses pinned apps when pinned list is not empty', async () => {
    const pinnedApps = [{ id: 'a1', name: 'Pinned A', techStack: 'vue', status: 'online', isRunning: true }]

    vi.mocked(publicApiService.getPinnedApps).mockResolvedValue({
      success: true,
      data: pinnedApps
    } as any)

    vi.mocked(publicApiService.getApps).mockResolvedValue({
      success: true,
      data: { apps: [{ id: 'b1', name: 'All B', techStack: 'react', status: 'offline', isRunning: false }] }
    } as any)

    await portalStore.loadApps()

    expect(portalStore.apps).toEqual(pinnedApps as any)
    expect(publicApiService.getApps).not.toHaveBeenCalled()
  })

  it('falls back to all apps when pinned list is empty', async () => {
    const allApps = [{ id: 'b1', name: 'All B', techStack: 'react', status: 'offline', isRunning: false }]

    vi.mocked(publicApiService.getPinnedApps).mockResolvedValue({
      success: true,
      data: []
    } as any)

    vi.mocked(publicApiService.getApps).mockResolvedValue({
      success: true,
      data: { apps: allApps }
    } as any)

    await portalStore.loadApps()

    expect(publicApiService.getApps).toHaveBeenCalledTimes(1)
    expect(portalStore.apps).toEqual(allApps as any)
  })
})
