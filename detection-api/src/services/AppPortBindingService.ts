/**
 * 应用端口绑定服务
 * 负责管理应用的端口需求和分配
 */

import { Database } from 'better-sqlite3'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import {
  AppPortBinding,
  PortRequirement,
  AllocatedPort,
  CreateAppPortBindingRequest,
  UpdateAppPortBindingRequest,
  AllocatePortsRequest,
  AllocatePortsResponse,
  AppPortBindingListQuery,
  AppPortBindingListResponse,
  AppPortBindingStatistics,
  PortAllocationResult,
  PortConflict,
  BatchAllocatePortsRequest,
  BatchAllocatePortsResponse,
  ReleasePortRequest,
  ApiResponse
} from '../types/appPortBinding'
import { WebSocketManager } from './websocket'
import { ConfigManager } from './configManager'
import { logger } from '../utils/logger'

export class AppPortBindingService extends EventEmitter {
  private db: Database
  private wsManager?: WebSocketManager
  private configManager: ConfigManager

  constructor(database: Database, configManager: ConfigManager, wsManager?: WebSocketManager) {
    super()
    this.db = database
    this.configManager = configManager
    this.wsManager = wsManager
    this.initializeService()
  }

  /**
   * 初始化服务
   */
  private async initializeService(): Promise<void> {
    try {
      await this.ensureTablesExist()
      logger.debug('AppPortBindingService initialized')
    } catch (error) {
      logger.error('Failed to initialize AppPortBindingService', { error })
      throw error
    }
  }

  /**
   * 确保数据库表存在
   */
  private async ensureTablesExist(): Promise<void> {
    try {
      // 检查应用端口绑定表
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='app_port_bindings'
      `).get()

      if (!tableCheck) {
        logger.info('app_port_bindings 表不存在，正在创建...')
        await this.createRequiredTables()
        logger.info('应用端口绑定表创建成功')
      } else {
        logger.debug('app_port_bindings 表已存在')
      }
      
    } catch (error) {
      logger.error('检查或创建数据库表时出错', { error })
      throw error
    }
  }

  /**
   * 创建必要的数据库表
   */
  private async createRequiredTables(): Promise<void> {
    const tables = [
      // 应用端口绑定主表
      `CREATE TABLE IF NOT EXISTS app_port_bindings (
        id TEXT PRIMARY KEY,
        app_id TEXT NOT NULL UNIQUE,
        app_name TEXT NOT NULL,
        tech_stack TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'allocated', 'active', 'error')) DEFAULT 'pending',
        priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')) DEFAULT 'normal',
        environment TEXT NOT NULL CHECK (environment IN ('development', 'testing', 'production')) DEFAULT 'development',
        tags TEXT,
        auto_allocate BOOLEAN DEFAULT true,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_by TEXT DEFAULT 'system',
        last_allocated_at DATETIME
      )`,

      // 端口需求表
      `CREATE TABLE IF NOT EXISTS port_requirements (
        id TEXT PRIMARY KEY,
        binding_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('frontend', 'backend', 'api', 'websocket')),
        protocol TEXT NOT NULL CHECK (protocol IN ('http', 'https', 'ws', 'wss')),
        count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0 AND count <= 10),
        preferred_range TEXT CHECK (preferred_range IN ('frontend', 'backend', 'auto')),
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
      )`,

      // 已分配端口表
      `CREATE TABLE IF NOT EXISTS allocated_ports (
        id TEXT PRIMARY KEY,
        binding_id TEXT NOT NULL,
        requirement_id TEXT NOT NULL,
        port INTEGER NOT NULL,
        type TEXT NOT NULL,
        protocol TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('allocated', 'active', 'inactive')) DEFAULT 'allocated',
        allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        released_at DATETIME,
        process_id INTEGER,
        last_verified DATETIME,
        verification_result TEXT,
        FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE,
        FOREIGN KEY (requirement_id) REFERENCES port_requirements(id) ON DELETE CASCADE
      )`,

      // 端口分配历史表
      `CREATE TABLE IF NOT EXISTS port_allocation_history (
        id TEXT PRIMARY KEY,
        binding_id TEXT NOT NULL,
        port INTEGER NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('allocate', 'release', 'verify', 'conflict', 'create', 'update', 'delete', 'cleanup', 'force_release', 'batch_allocate', 'batch_release')),
        result TEXT NOT NULL CHECK (result IN ('success', 'failed', 'conflict')),
        details TEXT,
        error_message TEXT,
        allocated_by TEXT DEFAULT 'system',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
      )`,

      // 端口冲突记录表
      `CREATE TABLE IF NOT EXISTS port_binding_conflicts (
        id TEXT PRIMARY KEY,
        port INTEGER NOT NULL,
        existing_binding_id TEXT NOT NULL,
        new_binding_id TEXT NOT NULL,
        conflict_type TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
        auto_resolvable BOOLEAN DEFAULT false,
        suggested_actions TEXT,
        detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolution TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'ignored')) DEFAULT 'active',
        FOREIGN KEY (existing_binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE,
        FOREIGN KEY (new_binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
      )`
    ]

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_app_port_bindings_app_id ON app_port_bindings(app_id)',
      'CREATE INDEX IF NOT EXISTS idx_app_port_bindings_status ON app_port_bindings(status)',
      'CREATE INDEX IF NOT EXISTS idx_app_port_bindings_tech_stack ON app_port_bindings(tech_stack)',
      'CREATE INDEX IF NOT EXISTS idx_app_port_bindings_environment ON app_port_bindings(environment)',
      'CREATE INDEX IF NOT EXISTS idx_port_requirements_binding_id ON port_requirements(binding_id)',
      'CREATE INDEX IF NOT EXISTS idx_allocated_ports_binding_id ON allocated_ports(binding_id)',
      'CREATE INDEX IF NOT EXISTS idx_allocated_ports_port ON allocated_ports(port)',
      'CREATE INDEX IF NOT EXISTS idx_allocated_ports_status ON allocated_ports(status)'
    ]

    const transaction = this.db.transaction(() => {
      // 创建表
      for (const sql of tables) {
        this.db.exec(sql)
      }
      
      // 创建索引
      for (const sql of indexes) {
        this.db.exec(sql)
      }

      // 插入默认数据
      this.insertDefaultData()
    })

    transaction()
  }

  /**
   * 插入默认数据
   */
  private insertDefaultData(): void {
    try {
      // 插入默认应用绑定
      this.db.prepare(`
        INSERT OR IGNORE INTO app_port_bindings (
          id, app_id, app_name, tech_stack, description, status, priority, environment, tags, auto_allocate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'binding-portal-frontend',
        'portal-frontend',
        '门户前端',
        'Vue 3 + Vite',
        '主要的门户前端应用',
        'allocated',
        'high',
        'production',
        JSON.stringify(['前端项目', '核心应用']),
        1
      )

      this.db.prepare(`
        INSERT OR IGNORE INTO app_port_bindings (
          id, app_id, app_name, tech_stack, description, status, priority, environment, tags, auto_allocate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'binding-detection-api',
        'detection-api',
        '检测API服务',
        'Node.js + Express',
        '应用检测和管理API服务',
        'allocated',
        'high',
        'production',
        JSON.stringify(['后端服务', 'API服务', '核心应用']),
        1
      )

      // 插入端口需求
      this.db.prepare(`
        INSERT OR IGNORE INTO port_requirements (
          id, binding_id, type, protocol, count, preferred_range, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'req-portal-frontend-1',
        'binding-portal-frontend',
        'frontend',
        'http',
        1,
        'frontend',
        '前端开发服务器端口'
      )

      this.db.prepare(`
        INSERT OR IGNORE INTO port_requirements (
          id, binding_id, type, protocol, count, preferred_range, description
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'req-detection-api-1',
        'binding-detection-api',
        'backend',
        'http',
        1,
        'backend',
        'API服务主端口'
      )

      // 插入已分配端口
      this.db.prepare(`
        INSERT OR IGNORE INTO allocated_ports (
          id, binding_id, requirement_id, port, type, protocol, status, allocated_at, last_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'port-3000',
        'binding-portal-frontend',
        'req-portal-frontend-1',
        3000,
        'frontend',
        'http',
        'active',
        new Date().toISOString(),
        new Date().toISOString()
      )

      this.db.prepare(`
        INSERT OR IGNORE INTO allocated_ports (
          id, binding_id, requirement_id, port, type, protocol, status, allocated_at, last_verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'port-8001',
        'binding-detection-api',
        'req-detection-api-1',
        8001,
        'backend',
        'http',
        'active',
        new Date().toISOString(),
        new Date().toISOString()
      )

      logger.info('默认数据插入成功')
    } catch (error) {
      logger.warn('插入默认数据时出现警告', { error })
    }
  }

  /**
   * 创建应用端口绑定
   */
  async createAppPortBinding(request: CreateAppPortBindingRequest): Promise<ApiResponse<AppPortBinding>> {
    const transaction = this.db.transaction(() => {
      try {
        // 检查应用ID是否已存在
        const existingBinding = this.db.prepare(`
          SELECT id FROM app_port_bindings WHERE app_id = ?
        `).get(request.appId)

        if (existingBinding) {
          throw new Error(`应用ID "${request.appId}" 已存在端口绑定`)
        }

        // 创建绑定记录
        const bindingId = uuidv4()
        const now = new Date().toISOString()

        this.db.prepare(`
          INSERT INTO app_port_bindings (
            id, app_id, app_name, tech_stack, description, status, 
            priority, environment, tags, auto_allocate, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          bindingId,
          request.appId,
          request.appName,
          request.techStack,
          request.description || null,
          'pending',
          request.priority || 'normal',
          request.environment || 'development',
          JSON.stringify(request.tags || []),
          request.autoAllocate ? 1 : 0,
          now,
          now
        )

        // 创建端口需求记录
        const requirementStmt = this.db.prepare(`
          INSERT INTO port_requirements (
            id, binding_id, type, protocol, count, preferred_range, description
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        for (const req of request.portRequirements) {
          const reqId = uuidv4()
          requirementStmt.run(
            reqId,
            bindingId,
            req.type,
            req.protocol,
            req.count,
            req.preferredRange || 'auto',
            req.description || null
          )
        }

        // 如果启用自动分配，立即分配端口
        let binding = this.getAppPortBindingById(bindingId)
        if (request.autoAllocate && binding) {
          const allocationResult = this.allocatePortsForBinding(binding)
          binding = this.getAppPortBindingById(bindingId) // 重新获取更新后的数据
        }

        // 记录操作历史
        this.recordHistory(bindingId, 'create', {
          appId: request.appId,
          appName: request.appName,
          autoAllocate: request.autoAllocate
        })

        this.emit('bindingCreated', { bindingId, appId: request.appId })

        // 广播应用绑定创建更新
        this.broadcastBindingUpdate(binding!, 'created')

        return {
          success: true,
          message: '应用端口绑定创建成功',
          data: binding!,
          timestamp: new Date().toISOString()
        }

      } catch (error) {
        throw error
      }
    })

    try {
      return transaction()
    } catch (error) {
      console.error('创建应用端口绑定失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '创建失败',
        error: {
          code: 'CREATE_BINDING_FAILED',
          details: error
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 获取应用端口绑定列表
   */
  async getAppPortBindings(query: AppPortBindingListQuery = {}): Promise<AppPortBindingListResponse> {
    try {
      const {
        page = 1,
        pageSize = 20,
        search = '',
        status = '',
        techStack = '',
        environment = '',
        tags = [],
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = query

      let whereConditions: string[] = []
      let params: any[] = []

      // 构建查询条件
      if (search) {
        whereConditions.push('(app_name LIKE ? OR app_id LIKE ? OR tech_stack LIKE ?)')
        const searchPattern = `%${search}%`
        params.push(searchPattern, searchPattern, searchPattern)
      }

      if (status) {
        whereConditions.push('status = ?')
        params.push(status)
      }

      if (techStack) {
        whereConditions.push('tech_stack = ?')
        params.push(techStack)
      }

      if (environment) {
        whereConditions.push('environment = ?')
        params.push(environment)
      }

      if (tags.length > 0) {
        // 简单的标签匹配（实际项目中可能需要更复杂的JSON查询）
        const tagConditions = tags.map(() => 'tags LIKE ?').join(' OR ')
        whereConditions.push(`(${tagConditions})`)
        tags.forEach(tag => params.push(`%"${tag}"%`))
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
      const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`
      const limitClause = `LIMIT ? OFFSET ?`

      // 获取总数
      const countQuery = `SELECT COUNT(*) as total FROM app_port_bindings ${whereClause}`
      const totalResult = this.db.prepare(countQuery).get(...params) as { total: number }
      const total = totalResult.total

      // 获取分页数据
      const offset = (page - 1) * pageSize
      const dataQuery = `
        SELECT * FROM app_port_bindings 
        ${whereClause} 
        ${orderClause} 
        ${limitClause}
      `
      
      const bindings = this.db.prepare(dataQuery).all(...params, pageSize, offset) as any[]

      // 为每个绑定加载关联数据
      const bindingsWithDetails = bindings.map(binding => this.enrichBindingData(binding))

      // 计算统计信息
      const statistics = this.calculateStatistics()

      return {
        success: true,
        data: {
          bindings: bindingsWithDetails,
          pagination: {
            currentPage: page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize)
          },
          statistics
        }
      }

    } catch (error) {
      console.error('获取应用端口绑定列表失败:', error)
      throw error
    }
  }

  /**
   * 根据ID获取应用端口绑定
   */
  getAppPortBindingById(id: string): AppPortBinding | null {
    try {
      const binding = this.db.prepare(`
        SELECT * FROM app_port_bindings WHERE id = ?
      `).get(id) as any

      if (!binding) {
        return null
      }

      return this.enrichBindingData(binding)
    } catch (error) {
      console.error('获取应用端口绑定失败:', error)
      return null
    }
  }

  /**
   * 更新应用端口绑定
   */
  async updateAppPortBinding(id: string, request: UpdateAppPortBindingRequest): Promise<ApiResponse<AppPortBinding>> {
    const transaction = this.db.transaction(() => {
      try {
        const existingBinding = this.getAppPortBindingById(id)
        if (!existingBinding) {
          throw new Error('应用端口绑定不存在')
        }

        // 更新基础信息
        const updateFields: string[] = []
        const updateParams: any[] = []

        if (request.appName !== undefined) {
          updateFields.push('app_name = ?')
          updateParams.push(request.appName)
        }

        if (request.techStack !== undefined) {
          updateFields.push('tech_stack = ?')
          updateParams.push(request.techStack)
        }

        if (request.description !== undefined) {
          updateFields.push('description = ?')
          updateParams.push(request.description)
        }

        if (request.priority !== undefined) {
          updateFields.push('priority = ?')
          updateParams.push(request.priority)
        }

        if (request.environment !== undefined) {
          updateFields.push('environment = ?')
          updateParams.push(request.environment)
        }

        if (request.tags !== undefined) {
          updateFields.push('tags = ?')
          updateParams.push(JSON.stringify(request.tags))
        }

        if (updateFields.length > 0) {
          updateFields.push('updated_at = ?')
          updateParams.push(new Date().toISOString())
          updateParams.push(id)

          this.db.prepare(`
            UPDATE app_port_bindings 
            SET ${updateFields.join(', ')} 
            WHERE id = ?
          `).run(...updateParams)
        }

        // 更新端口需求
        if (request.portRequirements !== undefined) {
          // 删除现有需求
          this.db.prepare('DELETE FROM port_requirements WHERE binding_id = ?').run(id)

          // 插入新需求
          const requirementStmt = this.db.prepare(`
            INSERT INTO port_requirements (
              id, binding_id, type, protocol, count, preferred_range, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `)

          for (const req of request.portRequirements) {
            const reqId = uuidv4()
            requirementStmt.run(
              reqId,
              id,
              req.type,
              req.protocol,
              req.count,
              req.preferredRange || 'auto',
              req.description || null
            )
          }

          // 如果端口需求有变化，可能需要重新分配端口
          const hasAllocatedPorts = existingBinding.allocatedPorts.length > 0
          if (hasAllocatedPorts) {
            // 检查现有分配是否仍然满足新需求
            const needsReallocation = this.checkNeedsReallocation(id, request.portRequirements)
            if (needsReallocation) {
              // 标记为需要重新分配
              this.db.prepare(`
                UPDATE app_port_bindings 
                SET status = 'pending' 
                WHERE id = ?
              `).run(id)
            }
          }
        }

        // 记录操作历史
        this.recordHistory(id, 'update', {
          changes: request,
          previousStatus: existingBinding.status
        })

        const updatedBinding = this.getAppPortBindingById(id)
        this.emit('bindingUpdated', { bindingId: id, changes: request })

        // 广播应用绑定更新
        this.broadcastBindingUpdate(updatedBinding!, 'updated')

        return {
          success: true,
          message: '应用端口绑定更新成功',
          data: updatedBinding!,
          timestamp: new Date().toISOString()
        }

      } catch (error) {
        throw error
      }
    })

    try {
      return transaction()
    } catch (error) {
      console.error('更新应用端口绑定失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '更新失败',
        error: {
          code: 'UPDATE_BINDING_FAILED',
          details: error
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 为应用分配端口
   */
  async allocatePorts(request: AllocatePortsRequest): Promise<AllocatePortsResponse> {
    try {
      const binding = this.getAppPortBindingById(request.bindingId)
      if (!binding) {
        return {
          success: false,
          message: '应用端口绑定不存在',
          data: {
            bindingId: request.bindingId,
            allocatedPorts: [],
            conflicts: []
          }
        }
      }

      if (request.forceReallocation) {
        // 首先释放现有端口
        await this.releasePortsForBinding(request.bindingId)
      }

      const result = this.allocatePortsForBinding(binding)
      
      return {
        success: result.success,
        message: result.message,
        data: {
          bindingId: request.bindingId,
          allocatedPorts: result.allocatedPorts || [],
          conflicts: result.conflicts || []
        }
      }

    } catch (error) {
      console.error('分配端口失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '分配端口失败',
        data: {
          bindingId: request.bindingId,
          allocatedPorts: [],
          conflicts: []
        }
      }
    }
  }

  /**
   * 为绑定分配端口的核心逻辑
   */
  private allocatePortsForBinding(binding: AppPortBinding): {
    success: boolean
    message: string
    allocatedPorts?: AllocatedPort[]
    conflicts?: PortConflict[]
  } {
    const transaction = this.db.transaction(() => {
      try {
        const allocatedPorts: AllocatedPort[] = []
        const conflicts: PortConflict[] = []

        for (const requirement of binding.portRequirements) {
          for (let i = 0; i < requirement.count; i++) {
            const allocationResult = this.findAndAllocatePort(binding, requirement)
            
            if (allocationResult.success) {
              const allocatedPort: AllocatedPort = {
                id: uuidv4(),
                port: allocationResult.port!,
                type: requirement.type,
                protocol: requirement.protocol,
                status: 'allocated',
                allocatedAt: new Date().toISOString()
              }

              // 保存到数据库
              this.db.prepare(`
                INSERT INTO allocated_ports (
                  id, binding_id, requirement_id, port, type, protocol, 
                  status, allocated_at, last_verified
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                allocatedPort.id,
                binding.id,
                requirement.id || uuidv4(),
                allocatedPort.port,
                allocatedPort.type,
                allocatedPort.protocol,
                allocatedPort.status,
                allocatedPort.allocatedAt,
                allocatedPort.allocatedAt
              )

              allocatedPorts.push(allocatedPort)

              // 记录分配历史
              this.recordAllocationHistory(binding.id, allocatedPort.port, 'allocate', 'success', {
                type: requirement.type,
                protocol: requirement.protocol
              })

              // 广播端口分配更新
              this.broadcastPortAllocation(allocatedPort, binding)

            } else {
              // 处理分配失败或冲突
              if (allocationResult.conflictWith) {
                conflicts.push({
                  port: allocationResult.port!,
                  existingBinding: {
                    id: allocationResult.conflictWith,
                    appName: 'Unknown', // 需要查询获取
                    type: requirement.type,
                    protocol: requirement.protocol
                  },
                  newRequirement: {
                    bindingId: binding.id,
                    appName: binding.appName,
                    type: requirement.type,
                    protocol: requirement.protocol
                  },
                  severity: 'high',
                  autoResolvable: false,
                  suggestedActions: ['选择其他端口', '释放冲突端口', '修改端口需求']
                })

                // 广播端口冲突更新
                this.broadcastPortConflictUpdate(conflicts[conflicts.length - 1])
              }

              // 记录分配失败
              this.recordAllocationHistory(binding.id, allocationResult.port || 0, 'allocate', 'failed', {
                reason: allocationResult.reason,
                conflictWith: allocationResult.conflictWith
              })
            }
          }
        }

        // 更新绑定状态
        const newStatus = allocatedPorts.length > 0 ? 'allocated' : 'error'
        this.db.prepare(`
          UPDATE app_port_bindings 
          SET status = ?, last_allocated_at = ?, updated_at = ?
          WHERE id = ?
        `).run(newStatus, new Date().toISOString(), new Date().toISOString(), binding.id)

        const success = allocatedPorts.length > 0
        const message = success 
          ? `成功分配 ${allocatedPorts.length} 个端口${conflicts.length > 0 ? `，${conflicts.length} 个冲突` : ''}`
          : '端口分配失败'

        return {
          success,
          message,
          allocatedPorts,
          conflicts
        }

      } catch (error) {
        throw error
      }
    })

    return transaction()
  }

  /**
   * 查找并分配单个端口
   */
  private findAndAllocatePort(binding: AppPortBinding, requirement: PortRequirement): PortAllocationResult {
    // 根据偏好范围确定搜索范围
    let startPort: number
    let endPort: number

    // 从配置管理器获取端口范围
    const portConfig = this.configManager.getPortConfig()
    
    switch (requirement.preferredRange) {
      case 'frontend':
        startPort = portConfig?.frontendRange.start || 3001
        endPort = portConfig?.frontendRange.end || 3100
        break
      case 'backend':
        startPort = portConfig?.backendRange.start || 8001
        endPort = portConfig?.backendRange.end || 8100
        break
      default:
        // 自动选择：根据类型选择合适的范围
        if (requirement.type === 'frontend') {
          startPort = portConfig?.frontendRange.start || 3001
          endPort = portConfig?.frontendRange.end || 3100
        } else {
          startPort = portConfig?.backendRange.start || 8001
          endPort = portConfig?.backendRange.end || 8100
        }
    }

    // 查找可用端口
    for (let port = startPort; port <= endPort; port++) {
      if (this.isPortAvailable(port)) {
        return {
          port,
          type: requirement.type,
          protocol: requirement.protocol,
          success: true
        }
      } else {
        // 检查是否有冲突
        const conflictInfo = this.getPortConflictInfo(port)
        if (conflictInfo) {
          return {
            port,
            type: requirement.type,
            protocol: requirement.protocol,
            success: false,
            reason: 'Port conflict detected',
            conflictWith: conflictInfo.bindingId
          }
        }
      }
    }

    return {
      port: 0,
      type: requirement.type,
      protocol: requirement.protocol,
      success: false,
      reason: 'No available ports in range'
    }
  }

  /**
   * 检查端口是否可用
   */
  private isPortAvailable(port: number): boolean {
    const existingAllocation = this.db.prepare(`
      SELECT id FROM allocated_ports 
      WHERE port = ? AND status IN ('allocated', 'active') AND released_at IS NULL
    `).get(port)

    return !existingAllocation
  }

  /**
   * 获取端口冲突信息
   */
  private getPortConflictInfo(port: number): { bindingId: string; appName: string } | null {
    const conflict = this.db.prepare(`
      SELECT ap.binding_id, apb.app_name
      FROM allocated_ports ap
      JOIN app_port_bindings apb ON ap.binding_id = apb.id
      WHERE ap.port = ? AND ap.status IN ('allocated', 'active') AND ap.released_at IS NULL
    `).get(port) as any

    return conflict ? { bindingId: conflict.binding_id, appName: conflict.app_name } : null
  }

  /**
   * 释放端口
   */
  async releasePorts(request: ReleasePortRequest): Promise<ApiResponse<void>> {
    const transaction = this.db.transaction(() => {
      try {
        const binding = this.getAppPortBindingById(request.bindingId)
        if (!binding) {
          throw new Error('应用端口绑定不存在')
        }

        const now = new Date().toISOString()

        if (request.ports && request.ports.length > 0) {
          // 释放指定端口
          for (const port of request.ports) {
            this.db.prepare(`
              UPDATE allocated_ports 
              SET status = 'inactive', released_at = ?
              WHERE binding_id = ? AND port = ? AND released_at IS NULL
            `).run(now, request.bindingId, port)

            this.recordAllocationHistory(request.bindingId, port, 'release', 'success', {
              releasedBy: 'manual'
            })
          }
        } else {
          // 释放所有端口
          this.db.prepare(`
            UPDATE allocated_ports 
            SET status = 'inactive', released_at = ?
            WHERE binding_id = ? AND released_at IS NULL
          `).run(now, request.bindingId)

          // 为所有释放的端口记录历史
          const releasedPorts = this.db.prepare(`
            SELECT port FROM allocated_ports 
            WHERE binding_id = ? AND released_at = ?
          `).all(request.bindingId, now) as { port: number }[]

          releasedPorts.forEach(({ port }) => {
            this.recordAllocationHistory(request.bindingId, port, 'release', 'success', {
              releasedBy: 'manual'
            })
          })
        }

        // 更新绑定状态
        this.db.prepare(`
          UPDATE app_port_bindings 
          SET status = 'pending', updated_at = ?
          WHERE id = ?
        `).run(now, request.bindingId)

        this.emit('portsReleased', { bindingId: request.bindingId, ports: request.ports })

        return {
          success: true,
          message: '端口释放成功',
          timestamp: new Date().toISOString()
        }

      } catch (error) {
        throw error
      }
    })

    try {
      return transaction()
    } catch (error) {
      console.error('释放端口失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '释放端口失败',
        error: {
          code: 'RELEASE_PORTS_FAILED',
          details: error
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 删除应用端口绑定
   */
  async deleteAppPortBinding(id: string): Promise<ApiResponse<void>> {
    const transaction = this.db.transaction(() => {
      try {
        const binding = this.getAppPortBindingById(id)
        if (!binding) {
          throw new Error('应用端口绑定不存在')
        }

        // 先记录删除历史（在删除主记录之前）
        this.recordHistory(id, 'delete', { appId: binding.appId })

        // 释放所有端口
        this.releasePortsForBinding(id)

        // 删除绑定记录（由于外键约束，相关记录会自动删除）
        this.db.prepare('DELETE FROM app_port_bindings WHERE id = ?').run(id)
        this.emit('bindingDeleted', { bindingId: id, appId: binding.appId })

        // 广播应用绑定删除更新
        this.broadcastBindingUpdate(binding, 'deleted')

        return {
          success: true,
          message: '应用端口绑定删除成功',
          timestamp: new Date().toISOString()
        }

      } catch (error) {
        throw error
      }
    })

    try {
      return transaction()
    } catch (error) {
      console.error('删除应用端口绑定失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '删除失败',
        error: {
          code: 'DELETE_BINDING_FAILED',
          details: error
        },
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<AppPortBindingStatistics> {
    try {
      const stats = this.calculateStatistics()
      return stats
    } catch (error) {
      console.error('获取统计信息失败:', error)
      throw error
    }
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 丰富绑定数据（加载关联的需求和已分配端口）
   */
  private enrichBindingData(binding: any): AppPortBinding {
    /**
     * 辅助函数：转换SQLite日期格式为ISO 8601格式
     * SQLite格式: "2025-09-28 02:36:51"
     * ISO格式: "2025-09-28T02:36:51.000Z"
     */
    const toISO = (sqliteDate: string | null): string | null => {
      if (!sqliteDate) return null
      try {
        // 将SQLite的空格替换为T，并添加Z表示UTC时区
        const isoString = sqliteDate.replace(' ', 'T') + '.000Z'
        const date = new Date(isoString)
        // 验证日期是否有效
        if (isNaN(date.getTime())) {
          console.warn('Invalid date format:', sqliteDate)
          return null
        }
        return date.toISOString()
      } catch (error) {
        console.error('Date conversion error:', error, sqliteDate)
        return null
      }
    }

    // 解析JSON字段
    const tags = binding.tags ? JSON.parse(binding.tags) : []

    // 加载端口需求
    const requirements = this.db.prepare(`
      SELECT * FROM port_requirements WHERE binding_id = ?
    `).all(binding.id) as any[]

    // 加载已分配端口
    const allocatedPorts = this.db.prepare(`
      SELECT * FROM allocated_ports 
      WHERE binding_id = ? AND released_at IS NULL
    `).all(binding.id) as any[]

    // 转换字段名：snake_case → camelCase，并格式化日期
    return {
      id: binding.id,
      appId: binding.app_id,
      appName: binding.app_name,
      techStack: binding.tech_stack,
      description: binding.description,
      status: binding.status,
      priority: binding.priority,
      environment: binding.environment,
      tags: tags,
      autoAllocate: Boolean(binding.auto_allocate),
      createdAt: toISO(binding.created_at),
      updatedAt: toISO(binding.updated_at),
      createdBy: binding.created_by,
      lastAllocatedAt: toISO(binding.last_allocated_at),
      portRequirements: requirements.map(req => ({
        id: req.id,
        bindingId: req.binding_id,
        type: req.type,
        protocol: req.protocol,
        count: req.count,
        preferredRange: req.preferred_range,
        description: req.description,
        createdAt: toISO(req.created_at)
      })),
      allocatedPorts: allocatedPorts.map(port => ({
        id: port.id,
        bindingId: port.binding_id,
        requirementId: port.requirement_id,
        port: port.port,
        type: port.type,
        protocol: port.protocol,
        status: port.status,
        allocatedAt: toISO(port.allocated_at),
        releasedAt: toISO(port.released_at),
        processId: port.process_id,
        lastVerified: toISO(port.last_verified),
        verificationResult: port.verification_result
      }))
    }
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(): AppPortBindingStatistics {
    const totalResult = this.db.prepare('SELECT COUNT(*) as count FROM app_port_bindings').get() as { count: number }
    const statusStats = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM app_port_bindings GROUP BY status
    `).all() as { status: string; count: number }[]
    
    const techStackStats = this.db.prepare(`
      SELECT tech_stack, COUNT(*) as count FROM app_port_bindings GROUP BY tech_stack
    `).all() as { tech_stack: string; count: number }[]

    const environmentStats = this.db.prepare(`
      SELECT environment, COUNT(*) as count FROM app_port_bindings GROUP BY environment
    `).all() as { environment: string; count: number }[]

    const byStatus = statusStats.reduce((acc, stat) => {
      acc[stat.status] = stat.count
      return acc
    }, {} as Record<string, number>)

    const byTechStack = techStackStats.reduce((acc, stat) => {
      acc[stat.tech_stack] = stat.count
      return acc
    }, {} as Record<string, number>)

    const byEnvironment = environmentStats.reduce((acc, stat) => {
      acc[stat.environment] = stat.count
      return acc
    }, {} as Record<string, number>)

    // 获取冲突数量
    const conflictsResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM port_binding_conflicts WHERE status = 'active'
    `).get() as { count: number }

    return {
      total: totalResult.count,
      allocated: byStatus.allocated || 0,
      pending: byStatus.pending || 0,
      conflicts: conflictsResult.count,
      byTechStack,
      byEnvironment,
      byStatus,
      recentActivity: [] // TODO: 实现最近活动统计
    }
  }

  /**
   * 释放绑定的所有端口
   */
  private releasePortsForBinding(bindingId: string): void {
    const now = new Date().toISOString()
    this.db.prepare(`
      UPDATE allocated_ports 
      SET status = 'inactive', released_at = ?
      WHERE binding_id = ? AND released_at IS NULL
    `).run(now, bindingId)
  }

  /**
   * 检查是否需要重新分配端口
   */
  private checkNeedsReallocation(bindingId: string, newRequirements: PortRequirement[]): boolean {
    // 简化实现：如果需求变化就需要重新分配
    return true
  }

  /**
   * 记录操作历史
   */
  private recordHistory(bindingId: string, action: string, details: any): void {
    this.db.prepare(`
      INSERT INTO port_allocation_history (
        id, binding_id, port, action, result, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      bindingId,
      0, // 非端口特定操作
      action,
      'success',
      JSON.stringify(details),
      new Date().toISOString()
    )
  }

  /**
   * 记录端口分配历史
   */
  private recordAllocationHistory(bindingId: string, port: number, action: string, result: string, details: any): void {
    this.db.prepare(`
      INSERT INTO port_allocation_history (
        id, binding_id, port, action, result, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      bindingId,
      port,
      action,
      result,
      JSON.stringify(details),
      new Date().toISOString()
    )
  }

  // ==================== WebSocket 广播方法 ====================

  /**
   * 广播端口分配更新
   */
  private broadcastPortAllocation(allocatedPort: AllocatedPort, binding: AppPortBinding): void {
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'port_allocation',
        payload: {
          port: allocatedPort.port,
          appId: binding.appId,
          appName: binding.appName,
          allocationType: allocatedPort.type,
          protocol: allocatedPort.protocol,
          action: 'allocated'
        }
      })
    }
  }

  /**
   * 广播端口释放更新
   */
  private broadcastPortRelease(port: number, binding: AppPortBinding): void {
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'port_allocation',
        payload: {
          port,
          appId: binding.appId,
          appName: binding.appName,
          allocationType: 'unknown',
          protocol: 'unknown',
          action: 'released'
        }
      })
    }
  }

  /**
   * 广播应用绑定更新
   */
  private broadcastBindingUpdate(binding: AppPortBinding, action: 'created' | 'updated' | 'deleted'): void {
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'app_binding_update',
        payload: {
          action,
          binding: {
            id: binding.id,
            appId: binding.appId,
            appName: binding.appName,
            techStack: binding.techStack,
            status: binding.status,
            allocatedPorts: binding.allocatedPorts
          }
        }
      })
    }
  }

  /**
   * 广播端口冲突更新
   */
  private broadcastPortConflictUpdate(conflict: PortConflict): void {
    if (this.wsManager) {
      this.wsManager.broadcast({
        type: 'port_conflict',
        payload: {
          port: conflict.port,
          conflictType: 'allocation',
          details: `端口冲突：${conflict.newRequirement.appName} 与 ${conflict.existingBinding.appName}`,
          affectedApps: [conflict.newRequirement.bindingId, conflict.existingBinding.id],
          severity: conflict.severity
        }
      })
    }
  }
}
