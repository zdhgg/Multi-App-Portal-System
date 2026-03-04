import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { resolvePortalWebSocketUrl } from '@/utils/networkUtils'
const WS_TOKEN_PROTOCOL_PREFIX = 'portal-token.'

export interface PortMonitoringData {
  stats: {
    totalPorts: number
    occupiedPorts: number
    availablePorts: number
    utilizationRate: number
    averageResponseTime: number
    healthyServices: number
    failedServices: number
  }
  ports: Array<{
    port: number
    status: 'available' | 'occupied' | 'unknown' | 'error'
    lastChecked: string
    responseTime?: number
    metadata?: Record<string, any>
  }>
  alerts: Array<{
    id: string
    type: 'warning' | 'critical' | 'info'
    message: string
    timestamp: string
    port?: number
    acknowledged?: boolean
  }>
}

export function usePortMonitoring() {
  const isConnected = ref(false)
  const isSubscribed = ref(false)
  const connectionError = ref<string | null>(null)
  const data = reactive<PortMonitoringData>({
    stats: {
      totalPorts: 0,
      occupiedPorts: 0,
      availablePorts: 0,
      utilizationRate: 0,
      averageResponseTime: 0,
      healthyServices: 0,
      failedServices: 0
    },
    ports: [],
    alerts: []
  })

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: number | null = null
  const maxReconnectAttempts = 5
  const reconnectDelay = 3000

  // 连接WebSocket
  const connect = () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return
    }

    try {
      const wsUrl = resolvePortalWebSocketUrl()
      const token = localStorage.getItem('auth_token')
      const protocols = token ? [`${WS_TOKEN_PROTOCOL_PREFIX}${token}`] : undefined
      ws = protocols ? new WebSocket(wsUrl, protocols) : new WebSocket(wsUrl)

      ws.onopen = () => {
        isConnected.value = true
        connectionError.value = null
        reconnectAttempts = 0
        console.log('WebSocket连接成功')

        // 订阅端口监控
        subscribeToPortMonitoring()
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          handleWebSocketMessage(message)
        } catch (error) {
          console.error('WebSocket消息解析失败:', error)
        }
      }

      ws.onclose = (event) => {
        isConnected.value = false
        isSubscribed.value = false
        
        if (event.code !== 1000) { // 非正常关闭
          console.warn('WebSocket连接断开:', event.reason)
          attemptReconnect()
        } else {
          console.log('WebSocket连接已关闭')
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket连接错误:', error)
        connectionError.value = 'WebSocket连接失败'
      }

    } catch (error) {
      console.error('创建WebSocket连接失败:', error)
      connectionError.value = '无法创建WebSocket连接'
    }
  }

  // 尝试重连
  const attemptReconnect = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      connectionError.value = '达到最大重连次数，请手动刷新页面'
      return
    }

    reconnectAttempts++
    console.log(`尝试重连... (${reconnectAttempts}/${maxReconnectAttempts})`)
    
    reconnectTimer = window.setTimeout(() => {
      connect()
    }, reconnectDelay * reconnectAttempts)
  }

  // 订阅端口监控
  const subscribeToPortMonitoring = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    ws.send(JSON.stringify({
      type: 'port_monitoring_subscribe'
    }))
  }

  // 获取端口状态
  const getPortStatus = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    ws.send(JSON.stringify({
      type: 'get_port_status'
    }))
  }

  // 处理WebSocket消息
  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'connection':
        console.log('WebSocket连接确认:', message.payload.message)
        break

      case 'port_monitoring_subscribed':
        isSubscribed.value = true
        console.log('端口监控订阅成功')
        break

      case 'port_status':
        // 更新端口状态数据
        if (message.payload.stats) {
          Object.assign(data.stats, message.payload.stats)
        }
        if (Array.isArray(message.payload.ports)) {
          data.ports.splice(0, data.ports.length, ...message.payload.ports)
        }
        if (Array.isArray(message.payload.alerts)) {
          data.alerts.splice(0, data.alerts.length, ...message.payload.alerts)
        }
        break

      case 'port_status_update':
        // 实时更新端口状态
        handlePortStatusUpdate(message.payload)
        break

      case 'port_alert':
        // 新告警
        handleNewAlert(message.payload)
        break

      case 'error':
        console.error('WebSocket服务器错误:', message.payload.message)
        connectionError.value = message.payload.message
        break

      default:
        console.debug('未处理的WebSocket消息:', message.type)
    }
  }

  // 处理端口状态更新
  const handlePortStatusUpdate = (payload: any) => {
    if (payload.type === 'port_status_changed' && payload.data) {
      const { port, status, responseTime } = payload.data
      
      // 更新对应端口的状态
      const portIndex = data.ports.findIndex(p => p.port === port)
      if (portIndex !== -1) {
        data.ports[portIndex].status = status
        data.ports[portIndex].lastChecked = new Date().toISOString()
        if (responseTime !== undefined) {
          data.ports[portIndex].responseTime = responseTime
        }
      }

      // 更新统计信息
      if (payload.stats) {
        Object.assign(data.stats, payload.stats)
      }
    }
  }

  // 处理新告警
  const handleNewAlert = (alert: any) => {
    // 添加到告警列表顶部
    data.alerts.unshift(alert)
    
    // 限制告警数量
    if (data.alerts.length > 50) {
      data.alerts.splice(50)
    }

    // 显示UI通知
    if (alert.type === 'critical') {
      ElMessage.error(`严重告警: ${alert.message}`)
    } else if (alert.type === 'warning') {
      ElMessage.warning(`告警: ${alert.message}`)
    } else {
      ElMessage.info(`通知: ${alert.message}`)
    }
  }

  // 断开连接
  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close(1000, '用户主动断开')
      ws = null
    }

    isConnected.value = false
    isSubscribed.value = false
  }

  // 清除告警
  const clearAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/config/alerts/${alertId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        // 从本地列表中移除
        const index = data.alerts.findIndex(alert => alert.id === alertId)
        if (index !== -1) {
          data.alerts.splice(index, 1)
        }
        return true
      } else {
        throw new Error('删除告警失败')
      }
    } catch (error) {
      console.error('清除告警失败:', error)
      return false
    }
  }

  // 确认告警
  const acknowledgeAlert = async (alertId: string) => {
    try {
      const response = await fetch(`/api/config/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        // 更新本地状态
        const alert = data.alerts.find(alert => alert.id === alertId)
        if (alert) {
          alert.acknowledged = true
        }
        return true
      } else {
        throw new Error('确认告警失败')
      }
    } catch (error) {
      console.error('确认告警失败:', error)
      return false
    }
  }

  // 获取端口详细信息
  const getPortDetails = async (port: number) => {
    try {
      const response = await fetch(`/api/config/port-status/${port}`)
      if (response.ok) {
        const result = await response.json()
        return result.data
      } else {
        throw new Error('获取端口详情失败')
      }
    } catch (error) {
      console.error('获取端口详情失败:', error)
      return null
    }
  }

  // 手动刷新数据
  const refreshData = () => {
    getPortStatus()
  }

  // 组件挂载时自动连接
  onMounted(() => {
    connect()
  })

  // 组件卸载时断开连接
  onUnmounted(() => {
    disconnect()
  })

  return {
    // 状态
    isConnected,
    isSubscribed,
    connectionError,
    data,

    // 方法
    connect,
    disconnect,
    subscribeToPortMonitoring,
    getPortStatus,
    refreshData,
    clearAlert,
    acknowledgeAlert,
    getPortDetails,

    // 统计信息
    stats: data.stats,
    ports: data.ports,
    alerts: data.alerts
  }
}
