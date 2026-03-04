/**
 * AggregatorStage - 聚合阶段
 * 
 * 负责将检测到的应用和全栈项目聚合为最终的项目列表
 * 处理去重、合并和排序
 */

import { v4 as uuidv4 } from 'uuid'
import { basename } from 'path'
import { PipelineStage } from '../PipelineStage'
import { 
  ScanContext, 
  DetectedApplication, 
  FullStackProject,
  AggregatedProject 
} from '../ScanContext'
import { logger } from '../../../utils/logger'

export class AggregatorStage extends PipelineStage {
  readonly name = 'Aggregator'
  
  protected async process(context: ScanContext): Promise<void> {
    const { detectedApplications, fullStackProjects } = context.results
    const { maxDepth } = context.config
    const { workspacePath } = context.metadata
    
    logger.info('[Aggregator] 开始聚合项目', {
      detectedApps: detectedApplications.length,
      fullStackProjects: fullStackProjects.length,
      userMaxDepth: maxDepth
    })
    
    const aggregatedProjects: AggregatedProject[] = []
    const processedAppIds = new Set<string>()
    
    // 第一步：处理全栈项目（按根目录深度过滤）
    for (const fsProject of fullStackProjects) {
      const projectDepth = this.calculateProjectDepth(fsProject.directory, workspacePath)
      
      // 只返回符合用户设置深度的项目
      if (projectDepth > maxDepth) {
        logger.debug('[Aggregator] 跳过超过深度限制的全栈项目', {
          name: fsProject.name,
          directory: fsProject.directory,
          projectDepth,
          maxDepth
        })
        continue
      }
      
      const aggregated = this.aggregateFullStackProject(fsProject)
      aggregatedProjects.push(aggregated)
      
      // 标记已处理的应用
      processedAppIds.add(fsProject.frontend.id)
      processedAppIds.add(fsProject.backend.id)
    }
    
    // 第二步：处理独立应用（非全栈组件，按深度过滤）
    for (const app of detectedApplications) {
      if (processedAppIds.has(app.id)) continue
      
      const appDepth = this.calculateProjectDepth(app.directory, workspacePath)
      
      // 只返回符合用户设置深度的应用
      if (appDepth > maxDepth) {
        logger.debug('[Aggregator] 跳过超过深度限制的应用', {
          name: app.name,
          directory: app.directory,
          appDepth,
          maxDepth
        })
        continue
      }
      
      const aggregated = this.aggregateSingleApplication(app)
      aggregatedProjects.push(aggregated)
    }
    
    // 第三步：排序（置信度高的在前，备份项目在后）
    const sortedProjects = this.sortProjects(aggregatedProjects)
    
    // 保存结果
    context.results.aggregatedProjects = sortedProjects
    
    logger.info('[Aggregator] 项目聚合完成', {
      totalProjects: sortedProjects.length,
      fullStackProjects: sortedProjects.filter(p => p.type === 'fullstack').length,
      backupProjects: sortedProjects.filter(p => p.isBackup).length,
      filteredByDepth: (detectedApplications.length + fullStackProjects.length) - sortedProjects.length
    })
  }
  
  /**
   * 计算项目相对于工作区的深度
   * 例如：workspacePath = "D:\My Programs"
   *       projectDir = "D:\My Programs\project-a" → depth = 1
   *       projectDir = "D:\My Programs\backup\project-b" → depth = 2
   */
  private calculateProjectDepth(projectDir: string, workspacePath: string): number {
    // 规范化路径
    const normalizedProject = projectDir.replace(/\\/g, '/').toLowerCase()
    const normalizedWorkspace = workspacePath.replace(/\\/g, '/').toLowerCase()
    
    // 计算相对路径
    const relativePath = normalizedProject.replace(normalizedWorkspace, '').replace(/^\//, '')
    
    if (!relativePath) return 0
    
    // 计算深度
    const segments = relativePath.split('/').filter(s => s.length > 0)
    return segments.length
  }
  
  /**
   * 聚合全栈项目
   */
  private aggregateFullStackProject(fsProject: FullStackProject): AggregatedProject {
    const techStacks = [
      fsProject.frontend.techStack,
      fsProject.backend.techStack
    ].filter(t => t !== 'unknown')
    
    return {
      id: fsProject.id,
      name: fsProject.name,
      directory: fsProject.directory,
      type: 'fullstack',
      applications: [fsProject.frontend, fsProject.backend],
      fullStackInfo: fsProject,
      ports: {
        frontend: undefined, // 由 PortAllocator 阶段填充
        backend: undefined
      },
      confidence: fsProject.confidence,
      techStacks,
      isBackup: this.isBackupProject(fsProject.directory),
      description: `全栈项目: ${fsProject.frontend.techStack} + ${fsProject.backend.techStack}`
    }
  }
  
  /**
   * 聚合单个应用
   */
  private aggregateSingleApplication(app: DetectedApplication): AggregatedProject {
    const type = this.determineProjectType(app)
    
    return {
      id: app.id,
      name: app.name,
      directory: app.directory,
      type,
      applications: [app],
      fullStackInfo: undefined,
      ports: {
        main: undefined // 由 PortAllocator 阶段填充
      },
      confidence: app.confidence,
      techStacks: [app.techStack].filter(t => t !== 'unknown'),
      isBackup: this.isBackupProject(app.directory),
      description: `${type} 项目: ${app.techStack}`
    }
  }
  
  /**
   * 判断项目类型
   */
  private determineProjectType(app: DetectedApplication): AggregatedProject['type'] {
    const frontendStacks = ['vue', 'react', 'angular', 'svelte', 'nextjs', 'nuxt', 'vite']
    const backendStacks = ['express', 'fastify', 'koa', 'nestjs', 'hapi']
    
    if (app.componentType === 'frontend' || frontendStacks.includes(app.techStack)) {
      return 'frontend'
    }
    if (app.componentType === 'backend' || backendStacks.includes(app.techStack)) {
      return 'backend'
    }
    if (app.techStack === 'static') {
      return 'static'
    }
    
    return 'unknown'
  }
  
  /**
   * 判断是否是备份项目
   */
  private isBackupProject(directory: string): boolean {
    const lowerPath = directory.toLowerCase()
    return lowerPath.includes('backup') || 
           lowerPath.includes('备份') || 
           lowerPath.includes('old') ||
           lowerPath.includes('archive')
  }
  
  /**
   * 排序项目
   */
  private sortProjects(projects: AggregatedProject[]): AggregatedProject[] {
    return projects.sort((a, b) => {
      // 备份项目排在后面
      if (a.isBackup !== b.isBackup) {
        return a.isBackup ? 1 : -1
      }
      
      // 全栈项目优先
      if (a.type !== b.type) {
        if (a.type === 'fullstack') return -1
        if (b.type === 'fullstack') return 1
      }
      
      // 置信度高的优先
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence
      }
      
      // 按名称排序
      return a.name.localeCompare(b.name)
    })
  }
  
  protected getStageStats(context: ScanContext): Record<string, any> {
    const projects = context.results.aggregatedProjects
    return {
      totalProjects: projects.length,
      fullstack: projects.filter(p => p.type === 'fullstack').length,
      frontend: projects.filter(p => p.type === 'frontend').length,
      backend: projects.filter(p => p.type === 'backend').length,
      backup: projects.filter(p => p.isBackup).length
    }
  }
}
