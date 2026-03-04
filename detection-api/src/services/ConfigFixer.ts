/**
 * 配置修复服务
 * 
 * 自动修复应用配置文件中的常见问题
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { logger } from '../utils/logger.js'
import type { ConfigIssue } from './AppConfigValidator.js'

export interface FixResult {
  success: boolean
  fixed: ConfigIssue[]
  failed: ConfigIssue[]
  backupPath?: string
  message: string
}

export class ConfigFixer {
  /**
   * 修复配置问题
   */
  async fixIssues(issues: ConfigIssue[], createBackup: boolean = true): Promise<FixResult> {
    const fixed: ConfigIssue[] = []
    const failed: ConfigIssue[] = []
    let backupPath: string | undefined

    try {
      // 按文件分组问题
      const issuesByFile = this.groupIssuesByFile(issues)

      for (const [file, fileIssues] of Object.entries(issuesByFile)) {
        // 只修复可自动修复的问题
        const fixableIssues = fileIssues.filter(i => i.autoFixable)
        
        if (fixableIssues.length === 0) {
          failed.push(...fileIssues.filter(i => !i.autoFixable))
          continue
        }

        try {
          // 创建备份
          if (createBackup) {
            backupPath = this.createBackup(file)
            logger.info('配置文件已备份', { file, backupPath })
          }

          // 读取文件内容
          let content = readFileSync(file, 'utf-8')
          let modified = false

          // 应用修复
          for (const issue of fixableIssues) {
            try {
              const result = this.applyFix(content, issue)
              if (result.modified) {
                content = result.content
                modified = true
                fixed.push(issue)
                logger.info('配置问题已修复', { issue: issue.message, file })
              } else {
                failed.push(issue)
              }
            } catch (error) {
              logger.error('修复失败', { error, issue: issue.message })
              failed.push(issue)
            }
          }

          // 写回文件
          if (modified) {
            writeFileSync(file, content, 'utf-8')
            logger.info('配置文件已更新', { file })
          }

          // 不可修复的问题
          failed.push(...fileIssues.filter(i => !i.autoFixable))

        } catch (error) {
          logger.error('处理文件失败', { error, file })
          failed.push(...fileIssues)
        }
      }

      const success = fixed.length > 0 && failed.filter(f => f.type === 'error').length === 0

      return {
        success,
        fixed,
        failed,
        backupPath,
        message: this.generateMessage(fixed, failed)
      }

    } catch (error) {
      logger.error('配置修复失败', { error })
      return {
        success: false,
        fixed,
        failed: issues,
        message: `修复失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 按文件分组问题
   */
  private groupIssuesByFile(issues: ConfigIssue[]): Record<string, ConfigIssue[]> {
    const grouped: Record<string, ConfigIssue[]> = {}

    for (const issue of issues) {
      if (!grouped[issue.file]) {
        grouped[issue.file] = []
      }
      grouped[issue.file].push(issue)
    }

    return grouped
  }

  /**
   * 创建备份
   */
  private createBackup(filePath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${filePath}.backup-${timestamp}`
    
    copyFileSync(filePath, backupPath)
    
    return backupPath
  }

  /**
   * 应用修复
   */
  private applyFix(content: string, issue: ConfigIssue): { content: string, modified: boolean } {
    let modified = false
    let newContent = content

    switch (issue.category) {
      case 'proxy':
        const proxyResult = this.fixProxyConfig(content, issue)
        newContent = proxyResult.content
        modified = proxyResult.modified
        break

      case 'cors':
        const corsResult = this.fixCorsConfig(content, issue)
        newContent = corsResult.content
        modified = corsResult.modified
        break

      case 'env':
        const envResult = this.fixEnvConfig(content, issue)
        newContent = envResult.content
        modified = envResult.modified
        break

      case 'port':
        // 端口配置通常不自动修复,因为可能涉及环境变量
        break

      default:
        logger.warn('未知的问题类型', { category: issue.category })
    }

    return { content: newContent, modified }
  }

  /**
   * 修复代理配置
   */
  private fixProxyConfig(content: string, issue: ConfigIssue): { content: string, modified: boolean } {
    if (!issue.currentValue || !issue.expectedValue) {
      return { content, modified: false }
    }

    // 替换代理目标URL
    const escapedCurrent = issue.currentValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(['"])${escapedCurrent}\\1`, 'g')

    const newContent = content.replace(regex, `$1${issue.expectedValue}$1`)

    const modified = newContent !== content

    if (modified) {
      logger.info('代理配置已修复', {
        from: issue.currentValue,
        to: issue.expectedValue
      })
    }

    return { content: newContent, modified }
  }

  /**
   * 修复 CORS 配置
   */
  private fixCorsConfig(content: string, issue: ConfigIssue): { content: string, modified: boolean } {
    if (!issue.currentValue || !issue.expectedValue) {
      return { content, modified: false }
    }

    // 将 cors: false 改为 cors: true
    const regex = /cors:\s*false/g
    const newContent = content.replace(regex, 'cors: true')

    const modified = newContent !== content

    if (modified) {
      logger.info('CORS配置已修复', {
        from: 'cors: false',
        to: 'cors: true'
      })
    }

    return { content: newContent, modified }
  }

  /**
   * 修复环境变量配置
   */
  private fixEnvConfig(content: string, issue: ConfigIssue): { content: string, modified: boolean } {
    if (!issue.currentValue || !issue.expectedValue) {
      return { content, modified: false }
    }

    // 修复 API URL 中的端口
    const escapedCurrent = issue.currentValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escapedCurrent, 'g')

    const newContent = content.replace(regex, issue.expectedValue)

    const modified = newContent !== content

    if (modified) {
      logger.info('环境变量配置已修复', {
        from: issue.currentValue,
        to: issue.expectedValue
      })
    }

    return { content: newContent, modified }
  }

  /**
   * 生成修复结果消息
   */
  private generateMessage(fixed: ConfigIssue[], failed: ConfigIssue[]): string {
    const parts: string[] = []

    if (fixed.length > 0) {
      parts.push(`成功修复 ${fixed.length} 个问题`)
    }

    if (failed.length > 0) {
      const errors = failed.filter(f => f.type === 'error').length
      const warnings = failed.filter(f => f.type === 'warning').length
      const infos = failed.filter(f => f.type === 'info').length

      const failedParts: string[] = []
      if (errors > 0) failedParts.push(`${errors} 个错误`)
      if (warnings > 0) failedParts.push(`${warnings} 个警告`)
      if (infos > 0) failedParts.push(`${infos} 个提示`)

      parts.push(`${failedParts.join(', ')} 需要手动处理`)
    }

    return parts.join(', ') || '没有需要修复的问题'
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupPath: string, originalPath: string): Promise<boolean> {
    try {
      if (!existsSync(backupPath)) {
        logger.error('备份文件不存在', { backupPath })
        return false
      }

      copyFileSync(backupPath, originalPath)
      logger.info('配置已从备份恢复', { backupPath, originalPath })
      
      return true
    } catch (error) {
      logger.error('恢复备份失败', { error, backupPath, originalPath })
      return false
    }
  }
}

