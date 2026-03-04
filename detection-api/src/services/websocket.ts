/**
 * WebSocket Manager - Simplified for Clean Architecture v2
 * 
 * This replaces the complex v1 WebSocket service.
 * Simple, focused on core real-time communication.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { logger } from '../utils/logger'
import { parse as parseUrl } from 'url'
import { verifyToken } from '../utils/jwt.js'

export interface WebSocketMessage {
  type: string
  payload: any
  timestamp?: string
  executionId?: string
  appId?: string
  userId?: string
}

export interface BuildProgressUpdate {
  executionId: string
  appId: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  progress: number
  currentStep: string
  startTime: number
  endTime?: number
  duration?: number
  outputSize?: number
  error?: string
}

export interface BuildLogUpdate {
  executionId: string
  appId: string
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: 'stdout' | 'stderr' | 'system'
}

export interface WebSocketClient {
  ws: WebSocket
  id: string
  userId: string
  userRole: string
  authenticated: boolean
  subscribedBuilds: Set<string>
  subscribedApps: Set<string>
  subscribedAppBindings: boolean  // 全局应用绑定订阅
  lastPing: number
  isAlive: boolean
}

const WS_PROTOCOL_TOKEN_PREFIX = 'portal-token.'
const TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes'])

export class WebSocketManager {
  private wss: WebSocketServer | null = null
  private clients: Map<string, WebSocketClient> = new Map()
  private pingInterval: NodeJS.Timeout | null = null
  private readonly PING_INTERVAL = 30000 // 30秒

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    })

    this.wss.on('connection', (ws: WebSocket, request) => {
      const authRequired = this.isWsAuthRequired()
      const token = this.extractToken(request)
      const auth = this.authenticateToken(token)

      if (!auth.success && authRequired) {
        logger.warn('WebSocket connection rejected due to authentication failure', {
          reason: auth.reason,
          ip: request.socket?.remoteAddress
        })
        ws.close(1008, auth.reason || 'Authentication required')
        return
      }

      const clientId = this.generateClientId()
      const client: WebSocketClient = {
        ws,
        id: clientId,
        userId: auth.userId,
        userRole: auth.userRole,
        authenticated: auth.authenticated,
        subscribedBuilds: new Set(),
        subscribedApps: new Set(),
        subscribedAppBindings: false,
        lastPing: Date.now(),
        isAlive: true
      }

      this.clients.set(clientId, client)
      logger.debug('WebSocket client connected', { clientId, totalClients: this.clients.size })

      // Send welcome message
      this.sendToClient(ws, {
        type: 'welcome',
        payload: {
          message: 'Connected to Detection API v2',
          clientId,
          authenticated: client.authenticated,
          userId: client.userId,
          role: client.userRole,
          serverTime: Date.now()
        }
      })

      // Handle messages from client
      ws.on('message', (data: Buffer) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          this.handleMessage(clientId, message)
        } catch (error) {
          logger.error('Invalid WebSocket message', error)
        }
      })

      // Handle client disconnect
      ws.on('close', () => {
        logger.debug('WebSocket client disconnected', { clientId, totalClients: this.clients.size - 1 })
        this.clients.delete(clientId)
      })

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { error, clientId })
        this.clients.delete(clientId)
      })

      // Handle pong responses
      ws.on('pong', () => {
        client.isAlive = true
        client.lastPing = Date.now()
      })
    })

    // Start ping interval for heartbeat
    this.startPingInterval()

    logger.info('🔌 WebSocket server initialized on /ws')
  }

  private handleMessage(clientId: string, message: WebSocketMessage) {
    const client = this.clients.get(clientId)
    if (!client) return

    logger.debug('Received WebSocket message', { type: message.type, clientId })

    switch (message.type) {
      case 'subscribe_build':
        this.handleSubscribeBuild(clientId, message.payload)
        break
      case 'unsubscribe_build':
        this.handleUnsubscribeBuild(clientId, message.payload)
        break
      case 'subscribe_app':
        this.handleSubscribeApp(clientId, message.payload)
        break
      case 'unsubscribe_app':
        this.handleUnsubscribeApp(clientId, message.payload)
        break
      case 'subscribe_app_bindings':
        this.handleSubscribeAppBindings(clientId, message.payload)
        break
      case 'unsubscribe_app_bindings':
        this.handleUnsubscribeAppBindings(clientId, message.payload)
        break
      case 'ping':
        this.sendToClient(client.ws, { type: 'pong', payload: {} })
        break
      case 'status':
        this.sendToClient(client.ws, {
          type: 'status',
          payload: {
            status: 'healthy',
            clients: this.clients.size,
            timestamp: new Date().toISOString()
          }
        })
        break
      default:
        logger.warn('Unknown WebSocket message type', { type: message.type, clientId })
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      const messageWithTimestamp = {
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      }
      
      ws.send(JSON.stringify(messageWithTimestamp))
    }
  }

  private isWsAuthRequired(): boolean {
    const configured = (process.env.WS_AUTH_REQUIRED || '').trim().toLowerCase()
    if (configured) {
      return TRUTHY_VALUES.has(configured)
    }
    return process.env.NODE_ENV === 'production'
  }

  private authenticateToken(token: string | null): {
    success: boolean
    authenticated: boolean
    userId: string
    userRole: string
    reason?: string
  } {
    if (!token) {
      return {
        success: false,
        authenticated: false,
        userId: 'anonymous',
        userRole: 'guest',
        reason: 'Authentication required'
      }
    }

    if (token.startsWith('mock-jwt-token-')) {
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          authenticated: false,
          userId: 'anonymous',
          userRole: 'guest',
          reason: 'Invalid token'
        }
      }

      return {
        success: true,
        authenticated: true,
        userId: 'mock-dev',
        userRole: token.split('-')[3] || 'guest'
      }
    }

    try {
      const payload = verifyToken(token) as any
      return {
        success: true,
        authenticated: true,
        userId: payload.sub || payload.username || 'unknown',
        userRole: payload.role || 'guest'
      }
    } catch {
      return {
        success: false,
        authenticated: false,
        userId: 'anonymous',
        userRole: 'guest',
        reason: 'Invalid token'
      }
    }
  }

  private extractToken(request: any): string | null {
    const authorization = request?.headers?.authorization
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return authorization.slice(7).trim()
    }

    const protocolHeader = request?.headers?.['sec-websocket-protocol']
    const protocols = Array.isArray(protocolHeader)
      ? protocolHeader.flatMap((value: string) => value.split(','))
      : typeof protocolHeader === 'string'
        ? protocolHeader.split(',')
        : []

    for (const rawProtocol of protocols) {
      const protocol = rawProtocol.trim()
      if (!protocol) continue

      if (protocol.startsWith(WS_PROTOCOL_TOKEN_PREFIX)) {
        return protocol.slice(WS_PROTOCOL_TOKEN_PREFIX.length).trim()
      }

      if (protocol.startsWith('Bearer.')) {
        return protocol.slice('Bearer.'.length).trim()
      }
    }

    const allowLegacyQueryToken = TRUTHY_VALUES.has(
      (process.env.WS_ALLOW_QUERY_TOKEN || '').trim().toLowerCase()
    )
    if (allowLegacyQueryToken) {
      const parsed = parseUrl(request?.url || '', true)
      if (typeof parsed.query?.token === 'string' && parsed.query.token) {
        logger.warn('WebSocket using deprecated query token, migrate to protocol token')
        return decodeURIComponent(parsed.query.token)
      }
    }

    return null
  }

  broadcast(message: WebSocketMessage) {
    const messageWithTimestamp = {
      ...message,
      timestamp: message.timestamp || new Date().toISOString()
    }
    
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client.ws, messageWithTimestamp)
      }
    })
  }

  // ==================== 订阅处理方法 ====================

  private handleSubscribeBuild(clientId: string, data: { executionId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedBuilds.add(data.executionId)
      this.sendToClient(client.ws, {
        type: 'subscription_confirmed',
        payload: { type: 'build', executionId: data.executionId }
      })
      logger.debug('Client subscribed to build', { clientId, executionId: data.executionId })
    }
  }

  private handleUnsubscribeBuild(clientId: string, data: { executionId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedBuilds.delete(data.executionId)
      logger.debug('Client unsubscribed from build', { clientId, executionId: data.executionId })
    }
  }

  private handleSubscribeApp(clientId: string, data: { appId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedApps.add(data.appId)
      this.sendToClient(client.ws, {
        type: 'subscription_confirmed',
        payload: { type: 'app', appId: data.appId }
      })
      logger.debug('Client subscribed to app', { clientId, appId: data.appId })
    }
  }

  private handleUnsubscribeApp(clientId: string, data: { appId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedApps.delete(data.appId)
      logger.debug('Client unsubscribed from app', { clientId, appId: data.appId })
    }
  }

  private handleSubscribeAppBindings(clientId: string, data?: any): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedAppBindings = true
      this.sendToClient(client.ws, {
        type: 'subscription_confirmed',
        payload: { type: 'app_bindings', message: 'Subscribed to app bindings updates' }
      })
      logger.debug('Client subscribed to app bindings', { clientId })
    }
  }

  private handleUnsubscribeAppBindings(clientId: string, data?: any): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedAppBindings = false
      logger.debug('Client unsubscribed from app bindings', { clientId })
    }
  }

  // ==================== 构建相关广播方法 ====================

  broadcastBuildProgress(update: BuildProgressUpdate): void {
    const message: WebSocketMessage = {
      type: 'build_progress',
      payload: update,
      executionId: update.executionId,
      appId: update.appId
    }

    this.broadcastToSubscribers(message, update.executionId, update.appId)
  }

  broadcastBuildLog(log: BuildLogUpdate): void {
    const message: WebSocketMessage = {
      type: 'build_log',
      payload: log,
      executionId: log.executionId,
      appId: log.appId
    }

    this.broadcastToSubscribers(message, log.executionId, log.appId)
  }

  broadcastBuildStatus(executionId: string, appId: string, status: string, data?: any): void {
    const message: WebSocketMessage = {
      type: 'build_status',
      payload: { status, ...data },
      executionId,
      appId
    }

    this.broadcastToSubscribers(message, executionId, appId)
  }

  private broadcastToSubscribers(message: WebSocketMessage, executionId?: string, appId?: string): void {
    let sentCount = 0

    for (const client of this.clients.values()) {
      let shouldSend = false

      // 检查是否订阅了特定的构建任务
      if (executionId && client.subscribedBuilds.has(executionId)) {
        shouldSend = true
      }

      // 检查是否订阅了特定的应用
      if (appId && client.subscribedApps.has(appId)) {
        shouldSend = true
      }

      if (shouldSend && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client.ws, message)
        sentCount++
      }
    }

    logger.debug('WebSocket message broadcasted', {
      type: message.type,
      executionId,
      appId,
      sentCount,
      totalClients: this.clients.size
    })
  }

  /**
   * 广播应用绑定更新
   */
  broadcastAppBindingUpdate(update: {
    action: 'created' | 'updated' | 'deleted'
    binding: any
  }): void {
    const message: WebSocketMessage = {
      type: 'app_binding_update',
      payload: update
    }
    this.broadcastToAppBindingsSubscribers(message)
    logger.debug(`Broadcasted app binding ${update.action} for app ${update.binding.appName}`)
  }

  /**
   * 向应用绑定订阅者广播消息
   */
  private broadcastToAppBindingsSubscribers(message: WebSocketMessage): void {
    let sentCount = 0

    for (const client of this.clients.values()) {
      if (client.subscribedAppBindings && client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(client.ws, message)
        sentCount++
      }
    }

    logger.debug('App binding message broadcast completed', {
      type: message.type,
      sentCount,
      totalClients: this.clients.size,
      subscribedClients: sentCount
    })
  }

  // ==================== 心跳检测 ====================

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // 客户端未响应，断开连接
          client.ws.terminate()
          this.clients.delete(clientId)
          logger.warn('WebSocket client heartbeat timeout', { clientId })
        } else {
          // 发送ping
          client.isAlive = false
          try {
            client.ws.ping()
          } catch (error) {
            logger.error('Failed to send WebSocket ping', { error, clientId })
            this.clients.delete(clientId)
          }
        }
      }
    }, this.PING_INTERVAL)
  }

  // ==================== 工具方法 ====================

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  getConnectedClientsCount(): number {
    return this.clients.size
  }

  getStats(): {
    totalClients: number
    activeClients: number
    subscriptions: {
      builds: number
      apps: number
    }
  } {
    let buildSubscriptions = 0
    let appSubscriptions = 0
    let activeClients = 0

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        activeClients++
      }
      buildSubscriptions += client.subscribedBuilds.size
      appSubscriptions += client.subscribedApps.size
    }

    return {
      totalClients: this.clients.size,
      activeClients,
      subscriptions: {
        builds: buildSubscriptions,
        apps: appSubscriptions
      }
    }
  }

  isInitialized(): boolean {
    return this.wss !== null
  }

  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    for (const client of this.clients.values()) {
      client.ws.close()
    }

    if (this.wss) {
      this.wss.close()
      this.clients.clear()
      logger.info('🔌 WebSocket server closed')
    }
  }
}

// 导出单例实例，供路由等模块直接使用
export const webSocketManager = new WebSocketManager()
