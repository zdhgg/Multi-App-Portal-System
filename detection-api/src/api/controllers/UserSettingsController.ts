/**
 * 用户设置控制器
 * 处理用户个人设置和偏好配置
 */

import { Router, Request, Response } from 'express'
import { logger } from '../../utils/logger.js'

export class UserSettingsController {
  private router = Router()

  constructor() {
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // 获取用户设置
    this.router.get('/user-settings', this.getUserSettings.bind(this))
    
    // 更新用户设置
    this.router.put('/user-settings', this.updateUserSettings.bind(this))
  }

  /**
   * 获取用户设置
   */
  async getUserSettings(req: Request, res: Response): Promise<void> {
    try {
      // 默认用户设置（匹配前端期望的数据结构）
      const defaultSettings = {
        recentPaths: [],
        favoriteApps: [],
        presetPaths: [
          {
            path: 'D:\\Projects',
            category: 'project',
            description: '项目目录'
          },
          {
            path: 'D:\\Workspace',
            category: 'workspace',
            description: '工作空间'
          },
          {
            path: 'C:\\Users',
            category: 'common',
            description: '用户目录'
          },
          {
            path: 'D:\\My Programs',
            category: 'workspace',
            description: '程序目录'
          }
        ],
        preferences: {
          autoDetectOnStartup: false,
          scanDepth: 'medium',
          excludePatterns: ['node_modules', '.git', 'dist', 'build'],
          theme: 'auto',
          showWelcomeTips: true,
          compactMode: false
        },
        detectionPreferences: {
          autoDetectOnStartup: false,
          scanDepth: 'medium',
          excludePatterns: ['node_modules', '.git', 'dist', 'build']
        },
        uiPreferences: {
          theme: 'auto',
          showWelcomeTips: true,
          compactMode: false
        }
      }
      
      res.json({
        success: true,
        data: defaultSettings,
        message: '用户设置获取成功'
      })
    } catch (error) {
      logger.error('获取用户设置失败:', error)
      res.status(500).json({
        success: false,
        error: '获取用户设置失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  /**
   * 更新用户设置
   */
  async updateUserSettings(req: Request, res: Response): Promise<void> {
    try {
      const settings = req.body
      
      logger.info('更新用户设置', { settings })
      
      // TODO: 实现持久化存储
      
      res.json({
        success: true,
        data: settings,
        message: '用户设置更新成功'
      })
    } catch (error) {
      logger.error('更新用户设置失败:', error)
      res.status(500).json({
        success: false,
        error: '更新用户设置失败',
        details: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  getRouter(): Router {
    return this.router
  }
}
