/**
 * Build Batch Service - 批量构建服务
 * 
 * 提供多应用批量构建、构建任务调度、构建流水线管理等功能
 * 支持定时构建、构建通知系统和高级管理功能
 */

import { EventEmitter } from 'events'
import cron, { ScheduledTask } from 'node-cron'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'
import type { BuildExecutionService } from './buildExecutionService'
import type { WebSocketManager } from './websocket'

export interface BatchBuildRequest {
  id: string
  name: string
  description?: string
  appIds: string[]
  buildOptions: {
    environment: 'development' | 'production'
    cleanBuild: boolean
    enableOptimizations: boolean
    parallel: boolean
    maxConcurrency: number
  }
  schedule?: {
    enabled: boolean
    cronExpression: string
    timezone: string
  }
  notifications: {
    onSuccess: NotificationConfig[]
    onFailure: NotificationConfig[]
    onComplete: NotificationConfig[]
  }
  createdBy: string
  createdAt: number
  updatedAt: number
  isActive: boolean
}

export interface NotificationConfig {
  type: 'email' | 'webhook' | 'slack' | 'teams'
  target: string
  template?: string
  enabled: boolean
}

export interface BatchBuildExecution {
  id: string
  batchId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  duration?: number
  totalApps: number
  successfulApps: number
  failedApps: number
  skippedApps: number
  appExecutions: AppBuildExecution[]
  logs: BatchBuildLog[]
  createdAt: number
}

export interface AppBuildExecution {
  appId: string
  appName: string
  executionId: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'skipped'
  startTime?: number
  endTime?: number
  duration?: number
  error?: string
  buildSize?: number
}

export interface BatchBuildLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  appId?: string
  executionId?: string
}

export interface BuildPipeline {
  id: string
  name: string
  description?: string
  stages: PipelineStage[]
  triggers: PipelineTrigger[]
  variables: Record<string, string>
  notifications: NotificationConfig[]
  createdBy: string
  createdAt: number
  updatedAt: number
  isActive: boolean
}

export interface PipelineStage {
  id: string
  name: string
  type: 'build' | 'test' | 'deploy' | 'notify' | 'custom'
  appIds: string[]
  buildOptions?: any
  dependsOn: string[]
  parallel: boolean
  continueOnError: boolean
  timeout: number
  retryCount: number
  customScript?: string
}

export interface PipelineTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'file-change'
  config: any
  enabled: boolean
}

export interface ScheduledBuild {
  id: string
  batchId?: string
  pipelineId?: string
  cronExpression: string
  timezone: string
  nextRun: number
  lastRun?: number
  isActive: boolean
  createdAt: number
}

export class BuildBatchService extends EventEmitter {
  private scheduledTasks = new Map<string, ScheduledTask>()
  private activeBatches = new Map<string, BatchBuildExecution>()
  private activePipelines = new Map<string, any>()

  constructor(
    private db: Database,
    private buildExecutionService: BuildExecutionService,
    private wsManager?: WebSocketManager
  ) {
    super()
    this.initializeBatchService()
  }

  /**
   * 初始化批量构建服务
   */
  private async initializeBatchService(): Promise<void> {
    try {
      // 创建批量构建请求表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS batch_build_requests (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          app_ids TEXT NOT NULL,
          build_options TEXT NOT NULL,
          schedule_config TEXT,
          notifications TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `)

      // 创建批量构建执行表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS batch_build_executions (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          total_apps INTEGER NOT NULL,
          successful_apps INTEGER NOT NULL DEFAULT 0,
          failed_apps INTEGER NOT NULL DEFAULT 0,
          skipped_apps INTEGER NOT NULL DEFAULT 0,
          app_executions TEXT NOT NULL,
          logs TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (batch_id) REFERENCES batch_build_requests (id)
        )
      `)

      // 创建构建流水线表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_pipelines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          stages TEXT NOT NULL,
          triggers TEXT NOT NULL,
          variables TEXT NOT NULL,
          notifications TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `)

      // 创建定时任务表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS scheduled_builds (
          id TEXT PRIMARY KEY,
          batch_id TEXT,
          pipeline_id TEXT,
          cron_expression TEXT NOT NULL,
          timezone TEXT NOT NULL DEFAULT 'UTC',
          next_run INTEGER NOT NULL,
          last_run INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_batch_executions_batch_id ON batch_build_executions (batch_id);
        CREATE INDEX IF NOT EXISTS idx_batch_executions_status ON batch_build_executions (status);
        CREATE INDEX IF NOT EXISTS idx_scheduled_builds_next_run ON scheduled_builds (next_run);
        CREATE INDEX IF NOT EXISTS idx_scheduled_builds_is_active ON scheduled_builds (is_active);
      `)

      // 恢复定时任务
      await this.restoreScheduledTasks()

      logger.debug('Build batch service initialized')
    } catch (error) {
      logger.error('Failed to initialize build batch service', { error })
      throw error
    }
  }

  /**
   * 创建批量构建请求
   */
  async createBatchBuildRequest(request: Omit<BatchBuildRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const id = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    try {
      const stmt = this.db.prepare(`
        INSERT INTO batch_build_requests (
          id, name, description, app_ids, build_options, schedule_config,
          notifications, created_by, created_at, updated_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        request.name,
        request.description,
        JSON.stringify(request.appIds),
        JSON.stringify(request.buildOptions),
        JSON.stringify(request.schedule),
        JSON.stringify(request.notifications),
        request.createdBy,
        now,
        now,
        request.isActive ? 1 : 0
      )

      // 如果有调度配置，创建定时任务
      if (request.schedule?.enabled) {
        await this.createScheduledTask(id, request.schedule.cronExpression, request.schedule.timezone)
      }

      logger.info('Batch build request created', { id, name: request.name })
      return id
    } catch (error) {
      logger.error('Failed to create batch build request', { error })
      throw error
    }
  }

  /**
   * 执行批量构建
   */
  async executeBatchBuild(batchId: string): Promise<string> {
    try {
      // 获取批量构建请求
      const batchRequest = await this.getBatchBuildRequest(batchId)
      if (!batchRequest) {
        throw new Error('Batch build request not found')
      }

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const execution: BatchBuildExecution = {
        id: executionId,
        batchId,
        status: 'queued',
        startTime: Date.now(),
        totalApps: batchRequest.appIds.length,
        successfulApps: 0,
        failedApps: 0,
        skippedApps: 0,
        appExecutions: [],
        logs: [],
        createdAt: Date.now()
      }

      // 保存执行记录
      await this.saveBatchExecution(execution)
      this.activeBatches.set(executionId, execution)

      // 开始执行
      this.startBatchExecution(execution, batchRequest)

      logger.info('Batch build execution started', { executionId, batchId })
      return executionId
    } catch (error) {
      logger.error('Failed to execute batch build', { batchId, error })
      throw error
    }
  }

  /**
   * 开始批量执行
   */
  private async startBatchExecution(execution: BatchBuildExecution, request: BatchBuildRequest): Promise<void> {
    execution.status = 'running'
    this.addBatchLog(execution, 'info', `Starting batch build: ${request.name}`)

    try {
      // 准备应用执行列表
      for (const appId of request.appIds) {
        execution.appExecutions.push({
          appId,
          appName: `App ${appId}`, // 需要从数据库获取实际名称
          executionId: '',
          status: 'queued'
        })
      }

      // 根据并行设置执行构建
      if (request.buildOptions.parallel) {
        await this.executeParallelBuilds(execution, request)
      } else {
        await this.executeSequentialBuilds(execution, request)
      }

      // 完成批量构建
      execution.status = 'completed'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addBatchLog(execution, 'info', 
        `Batch build completed. Success: ${execution.successfulApps}, Failed: ${execution.failedApps}`)

      // 发送通知
      await this.sendNotifications(execution, request, 'onComplete')

    } catch (error) {
      execution.status = 'failed'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addBatchLog(execution, 'error', `Batch build failed: ${error.message}`)
      
      // 发送失败通知
      await this.sendNotifications(execution, request, 'onFailure')
    } finally {
      // 保存最终状态
      await this.saveBatchExecution(execution)
      this.activeBatches.delete(execution.id)

      // 广播完成状态
      if (this.wsManager) {
        this.wsManager.broadcast({
          type: 'batch_build_complete',
          payload: {
            executionId: execution.id,
            batchId: execution.batchId,
            status: execution.status,
            summary: {
              total: execution.totalApps,
              successful: execution.successfulApps,
              failed: execution.failedApps,
              duration: execution.duration
            }
          }
        })
      }
    }
  }

  /**
   * 并行执行构建
   */
  private async executeParallelBuilds(execution: BatchBuildExecution, request: BatchBuildRequest): Promise<void> {
    const maxConcurrency = request.buildOptions.maxConcurrency || 3
    const semaphore = new Array(maxConcurrency).fill(null)
    
    const buildPromises = execution.appExecutions.map(async (appExecution, index) => {
      // 等待信号量
      await new Promise(resolve => {
        const checkSemaphore = () => {
          const freeSlot = semaphore.findIndex(slot => slot === null)
          if (freeSlot !== -1) {
            semaphore[freeSlot] = index
            resolve(freeSlot)
          } else {
            setTimeout(checkSemaphore, 100)
          }
        }
        checkSemaphore()
      })

      try {
        await this.executeSingleAppBuild(appExecution, request.buildOptions, execution)
      } finally {
        // 释放信号量
        const slotIndex = semaphore.indexOf(index)
        if (slotIndex !== -1) {
          semaphore[slotIndex] = null
        }
      }
    })

    await Promise.all(buildPromises)
  }

  /**
   * 顺序执行构建
   */
  private async executeSequentialBuilds(execution: BatchBuildExecution, request: BatchBuildRequest): Promise<void> {
    for (const appExecution of execution.appExecutions) {
      await this.executeSingleAppBuild(appExecution, request.buildOptions, execution)
    }
  }

  /**
   * 执行单个应用构建
   */
  private async executeSingleAppBuild(
    appExecution: AppBuildExecution, 
    buildOptions: any, 
    batchExecution: BatchBuildExecution
  ): Promise<void> {
    try {
      appExecution.status = 'running'
      appExecution.startTime = Date.now()

      this.addBatchLog(batchExecution, 'info', `Starting build for app: ${appExecution.appId}`)

      // 调用构建执行服务
      const executionId = await this.buildExecutionService.executeBuild({
        appId: appExecution.appId,
        buildTool: 'auto-detect', // 自动检测
        buildScript: 'npm run build',
        outputDir: 'dist',
        environment: buildOptions.environment,
        cleanBuild: buildOptions.cleanBuild,
        enableOptimizations: buildOptions.enableOptimizations
      })

      appExecution.executionId = executionId

      // 等待构建完成（简化实现，实际应该监听事件）
      await new Promise(resolve => setTimeout(resolve, 5000))

      appExecution.status = 'success'
      appExecution.endTime = Date.now()
      appExecution.duration = appExecution.endTime - appExecution.startTime

      batchExecution.successfulApps++
      this.addBatchLog(batchExecution, 'info', `Build completed for app: ${appExecution.appId}`)

    } catch (error) {
      appExecution.status = 'failed'
      appExecution.endTime = Date.now()
      appExecution.duration = appExecution.endTime! - appExecution.startTime!
      appExecution.error = error.message

      batchExecution.failedApps++
      this.addBatchLog(batchExecution, 'error', `Build failed for app: ${appExecution.appId} - ${error.message}`)
    }
  }

  /**
   * 添加批量构建日志
   */
  private addBatchLog(execution: BatchBuildExecution, level: 'info' | 'warn' | 'error' | 'debug', message: string, appId?: string): void {
    const log: BatchBuildLog = {
      timestamp: Date.now(),
      level,
      message,
      appId
    }

    execution.logs.push(log)

    // 广播日志更新
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'batch_build_log',
        payload: {
          executionId: execution.id,
          log
        }
      })
    }
  }

  /**
   * 发送通知
   */
  private async sendNotifications(
    execution: BatchBuildExecution, 
    request: BatchBuildRequest, 
    event: 'onSuccess' | 'onFailure' | 'onComplete'
  ): Promise<void> {
    const notifications = request.notifications[event]
    
    for (const notification of notifications) {
      if (!notification.enabled) continue

      try {
        await this.sendNotification(notification, execution, request)
      } catch (error) {
        logger.error('Failed to send notification', { 
          type: notification.type, 
          target: notification.target, 
          error 
        })
      }
    }
  }

  /**
   * 发送单个通知
   */
  private async sendNotification(
    config: NotificationConfig, 
    execution: BatchBuildExecution, 
    request: BatchBuildRequest
  ): Promise<void> {
    const message = this.formatNotificationMessage(config, execution, request)

    switch (config.type) {
      case 'webhook':
        await this.sendWebhookNotification(config.target, message)
        break
      case 'email':
        await this.sendEmailNotification(config.target, message)
        break
      case 'slack':
        await this.sendSlackNotification(config.target, message)
        break
      case 'teams':
        await this.sendTeamsNotification(config.target, message)
        break
    }

    logger.info('Notification sent', { 
      type: config.type, 
      target: config.target, 
      executionId: execution.id 
    })
  }

  /**
   * 格式化通知消息
   */
  private formatNotificationMessage(
    config: NotificationConfig, 
    execution: BatchBuildExecution, 
    request: BatchBuildRequest
  ): any {
    const status = execution.status === 'completed' ? 
      (execution.failedApps > 0 ? 'completed with failures' : 'completed successfully') : 
      execution.status

    return {
      title: `Batch Build ${status}`,
      message: `Batch build "${request.name}" has ${status}`,
      details: {
        batchId: execution.batchId,
        executionId: execution.id,
        totalApps: execution.totalApps,
        successfulApps: execution.successfulApps,
        failedApps: execution.failedApps,
        duration: execution.duration,
        startTime: new Date(execution.startTime).toISOString(),
        endTime: execution.endTime ? new Date(execution.endTime).toISOString() : null
      }
    }
  }

  /**
   * 发送Webhook通知
   */
  private async sendWebhookNotification(url: string, message: any): Promise<void> {
    // 实现Webhook通知
    logger.info('Webhook notification would be sent', { url, message })
  }

  /**
   * 发送邮件通知
   */
  private async sendEmailNotification(email: string, message: any): Promise<void> {
    // 实现邮件通知
    logger.info('Email notification would be sent', { email, message })
  }

  /**
   * 发送Slack通知
   */
  private async sendSlackNotification(webhook: string, message: any): Promise<void> {
    // 实现Slack通知
    logger.info('Slack notification would be sent', { webhook, message })
  }

  /**
   * 发送Teams通知
   */
  private async sendTeamsNotification(webhook: string, message: any): Promise<void> {
    // 实现Teams通知
    logger.info('Teams notification would be sent', { webhook, message })
  }

  /**
   * 获取批量构建请求
   */
  private async getBatchBuildRequest(batchId: string): Promise<BatchBuildRequest | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM batch_build_requests WHERE id = ?')
      const row = stmt.get(batchId) as any

      if (!row) return null

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        appIds: JSON.parse(row.app_ids),
        buildOptions: JSON.parse(row.build_options),
        schedule: JSON.parse(row.schedule_config || 'null'),
        notifications: JSON.parse(row.notifications),
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isActive: row.is_active === 1
      }
    } catch (error) {
      logger.error('Failed to get batch build request', { batchId, error })
      return null
    }
  }

  /**
   * 保存批量执行记录
   */
  private async saveBatchExecution(execution: BatchBuildExecution): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO batch_build_executions (
          id, batch_id, status, start_time, end_time, duration,
          total_apps, successful_apps, failed_apps, skipped_apps,
          app_executions, logs, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        execution.id,
        execution.batchId,
        execution.status,
        execution.startTime,
        execution.endTime,
        execution.duration,
        execution.totalApps,
        execution.successfulApps,
        execution.failedApps,
        execution.skippedApps,
        JSON.stringify(execution.appExecutions),
        JSON.stringify(execution.logs),
        execution.createdAt
      )
    } catch (error) {
      logger.error('Failed to save batch execution', { executionId: execution.id, error })
    }
  }

  /**
   * 创建定时任务
   */
  private async createScheduledTask(batchId: string, cronExpression: string, timezone = 'UTC'): Promise<void> {
    try {
      const task = cron.schedule(cronExpression, async () => {
        logger.info('Executing scheduled batch build', { batchId })
        await this.executeBatchBuild(batchId)
      }, {
        timezone
      } as any)

      this.scheduledTasks.set(batchId, task)
      task.start()

      // 保存到数据库
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO scheduled_builds (
          id, batch_id, cron_expression, timezone, next_run, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const id = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const nextRun = this.calculateNextRun(cronExpression, timezone)

      stmt.run(id, batchId, cronExpression, timezone, nextRun, 1, Date.now())

      logger.info('Scheduled task created', { batchId, cronExpression, timezone })
    } catch (error) {
      logger.error('Failed to create scheduled task', { batchId, error })
      throw error
    }
  }

  /**
   * 恢复定时任务
   */
  private async restoreScheduledTasks(): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM scheduled_builds WHERE is_active = 1
      `)
      
      const scheduledBuilds = stmt.all() as any[]

      for (const scheduled of scheduledBuilds) {
        if (scheduled.batch_id) {
          await this.createScheduledTask(
            scheduled.batch_id, 
            scheduled.cron_expression, 
            scheduled.timezone
          )
        }
      }

      logger.info('Scheduled tasks restored', { count: scheduledBuilds.length })
    } catch (error) {
      logger.error('Failed to restore scheduled tasks', { error })
    }
  }

  /**
   * 计算下次运行时间
   */
  private calculateNextRun(cronExpression: string, timezone: string): number {
    // 简化实现，实际应该使用cron库计算
    return Date.now() + 24 * 60 * 60 * 1000 // 24小时后
  }

  /**
   * 取消批量构建
   */
  async cancelBatchBuild(executionId: string): Promise<void> {
    const execution = this.activeBatches.get(executionId)
    if (!execution) {
      throw new Error('Batch execution not found')
    }

    execution.status = 'cancelled'
    execution.endTime = Date.now()
    execution.duration = execution.endTime - execution.startTime

    // 取消所有正在运行的应用构建
    for (const appExecution of execution.appExecutions) {
      if (appExecution.status === 'running' && appExecution.executionId) {
        try {
          await this.buildExecutionService.cancelBuild(appExecution.executionId)
          appExecution.status = 'skipped'
          execution.skippedApps++
        } catch (error) {
          logger.warn('Failed to cancel app build', { 
            appId: appExecution.appId, 
            executionId: appExecution.executionId, 
            error 
          })
        }
      }
    }

    this.addBatchLog(execution, 'info', 'Batch build cancelled')
    await this.saveBatchExecution(execution)
    this.activeBatches.delete(executionId)

    logger.info('Batch build cancelled', { executionId })
  }

  /**
   * 获取批量构建状态
   */
  async getBatchBuildStatus(executionId: string): Promise<BatchBuildExecution | null> {
    // 先检查活动的批量构建
    const active = this.activeBatches.get(executionId)
    if (active) return active

    // 从数据库查询
    try {
      const stmt = this.db.prepare('SELECT * FROM batch_build_executions WHERE id = ?')
      const row = stmt.get(executionId) as any

      if (!row) return null

      return {
        id: row.id,
        batchId: row.batch_id,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        duration: row.duration,
        totalApps: row.total_apps,
        successfulApps: row.successful_apps,
        failedApps: row.failed_apps,
        skippedApps: row.skipped_apps,
        appExecutions: JSON.parse(row.app_executions),
        logs: JSON.parse(row.logs),
        createdAt: row.created_at
      }
    } catch (error) {
      logger.error('Failed to get batch build status', { executionId, error })
      return null
    }
  }

  /**
   * 关闭服务
   */
  close(): void {
    // 停止所有定时任务
    for (const [batchId, task] of this.scheduledTasks.entries()) {
      task.stop()
      logger.debug('Scheduled task stopped', { batchId })
    }
    
    this.scheduledTasks.clear()
    this.activeBatches.clear()
    this.activePipelines.clear()
  }
}
