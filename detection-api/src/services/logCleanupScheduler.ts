/**
 * Log Cleanup Scheduler
 * 日志清理调度器 - 定时自动清理日志
 */

import cron, { ScheduledTask } from 'node-cron'
import { LogManagementService } from './logManagementService'
import { logger } from '../utils/logger'

export class LogCleanupScheduler {
  private logManagementService: LogManagementService
  private task: ScheduledTask | null = null
  private isRunning: boolean = false

  constructor(logManagementService: LogManagementService) {
    this.logManagementService = logManagementService
  }

  /**
   * 启动调度器
   */
  start(): void {
    if (this.task) {
      logger.warn('Log cleanup scheduler is already running')
      return
    }

    const config = this.logManagementService.getConfig()
    
    if (!config.autoCleanup) {
      logger.info('Auto cleanup is disabled, scheduler not started')
      return
    }

    try {
      // 验证 cron 表达式
      if (!cron.validate(config.cleanupSchedule)) {
        logger.error('Invalid cron schedule', { schedule: config.cleanupSchedule })
        return
      }

      // 创建定时任务
      this.task = cron.schedule(config.cleanupSchedule, async () => {
        await this.runCleanup()
      })

      this.isRunning = true
      logger.info('✅ Log cleanup scheduler started', {
        schedule: config.cleanupSchedule,
        retentionDays: config.retentionDays
      })
    } catch (error) {
      logger.error('Failed to start log cleanup scheduler', { error })
      throw error
    }
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (this.task) {
      this.task.stop()
      this.task = null
      this.isRunning = false
      logger.info('Log cleanup scheduler stopped')
    }
  }

  /**
   * 重启调度器
   */
  restart(): void {
    this.stop()
    this.start()
  }

  /**
   * 执行清理
   */
  private async runCleanup(): Promise<void> {
    try {
      logger.info('🔄 Running scheduled log cleanup...')
      
      const result = await this.logManagementService.autoCleanup()
      
      logger.info('✅ Scheduled log cleanup completed', {
        filesDeleted: result.filesDeleted,
        bytesFreed: result.bytesFreed,
        bytesFreedFormatted: result.bytesFreedFormatted
      })

      // 如果启用了归档，也执行归档
      const config = this.logManagementService.getConfig()
      if (config.enableArchive) {
        try {
          const archiveResult = await this.logManagementService.archiveLogs({
            olderThanDays: config.archiveAfterDays
          })
          
          if (archiveResult.filesArchived > 0) {
            logger.info('✅ Scheduled log archive completed', {
              filesArchived: archiveResult.filesArchived,
              archiveSize: archiveResult.archiveSize
            })
          }
        } catch (archiveError) {
          logger.error('Failed to archive logs during scheduled cleanup', { error: archiveError })
        }
      }
    } catch (error) {
      logger.error('Failed to run scheduled log cleanup', { error })
    }
  }

  /**
   * 获取调度器状态
   */
  getStatus(): {
    isRunning: boolean
    schedule: string | null
    nextRun: Date | null
  } {
    const config = this.logManagementService.getConfig()
    
    return {
      isRunning: this.isRunning,
      schedule: config.autoCleanup ? config.cleanupSchedule : null,
      nextRun: this.task ? null : null // cron.ScheduledTask 不直接提供 nextRun
    }
  }
}

// 全局调度器实例
let globalScheduler: LogCleanupScheduler | null = null

/**
 * 初始化全局调度器
 */
export function initializeGlobalScheduler(logManagementService: LogManagementService): void {
  if (globalScheduler) {
    logger.warn('Global log cleanup scheduler already initialized')
    return
  }

  globalScheduler = new LogCleanupScheduler(logManagementService)
  globalScheduler.start()
}

/**
 * 获取全局调度器
 */
export function getGlobalScheduler(): LogCleanupScheduler | null {
  return globalScheduler
}

/**
 * 停止全局调度器
 */
export function stopGlobalScheduler(): void {
  if (globalScheduler) {
    globalScheduler.stop()
    globalScheduler = null
  }
}

