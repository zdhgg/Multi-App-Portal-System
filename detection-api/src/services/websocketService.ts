import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { logger } from '../utils/logger.js'
import { EventEmitter } from 'events'
import { parse as parseUrl } from 'url'
import { verifyToken } from '../utils/jwt.js'
import {
  DetectionError,
  ErrorCode,
  ErrorCategory,
  ErrorSeverity,
  handleError
} from '../core/errors/index.js'

export interface WebSocketMessage {
  type: 'build_progress' | 'build_log' | 'build_status' | 'build_complete' | 'build_error' | 'system_notification' | 'log' | 'port_statistics' | 'port_status' | 'port_allocation' | 'port_conflict' | 'config_changed' | 'app_binding_update'
  data?: any
  payload?: any
  timestamp: number
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

export interface LogUpdate {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  source: string
  appId?: string
  appName?: string
  metadata?: Record<string, any>
}

export interface PortStatisticsUpdate {
  total: number
  allocated: number
  totalAllocated: number
  available: number
  conflicts: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  byTechStack: Record<string, number>
  averageResponseTime: number
  allocationSuccessRate: number
  rangeUtilization: Record<string, number>
}

export interface PortStatusUpdate {
  port: number
  status: 'allocated' | 'available' | 'conflict' | 'error'
  appId?: string
  appName?: string
  processId?: number
  processName?: string
  responseTime?: number
  lastUpdate: number
}

export interface PortAllocationUpdate {
  port: number
  appId: string
  appName: string
  allocationType: string
  protocol: string
  action: 'allocated' | 'released'
  timestamp: number
}

export interface PortConflictUpdate {
  port: number
  conflictType: 'process' | 'allocation' | 'system'
  details: string
  affectedApps: string[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: number
}

export interface WebSocketClient {
  id: string
  ws: WebSocket
  userId: string              // 用户ID（必需）
  userRole: string            // 用户角色
  authenticated: boolean      // 是否已认证
  subscribedBuilds: Set<string>
  subscribedApps: Set<string>
  subscribedAppBindings: boolean  // 全局应用绑定订阅
  subscribedLogs: {
    appIds: Set<string>
    levels: Set<string>
    sources: Set<string>
    systemLogs: boolean
  }
  lastPing: number
  isAlive: boolean
}

const WS_PROTOCOL_TOKEN_PREFIX = 'portal-token.'
const TRUTHY_VALUES = new Set(['1', 'true', 'on', 'yes'])

export class WebSocketService extends EventEmitter {
  private wss: WebSocketServer | null = null
  private clients: Map<string, WebSocketClient> = new Map()
  private pingInterval: NodeJS.Timeout | null = null
  private readonly PING_INTERVAL = 30000 // 30秒
  private readonly PONG_TIMEOUT = 5000 // 5秒
  private configManager: any = null

  constructor() {
    super()
    this.setupEventHandlers()
  }

  /**
   * 设置配置管理器以监听配置变更
   */
  setConfigManager(configManager: any): void {
    this.configManager = configManager
    
    if (configManager && typeof configManager.on === 'function') {
      // 监听配置变更事件
      configManager.on('configChanged', this.handleConfigChange.bind(this))
      logger.info('WebSocket服务已开始监听配置变更事件')
    }
  }

  /**
   * 处理配置变更事件
   */
  private handleConfigChange(event: any): void {
    logger.info('配置变更事件，通知所有WebSocket客户端', {
      changeType: event.type || 'unknown',
      changesCount: event.changes?.length || 0,
      user: event.user || 'system'
    })

    // 向所有连接的客户端广播配置变更事件
    this.broadcastToAllClients({
      type: 'config_changed',
      data: {
        changeType: event.type || 'config_update',
        changes: event.changes || [],
        timestamp: new Date().toISOString(),
        user: event.user || 'system',
        reason: event.reason || '配置更新'
      },
      timestamp: Date.now()
    })
  }

  /**
   * 初始化WebSocket服务器
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws',
      perMessageDeflate: false
    })

    this.wss.on('connection', this.handleConnection.bind(this))
    this.startPingInterval()
    
    logger.info('✅ WebSocket服务已启动', { path: '/ws' })
  }

  /**
   * 处理新的WebSocket连接（增强认证）
   */
  private handleConnection(ws: WebSocket, request: any): void {
    // 1. 提取Token（从握手头）
    const token = this.extractToken(request)

    // 2. 验证Token（生产环境强制验证）
    if (process.env.NODE_ENV === 'production' && !token) {
      logger.warn('WebSocket连接被拒绝：缺少认证Token', {
        ip: request.socket?.remoteAddress
      })
      ws.close(1008, 'Authentication required')
      return
    }

    let userId = 'anonymous'
    let userRole = 'guest'
    let authenticated = false

    if (token) {
      try {
        // 验证Token
        if (token.startsWith('mock-jwt-token-')) {
          // Mock Token处理
          if (process.env.NODE_ENV === 'production') {
            logger.warn('WebSocket连接被拒绝：生产环境不允许Mock Token')
            ws.close(1008, 'Invalid token')
            return
          }
          userRole = token.split('-')[3] || 'guest'
          userId = 'mock-dev'
          authenticated = true
        } else {
          // 真实JWT验证
          const payload = verifyToken(token) as any
          userId = payload.sub || 'unknown'
          userRole = payload.role || 'guest'
          authenticated = true
        }

        logger.info('WebSocket连接认证成功', { userId, userRole })
      } catch (error) {
        logger.warn('WebSocket Token验证失败', {
          error: error instanceof Error ? error.message : String(error),
          ip: request.socket?.remoteAddress
        })

        if (process.env.NODE_ENV === 'production') {
          ws.close(1008, 'Invalid token')
          return
        }
        // 开发环境允许继续，但标记为未认证
        userId = 'unauthenticated'
        userRole = 'guest'
        authenticated = false
      }
    }

    // 3. 创建客户端对象（添加认证信息）
    const clientId = this.generateClientId()
    const client: WebSocketClient = {
      id: clientId,
      ws,
      userId,
      userRole,
      authenticated,
      subscribedBuilds: new Set(),
      subscribedApps: new Set(),
      subscribedAppBindings: false,
      subscribedLogs: {
        appIds: new Set(),
        levels: new Set(),
        sources: new Set(),
        systemLogs: false
      },
      lastPing: Date.now(),
      isAlive: true
    }

    this.clients.set(clientId, client)

    // 解析 URL 参数并自动订阅
    this.parseUrlAndSubscribe(clientId, request.url, client)

    // 设置WebSocket事件处理
    ws.on('message', (data) => {
      // 异步处理消息，避免阻塞
      this.handleMessage(clientId, data).catch(error => {
        logger.error('WebSocket消息处理异步错误', { error, clientId });
      });
    })
    ws.on('close', () => this.handleDisconnection(clientId))
    ws.on('error', (error) => this.handleError(clientId, error))
    ws.on('pong', () => this.handlePong(clientId))

    // 发送欢迎消息（包含认证状态）
    this.sendToClient(clientId, {
      type: 'system_notification',
      data: {
        message: 'WebSocket连接已建立',
        clientId,
        authenticated: client.authenticated,
        userId: client.userId,
        role: client.userRole,
        serverTime: Date.now()
      },
      timestamp: Date.now()
    })

    logger.info('新的WebSocket连接', { clientId, totalClients: this.clients.size })
  }

  /**
   * 解析 URL 参数并自动订阅
   */
  private parseUrlAndSubscribe(clientId: string, url: string, client: WebSocketClient): void {
    try {
      // 解析 URL 参数
      const urlObj = new URL(url, 'http://localhost')
      const params = urlObj.searchParams

      const type = params.get('type')

      // 如果是日志订阅
      if (type === 'logs') {
        const appId = params.get('appId')
        const level = params.get('level')
        const source = params.get('source')

        // 设置订阅
        if (appId) {
          client.subscribedLogs.appIds.add(appId)
        } else {
          // 如果没有指定 appId，订阅系统日志
          client.subscribedLogs.systemLogs = true
        }

        if (level) {
          client.subscribedLogs.levels.add(level)
        }

        if (source) {
          client.subscribedLogs.sources.add(source)
        }

        logger.info('自动订阅日志', {
          clientId,
          appId,
          level,
          source,
          systemLogs: client.subscribedLogs.systemLogs
        })

        // 发送订阅确认
        this.sendToClient(clientId, {
          type: 'system_notification',
          data: {
            message: '已自动订阅日志',
            subscription: {
              appId,
              level,
              source,
              systemLogs: client.subscribedLogs.systemLogs
            }
          },
          timestamp: Date.now()
        })
      }
    } catch (error) {
      logger.error('解析 URL 参数失败', {
        clientId,
        url,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 处理客户端消息
   */
  private async handleMessage(clientId: string, data: any): Promise<void> {
    try {
      const message = JSON.parse(data.toString())
      const client = this.clients.get(clientId)
      
      if (!client) return

      switch (message.type) {
        case 'subscribe_build':
          this.handleSubscribeBuild(clientId, message.data)
          break
        case 'unsubscribe_build':
          this.handleUnsubscribeBuild(clientId, message.data)
          break
        case 'subscribe_app':
          this.handleSubscribeApp(clientId, message.data)
          break
        case 'unsubscribe_app':
          this.handleUnsubscribeApp(clientId, message.data)
          break
        case 'subscribe_app_bindings':
          this.handleSubscribeAppBindings(clientId, message.data)
          break
        case 'unsubscribe_app_bindings':
          this.handleUnsubscribeAppBindings(clientId, message.data)
          break
        case 'subscribe_logs':
          this.handleSubscribeLogs(clientId, message.data)
          break
        case 'unsubscribe_logs':
          this.handleUnsubscribeLogs(clientId, message.data)
          break
        case 'ping':
          this.handleClientPing(clientId)
          break
        default:
          logger.warn('未知的WebSocket消息类型', { type: message.type, clientId })
      }
    } catch (error) {
      // 使用增强的错误处理
      const enhancedError = await this.createWebSocketError(
        error instanceof Error ? error : new Error(String(error)), 
        clientId, 
        'message_processing'
      );
      
      logger.error('处理WebSocket消息失败', {
        errorCode: enhancedError.code,
        severity: enhancedError.severity,
        clientId,
        context: enhancedError.context,
        suggestions: (enhancedError.context as any)?.suggestions || []
      });

      // 使用错误管理器处理
      await handleError(enhancedError);
    }
  }

  /**
   * 处理客户端断开连接
   */
  private handleDisconnection(clientId: string): void {
    this.clients.delete(clientId)
    logger.info('WebSocket连接断开', { clientId, totalClients: this.clients.size })
  }

  /**
   * 处理WebSocket错误
   */
  private async handleError(clientId: string, error: Error): Promise<void> {
    // 使用增强的错误处理
    const enhancedError = await this.createWebSocketError(error, clientId, 'connection_error');
    
    logger.error('WebSocket连接错误', {
      errorCode: enhancedError.code,
      severity: enhancedError.severity,
      clientId,
      context: enhancedError.context,
      suggestions: enhancedError.context?.suggestions || []
    });

    // 清理客户端连接
    this.clients.delete(clientId);

    // 使用错误管理器处理
    await handleError(enhancedError);
  }

  /**
   * 处理pong响应
   */
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.isAlive = true
      client.lastPing = Date.now()
    }
  }

  /**
   * 订阅构建任务更新
   */
  private handleSubscribeBuild(clientId: string, data: { executionId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedBuilds.add(data.executionId)
      this.sendToClient(clientId, {
        type: 'system_notification',
        data: { message: `已订阅构建任务: ${data.executionId}` },
        timestamp: Date.now()
      })
      logger.debug('客户端订阅构建任务', { clientId, executionId: data.executionId })
    }
  }

  /**
   * 取消订阅构建任务更新
   */
  private handleUnsubscribeBuild(clientId: string, data: { executionId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedBuilds.delete(data.executionId)
      logger.debug('客户端取消订阅构建任务', { clientId, executionId: data.executionId })
    }
  }

  /**
   * 订阅应用更新
   */
  private handleSubscribeApp(clientId: string, data: { appId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedApps.add(data.appId)
      this.sendToClient(clientId, {
        type: 'system_notification',
        data: { message: `已订阅应用: ${data.appId}` },
        timestamp: Date.now()
      })
      logger.debug('客户端订阅应用', { clientId, appId: data.appId })
    }
  }

  /**
   * 取消订阅应用更新
   */
  private handleUnsubscribeApp(clientId: string, data: { appId: string }): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedApps.delete(data.appId)
      logger.debug('客户端取消订阅应用', { clientId, appId: data.appId })
    }
  }

  /**
   * 订阅应用绑定更新
   */
  private handleSubscribeAppBindings(clientId: string, data?: any): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedAppBindings = true
      this.sendToClient(clientId, {
        type: 'system_notification',
        data: { message: '已订阅应用绑定更新' },
        timestamp: Date.now()
      })
      logger.debug('客户端订阅应用绑定更新', { clientId })
    }
  }

  /**
   * 取消订阅应用绑定更新
   */
  private handleUnsubscribeAppBindings(clientId: string, data?: any): void {
    const client = this.clients.get(clientId)
    if (client) {
      client.subscribedAppBindings = false
      logger.debug('客户端取消订阅应用绑定更新', { clientId })
    }
  }

  /**
   * 订阅日志更新
   */
  private handleSubscribeLogs(clientId: string, data: {
    appIds?: string[]
    levels?: string[]
    sources?: string[]
    systemLogs?: boolean
  }): void {
    const client = this.clients.get(clientId)
    if (client) {
      // 清空现有订阅
      client.subscribedLogs.appIds.clear()
      client.subscribedLogs.levels.clear()
      client.subscribedLogs.sources.clear()
      client.subscribedLogs.systemLogs = false

      // 添加新订阅
      if (data.appIds) {
        data.appIds.forEach(appId => client.subscribedLogs.appIds.add(appId))
      }
      if (data.levels) {
        data.levels.forEach(level => client.subscribedLogs.levels.add(level))
      }
      if (data.sources) {
        data.sources.forEach(source => client.subscribedLogs.sources.add(source))
      }
      if (data.systemLogs !== undefined) {
        client.subscribedLogs.systemLogs = data.systemLogs
      }

      this.sendToClient(clientId, {
        type: 'system_notification',
        data: {
          message: '已订阅日志更新',
          subscription: {
            appIds: Array.from(client.subscribedLogs.appIds),
            levels: Array.from(client.subscribedLogs.levels),
            sources: Array.from(client.subscribedLogs.sources),
            systemLogs: client.subscribedLogs.systemLogs
          }
        },
        timestamp: Date.now()
      })

      logger.debug('客户端订阅日志', {
        clientId,
        appIds: Array.from(client.subscribedLogs.appIds),
        levels: Array.from(client.subscribedLogs.levels),
        sources: Array.from(client.subscribedLogs.sources),
        systemLogs: client.subscribedLogs.systemLogs
      })
    }
  }

  /**
   * 取消订阅日志更新
   */
  private handleUnsubscribeLogs(clientId: string, data: {
    appIds?: string[]
    levels?: string[]
    sources?: string[]
    systemLogs?: boolean
  }): void {
    const client = this.clients.get(clientId)
    if (client) {
      // 移除指定订阅
      if (data.appIds) {
        data.appIds.forEach(appId => client.subscribedLogs.appIds.delete(appId))
      }
      if (data.levels) {
        data.levels.forEach(level => client.subscribedLogs.levels.delete(level))
      }
      if (data.sources) {
        data.sources.forEach(source => client.subscribedLogs.sources.delete(source))
      }
      if (data.systemLogs === true) {
        client.subscribedLogs.systemLogs = false
      }

      logger.debug('客户端取消订阅日志', {
        clientId,
        removedAppIds: data.appIds,
        removedLevels: data.levels,
        removedSources: data.sources,
        removedSystemLogs: data.systemLogs
      })
    }
  }

  /**
   * 处理客户端ping
   */
  private handleClientPing(clientId: string): void {
    this.sendToClient(clientId, {
      type: 'system_notification',
      data: { message: 'pong', serverTime: Date.now() },
      timestamp: Date.now()
    })
  }

  /**
   * 广播构建进度更新
   */
  broadcastBuildProgress(update: BuildProgressUpdate): void {
    const message: WebSocketMessage = {
      type: 'build_progress',
      data: update,
      timestamp: Date.now(),
      executionId: update.executionId,
      appId: update.appId
    }

    this.broadcastToSubscribers(message, update.executionId, update.appId)
  }

  /**
   * 广播构建日志更新
   */
  broadcastBuildLog(log: BuildLogUpdate): void {
    const message: WebSocketMessage = {
      type: 'build_log',
      data: log,
      timestamp: Date.now(),
      executionId: log.executionId,
      appId: log.appId
    }

    this.broadcastToSubscribers(message, log.executionId, log.appId)
  }

  /**
   * 广播构建状态变更
   */
  broadcastBuildStatus(executionId: string, appId: string, status: string, data?: any): void {
    const message: WebSocketMessage = {
      type: 'build_status',
      data: { status, ...data },
      timestamp: Date.now(),
      executionId,
      appId
    }

    this.broadcastToSubscribers(message, executionId, appId)
  }

  /**
   * 广播构建完成
   */
  broadcastBuildComplete(executionId: string, appId: string, result: any): void {
    const message: WebSocketMessage = {
      type: 'build_complete',
      data: result,
      timestamp: Date.now(),
      executionId,
      appId
    }

    this.broadcastToSubscribers(message, executionId, appId)
  }

  /**
   * 广播构建错误
   */
  broadcastBuildError(executionId: string, appId: string, error: any): void {
    const message: WebSocketMessage = {
      type: 'build_error',
      data: error,
      timestamp: Date.now(),
      executionId,
      appId
    }

    this.broadcastToSubscribers(message, executionId, appId)
  }

  /**
   * 广播日志更新
   */
  broadcastLog(log: LogUpdate): void {
    const message: WebSocketMessage = {
      type: 'log',
      payload: log,
      timestamp: Date.now(),
      appId: log.appId
    }

    this.broadcastLogToSubscribers(message, log)
  }

  /**
   * 向所有连接的客户端广播消息
   */
  private broadcast(message: WebSocketMessage): void {
    let sentCount = 0

    for (const client of this.clients.values()) {
      this.sendToClient(client.id, message)
      sentCount++
    }

    logger.debug('WebSocket消息广播完成', {
      type: message.type,
      sentCount,
      totalClients: this.clients.size
    })
  }

  /**
   * 向订阅者广播消息
   */
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

      if (shouldSend) {
        this.sendToClient(client.id, message)
        sentCount++
      }
    }

    logger.debug('WebSocket消息广播完成', {
      type: message.type,
      executionId,
      appId,
      sentCount,
      totalClients: this.clients.size
    })
  }

  /**
   * 向日志订阅者广播日志消息
   */
  private broadcastLogToSubscribers(message: WebSocketMessage, log: LogUpdate): void {
    let sentCount = 0

    for (const client of this.clients.values()) {
      let shouldSend = false

      // 检查是否订阅了系统日志
      if (!log.appId && client.subscribedLogs.systemLogs) {
        shouldSend = true
      }

      // 检查是否订阅了特定应用的日志
      if (log.appId && (
        client.subscribedLogs.appIds.has(log.appId) ||
        client.subscribedLogs.appIds.size === 0 && client.subscribedLogs.systemLogs
      )) {
        shouldSend = true
      }

      // 检查日志级别过滤
      if (shouldSend && client.subscribedLogs.levels.size > 0) {
        shouldSend = client.subscribedLogs.levels.has(log.level)
      }

      // 检查日志来源过滤
      if (shouldSend && client.subscribedLogs.sources.size > 0) {
        shouldSend = client.subscribedLogs.sources.has(log.source)
      }

      if (shouldSend) {
        this.sendToClient(client.id, message)
        sentCount++
      }
    }

    logger.debug('日志消息广播完成', {
      logId: log.id,
      level: log.level,
      source: log.source,
      appId: log.appId,
      sentCount,
      totalClients: this.clients.size
    })
  }

  /**
   * 向特定客户端发送消息
   */
  private sendToClient(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message))
      } catch (error) {
        logger.error('发送WebSocket消息失败', { error, clientId })
        this.clients.delete(clientId)
      }
    }
  }

  /**
   * 向所有连接的客户端广播消息
   */
  private broadcastToAllClients(message: WebSocketMessage): void {
    let sentCount = 0
    
    for (const [clientId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        this.sendToClient(clientId, message)
        sentCount++
      }
    }
    
    logger.debug('消息已广播给所有客户端', {
      messageType: message.type,
      sentCount,
      totalClients: this.clients.size
    })
  }

  /**
   * 启动心跳检测
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          // 客户端未响应，断开连接
          client.ws.terminate()
          this.clients.delete(clientId)
          logger.warn('WebSocket客户端心跳超时，已断开连接', { clientId })
        } else {
          // 发送ping
          client.isAlive = false
          try {
            client.ws.ping()
          } catch (error) {
            logger.error('发送WebSocket ping失败', { error, clientId })
            this.clients.delete(clientId)
          }
        }
      }
    }, this.PING_INTERVAL)
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 这里可以监听其他服务的事件
    this.on('build_progress_update', this.broadcastBuildProgress.bind(this))
    this.on('build_log_update', this.broadcastBuildLog.bind(this))
    this.on('build_status_change', this.broadcastBuildStatus.bind(this))
    this.on('build_complete', this.broadcastBuildComplete.bind(this))
    this.on('build_error', this.broadcastBuildError.bind(this))
    this.on('log_update', this.broadcastLog.bind(this))
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取连接统计信息
   */
  getStats(): {
    totalClients: number
    activeClients: number
    subscriptions: {
      builds: number
      apps: number
      logs: {
        appIds: number
        levels: number
        sources: number
        systemLogs: number
      }
    }
  } {
    let buildSubscriptions = 0
    let appSubscriptions = 0
    let logAppIdSubscriptions = 0
    let logLevelSubscriptions = 0
    let logSourceSubscriptions = 0
    let systemLogSubscriptions = 0
    let activeClients = 0

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        activeClients++
      }
      buildSubscriptions += client.subscribedBuilds.size
      appSubscriptions += client.subscribedApps.size
      logAppIdSubscriptions += client.subscribedLogs.appIds.size
      logLevelSubscriptions += client.subscribedLogs.levels.size
      logSourceSubscriptions += client.subscribedLogs.sources.size
      if (client.subscribedLogs.systemLogs) {
        systemLogSubscriptions++
      }
    }

    return {
      totalClients: this.clients.size,
      activeClients,
      subscriptions: {
        builds: buildSubscriptions,
        apps: appSubscriptions,
        logs: {
          appIds: logAppIdSubscriptions,
          levels: logLevelSubscriptions,
          sources: logSourceSubscriptions,
          systemLogs: systemLogSubscriptions
        }
      }
    }
  }

  /**
   * 广播端口统计更新
   */
  broadcastPortStatistics(statistics: PortStatisticsUpdate): void {
    const message: WebSocketMessage = {
      type: 'port_statistics',
      data: statistics,
      timestamp: Date.now()
    }
    this.broadcast(message)
    logger.debug('Broadcasted port statistics update')
  }

  /**
   * 广播端口状态更新
   */
  broadcastPortStatus(status: PortStatusUpdate): void {
    const message: WebSocketMessage = {
      type: 'port_status',
      data: status,
      timestamp: Date.now()
    }
    this.broadcast(message)
    logger.debug(`Broadcasted port status update for port ${status.port}`)
  }

  /**
   * 广播端口分配更新
   */
  broadcastPortAllocation(allocation: PortAllocationUpdate): void {
    const message: WebSocketMessage = {
      type: 'port_allocation',
      data: allocation,
      timestamp: Date.now()
    }
    this.broadcast(message)
    logger.debug(`Broadcasted port allocation update for port ${allocation.port}`)
  }

  /**
   * 广播端口冲突更新
   */
  broadcastPortConflict(conflict: PortConflictUpdate): void {
    const message: WebSocketMessage = {
      type: 'port_conflict',
      data: conflict,
      timestamp: Date.now()
    }
    this.broadcast(message)
    logger.warn(`Broadcasted port conflict update for port ${conflict.port}`)
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
      data: update,
      timestamp: Date.now()
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
      if (client.subscribedAppBindings) {
        this.sendToClient(client.id, message)
        sentCount++
      }
    }

    logger.debug('应用绑定消息广播完成', {
      type: message.type,
      sentCount,
      totalClients: this.clients.size,
      subscribedClients: sentCount
    })
  }

  /**
   * 从请求中提取Token
   */
  private extractToken(request: any): string | null {
    try {
      // 1. 标准 Authorization 头（非浏览器客户端）
      const authorization = request.headers['authorization']
      if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
        return authorization.slice(7).trim()
      }

      // 2. 通过 Sec-WebSocket-Protocol 子协议传递 Token（浏览器推荐）
      const protocolHeader = request.headers['sec-websocket-protocol']
      const protocols = Array.isArray(protocolHeader)
        ? protocolHeader.flatMap((value: string) => value.split(','))
        : typeof protocolHeader === 'string'
          ? protocolHeader.split(',')
          : []

      const normalizedProtocols = protocols
        .map(protocol => protocol.trim())
        .filter(Boolean)

      for (const protocol of normalizedProtocols) {
        if (protocol.startsWith(WS_PROTOCOL_TOKEN_PREFIX)) {
          return protocol.slice(WS_PROTOCOL_TOKEN_PREFIX.length).trim()
        }

        // 兼容旧约定：Bearer.<token>
        if (protocol.startsWith('Bearer.')) {
          return protocol.slice('Bearer.'.length).trim()
        }
      }

      // 3. 兼容模式：仅在显式允许时接受URL query token
      const allowQueryToken = TRUTHY_VALUES.has(
        (process.env.WS_ALLOW_QUERY_TOKEN || '').trim().toLowerCase()
      )
      if (allowQueryToken) {
        const url = parseUrl(request.url || '', true)
        if (url.query?.token) {
          logger.warn('WebSocket使用了已弃用的query token，请迁移到Sec-WebSocket-Protocol')
          return decodeURIComponent(url.query.token as string)
        }
      }

      return null
    } catch (error) {
      logger.error('提取WebSocket Token失败', { error })
      return null
    }
  }

  /**
   * 关闭WebSocket服务
   */
  close(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    for (const client of this.clients.values()) {
      client.ws.close()
    }

    if (this.wss) {
      this.wss.close()
    }

    this.clients.clear()
    logger.info('WebSocket服务已关闭')
  }

  /**
   * 创建增强的WebSocket错误
   */
  private async createWebSocketError(
    error: Error,
    clientId: string,
    operation: string
  ): Promise<DetectionError> {
    const errorMessage = error.message;
    let errorCode = ErrorCode.INTERNAL_ERROR;
    let severity = ErrorSeverity.MEDIUM;
    let suggestions: string[] = [];

    // 根据错误类型和消息分析具体问题
    if (errorMessage.includes('WebSocket is not open')) {
      errorCode = ErrorCode.CONNECTION_REFUSED;
      severity = ErrorSeverity.LOW;
      suggestions = [
        '检查客户端连接状态',
        '确保WebSocket连接已建立',
        '实现自动重连机制'
      ];
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      errorCode = ErrorCode.INVALID_FORMAT;
      severity = ErrorSeverity.MEDIUM;
      suggestions = [
        '验证客户端发送的消息格式',
        '检查JSON序列化/反序列化',
        '添加消息格式验证'
      ];
    } else if (errorMessage.includes('timeout')) {
      errorCode = ErrorCode.NETWORK_TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
      suggestions = [
        '检查网络连接稳定性',
        '调整心跳检测间隔',
        '优化消息处理性能'
      ];
    } else if (operation === 'message_processing') {
      errorCode = ErrorCode.INTERNAL_ERROR;
      severity = ErrorSeverity.HIGH;
      suggestions = [
        '检查消息处理逻辑',
        '验证消息类型支持',
        '添加消息验证机制'
      ];
    }

    const client = this.clients.get(clientId);
    const connectionInfo = client ? {
      subscriptions: {
        builds: client.subscribedBuilds.size,
        apps: client.subscribedApps.size,
        appBindings: client.subscribedAppBindings,
        logs: {
          appIds: client.subscribedLogs.appIds.size,
          levels: client.subscribedLogs.levels.size,
          sources: client.subscribedLogs.sources.size,
          systemLogs: client.subscribedLogs.systemLogs
        }
      },
      lastPing: new Date(client.lastPing).toISOString(),
      isAlive: client.isAlive
    } : null;

    return new DetectionError(
      errorCode,
      `WebSocket操作失败 [${operation}]: ${errorMessage}`,
      {
        category: ErrorCategory.NETWORK,
        severity,
        context: {
          operation,
          connectionInfo,
          totalClients: this.clients.size,
          timestamp: new Date().toISOString()
        } as any
      }
    );
  }
}

// 创建WebSocket服务实例
export const websocketService = new WebSocketService()
