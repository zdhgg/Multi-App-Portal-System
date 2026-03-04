/**
 * Build Pipeline Service - 构建流水线服务
 * 
 * 提供图形化构建流程设计、拖拽式步骤编排、依赖关系管理等功能
 * 支持流水线模板和预设配置
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface PipelineNode {
  id: string
  type: 'start' | 'build' | 'test' | 'deploy' | 'notify' | 'condition' | 'parallel' | 'end'
  name: string
  description?: string
  config: any
  position: {
    x: number
    y: number
  }
  inputs: string[]
  outputs: string[]
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  duration?: number
  logs?: string[]
}

export interface PipelineEdge {
  id: string
  source: string
  target: string
  condition?: string
  label?: string
}

export interface BuildPipeline {
  id: string
  name: string
  description?: string
  version: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  variables: Record<string, any>
  triggers: PipelineTrigger[]
  schedule?: {
    enabled: boolean
    cron: string
    timezone: string
  }
  notifications: NotificationConfig[]
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
    tags: string[]
    category: string
  }
  isActive: boolean
}

export interface PipelineTrigger {
  id: string
  type: 'manual' | 'webhook' | 'schedule' | 'file-change' | 'git-push'
  config: any
  enabled: boolean
}

export interface NotificationConfig {
  id: string
  type: 'email' | 'slack' | 'webhook' | 'teams'
  target: string
  events: string[]
  template?: string
  enabled: boolean
}

export interface PipelineExecution {
  id: string
  pipelineId: string
  version: string
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  startTime: number
  endTime?: number
  duration?: number
  triggeredBy: string
  triggerType: string
  nodeExecutions: NodeExecution[]
  variables: Record<string, any>
  logs: ExecutionLog[]
  artifacts: string[]
  createdAt: number
}

export interface NodeExecution {
  nodeId: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  startTime?: number
  endTime?: number
  duration?: number
  output?: any
  error?: string
  logs: string[]
}

export interface ExecutionLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  nodeId?: string
  source: string
}

export interface PipelineTemplate {
  id: string
  name: string
  description: string
  category: string
  framework?: string
  pipeline: Omit<BuildPipeline, 'id' | 'metadata'>
  preview: string
  tags: string[]
  isBuiltIn: boolean
  usageCount: number
}

export class BuildPipelineService extends EventEmitter {
  private activePipelines = new Map<string, PipelineExecution>()

  constructor(private db: Database) {
    super()
    this.initializePipelineService()
  }

  /**
   * 初始化流水线服务
   */
  private async initializePipelineService(): Promise<void> {
    try {
      // 创建流水线表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_pipelines (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          version TEXT NOT NULL DEFAULT '1.0.0',
          nodes TEXT NOT NULL,
          edges TEXT NOT NULL,
          variables TEXT NOT NULL DEFAULT '{}',
          triggers TEXT NOT NULL DEFAULT '[]',
          schedule_config TEXT,
          notifications TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          category TEXT NOT NULL DEFAULT 'custom',
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `)

      // 创建流水线执行表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_executions (
          id TEXT PRIMARY KEY,
          pipeline_id TEXT NOT NULL,
          version TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          triggered_by TEXT NOT NULL,
          trigger_type TEXT NOT NULL,
          node_executions TEXT NOT NULL,
          variables TEXT NOT NULL,
          logs TEXT NOT NULL,
          artifacts TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          FOREIGN KEY (pipeline_id) REFERENCES build_pipelines (id)
        )
      `)

      // 创建流水线模板表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pipeline_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          framework TEXT,
          pipeline_config TEXT NOT NULL,
          preview TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          is_built_in INTEGER NOT NULL DEFAULT 0,
          usage_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_build_pipelines_created_by ON build_pipelines (created_by);
        CREATE INDEX IF NOT EXISTS idx_build_pipelines_is_active ON build_pipelines (is_active);
        CREATE INDEX IF NOT EXISTS idx_pipeline_executions_pipeline_id ON pipeline_executions (pipeline_id);
        CREATE INDEX IF NOT EXISTS idx_pipeline_executions_status ON pipeline_executions (status);
        CREATE INDEX IF NOT EXISTS idx_pipeline_executions_start_time ON pipeline_executions (start_time);
        CREATE INDEX IF NOT EXISTS idx_pipeline_templates_category ON pipeline_templates (category);
        CREATE INDEX IF NOT EXISTS idx_pipeline_templates_framework ON pipeline_templates (framework);
      `)

      // 初始化内置模板
      await this.initializeBuiltInTemplates()

      logger.debug('Build pipeline service initialized')
    } catch (error) {
      logger.error('Failed to initialize build pipeline service', { error })
      throw error
    }
  }

  /**
   * 初始化内置模板
   */
  private async initializeBuiltInTemplates(): Promise<void> {
    const templates = this.getBuiltInTemplates()
    
    for (const template of templates) {
      try {
        const existing = await this.getTemplateById(template.id)
        if (!existing) {
          await this.createTemplate(template)
          logger.info('Built-in pipeline template created', { id: template.id, name: template.name })
        }
      } catch (error) {
        logger.warn('Failed to create built-in pipeline template', { id: template.id, error })
      }
    }
  }

  /**
   * 获取内置模板
   */
  private getBuiltInTemplates(): PipelineTemplate[] {
    return [
      {
        id: 'frontend-ci-cd',
        name: '前端CI/CD流水线',
        description: '完整的前端应用CI/CD流水线，包含构建、测试、部署',
        category: 'ci-cd',
        framework: 'frontend',
        pipeline: {
          name: '前端CI/CD流水线',
          version: '1.0.0',
          nodes: [
            {
              id: 'start',
              type: 'start',
              name: '开始',
              config: {},
              position: { x: 100, y: 100 },
              inputs: [],
              outputs: ['checkout']
            },
            {
              id: 'checkout',
              type: 'build',
              name: '代码检出',
              config: { action: 'git-checkout' },
              position: { x: 300, y: 100 },
              inputs: ['start'],
              outputs: ['install']
            },
            {
              id: 'install',
              type: 'build',
              name: '安装依赖',
              config: { command: 'npm install' },
              position: { x: 500, y: 100 },
              inputs: ['checkout'],
              outputs: ['lint', 'test']
            },
            {
              id: 'lint',
              type: 'test',
              name: '代码检查',
              config: { command: 'npm run lint' },
              position: { x: 400, y: 200 },
              inputs: ['install'],
              outputs: ['build']
            },
            {
              id: 'test',
              type: 'test',
              name: '单元测试',
              config: { command: 'npm run test' },
              position: { x: 600, y: 200 },
              inputs: ['install'],
              outputs: ['build']
            },
            {
              id: 'build',
              type: 'build',
              name: '构建应用',
              config: { command: 'npm run build' },
              position: { x: 500, y: 300 },
              inputs: ['lint', 'test'],
              outputs: ['deploy']
            },
            {
              id: 'deploy',
              type: 'deploy',
              name: '部署应用',
              config: { target: 'production' },
              position: { x: 500, y: 400 },
              inputs: ['build'],
              outputs: ['notify']
            },
            {
              id: 'notify',
              type: 'notify',
              name: '发送通知',
              config: { type: 'slack', message: '部署完成' },
              position: { x: 500, y: 500 },
              inputs: ['deploy'],
              outputs: ['end']
            },
            {
              id: 'end',
              type: 'end',
              name: '结束',
              config: {},
              position: { x: 500, y: 600 },
              inputs: ['notify'],
              outputs: []
            }
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'checkout' },
            { id: 'e2', source: 'checkout', target: 'install' },
            { id: 'e3', source: 'install', target: 'lint' },
            { id: 'e4', source: 'install', target: 'test' },
            { id: 'e5', source: 'lint', target: 'build' },
            { id: 'e6', source: 'test', target: 'build' },
            { id: 'e7', source: 'build', target: 'deploy' },
            { id: 'e8', source: 'deploy', target: 'notify' },
            { id: 'e9', source: 'notify', target: 'end' }
          ],
          variables: {
            NODE_ENV: 'production',
            BUILD_TARGET: 'dist'
          },
          triggers: [
            {
              id: 'git-push',
              type: 'git-push',
              config: { branch: 'main' },
              enabled: true
            }
          ],
          notifications: [
            {
              id: 'slack-notify',
              type: 'slack',
              target: '#deployments',
              events: ['success', 'failure'],
              enabled: true
            }
          ],
          isActive: true
        },
        preview: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCI+PC9zdmc+',
        tags: ['frontend', 'ci-cd', 'react', 'vue'],
        isBuiltIn: true,
        usageCount: 0
      },
      {
        id: 'simple-build',
        name: '简单构建流水线',
        description: '基础的构建流水线，适合简单项目',
        category: 'basic',
        pipeline: {
          name: '简单构建流水线',
          version: '1.0.0',
          nodes: [
            {
              id: 'start',
              type: 'start',
              name: '开始',
              config: {},
              position: { x: 100, y: 100 },
              inputs: [],
              outputs: ['build']
            },
            {
              id: 'build',
              type: 'build',
              name: '构建',
              config: { command: 'npm run build' },
              position: { x: 300, y: 100 },
              inputs: ['start'],
              outputs: ['end']
            },
            {
              id: 'end',
              type: 'end',
              name: '结束',
              config: {},
              position: { x: 500, y: 100 },
              inputs: ['build'],
              outputs: []
            }
          ],
          edges: [
            { id: 'e1', source: 'start', target: 'build' },
            { id: 'e2', source: 'build', target: 'end' }
          ],
          variables: {},
          triggers: [
            {
              id: 'manual',
              type: 'manual',
              config: {},
              enabled: true
            }
          ],
          notifications: [],
          isActive: true
        },
        preview: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjIwMCI+PC9zdmc+',
        tags: ['basic', 'simple'],
        isBuiltIn: true,
        usageCount: 0
      }
    ]
  }

  /**
   * 创建流水线
   */
  async createPipeline(pipeline: Omit<BuildPipeline, 'id' | 'metadata'>): Promise<string> {
    const id = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now()

    try {
      const stmt = this.db.prepare(`
        INSERT INTO build_pipelines (
          id, name, description, version, nodes, edges, variables,
          triggers, schedule_config, notifications, created_by,
          created_at, updated_at, tags, category, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        pipeline.name,
        pipeline.description,
        pipeline.version,
        JSON.stringify(pipeline.nodes),
        JSON.stringify(pipeline.edges),
        JSON.stringify(pipeline.variables),
        JSON.stringify(pipeline.triggers),
        JSON.stringify(pipeline.schedule),
        JSON.stringify(pipeline.notifications),
        'system', // 临时使用system作为创建者
        now,
        now,
        JSON.stringify([]),
        'custom',
        pipeline.isActive ? 1 : 0
      )

      logger.info('Pipeline created', { id, name: pipeline.name })
      return id
    } catch (error) {
      logger.error('Failed to create pipeline', { error })
      throw error
    }
  }

  /**
   * 获取流水线列表
   */
  async getPipelines(filters?: {
    category?: string
    createdBy?: string
    isActive?: boolean
  }): Promise<BuildPipeline[]> {
    try {
      let query = 'SELECT * FROM build_pipelines WHERE 1=1'
      const params: any[] = []

      if (filters?.category) {
        query += ' AND category = ?'
        params.push(filters.category)
      }

      if (filters?.createdBy) {
        query += ' AND created_by = ?'
        params.push(filters.createdBy)
      }

      if (filters?.isActive !== undefined) {
        query += ' AND is_active = ?'
        params.push(filters.isActive ? 1 : 0)
      }

      query += ' ORDER BY created_at DESC'

      const stmt = this.db.prepare(query)
      const rows = stmt.all(...params) as any[]

      return rows.map(row => this.mapRowToPipeline(row))
    } catch (error) {
      logger.error('Failed to get pipelines', { error })
      throw error
    }
  }

  /**
   * 根据ID获取流水线
   */
  async getPipelineById(id: string): Promise<BuildPipeline | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM build_pipelines WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      return this.mapRowToPipeline(row)
    } catch (error) {
      logger.error('Failed to get pipeline by id', { id, error })
      return null
    }
  }

  /**
   * 执行流水线
   */
  async executePipeline(pipelineId: string, triggeredBy: string, triggerType: string, variables?: Record<string, any>): Promise<string> {
    try {
      const pipeline = await this.getPipelineById(pipelineId)
      if (!pipeline) {
        throw new Error('Pipeline not found')
      }

      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const execution: PipelineExecution = {
        id: executionId,
        pipelineId,
        version: pipeline.version,
        status: 'queued',
        startTime: Date.now(),
        triggeredBy,
        triggerType,
        nodeExecutions: pipeline.nodes.map(node => ({
          nodeId: node.id,
          status: 'pending',
          logs: []
        })),
        variables: { ...pipeline.variables, ...variables },
        logs: [],
        artifacts: [],
        createdAt: Date.now()
      }

      // 保存执行记录
      await this.savePipelineExecution(execution)
      this.activePipelines.set(executionId, execution)

      // 开始执行
      this.startPipelineExecution(execution, pipeline)

      logger.info('Pipeline execution started', { executionId, pipelineId })
      return executionId
    } catch (error) {
      logger.error('Failed to execute pipeline', { pipelineId, error })
      throw error
    }
  }

  /**
   * 开始流水线执行
   */
  private async startPipelineExecution(execution: PipelineExecution, pipeline: BuildPipeline): Promise<void> {
    execution.status = 'running'
    this.addExecutionLog(execution, 'info', `Pipeline execution started: ${pipeline.name}`)

    try {
      // 执行流水线节点（简化实现）
      for (const node of pipeline.nodes) {
        if (node.type === 'start' || node.type === 'end') continue

        const nodeExecution = execution.nodeExecutions.find(ne => ne.nodeId === node.id)
        if (!nodeExecution) continue

        nodeExecution.status = 'running'
        nodeExecution.startTime = Date.now()

        this.addExecutionLog(execution, 'info', `Executing node: ${node.name}`)

        // 模拟节点执行
        await new Promise(resolve => setTimeout(resolve, 2000))

        nodeExecution.status = 'success'
        nodeExecution.endTime = Date.now()
        nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime

        this.addExecutionLog(execution, 'info', `Node completed: ${node.name}`)
      }

      execution.status = 'success'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addExecutionLog(execution, 'info', 'Pipeline execution completed successfully')

    } catch (error) {
      execution.status = 'failed'
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      this.addExecutionLog(execution, 'error', `Pipeline execution failed: ${error.message}`)
    } finally {
      // 保存最终状态
      await this.savePipelineExecution(execution)
      this.activePipelines.delete(execution.id)

      // 发送事件
      this.emit('pipeline_execution_complete', execution)
    }
  }

  /**
   * 添加执行日志
   */
  private addExecutionLog(execution: PipelineExecution, level: 'info' | 'warn' | 'error' | 'debug', message: string, nodeId?: string): void {
    const log: ExecutionLog = {
      timestamp: Date.now(),
      level,
      message,
      nodeId,
      source: 'pipeline'
    }

    execution.logs.push(log)
  }

  /**
   * 保存流水线执行记录
   */
  private async savePipelineExecution(execution: PipelineExecution): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO pipeline_executions (
          id, pipeline_id, version, status, start_time, end_time, duration,
          triggered_by, trigger_type, node_executions, variables, logs,
          artifacts, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        execution.id,
        execution.pipelineId,
        execution.version,
        execution.status,
        execution.startTime,
        execution.endTime,
        execution.duration,
        execution.triggeredBy,
        execution.triggerType,
        JSON.stringify(execution.nodeExecutions),
        JSON.stringify(execution.variables),
        JSON.stringify(execution.logs),
        JSON.stringify(execution.artifacts),
        execution.createdAt
      )
    } catch (error) {
      logger.error('Failed to save pipeline execution', { executionId: execution.id, error })
    }
  }

  /**
   * 创建模板
   */
  async createTemplate(template: PipelineTemplate): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO pipeline_templates (
          id, name, description, category, framework, pipeline_config,
          preview, tags, is_built_in, usage_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = Date.now()
      stmt.run(
        template.id,
        template.name,
        template.description,
        template.category,
        template.framework,
        JSON.stringify(template.pipeline),
        template.preview,
        JSON.stringify(template.tags),
        template.isBuiltIn ? 1 : 0,
        template.usageCount,
        now,
        now
      )
    } catch (error) {
      logger.error('Failed to create template', { error })
      throw error
    }
  }

  /**
   * 获取模板
   */
  async getTemplateById(id: string): Promise<PipelineTemplate | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM pipeline_templates WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        framework: row.framework,
        pipeline: JSON.parse(row.pipeline_config),
        preview: row.preview,
        tags: JSON.parse(row.tags),
        isBuiltIn: row.is_built_in === 1,
        usageCount: row.usage_count
      }
    } catch (error) {
      logger.error('Failed to get template by id', { id, error })
      return null
    }
  }

  /**
   * 映射数据库行到流水线对象
   */
  private mapRowToPipeline(row: any): BuildPipeline {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      nodes: JSON.parse(row.nodes),
      edges: JSON.parse(row.edges),
      variables: JSON.parse(row.variables),
      triggers: JSON.parse(row.triggers),
      schedule: JSON.parse(row.schedule_config || 'null'),
      notifications: JSON.parse(row.notifications),
      metadata: {
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tags: JSON.parse(row.tags),
        category: row.category
      },
      isActive: row.is_active === 1
    }
  }
}
