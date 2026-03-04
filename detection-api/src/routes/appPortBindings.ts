/**
 * 应用端口绑定API路由
 */

import { Router } from 'express'
import { Database } from 'better-sqlite3'
import { AppPortBindingService } from '../services/AppPortBindingService'
import { ConfigManager } from '../services/configManager'
import { WebSocketManager } from '../services/websocket'
import {
  CreateAppPortBindingRequest,
  UpdateAppPortBindingRequest,
  AllocatePortsRequest,
  AppPortBindingListQuery,
  ReleasePortRequest
} from '../types/appPortBinding'

export function createAppPortBindingsRouter(database: Database, wsManager?: WebSocketManager): Router {
  const router = Router()
  // ��ȷע�� ConfigManager ��Ϊ�ڶ������� WS �ӹ�Ϊ�ĵ�����
  const configManager = new ConfigManager()
  const appPortBindingService = new AppPortBindingService(database, configManager, wsManager)

  /**
   * 获取应用端口绑定列表
   * GET /api/port-management/app-bindings
   */
  router.get('/', async (req, res) => {
    try {
      const query: AppPortBindingListQuery = {
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined,
        search: req.query.search as string,
        status: req.query.status as string,
        techStack: req.query.techStack as string,
        environment: req.query.environment as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any
      }

      const result = await appPortBindingService.getAppPortBindings(query)
      res.json(result)
    } catch (error) {
      console.error('获取应用端口绑定列表失败:', error)
      res.status(500).json({
        success: false,
        message: '获取列表失败',
        error: { code: 'GET_BINDINGS_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 获取单个应用端口绑定
   * GET /api/port-management/app-bindings/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const binding = appPortBindingService.getAppPortBindingById(id)
      
      if (!binding) {
        return res.status(404).json({
          success: false,
          message: '应用端口绑定不存在',
          error: { code: 'BINDING_NOT_FOUND' },
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        message: '获取成功',
        data: binding,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('获取应用端口绑定失败:', error)
      res.status(500).json({
        success: false,
        message: '获取失败',
        error: { code: 'GET_BINDING_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 创建应用端口绑定
   * POST /api/port-management/app-bindings
   */
  router.post('/', async (req, res) => {
    try {
      const request: CreateAppPortBindingRequest = req.body

      // 简单验证
      if (!request.appId || !request.appName || !request.techStack || !request.portRequirements) {
        return res.status(400).json({
          success: false,
          message: '缺少必需字段',
          error: { code: 'INVALID_REQUEST' },
          timestamp: new Date().toISOString()
        })
      }

      if (request.portRequirements.length === 0) {
        return res.status(400).json({
          success: false,
          message: '至少需要一个端口需求',
          error: { code: 'NO_PORT_REQUIREMENTS' },
          timestamp: new Date().toISOString()
        })
      }

      const result = await appPortBindingService.createAppPortBinding(request)
      
      if (result.success) {
        res.status(201).json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error) {
      console.error('创建应用端口绑定失败:', error)
      res.status(500).json({
        success: false,
        message: '创建失败',
        error: { code: 'CREATE_BINDING_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 更新应用端口绑定
   * PUT /api/port-management/app-bindings/:id
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const request: UpdateAppPortBindingRequest = req.body

      const result = await appPortBindingService.updateAppPortBinding(id, request)
      
      if (result.success) {
        res.json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error) {
      console.error('更新应用端口绑定失败:', error)
      res.status(500).json({
        success: false,
        message: '更新失败',
        error: { code: 'UPDATE_BINDING_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 删除应用端口绑定
   * DELETE /api/port-management/app-bindings/:id
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params
      const result = await appPortBindingService.deleteAppPortBinding(id)
      
      if (result.success) {
        res.json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error) {
      console.error('删除应用端口绑定失败:', error)
      res.status(500).json({
        success: false,
        message: '删除失败',
        error: { code: 'DELETE_BINDING_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 为应用分配端口
   * POST /api/port-management/app-bindings/:id/allocate-ports
   */
  router.post('/:id/allocate-ports', async (req, res) => {
    try {
      const { id } = req.params
      const { forceReallocation = false } = req.body

      const request: AllocatePortsRequest = {
        bindingId: id,
        forceReallocation
      }

      const result = await appPortBindingService.allocatePorts(request)
      
      if (result.success) {
        res.json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error) {
      console.error('分配端口失败:', error)
      res.status(500).json({
        success: false,
        message: '分配端口失败',
        error: { code: 'ALLOCATE_PORTS_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 释放端口
   * POST /api/port-management/app-bindings/:id/release-ports
   */
  router.post('/:id/release-ports', async (req, res) => {
    try {
      const { id } = req.params
      const { ports } = req.body

      const request: ReleasePortRequest = {
        bindingId: id,
        ports
      }

      const result = await appPortBindingService.releasePorts(request)
      
      if (result.success) {
        res.json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error) {
      console.error('释放端口失败:', error)
      res.status(500).json({
        success: false,
        message: '释放端口失败',
        error: { code: 'RELEASE_PORTS_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 批量分配端口
   * POST /api/port-management/app-bindings/batch-allocate
   */
  router.post('/batch-allocate', async (req, res) => {
    try {
      const { bindingIds, forceReallocation = false } = req.body

      if (!bindingIds || !Array.isArray(bindingIds) || bindingIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供要分配端口的绑定ID列表',
          error: { code: 'INVALID_BINDING_IDS' },
          timestamp: new Date().toISOString()
        })
      }

      const results = {
        successful: [],
        failed: [],
        conflicts: []
      }

      // 依次处理每个绑定
      for (const bindingId of bindingIds) {
        try {
          const request: AllocatePortsRequest = {
            bindingId,
            forceReallocation
          }

          const result = await appPortBindingService.allocatePorts(request)

          if (result.success) {
            results.successful.push({
              bindingId,
              allocatedPorts: result.data.allocatedPorts
            })
          } else {
            results.failed.push({
              bindingId,
              error: result.message,
              reason: 'Allocation failed'
            })
          }

          if (result.data.conflicts) {
            results.conflicts.push(...result.data.conflicts)
          }
        } catch (error) {
          results.failed.push({
            bindingId,
            error: error instanceof Error ? error.message : 'Unknown error',
            reason: 'Exception occurred'
          })
        }
      }

      res.json({
        success: results.successful.length > 0,
        data: results,
        message: `批量分配完成：${results.successful.length} 成功，${results.failed.length} 失败`,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('批量分配端口失败:', error)
      res.status(500).json({
        success: false,
        message: '批量分配失败',
        error: { code: 'BATCH_ALLOCATE_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 获取统计信息
   * GET /api/port-management/app-bindings/statistics
   */
  router.get('/statistics/overview', async (req, res) => {
    try {
      const statistics = await appPortBindingService.getStatistics()
      
      res.json({
        success: true,
        message: '获取统计信息成功',
        data: statistics,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('获取统计信息失败:', error)
      res.status(500).json({
        success: false,
        message: '获取统计信息失败',
        error: { code: 'GET_STATISTICS_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 导出绑定配置
   * GET /api/port-management/app-bindings/export
   */
  router.get('/export', async (req, res) => {
    try {
      const { bindingIds, includeAllocatedPorts = true, format = 'json' } = req.query

      let query: AppPortBindingListQuery = {}
      
      if (bindingIds) {
        // 如果指定了特定ID，获取这些绑定
        const ids = (bindingIds as string).split(',')
        query = { pageSize: 1000 } // 确保获取所有指定的绑定
      }

      const result = await appPortBindingService.getAppPortBindings(query)
      
      if (!result.success) {
        return res.status(500).json(result)
      }

      let exportData = result.data.bindings
      
      if (!includeAllocatedPorts) {
        exportData = exportData.map(binding => ({
          ...binding,
          allocatedPorts: []
        }))
      }

      if (format === 'csv') {
        // TODO: 实现CSV导出
        return res.status(501).json({
          success: false,
          message: 'CSV格式导出暂未实现',
          error: { code: 'CSV_NOT_IMPLEMENTED' }
        })
      }

      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=app-port-bindings-${new Date().toISOString().split('T')[0]}.json`)
      
      res.json({
        exportedAt: new Date().toISOString(),
        totalCount: exportData.length,
        data: exportData
      })

    } catch (error) {
      console.error('导出绑定配置失败:', error)
      res.status(500).json({
        success: false,
        message: '导出失败',
        error: { code: 'EXPORT_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  /**
   * 导入绑定配置
   * POST /api/port-management/app-bindings/import
   */
  router.post('/import', async (req, res) => {
    try {
      const { bindings, overwriteExisting = false, autoAllocate = false } = req.body

      if (!bindings || !Array.isArray(bindings) || bindings.length === 0) {
        return res.status(400).json({
          success: false,
          message: '请提供要导入的绑定配置',
          error: { code: 'INVALID_IMPORT_DATA' },
          timestamp: new Date().toISOString()
        })
      }

      const results = {
        successful: [],
        failed: [],
        skipped: []
      }

      for (const bindingData of bindings) {
        try {
          // 检查是否已存在
          const existing = appPortBindingService.getAppPortBindingById(bindingData.appId)
          
          if (existing && !overwriteExisting) {
            results.skipped.push({
              appId: bindingData.appId,
              reason: 'Already exists'
            })
            continue
          }

          const createRequest: CreateAppPortBindingRequest = {
            ...bindingData,
            autoAllocate
          }

          const result = await appPortBindingService.createAppPortBinding(createRequest)

          if (result.success) {
            results.successful.push({
              appId: bindingData.appId,
              bindingId: result.data?.id
            })
          } else {
            results.failed.push({
              appId: bindingData.appId,
              error: result.message
            })
          }

        } catch (error) {
          results.failed.push({
            appId: bindingData.appId || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      }

      res.json({
        success: results.successful.length > 0,
        data: results,
        message: `导入完成：${results.successful.length} 成功，${results.failed.length} 失败，${results.skipped.length} 跳过`,
        timestamp: new Date().toISOString()
      })

    } catch (error) {
      console.error('导入绑定配置失败:', error)
      res.status(500).json({
        success: false,
        message: '导入失败',
        error: { code: 'IMPORT_FAILED' },
        timestamp: new Date().toISOString()
      })
    }
  })

  return router
}

