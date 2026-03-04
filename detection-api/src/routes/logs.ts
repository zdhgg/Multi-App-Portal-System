/**
 * Logs API Routes
 * 日志管理API路由
 */

import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger'
import { LogService } from '../services/logService'
import { LogQuery, LogExportOptions, LogClearOptions } from '../models/LogEntry'

const router = Router()

// 日志服务实例缓存
let logService: LogService | null = null

// 初始化日志服务
export function initLogService(service: LogService): void {
  logService = service
}

// 获取日志服务实例
function getLogService(): LogService {
  if (!logService) {
    throw new Error('Log service not initialized. Call initLogService first.')
  }
  return logService
}

/**
 * GET /api/apps/:id/logs
 * 获取应用日志
 */
router.get('/apps/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id: appId } = req.params
    const query: LogQuery = {
      level: req.query.level as any,
      source: req.query.source as string,
      startTime: req.query.startTime as string,
      endTime: req.query.endTime as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
    }

    const service = getLogService()
    const result = await service.getAppLogs(appId, query)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('获取应用日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取应用日志失败'
    })
  }
})

/**
 * GET /api/system/logs
 * 获取系统日志
 */
router.get('/system/logs', async (req: Request, res: Response) => {
  try {
    const query: LogQuery = {
      level: req.query.level as any,
      source: req.query.source as string,
      startTime: req.query.startTime as string,
      endTime: req.query.endTime as string,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
    }

    const service = getLogService()
    const result = await service.getSystemLogs(query)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('获取系统日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取系统日志失败'
    })
  }
})

/**
 * GET /api/logs/export
 * 导出日志
 */
router.get('/logs/export', async (req: Request, res: Response) => {
  try {
    const options: LogExportOptions = {
      appId: req.query.appId as string,
      level: req.query.level as any,
      source: req.query.source as string,
      startTime: req.query.startTime as string,
      endTime: req.query.endTime as string,
      search: req.query.search as string,
      format: (req.query.format as 'json' | 'csv' | 'txt') || 'json'
    }

    const service = getLogService()
    const exportData = await service.exportLogs(options)

    // 设置响应头
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `logs-${timestamp}.${options.format}`
    
    let contentType: string
    switch (options.format) {
      case 'json':
        contentType = 'application/json'
        break
      case 'csv':
        contentType = 'text/csv'
        break
      case 'txt':
        contentType = 'text/plain'
        break
      default:
        contentType = 'application/octet-stream'
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(exportData)
  } catch (error) {
    logger.error('导出日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '导出日志失败'
    })
  }
})

/**
 * DELETE /api/logs
 * 清理日志
 */
router.delete('/logs', async (req: Request, res: Response) => {
  try {
    const options: LogClearOptions = {
      appId: req.body.appId as string,
      olderThan: req.body.olderThan as string
    }

    const service = getLogService()
    const result = await service.clearLogs(options)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('清理日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '清理日志失败'
    })
  }
})

/**
 * GET /api/logs/stats
 * 获取日志统计
 */
router.get('/logs/stats', async (req: Request, res: Response) => {
  try {
    const query: LogQuery = {
      appId: req.query.appId as string,
      startTime: req.query.startTime as string,
      endTime: req.query.endTime as string
    }

    const service = getLogService()
    const stats = await service.getLogStats(query)

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    logger.error('获取日志统计失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取日志统计失败'
    })
  }
})

/**
 * POST /api/logs/cleanup
 * 清理过期日志
 */
router.post('/logs/cleanup', async (req: Request, res: Response) => {
  try {
    const { retentionDays = 7 } = req.body

    logger.info('手动触发日志清理', { retentionDays })

    const service = getLogService()
    const result = await service.cleanupOldLogs(retentionDays)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('清理日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '清理日志失败'
    })
  }
})

/**
 * GET /api/logs/cleanup/estimate
 * 预估清理数量（直接查询数据库，与清理逻辑一致）
 */
router.get('/logs/cleanup/estimate', async (req: Request, res: Response) => {
  try {
    const retentionDays = parseInt(req.query.retentionDays as string) || 7

    const service = getLogService()
    
    // 使用与清理逻辑完全一致的方式计算
    const result = await service.estimateCleanup(retentionDays)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('预估清理数量失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '预估失败'
    })
  }
})

/**
 * GET /api/logs/health
 * 日志服务健康检查
 */
router.get('/logs/health', async (req: Request, res: Response) => {
  try {
    const service = getLogService()
    
    // 简单的健康检查：获取最近的几条日志
    const result = await service.getSystemLogs({ limit: 1 })
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        totalLogs: result.total,
        lastLogTime: result.logs[0]?.timestamp || null,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    logger.error('日志服务健康检查失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '日志服务不可用'
    })
  }
})

export default router
