/**
 * 文件清理服务
 * 定期清理临时上传文件和过期文件
 */

import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '../utils/logger.js'

export interface CleanupConfig {
  uploadDir: string
  maxFileAge: number // 文件最大保留时间（毫秒）
  cleanupInterval: number // 清理间隔（毫秒）
  enabled: boolean
}

export class FileCleanupService {
  private config: CleanupConfig
  private cleanupTimer: NodeJS.Timeout | null = null
  private isRunning = false

  constructor(config: Partial<CleanupConfig> = {}) {
    this.config = {
      uploadDir: config.uploadDir || 'uploads/imports',
      maxFileAge: config.maxFileAge || 24 * 60 * 60 * 1000, // 默认24小时
      cleanupInterval: config.cleanupInterval || 60 * 60 * 1000, // 默认1小时
      enabled: config.enabled !== false
    }
  }

  /**
   * 启动清理服务
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('文件清理服务已禁用')
      return
    }

    if (this.isRunning) {
      logger.warn('文件清理服务已在运行')
      return
    }

    this.isRunning = true
    logger.info('启动文件清理服务', {
      uploadDir: this.config.uploadDir,
      maxFileAge: this.config.maxFileAge / 1000 / 60 + '分钟',
      cleanupInterval: this.config.cleanupInterval / 1000 / 60 + '分钟'
    })

    // 立即执行一次清理
    this.cleanup().catch(error => {
      logger.error('初始文件清理失败', { error })
    })

    // 设置定时清理
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        logger.error('定时文件清理失败', { error })
      })
    }, this.config.cleanupInterval)
  }

  /**
   * 停止清理服务
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.isRunning = false
    logger.info('文件清理服务已停止')
  }

  /**
   * 执行清理操作
   */
  async cleanup(): Promise<{ deletedFiles: number; errors: number }> {
    const startTime = Date.now()
    let deletedFiles = 0
    let errors = 0

    try {
      logger.debug('开始清理过期文件', { uploadDir: this.config.uploadDir })

      // 确保目录存在
      try {
        await fs.access(this.config.uploadDir)
      } catch {
        logger.warn('上传目录不存在，跳过清理', { uploadDir: this.config.uploadDir })
        return { deletedFiles: 0, errors: 0 }
      }

      // 读取目录中的所有文件
      const files = await fs.readdir(this.config.uploadDir)
      const now = Date.now()

      for (const file of files) {
        const filePath = path.join(this.config.uploadDir, file)

        try {
          const stats = await fs.stat(filePath)

          // 跳过目录
          if (stats.isDirectory()) {
            continue
          }

          // 检查文件年龄
          const fileAge = now - stats.mtimeMs
          if (fileAge > this.config.maxFileAge) {
            await fs.unlink(filePath)
            deletedFiles++
            logger.debug('删除过期文件', {
              file,
              age: Math.round(fileAge / 1000 / 60) + '分钟'
            })
          }
        } catch (error) {
          errors++
          logger.error('清理文件失败', {
            file,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      const duration = Date.now() - startTime
      logger.info('文件清理完成', {
        deletedFiles,
        errors,
        duration: duration + 'ms',
        totalFiles: files.length
      })

      return { deletedFiles, errors }
    } catch (error) {
      logger.error('文件清理过程失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { deletedFiles, errors: errors + 1 }
    }
  }

  /**
   * 手动清理指定文件
   */
  async cleanupFile(filePath: string): Promise<boolean> {
    try {
      await fs.unlink(filePath)
      logger.debug('手动清理文件成功', { filePath })
      return true
    } catch (error) {
      logger.error('手动清理文件失败', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  /**
   * 清理所有临时文件（危险操作，谨慎使用）
   */
  async cleanupAll(): Promise<{ deletedFiles: number; errors: number }> {
    const startTime = Date.now()
    let deletedFiles = 0
    let errors = 0

    try {
      logger.warn('开始清理所有临时文件', { uploadDir: this.config.uploadDir })

      const files = await fs.readdir(this.config.uploadDir)

      for (const file of files) {
        const filePath = path.join(this.config.uploadDir, file)

        try {
          const stats = await fs.stat(filePath)

          // 跳过目录
          if (stats.isDirectory()) {
            continue
          }

          await fs.unlink(filePath)
          deletedFiles++
        } catch (error) {
          errors++
          logger.error('清理文件失败', {
            file,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      const duration = Date.now() - startTime
      logger.info('清理所有文件完成', {
        deletedFiles,
        errors,
        duration: duration + 'ms'
      })

      return { deletedFiles, errors }
    } catch (error) {
      logger.error('清理所有文件失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { deletedFiles, errors: errors + 1 }
    }
  }

  /**
   * 获取上传目录统计信息
   */
  async getStats(): Promise<{
    totalFiles: number
    totalSize: number
    oldestFile: { name: string; age: number } | null
    newestFile: { name: string; age: number } | null
  }> {
    try {
      const files = await fs.readdir(this.config.uploadDir)
      const now = Date.now()
      let totalSize = 0
      let oldestFile: { name: string; age: number } | null = null
      let newestFile: { name: string; age: number } | null = null

      for (const file of files) {
        const filePath = path.join(this.config.uploadDir, file)
        const stats = await fs.stat(filePath)

        if (stats.isDirectory()) {
          continue
        }

        totalSize += stats.size
        const age = now - stats.mtimeMs

        if (!oldestFile || age > oldestFile.age) {
          oldestFile = { name: file, age }
        }

        if (!newestFile || age < newestFile.age) {
          newestFile = { name: file, age }
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        oldestFile,
        newestFile
      }
    } catch (error) {
      logger.error('获取上传目录统计信息失败', { error })
      return {
        totalFiles: 0,
        totalSize: 0,
        oldestFile: null,
        newestFile: null
      }
    }
  }
}

// 创建全局实例
export const fileCleanupService = new FileCleanupService({
  uploadDir: 'uploads/imports',
  maxFileAge: 24 * 60 * 60 * 1000, // 24小时
  cleanupInterval: 60 * 60 * 1000, // 1小时
  enabled: process.env.NODE_ENV !== 'test' // 测试环境禁用
})

