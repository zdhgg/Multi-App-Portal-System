import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 端口配置接口
 */
interface PortConfiguration {
  frontendRange: {
    start: number
    end: number
    description: string
  }
  backendRange: {
    start: number
    end: number
    description: string
  }
  reservedPorts: Array<{
    port: number
    description: string
    category: 'system' | 'portal' | 'custom'
  }>
  allocationPolicy: {
    randomizeStartPort: boolean
    description: string
    maxRetries: number
    retryDelayMs: number
    conflictResolution: 'auto_reassign' | 'manual' | 'fail'
  }
  monitoring: {
    healthCheckIntervalMs: number
    stalePortCheckIntervalMs: number
    portUtilizationWarningThreshold: number
    portUtilizationCriticalThreshold: number
    enableRealTimeMonitoring: boolean
  }
}

interface ConfigStats {
  version: string
  lastUpdated: string
  totalReservedPorts: number
  portRangeSize: {
    frontend: number
    backend: number
  }
  changeHistoryCount: number
  backupCount: number
}

interface ChangeHistoryEntry {
  timestamp: string
  type: 'port_range' | 'reserved_ports' | 'policy' | 'monitoring' | 'application' | 'system'
  changes: Array<{
    path: string
    oldValue: any
    newValue: any
  }>
  user?: string
  reason?: string
}

export const usePortConfigStore = defineStore('portConfig', () => {
  // 状态
  const portConfig = ref<PortConfiguration | null>(null)
  const configStats = ref<ConfigStats | null>(null)
  const changeHistory = ref<ChangeHistoryEntry[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)

  // API 基础 URL - 使用相对路径通过代理
  const API_BASE = '/api/v2/config/ports'

  // 计算属性
  const isConfigLoaded = computed(() => portConfig.value !== null)
  
  const totalAvailablePorts = computed(() => {
    if (!portConfig.value) return 0
    const frontend = portConfig.value.frontendRange.end - portConfig.value.frontendRange.start + 1
    const backend = portConfig.value.backendRange.end - portConfig.value.backendRange.start + 1
    return frontend + backend
  })

  const portUtilizationStatus = computed(() => {
    if (!configStats.value) return 'unknown'
    
    const totalPorts = configStats.value.portRangeSize.frontend + configStats.value.portRangeSize.backend
    const reservedPorts = configStats.value.totalReservedPorts
    const utilizationPercentage = (reservedPorts / totalPorts) * 100

    if (utilizationPercentage >= 95) return 'critical'
    if (utilizationPercentage >= 80) return 'warning'
    if (utilizationPercentage >= 60) return 'normal'
    return 'low'
  })

  // API 请求包装器
  const apiRequest = async <T>(
    url: string, 
    options: RequestInit = {}
  ): Promise<T> => {
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {})
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '请求失败' }))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // 加载配置
  const loadConfig = async (force = false) => {
    // 防止重复加载
    if (isLoading.value && !force) {
      return
    }

    isLoading.value = true
    lastError.value = null

    try {
      // 并行加载配置、统计信息和变更历史
      const [configResponse, statsResponse, historyResponse] = await Promise.all([
        apiRequest<{ data: PortConfiguration }>(`${API_BASE}/port-config`),
        apiRequest<{ data: ConfigStats }>(`${API_BASE}/stats`),
        apiRequest<{ data: ChangeHistoryEntry[] }>(`${API_BASE}/change-history?limit=50`)
      ])

      portConfig.value = configResponse.data
      configStats.value = statsResponse.data
      changeHistory.value = historyResponse.data

      // 触发配置加载完成事件
      document.dispatchEvent(new CustomEvent('portConfigLoaded', {
        detail: { config: portConfig.value, stats: configStats.value }
      }))

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载配置失败'
      lastError.value = errorMessage
      
      // 触发错误事件
      document.dispatchEvent(new CustomEvent('portConfigError', {
        detail: { error: errorMessage }
      }))
      
      throw error
    } finally {
      isLoading.value = false
    }
  }

  // 自动重试加载配置
  const loadConfigWithRetry = async (maxRetries = 3, delay = 1000) => {
    let attempts = 0
    
    while (attempts < maxRetries) {
      try {
        await loadConfig(true)
        return
      } catch (error) {
        attempts++
        if (attempts >= maxRetries) {
          throw error
        }
        
        console.warn(`配置加载失败，第 ${attempts} 次重试...`)
        await new Promise(resolve => setTimeout(resolve, delay * attempts))
      }
    }
  }

  // 更新端口范围
  const updatePortRanges = async (
    frontendRange?: { start: number; end: number },
    backendRange?: { start: number; end: number },
    reason?: string
  ) => {
    if (!portConfig.value) {
      throw new Error('配置未加载')
    }

    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/port-ranges`, {
        method: 'PUT',
        body: JSON.stringify({
          frontendRange,
          backendRange,
          reason
        })
      })

      portConfig.value = response.data
      
      // 重新加载统计信息
      await loadConfigStats()

      // 触发配置更新完成事件
      document.dispatchEvent(new CustomEvent('portConfigUpdated', {
        detail: { 
          config: portConfig.value, 
          changes: { frontendRange, backendRange },
          reason
        }
      }))

    } catch (error) {
      throw error
    }
  }

  // 添加保留端口
  const addReservedPort = async (
    port: number,
    description: string,
    category: 'system' | 'portal' | 'custom' = 'custom'
  ) => {
    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/reserved-ports`, {
        method: 'POST',
        body: JSON.stringify({
          port,
          description,
          category
        })
      })

      portConfig.value = response.data
      await loadConfigStats()

    } catch (error) {
      throw error
    }
  }

  // 移除保留端口
  const removeReservedPort = async (port: number) => {
    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/reserved-ports/${port}`, {
        method: 'DELETE'
      })

      portConfig.value = response.data
      await loadConfigStats()

    } catch (error) {
      throw error
    }
  }

  // 更新分配策略
  const updateAllocationPolicy = async (policy: Partial<PortConfiguration['allocationPolicy']>) => {
    if (!portConfig.value) {
      throw new Error('配置未加载')
    }

    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/allocation-policy`, {
        method: 'PUT',
        body: JSON.stringify(policy)
      })

      portConfig.value = response.data

    } catch (error) {
      throw error
    }
  }

  // 更新监控配置
  const updateMonitoringConfig = async (monitoring: Partial<PortConfiguration['monitoring']>) => {
    if (!portConfig.value) {
      throw new Error('配置未加载')
    }

    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/monitoring`, {
        method: 'PUT',
        body: JSON.stringify(monitoring)
      })

      portConfig.value = response.data

    } catch (error) {
      throw error
    }
  }

  // 导出配置
  const exportConfig = async (): Promise<string> => {
    try {
      const response = await apiRequest<{ data: string }>(`${API_BASE}/export`)
      return response.data
    } catch (error) {
      throw error
    }
  }

  // 导入配置
  const importConfig = async (configJson: string) => {
    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/import`, {
        method: 'POST',
        body: JSON.stringify({ config: configJson })
      })

      portConfig.value = response.data
      await loadConfigStats()

    } catch (error) {
      throw error
    }
  }

  // 验证端口范围
  const validatePortRange = (range: { start: number; end: number }, name: string) => {
    const errors: string[] = []

    if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
      errors.push(`${name}必须是整数`)
    }

    if (range.start < 1024) {
      errors.push(`${name}起始端口不能小于1024`)
    }

    if (range.end > 65535) {
      errors.push(`${name}结束端口不能大于65535`)
    }

    if (range.start >= range.end) {
      errors.push(`${name}起始端口必须小于结束端口`)
    }

    if (range.end - range.start < 10) {
      errors.push(`${name}至少需要包含10个端口`)
    }

    return errors
  }

  // 验证端口冲突
  const checkPortConflict = (port: number): string | null => {
    if (!portConfig.value) return null

    // 检查是否在保留端口列表中
    const reserved = portConfig.value.reservedPorts.find(p => p.port === port)
    if (reserved) {
      return `端口 ${port} 已被保留: ${reserved.description}`
    }

    // 检查是否在端口范围内
    const { frontendRange, backendRange } = portConfig.value
    const inFrontendRange = port >= frontendRange.start && port <= frontendRange.end
    const inBackendRange = port >= backendRange.start && port <= backendRange.end

    if (inFrontendRange && inBackendRange) {
      return `端口 ${port} 同时在前端和后端范围内，可能造成冲突`
    }

    return null
  }

  // 获取端口建议
  const getPortSuggestions = (type: 'frontend' | 'backend', count = 5): number[] => {
    if (!portConfig.value) return []

    const range = type === 'frontend' 
      ? portConfig.value.frontendRange 
      : portConfig.value.backendRange
    
    const reservedPorts = new Set(portConfig.value.reservedPorts.map(p => p.port))
    const suggestions: number[] = []

    // 从范围起始端口开始查找可用端口
    for (let port = range.start; port <= range.end && suggestions.length < count; port++) {
      if (!reservedPorts.has(port)) {
        suggestions.push(port)
      }
    }

    return suggestions
  }

  // 加载配置统计信息
  const loadConfigStats = async () => {
    try {
      const response = await apiRequest<{ data: ConfigStats }>(`${API_BASE}/stats`)
      configStats.value = response.data
    } catch (error) {
      console.error('加载配置统计失败:', error)
    }
  }

  // 刷新变更历史
  const refreshChangeHistory = async (limit = 50) => {
    try {
      const response = await apiRequest<{ data: ChangeHistoryEntry[] }>(
        `${API_BASE}/change-history?limit=${limit}`
      )
      changeHistory.value = response.data
    } catch (error) {
      console.error('加载变更历史失败:', error)
    }
  }

  // 重置配置到默认值
  const resetToDefaults = async () => {
    try {
      const response = await apiRequest<{ data: PortConfiguration }>(`${API_BASE}/reset`, {
        method: 'POST'
      })

      portConfig.value = response.data
      await loadConfigStats()

      ElMessage.success('配置已重置为默认值')

    } catch (error) {
      throw error
    }
  }

  // 验证配置完整性
  const validateConfiguration = async (): Promise<{
    isValid: boolean
    errors: Array<{ path: string; message: string }>
    warnings: Array<{ path: string; message: string; suggestion: string }>
  }> => {
    try {
      const response = await apiRequest<{
        data: {
          isValid: boolean
          errors: Array<{ path: string; message: string }>
          warnings: Array<{ path: string; message: string; suggestion: string }>
        }
      }>(`${API_BASE}/validate`)

      return response.data
    } catch (error) {
      throw error
    }
  }

  // 获取端口使用报告
  const getPortUsageReport = async (): Promise<{
    totalPorts: number
    usedPorts: number
    availablePorts: number
    utilizationPercentage: number
    conflictingPorts: Array<{ port: number; reason: string }>
    recommendations: string[]
  }> => {
    try {
      const response = await apiRequest<{
        data: {
          totalPorts: number
          usedPorts: number
          availablePorts: number
          utilizationPercentage: number
          conflictingPorts: Array<{ port: number; reason: string }>
          recommendations: string[]
        }
      }>(`${API_BASE}/usage-report`)

      return response.data
    } catch (error) {
      throw error
    }
  }

  // 清除错误状态
  const clearError = () => {
    lastError.value = null
  }

  // 监听WebSocket配置变更事件
  const setupConfigChangeListener = () => {
    // 监听WebSocket配置变更事件
    const handleConfigChanged = async (event: any) => {
      console.log('🔔 收到配置变更通知，自动重新加载配置...', event.detail)
      
      try {
        // 延迟一点时间确保后端配置已保存
        await new Promise(resolve => setTimeout(resolve, 500))
        
        await loadConfig(true)
        console.log('✅ 配置已自动重新加载')
        
        // 显示通知给用户
        document.dispatchEvent(new CustomEvent('configAutoReloaded', {
          detail: {
            changeType: event.detail?.changeType || 'config_update',
            timestamp: new Date().toISOString(),
            message: '配置已自动更新'
          }
        }))
      } catch (error) {
        console.error('❌ 配置自动重新加载失败:', error)
      }
    }

    // 监听自定义事件（由WebSocket服务触发）
    document.addEventListener('websocket_config_changed', handleConfigChanged)
    
    return () => {
      document.removeEventListener('websocket_config_changed', handleConfigChanged)
    }
  }

  return {
    // 状态
    portConfig,
    configStats,
    changeHistory,
    isLoading,
    lastError,

    // 计算属性
    isConfigLoaded,
    totalAvailablePorts,
    portUtilizationStatus,

    // 方法
    loadConfig,
    loadConfigWithRetry,
    updatePortRanges,
    addReservedPort,
    removeReservedPort,
    updateAllocationPolicy,
    updateMonitoringConfig,
    exportConfig,
    importConfig,
    validatePortRange,
    checkPortConflict,
    getPortSuggestions,
    loadConfigStats,
    refreshChangeHistory,
    resetToDefaults,
    validateConfiguration,
    getPortUsageReport,
    clearError,
    setupConfigChangeListener
  }
})
