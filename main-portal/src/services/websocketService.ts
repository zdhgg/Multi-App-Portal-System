/**
 * WebSocket 实时连接服务
 * 负责与后端的WebSocket连接和实时数据更新
 */

export interface WebSocketMessage {
  type: string
  payload?: any
  timestamp?: string
  executionId?: string
  appId?: string
  userId?: string
}

export interface AppBindingUpdatePayload {
  action: 'created' | 'updated' | 'deleted'
  binding: {
    id: string
    appId: string
    appName: string
    techStack: string
    status: string
    allocatedPorts: any[]
  }
}

export interface PortAllocationPayload {
  port: number
  appId: string
  appName: string
  allocationType: string
  protocol: string
  action: 'allocated' | 'released'
}

export interface PortConflictPayload {
  port: number
  conflictType: string
  details: string
  affectedApps: string[]
  severity: string
}

export type WebSocketEventHandler = (payload: any) => void

import { resolvePortalWebSocketUrl } from '@/utils/networkUtils'
const WS_TOKEN_PROTOCOL_PREFIX = 'portal-token.'

export class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 3000
  private heartbeatInterval: number | null = null
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map()
  private connected = false
  private isConnecting = false

  constructor(private readonly wsUrl: string = (
    (import.meta as any).env?.VITE_WS_URL 
      || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  )) {}

  /**
   * 连接WebSocket服务器
   */
  async connect(): Promise<boolean> {
    if (this.connected || this.isConnecting) {
      return this.connected
    }

    this.isConnecting = true

    try {
      const token = localStorage.getItem('auth_token')
      const protocols = token ? [`${WS_TOKEN_PROTOCOL_PREFIX}${token}`] : undefined
      this.ws = protocols ? new WebSocket(this.wsUrl, protocols) : new WebSocket(this.wsUrl)
      
      this.ws.onopen = this.handleOpen.bind(this)
      this.ws.onmessage = this.handleMessage.bind(this)
      this.ws.onclose = this.handleClose.bind(this)
      this.ws.onerror = this.handleError.bind(this)

      // 等待连接建立
      return new Promise((resolve) => {
        const checkConnection = () => {
          if (this.connected) {
            resolve(true)
          } else if (!this.isConnecting) {
            resolve(false)
          } else {
            setTimeout(checkConnection, 100)
          }
        }
        checkConnection()
      })

    } catch (error) {
      console.error('WebSocket连接失败:', error)
      this.isConnecting = false
      return false
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.isConnecting = false
    this.reconnectAttempts = 0
  }

  /**
   * 发送消息到服务器
   */
  send(message: WebSocketMessage): boolean {
    if (!this.connected || !this.ws) {
      console.warn('WebSocket未连接，无法发送消息')
      return false
    }

    try {
      this.ws.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('发送WebSocket消息失败:', error)
      return false
    }
  }

  /**
   * 订阅事件
   */
  on(eventType: string, handler: WebSocketEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  /**
   * 取消订阅事件
   */
  off(eventType: string, handler: WebSocketEventHandler): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * 订阅应用绑定更新
   */
  subscribeToAppBindings(): void {
    this.send({
      type: 'subscribe_app_bindings',
      payload: {}
    })
  }

  /**
   * 取消订阅应用绑定更新
   */
  unsubscribeFromAppBindings(): void {
    this.send({
      type: 'unsubscribe_app_bindings', 
      payload: {}
    })
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * 获取连接状态信息
   */
  getConnectionStatus(): {
    connected: boolean
    connecting: boolean
    reconnectAttempts: number
    lastError?: string
  } {
    return {
      connected: this.connected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts
    }
  }

  // ================== 私有方法 ==================

  private handleOpen(): void {
    console.log('✅ WebSocket连接已建立')
    this.connected = true
    this.isConnecting = false
    this.reconnectAttempts = 0
    
    // 启动心跳
    this.startHeartbeat()
    
    // 触发连接事件
    this.emit('connected', {})
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data)
      
      // 触发对应的事件处理器
      this.emit(message.type, message.payload || message)
      
    } catch (error) {
      console.error('解析WebSocket消息失败:', error)
    }
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket连接已关闭:', event.code, event.reason)
    this.connected = false
    this.isConnecting = false
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    // 触发断开连接事件
    this.emit('disconnected', { code: event.code, reason: event.reason })

    // 尝试重连（如果不是主动关闭）
    if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnect()
      }, this.reconnectInterval)
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket连接错误:', event)
    this.isConnecting = false
    this.emit('error', { event })
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket重连次数已达上限，停止重连')
      return
    }

    this.reconnectAttempts++
    console.log(`尝试WebSocket重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
    
    await this.connect()
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.connected) {
        this.send({ type: 'ping', payload: {} })
      }
    }, 30000) // 每30秒发送一次心跳
  }

  private emit(eventType: string, payload: any): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(payload)
        } catch (error) {
          console.error(`WebSocket事件处理器错误 (${eventType}):`, error)
        }
      })
    }
  }
}

// 创建全局WebSocket服务实例
export const websocketService = new WebSocketService()

// 自动连接
websocketService.connect().then(connected => {
  if (connected) {
    console.log('🔌 WebSocket服务已连接')
  } else {
    console.warn('⚠️ WebSocket服务连接失败')
  }
})
