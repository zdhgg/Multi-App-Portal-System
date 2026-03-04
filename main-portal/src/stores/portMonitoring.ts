/**
 * 端口监控状态管理 - 统一的状态管理方案
 * 
 * 优化版本：作为端口管理页面的唯一数据源
 * - 统一管理端口统计数据
 * - 统一管理占用端口列表
 * - 提供缓存机制（30秒 TTL）
 * - 消除父子组件间的数据同步问题
 */
import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { portManagementApiService } from '@/services/portManagementApi'

export interface PortStatus {
  port: number
  status: 'listening' | 'allocated' | 'closed' | 'error'
  process?: {
    name: string
    pid: number
    user?: string
  }
  application?: {
    id: string
    name: string
    type: string
  }
  performance: {
    responseTime: number
    lastCheck: Date
  }
  security?: {
    riskLevel: 'low' | 'medium' | 'high'
    issues: string[]
  }
}

export interface PortStatistics {
  total: number
  occupied: number
  available: number
  conflicts: number
  byType: Record<string, number>
  byStatus: Record<string, number>
}

export interface ScanProgress {
  current: number
  total: number
  percentage: number
  estimatedTimeRemaining: number
  currentRange: string
}

// 缓存配置
const CACHE_TTL = 30000 // 30秒缓存

export const usePortMonitoringStore = defineStore('portMonitoring', () => {
  // ==================== 核心统计数据（页面顶部显示） ====================
  const quickStats = reactive({
    total: 0,
    occupied: 0,
    available: 0,
    conflicts: 0
  })
  
  // 缓存管理
  const cache = reactive({
    statsTimestamp: 0,
    portsTimestamp: 0,
    isValid: (type: 'stats' | 'ports') => {
      const timestamp = type === 'stats' ? cache.statsTimestamp : cache.portsTimestamp
      return timestamp > 0 && (Date.now() - timestamp) < CACHE_TTL
    },
    invalidate: (type?: 'stats' | 'ports') => {
      if (!type || type === 'stats') cache.statsTimestamp = 0
      if (!type || type === 'ports') cache.portsTimestamp = 0
    }
  })

  // 核心状态
  const ports = ref<Map<number, PortStatus>>(new Map())
  const statistics = ref<PortStatistics>({
    total: 0,
    occupied: 0,
    available: 0,
    conflicts: 0,
    byType: {},
    byStatus: {}
  })
  
  // 占用端口列表（用于表格显示）
  const occupiedPortsList = ref<Array<{
    port: number
    process: string
    pid: number
    status: string
    appId?: string
    appName?: string
    portType?: string
  }>>([])
  
  // 扫描状态
  const scanProgress = ref<ScanProgress | null>(null)
  const isScanning = ref(false)
  const lastScanTime = ref<Date | null>(null)
  const scanHistory = ref<Array<{
    timestamp: Date
    duration: number
    portsFound: number
    strategy: string
  }>>([])

  // 加载状态
  const loadingStates = reactive({
    refresh: false,
    stats: false,
    scan: false,
    cleanup: false,
    release: new Map<number, boolean>()
  })

  // 错误状态
  const errors = ref<Array<{
    id: string
    type: 'scan' | 'api' | 'network'
    message: string
    timestamp: Date
    details?: any
  }>>([])

  // 计算属性
  const activePorts = computed(() => 
    Array.from(ports.value.values()).filter(p => 
      p.status === 'listening' || p.status === 'allocated'
    )
  )

  const conflictPorts = computed(() =>
    Array.from(ports.value.values()).filter(p => 
      p.security?.riskLevel === 'high' || p.status === 'error'
    )
  )

  const portsByType = computed(() => {
    const result: Record<string, PortStatus[]> = {}
    activePorts.value.forEach(port => {
      const type = port.application?.type || 'unknown'
      if (!result[type]) result[type] = []
      result[type].push(port)
    })
    return result
  })
  
  // ==================== 统一的数据获取方法 ====================
  
  /**
   * 获取端口统计数据（带缓存）
   * 这是页面顶部统计卡片的数据源
   */
  const fetchStatistics = async (force = false): Promise<void> => {
    // 检查缓存
    if (!force && cache.isValid('stats')) {
      console.log('📦 使用缓存的统计数据')
      return
    }
    
    loadingStates.stats = true
    
    try {
      const result = await portManagementApiService.getPortStatistics()
      
      if (result.success && result.data) {
        const data = result.data
        
        // 更新快速统计
        quickStats.total = Number(data.total) || 0
        quickStats.occupied = Number(data.totalAllocated ?? data.allocated ?? 0)
        quickStats.available = Number(data.available) || Math.max(0, quickStats.total - quickStats.occupied)
        quickStats.conflicts = Number(data.conflicts || 0)
        
        // 更新详细统计
        statistics.value = {
          total: quickStats.total,
          occupied: quickStats.occupied,
          available: quickStats.available,
          conflicts: quickStats.conflicts,
          byType: data.byType || {},
          byStatus: data.byStatus || {}
        }
        
        // 更新缓存时间戳
        cache.statsTimestamp = Date.now()
        
        console.log('📊 统计数据已更新:', quickStats)
      }
    } catch (error) {
      console.error('获取统计数据失败:', error)
      addError('api', '获取统计数据失败', error)
    } finally {
      loadingStates.stats = false
    }
  }
  
  /**
   * 刷新所有数据（统计 + 端口列表）
   */
  const refreshAll = async (force = true): Promise<void> => {
    loadingStates.refresh = true
    
    try {
      // 强制刷新时清除缓存
      if (force) {
        cache.invalidate()
      }
      
      // 并行获取统计数据和端口列表
      await Promise.all([
        fetchStatistics(force),
        fetchOccupiedPorts(force)
      ])
      
      lastScanTime.value = new Date()
    } catch (error) {
      console.error('刷新数据失败:', error)
      addError('api', '刷新数据失败', error)
    } finally {
      loadingStates.refresh = false
    }
  }
  
  /**
   * 获取占用端口列表
   */
  const fetchOccupiedPorts = async (force = false): Promise<void> => {
    if (!force && cache.isValid('ports')) {
      console.log('📦 使用缓存的端口列表')
      return
    }
    
    try {
      // 尝试从后台扫描服务获取数据
      const bgResult = await portManagementApiService.getBackgroundScanStatus()
      
      if (bgResult.success && bgResult.data?.activePorts) {
        const activePorts = bgResult.data.activePorts
        
        occupiedPortsList.value = activePorts.map((port: any) => ({
          port: port.port,
          process: port.process?.name || '未知进程',
          pid: port.process?.pid || 0,
          status: port.status || 'listening',
          appId: port.appId,
          appName: port.appName,
          portType: port.portType
        }))
        
        cache.portsTimestamp = Date.now()
        console.log('📋 端口列表已更新:', occupiedPortsList.value.length, '个端口')
      }
    } catch (error) {
      console.error('获取端口列表失败:', error)
    }
  }

  // 智能刷新方法（简化版）
  const smartRefresh = async (options: {
    force?: boolean
    strategy?: 'full' | 'incremental' | 'targeted'
  } = {}) => {
    const { force = false } = options
    
    if (isScanning.value && !force) {
      console.log('⏸️ 扫描正在进行中，跳过')
      return
    }

    // 直接调用统一的刷新方法
    await refreshAll(force)
  }

  // 监控扫描进度
  const monitorScanProgress = async (taskId: string) => {
    const pollInterval = 1000 // 1秒轮询一次
    
    while (true) {
      try {
        const statusResult = await portManagementApiService.getScanTaskStatus(taskId)
        
        if (statusResult.success && statusResult.data) {
          const task = statusResult.data
          
          // 更新进度
          scanProgress.value = {
            current: task.progress.current,
            total: task.progress.total,
            percentage: task.progress.percentage,
            estimatedTimeRemaining: calculateETA(task),
            currentRange: `${task.config.startPort}-${task.config.endPort}`
          }

          if (task.status === 'completed') {
            // 获取扫描结果
            const resultsResponse = await portManagementApiService.getScanResults(taskId)
            if (resultsResponse.success && resultsResponse.data) {
              updatePortsFromScanResults(resultsResponse.data)
            }
            break
          } else if (task.status === 'failed') {
            throw new Error(task.error || '扫描任务失败')
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      } catch (error) {
        addError('scan', '监控扫描进度失败', error)
        break
      }
    }
    
    scanProgress.value = null
  }

  // 更新端口数据
  const updatePortsFromScanResults = (results: any[]) => {
    const newPorts = new Map<number, PortStatus>()
    
    results.forEach(result => {
      const portStatus: PortStatus = {
        port: result.port,
        status: mapStatus(result.status),
        process: result.process,
        application: result.application,
        performance: {
          responseTime: result.performance?.responseTime || 0,
          lastCheck: new Date()
        },
        security: result.security
      }
      
      newPorts.set(result.port, portStatus)
    })
    
    ports.value = newPorts
    
    // 记录扫描历史
    scanHistory.value.push({
      timestamp: new Date(),
      duration: 0, // 将在实际实现中计算
      portsFound: results.length,
      strategy: 'smart'
    })
  }

  // 更新统计信息（使用统一方法）
  const updateStatistics = async () => {
    await fetchStatistics(true)
  }

  // 强制释放端口（增强安全性）
  const forceReleasePort = async (port: number, options: {
    reason?: string
    confirmationToken?: string
    bypassSafetyCheck?: boolean
  } = {}) => {
    if (loadingStates.release.get(port)) {
      throw new Error(`端口 ${port} 正在释放中`)
    }

    loadingStates.release.set(port, true)
    
    try {
      // 安全检查
      const portInfo = ports.value.get(port)
      if (portInfo?.security?.riskLevel === 'high' && !options.bypassSafetyCheck) {
        throw new Error('高风险端口需要额外确认')
      }

      const releaseResult = await portManagementApiService.releasePort(port, true)
      
      if (releaseResult.success) {
        // 从本地状态中移除
        ports.value.delete(port)
        
        // 更新统计
        await updateStatistics()
        
        // 记录操作日志
        console.log(`端口 ${port} 已强制释放`, {
          reason: options.reason,
          timestamp: new Date(),
          user: 'current-user' // 实际实现中获取当前用户
        })
      }
      
      return releaseResult
    } finally {
      loadingStates.release.set(port, false)
    }
  }

  // 错误管理
  const addError = (type: 'scan' | 'api' | 'network', message: string, details?: any) => {
    errors.value.push({
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: new Date(),
      details
    })
    
    // 保持错误列表不超过50条
    if (errors.value.length > 50) {
      errors.value = errors.value.slice(-50)
    }
  }

  const clearErrors = () => {
    errors.value = []
  }

  // 工具方法
  const mapStatus = (backendStatus: string): PortStatus['status'] => {
    const statusMap: Record<string, PortStatus['status']> = {
      'listening': 'listening',
      'allocated': 'allocated',
      'occupied': 'listening',
      'available': 'closed',
      'closed': 'closed',
      'error': 'error'
    }
    return statusMap[backendStatus] || 'closed'
  }

  const calculateETA = (task: any): number => {
    if (!task.startTime || task.progress.percentage === 0) return 0
    
    const elapsed = Date.now() - new Date(task.startTime).getTime()
    const remaining = (elapsed / task.progress.percentage) * (100 - task.progress.percentage)
    return Math.round(remaining / 1000) // 返回秒数
  }

  return {
    // 核心统计数据（页面顶部显示）
    quickStats,
    
    // 占用端口列表
    occupiedPortsList,
    
    // 缓存管理
    cache,
    
    // 状态
    ports,
    statistics,
    scanProgress,
    isScanning,
    lastScanTime,
    scanHistory,
    loadingStates,
    errors,
    
    // 计算属性
    activePorts,
    conflictPorts,
    portsByType,
    
    // 统一的数据获取方法
    fetchStatistics,
    fetchOccupiedPorts,
    refreshAll,
    
    // 其他方法
    smartRefresh,
    forceReleasePort,
    updateStatistics,
    addError,
    clearErrors
  }
})
