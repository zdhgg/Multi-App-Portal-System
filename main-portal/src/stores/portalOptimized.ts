/**
 * 前端状态管理增量更新
 * 
 * 优化 Portal Store，支持增量更新和智能加载
 */

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
  const appsMap = ref(new Map<string, App>()) // 新增：应用映射表
  const systemStatus = ref<SystemStatus | null>(null)
  const loading = ref(false)
  const lastUpdateTime = ref(new Date())

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

  /**
   * 增量更新单个应用状态
   */
  const updateAppIncremental = (appId: string, updates: Partial<App>) => {
    const index = apps.value.findIndex(a => a.id === appId)
    
    if (index !== -1) {
      // 使用 Object.assign 保持响应性
      Object.assign(apps.value[index], updates)
      appsMap.value.set(appId, apps.value[index])
      lastUpdateTime.value = new Date()
      
      console.debug('App updated incrementally', { appId, updates })
    }
  }
  
  /**
   * 批量增量更新
   */
  const batchUpdateApps = (updates: Array<{ id: string; data: Partial<App> }>) => {
    const updatedIds = new Set<string>()
    
    updates.forEach(({ id, data }) => {
      const index = apps.value.findIndex(a => a.id === id)
      
      if (index !== -1) {
        Object.assign(apps.value[index], data)
        appsMap.value.set(id, apps.value[index])
        updatedIds.add(id)
      }
    })
    
    if (updatedIds.size > 0) {
      lastUpdateTime.value = new Date()
      console.debug('Batch update completed', { count: updatedIds.size })
    }
  }
  
  /**
   * 智能加载应用（只加载变化的）
   */
  const smartLoadApps = async () => {
    loading.value = true
    
    try {
      const response = await publicApiService.getPinnedApps()
      
      if (response.success) {
        const newApps = response.data || []
        
        if (newApps.length === 0) {
          // 降级到完整列表
          const fallback = await publicApiService.getApps()
          if ((fallback as any)?.success === true) {
            const data: any = (fallback as any).data
            const list = Array.isArray(data?.apps) ? data.apps : []
            apps.value = list
            
            // 更新映射表
            appsMap.value.clear()
            list.forEach((app: App) => appsMap.value.set(app.id, app))
            
            lastUpdateTime.value = new Date()
            return { apps: list }
          }
        }

        // 计算差异
        const oldIds = new Set(apps.value.map(a => a.id))
        const newIds = new Set(newApps.map((a: App) => a.id))
        
        // 找出新增、删除、更新的应用
        const added = newApps.filter((a: App) => !oldIds.has(a.id))
        const removed = apps.value.filter(a => !newIds.has(a.id))
        const existing = newApps.filter((a: App) => oldIds.has(a.id))
        
        // 应用变更
        if (removed.length > 0) {
          apps.value = apps.value.filter(a => newIds.has(a.id))
          removed.forEach(a => appsMap.value.delete(a.id))
          console.debug('Apps removed', { count: removed.length })
        }
        
        if (added.length > 0) {
          apps.value.push(...added)
          added.forEach((a: App) => appsMap.value.set(a.id, a))
          console.debug('Apps added', { count: added.length })
        }
        
        // 更新现有应用（只更新变化的字段）
        let updatedCount = 0
        existing.forEach((newApp: App) => {
          const index = apps.value.findIndex(a => a.id === newApp.id)
          if (index !== -1) {
            const oldApp = apps.value[index]
            // 简单比较：如果 JSON 不同则更新
            if (JSON.stringify(oldApp) !== JSON.stringify(newApp)) {
              Object.assign(apps.value[index], newApp)
              appsMap.value.set(newApp.id, apps.value[index])
              updatedCount++
            }
          }
        })
        
        if (updatedCount > 0) {
          console.debug('Apps updated', { count: updatedCount })
        }
        
        lastUpdateTime.value = new Date()
        
        console.info('Smart load completed', {
          added: added.length,
          removed: removed.length,
          updated: updatedCount,
          total: apps.value.length
        })
        
        return { apps: apps.value }
      } else {
        throw new Error(response.message || '获取固定应用列表失败')
      }
    } catch (error) {
      console.error('Smart load failed', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  // 动作
  const loadApps = async () => {
    loading.value = true
    try {
      const response = await publicApiService.getPinnedApps()
      
      if (response.success) {
        const pinnedApps = response.data || []
        if (pinnedApps.length === 0) {
          const fallback = await publicApiService.getApps()
          if ((fallback as any)?.success === true) {
            const data: any = (fallback as any).data
            const list = Array.isArray(data?.apps) ? data.apps : []
            apps.value = list
            
            // 更新映射表
            appsMap.value.clear()
            list.forEach((app: App) => appsMap.value.set(app.id, app))
            
            lastUpdateTime.value = new Date()
            return { apps: list }
          }
        }

        apps.value = pinnedApps
        
        // 更新映射表
        appsMap.value.clear()
        pinnedApps.forEach((app: App) => appsMap.value.set(app.id, app))
        
        lastUpdateTime.value = new Date()
        return { apps: pinnedApps }
      } else {
        throw new Error(response.message || '获取固定应用列表失败')
      }
    } catch (error) {
      console.warn('加载固定应用失败，降级到完整应用列表:', error)
      try {
        const fallback = await publicApiService.getApps()
        if ((fallback as any)?.success === true) {
          const data: any = (fallback as any).data
          const list = Array.isArray(data?.apps) ? data.apps : []
          apps.value = list
          
          // 更新映射表
          appsMap.value.clear()
          list.forEach((app: App) => appsMap.value.set(app.id, app))
          
          lastUpdateTime.value = new Date()
          return { apps: list }
        }
      } catch (e) {
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
      const response = await publicApiService.getSystemHealth()
      
      if (response.success) {
        systemStatus.value = response.data as SystemStatus | null
        return response.data
      } else {
        throw new Error(response.message || '获取系统状态失败')
      }
    } catch (error) {
      console.error('加载系统状态失败:', error)
      throw error
    }
  }

  const loadStats = async () => {
    try {
      const response = await publicApiService.getSystemStats()
      
      if (response.success) {
        return response.data
      } else {
        throw new Error(response.message || '获取统计信息失败')
      }
    } catch (error) {
      console.error('加载统计信息失败:', error)
      throw error
    }
  }

  const refreshAppStatus = async (appId: string) => {
    try {
      const app = apps.value.find(a => a.id === appId)
      if (!app) return

      const response = await publicApiService.getApp(app.id)

      if (response.success) {
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
    const updates = appsData.map(app => ({
      id: app.id,
      data: app
    }))
    batchUpdateApps(updates)
  }

  const getAppById = (id: string) => {
    // 优先从映射表获取
    return appsMap.value.get(id) || apps.value.find(app => app.id === id)
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

  const getTechStacks = computed(() => {
    const stacks = new Set(apps.value.map(app => app.techStack))
    return Array.from(stacks).sort()
  })

  const getAppUrl = (app: App) => getAppAccessUrl(app)
  const checkAppAccessible = (app: App) => isAppAccessible(app)

  const reset = () => {
    apps.value = []
    appsMap.value.clear()
    systemStatus.value = null
    loading.value = false
    lastUpdateTime.value = new Date()
  }

  return {
    // 状态
    apps,
    systemStatus,
    loading,
    lastUpdateTime,
    
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
