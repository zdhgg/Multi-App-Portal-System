/**
 * WebSocket 实时同步
 * 
 * 支持增量更新和批量状态同步
 */

import { useWebSocket } from './useWebSocket'
import { usePortalStore } from '@/stores/portal'

export function useRealtimeSync() {
  const portalStore = usePortalStore()
  const { connect, on, off, isConnected } = useWebSocket()
  
  /**
   * 启动实时同步
   */
  const startSync = () => {
    if (!isConnected.value) {
      connect()
    }
    
    // 监听应用状态变化
    on('app:status:changed', (data: any) => {
      console.debug('App status changed', data)
      
      if (typeof portalStore.updateAppIncremental === 'function') {
        portalStore.updateAppIncremental(data.appId, {
          status: data.status,
          isRunning: data.isRunning
        })
      } else {
        // 降级到旧方法
        portalStore.updateAppStatus(data)
      }
    })
    
    // 监听批量状态更新
    on('apps:status:batch', (data: any) => {
      console.debug('Batch status update', { count: data.apps?.length })
      
      if (typeof portalStore.batchUpdateApps === 'function') {
        const updates = data.apps.map((app: any) => ({
          id: app.id,
          data: {
            status: app.status,
            isRunning: app.isRunning
          }
        }))
        
        portalStore.batchUpdateApps(updates)
      } else {
        // 降级到旧方法
        portalStore.updateAppsStatus(data.apps)
      }
    })
    
    // 监听应用添加
    on('app:added', (data: any) => {
      console.debug('App added', data)
      
      // 智能加载（只加载变化的）
      if (typeof portalStore.smartLoadApps === 'function') {
        portalStore.smartLoadApps()
      } else {
        portalStore.loadApps()
      }
    })
    
    // 监听应用删除
    on('app:deleted', (data: any) => {
      console.debug('App deleted', data)
      
      // 从列表中移除
      const apps = portalStore.apps.filter((a: any) => a.id !== data.appId)
      portalStore.apps = apps
    })
    
    // 监听应用更新
    on('app:updated', (data: any) => {
      console.debug('App updated', data)
      
      if (typeof portalStore.updateAppIncremental === 'function') {
        portalStore.updateAppIncremental(data.appId, data.updates)
      } else {
        portalStore.refreshAppStatus(data.appId)
      }
    })
    
    console.info('Real-time sync started')
  }
  
  /**
   * 停止实时同步
   */
  const stopSync = () => {
    off('app:status:changed')
    off('apps:status:batch')
    off('app:added')
    off('app:deleted')
    off('app:updated')
    
    console.info('Real-time sync stopped')
  }
  
  /**
   * 重新连接
   */
  const reconnect = () => {
    stopSync()
    connect()
    startSync()
  }
  
  return {
    startSync,
    stopSync,
    reconnect,
    isConnected
  }
}
