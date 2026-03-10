import { ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { resolvePortalWebSocketUrl } from '@/utils/networkUtils'
import { debugLog, debugWarn } from '@/utils/debugControl'
import { getStoredAccessToken } from '@/utils/authStorage'

const WS_TOKEN_PROTOCOL_PREFIX = 'portal-token.'

interface WebSocketMessage {
  type: string
  payload: any
  timestamp?: string
}

type WebSocketEventHandler = (payload: any, message?: WebSocketMessage) => void

interface WebSocketOptions {
  onConnect?: () => void
  onDisconnect?: () => void
  onMessage?: (message: WebSocketMessage) => void
  onError?: (error: Event) => void
  onReconnecting?: (attempt: number, delay: number) => void
  reconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
  reconnectBackoffMultiplier?: number  // 指数退避倍数
  maxReconnectInterval?: number        // 最大重连间隔
  enableJitter?: boolean               // 启用随机抖动
}

export function useWebSocket(url?: string) {
  // 默认WebSocket地址 - 智能选择连接方式
  const getWebSocketUrl = () => {
    if (url) return url
    return resolvePortalWebSocketUrl()
  }

  const wsUrl = getWebSocketUrl()

  // 响应式状态
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const error = ref<string | null>(null)
  const lastMessage = ref<WebSocketMessage | null>(null)
  const reconnectAttempts = ref(0)
  const nextReconnectDelay = ref(0)

  // WebSocket实例
  let ws: WebSocket | null = null
  let options: WebSocketOptions = {}
  let reconnectTimer: number | null = null
  let authFailureNotified = false
  const listeners = new Map<string, Set<WebSocketEventHandler>>()

  const emit = (type: string, payload: any, message?: WebSocketMessage) => {
    const eventListeners = listeners.get(type)
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(payload, message)
        } catch (listenerError) {
          console.error(`WebSocket事件监听器执行失败 (${type}):`, listenerError)
        }
      })
    }

    const wildcardListeners = listeners.get('*')
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => {
        try {
          listener(payload, message)
        } catch (listenerError) {
          console.error('WebSocket通配监听器执行失败:', listenerError)
        }
      })
    }
  }

  const isAuthenticationClose = (event: CloseEvent): boolean => {
    if (event.code !== 1008) return false
    const reason = (event.reason || '').toLowerCase()
    return !reason || reason.includes('invalid token') || reason.includes('authentication required') || reason.includes('token')
  }

  const notifyAuthFailure = (message: string) => {
    if (authFailureNotified) return
    authFailureNotified = true
    ElMessage.error(message)
    window.dispatchEvent(new CustomEvent('auth:token-invalid', { detail: { source: 'websocket', message } }))
  }

  /**
   * 计算下次重连延迟（指数退避 + 随机抖动）
   */
  const calculateReconnectDelay = (attempt: number): number => {
    const baseInterval = options.reconnectInterval || 3000
    const backoffMultiplier = options.reconnectBackoffMultiplier || 2
    const maxInterval = options.maxReconnectInterval || 30000
    const enableJitter = options.enableJitter !== false // 默认启用

    // 指数退避：delay = baseInterval * (backoffMultiplier ^ attempt)
    let delay = baseInterval * Math.pow(backoffMultiplier, attempt - 1)

    // 限制最大延迟
    delay = Math.min(delay, maxInterval)

    // 添加随机抖动（±25%）
    if (enableJitter) {
      const jitterRange = delay * 0.25
      const jitter = (Math.random() * 2 - 1) * jitterRange
      delay = delay + jitter
    }

    return Math.round(delay)
  }

  // 连接WebSocket
  const connect = (wsOptions: WebSocketOptions = {}) => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      debugWarn('WebSocket已连接或正在连接')
      return
    }

    options = {
      reconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 10,
      reconnectBackoffMultiplier: 2,
      maxReconnectInterval: 30000,
      enableJitter: true,
      ...wsOptions
    }

    isConnecting.value = true
    error.value = null

    try {
      // 构建WebSocket握手参数（Token通过子协议传递，避免出现在URL中）
      let finalWsUrl = wsUrl
      const token = getStoredAccessToken()
      let protocols: string[] | undefined

      if (token) {
        // 检查生产环境是否使用Mock Token
        if (import.meta.env.PROD && token.startsWith('mock-jwt-token-')) {
          console.error('生产环境不允许使用Mock Token')
          error.value = '认证令牌无效，请重新登录'
          isConnecting.value = false
          return
        }
        protocols = [`${WS_TOKEN_PROTOCOL_PREFIX}${token}`]
      } else if (import.meta.env.PROD) {
        // 生产环境必须有Token
        console.error('生产环境WebSocket连接需要认证Token')
        error.value = '需要登录才能建立实时连接'
        isConnecting.value = false
        return
      }

      ws = protocols ? new WebSocket(finalWsUrl, protocols) : new WebSocket(finalWsUrl)

      // 存储WebSocket实例到全局，供其他地方使用
      ;(window as any).__portalWebSocket = ws

      ws.onopen = () => {
        debugLog('WebSocket连接成功')
        isConnected.value = true
        isConnecting.value = false
        reconnectAttempts.value = 0
        nextReconnectDelay.value = 0
        error.value = null
        authFailureNotified = false

        options.onConnect?.()
      }

      ws.onmessage = (event) => {
        try {
          // 先尝试解析为JSON
          const message: WebSocketMessage = JSON.parse(event.data)
          lastMessage.value = message
          
          debugLog('收到WebSocket消息:', message)
          emit(message.type, message.payload, message)
          options.onMessage?.(message)
        } catch (err) {
          // 如果不是JSON，尝试处理为纯文本消息
          const textData = event.data.toString()
          debugLog('收到非JSON WebSocket消息:', textData)
          
          // 尝试处理特定格式的消息
          if (textData.startsWith('monitoring:')) {
            const monitoringType = textData.split(':')[1]
            const message: WebSocketMessage = {
              type: 'monitoring_update',
              payload: { 
                target: monitoringType,
                message: textData
              }
            }
            lastMessage.value = message
            emit(message.type, message.payload, message)
            options.onMessage?.(message)
          } else {
            console.error('无法解析WebSocket消息:', err, '原始数据:', textData)
          }
        }
      }

      ws.onclose = (event) => {
        debugLog('WebSocket连接关闭:', event.code, event.reason)
        isConnected.value = false
        isConnecting.value = false

        // 清除全局WebSocket实例
        ;(window as any).__portalWebSocket = null

        options.onDisconnect?.()

        // 认证失败时不再自动重连，避免日志/请求风暴
        if (isAuthenticationClose(event)) {
          const message = '认证已失效，请重新登录'
          error.value = message
          options.reconnect = false
          reconnectAttempts.value = 0
          nextReconnectDelay.value = 0
          notifyAuthFailure(message)
          return
        }

        // 自动重连（使用指数退避）
        const maxAttempts = options.maxReconnectAttempts || 10
        if (options.reconnect && reconnectAttempts.value < maxAttempts) {
          reconnectAttempts.value++

          // 计算重连延迟
          const delay = calculateReconnectDelay(reconnectAttempts.value)
          nextReconnectDelay.value = delay

          debugLog(`尝试重连 (${reconnectAttempts.value}/${maxAttempts})，延迟 ${delay}ms`)

          // 通知重连事件
          options.onReconnecting?.(reconnectAttempts.value, delay)

          reconnectTimer = window.setTimeout(() => {
            connect(options)
          }, delay)
        } else if (reconnectAttempts.value >= maxAttempts) {
          error.value = `WebSocket重连失败，已达到最大重试次数 (${maxAttempts})`
          console.error(error.value)
        }
      }

      ws.onerror = (event) => {
        console.error('WebSocket错误:', event)
        error.value = 'WebSocket连接错误'
        isConnecting.value = false
        
        options.onError?.(event)
      }

    } catch (err) {
      console.error('创建WebSocket连接失败:', err)
      error.value = '创建WebSocket连接失败'
      isConnecting.value = false
    }
  }

  // 断开连接
  const disconnect = () => {
    // 清除重连定时器
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    // 关闭WebSocket连接
    if (ws) {
      // 设置reconnect为false，避免自动重连
      options.reconnect = false
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, '手动断开连接')
      }
      
      ws = null
      ;(window as any).__portalWebSocket = null
    }

    isConnected.value = false
    isConnecting.value = false
    error.value = null
    reconnectAttempts.value = 0
    nextReconnectDelay.value = 0
  }

  const on = (type: string, handler: WebSocketEventHandler) => {
    if (!listeners.has(type)) {
      listeners.set(type, new Set())
    }

    listeners.get(type)!.add(handler)
  }

  const off = (type: string, handler?: WebSocketEventHandler) => {
    const eventListeners = listeners.get(type)
    if (!eventListeners) {
      return
    }

    if (handler) {
      eventListeners.delete(handler)
      if (eventListeners.size === 0) {
        listeners.delete(type)
      }
      return
    }

    listeners.delete(type)
  }

  // 发送消息
  const send = (message: WebSocketMessage | string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      debugWarn('WebSocket未连接，无法发送消息')
      return false
    }

    try {
      const messageStr = typeof message === 'string' 
        ? message 
        : JSON.stringify({
            ...message,
            timestamp: message.timestamp || new Date().toISOString()
          })
      
      ws.send(messageStr)
      debugLog('发送WebSocket消息:', messageStr)
      return true
    } catch (err) {
      console.error('发送WebSocket消息失败:', err)
      return false
    }
  }

  // 发送特定类型的消息
  const sendMessage = (type: string, payload: any) => {
    return send({ type, payload })
  }

  // 订阅门户状态更新
  const subscribePortal = () => {
    return sendMessage('portal_subscribe', {})
  }

  // 获取应用状态
  const requestAppsStatus = () => {
    return sendMessage('get_apps_status', {})
  }

  // 发送心跳
  const ping = () => {
    return sendMessage('ping', { timestamp: new Date().toISOString() })
  }

  // 手动重连（重置重连计数）
  const reconnect = () => {
    disconnect()
    setTimeout(() => {
      reconnectAttempts.value = 0
      nextReconnectDelay.value = 0
      connect(options)
    }, 1000)
  }

  // 获取连接状态
  const getReadyState = () => {
    if (!ws) return WebSocket.CLOSED
    return ws.readyState
  }

  const getReadyStateText = () => {
    const state = getReadyState()
    switch (state) {
      case WebSocket.CONNECTING: return '连接中'
      case WebSocket.OPEN: return '已连接'
      case WebSocket.CLOSING: return '关闭中'
      case WebSocket.CLOSED: return '已关闭'
      default: return '未知'
    }
  }

  // 组件卸载时自动断开连接
  onUnmounted(() => {
    listeners.clear()
    disconnect()
  })

  return {
    // 状态
    isConnected,
    isConnecting,
    error,
    lastMessage,
    reconnectAttempts,
    nextReconnectDelay,

    // 方法
    connect,
    disconnect,
    on,
    off,
    send,
    sendMessage,
    subscribePortal,
    requestAppsStatus,
    ping,
    reconnect,
    getReadyState,
    getReadyStateText
  }
}
