// WebSocket连接管理服务
import { resolvePortalWebSocketUrl } from '@/utils/networkUtils'
import { getStoredAccessToken } from '@/utils/authStorage'
const WS_TOKEN_PROTOCOL_PREFIX = 'portal-token.'

export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 5000
  private listeners: Record<string, Function[]> = {}

  /**
   * 连接WebSocket
   */
  connect(url: string = resolvePortalWebSocketUrl()) {
    try {
      const token = getStoredAccessToken()
      const protocols = token ? [`${WS_TOKEN_PROTOCOL_PREFIX}${token}`] : undefined
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url)
      
      this.ws.onopen = () => {
        console.log('WebSocket连接已建立')
        this.reconnectAttempts = 0
        this.emit('connected', { timestamp: new Date().toISOString() })
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          console.error('WebSocket消息解析失败:', error)
        }
      }
      
      this.ws.onclose = () => {
        console.log('WebSocket连接已关闭')
        this.emit('disconnected', { timestamp: new Date().toISOString() })
        this.attemptReconnect()
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket连接错误:', error)
        this.emit('error', { error, timestamp: new Date().toISOString() })
      }
    } catch (error) {
      console.error('WebSocket连接失败:', error)
      this.attemptReconnect()
    }
  }

  /**
   * 尝试重连
   */
  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`尝试重连WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connect()
      }, this.reconnectInterval)
    } else {
      console.log('WebSocket重连失败，已达到最大重连次数')
      this.emit('maxReconnectAttemptsReached', { 
        attempts: this.reconnectAttempts,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 处理WebSocket消息
   */
  private handleMessage(data: any) {
    switch (data.type) {
      case 'welcome':
        // Handle simple welcome handshake messages
        this.emit('connected', data.payload || { message: 'welcome' })
        break
      case 'connection':
        console.log('WebSocket连接成功:', data.payload?.message)
        this.emit('connected', data.payload)
        break
      case 'scan_progress':
        this.emit('scanProgress', data.payload)
        break
      case 'app_status':
        this.emit('appStatus', data.payload)
        break
      case 'pong':
        console.log('WebSocket心跳响应:', data.payload?.timestamp)
        this.emit('pong', data.payload)
        break
      case 'notification':
        this.emit('notification', data.payload)
        break
      case 'config_changed':
        console.log('🔔 收到配置变更WebSocket消息:', data.data)
        // 发送自定义DOM事件让其他组件监听
        document.dispatchEvent(new CustomEvent('websocket_config_changed', {
          detail: data.data
        }))
        this.emit('configChanged', data.data)
        break
      default:
        console.log('未知的WebSocket消息类型:', data.type)
        this.emit('message', data)
    }
  }

  /**
   * 发送消息
   */
  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return true
    }
    console.warn('WebSocket未连接，无法发送消息')
    return false
  }

  /**
   * 发送心跳
   */
  ping() {
    return this.send({
      type: 'ping',
      payload: { timestamp: new Date().toISOString() }
    })
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.reconnectAttempts = this.maxReconnectAttempts // 阻止自动重连
  }

  /**
   * 获取连接状态
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * 获取连接状态字符串
   */
  get connectionState(): string {
    if (!this.ws) return 'disconnected'
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting'
      case WebSocket.OPEN: return 'connected'
      case WebSocket.CLOSING: return 'closing'
      case WebSocket.CLOSED: return 'disconnected'
      default: return 'unknown'
    }
  }

  /**
   * 添加事件监听器
   */
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
    }
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners(event?: string) {
    if (event) {
      delete this.listeners[event]
    } else {
      this.listeners = {}
    }
  }

  /**
   * 触发事件
   */
  private emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`WebSocket事件处理器错误 (${event}):`, error)
        }
      })
    }
  }
}

// 创建WebSocket管理器实例
export const websocketManager = new WebSocketManager()

// 为了向后兼容，也导出为wsManager
export const wsManager = websocketManager
