/**
 * Build Queue Manager - 构建队列管理器
 * 
 * 负责管理构建任务队列，支持优先级、并发控制、重试机制
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import { BuildExecutionService, BuildExecutionOptions, BuildProgress } from './buildExecutionService'

export interface QueuedBuild extends BuildExecutionOptions {
  id: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  queueTime: number
  retryCount: number
  maxRetries: number
  dependencies?: string[] // 依赖的其他构建任务
}

export interface QueueStats {
  total: number
  queued: number
  running: number
  completed: number
  failed: number
  cancelled: number
}

export class BuildQueueManager extends EventEmitter {
  private queue: QueuedBuild[] = []
  private runningBuilds = new Map<string, QueuedBuild>()
  private completedBuilds = new Map<string, QueuedBuild>()
  private failedBuilds = new Map<string, QueuedBuild>()
  private buildIdToExecutionId = new Map<string, string>() // 映射 queueId 到 executionId
  private maxConcurrentBuilds: number
  private processingInterval: NodeJS.Timeout | null = null

  constructor(
    private buildExecutionService: BuildExecutionService,
    maxConcurrentBuilds = 3
  ) {
    super()
    this.maxConcurrentBuilds = maxConcurrentBuilds
    this.setupEventListeners()
    this.startProcessing()
  }

  /**
   * 添加构建任务到队列
   */
  async addBuild(
    options: BuildExecutionOptions,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    maxRetries = 3
  ): Promise<string> {
    const queuedBuild: QueuedBuild = {
      ...options,
      id: this.generateBuildId(),
      priority,
      queueTime: Date.now(),
      retryCount: 0,
      maxRetries
    }

    // 检查是否已有相同应用的构建任务
    const existingBuild = this.findExistingBuild(options.appId)
    if (existingBuild) {
      if (existingBuild.priority === 'urgent' || priority === 'urgent') {
        // 如果是紧急任务，取消现有任务
        await this.cancelBuild(existingBuild.id)
      } else {
        throw new Error(`应用 ${options.appId} 已有构建任务在队列中`)
      }
    }

    // 根据优先级插入队列
    this.insertByPriority(queuedBuild)
    
    this.emit('buildQueued', queuedBuild)
    logger.info(`构建任务已加入队列: ${queuedBuild.id} (应用: ${queuedBuild.appId}, 优先级: ${priority})`)

    return queuedBuild.id
  }

  /**
   * 根据优先级插入队列
   */
  private insertByPriority(build: QueuedBuild) {
    const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 }
    const buildPriority = priorityOrder[build.priority]

    let insertIndex = this.queue.length
    for (let i = 0; i < this.queue.length; i++) {
      const queuePriority = priorityOrder[this.queue[i].priority]
      if (buildPriority > queuePriority) {
        insertIndex = i
        break
      }
    }

    this.queue.splice(insertIndex, 0, build)
  }

  /**
   * 查找现有构建任务
   */
  private findExistingBuild(appId: string): QueuedBuild | undefined {
    // 检查队列中的任务
    const queuedBuild = this.queue.find(build => build.appId === appId)
    if (queuedBuild) return queuedBuild

    // 检查运行中的任务
    for (const build of this.runningBuilds.values()) {
      if (build.appId === appId) return build
    }

    return undefined
  }

  /**
   * 开始处理队列
   */
  private startProcessing() {
    this.processingInterval = setInterval(() => {
      this.processQueue()
    }, 1000) // 每秒检查一次队列
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    // 检查是否可以启动新的构建任务
    if (this.runningBuilds.size >= this.maxConcurrentBuilds) {
      return
    }

    // 查找可以执行的任务（没有依赖或依赖已完成）
    const readyBuild = this.findReadyBuild()
    if (!readyBuild) {
      return
    }

    // 从队列中移除并开始执行
    const index = this.queue.indexOf(readyBuild)
    this.queue.splice(index, 1)
    
    await this.startBuild(readyBuild)
  }

  /**
   * 查找准备就绪的构建任务
   */
  private findReadyBuild(): QueuedBuild | undefined {
    for (const build of this.queue) {
      if (this.areDependenciesCompleted(build)) {
        return build
      }
    }
    return undefined
  }

  /**
   * 检查依赖是否完成
   */
  private areDependenciesCompleted(build: QueuedBuild): boolean {
    if (!build.dependencies || build.dependencies.length === 0) {
      return true
    }

    return build.dependencies.every(depId => 
      this.completedBuilds.has(depId)
    )
  }

  /**
   * 开始构建任务
   */
  private async startBuild(build: QueuedBuild) {
    this.runningBuilds.set(build.id, build)
    this.emit('buildStarted', build)

    try {
      const executionId = await this.buildExecutionService.executeBuild(build)

      // 建立 buildId 到 executionId 的映射
      this.buildIdToExecutionId.set(build.id, executionId)

      // 监听构建完成事件
      this.buildExecutionService.once('buildCompleted', (progress: BuildProgress) => {
        if (progress.executionId === executionId) {
          this.handleBuildCompleted(build)
        }
      })

      // 监听构建失败事件
      this.buildExecutionService.once('buildFailed', (progress: BuildProgress) => {
        if (progress.executionId === executionId) {
          this.handleBuildFailed(build)
        }
      })

    } catch (error) {
      logger.error(`启动构建任务失败: ${build.id}`, error)
      this.handleBuildFailed(build)
    }
  }

  /**
   * 处理构建完成
   */
  private handleBuildCompleted(build: QueuedBuild) {
    this.runningBuilds.delete(build.id)
    this.completedBuilds.set(build.id, build)
    
    this.emit('buildCompleted', build)
    logger.info(`构建任务完成: ${build.id}`)
  }

  /**
   * 处理构建失败
   */
  private async handleBuildFailed(build: QueuedBuild) {
    this.runningBuilds.delete(build.id)

    // 检查是否需要重试
    if (build.retryCount < build.maxRetries) {
      build.retryCount++
      build.queueTime = Date.now()
      
      // 重新加入队列，降低优先级
      if (build.priority === 'urgent') build.priority = 'high'
      else if (build.priority === 'high') build.priority = 'normal'
      else if (build.priority === 'normal') build.priority = 'low'

      this.insertByPriority(build)
      
      this.emit('buildRetry', build)
      logger.info(`构建任务重试: ${build.id} (第${build.retryCount}次重试)`)
    } else {
      this.failedBuilds.set(build.id, build)
      this.emit('buildFailed', build)
      logger.error(`构建任务最终失败: ${build.id}`)
    }
  }

  /**
   * 取消构建任务
   */
  async cancelBuild(buildId: string): Promise<boolean> {
    // 检查队列中的任务
    const queueIndex = this.queue.findIndex(build => build.id === buildId)
    if (queueIndex !== -1) {
      const build = this.queue.splice(queueIndex, 1)[0]
      this.emit('buildCancelled', build)
      logger.info(`队列中的构建任务已取消: ${buildId}`)
      return true
    }

    // 检查运行中的任务
    const runningBuild = this.runningBuilds.get(buildId)
    if (runningBuild) {
      // 这里需要通过executionId取消，需要维护映射关系
      // 简化处理，直接从运行列表移除
      this.runningBuilds.delete(buildId)
      this.emit('buildCancelled', runningBuild)
      logger.info(`运行中的构建任务已取消: ${buildId}`)
      return true
    }

    return false
  }

  /**
   * 获取队列状态
   */
  getQueueStats(): QueueStats {
    return {
      total: this.queue.length + this.runningBuilds.size + this.completedBuilds.size + this.failedBuilds.size,
      queued: this.queue.length,
      running: this.runningBuilds.size,
      completed: this.completedBuilds.size,
      failed: this.failedBuilds.size,
      cancelled: 0 // 简化处理，不单独统计取消的任务
    }
  }

  /**
   * 获取队列中的任务
   */
  getQueuedBuilds(): QueuedBuild[] {
    return [...this.queue]
  }

  /**
   * 获取运行中的任务
   */
  getRunningBuilds(): QueuedBuild[] {
    return Array.from(this.runningBuilds.values())
  }

  /**
   * 获取已完成的任务
   */
  getCompletedBuilds(): QueuedBuild[] {
    return Array.from(this.completedBuilds.values())
  }

  /**
   * 获取失败的任务
   */
  getFailedBuilds(): QueuedBuild[] {
    return Array.from(this.failedBuilds.values())
  }

  /**
   * 清理历史记录
   */
  cleanupHistory(olderThanHours = 24) {
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000)
    
    // 清理完成的任务
    for (const [id, build] of this.completedBuilds) {
      if (build.queueTime < cutoffTime) {
        this.completedBuilds.delete(id)
      }
    }

    // 清理失败的任务
    for (const [id, build] of this.failedBuilds) {
      if (build.queueTime < cutoffTime) {
        this.failedBuilds.delete(id)
      }
    }

    logger.info(`清理了 ${olderThanHours} 小时前的构建历史`)
  }

  /**
   * 设置监听器
   */
  private setupEventListeners() {
    // 定期清理历史记录
    setInterval(() => {
      this.cleanupHistory()
    }, 60 * 60 * 1000) // 每小时清理一次
  }

  /**
   * 生成构建ID
   */
  private generateBuildId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 根据 buildId 获取对应的 executionId
   */
  getExecutionId(buildId: string): string | undefined {
    return this.buildIdToExecutionId.get(buildId)
  }

  /**
   * 停止队列处理
   */
  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
  }

  /**
   * 获取构建任务详情
   */
  getBuildDetails(buildId: string): QueuedBuild | undefined {
    // 检查各个状态的任务
    const queuedBuild = this.queue.find(build => build.id === buildId)
    if (queuedBuild) return queuedBuild

    const runningBuild = this.runningBuilds.get(buildId)
    if (runningBuild) return runningBuild

    const completedBuild = this.completedBuilds.get(buildId)
    if (completedBuild) return completedBuild

    const failedBuild = this.failedBuilds.get(buildId)
    if (failedBuild) return failedBuild

    return undefined
  }

  /**
   * 暂停队列处理
   */
  pause() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    this.emit('queuePaused')
  }

  /**
   * 恢复队列处理
   */
  resume() {
    if (!this.processingInterval) {
      this.startProcessing()
      this.emit('queueResumed')
    }
  }
}
