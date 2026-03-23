import { Router, Request, Response } from 'express'
import { promises as fs } from 'fs'
import { logger } from '../utils/logger'
import { PasswordUtils } from '../utils/passwordUtils'
import { ServiceContainer } from '../core/ServiceContainer'
import { getSystemConfigFilePath, writeSystemConfigFile } from '../utils/systemConfigPath.js'

interface SystemSettingsResponse {
  versionToken: string
  updatedAt: string
  settings: any
}

interface SystemStatistics {
  adminCount: number
  logTotal: number
  activeAlerts: number
  systemUptime: number
}

export class SystemSettingsController {
  private router = Router()
  private serviceContainer?: ServiceContainer

  constructor(serviceContainer?: ServiceContainer) {
    this.serviceContainer = serviceContainer
    this.setupRoutes()
  }

  private setupRoutes(): void {
    this.router.get('/', this.getSettings.bind(this))
    this.router.put('/', this.updateSettings.bind(this))
    this.router.get('/health', this.health.bind(this))
    this.router.get('/statistics', this.getStatistics.bind(this))
  }

  private getSettingsFilePath(): string {
    return getSystemConfigFilePath()
  }

  private async loadFromDisk(): Promise<SystemSettingsResponse> {
    const file = this.getSettingsFilePath()
    const stat = await fs.stat(file)
    const content = await fs.readFile(file, 'utf8')
    const settings = JSON.parse(content)
    const versionToken = `${stat.mtimeMs}:${stat.size}`
    return {
      versionToken,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      settings
    }
  }

  private async writeToDisk(newSettings: any): Promise<SystemSettingsResponse> {
    const json = JSON.stringify(newSettings, null, 2)
    await writeSystemConfigFile(json)
    return this.loadFromDisk()
  }

  private async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const data = await this.loadFromDisk()
      res.json({ success: true, data })
    } catch (error: any) {
      logger.error('Failed to read system settings', { error })
      res.status(500).json({ success: false, error: error?.message || 'Failed to read settings' })
    }
  }

  private async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const clientToken: string | undefined = req.body?.versionToken
      if (!clientToken) {
        res.status(400).json({ success: false, error: 'Missing versionToken' })
        return
      }

      const current = await this.loadFromDisk()
      if (current.versionToken !== clientToken) {
        res.status(409).json({
          success: false,
          error: 'VERSION_CONFLICT',
          message: 'Settings have changed on disk. Please reload.',
          data: { serverToken: current.versionToken, serverUpdatedAt: current.updatedAt }
        })
        return
      }

      const incoming = req.body?.settings
      if (!incoming || typeof incoming !== 'object') {
        res.status(400).json({ success: false, error: 'Invalid settings payload' })
        return
      }

      // 调试日志：接收到的数据
      logger.info('🔍 接收到的设置数据', {
        hasAccounts: !!incoming.accounts,
        hasUsers: !!incoming.accounts?.users,
        userCount: incoming.accounts?.users?.length || 0,
        users: incoming.accounts?.users?.map((u: any) => ({ id: u.id, username: u.username, role: u.role }))
      })

      // 处理用户密码加密
      if (incoming.accounts?.users && Array.isArray(incoming.accounts.users)) {
        logger.info('处理用户密码加密', { userCount: incoming.accounts.users.length })
        incoming.accounts.users = await PasswordUtils.processUsersPasswords(incoming.accounts.users)
      }

      // Shallow merge with current settings to be safe
      const merged = { ...current.settings, ...incoming }

      // 调试日志：合并后的数据
      logger.info('🔍 合并后的设置数据', {
        hasAccounts: !!merged.accounts,
        hasUsers: !!merged.accounts?.users,
        userCount: merged.accounts?.users?.length || 0,
        users: merged.accounts?.users?.map((u: any) => ({ id: u.id, username: u.username, role: u.role }))
      })

      const updated = await this.writeToDisk(merged)

      // 调试日志：写入磁盘后的数据
      logger.info('✅ 写入磁盘成功', {
        userCount: updated.settings.accounts?.users?.length || 0
      })

      // 创建审计日志
      this.logUserManagementAction(req, incoming)

      res.json({ success: true, data: updated, message: 'Settings updated' })
    } catch (error: any) {
      logger.error('Failed to update system settings', { error })
      res.status(500).json({ success: false, error: error?.message || 'Failed to update settings' })
    }
  }

  private async health(req: Request, res: Response): Promise<void> {
    try {
      const file = this.getSettingsFilePath()
      await fs.access(file)
      res.json({ success: true, status: 'ok' })
    } catch {
      res.status(500).json({ success: false, status: 'missing_settings_file' })
    }
  }

  /**
   * 记录用户管理操作审计日志
   */
  private logUserManagementAction(req: Request, settings: any): void {
    try {
      if (!settings.accounts?.users) return

      const users = settings.accounts.users
      const usernames = users.map((u: any) => u.username).join(', ')
      
      logger.info('用户管理操作', {
        action: 'update_users',
        userCount: users.length,
        usernames,
        ip: req.ip || req.socket.remoteAddress,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.warn('记录审计日志失败', { error })
    }
  }

  /**
   * 获取系统统计数据
   * GET /api/settings/statistics
   */
  private async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      logger.info('获取系统统计数据')

      // 1. 获取管理员数量
      let adminCount = 0
      try {
        const settingsData = await this.loadFromDisk()
        const users = settingsData.settings?.accounts?.users
        if (Array.isArray(users)) {
          adminCount = users.length
        }
        logger.debug('管理员数量统计', { adminCount })
      } catch (error) {
        logger.warn('获取管理员数量失败，使用默认值', { error })
      }

      // 2. 获取日志统计
      let logTotal = 0
      try {
        if (this.serviceContainer) {
          const logService = this.serviceContainer.get('logService') as any
          if (logService && logService.getLogStats) {
            const logStats = await logService.getLogStats({})
            logTotal = logStats?.total || 0
            logger.debug('日志统计', { logTotal })
          }
        }
      } catch (error) {
        logger.warn('获取日志统计失败，使用默认值', { error })
      }

      // 3. 获取活跃告警数
      let activeAlerts = 0
      try {
        if (this.serviceContainer) {
          const intelligentAnalysisEngine = this.serviceContainer.get('intelligentAnalysisEngine') as any
          if (intelligentAnalysisEngine && intelligentAnalysisEngine.getAlertSystem) {
            const alertSystem = intelligentAnalysisEngine.getAlertSystem()
            if (alertSystem) {
              const alertStats = alertSystem.getAlertStatistics()
              activeAlerts = alertStats?.active || 0
              logger.debug('告警统计', { activeAlerts })
            }
          }
        }
      } catch (error) {
        logger.warn('获取告警统计失败，使用默认值', { error })
      }

      // 4. 获取系统运行时间（秒）
      const systemUptime = Math.floor(process.uptime())
      logger.debug('系统运行时间', { systemUptime })

      const statistics: SystemStatistics = {
        adminCount,
        logTotal,
        activeAlerts,
        systemUptime
      }

      logger.info('系统统计数据获取成功', statistics)

      res.json({
        success: true,
        data: statistics
      })
    } catch (error: any) {
      logger.error('获取系统统计数据失败', { error: error?.message })
      res.status(500).json({
        success: false,
        error: error?.message || '获取系统统计数据失败'
      })
    }
  }

  getRouter(): Router {
    return this.router
  }
}
