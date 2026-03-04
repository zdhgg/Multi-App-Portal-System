/**
 * 全栈应用检测服务
 * 检测应用是否为全栈架构（frontend + backend）
 * 并提供构建状态和启动建议
 * @updated 2025-10-20 - 添加详细调试日志
 */

import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'

export interface FullStackDetectionResult {
  isFullStack: boolean
  hasBackend: boolean
  hasFrontend: boolean
  frontendBuilt: boolean
  frontendDistPath?: string
  backendPath?: string
  frontendPath?: string
  deploymentMode: 'integrated' | 'separate' | 'unknown'
  recommendations: string[]
  warnings: string[]
}

export class FullStackDetector {
  /**
   * 检测应用是否为全栈架构
   */
  async detect(appPath: string): Promise<FullStackDetectionResult> {
    const result: FullStackDetectionResult = {
      isFullStack: false,
      hasBackend: false,
      hasFrontend: false,
      frontendBuilt: false,
      deploymentMode: 'unknown',
      recommendations: [],
      warnings: []
    }

    try {
      // 检查backend目录
      const backendPath = path.join(appPath, 'backend')
      result.hasBackend = fs.existsSync(backendPath) && 
                         this.isNodeProject(backendPath)
      
      if (result.hasBackend) {
        result.backendPath = backendPath
      }

      // 检查frontend目录
      const frontendPath = path.join(appPath, 'frontend')
      result.hasFrontend = fs.existsSync(frontendPath) && 
                          this.isNodeProject(frontendPath)
      
      if (result.hasFrontend) {
        result.frontendPath = frontendPath
        
        // 检查前端是否已构建
        const distPath = path.join(frontendPath, 'dist')
        const indexHtmlPath = path.join(distPath, 'index.html')
        
        // 🔍 详细日志
        logger.info('🔍 检查前端构建状态', {
          appPath,
          frontendPath,
          distPath,
          indexHtmlPath,
          distExists: fs.existsSync(distPath),
          indexHtmlExists: fs.existsSync(indexHtmlPath)
        })
        
        result.frontendBuilt = fs.existsSync(distPath) && 
                               fs.existsSync(indexHtmlPath)
        
        if (result.frontendBuilt) {
          result.frontendDistPath = distPath
          logger.info('✅ 前端已构建', { distPath })
        } else {
          logger.warn('❌ 前端未构建', { 
            distPath,
            distExists: fs.existsSync(distPath),
            indexHtmlExists: fs.existsSync(indexHtmlPath)
          })
        }
      }

      // 判断是否为全栈应用
      result.isFullStack = result.hasBackend && result.hasFrontend

      // 检测Backend是否配置了静态文件服务
      if (result.isFullStack && result.hasBackend) {
        const hasStaticService = await this.checkBackendStaticService(backendPath)
        
        if (hasStaticService) {
          result.deploymentMode = 'integrated'
        } else {
          result.deploymentMode = 'separate'
        }
      }

      // 生成建议和警告
      this.generateRecommendations(result)

      logger.info('全栈应用检测完成', {
        appPath,
        isFullStack: result.isFullStack,
        deploymentMode: result.deploymentMode,
        frontendBuilt: result.frontendBuilt
      })

      return result
    } catch (error) {
      logger.error('全栈应用检测失败', { appPath, error })
      return result
    }
  }

  /**
   * 检查是否为Node.js项目
   */
  private isNodeProject(projectPath: string): boolean {
    return fs.existsSync(path.join(projectPath, 'package.json'))
  }

  /**
   * 检查Backend是否配置了前端静态文件服务
   */
  private async checkBackendStaticService(backendPath: string): Promise<boolean> {
    try {
      // 检查src/server.ts或src/app.ts或src/index.ts
      const possibleFiles = [
        'src/server.ts',
        'src/server.js',
        'src/app.ts',
        'src/app.js',
        'src/index.ts',
        'src/index.js',
        'server.ts',
        'server.js',
        'app.ts',
        'app.js'
      ]

      for (const file of possibleFiles) {
        const filePath = path.join(backendPath, file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          
          // 检查是否包含静态文件服务配置
          const hasStaticConfig = 
            content.includes('express.static') &&
            (content.includes('frontend/dist') || 
             content.includes('../frontend/dist') ||
             content.includes('../../frontend/dist'))
          
          if (hasStaticConfig) {
            return true
          }
        }
      }

      return false
    } catch (error) {
      logger.error('检查Backend静态服务配置失败', { backendPath, error })
      return false
    }
  }

  /**
   * 生成建议和警告
   */
  private generateRecommendations(result: FullStackDetectionResult): void {
    if (!result.isFullStack) {
      return
    }

    // 集成部署模式的建议
    if (result.deploymentMode === 'integrated') {
      if (!result.frontendBuilt) {
        result.warnings.push('前端尚未构建，生产模式启动将失败')
        result.recommendations.push('构建前端：cd frontend && npm run build')
        result.recommendations.push('然后启动Backend即可（自动包含前端）')
      } else {
        result.recommendations.push('✅ 生产模式：只需启动Backend（自动包含前端）')
        result.recommendations.push(`访问地址将是Backend的端口（如 http://localhost:8041）`)
      }
    }

    // 分离部署模式的建议
    if (result.deploymentMode === 'separate') {
      result.warnings.push('Backend未配置前端静态文件服务')
      result.recommendations.push('方案1（推荐）：配置Backend提供前端静态文件，实现一体化部署')
      result.recommendations.push('方案2：分别启动Frontend和Backend（开发模式）')
      
      if (result.frontendBuilt) {
        result.recommendations.push('前端已构建，可以使用方案1（需修改Backend配置）')
      } else {
        result.recommendations.push('前端未构建，当前只能使用方案2（开发模式）')
      }
    }

    // 端口配置提醒
    result.recommendations.push('注意：确认Frontend和Backend使用不同端口')
  }

  /**
   * 获取启动模式建议
   */
  getStartupModeAdvice(detection: FullStackDetectionResult): {
    canUseProduction: boolean
    shouldUseDevelopment: boolean
    message: string
    details: string[]
  } {
    const advice = {
      canUseProduction: false,
      shouldUseDevelopment: false,
      message: '',
      details: [] as string[]
    }

    if (!detection.isFullStack) {
      advice.canUseProduction = true
      advice.message = '单体应用，支持生产模式'
      return advice
    }

    // 全栈应用的建议
    if (detection.deploymentMode === 'integrated') {
      if (detection.frontendBuilt) {
        advice.canUseProduction = true
        advice.message = '✅ 可以使用生产模式（一体化部署）'
        advice.details = [
          '前端已构建完成',
          'Backend已配置静态文件服务',
          '启动Backend即可访问完整应用'
        ]
      } else {
        advice.canUseProduction = false
        advice.shouldUseDevelopment = true
        advice.message = '⚠️  前端未构建，建议使用开发模式'
        advice.details = [
          '生产模式需要前端构建：cd frontend && npm run build',
          '或使用开发模式分别启动前后端'
        ]
      }
    } else if (detection.deploymentMode === 'separate') {
      advice.canUseProduction = false
      advice.shouldUseDevelopment = true
      advice.message = '⚠️  建议使用开发模式（分离部署）'
      advice.details = [
        'Backend未配置前端静态服务',
        '需要分别启动Frontend和Backend',
        '推荐：修改Backend配置，实现一体化部署'
      ]
    }

    return advice
  }
}

export const fullstackDetector = new FullStackDetector()

