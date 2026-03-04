/**
 * 统一技术栈分析器
 * 
 * 整合了所有重复的技术栈检测逻辑，提供统一的分析接口。
 * 使用配置驱动的方式，支持扩展和自定义。
 */

import { existsSync } from 'fs'
import { join } from 'path'
import { logger } from '../../utils/logger'
import { ENHANCED_WEB_DETECTION_RULES, CONFIDENCE_WEIGHTS, CONFIDENCE_THRESHOLDS } from '../WebAppDetectionConfig'
import type { 
  TechStackAnalysisResult, 
  DetectionFeatures,
  DetectionOptions 
} from './IDetector'
import type { WebAppDetectionRule, DetectionIssue } from '../types'

// =============================================================================
// 技术栈分析配置
// =============================================================================

interface TechStackPattern {
  readonly name: string
  readonly category: 'frontend' | 'backend' | 'fullstack'
  readonly dependencies: readonly string[]
  readonly exclusions?: readonly string[]
  readonly configFiles?: readonly string[]
  readonly priority: number
}

const TECH_STACK_PATTERNS: readonly TechStackPattern[] = [
  // 全栈框架
  { name: 'Next.js', category: 'fullstack', dependencies: ['next'], priority: 100 },
  { name: 'Nuxt.js', category: 'fullstack', dependencies: ['nuxt'], priority: 100 },
  { name: 'SvelteKit', category: 'fullstack', dependencies: ['@sveltejs/kit'], priority: 95 },
  { name: 'Remix', category: 'fullstack', dependencies: ['@remix-run/node', '@remix-run/react'], priority: 95 },
  { name: 'Gatsby', category: 'fullstack', dependencies: ['gatsby'], priority: 90 },

  // 前端框架
  { name: 'React', category: 'frontend', dependencies: ['react'], exclusions: ['next'], priority: 80 },
  { name: 'Vue', category: 'frontend', dependencies: ['vue'], exclusions: ['nuxt'], priority: 80 },
  { name: 'Angular', category: 'frontend', dependencies: ['@angular/core'], priority: 85 },
  { name: 'Svelte', category: 'frontend', dependencies: ['svelte'], exclusions: ['@sveltejs/kit'], priority: 75 },

  // 后端框架
  { name: 'NestJS', category: 'backend', dependencies: ['@nestjs/core'], priority: 85 },
  { name: 'Express', category: 'backend', dependencies: ['express'], priority: 70 },
  { name: 'Fastify', category: 'backend', dependencies: ['fastify'], priority: 70 },
  { name: 'Koa', category: 'backend', dependencies: ['koa'], priority: 65 },

  // 构建工具
  { name: 'Vite', category: 'frontend', dependencies: ['vite'], priority: 60 },
  { name: 'Webpack', category: 'frontend', dependencies: ['webpack'], priority: 50 },
] as const

// =============================================================================
// 统一技术栈分析器
// =============================================================================

export class UnifiedTechStackAnalyzer {
  private readonly patterns: readonly TechStackPattern[]
  private readonly detectionRules: readonly WebAppDetectionRule[]

  constructor() {
    this.patterns = TECH_STACK_PATTERNS
    this.detectionRules = ENHANCED_WEB_DETECTION_RULES
  }

  /**
   * 分析技术栈
   */
  async analyzeTechStack(
    directory: string, 
    packageJson?: any, 
    features?: DetectionFeatures
  ): Promise<TechStackAnalysisResult> {
    try {
      logger.info('开始技术栈分析', { directory })

      // 如果没有提供 packageJson，尝试读取
      if (!packageJson) {
        packageJson = this.readPackageJson(directory)
      }

      if (!packageJson) {
        return this.createUnknownResult('未找到 package.json 文件')
      }

      // 获取所有依赖
      const allDependencies = this.getAllDependencies(packageJson)
      
      // 使用模式匹配分析
      const patternResult = this.analyzeByPatterns(allDependencies)
      if (patternResult.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
        return patternResult
      }

      // 使用检测规则分析
      const ruleResult = await this.analyzeByRules(directory, packageJson, features)
      if (ruleResult.confidence >= CONFIDENCE_THRESHOLDS.LOW) {
        return ruleResult
      }

      // 回退到基础分析
      return this.analyzeBasic(allDependencies, packageJson)

    } catch (error) {
      logger.error('技术栈分析失败', { directory, error })
      return this.createUnknownResult(`分析失败: ${error}`)
    }
  }

  /**
   * 获取支持的技术栈列表
   */
  getSupportedTechStacks(): readonly string[] {
    return this.patterns.map(p => p.name)
  }

  /**
   * 批量分析技术栈
   */
  async analyzeBatch(
    items: Array<{ directory: string; packageJson?: any; features?: DetectionFeatures }>
  ): Promise<readonly TechStackAnalysisResult[]> {
    const results = await Promise.allSettled(
      items.map(item => this.analyzeTechStack(item.directory, item.packageJson, item.features))
    )

    return results
      .filter((result): result is PromiseFulfilledResult<TechStackAnalysisResult> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value)
  }

  // =============================================================================
  // 私有方法
  // =============================================================================

  /**
   * 读取 package.json
   */
  private readPackageJson(directory: string): any | null {
    try {
      const packageJsonPath = join(directory, 'package.json')
      if (!existsSync(packageJsonPath)) {
        return null
      }
      return require(packageJsonPath)
    } catch (error) {
      logger.warn('读取 package.json 失败', { directory, error })
      return null
    }
  }

  /**
   * 获取所有依赖
   */
  private getAllDependencies(packageJson: any): string[] {
    const deps = [
      ...Object.keys(packageJson.dependencies || {}),
      ...Object.keys(packageJson.devDependencies || {}),
      ...Object.keys(packageJson.peerDependencies || {})
    ]
    return [...new Set(deps)]
  }

  /**
   * 使用模式匹配分析
   */
  private analyzeByPatterns(dependencies: string[]): TechStackAnalysisResult {
    const matches: Array<{ pattern: TechStackPattern; score: number; reasoning: string[] }> = []

    for (const pattern of this.patterns) {
      const reasoning: string[] = []
      let score = 0

      // 检查必需依赖
      const requiredMatches = pattern.dependencies.filter(dep =>
        dependencies.some(d => d === dep || d.startsWith(dep + '/'))
      )

      if (requiredMatches.length === 0) continue

      // 计算基础分数
      const matchRatio = requiredMatches.length / pattern.dependencies.length
      score = matchRatio * 0.8
      reasoning.push(`匹配依赖: ${requiredMatches.join(', ')} (${requiredMatches.length}/${pattern.dependencies.length})`)

      // 检查排除依赖
      if (pattern.exclusions) {
        const exclusionMatches = pattern.exclusions.filter(dep =>
          dependencies.some(d => d === dep || d.startsWith(dep + '/'))
        )

        if (exclusionMatches.length > 0) {
          score *= 0.3 // 大幅降低分数
          reasoning.push(`发现排除依赖: ${exclusionMatches.join(', ')}`)
        }
      }

      // 优先级加权 - 调整权重计算
      const priorityWeight = pattern.priority / 100
      score = score * priorityWeight + (priorityWeight * 0.1) // 给高优先级一些基础分数

      // 降低阈值，让更多模式能够参与比较
      if (score > 0.1) {
        matches.push({ pattern, score, reasoning })
      }
    }

    // 选择最佳匹配
    if (matches.length === 0) {
      return this.createUnknownResult('未找到匹配的技术栈模式')
    }

    matches.sort((a, b) => b.score - a.score)
    const best = matches[0]

    // 确保置信度合理
    const finalConfidence = Math.min(Math.max(best.score, 0.4), 0.95)

    return {
      techStack: best.pattern.name,
      category: best.pattern.category,
      confidence: finalConfidence,
      reasoning: best.reasoning,
      alternatives: matches.slice(1, 3).map(m => m.pattern.name)
    }
  }

  /**
   * 使用检测规则分析
   */
  private async analyzeByRules(
    directory: string, 
    packageJson: any, 
    features?: DetectionFeatures
  ): Promise<TechStackAnalysisResult> {
    // 这里可以集成现有的检测规则逻辑
    // 暂时返回基础结果
    return this.analyzeBasic(this.getAllDependencies(packageJson), packageJson)
  }

  /**
   * 基础分析
   */
  private analyzeBasic(dependencies: string[], packageJson: any): TechStackAnalysisResult {
    const reasoning: string[] = []

    // 检查是否为 Node.js 项目
    if (packageJson.scripts?.start || packageJson.scripts?.dev) {
      reasoning.push('发现启动脚本')
      
      // 简单的框架检测
      if (dependencies.includes('express')) {
        return {
          techStack: 'Express',
          category: 'backend',
          confidence: 0.6,
          reasoning: [...reasoning, '检测到 Express 依赖'],
          alternatives: []
        }
      }

      if (dependencies.includes('react')) {
        return {
          techStack: 'React',
          category: 'frontend',
          confidence: 0.6,
          reasoning: [...reasoning, '检测到 React 依赖'],
          alternatives: []
        }
      }

      return {
        techStack: 'Node.js',
        category: 'backend',
        confidence: 0.4,
        reasoning: [...reasoning, '通用 Node.js 项目'],
        alternatives: []
      }
    }

    return this.createUnknownResult('无法确定技术栈类型')
  }

  /**
   * 创建未知结果
   */
  private createUnknownResult(reason: string): TechStackAnalysisResult {
    return {
      techStack: 'unknown',
      category: 'backend', // 默认分类
      confidence: 0.1,
      reasoning: [reason],
      alternatives: []
    }
  }
}
