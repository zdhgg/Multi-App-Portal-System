/**
 * AnalyzerStage - 分析阶段
 * 
 * 负责分析扫描到的目录，识别技术栈和全栈项目结构
 * 不再重复扫描文件系统，直接使用 Scanner 阶段的结果
 */

import { readFile } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { PipelineStage } from '../PipelineStage'
import { 
  ScanContext, 
  ScannedDirectory, 
  DetectedApplication, 
  FullStackProject 
} from '../ScanContext'
import { logger } from '../../../utils/logger'

/**
 * 前端/后端目录名称模式
 */
const FRONTEND_PATTERNS = ['frontend', 'client', 'web', 'ui', 'app-ui', 'portal', 'main-portal']
const BACKEND_PATTERNS = ['backend', 'api', 'server', 'services', 'detection-api']

export class AnalyzerStage extends PipelineStage {
  readonly name = 'Analyzer'
  
  protected async process(context: ScanContext): Promise<void> {
    const { scannedDirectories } = context.results
    const { includeFullStackDetection, minConfidence } = context.config
    
    logger.info('[Analyzer] 开始分析应用', {
      totalDirectories: scannedDirectories.length,
      appDirectories: scannedDirectories.filter(d => d.hasPackageJson).length,
      includeFullStackDetection
    })
    
    // 第一步：分析每个应用目录
    const appDirs = scannedDirectories.filter(d => d.hasPackageJson)
    for (const dir of appDirs) {
      const app = await this.analyzeApplication(dir)
      if (app && app.confidence >= minConfidence) {
        context.results.detectedApplications.push(app)
      }
    }
    
    logger.info('[Analyzer] 应用分析完成', {
      detectedApps: context.results.detectedApplications.length
    })
    
    // 第二步：检测全栈项目（如果启用）
    if (includeFullStackDetection) {
      await this.detectFullStackProjects(context)
    }
  }
  
  /**
   * 分析单个应用目录
   */
  private async analyzeApplication(dir: ScannedDirectory): Promise<DetectedApplication | null> {
    try {
      // 读取 package.json
      const packageJsonPath = join(dir.path, 'package.json')
      let packageJson: any = null
      
      if (existsSync(packageJsonPath)) {
        const content = await readFile(packageJsonPath, 'utf-8')
        packageJson = JSON.parse(content)
      }
      
      // 分析技术栈
      const techStack = this.detectTechStack(dir, packageJson)
      
      // 判断是否是全栈组件
      const dirName = basename(dir.path).toLowerCase()
      const componentType = this.classifyComponent(dirName, techStack)
      const isFullStackComponent = componentType !== 'unknown'
      
      // 计算置信度
      const confidence = this.calculateConfidence(dir, packageJson, techStack)
      
      return {
        id: uuidv4(),
        directory: dir.path,
        name: packageJson?.name || basename(dir.path),
        techStack,
        confidence,
        isFullStackComponent,
        componentType,
        packageJson
      }
      
    } catch (error) {
      logger.debug('[Analyzer] 分析应用失败', {
        path: dir.path,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }
  
  /**
   * 检测技术栈
   */
  private detectTechStack(dir: ScannedDirectory, packageJson: any): string {
    if (!packageJson) return 'unknown'
    
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }
    
    // 检测前端框架
    if (deps['vue'] || deps['@vue/cli-service']) return 'vue'
    if (deps['react'] || deps['react-dom']) return 'react'
    if (deps['@angular/core']) return 'angular'
    if (deps['svelte']) return 'svelte'
    if (deps['next']) return 'nextjs'
    if (deps['nuxt'] || deps['nuxt3']) return 'nuxt'
    
    // 检测后端框架
    if (deps['express']) return 'express'
    if (deps['fastify']) return 'fastify'
    if (deps['koa']) return 'koa'
    if (deps['nestjs'] || deps['@nestjs/core']) return 'nestjs'
    if (deps['hapi'] || deps['@hapi/hapi']) return 'hapi'
    
    // 检测构建工具
    if (deps['vite']) return 'vite'
    if (deps['webpack']) return 'webpack'
    if (deps['esbuild']) return 'esbuild'
    
    // 检测静态网站
    if (dir.entries.some(e => e.endsWith('.html'))) return 'static'
    
    return 'nodejs'
  }
  
  /**
   * 分类组件类型
   */
  private classifyComponent(dirName: string, techStack: string): 'frontend' | 'backend' | 'unknown' {
    // 基于目录名判断
    if (FRONTEND_PATTERNS.some(p => dirName.includes(p))) return 'frontend'
    if (BACKEND_PATTERNS.some(p => dirName.includes(p))) return 'backend'
    
    // 基于技术栈判断
    const frontendStacks = ['vue', 'react', 'angular', 'svelte', 'nextjs', 'nuxt', 'vite']
    const backendStacks = ['express', 'fastify', 'koa', 'nestjs', 'hapi']
    
    if (frontendStacks.includes(techStack)) return 'frontend'
    if (backendStacks.includes(techStack)) return 'backend'
    
    return 'unknown'
  }
  
  /**
   * 计算置信度
   */
  private calculateConfidence(dir: ScannedDirectory, packageJson: any, techStack: string): number {
    let confidence = 0.5
    
    // 有 package.json 加分
    if (packageJson) confidence += 0.2
    
    // 有明确技术栈加分
    if (techStack !== 'unknown' && techStack !== 'nodejs') confidence += 0.2
    
    // 有 src 目录加分
    if (dir.entries.includes('src')) confidence += 0.1
    
    // 有配置文件加分
    const configFiles = ['tsconfig.json', 'vite.config.ts', 'webpack.config.js', '.eslintrc']
    if (configFiles.some(f => dir.entries.some(e => e.includes(f.replace('.', ''))))) {
      confidence += 0.1
    }
    
    return Math.min(confidence, 1.0)
  }
  
  /**
   * 检测全栈项目
   */
  private async detectFullStackProjects(context: ScanContext): Promise<void> {
    const { detectedApplications } = context.results
    const { scannedDirectories } = context.results
    
    logger.info('[Analyzer] 开始检测全栈项目')
    
    // 按父目录分组应用
    const appsByParent = new Map<string, DetectedApplication[]>()
    
    for (const app of detectedApplications) {
      const parentPath = dirname(app.directory)
      if (!appsByParent.has(parentPath)) {
        appsByParent.set(parentPath, [])
      }
      appsByParent.get(parentPath)!.push(app)
    }
    
    // 检测分离式全栈项目（同一父目录下有 frontend + backend）
    for (const [parentPath, apps] of appsByParent) {
      const frontends = apps.filter(a => a.componentType === 'frontend')
      const backends = apps.filter(a => a.componentType === 'backend')
      
      if (frontends.length > 0 && backends.length > 0) {
        // 找到最佳匹配
        const frontend = frontends.reduce((a, b) => a.confidence > b.confidence ? a : b)
        const backend = backends.reduce((a, b) => a.confidence > b.confidence ? a : b)
        
        // 读取父目录的 package.json（如果存在）
        let rootPackageJson = null
        const parentDir = scannedDirectories.find(d => d.path === parentPath)
        if (parentDir) {
          try {
            const pkgPath = join(parentPath, 'package.json')
            if (existsSync(pkgPath)) {
              rootPackageJson = JSON.parse(await readFile(pkgPath, 'utf-8'))
            }
          } catch {}
        }
        
        const fullStackProject: FullStackProject = {
          id: uuidv4(),
          name: rootPackageJson?.name || basename(parentPath),
          directory: parentPath,
          type: 'separated',
          frontend,
          backend,
          confidence: (frontend.confidence + backend.confidence) / 2,
          rootPackageJson
        }
        
        context.results.fullStackProjects.push(fullStackProject)
        
        // 标记组件为已关联全栈项目
        frontend.isFullStackComponent = true
        backend.isFullStackComponent = true
        
        logger.info('[Analyzer] 检测到分离式全栈项目', {
          name: fullStackProject.name,
          frontend: basename(frontend.directory),
          backend: basename(backend.directory),
          confidence: fullStackProject.confidence
        })
      }
    }
    
    logger.info('[Analyzer] 全栈项目检测完成', {
      fullStackCount: context.results.fullStackProjects.length
    })
  }
  
  protected getStageStats(context: ScanContext): Record<string, any> {
    return {
      detectedApps: context.results.detectedApplications.length,
      fullStackProjects: context.results.fullStackProjects.length,
      frontendApps: context.results.detectedApplications.filter(a => a.componentType === 'frontend').length,
      backendApps: context.results.detectedApplications.filter(a => a.componentType === 'backend').length
    }
  }
}
