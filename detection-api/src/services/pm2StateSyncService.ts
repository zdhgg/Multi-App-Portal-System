/**
 * PM2状态同步服务
 * 定期检查PM2进程状态并同步到数据库
 */

import { logger } from '../utils/logger'
import { PM2Service } from './pm2Service'
import { ApplicationService } from '../core/ApplicationService'
import type { NetworkService } from '../core/NetworkService'
import type { Application } from '../core/types'

export class PM2StateSyncService {
  private syncInterval: NodeJS.Timeout | null = null
  private syncIntervalMs = 30000 // 30秒同步一次
  private isRunning = false

  constructor(
    private pm2Service: PM2Service,
    private applicationService: ApplicationService,
    private networkService: NetworkService
  ) {}

  /**
   * 启动定时同步
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('PM2状态同步服务已在运行中')
      return
    }

    logger.info('启动PM2状态同步服务', { intervalMs: this.syncIntervalMs })
    this.isRunning = true

    // 立即执行一次同步
    this.syncStates().catch(err => {
      logger.error('首次状态同步失败', err)
    })

    // 定时同步
    this.syncInterval = setInterval(() => {
      this.syncStates().catch(err => {
        logger.error('定时状态同步失败', err)
      })
    }, this.syncIntervalMs)
  }

  /**
   * 停止定时同步
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.isRunning = false
    logger.info('PM2状态同步服务已停止')
  }

  /**
   * 手动触发同步
   */
  async syncNow(): Promise<{ synced: number; updated: number; errors: number }> {
    return this.syncStates()
  }

  /**
   * 执行状态同步
   */
  private async syncStates(): Promise<{ synced: number; updated: number; errors: number }> {
    try {
      logger.debug('开始PM2状态同步')

      // 获取所有PM2进程
      const pm2Processes = await this.pm2Service.getProcessList()
      
      // 获取所有应用
      const allApps = await this.applicationService.findAll()
      
      let syncedCount = 0
      let updatedCount = 0
      let errorCount = 0

      // 创建PM2进程映射表
      const pm2ProcessMap = new Map<string, any>()
      pm2Processes.forEach(proc => {
        // 使用多种方式匹配应用名称
        const normalizedName = proc.name.toLowerCase().replace(/[-_]/g, '')
        pm2ProcessMap.set(proc.name, proc)
        pm2ProcessMap.set(proc.name.toLowerCase(), proc)
        pm2ProcessMap.set(normalizedName, proc)
      })

      // 遍历所有应用，同步状态
      for (const app of allApps) {
        try {
          syncedCount++

          // ⚡ 增强的PM2进程匹配逻辑（支持更多变体）
          const normalizedAppName = app.name.toLowerCase().replace(/[-_\s]/g, '')
          const slugName = app.name.toLowerCase().replace(/\s+/g, '-')
          const dotlessName = app.name.toLowerCase().replace(/\./g, '')
          
          let pm2Process =
            (app.pm2ProcessName && (
              pm2ProcessMap.get(app.pm2ProcessName) ||
              pm2ProcessMap.get(app.pm2ProcessName.toLowerCase())
            )) ||
            pm2ProcessMap.get(app.name) ||                        // 精确匹配
            pm2ProcessMap.get(app.name.toLowerCase()) ||          // 小写匹配
            pm2ProcessMap.get(slugName) ||                        // slug格式
            pm2ProcessMap.get(normalizedAppName) ||               // 无分隔符
            pm2ProcessMap.get(dotlessName) ||                     // 无点号
            pm2ProcessMap.get(app.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()) // 所有特殊字符替换为-

          // 判断应用实际状态
          const isRunningInPM2 = pm2Process && pm2Process.status === 'online'
          const inferredRuntime = await this.detectManualRuntime(app)
          const currentStateInDB = app.state

          // 🎯 优化的部署模式判断逻辑
          let targetState: 'running' | 'stopped' = 'stopped'
          let targetDeploymentMode: 'production' | 'development' | 'unknown' = 'unknown'
          
          if (isRunningInPM2) {
            // 在PM2中运行 → 生产模式
            targetState = 'running'
            targetDeploymentMode = 'production'
          } else if (inferredRuntime.isRunning) {
            // 端口已监听但不在PM2中 → 手动启动运行态
            targetState = 'running'
            targetDeploymentMode = inferredRuntime.deploymentMode
            logger.debug('检测到手动启动运行态，按端口监听结果同步状态', {
              appId: app.id,
              appName: app.name,
              deploymentMode: inferredRuntime.deploymentMode,
              activePorts: inferredRuntime.activePorts,
              inactivePorts: inferredRuntime.inactivePorts
            })
          } else if (app.state === 'running') {
            // 应用在运行但不在PM2中 → 开发模式
            targetState = 'running'
            targetDeploymentMode = 'development'
          } else {
            // 应用停止 → 未知模式
            targetState = 'stopped'
            targetDeploymentMode = 'unknown'
          }
          
          // ⚠️ 特殊处理：如果数据库已经是production模式，但PM2中找不到进程
          // 可能是进程名称不匹配，保留production模式，避免错误降级
          if (app.deploymentMode === 'production' &&
              app.state === 'running' &&
              !isRunningInPM2 &&
              !!app.pm2ProcessName) {
            // 记录警告但不修改
            logger.warn('应用标记为production但PM2中未找到，保留现有模式', {
              appName: app.name,
              appId: app.id,
              pm2ProcessName: app.pm2ProcessName,
              normalizedNames: {
                original: app.name,
                normalized: normalizedAppName,
                slug: slugName,
                dotless: dotlessName
              },
              pm2ProcessCount: pm2Processes.length
            })
            // 保持原有的deployment mode，不降级
            targetDeploymentMode = 'production'
          }

          // 检查是否需要更新
          const stateChanged = currentStateInDB !== targetState
          const deploymentModeChanged = app.deploymentMode !== targetDeploymentMode
          
          if (stateChanged || deploymentModeChanged) {
            logger.debug('检测到状态或部署模式不一致，执行同步', {
              appId: app.id,
              appName: app.name,
              dbState: currentStateInDB,
              targetState,
              dbDeploymentMode: app.deploymentMode,
              targetDeploymentMode,
              pm2Running: isRunningInPM2
            })

            if (stateChanged) {
              await (this.applicationService as any).repository.updateState(app.id, targetState)
            }
            
            if (deploymentModeChanged && (this.applicationService as any).repository.updateDeploymentMode) {
              await (this.applicationService as any).repository.updateDeploymentMode(app.id, targetDeploymentMode)
            }
            
            updatedCount++

            logger.debug('状态和部署模式同步成功', {
              appId: app.id,
              appName: app.name,
              oldState: currentStateInDB,
              newState: targetState,
              oldDeploymentMode: app.deploymentMode,
              newDeploymentMode: targetDeploymentMode
            })
          }

        } catch (err) {
          errorCount++
          logger.error('同步单个应用状态失败', {
            appId: app.id,
            appName: app.name,
            error: err
          })
        }
      }

      const result = {
        synced: syncedCount,
        updated: updatedCount,
        errors: errorCount
      }

      logger.debug('PM2状态同步完成', result)

      return result

    } catch (error) {
      logger.error('PM2状态同步失败', error)
      throw error
    }
  }

  /**
   * 设置同步间隔
   */
  setSyncInterval(intervalMs: number): void {
    if (intervalMs < 5000) {
      logger.warn('同步间隔不能小于5秒，已设置为5秒')
      intervalMs = 5000
    }

    this.syncIntervalMs = intervalMs
    logger.info('PM2同步间隔已更新', { intervalMs })

    // 如果正在运行，重启定时器
    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }

  /**
   * 同步指定应用的状态
   */
  async syncAppState(appId: string): Promise<boolean> {
    try {
      const app = await this.applicationService.findById(appId)
      if (!app) {
        logger.error('应用不存在', { appId })
        return false
      }

      const pm2Processes = await this.pm2Service.getProcessList()
      const normalizedAppName = app.name.toLowerCase().replace(/[-_\s]/g, '')
      
      const pm2Process = pm2Processes.find(p => 
        p.name === app.name ||
        p.name.toLowerCase() === app.name.toLowerCase() ||
        p.name.toLowerCase().replace(/[-_]/g, '') === normalizedAppName
      )

      const isRunningInPM2 = pm2Process && pm2Process.status === 'online'
      const inferredRuntime = await this.detectManualRuntime(app)
      const targetState = isRunningInPM2 || inferredRuntime.isRunning ? 'running' : 'stopped'
      const targetDeploymentMode: 'production' | 'development' | 'unknown' = isRunningInPM2
        ? 'production'
        : inferredRuntime.isRunning
          ? inferredRuntime.deploymentMode
          : 'unknown'
      const deploymentModeChanged = app.deploymentMode !== targetDeploymentMode

      if (app.state !== targetState || deploymentModeChanged) {
        await (this.applicationService as any).repository.updateState(appId, targetState)
        if (deploymentModeChanged && (this.applicationService as any).repository.updateDeploymentMode) {
          await (this.applicationService as any).repository.updateDeploymentMode(appId, targetDeploymentMode)
        }
        logger.debug('单个应用状态已同步', {
          appId,
          appName: app.name,
          oldState: app.state,
          newState: targetState,
          oldDeploymentMode: app.deploymentMode,
          newDeploymentMode: targetDeploymentMode
        })
        return true
      }

      return false

    } catch (error) {
      logger.error('同步应用状态失败', { appId, error })
      return false
    }
  }

  private getConfiguredPorts(app: Application): number[] {
    const ports = new Set<number>()

    if (typeof app.network?.primaryPort === 'number' && app.network.primaryPort > 0) {
      ports.add(app.network.primaryPort)
    }

    if (Array.isArray(app.network?.secondaryPorts)) {
      for (const port of app.network.secondaryPorts) {
        if (typeof port === 'number' && port > 0) {
          ports.add(port)
        }
      }
    }

    return Array.from(ports)
  }

  private async detectManualRuntime(app: Application): Promise<{
    isRunning: boolean
    deploymentMode: 'production' | 'development' | 'unknown'
    activePorts: number[]
    inactivePorts: number[]
  }> {
    const configuredPorts = this.getConfiguredPorts(app)
    if (configuredPorts.length === 0) {
      return {
        isRunning: false,
        deploymentMode: 'unknown',
        activePorts: [],
        inactivePorts: []
      }
    }

    try {
      const conflicts = await this.networkService.checkConflicts(configuredPorts)
      const activePortSet = new Set(
        conflicts
          .map(conflict => conflict.port)
          .filter(port => Number.isInteger(port) && port > 0)
      )

      const activePorts = configuredPorts.filter(port => activePortSet.has(port))
      const inactivePorts = configuredPorts.filter(port => !activePortSet.has(port))
      const primaryPort = app.network?.primaryPort
      const secondaryPorts = Array.isArray(app.network?.secondaryPorts)
        ? app.network.secondaryPorts.filter(port => typeof port === 'number' && port > 0)
        : []
      const primaryActive = typeof primaryPort === 'number' && activePortSet.has(primaryPort)
      const activeSecondaryPorts = secondaryPorts.filter(port => activePortSet.has(port))

      if (primaryActive) {
        return {
          isRunning: true,
          deploymentMode: 'development',
          activePorts,
          inactivePorts
        }
      }

      if (activeSecondaryPorts.length > 0) {
        return {
          isRunning: true,
          deploymentMode: 'production',
          activePorts,
          inactivePorts
        }
      }

      return {
        isRunning: false,
        deploymentMode: 'unknown',
        activePorts,
        inactivePorts
      }
    } catch (error) {
      logger.warn('检测手动启动运行态失败，回退到现有状态判断', {
        appId: app.id,
        appName: app.name,
        ports: configuredPorts,
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        isRunning: false,
        deploymentMode: 'unknown',
        activePorts: [],
        inactivePorts: configuredPorts
      }
    }
  }
}

