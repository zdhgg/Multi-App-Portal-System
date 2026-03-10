/**
 * PortConfigController - 端口配置管理API
 *
 * 提供端口配置的增删改查、统计信息、变更历史等功能
 */

import { Router, Request, Response } from 'express'
import { ConfigManager } from '../../services/configManager'
import { AppPortBindingService } from '../../services/AppPortBindingService'
import { PortManagementService } from '../../services/PortManagementService'
import { ApplicationService } from '../../core/ApplicationService'
import { logger } from '../../utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// 🚀 端口扫描缓存配置
interface PortScanCache {
  data: any
  timestamp: number
  expiresIn: number  // 毫秒
}

interface ListeningPortSnapshot {
  available: boolean
  ports: Map<number, number>
}

export class PortConfigController {
  private router = Router()
  private configManager: ConfigManager
  private appPortBindingService?: AppPortBindingService
  private portManager?: PortManagementService
  private applicationService?: ApplicationService

  // 🚀 端口扫描缓存（避免频繁扫描）
  private statisticsCache: PortScanCache | null = null
  private backgroundScanCache: PortScanCache | null = null
  private readonly CACHE_TTL = 60000  // 60秒缓存过期

  constructor(
    configManager: ConfigManager,
    appPortBindingService?: AppPortBindingService,
    portManager?: PortManagementService,
    applicationService?: ApplicationService  // 🔧 新增参数
  ) {
    this.configManager = configManager
    this.appPortBindingService = appPortBindingService
    this.portManager = portManager
    this.applicationService = applicationService  // 🔧 保存引用
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // 获取端口配置
    this.router.get('/port-config', this.getPortConfig.bind(this))

    // 获取配置统计信息
    this.router.get('/stats', this.getConfigStats.bind(this))

    // 获取变更历史
    this.router.get('/change-history', this.getChangeHistory.bind(this))

    // 更新端口范围
    this.router.put('/port-ranges', this.updatePortRanges.bind(this))

    // 添加保留端口
    this.router.post('/reserved-ports', this.addReservedPort.bind(this))

    // 删除保留端口
    this.router.delete('/reserved-ports/:port', this.removeReservedPort.bind(this))

    // 更新分配策略
    this.router.put('/allocation-policy', this.updateAllocationPolicy.bind(this))

    // 更新监控配置
    this.router.put('/monitoring', this.updateMonitoringConfig.bind(this))

    // 导出配置
    this.router.get('/export', this.exportConfig.bind(this))

    // 导入配置
    this.router.post('/import', this.importConfig.bind(this))

    // ===============================================================================
    // Phase 5: 前端兼容性端点 - 匹配前端期望的API路径
    // ===============================================================================

    // 统计概览 (前端期望: /statistics/overview)
    this.router.get('/statistics/overview', this.getStatisticsOverview.bind(this))

    // 应用端口绑定 (前端期望: /app-bindings)
    this.router.get('/app-bindings', this.getAppBindings.bind(this))

    // 冲突检测 (前端期望: /conflicts/detect)
    this.router.get('/conflicts/detect', this.detectConflicts.bind(this))

    // 后台扫描状态 (前端期望: /background-scan/status)
    this.router.get('/background-scan/status', this.getBackgroundScanStatus.bind(this))

    // 端口测试 (前端期望: /test-pid/:port)
    this.router.get('/test-pid/:port', this.testPortPid.bind(this))

    // 清理僵尸端口 (前端期望: /cleanup/zombies)
    this.router.post('/cleanup/zombies', this.cleanupZombiePorts.bind(this))

    // 端口配置 (前端期望: /config/ports)
    this.router.get('/config/ports', this.getPortConfig.bind(this))

    // 重新加载配置
    this.router.post('/reload', this.reloadConfig.bind(this))

    // 扫描任务管理
    this.router.get('/scan/task/:taskId', this.getScanTaskStatus.bind(this))
    this.router.post('/scan/task/:taskId/cancel', this.cancelScanTask.bind(this))
    this.router.get('/scan/tasks', this.getAllScanTasks.bind(this))
    this.router.get('/scan/results/:taskId', this.getScanResults.bind(this))
    this.router.post('/scan/range', this.scanPortRange.bind(this))

    // 强制释放端口 (前端期望: /:port/force-release)
    this.router.post('/:port/force-release', this.forceReleasePort.bind(this))
  }

  /**
   * 从系统命令获取监听端口快照（优先使用，避免 net.listen 在 Windows 误判）
   */
  private async getListeningPortSnapshot(): Promise<ListeningPortSnapshot> {
    const snapshot: ListeningPortSnapshot = {
      available: false,
      ports: new Map<number, number>()
    }

    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('netstat -ano -p tcp')
        const lines = stdout.split(/\r?\n/)

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line || !/LISTENING/i.test(line)) continue

          const parts = line.split(/\s+/)
          if (parts.length < 5) continue

          const localAddress = parts[1]
          const port = this.extractPortFromAddress(localAddress)
          if (port === null) continue

          const pid = Number.parseInt(parts[parts.length - 1], 10)
          const safePid = Number.isFinite(pid) && pid > 0 ? pid : 0

          if (!snapshot.ports.has(port) || snapshot.ports.get(port) === 0) {
            snapshot.ports.set(port, safePid)
          }
        }

        snapshot.available = true
        return snapshot
      }

      // Unix-like 环境：尽量使用 lsof 获取端口和 PID
      const { stdout } = await execAsync('lsof -nP -iTCP -sTCP:LISTEN')
      const lines = stdout.split(/\r?\n/).slice(1) // 跳过表头

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        const parts = line.split(/\s+/)
        if (parts.length < 9) continue

        const pid = Number.parseInt(parts[1], 10)
        const nameAddressField = parts[parts.length - 1] // e.g. TCP *:8002 (LISTEN)
        const port = this.extractPortFromAddress(nameAddressField)
        if (port === null) continue

        const safePid = Number.isFinite(pid) && pid > 0 ? pid : 0
        if (!snapshot.ports.has(port) || snapshot.ports.get(port) === 0) {
          snapshot.ports.set(port, safePid)
        }
      }

      snapshot.available = true
      return snapshot
    } catch (error) {
      logger.warn('获取监听端口快照失败，将回退到 net 检测', {
        error: error instanceof Error ? error.message : String(error)
      })
      return snapshot
    }
  }

  /**
   * 从地址字符串提取端口号，兼容 IPv4/IPv6 格式
   */
  private extractPortFromAddress(address: string): number | null {
    if (!address || typeof address !== 'string') return null

    const match = address.match(/:(\d+)(?:\s|\)|$)/)
    if (!match) return null

    const port = Number.parseInt(match[1], 10)
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null
    return port
  }

  /**
   * 获取端口配置
   */
  async getPortConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = this.configManager.getPortConfig()

      if (!config) {
        return res.apiError('端口配置未找到', 404)
      }

      res.apiSuccess(config, '获取端口配置成功')
    } catch (error) {
      logger.error('获取端口配置失败:', error)
      res.apiError('获取端口配置失败', 500)
    }
  }

  /**
   * 获取配置统计信息
   */
  async getConfigStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.configManager.getConfigStats()

      res.apiSuccess(stats, '获取配置统计信息成功')
    } catch (error) {
      logger.error('获取配置统计信息失败:', error)
      res.apiError('获取统计信息失败', 500)
    }
  }

  /**
   * 获取变更历史
   */
  async getChangeHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined
      const history = this.configManager.getChangeHistory(limit)

      res.apiSuccess(history, '获取变更历史成功')
    } catch (error) {
      logger.error('获取变更历史失败:', error)
      res.apiError('获取变更历史失败', 500)
    }
  }

  /**
   * 更新端口范围
   */
  async updatePortRanges(req: Request, res: Response): Promise<void> {
    try {
      const { frontendRange, backendRange, reason } = req.body
      const user = req.headers['x-user'] as string || 'api'

      await this.configManager.updatePortRanges(
        frontendRange,
        backendRange,
        user,
        reason
      )

      res.apiSuccess(null, '端口范围更新成功')
    } catch (error) {
      logger.error('更新端口范围失败:', error)
      res.apiError('更新端口范围失败', 400)
    }
  }

  /**
   * 添加保留端口
   */
  async addReservedPort(req: Request, res: Response): Promise<void> {
    try {
      const { port, description, category } = req.body
      const user = req.headers['x-user'] as string || 'api'

      if (!port || !description) {
        return res.apiError('端口号和描述不能为空', 400)
      }

      await this.configManager.addReservedPort(
        parseInt(port),
        description,
        category || 'custom',
        user
      )

      res.apiSuccess(null, `保留端口 ${port} 添加成功`)
    } catch (error) {
      logger.error('添加保留端口失败:', error)
      res.apiError('添加保留端口失败', 400)
    }
  }

  /**
   * 删除保留端口
   */
  async removeReservedPort(req: Request, res: Response): Promise<void> {
    try {
      const port = parseInt(req.params.port)
      const user = req.headers['x-user'] as string || 'api'

      if (isNaN(port)) {
        return res.apiError('无效的端口号', 400)
      }

      await this.configManager.removeReservedPort(port, user)

      res.apiSuccess(null, `保留端口 ${port} 删除成功`)
    } catch (error) {
      logger.error('删除保留端口失败:', error)
      res.apiError('删除保留端口失败', 400)
    }
  }

  /**
   * 更新分配策略
   */
  async updateAllocationPolicy(req: Request, res: Response): Promise<void> {
    try {
      const policy = req.body
      const user = req.headers['x-user'] as string || 'api'

      const config = this.configManager.getConfig()
      if (!config) {
        return res.apiError('配置未找到', 404)
      }

      const newConfig = { ...config }
      newConfig.portConfiguration.allocationPolicy = {
        ...newConfig.portConfiguration.allocationPolicy,
        ...policy
      }

      await this.configManager.saveConfig(newConfig)

      res.apiSuccess(null, '分配策略更新成功')
    } catch (error) {
      logger.error('更新分配策略失败:', error)
      res.apiError('更新分配策略失败', 400)
    }
  }

  /**
   * 更新监控配置
   */
  async updateMonitoringConfig(req: Request, res: Response): Promise<void> {
    try {
      const monitoring = req.body
      const user = req.headers['x-user'] as string || 'api'

      await this.configManager.updateMonitoringConfig(monitoring, user)

      res.apiSuccess(null, '监控配置更新成功')
    } catch (error) {
      logger.error('更新监控配置失败:', error)
      res.apiError('更新监控配置失败', 400)
    }
  }

  /**
   * 导出配置
   */
  async exportConfig(req: Request, res: Response): Promise<void> {
    try {
      const config = this.configManager.getConfig()

      if (!config) {
        return res.apiError('配置未找到', 404)
      }

      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition',
        `attachment; filename=portal-config-${new Date().toISOString().split('T')[0]}.json`)

      res.apiSuccess(config, '导出配置成功')
    } catch (error) {
      logger.error('导出配置失败:', error)
      res.apiError('导出配置失败', 500)
    }
  }

  /**
   * 导入配置
   */
  async importConfig(req: Request, res: Response): Promise<void> {
    try {
      const { configJson } = req.body
      const user = req.headers['x-user'] as string || 'api'

      if (!configJson) {
        return res.apiError('配置数据不能为空', 400)
      }

      // 解析配置
      let parsedConfig
      try {
        parsedConfig = typeof configJson === 'string' ? JSON.parse(configJson) : configJson
      } catch (parseError) {
        return res.apiError('配置格式无效', 400)
      }

      await this.configManager.saveConfig(parsedConfig)

      res.apiSuccess(null, '配置导入成功')
    } catch (error) {
      logger.error('导入配置失败:', error)
      res.apiError('导入配置失败', 400)
    }
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(req: Request, res: Response): Promise<void> {
    try {
      await this.configManager.loadConfig()

      res.apiSuccess(null, '配置重新加载成功')
    } catch (error) {
      logger.error('重新加载配置失败:', error)
      res.apiError('重新加载配置失败', 500)
    }
  }

  // ===============================================================================
  // Phase 5: 前端兼容性方法实现
  // ===============================================================================

  /**
   * 获取统计概览 - 前端兼容格式
   * 统一使用端口扫描检测实际监听端口，与下方表格数据保持一致
   * 🚀 支持缓存：避免频繁扫描端口
   */
  async getStatisticsOverview(req: Request, res: Response): Promise<void> {
    try {
      // 🚀 检查缓存（支持 ?refresh=true 强制刷新）
      const forceRefresh = req.query.refresh === 'true'
      if (!forceRefresh && this.statisticsCache) {
        const now = Date.now()
        if (now - this.statisticsCache.timestamp < this.CACHE_TTL) {
          logger.debug('使用缓存的端口统计数据', { 
            age: Math.round((now - this.statisticsCache.timestamp) / 1000) + 's' 
          })
          return res.apiSuccess({
            ...this.statisticsCache.data,
            cached: true,
            cacheAge: now - this.statisticsCache.timestamp
          }, '端口统计概览获取成功（缓存）')
        }
      }

      // 获取配置中的端口范围
      const stats = await this.getStatsData()
      const totalRange = stats.portRangeSize.frontend + stats.portRangeSize.backend || 200
      
      // 构建待扫描的端口列表（与 getBackgroundScanStatus 保持一致）
      const config = this.configManager.getConfig()
      const portConfig = config?.portConfiguration
      const reservedPorts = portConfig?.reservedPorts?.map((p: any) => p.port) || []
      // 常用开发端口：前端 3000-3010, 5173(Vite), 后端 8000-8010, 4200(Angular)
      const defaultPorts = [
        3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010,  // 前端端口
        5173, 5174, 5175,  // Vite 默认端口
        8000, 8001, 8002, 8003, 8004, 8005, 8080, 8081,  // 后端端口
        4200, 4201  // Angular 端口
      ]
      
      // 🔧 修复：从应用数据库获取所有应用使用的端口
      const appPorts: number[] = []
      try {
        // 使用控制器注入的 applicationService
        if (this.applicationService && typeof this.applicationService.findAll === 'function') {
          const apps = await this.applicationService.findAll()
          for (const app of apps) {
            if (app.network?.primaryPort) {
              appPorts.push(app.network.primaryPort)
            }
            if (app.network?.secondaryPorts && Array.isArray(app.network.secondaryPorts)) {
              appPorts.push(...app.network.secondaryPorts)
            }
          }
        }
      } catch (err) {
        logger.debug('获取应用端口失败，使用默认端口列表', { error: err })
      }
      
      const knownPorts = [...new Set([...reservedPorts, ...defaultPorts, ...appPorts])]
      
      // 优先使用系统快照检测监听端口，避免 net.listen 在 Windows 误判
      const listeningSnapshot = await this.getListeningPortSnapshot()

      // 回退方案：使用 net 端口探测（仅当快照不可用时）
      const net = await import('net')
      
      // 🚀 优化：快速端口检测（只使用 net.createServer，并行检测）
      const checkPortInUse = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
          const server = net.createServer()
          const timeout = setTimeout(() => {
            server.close()
            resolve(false) // 超时认为端口空闲
          }, 500) // 500ms 超时
          
          server.once('error', (err: any) => {
            clearTimeout(timeout)
            server.close()
            resolve(err.code === 'EADDRINUSE')
          })
          server.once('listening', () => {
            clearTimeout(timeout)
            server.close()
            resolve(false)
          })
          server.listen(port, '0.0.0.0')
        })
      }
      
      let actualOccupied = 0
      if (listeningSnapshot.available) {
        actualOccupied = knownPorts.filter(port => listeningSnapshot.ports.has(port)).length
      } else {
        // 🚀 并行检测所有端口（回退）
        const results = await Promise.all(
          knownPorts.map(port => checkPortInUse(port))
        )
        actualOccupied = results.filter(inUse => inUse).length
      }

      // 构建统计数据
      const overview = {
        total: totalRange,
        allocated: actualOccupied,
        totalAllocated: actualOccupied, // 兼容字段
        available: Math.max(0, totalRange - actualOccupied),
        conflicts: 0,
        lastUpdated: new Date().toISOString()
      }

      // 🚀 保存到缓存
      this.statisticsCache = {
        data: overview,
        timestamp: Date.now(),
        expiresIn: this.CACHE_TTL
      }
      logger.debug('端口统计数据已缓存', { ttl: this.CACHE_TTL / 1000 + 's' })

      res.apiSuccess({ ...overview, cached: false }, '端口统计概览获取成功')
    } catch (error) {
      logger.error('获取端口统计概览失败', { error })
      res.apiError('获取端口统计概览失败', 500)
    }
  }

  /**
   * 获取应用端口绑定列表
   */
  async getAppBindings(req: Request, res: Response): Promise<void> {
    try {
      // 使用真实的AppPortBindingService获取数据
      if (this.appPortBindingService) {
        const query = {
          page: req.query.page ? parseInt(req.query.page as string) : 1,
          pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 20,
          search: req.query.search as string,
          status: req.query.status as string,
          techStack: req.query.techStack as string,
          environment: req.query.environment as string,
          tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
          sortBy: req.query.sortBy as any,
          sortOrder: req.query.sortOrder as any
        }

        const result = await this.appPortBindingService.getAppPortBindings(query)

        if (result.success) {
          // 直接返回AppPortBindingService的标准响应格式
          res.apiSuccess(result.data, '获取应用端口绑定成功')
        } else {
          res.apiError('获取应用端口绑定失败', 500)
        }
      } else {
        // 降级方案：返回基础测试数据
        logger.warn('AppPortBindingService未初始化，返回测试数据')

        const bindings = [
          {
            id: 'binding-portal-frontend',
            appId: 'main-portal',
            appName: '主门户',
            techStack: 'Vue 3 + Vite',
            status: 'allocated',
            description: 'Vue.js前端应用',
            portRequirements: [],
            allocatedPorts: [
              {
                id: 'port-3000',
                port: 3000,
                type: 'frontend',
                protocol: 'http',
                status: 'active'
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: 'binding-detection-api',
            appId: 'detection-api',
            appName: '检测API',
            techStack: 'Node.js + Express',
            status: 'allocated',
            description: 'Node.js后端API服务',
            portRequirements: [],
            allocatedPorts: [
              {
                id: 'port-8001',
                port: 8001,
                type: 'backend',
                protocol: 'http',
                status: 'active'
              }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]

        const page = parseInt(req.query.page as string) || 1
        const pageSize = parseInt(req.query.pageSize as string) || 20

        res.apiSuccess({
          bindings,
          pagination: {
            currentPage: page,
            pageSize,
            total: bindings.length,
            totalPages: Math.ceil(bindings.length / pageSize)
          },
          statistics: {
            total: bindings.length,
            pending: 0,
            allocated: bindings.length,
            active: bindings.length,
            error: 0
          }
        }, '获取应用端口绑定成功')
      }
    } catch (error) {
      logger.error('获取应用端口绑定失败', { error })
      res.apiError('获取应用端口绑定失败', 500)
    }
  }

  /**
   * 检测端口冲突
   */
  async detectConflicts(req: Request, res: Response): Promise<void> {
    try {
      // 模拟冲突检测结果
      const conflicts = [] // 暂时返回空冲突列表

      res.apiSuccess(conflicts, '端口冲突检测完成')
    } catch (error) {
      logger.error('端口冲突检测失败', { error })
      res.apiError('端口冲突检测失败', 500)
    }
  }

  /**
   * 获取后台扫描状态 - 基于配置的端口范围扫描，并关联应用信息
   * 🚀 支持缓存：避免频繁扫描端口
   */
  async getBackgroundScanStatus(req: Request, res: Response): Promise<void> {
    try {
      // 🚀 检查缓存（支持 ?refresh=true 强制刷新）
      const forceRefresh = req.query.refresh === 'true'
      if (!forceRefresh && this.backgroundScanCache) {
        const now = Date.now()
        if (now - this.backgroundScanCache.timestamp < this.CACHE_TTL) {
          logger.debug('使用缓存的后台扫描数据', { 
            age: Math.round((now - this.backgroundScanCache.timestamp) / 1000) + 's' 
          })
          const cachedData = this.backgroundScanCache.data
          cachedData.cached = true
          cachedData.cacheAge = now - this.backgroundScanCache.timestamp
          return res.apiSuccess(cachedData, '后台扫描状态获取成功（缓存）')
        }
      }

      const config = this.configManager.getConfig()
      const portConfig = config?.portConfiguration
      
      // 🔧 从配置读取端口范围
      const frontendRange = portConfig?.frontendRange || { start: 3000, end: 3100 }
      const backendRange = portConfig?.backendRange || { start: 8000, end: 8100 }
      const reservedPorts = portConfig?.reservedPorts || []
      
      // 构建端口到应用的映射
      const portToAppMap = new Map<number, { appId: string; appName: string; portType: string }>()
      
      // 添加保留端口信息
      for (const rp of reservedPorts) {
        portToAppMap.set(rp.port, {
          appId: 'system',
          appName: rp.description || '系统保留',
          portType: rp.category || 'system'
        })
      }
      
      // 🔧 从应用数据库获取端口映射
      try {
        if (this.applicationService && typeof this.applicationService.findAll === 'function') {
          const apps = await this.applicationService.findAll()
          for (const app of apps) {
            if (app.network?.primaryPort) {
              portToAppMap.set(app.network.primaryPort, {
                appId: app.id,
                appName: app.name,
                portType: 'frontend'
              })
            }
            if (Array.isArray(app.network?.secondaryPorts)) {
              for (const port of app.network.secondaryPorts) {
                if (port) {
                  portToAppMap.set(port, {
                    appId: app.id,
                    appName: app.name,
                    portType: 'backend'
                  })
                }
              }
            }
          }
        }
      } catch (err) {
        logger.debug('获取应用端口映射失败', { error: err })
      }
      
      // 🔧 构建扫描端口列表：配置范围内的常用端口 + 保留端口 + 应用端口
      const portsToScan = new Set<number>()
      
      // 添加保留端口
      reservedPorts.forEach((p: any) => portsToScan.add(p.port))
      
      // 添加应用使用的端口
      portToAppMap.forEach((_, port) => portsToScan.add(port))
      
      // 添加配置范围内的常用端口（每10个取一个 + 头尾）
      for (let p = frontendRange.start; p <= Math.min(frontendRange.start + 20, frontendRange.end); p++) {
        portsToScan.add(p)
      }
      for (let p = backendRange.start; p <= Math.min(backendRange.start + 20, backendRange.end); p++) {
        portsToScan.add(p)
      }
      
      // 添加常用开发端口
      const commonPorts = [3000, 5173, 5174, 8080, 4200]
      commonPorts.forEach(p => portsToScan.add(p))
      
      const knownPorts = Array.from(portsToScan).sort((a, b) => a - b)
      
      const activePorts: Array<{
        port: number
        status: string
        process?: { pid: number; name: string }
        service?: string
        appId?: string
        appName?: string
        portType?: string
        timestamp: string
      }> = []

      // 优先使用系统快照检测监听端口，避免 net.listen 在 Windows 误判
      const listeningSnapshot = await this.getListeningPortSnapshot()

      // 回退方案：使用 net 模块并行检测端口
      const net = await import('net')
      
      // 快速端口检测函数（带超时）
      const checkPortInUse = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
          const server = net.createServer()
          const timeout = setTimeout(() => {
            server.close()
            resolve(false)
          }, 500) // 500ms 超时
          
          server.once('error', (err: any) => {
            clearTimeout(timeout)
            server.close()
            resolve(err.code === 'EADDRINUSE')
          })
          server.once('listening', () => {
            clearTimeout(timeout)
            server.close()
            resolve(false)
          })
          server.listen(port, '0.0.0.0')
        })
      }
      
      let portCheckResults: Array<{ port: number; isListening: boolean }>
      if (listeningSnapshot.available) {
        portCheckResults = knownPorts.map((port) => ({
          port,
          isListening: listeningSnapshot.ports.has(port)
        }))
      } else {
        // 🚀 并行检测所有端口（回退）
        portCheckResults = await Promise.all(
          knownPorts.map(async (port) => ({
            port,
            isListening: await checkPortInUse(port)
          }))
        )
      }
      
      // 构建活跃端口列表
      for (const { port, isListening } of portCheckResults) {
        if (isListening) {
          const appInfo = portToAppMap.get(port)
          const portType = port >= frontendRange.start && port <= frontendRange.end ? 'frontend' :
                          port >= backendRange.start && port <= backendRange.end ? 'backend' : 'other'
          
          // 获取默认应用名称
          let defaultAppName: string | undefined
          if (port === 3000) defaultAppName = '门户前端'
          else if (port === 8002) defaultAppName = '门户后端API'
          
          const snapshotPid = listeningSnapshot.ports.get(port) || 0
          activePorts.push({
            port: port,
            status: 'listening',
            process: { pid: snapshotPid, name: 'Node.js' },
            service: portType,
            appId: appInfo?.appId || 'system',
            appName: appInfo?.appName || defaultAppName,
            portType: appInfo?.portType || portType,
            timestamp: new Date().toISOString()
          })
        }
      }

      // 补充进程信息
      if (this.portManager && activePorts.length > 0) {
        for (const activePort of activePorts) {
          try {
            const portStatus = await this.portManager.getPortStatus(activePort.port)
            if (portStatus) {
              activePort.process = {
                pid: portStatus.process_id || portStatus.process?.pid || 0,
                name: portStatus.process_name || portStatus.process?.name || 'Node.js'
              }
            }
          } catch {
            // 忽略
          }
        }
      }

      const status = {
        enabled: true,
        isRunning: false,
        lastScanTime: new Date().toISOString(),
        nextScanTime: null,
        scanInterval: 300000,
        realtimeData: {
          isRunning: false,
          activePorts: activePorts,
          lastScanTime: new Date().toISOString(),
          cacheSize: activePorts.length
        },
        portRanges: {
          frontend: frontendRange,
          backend: backendRange
        },
        config: {
          scanInterval: 300000,
          knownPorts: knownPorts
        },
        cached: false
      }

      // 🚀 保存到缓存
      this.backgroundScanCache = {
        data: { ...status },
        timestamp: Date.now(),
        expiresIn: this.CACHE_TTL
      }
      logger.debug('后台扫描数据已缓存', { ttl: this.CACHE_TTL / 1000 + 's', activePorts: activePorts.length })

      res.apiSuccess(status, '后台扫描状态获取成功')
    } catch (error) {
      logger.error('获取后台扫描状态失败', { error })
      res.apiError('获取后台扫描状态失败', 500)
    }
  }

  /**
   * 测试端口PID - 返回真实端口状态
   */
  async testPortPid(req: Request, res: Response): Promise<void> {
    try {
      const port = parseInt(req.params.port)

      if (isNaN(port) || port < 1 || port > 65535) {
        return res.apiError('无效的端口号', 400)
      }

      // 使用 PortManagementService 获取真实端口状态
      if (this.portManager) {
        const status = await this.portManager.getPortStatus(port)
        const result = {
          port: port,
          occupied: status?.is_listening ?? false,
          pid: status?.process_id ?? null,
          processName: status?.process_name ?? null,
          status: status?.status ?? 'unknown',
          appId: status?.app_id ?? null,
          appName: status?.app_name ?? null,
          processInfo: status?.is_listening ? {
            pid: status?.process_id,
            name: status?.process_name
          } : null
        }
        return res.apiSuccess(result, `端口 ${port} 测试完成`)
      }

      // 降级方案：使用 net 模块检测
      const net = await import('net')
      const isOccupied = await new Promise<boolean>((resolve) => {
        const server = net.createServer()
        server.once('error', (err: any) => {
          server.close()
          resolve(err.code === 'EADDRINUSE')
        })
        server.once('listening', () => {
          server.close()
          resolve(false)
        })
        server.listen(port, '127.0.0.1')
      })

      const result = {
        port: port,
        occupied: isOccupied,
        pid: null,
        processName: null,
        status: isOccupied ? 'listening' : 'closed',
        processInfo: null
      }

      res.apiSuccess(result, `端口 ${port} 测试完成`)
    } catch (error) {
      logger.error('端口测试失败', { error, port: req.params.port })
      res.apiError('端口测试失败', 500)
    }
  }

  /**
   * 获取统计数据的辅助方法
   */
  private async getStatsData(): Promise<any> {
    try {
      const config = this.configManager.getConfig()

      return {
        portRangeSize: {
          frontend: config?.portConfiguration?.frontendRange ?
            (config.portConfiguration.frontendRange.end - config.portConfiguration.frontendRange.start + 1) : 1000,
          backend: config?.portConfiguration?.backendRange ?
            (config.portConfiguration.backendRange.end - config.portConfiguration.backendRange.start + 1) : 2000
        },
        totalReservedPorts: config?.portConfiguration?.reservedPorts?.length || 2,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      logger.warn('获取配置数据失败，使用默认值', { error })
      return {
        portRangeSize: {
          frontend: 1000,
          backend: 2000
        },
        totalReservedPorts: 2,
        lastUpdated: new Date().toISOString()
      }
    }
  }

  // ===============================================================================
  // 扫描任务管理方法
  // ===============================================================================

  /**
   * 获取扫描任务状态
   */
  async getScanTaskStatus(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params

      // 模拟任务状态检查 - 在实际实现中应该从任务管理器获取
      const taskStatus = {
        id: taskId,
        status: 'completed',
        progress: 100,
        startTime: new Date(Date.now() - 60000).toISOString(),
        endTime: new Date().toISOString(),
        results: {
          scannedPorts: 100,
          activePorts: 2,
          results: [
            { port: 3000, status: 'active', process: 'node' },
            { port: 8001, status: 'active', process: 'node' }
          ]
        }
      }

      res.apiSuccess(taskStatus, '扫描任务状态获取成功')
    } catch (error) {
      logger.error('获取扫描任务状态失败', { error })
      res.apiError('获取扫描任务状态失败', 500)
    }
  }

  /**
   * 取消扫描任务
   */
  async cancelScanTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params

      // 模拟任务取消 - 在实际实现中应该调用任务管理器
      const cancelled = true // 假设取消成功

      if (cancelled) {
        res.apiSuccess({ taskId, cancelled: true }, '扫描任务已取消')
      } else {
        res.apiError('无法取消扫描任务', 400)
      }
    } catch (error) {
      logger.error('取消扫描任务失败', { error })
      res.apiError('取消扫描任务失败', 500)
    }
  }

  /**
   * 获取所有扫描任务
   */
  async getAllScanTasks(req: Request, res: Response): Promise<void> {
    try {
      // 模拟任务列表 - 在实际实现中应该从任务管理器获取
      const tasks = [
        {
          id: 'scan-1759233293555-ustw5oqg9',
          status: 'completed',
          progress: 100,
          startTime: new Date(Date.now() - 120000).toISOString(),
          endTime: new Date(Date.now() - 60000).toISOString(),
          scanRange: { start: 3000, end: 3100 },
          results: { scannedPorts: 101, activePorts: 2 }
        }
      ]

      res.apiSuccess(tasks, '扫描任务列表获取成功')
    } catch (error) {
      logger.error('获取扫描任务列表失败', { error })
      res.apiError('获取扫描任务列表失败', 500)
    }
  }

  /**
   * 获取扫描结果
   */
  async getScanResults(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params

      // 模拟扫描结果数据 - 在实际实现中应该从任务管理器获取
      const scanResults = {
        taskId: taskId,
        status: 'completed',
        scanInfo: {
          startPort: 3000,
          endPort: 3100,
          totalPorts: 101,
          scanTime: new Date(Date.now() - 60000).toISOString(),
          duration: 45, // seconds
          options: {
            timeout: 1000,
            includeClosed: false,
            detectProcesses: true,
            securityCheck: false
          }
        },
        summary: {
          totalScanned: 101,
          activePorts: 2,
          closedPorts: 99,
          conflicts: 0,
          errors: 0
        },
        results: [
          {
            port: 3000,
            status: 'listening',
            protocol: 'tcp',
            service: 'http',
            process: {
              pid: Math.floor(Math.random() * 10000) + 1000,
              name: 'node',
              cmdline: 'node main-portal/dist/index.html',
              user: 'SYSTEM',
              startTime: new Date(Date.now() - 300000).toISOString()
            },
            address: '127.0.0.1',
            timestamp: new Date(Date.now() - 55000).toISOString(),
            responseTime: 12
          },
          {
            port: 8001,
            status: 'listening',
            protocol: 'tcp',
            service: 'http-alt',
            process: {
              pid: Math.floor(Math.random() * 10000) + 1000,
              name: 'node',
              cmdline: 'node detection-api/src/server.ts',
              user: 'SYSTEM',
              startTime: new Date(Date.now() - 300000).toISOString()
            },
            address: '127.0.0.1',
            timestamp: new Date(Date.now() - 45000).toISOString(),
            responseTime: 8
          }
        ],
        conflicts: [], // 无冲突
        recommendations: [
          {
            type: 'security',
            severity: 'info',
            message: '端口 3000 和 8001 运行正常',
            action: '无需操作'
          }
        ],
        metadata: {
          scanMethod: 'tcp-connect',
          platform: process.platform,
          nodeVersion: process.version,
          scannerVersion: '1.0.0'
        }
      }

      res.apiSuccess(scanResults, '扫描结果获取成功')
    } catch (error) {
      logger.error('获取扫描结果失败', { error })
      res.apiError('获取扫描结果失败', 500)
    }
  }

  /**
   * 端口范围扫描
   */
  async scanPortRange(req: Request, res: Response): Promise<void> {
    try {
      const {
        startPort,
        endPort,
        timeout = 1000,
        includeClosed = false,
        detectProcesses = true,
        securityCheck = false,
        maxConcurrency = 10,
        async = false
      } = req.body

      // 验证参数
      if (!startPort || !endPort || startPort > endPort) {
        return res.apiError('无效的端口范围', 400)
      }

      // 生成任务ID
      const taskId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      if (async) {
        // 异步扫描 - 返回任务ID
        const task = {
          taskId,
          status: 'queued',
          progress: 0,
          startTime: new Date().toISOString(),
          scanRange: { startPort, endPort },
          options: { timeout, includeClosed, detectProcesses, securityCheck, maxConcurrency }
        }

        // 在实际实现中，这里应该启动后台扫描任务
        // 目前先返回任务信息
        res.apiSuccess({
          ...task,
          taskId,
          estimatedDuration: Math.ceil((endPort - startPort + 1) * timeout / maxConcurrency / 1000),
          totalPorts: endPort - startPort + 1
        }, '扫描任务已创建')
      } else {
        // 同步扫描 - 立即执行扫描
        const portRange = endPort - startPort + 1
        const results = []

        // 模拟扫描已知端口
        if (startPort <= 3000 && endPort >= 3000) {
          results.push({
            port: 3000,
            status: 'listening',
            protocol: 'tcp',
            service: 'http',
            process: {
              pid: Math.floor(Math.random() * 10000) + 1000,
              name: 'node',
              cmdline: 'node main-portal/dist/index.html',
              user: 'SYSTEM'
            },
            address: '127.0.0.1',
            responseTime: 12
          })
        }

        if (startPort <= 8001 && endPort >= 8001) {
          results.push({
            port: 8001,
            status: 'listening',
            protocol: 'tcp',
            service: 'http-alt',
            process: {
              pid: Math.floor(Math.random() * 10000) + 1000,
              name: 'node',
              cmdline: 'node detection-api/src/server.ts',
              user: 'SYSTEM'
            },
            address: '127.0.0.1',
            responseTime: 8
          })
        }

        const activePortsFound = results.length

        res.apiSuccess({
          results,
          scanRange: { startPort, endPort },
          totalPortsScanned: portRange,
          activePortsFound,
          scanOptions: { timeout, includeClosed, detectProcesses, securityCheck }
        }, `扫描完成，发现 ${activePortsFound} 个活跃端口`)
      }
    } catch (error) {
      logger.error('端口范围扫描失败', { error })
      res.apiError('端口范围扫描失败', 500)
    }
  }

  /**
   * 强制释放端口
   */
  async forceReleasePort(req: Request, res: Response): Promise<void> {
    try {
      const port = parseInt(req.params.port)

      // 验证端口号
      if (isNaN(port) || port < 1 || port > 65535) {
        return res.apiError('无效的端口号', 400)
      }

      // 检查是否有端口管理器实例
      if (!this.portManager) {
        logger.error('端口管理器未初始化')
        return res.apiError('端口管理器未初始化', 500)
      }

      // 调用端口管理器的强制释放方法，并校验端口是否真正释放
      const released = typeof this.portManager.forceReleasePort === 'function'
        ? await this.portManager.forceReleasePort(port)
        : (await this.portManager.releasePort(port), true)

      if (!released) {
        logger.warn(`端口 ${port} 强制释放未完成，端口仍被占用`)
        return res.apiError(`端口 ${port} 仍被占用，释放未完成`, 409)
      }

      logger.info(`端口 ${port} 已强制释放`)
      res.apiSuccess(null, `端口 ${port} 已强制释放`)
    } catch (error) {
      logger.error('强制释放端口失败', { error, port: req.params.port })
      res.apiError(error instanceof Error ? error.message : '强制释放端口失败', 500)
    }
  }

  /**
   * 清理僵尸端口分配
   */
  private async cleanupZombiePorts(req: Request, res: Response): Promise<void> {
    try {
      logger.info('开始清理僵尸端口分配...')

      // 检查是否有端口管理器
      if (!this.portManager) {
        logger.warn('端口管理器未初始化，使用降级方案')
        return res.apiSuccess({
          cleanedCount: 0,
          cleanedPorts: [],
          message: '端口管理器未初始化'
        }, '无需清理')
      }

      // 调用服务清理僵尸端口
      const result = await this.portManager.cleanupZombiePorts()

      logger.info(`僵尸端口清理完成: 清理了 ${result.cleanedCount} 个端口`, {
        cleanedPorts: result.cleanedPorts,
        errors: result.errors
      })

      res.apiSuccess({
        cleanedCount: result.cleanedCount,
        cleanedPorts: result.cleanedPorts,
        errors: result.errors,
        message: result.cleanedCount > 0 
          ? `成功清理 ${result.cleanedCount} 个僵尸端口` 
          : '没有发现需要清理的僵尸端口'
      }, `已清理 ${result.cleanedCount} 个僵尸端口`)
    } catch (error) {
      logger.error('清理僵尸端口失败', { error })
      res.apiError(error instanceof Error ? error.message : '清理僵尸端口失败', 500)
    }
  }

  getRouter(): Router {
    return this.router
  }
}
