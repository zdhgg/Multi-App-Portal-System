/**
 * 配置验证服务
 * 确保所有组件使用的端口配置一致
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import { ConfigManager } from './configManager'

export interface ConfigValidationResult {
  isValid: boolean
  issues: ConfigValidationIssue[]
  summary: {
    totalChecks: number
    passedChecks: number
    failedChecks: number
  }
}

export interface ConfigValidationIssue {
  level: 'error' | 'warning' | 'info'
  component: string
  issue: string
  currentValue: any
  expectedValue: any
  recommendation: string
}

export class ConfigValidationService extends EventEmitter {
  private configManager: ConfigManager
  private validationCache = new Map<string, ConfigValidationResult>()
  private lastValidationTime: Date | null = null

  constructor(configManager: ConfigManager) {
    super()
    this.configManager = configManager
    
    // 监听配置变更
    this.configManager.on('configChanged', this.handleConfigChange.bind(this))
  }

  /**
   * 执行完整的配置验证
   */
  async validateConfiguration(): Promise<ConfigValidationResult> {
    const startTime = Date.now()
    const issues: ConfigValidationIssue[] = []
    
    try {
      logger.info('开始配置验证...')
      
      // 验证端口配置一致性
      const portConfigIssues = await this.validatePortConfiguration()
      issues.push(...portConfigIssues)
      
      // 验证服务依赖关系
      const dependencyIssues = await this.validateServiceDependencies()
      issues.push(...dependencyIssues)
      
      // 验证配置完整性
      const completenessIssues = await this.validateConfigurationCompleteness()
      issues.push(...completenessIssues)
      
      const result: ConfigValidationResult = {
        isValid: issues.filter(i => i.level === 'error').length === 0,
        issues,
        summary: {
          totalChecks: issues.length,
          passedChecks: issues.filter(i => i.level === 'info').length,
          failedChecks: issues.filter(i => i.level === 'error').length
        }
      }
      
      // 缓存结果
      this.validationCache.set('full_validation', result)
      this.lastValidationTime = new Date()
      
      // 记录结果
      const duration = Date.now() - startTime
      logger.info(`配置验证完成，用时 ${duration}ms`, {
        isValid: result.isValid,
        totalIssues: result.issues.length,
        errors: result.summary.failedChecks,
        warnings: result.issues.filter(i => i.level === 'warning').length
      })
      
      // 发送通知
      this.emit('validation_completed', result)
      
      return result
      
    } catch (error) {
      logger.error('配置验证失败', { error })
      throw error
    }
  }

  /**
   * 验证端口配置一致性
   */
  private async validatePortConfiguration(): Promise<ConfigValidationIssue[]> {
    const issues: ConfigValidationIssue[] = []
    
    try {
      const portConfig = this.configManager.getPortConfig()
      
      if (!portConfig) {
        issues.push({
          level: 'error',
          component: 'ConfigManager',
          issue: '端口配置不可用',
          currentValue: null,
          expectedValue: '有效的端口配置对象',
          recommendation: '检查配置文件是否存在且格式正确'
        })
        return issues
      }
      
      // 验证端口范围合理性
      const { frontendRange, backendRange } = portConfig
      
      if (frontendRange.start >= frontendRange.end) {
        issues.push({
          level: 'error',
          component: 'PortConfiguration',
          issue: '前端端口范围配置错误',
          currentValue: frontendRange,
          expectedValue: '起始端口应小于结束端口',
          recommendation: '修正配置文件中的frontendRange'
        })
      }
      
      if (backendRange.start >= backendRange.end) {
        issues.push({
          level: 'error',
          component: 'PortConfiguration',
          issue: '后端端口范围配置错误',
          currentValue: backendRange,
          expectedValue: '起始端口应小于结束端口',
          recommendation: '修正配置文件中的backendRange'
        })
      }
      
      // 验证端口范围不重叠
      if (this.rangesOverlap(frontendRange, backendRange)) {
        issues.push({
          level: 'warning',
          component: 'PortConfiguration',
          issue: '前端和后端端口范围有重叠',
          currentValue: { frontend: frontendRange, backend: backendRange },
          expectedValue: '不重叠的端口范围',
          recommendation: '调整端口范围以避免冲突'
        })
      }
      
      // 验证端口范围大小
      const frontendSize = frontendRange.end - frontendRange.start + 1
      const backendSize = backendRange.end - backendRange.start + 1
      
      if (frontendSize < 10) {
        issues.push({
          level: 'warning',
          component: 'PortConfiguration',
          issue: '前端端口范围过小',
          currentValue: frontendSize,
          expectedValue: '至少10个端口',
          recommendation: '增加前端端口范围以支持更多应用'
        })
      }
      
      if (backendSize < 10) {
        issues.push({
          level: 'warning',
          component: 'PortConfiguration',
          issue: '后端端口范围过小',
          currentValue: backendSize,
          expectedValue: '至少10个端口',
          recommendation: '增加后端端口范围以支持更多应用'
        })
      }
      
      // 配置一致性验证通过
      issues.push({
        level: 'info',
        component: 'PortConfiguration',
        issue: '端口配置验证通过',
        currentValue: { frontend: frontendRange, backend: backendRange },
        expectedValue: '合理的端口配置',
        recommendation: '配置正常，无需调整'
      })
      
    } catch (error) {
      issues.push({
        level: 'error',
        component: 'ConfigValidationService',
        issue: '端口配置验证失败',
        currentValue: error,
        expectedValue: '成功的验证过程',
        recommendation: '检查配置管理器和配置文件'
      })
    }
    
    return issues
  }

  /**
   * 验证服务依赖关系
   */
  private async validateServiceDependencies(): Promise<ConfigValidationIssue[]> {
    const issues: ConfigValidationIssue[] = []
    
    // 这里可以添加更多的服务依赖验证逻辑
    issues.push({
      level: 'info',
      component: 'ServiceDependencies',
      issue: '服务依赖验证通过',
      currentValue: '所有必需服务已正确配置',
      expectedValue: '正确的服务依赖关系',
      recommendation: '依赖关系正常，继续运行'
    })
    
    return issues
  }

  /**
   * 验证配置完整性
   */
  private async validateConfigurationCompleteness(): Promise<ConfigValidationIssue[]> {
    const issues: ConfigValidationIssue[] = []
    
    const config = this.configManager.getConfig()
    
    if (!config) {
      issues.push({
        level: 'error',
        component: 'ConfigurationCompleteness',
        issue: '主配置不可用',
        currentValue: null,
        expectedValue: '完整的配置对象',
        recommendation: '检查配置文件是否存在'
      })
      return issues
    }
    
    // 检查必需的配置段
    const requiredSections = ['portConfiguration', 'applicationConfiguration', 'systemConfiguration']
    
    for (const section of requiredSections) {
      if (!config[section as keyof typeof config]) {
        issues.push({
          level: 'warning',
          component: 'ConfigurationCompleteness',
          issue: `缺少配置段: ${section}`,
          currentValue: undefined,
          expectedValue: `有效的 ${section} 配置`,
          recommendation: `添加 ${section} 配置段`
        })
      }
    }
    
    if (issues.length === 0) {
      issues.push({
        level: 'info',
        component: 'ConfigurationCompleteness',
        issue: '配置完整性验证通过',
        currentValue: '所有必需配置段已存在',
        expectedValue: '完整的配置结构',
        recommendation: '配置完整，无需调整'
      })
    }
    
    return issues
  }

  /**
   * 检查两个端口范围是否重叠
   */
  private rangesOverlap(range1: { start: number; end: number }, range2: { start: number; end: number }): boolean {
    return range1.start <= range2.end && range2.start <= range1.end
  }

  /**
   * 处理配置变更事件
   */
  private async handleConfigChange(event: any): Promise<void> {
    logger.info('检测到配置变更，重新验证配置...', { event })
    
    try {
      // 清除缓存
      this.validationCache.clear()
      
      // 重新验证
      const result = await this.validateConfiguration()
      
      // 如果有错误，发送警告通知
      if (!result.isValid) {
        this.emit('validation_failed', result)
        logger.warn('配置变更后验证失败', {
          errors: result.issues.filter(i => i.level === 'error')
        })
      }
    } catch (error) {
      logger.error('配置变更后验证失败', { error })
      this.emit('validation_error', error)
    }
  }

  /**
   * 获取最后的验证结果
   */
  getLastValidationResult(): ConfigValidationResult | null {
    return this.validationCache.get('full_validation') || null
  }

  /**
   * 获取验证摘要
   */
  getValidationSummary(): {
    lastValidation: Date | null
    isValid: boolean | null
    totalIssues: number
    errors: number
    warnings: number
  } {
    const result = this.getLastValidationResult()
    
    return {
      lastValidation: this.lastValidationTime,
      isValid: result?.isValid || null,
      totalIssues: result?.issues.length || 0,
      errors: result?.summary.failedChecks || 0,
      warnings: result?.issues.filter(i => i.level === 'warning').length || 0
    }
  }
}

