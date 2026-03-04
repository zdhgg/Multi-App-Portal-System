/**
 * Log Management Routes
 * 日志管理路由
 */

import { Router, Request, Response } from 'express'
import { LogManagementService } from '../services/logManagementService'
import { logger } from '../utils/logger'

const router = Router()

// 日志管理服务实例缓存
let logManagementService: LogManagementService | null = null

// 初始化日志管理服务
export function initLogManagementService(database: any): void {
  logManagementService = new LogManagementService(database)
}

// 获取日志管理服务实例
function getLogManagementService(): LogManagementService {
  if (!logManagementService) {
    throw new Error('Log management service not initialized')
  }
  return logManagementService
}

/**
 * GET /api/log-management/config
 * 获取日志管理配置
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const config = service.getConfig()
    
    res.json({
      success: true,
      data: config
    })
  } catch (error) {
    logger.error('Failed to get log management config', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get config'
    })
  }
})

/**
 * PUT /api/log-management/config
 * 更新日志管理配置
 */
router.put('/config', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const config = await service.updateConfig(req.body)
    
    res.json({
      success: true,
      data: config,
      message: 'Configuration updated successfully'
    })
  } catch (error) {
    logger.error('Failed to update log management config', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update config'
    })
  }
})

/**
 * GET /api/log-management/files
 * 获取所有日志文件
 */
router.get('/files', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const files = await service.getLogFiles()
    
    res.json({
      success: true,
      data: files
    })
  } catch (error) {
    logger.error('Failed to get log files', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get log files'
    })
  }
})

/**
 * GET /api/log-management/stats
 * 获取存储统计
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const stats = await service.getStorageStats()
    
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('Failed to get storage stats', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get storage stats'
    })
  }
})

/**
 * POST /api/log-management/cleanup
 * 清理日志
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const { olderThanDays, type, dryRun } = req.body
    
    const result = await service.cleanupLogs({
      olderThanDays,
      type,
      dryRun
    })
    
    res.json({
      success: true,
      data: result,
      message: dryRun 
        ? `Dry run: Would delete ${result.filesDeleted} files (${result.bytesFreedFormatted})`
        : `Successfully cleaned up ${result.filesDeleted} files (${result.bytesFreedFormatted})`
    })
  } catch (error) {
    logger.error('Failed to cleanup logs', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup logs'
    })
  }
})

/**
 * POST /api/log-management/archive
 * 归档日志
 */
router.post('/archive', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const { olderThanDays, type } = req.body
    
    const result = await service.archiveLogs({
      olderThanDays,
      type
    })
    
    res.json({
      success: true,
      data: result,
      message: `Successfully archived ${result.filesArchived} files`
    })
  } catch (error) {
    logger.error('Failed to archive logs', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to archive logs'
    })
  }
})

/**
 * POST /api/log-management/auto-cleanup
 * 执行自动清理
 */
router.post('/auto-cleanup', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const result = await service.autoCleanup()
    
    res.json({
      success: true,
      data: result,
      message: `Auto cleanup completed: ${result.filesDeleted} files deleted (${result.bytesFreedFormatted})`
    })
  } catch (error) {
    logger.error('Failed to execute auto cleanup', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute auto cleanup'
    })
  }
})

/**
 * GET /api/log-management/cleanup-history
 * 获取清理历史
 */
router.get('/cleanup-history', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
    const history = await service.getCleanupHistory(limit)
    
    res.json({
      success: true,
      data: history
    })
  } catch (error) {
    logger.error('Failed to get cleanup history', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cleanup history'
    })
  }
})

/**
 * GET /api/log-management/archive-history
 * 获取归档历史
 */
router.get('/archive-history', async (req: Request, res: Response) => {
  try {
    const service = getLogManagementService()
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
    const history = await service.getArchiveHistory(limit)
    
    res.json({
      success: true,
      data: history
    })
  } catch (error) {
    logger.error('Failed to get archive history', { error })
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get archive history'
    })
  }
})

export default router

