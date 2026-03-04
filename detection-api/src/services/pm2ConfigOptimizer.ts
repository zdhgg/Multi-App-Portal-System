/**
 * PM2 Config Optimizer - PM2配置优化生成服务
 * 
 * 基于构建分析结果自动生成优化的PM2配置
 * 支持统一部署、SPA、SSR、静态文件等多种部署策略
 */

import { Database } from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import { logger } from '../utils/logger'
import { BuildAnalysis } from './intelligentBuildService'
import { ApplicationService } from '../core/ApplicationService'

export interface PM2ConfigTemplate {
  id: number
  name: string
  description: string
  templateType: 'unified' | 'spa' | 'ssr' | 'static'
  configTemplate: string
  isDefault: boolean
}

export interface PM2ConfigVariables {
  appName: string
  projectPath: string
  outputDir: string
  port: number
  backendScript?: string
  ssrScript?: string
  staticDir?: string
  environment: 'development' | 'production'
  customEnv?: Record<string, string>
}

export interface OptimizedPM2Config {
  name: string
  script: string
  args?: string[]
  cwd: string
  instances: number | string
  exec_mode: 'fork' | 'cluster'
  env: Record<string, string>
  log_file: string
  error_file: string
  out_file: string
  time: boolean
  max_memory_restart: string
  watch: boolean
  ignore_watch?: string[]
  restart_delay: number
  max_restarts: number
  min_uptime: string
  // 静态文件服务相关
  staticFiles?: {
    enabled: boolean
    directory: string
    fallback?: string
    headers?: Record<string, string>
  }
}

export interface DeploymentRecommendation {
  strategy: 'unified' | 'spa' | 'ssr' | 'static'
  confidence: number
  reasons: string[]
  benefits: string[]
  requirements: string[]
  config: OptimizedPM2Config
}

export class PM2ConfigOptimizer {
  constructor(
    private db: Database,
    private applicationService: ApplicationService
  ) {}

  /**
   * 基于构建分析生成优化的PM2配置
   */
  async generateOptimizedConfig(
    appId: string,
    buildAnalysis: BuildAnalysis,
    variables: Partial<PM2ConfigVariables> = {}
  ): Promise<DeploymentRecommendation> {
    const app = await this.applicationService.findById(appId)
    if (!app) {
      throw new Error(`应用 ${appId} 不存在`)
    }

    // 分析最佳部署策略
    const strategy = this.analyzeDeploymentStrategy(buildAnalysis, app)
    
    // 获取配置模板
    const template = await this.getConfigTemplate(strategy.strategy)
    
    // 准备配置变量
    const configVars = await this.prepareConfigVariables(app, buildAnalysis, variables)
    
    // 生成配置
    const config = this.generateConfig(template, configVars, buildAnalysis)
    
    return {
      strategy: strategy.strategy,
      confidence: strategy.confidence,
      reasons: strategy.reasons,
      benefits: strategy.benefits,
      requirements: strategy.requirements,
      config
    }
  }

  /**
   * 分析最佳部署策略
   */
  private analyzeDeploymentStrategy(
    buildAnalysis: BuildAnalysis,
    app: any
  ): {
    strategy: 'unified' | 'spa' | 'ssr' | 'static'
    confidence: number
    reasons: string[]
    benefits: string[]
    requirements: string[]
  } {
    const { buildTool, deploymentStrategy } = buildAnalysis
    const techStack = app.techStack?.toLowerCase() || ''

    // 基于构建工具和技术栈分析
    if (buildTool === 'Next.js' && techStack.includes('next')) {
      return {
        strategy: 'ssr',
        confidence: 0.95,
        reasons: [
          'Next.js 项目支持服务端渲染',
          '检测到 SSR 相关配置',
          '适合 SEO 优化需求'
        ],
        benefits: [
          '更好的 SEO 支持',
          '更快的首屏加载',
          '更好的用户体验'
        ],
        requirements: [
          '需要 Node.js 运行环境',
          '需要配置 SSR 脚本',
          '建议使用集群模式'
        ]
      }
    }

    if (buildTool === 'Nuxt.js' && techStack.includes('nuxt')) {
      return {
        strategy: 'ssr',
        confidence: 0.95,
        reasons: [
          'Nuxt.js 项目支持服务端渲染',
          '检测到 SSR 相关配置',
          'Vue.js 生态的 SSR 框架'
        ],
        benefits: [
          '更好的 SEO 支持',
          '更快的首屏加载',
          'Vue.js 生态完整支持'
        ],
        requirements: [
          '需要 Node.js 运行环境',
          '需要配置 Nuxt 启动脚本',
          '建议使用集群模式'
        ]
      }
    }

    // 检查是否有后端服务
    const hasBackend = this.detectBackendService(app)
    if (hasBackend && (buildTool === 'Vite' || buildTool === 'Webpack')) {
      return {
        strategy: 'unified',
        confidence: 0.85,
        reasons: [
          '检测到后端服务',
          '前端构建工具支持静态文件输出',
          '可以统一部署减少复杂性'
        ],
        benefits: [
          '减少进程数量，节省资源',
          '简化端口管理',
          '统一日志和监控',
          '减少网络跳转延迟'
        ],
        requirements: [
          '后端需要支持静态文件服务',
          '需要配置 SPA 路由回退',
          '需要正确的静态文件路径配置'
        ]
      }
    }

    // 纯前端 SPA 应用
    if (buildTool === 'Create React App' || buildTool === 'Vue CLI' || 
        (buildTool === 'Vite' && !hasBackend)) {
      return {
        strategy: 'spa',
        confidence: 0.90,
        reasons: [
          '纯前端单页应用',
          '需要路由回退支持',
          '适合客户端渲染'
        ],
        benefits: [
          '部署简单',
          '资源占用少',
          '适合静态 CDN 分发'
        ],
        requirements: [
          '需要支持 SPA 路由回退',
          '建议配置缓存策略',
          '可选择静态文件服务器'
        ]
      }
    }

    // 默认静态文件策略
    return {
      strategy: 'static',
      confidence: 0.70,
      reasons: [
        '未检测到特定框架特征',
        '使用通用静态文件服务',
        '兼容性最好的部署方式'
      ],
      benefits: [
        '部署简单',
        '资源占用最少',
        '高度稳定'
      ],
      requirements: [
        '需要静态文件服务器',
        '建议配置适当的缓存头',
        '可配置 CORS 支持'
      ]
    }
  }

  /**
   * 检测后端服务
   */
  private detectBackendService(app: any): boolean {
    const techStack = app.techStack?.toLowerCase() || ''
    const backendTechs = ['express', 'koa', 'fastify', 'nestjs', 'node.js']
    return backendTechs.some(tech => techStack.includes(tech))
  }

  /**
   * 获取配置模板
   */
  private async getConfigTemplate(templateType: string): Promise<PM2ConfigTemplate> {
    const stmt = this.db.prepare(`
      SELECT * FROM pm2_config_templates 
      WHERE template_type = ? AND is_default = TRUE
      LIMIT 1
    `)

    const template = stmt.get(templateType) as any
    if (!template) {
      throw new Error(`未找到 ${templateType} 类型的配置模板`)
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      templateType: template.template_type,
      configTemplate: template.config_template,
      isDefault: template.is_default
    }
  }

  /**
   * 准备配置变量
   */
  private async prepareConfigVariables(
    app: any,
    buildAnalysis: BuildAnalysis,
    userVariables: Partial<PM2ConfigVariables>
  ): Promise<PM2ConfigVariables> {
    const defaultPort = await this.findAvailablePort(app.id, userVariables.port)
    
    return {
      appName: app.name,
      projectPath: app.directory,
      outputDir: buildAnalysis.outputDir,
      port: defaultPort,
      backendScript: userVariables.backendScript || this.detectBackendScript(app),
      ssrScript: userVariables.ssrScript || this.detectSSRScript(buildAnalysis),
      staticDir: userVariables.staticDir || buildAnalysis.outputDir,
      environment: userVariables.environment || 'production',
      customEnv: userVariables.customEnv || {}
    }
  }

  /**
   * 生成配置
   */
  private generateConfig(
    template: PM2ConfigTemplate,
    variables: PM2ConfigVariables,
    buildAnalysis: BuildAnalysis
  ): OptimizedPM2Config {
    // 解析模板
    let configStr = template.configTemplate
    
    // 替换变量
    configStr = configStr.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return (variables as any)[key] || match
    })

    const baseConfig = JSON.parse(configStr)

    // 基于构建分析结果优化配置
    const optimizedConfig: OptimizedPM2Config = {
      ...baseConfig,
      env: {
        ...baseConfig.env,
        ...variables.customEnv
      }
    }

    // 根据构建工具优化
    this.optimizeForBuildTool(optimizedConfig, buildAnalysis)
    
    // 根据项目大小优化
    this.optimizeForProjectSize(optimizedConfig, buildAnalysis)
    
    // 添加静态文件服务配置（如果需要）
    if (template.templateType === 'unified') {
      optimizedConfig.staticFiles = {
        enabled: true,
        directory: variables.outputDir,
        fallback: 'index.html',
        headers: {
          'Cache-Control': 'public, max-age=31536000',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    }

    return optimizedConfig
  }

  /**
   * 根据构建工具优化配置
   */
  private optimizeForBuildTool(config: OptimizedPM2Config, buildAnalysis: BuildAnalysis) {
    const { buildTool } = buildAnalysis

    switch (buildTool) {
      case 'Next.js':
        config.instances = 'max'
        config.exec_mode = 'cluster'
        config.max_memory_restart = '1G'
        break
        
      case 'Nuxt.js':
        config.instances = 'max'
        config.exec_mode = 'cluster'
        config.max_memory_restart = '1G'
        break
        
      case 'Vite':
        config.max_memory_restart = '500M'
        config.restart_delay = 2000
        break
        
      case 'Create React App':
        config.max_memory_restart = '300M'
        config.restart_delay = 2000
        break
        
      case 'Vue CLI':
        config.max_memory_restart = '300M'
        config.restart_delay = 2000
        break
    }
  }

  /**
   * 根据项目大小优化配置
   */
  private optimizeForProjectSize(config: OptimizedPM2Config, buildAnalysis: BuildAnalysis) {
    // 基于优化建议数量判断项目复杂度
    const complexityScore = buildAnalysis.optimizations.length
    
    if (complexityScore > 5) {
      // 复杂项目
      config.max_memory_restart = this.increaseMemoryLimit(config.max_memory_restart, 1.5)
      config.restart_delay = Math.max(config.restart_delay, 4000)
      config.max_restarts = 15
    } else if (complexityScore > 2) {
      // 中等项目
      config.max_memory_restart = this.increaseMemoryLimit(config.max_memory_restart, 1.2)
      config.restart_delay = Math.max(config.restart_delay, 3000)
      config.max_restarts = 12
    }
    // 简单项目保持默认配置
  }

  /**
   * 增加内存限制
   */
  private increaseMemoryLimit(currentLimit: string, multiplier: number): string {
    const match = currentLimit.match(/(\d+)([MG])/)
    if (!match) return currentLimit
    
    const value = parseInt(match[1])
    const unit = match[2]
    const newValue = Math.round(value * multiplier)
    
    return `${newValue}${unit}`
  }

  /**
   * 检测后端脚本
   */
  private detectBackendScript(app: any): string {
    const candidates: string[] = []

    const candidateDirs = new Set<string>()
    if (app?.directory) {
      candidateDirs.add(app.directory)
      candidateDirs.add(path.join(app.directory, 'backend'))
    }

    for (const dir of candidateDirs) {
      if (!dir || !existsSync(dir)) continue
      const pkgPath = path.join(dir, 'package.json')
      if (!existsSync(pkgPath)) continue

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        const scripts = pkg.scripts || {}
        const orderedKeys = ['start:prod', 'start:production', 'serve', 'start', 'dev', 'preview']

        for (const key of orderedKeys) {
          if (scripts[key]) {
            candidates.push(key === 'start' ? 'npm start' : `npm run ${key}`)
          }
        }

        if (pkg.main) {
          candidates.push(`node ${pkg.main}`)
        }

        if (pkg.bin && typeof pkg.bin === 'string') {
          candidates.push(`node ${pkg.bin}`)
        }
      } catch (error) {
        logger.warn('Failed to parse package.json when detecting backend script', {
          directory: dir,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const script = candidates.find(Boolean)
    if (script) {
      return script
    }

    const fallbackScripts = [
      'npm run start:prod',
      'npm start',
      'node dist/server.js',
      'node server.js'
    ]
    return fallbackScripts[0]
  }

  /**
   * 检测SSR脚本
   */
  private detectSSRScript(buildAnalysis: BuildAnalysis): string {
    const { buildTool } = buildAnalysis
    
    switch (buildTool) {
      case 'Next.js':
        return 'npm start'
      case 'Nuxt.js':
        return 'npm run start'
      default:
        return 'npm start'
    }
  }

  /**
   * 查找可用端口
   */
  private async findAvailablePort(appId: string, preferredPort?: number): Promise<number> {
    const net = await import('node:net')
    const basePort = preferredPort ?? 3000 + (parseInt(appId.slice(-3), 16) % 1000)
    const maxAttempts = 50

    const isAvailable = (port: number) =>
      new Promise<boolean>((resolve) => {
        const probe = net.createServer()
        probe.once('error', () => {
          probe.close(() => resolve(false))
        })
        probe.once('listening', () => {
          probe.close(() => resolve(true))
        })
        probe.listen(port, '0.0.0.0')
      })

    for (let i = 0; i < maxAttempts; i++) {
      const port = basePort + i
      if (await isAvailable(port)) {
        if (i > 0) {
          logger.warn('Preferred port busy, using fallback port', { appId, preferredPort: basePort, fallbackPort: port })
        }
        return port
      }
    }

    logger.warn('Failed to find available port in range, reverting to preferred', { appId, preferredPort: basePort })
    return basePort
  }

  /**
   * 保存配置模板
   */
  async saveConfigTemplate(template: Omit<PM2ConfigTemplate, 'id'>): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO pm2_config_templates (
        name, description, template_type, config_template, is_default
      ) VALUES (?, ?, ?, ?, ?)
    `)

    try {
      const result = stmt.run(
        template.name,
        template.description,
        template.templateType,
        template.configTemplate,
        template.isDefault
      )
      return result.lastInsertRowid as number
    } catch (error) {
      logger.error('保存配置模板失败:', error)
      throw error
    }
  }

  /**
   * 获取所有配置模板
   */
  async getConfigTemplates(): Promise<PM2ConfigTemplate[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM pm2_config_templates ORDER BY template_type, name
    `)

    try {
      const rows = stmt.all() as any[]
      return rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        templateType: row.template_type,
        configTemplate: row.config_template,
        isDefault: row.is_default
      }))
    } catch (error) {
      logger.error('获取配置模板失败:', error)
      throw error
    }
  }

  /**
   * 应用优化配置到实际的PM2配置文件
   */
  async applyOptimizedConfig(
    appId: string,
    config: OptimizedPM2Config,
    configPath?: string
  ): Promise<string> {
    const app = await this.applicationService.findById(appId)
    if (!app) {
      throw new Error(`应用 ${appId} 不存在`)
    }

    const targetPath = configPath || path.join(app.directory, 'ecosystem.config.js')
    
    // 生成 PM2 配置文件内容
    const configContent = this.generatePM2ConfigFile(config)
    
    try {
      await fs.writeFile(targetPath, configContent, 'utf-8')
      logger.info(`PM2配置已保存到: ${targetPath}`)
      return targetPath
    } catch (error) {
      logger.error('保存PM2配置文件失败:', error)
      throw error
    }
  }

  /**
   * 生成PM2配置文件内容
   */
  private generatePM2ConfigFile(config: OptimizedPM2Config): string {
    const configObj = {
      apps: [config]
    }

    return `module.exports = ${JSON.stringify(configObj, null, 2)}`
  }
}
