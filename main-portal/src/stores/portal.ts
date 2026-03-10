import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { publicApiService } from '@/services/publicApi'
import type { App } from '@/types/app'
import { getAppAccessUrl, isAppAccessible } from '@/types/app'

interface SystemStatus {
  status: 'healthy' | 'warning' | 'unhealthy'
  timestamp: string
  services: {
    database: boolean
    appManager: boolean
    proxyService: boolean
  }
  apps: {
    total: number
    online: number
    running: number
    offline: number
  }
  uptime: number
  memory: {
    used: number
    total: number
  }
}

export const usePortalStore = defineStore('portal', () => {
  // 状态
  const apps = ref<App[]>([])
  const systemStatus = ref<SystemStatus | null>(null)
  const loading = ref(false)
  const lastUpdateTime = ref(new Date())
  const guestAccessRestricted = ref(false)

  const applyGuestRestrictedState = () => {
    guestAccessRestricted.value = true
    apps.value = []
    systemStatus.value = null
    lastUpdateTime.value = new Date()
  }

  const clearGuestRestrictedState = () => {
    guestAccessRestricted.value = false
  }

  // 计算属性
  const stats = computed(() => {
    const total = apps.value.length
    const running = apps.value.filter(app => app.isRunning).length
    const online = apps.value.filter(app => app.status === 'online').length
    const offline = total - online

    return {
      total,
      running,
      online,
      offline
    }
  })

  const runningApps = computed(() => {
    return apps.value.filter(app => app.isRunning)
  })

  const offlineApps = computed(() => {
    return apps.value.filter(app => !app.isRunning)
  })

  // 动作
  const loadApps = async () => {
    loading.value = true
    try {
      if (!publicApiService.canCurrentUserAccessPublicApi()) {
        applyGuestRestrictedState()
        return { apps: [] }
      }

      clearGuestRestrictedState()

      // 改为获取固定到首页的应用
      const response = await publicApiService.getPinnedApps()
      
      if (response.success) {
        const pinnedApps = response.data || []
        if (pinnedApps.length === 0) {
          // 当管理员尚未配置固定应用时，降级展示全部应用，避免门户空白
          const fallback = await publicApiService.getApps()
          if ((fallback as any)?.success === true) {
            const data: any = (fallback as any).data
            const list = Array.isArray(data?.apps) ? data.apps : []
            apps.value = list
            lastUpdateTime.value = new Date()
            return { apps: list }
          }
        }

        apps.value = pinnedApps
        lastUpdateTime.value = new Date()
        return { apps: pinnedApps }
      } else {
        throw new Error(response.message || '获取固定应用列表失败')
      }
    } catch (error) {
      if (publicApiService.isGuestAccessDenied(error)) {
        applyGuestRestrictedState()
        return { apps: [] }
      }

      // 固定应用接口失败，尝试降级到完整列表接口
      console.warn('加载固定应用失败，降级到完整应用列表:', error)
      try {
        const fallback = await publicApiService.getApps()
        if ((fallback as any)?.success === true) {
          const data: any = (fallback as any).data
          const list = Array.isArray(data?.apps) ? data.apps : []
          apps.value = list
          lastUpdateTime.value = new Date()
          return { apps: list }
        }
      } catch (e) {
        if (publicApiService.isGuestAccessDenied(e)) {
          applyGuestRestrictedState()
          return { apps: [] }
        }

        console.error('降级加载完整应用失败:', e)
        throw e
      }
      return { apps: apps.value }
    } finally {
      loading.value = false
    }
  }

  const loadSystemStatus = async () => {
    try {
      if (!publicApiService.canCurrentUserAccessPublicApi()) {
        applyGuestRestrictedState()
        return null
      }

      const response = await publicApiService.getSystemHealth()
      
      if (response.success) {
        clearGuestRestrictedState()
        systemStatus.value = response.data as SystemStatus | null
        return response.data
      } else {
        throw new Error(response.message || '获取系统状态失败')
      }
    } catch (error) {
      if (publicApiService.isGuestAccessDenied(error)) {
        applyGuestRestrictedState()
        return null
      }

      console.error('加载系统状态失败:', error)
      throw error
    }
  }

  const loadStats = async () => {
    try {
      if (!publicApiService.canCurrentUserAccessPublicApi()) {
        applyGuestRestrictedState()
        return null
      }

      const response = await publicApiService.getSystemStats()
      
      if (response.success) {
        clearGuestRestrictedState()
        return response.data
      } else {
        throw new Error(response.message || '获取统计信息失败')
      }
    } catch (error) {
      if (publicApiService.isGuestAccessDenied(error)) {
        applyGuestRestrictedState()
        return null
      }

      console.error('加载统计信息失败:', error)
      throw error
    }
  }

  const updateAppIncremental = (appId: string, updates: Partial<App>) => {
    const index = apps.value.findIndex(app => app.id === appId)
    if (index === -1) {
      return
    }

    apps.value[index] = { ...apps.value[index], ...updates }
    lastUpdateTime.value = new Date()
  }

  const batchUpdateApps = (updates: Array<{ id: string; data: Partial<App> }>) => {
    let hasUpdates = false

    updates.forEach(({ id, data }) => {
      const index = apps.value.findIndex(app => app.id === id)
      if (index === -1) {
        return
      }

      apps.value[index] = { ...apps.value[index], ...data }
      hasUpdates = true
    })

    if (hasUpdates) {
      lastUpdateTime.value = new Date()
    }
  }

  const smartLoadApps = async () => {
    return loadApps()
  }

  const refreshAppStatus = async (appId: string) => {
    try {
      // 刷新特定应用状态
      const app = apps.value.find(a => a.id === appId)
      if (!app) return

      // ✅ 修复：直接使用应用ID而不是转换名称
      const response = await publicApiService.getApp(app.id)

      if (response.success && response.data) {
        updateAppIncremental(appId, response.data)
      }
    } catch (error) {
      console.error('刷新应用状态失败:', error)
      throw error
    }
  }

  const updateAppStatus = (appData: any) => {
    updateAppIncremental(appData.appId, appData)
  }

  const updateAppsStatus = (appsData: any[]) => {
    const updates = appsData.map(appData => ({
      id: appData.id,
      data: appData
    }))
    batchUpdateApps(updates)
  }

  const getAppById = (id: string) => {
    return apps.value.find(app => app.id === id)
  }

  const getAppByName = (name: string) => {
    return apps.value.find(app => 
      app.name.toLowerCase() === name.toLowerCase() ||
      app.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-') === name
    )
  }

  const searchApps = (query: string) => {
    if (!query) return apps.value
    
    const lowerQuery = query.toLowerCase()
    return apps.value.filter(app =>
      app.name.toLowerCase().includes(lowerQuery) ||
      app.description?.toLowerCase().includes(lowerQuery) ||
      app.techStack.toLowerCase().includes(lowerQuery)
    )
  }

  const filterAppsByStatus = (status: 'all' | 'running' | 'offline' | 'online') => {
    switch (status) {
      case 'running':
        return apps.value.filter(app => app.isRunning)
      case 'offline':
        return apps.value.filter(app => !app.isRunning)
      case 'online':
        return apps.value.filter(app => app.status === 'online')
      default:
        return apps.value
    }
  }

  const filterAppsByTechStack = (techStack: string) => {
    if (!techStack) return apps.value
    return apps.value.filter(app => app.techStack === techStack)
  }

  // 获取技术栈列表
  const getTechStacks = computed(() => {
    const stacks = new Set(apps.value.map(app => app.techStack))
    return Array.from(stacks).sort()
  })

  // 获取应用访问URL - 使用统一工具函数
  const getAppUrl = (app: App) => getAppAccessUrl(app)

  // 检查应用是否可访问 - 使用统一工具函数  
  const checkAppAccessible = (app: App) => isAppAccessible(app)

  // 重置状态
  const reset = () => {
    apps.value = []
    systemStatus.value = null
    loading.value = false
    lastUpdateTime.value = new Date()
    guestAccessRestricted.value = false
  }

  return {
    // 状态
    apps,
    systemStatus,
    loading,
    lastUpdateTime,
    guestAccessRestricted,
    
    // 计算属性
    stats,
    runningApps,
    offlineApps,
    getTechStacks,
    
    // 动作
    loadApps,
    smartLoadApps,
    loadSystemStatus,
    loadStats,
    refreshAppStatus,
    updateAppStatus,
    updateAppsStatus,
    updateAppIncremental,
    batchUpdateApps,
    getAppById,
    getAppByName,
    searchApps,
    filterAppsByStatus,
    filterAppsByTechStack,
    getAppUrl,
    checkAppAccessible,
    reset
  }
})
