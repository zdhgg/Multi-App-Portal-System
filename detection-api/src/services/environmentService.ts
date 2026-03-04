/**
 * Environment Service - 多环境部署管理服务
 * 
 * 提供开发/测试/生产环境的统一管理、配置差异化管理、
 * 自动化环境切换和部署、环境状态监控等功能
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface Environment {
  id: string
  name: string
  type: 'development' | 'testing' | 'staging' | 'production' | 'custom'
  description?: string
  config: EnvironmentConfig
  status: 'active' | 'inactive' | 'maintenance' | 'error'
  healthCheck: HealthCheckConfig
  deployment: DeploymentConfig
  monitoring: MonitoringConfig
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
    tags: string[]
    priority: number
  }
  isDefault: boolean
}

export interface EnvironmentConfig {
  variables: Record<string, string>
  secrets: Record<string, string>
  resources: {
    cpu: string
    memory: string
    storage: string
    replicas: number
  }
  networking: {
    domain?: string
    port: number
    ssl: boolean
    loadBalancer?: string
  }
  database: {
    host?: string
    port?: number
    name?: string
    ssl?: boolean
  }
  cache: {
    enabled: boolean
    type?: 'redis' | 'memcached'
    host?: string
    port?: number
  }
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error'
    retention: number
    format: 'json' | 'text'
  }
}

export interface HealthCheckConfig {
  enabled: boolean
  endpoint: string
  interval: number
  timeout: number
  retries: number
  expectedStatus: number
  expectedContent?: string
}

export interface DeploymentConfig {
  strategy: 'rolling' | 'blue-green' | 'canary' | 'recreate'
  rollback: {
    enabled: boolean
    autoRollback: boolean
    threshold: number
  }
  hooks: {
    preDeploy?: string[]
    postDeploy?: string[]
    preRollback?: string[]
    postRollback?: string[]
  }
  notifications: {
    onSuccess: string[]
    onFailure: string[]
  }
}

export interface MonitoringConfig {
  metrics: {
    enabled: boolean
    endpoint?: string
    interval: number
  }
  alerts: {
    enabled: boolean
    rules: AlertRule[]
  }
  logs: {
    enabled: boolean
    aggregation?: string
  }
}

export interface AlertRule {
  id: string
  name: string
  metric: string
  condition: 'gt' | 'lt' | 'eq' | 'ne'
  threshold: number
  duration: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  actions: string[]
}

export interface EnvironmentDeployment {
  id: string
  environmentId: string
  appId: string
  version: string
  status: 'pending' | 'deploying' | 'deployed' | 'failed' | 'rolling-back' | 'rolled-back'
  strategy: string
  startTime: number
  endTime?: number
  duration?: number
  deployedBy: string
  buildId?: string
  artifacts: string[]
  logs: DeploymentLog[]
  rollbackInfo?: {
    previousVersion: string
    reason: string
    triggeredBy: string
    triggeredAt: number
  }
  createdAt: number
}

export interface DeploymentLog {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: string
  phase: 'pre-deploy' | 'deploy' | 'post-deploy' | 'rollback'
}

export interface EnvironmentHealth {
  environmentId: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  lastCheck: number
  checks: HealthCheck[]
  metrics: EnvironmentMetrics
  alerts: ActiveAlert[]
}

export interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  duration: number
  timestamp: number
}

export interface EnvironmentMetrics {
  cpu: {
    usage: number
    limit: number
  }
  memory: {
    usage: number
    limit: number
  }
  network: {
    inbound: number
    outbound: number
  }
  requests: {
    total: number
    errors: number
    latency: number
  }
  uptime: number
}

export interface ActiveAlert {
  id: string
  rule: string
  severity: string
  message: string
  startTime: number
  acknowledged: boolean
}

export class EnvironmentService extends EventEmitter {
  private healthCheckIntervals = new Map<string, NodeJS.Timeout>()
  private environmentHealth = new Map<string, EnvironmentHealth>()

  constructor(private db: Database) {
    super()
    this.initializeEnvironmentService()
  }

  /**
   * 初始化环境服务
   */
  private async initializeEnvironmentService(): Promise<void> {
    try {
      // 创建环境表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environments (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          description TEXT,
          config TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'inactive',
          health_check TEXT NOT NULL,
          deployment TEXT NOT NULL,
          monitoring TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          priority INTEGER NOT NULL DEFAULT 0,
          is_default INTEGER NOT NULL DEFAULT 0
        )
      `)

      // 创建环境部署表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_deployments (
          id TEXT PRIMARY KEY,
          environment_id TEXT NOT NULL,
          app_id TEXT NOT NULL,
          version TEXT NOT NULL,
          status TEXT NOT NULL,
          strategy TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          deployed_by TEXT NOT NULL,
          build_id TEXT,
          artifacts TEXT NOT NULL DEFAULT '[]',
          logs TEXT NOT NULL DEFAULT '[]',
          rollback_info TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (environment_id) REFERENCES environments (id),
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建环境健康检查表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS environment_health (
          environment_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          last_check INTEGER NOT NULL,
          checks TEXT NOT NULL,
          metrics TEXT NOT NULL,
          alerts TEXT NOT NULL DEFAULT '[]',
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (environment_id) REFERENCES environments (id)
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_environments_type ON environments (type);
        CREATE INDEX IF NOT EXISTS idx_environments_status ON environments (status);
        CREATE INDEX IF NOT EXISTS idx_environments_priority ON environments (priority);
        CREATE INDEX IF NOT EXISTS idx_environment_deployments_env_id ON environment_deployments (environment_id);
        CREATE INDEX IF NOT EXISTS idx_environment_deployments_app_id ON environment_deployments (app_id);
        CREATE INDEX IF NOT EXISTS idx_environment_deployments_status ON environment_deployments (status);
        CREATE INDEX IF NOT EXISTS idx_environment_deployments_start_time ON environment_deployments (start_time);
      `)

      // 初始化默认环境
      await this.initializeDefaultEnvironments()

      // 启动健康检查
      await this.startHealthChecks()

      logger.debug('Environment service initialized')
    } catch (error) {
      logger.error('Failed to initialize environment service', { error })
      throw error
    }
  }

  /**
   * 初始化默认环境
   */
  private async initializeDefaultEnvironments(): Promise<void> {
    const defaultEnvironments = [
      {
        name: 'development',
        type: 'development' as const,
        description: '开发环境',
        config: {
          variables: {
            NODE_ENV: 'development',
            DEBUG: 'true',
            LOG_LEVEL: 'debug'
          },
          secrets: {},
          resources: {
            cpu: '500m',
            memory: '512Mi',
            storage: '1Gi',
            replicas: 1
          },
          networking: {
            port: 3000,
            ssl: false
          },
          database: {
            host: 'localhost',
            port: 5432,
            name: 'app_dev'
          },
          cache: {
            enabled: false
          },
          logging: {
            level: 'debug' as const,
            retention: 7,
            format: 'text' as const
          }
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
          interval: 30000,
          timeout: 5000,
          retries: 3,
          expectedStatus: 200
        },
        deployment: {
          strategy: 'recreate' as const,
          rollback: {
            enabled: true,
            autoRollback: false,
            threshold: 50
          },
          hooks: {
            preDeploy: ['npm install'],
            postDeploy: ['npm run migrate']
          },
          notifications: {
            onSuccess: [],
            onFailure: []
          }
        },
        monitoring: {
          metrics: {
            enabled: true,
            interval: 60000
          },
          alerts: {
            enabled: false,
            rules: []
          },
          logs: {
            enabled: true
          }
        },
        priority: 1
      },
      {
        name: 'testing',
        type: 'testing' as const,
        description: '测试环境',
        config: {
          variables: {
            NODE_ENV: 'test',
            DEBUG: 'false',
            LOG_LEVEL: 'info'
          },
          secrets: {},
          resources: {
            cpu: '1000m',
            memory: '1Gi',
            storage: '2Gi',
            replicas: 1
          },
          networking: {
            port: 3001,
            ssl: false
          },
          database: {
            host: 'localhost',
            port: 5432,
            name: 'app_test'
          },
          cache: {
            enabled: true,
            type: 'redis' as const,
            host: 'localhost',
            port: 6379
          },
          logging: {
            level: 'info' as const,
            retention: 14,
            format: 'json' as const
          }
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
          interval: 60000,
          timeout: 10000,
          retries: 3,
          expectedStatus: 200
        },
        deployment: {
          strategy: 'rolling' as const,
          rollback: {
            enabled: true,
            autoRollback: true,
            threshold: 80
          },
          hooks: {
            preDeploy: ['npm install', 'npm run test'],
            postDeploy: ['npm run migrate', 'npm run seed']
          },
          notifications: {
            onSuccess: ['slack://testing'],
            onFailure: ['slack://testing', 'email://team@company.com']
          }
        },
        monitoring: {
          metrics: {
            enabled: true,
            interval: 30000
          },
          alerts: {
            enabled: true,
            rules: [
              {
                id: 'high-error-rate',
                name: '错误率过高',
                metric: 'error_rate',
                condition: 'gt',
                threshold: 5,
                duration: 300,
                severity: 'high',
                actions: ['slack://testing']
              }
            ]
          },
          logs: {
            enabled: true,
            aggregation: 'elasticsearch'
          }
        },
        priority: 2
      },
      {
        name: 'production',
        type: 'production' as const,
        description: '生产环境',
        config: {
          variables: {
            NODE_ENV: 'production',
            DEBUG: 'false',
            LOG_LEVEL: 'warn'
          },
          secrets: {},
          resources: {
            cpu: '2000m',
            memory: '4Gi',
            storage: '10Gi',
            replicas: 3
          },
          networking: {
            domain: 'app.company.com',
            port: 443,
            ssl: true,
            loadBalancer: 'nginx'
          },
          database: {
            host: 'prod-db.company.com',
            port: 5432,
            name: 'app_prod',
            ssl: true
          },
          cache: {
            enabled: true,
            type: 'redis' as const,
            host: 'prod-redis.company.com',
            port: 6379
          },
          logging: {
            level: 'warn' as const,
            retention: 90,
            format: 'json' as const
          }
        },
        healthCheck: {
          enabled: true,
          endpoint: '/health',
          interval: 30000,
          timeout: 5000,
          retries: 5,
          expectedStatus: 200
        },
        deployment: {
          strategy: 'blue-green' as const,
          rollback: {
            enabled: true,
            autoRollback: true,
            threshold: 95
          },
          hooks: {
            preDeploy: ['npm install', 'npm run build', 'npm run test:prod'],
            postDeploy: ['npm run migrate', 'npm run cache:warm']
          },
          notifications: {
            onSuccess: ['slack://production', 'email://ops@company.com'],
            onFailure: ['slack://production', 'email://ops@company.com', 'pagerduty://prod-alerts']
          }
        },
        monitoring: {
          metrics: {
            enabled: true,
            endpoint: '/metrics',
            interval: 15000
          },
          alerts: {
            enabled: true,
            rules: [
              {
                id: 'high-cpu',
                name: 'CPU使用率过高',
                metric: 'cpu_usage',
                condition: 'gt',
                threshold: 80,
                duration: 300,
                severity: 'critical',
                actions: ['pagerduty://prod-alerts', 'slack://production']
              },
              {
                id: 'high-memory',
                name: '内存使用率过高',
                metric: 'memory_usage',
                condition: 'gt',
                threshold: 85,
                duration: 180,
                severity: 'high',
                actions: ['slack://production']
              },
              {
                id: 'error-rate',
                name: '错误率异常',
                metric: 'error_rate',
                condition: 'gt',
                threshold: 1,
                duration: 120,
                severity: 'critical',
                actions: ['pagerduty://prod-alerts']
              }
            ]
          },
          logs: {
            enabled: true,
            aggregation: 'elasticsearch'
          }
        },
        priority: 3,
        isDefault: true
      }
    ]

    for (const envData of defaultEnvironments) {
      try {
        const existing = await this.getEnvironmentByName(envData.name)
        if (!existing) {
          await this.createEnvironment({
            ...envData,
            status: 'active',
            metadata: {
              createdBy: 'system',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              tags: [envData.type],
              priority: envData.priority
            },
            isDefault: envData.isDefault || false
          } as any)
          logger.info('Default environment created', { name: envData.name, type: envData.type })
        }
      } catch (error) {
        logger.warn('Failed to create default environment', { name: envData.name, error })
      }
    }
  }

  /**
   * 创建环境
   */
  async createEnvironment(environment: Omit<Environment, 'id'>): Promise<string> {
    const id = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const stmt = this.db.prepare(`
        INSERT INTO environments (
          id, name, type, description, config, status, health_check,
          deployment, monitoring, created_by, created_at, updated_at,
          tags, priority, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        environment.name,
        environment.type,
        environment.description,
        JSON.stringify(environment.config),
        environment.status,
        JSON.stringify(environment.healthCheck),
        JSON.stringify(environment.deployment),
        JSON.stringify(environment.monitoring),
        environment.metadata.createdBy,
        environment.metadata.createdAt,
        environment.metadata.updatedAt,
        JSON.stringify(environment.metadata.tags),
        environment.metadata.priority,
        environment.isDefault ? 1 : 0
      )

      // 启动健康检查
      if (environment.healthCheck.enabled) {
        this.startEnvironmentHealthCheck(id, environment.healthCheck)
      }

      logger.info('Environment created', { id, name: environment.name, type: environment.type })
      return id
    } catch (error) {
      logger.error('Failed to create environment', { error })
      throw error
    }
  }

  /**
   * 获取环境列表
   */
  async getEnvironments(filters?: {
    type?: string
    status?: string
    tags?: string[]
  }): Promise<Environment[]> {
    try {
      let query = 'SELECT * FROM environments WHERE 1=1'
      const params: any[] = []

      if (filters?.type) {
        query += ' AND type = ?'
        params.push(filters.type)
      }

      if (filters?.status) {
        query += ' AND status = ?'
        params.push(filters.status)
      }

      query += ' ORDER BY priority DESC, created_at ASC'

      const stmt = this.db.prepare(query)
      const rows = stmt.all(...params) as any[]

      const environments = rows.map(row => this.mapRowToEnvironment(row))

      // 如果有标签过滤，进一步筛选
      if (filters?.tags && filters.tags.length > 0) {
        return environments.filter(env => 
          filters.tags!.some(tag => env.metadata.tags.includes(tag))
        )
      }

      return environments
    } catch (error) {
      logger.error('Failed to get environments', { error })
      throw error
    }
  }

  /**
   * 根据名称获取环境
   */
  async getEnvironmentByName(name: string): Promise<Environment | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM environments WHERE name = ?')
      const row = stmt.get(name) as any

      if (!row) return null

      return this.mapRowToEnvironment(row)
    } catch (error) {
      logger.error('Failed to get environment by name', { name, error })
      return null
    }
  }

  /**
   * 部署到环境
   */
  async deployToEnvironment(
    environmentId: string, 
    appId: string, 
    version: string, 
    deployedBy: string,
    buildId?: string
  ): Promise<string> {
    try {
      const environment = await this.getEnvironmentById(environmentId)
      if (!environment) {
        throw new Error('Environment not found')
      }

      const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const deployment: EnvironmentDeployment = {
        id: deploymentId,
        environmentId,
        appId,
        version,
        status: 'pending',
        strategy: environment.deployment.strategy,
        startTime: Date.now(),
        deployedBy,
        buildId,
        artifacts: [],
        logs: [],
        createdAt: Date.now()
      }

      // 保存部署记录
      await this.saveDeployment(deployment)

      // 开始部署
      this.startDeployment(deployment, environment)

      logger.info('Deployment started', { deploymentId, environmentId, appId, version })
      return deploymentId
    } catch (error) {
      logger.error('Failed to deploy to environment', { environmentId, appId, error })
      throw error
    }
  }

  /**
   * 开始部署
   */
  private async startDeployment(deployment: EnvironmentDeployment, environment: Environment): Promise<void> {
    deployment.status = 'deploying'
    this.addDeploymentLog(deployment, 'info', `Starting deployment to ${environment.name}`)

    try {
      // 执行预部署钩子
      if (environment.deployment.hooks.preDeploy) {
        for (const hook of environment.deployment.hooks.preDeploy) {
          this.addDeploymentLog(deployment, 'info', `Executing pre-deploy hook: ${hook}`)
          // 这里应该执行实际的钩子命令
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // 执行部署
      this.addDeploymentLog(deployment, 'info', `Deploying version ${deployment.version}`)
      await new Promise(resolve => setTimeout(resolve, 5000)) // 模拟部署过程

      // 执行后部署钩子
      if (environment.deployment.hooks.postDeploy) {
        for (const hook of environment.deployment.hooks.postDeploy) {
          this.addDeploymentLog(deployment, 'info', `Executing post-deploy hook: ${hook}`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      deployment.status = 'deployed'
      deployment.endTime = Date.now()
      deployment.duration = deployment.endTime - deployment.startTime

      this.addDeploymentLog(deployment, 'info', 'Deployment completed successfully')

      // 发送成功通知
      await this.sendDeploymentNotifications(environment, deployment, 'success')

    } catch (error) {
      deployment.status = 'failed'
      deployment.endTime = Date.now()
      deployment.duration = deployment.endTime - deployment.startTime

      this.addDeploymentLog(deployment, 'error', `Deployment failed: ${error.message}`)

      // 发送失败通知
      await this.sendDeploymentNotifications(environment, deployment, 'failure')
    } finally {
      // 保存最终状态
      await this.saveDeployment(deployment)

      // 发送事件
      this.emit('deployment_complete', deployment)
    }
  }

  /**
   * 启动健康检查
   */
  private async startHealthChecks(): Promise<void> {
    const environments = await this.getEnvironments({ status: 'active' })
    
    for (const env of environments) {
      if (env.healthCheck.enabled) {
        this.startEnvironmentHealthCheck(env.id, env.healthCheck)
      }
    }
  }

  /**
   * 启动环境健康检查
   */
  private startEnvironmentHealthCheck(environmentId: string, config: HealthCheckConfig): void {
    // 清除现有的检查
    const existing = this.healthCheckIntervals.get(environmentId)
    if (existing) {
      clearInterval(existing)
    }

    // 启动新的检查
    const interval = setInterval(async () => {
      await this.performHealthCheck(environmentId, config)
    }, config.interval)

    this.healthCheckIntervals.set(environmentId, interval)

    // 立即执行一次检查
    this.performHealthCheck(environmentId, config)
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(environmentId: string, config: HealthCheckConfig): Promise<void> {
    try {
      const checks: HealthCheck[] = []
      const startTime = Date.now()

      // 模拟健康检查
      const isHealthy = Math.random() > 0.1 // 90%的概率健康

      checks.push({
        name: 'HTTP Health Check',
        status: isHealthy ? 'pass' : 'fail',
        message: isHealthy ? 'Service is responding' : 'Service is not responding',
        duration: Date.now() - startTime,
        timestamp: Date.now()
      })

      // 模拟指标收集
      const metrics: EnvironmentMetrics = {
        cpu: {
          usage: Math.random() * 100,
          limit: 100
        },
        memory: {
          usage: Math.random() * 4096,
          limit: 4096
        },
        network: {
          inbound: Math.random() * 1000,
          outbound: Math.random() * 1000
        },
        requests: {
          total: Math.floor(Math.random() * 10000),
          errors: Math.floor(Math.random() * 100),
          latency: Math.random() * 1000
        },
        uptime: Date.now() - startTime
      }

      const health: EnvironmentHealth = {
        environmentId,
        status: isHealthy ? 'healthy' : 'unhealthy',
        lastCheck: Date.now(),
        checks,
        metrics,
        alerts: []
      }

      this.environmentHealth.set(environmentId, health)

      // 保存到数据库
      await this.saveEnvironmentHealth(health)

    } catch (error) {
      logger.error('Health check failed', { environmentId, error })
    }
  }

  /**
   * 保存环境健康状态
   */
  private async saveEnvironmentHealth(health: EnvironmentHealth): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO environment_health (
          environment_id, status, last_check, checks, metrics, alerts, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        health.environmentId,
        health.status,
        health.lastCheck,
        JSON.stringify(health.checks),
        JSON.stringify(health.metrics),
        JSON.stringify(health.alerts),
        Date.now()
      )
    } catch (error) {
      logger.error('Failed to save environment health', { environmentId: health.environmentId, error })
    }
  }

  /**
   * 获取环境健康状态
   */
  async getEnvironmentHealth(environmentId: string): Promise<EnvironmentHealth | null> {
    // 先从内存获取
    const cached = this.environmentHealth.get(environmentId)
    if (cached) return cached

    // 从数据库获取
    try {
      const stmt = this.db.prepare('SELECT * FROM environment_health WHERE environment_id = ?')
      const row = stmt.get(environmentId) as any

      if (!row) return null

      const health: EnvironmentHealth = {
        environmentId: row.environment_id,
        status: row.status,
        lastCheck: row.last_check,
        checks: JSON.parse(row.checks),
        metrics: JSON.parse(row.metrics),
        alerts: JSON.parse(row.alerts)
      }

      this.environmentHealth.set(environmentId, health)
      return health
    } catch (error) {
      logger.error('Failed to get environment health', { environmentId, error })
      return null
    }
  }

  /**
   * 根据ID获取环境
   */
  private async getEnvironmentById(id: string): Promise<Environment | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM environments WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      return this.mapRowToEnvironment(row)
    } catch (error) {
      logger.error('Failed to get environment by id', { id, error })
      return null
    }
  }

  /**
   * 添加部署日志
   */
  private addDeploymentLog(
    deployment: EnvironmentDeployment, 
    level: 'info' | 'warn' | 'error' | 'debug', 
    message: string,
    phase: 'pre-deploy' | 'deploy' | 'post-deploy' | 'rollback' = 'deploy'
  ): void {
    const log: DeploymentLog = {
      timestamp: Date.now(),
      level,
      message,
      source: 'deployment',
      phase
    }

    deployment.logs.push(log)
  }

  /**
   * 保存部署记录
   */
  private async saveDeployment(deployment: EnvironmentDeployment): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO environment_deployments (
          id, environment_id, app_id, version, status, strategy,
          start_time, end_time, duration, deployed_by, build_id,
          artifacts, logs, rollback_info, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        deployment.id,
        deployment.environmentId,
        deployment.appId,
        deployment.version,
        deployment.status,
        deployment.strategy,
        deployment.startTime,
        deployment.endTime,
        deployment.duration,
        deployment.deployedBy,
        deployment.buildId,
        JSON.stringify(deployment.artifacts),
        JSON.stringify(deployment.logs),
        JSON.stringify(deployment.rollbackInfo),
        deployment.createdAt
      )
    } catch (error) {
      logger.error('Failed to save deployment', { deploymentId: deployment.id, error })
    }
  }

  /**
   * 发送部署通知
   */
  private async sendDeploymentNotifications(
    environment: Environment, 
    deployment: EnvironmentDeployment, 
    type: 'success' | 'failure'
  ): Promise<void> {
    const notifications = type === 'success' 
      ? environment.deployment.notifications.onSuccess 
      : environment.deployment.notifications.onFailure

    for (const notification of notifications) {
      try {
        // 这里应该实现实际的通知发送
        logger.info('Deployment notification sent', { 
          type, 
          target: notification, 
          deployment: deployment.id 
        })
      } catch (error) {
        logger.error('Failed to send deployment notification', { notification, error })
      }
    }
  }

  /**
   * 映射数据库行到环境对象
   */
  private mapRowToEnvironment(row: any): Environment {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      config: JSON.parse(row.config),
      status: row.status,
      healthCheck: JSON.parse(row.health_check),
      deployment: JSON.parse(row.deployment),
      monitoring: JSON.parse(row.monitoring),
      metadata: {
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tags: JSON.parse(row.tags),
        priority: row.priority
      },
      isDefault: row.is_default === 1
    }
  }

  /**
   * 关闭服务
   */
  close(): void {
    // 停止所有健康检查
    for (const [environmentId, interval] of this.healthCheckIntervals.entries()) {
      clearInterval(interval)
      logger.debug('Health check stopped', { environmentId })
    }
    
    this.healthCheckIntervals.clear()
    this.environmentHealth.clear()
  }
}
