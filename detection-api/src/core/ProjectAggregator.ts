/**
 * Project Aggregator - 智能项目聚合系统
 * 
 * 解决问题：
 * 1. 前后端分离项目被拆分成多个应用
 * 2. 重复的备份版本
 * 3. 构建目录被误判为独立应用
 */

import { DetectionResult } from './types'
import { logger } from '../utils/logger.js'
import { dirname, basename, join } from 'path'
import { PortManagementService, PortAllocationRequest } from '../services/PortManagementService.js'
import { ConfigManager } from '../services/configManager'

export interface ProjectPortInfo {
  port: number
  confidence: number
  source: string
  reasoning: string[]
  alternatives?: number[]
}

export interface AggregatedProject {
  id: string
  name: string
  directory: string
  type: 'fullstack' | 'frontend' | 'backend' | 'static' | 'mobile'

  // 项目组件
  components: {
    frontend?: DetectionResult
    backend?: DetectionResult
    mobile?: DetectionResult
    database?: DetectionResult
    docs?: DetectionResult
  }

  // 端口分配信息
  portInfo?: {
    main?: ProjectPortInfo
    frontend?: ProjectPortInfo
    backend?: ProjectPortInfo
    api?: ProjectPortInfo
  }

  // 主要技术栈
  primaryTechStack: string
  techStacks: string[]

  // 统计信息
  confidence: number
  componentCount: number

  // 元数据
  isBackup: boolean
  version?: string
  description: string
}

export class ProjectAggregator {
  private portManager: PortManagementService

  constructor(configManager: ConfigManager, portManager: PortManagementService) {
    this.portManager = portManager
  }

  /**
   * 将扫描结果聚合为完整项目
   */
  async aggregateProjects(results: DetectionResult[]): Promise<AggregatedProject[]> {
    logger.info('Starting project aggregation', { inputCount: results.length })

    // 第一步：过滤和预处理
    const filteredResults = this.filterResults(results)
    logger.info('After filtering', { count: filteredResults.length })

    // 第二步：按项目分组
    const initialProjectGroups = this.groupByProject(filteredResults)
    logger.info('Initial project groups created', { groupCount: Object.keys(initialProjectGroups).length })

    // 第二步增强：智能合并相关项目（去重核心逻辑）
    const mergedProjectGroups = this.mergeRelatedProjects(initialProjectGroups)
    logger.info('After intelligent merging', {
      originalGroups: Object.keys(initialProjectGroups).length,
      mergedGroups: Object.keys(mergedProjectGroups).length,
      reductionRate: `${Math.round((1 - Object.keys(mergedProjectGroups).length / Object.keys(initialProjectGroups).length) * 100)}%`
    })

    // 第三步：聚合每个项目组（并行处理以提高性能）
    const aggregatedProjects = await Promise.all(
      Object.entries(mergedProjectGroups).map(([projectKey, components]) =>
        this.aggregateProjectGroup(projectKey, components)
      )
    )

    // 第四步：排序和最终处理
    const sortedProjects = this.sortAndRankProjects(aggregatedProjects)

    logger.info('Project aggregation completed', {
      finalCount: sortedProjects.length,
      reduction: `${results.length} -> ${sortedProjects.length}`
    })

    return sortedProjects
  }

  /**
   * 第一步：过滤无效结果
   */
  private filterResults(results: DetectionResult[]): DetectionResult[] {
    return results.filter(result => {
      // 过滤构建目录
      if (this.isBuildDirectory(result.directory)) {
        logger.debug('Filtering build directory', { directory: result.directory })
        return false
      }

      // 过滤node_modules等
      if (this.isExcludedDirectory(result.directory)) {
        logger.debug('Filtering excluded directory', { directory: result.directory })
        return false
      }

      // 过滤置信度过低的结果
      if (result.confidence < 0.3) {
        logger.debug('Filtering low confidence result', {
          directory: result.directory,
          confidence: result.confidence
        })
        return false
      }

      return true
    })
  }

  /**
   * 第二步：按项目根目录分组
   */
  private groupByProject(results: DetectionResult[]): Record<string, DetectionResult[]> {
    const groups: Record<string, DetectionResult[]> = {}

    for (const result of results) {
      const projectKey = this.getProjectKey(result.directory)

      if (!groups[projectKey]) {
        groups[projectKey] = []
      }

      groups[projectKey].push(result)
    }

    return groups
  }

  /**
   * 生成项目标识符 - 改进版：支持版本去重和智能分组
   */
  private getProjectKey(directory: string): string {
    const normalizedPath = directory.replace(/\\/g, '/')
    const parts = normalizedPath.split('/')

    // 检查是否是前后端分离项目
    const lastDir = parts[parts.length - 1]
    if (this.isProjectComponent(lastDir)) {
      // 返回父目录作为项目键，但要处理版本号
      const parentPath = parts.slice(0, -1).join('/')
      return this.normalizeProjectPath(parentPath)
    }

    return this.normalizeProjectPath(normalizedPath)
  }

  /**
   * 标准化项目路径 - 处理版本号和备份标识
   */
  private normalizeProjectPath(path: string): string {
    const parts = path.split('/')
    const lastDir = parts[parts.length - 1]

    // 移除版本号和常见的变体后缀，但保留基础项目名
    const baseProjectName = lastDir
      .replace(/[-_]?v?\d+(?:\.\d+)*[-_]?/gi, '') // 移除版本号 v3.0, v3.2, -v1.0等
      .replace(/[-_]?(backup|copy|old|new|test)[-_]?/gi, '') // 移除常见后缀
      .replace(/[-_]+/g, '-') // 标准化分隔符
      .replace(/^-|-$/g, '') // 移除首尾分隔符

    // 检查是否为备份项目
    const isBackup = path.toLowerCase().includes('backup') ||
      path.toLowerCase().includes('00 backup')
    const backupSuffix = isBackup ? '_backup' : ''

    // 重新构建标准化路径
    const basePath = parts.slice(0, -1).join('/')
    const normalizedKey = `${basePath}/${baseProjectName}${backupSuffix}`

    logger.debug('项目路径标准化', {
      original: path,
      normalized: normalizedKey,
      isBackup,
      baseProjectName
    })

    return normalizedKey
  }

  /**
   * 判断是否是项目组件目录
   */
  private isProjectComponent(dirName: string): boolean {
    const components = [
      'frontend', 'backend', 'server', 'client', 'web', 'api',
      'app', 'admin', 'dashboard', 'mobile', 'desktop',
      'services', 'microservices', 'gateway'
    ]

    return components.includes(dirName.toLowerCase())
  }

  /**
   * 第三步：聚合项目组
   */
  private async aggregateProjectGroup(projectKey: string, components: DetectionResult[]): Promise<AggregatedProject> {
    logger.debug('Aggregating project group', { projectKey, componentCount: components.length })

    // 分析项目组件
    const projectComponents = this.analyzeComponents(components)

    // 确定项目类型
    const projectType = this.determineProjectType(projectComponents)

    // 选择主要技术栈
    const primaryTechStack = this.selectPrimaryTechStack(components)

    // 计算置信度
    const confidence = this.calculateProjectConfidence(components, projectType)

    // 生成项目名称和描述
    const { name, description, version, isBackup } = this.generateProjectMetadata(projectKey, components)

    // 智能端口分配
    const portInfo = await this.allocatePortsForProject({
      projectKey,
      name,
      projectType,
      primaryTechStack,
      components: projectComponents
    })

    return {
      id: this.generateProjectId(projectKey),
      name,
      directory: projectKey,
      type: projectType,
      components: projectComponents,
      portInfo,
      primaryTechStack,
      techStacks: Array.from(new Set(components.map(c => c.techStack || 'unknown'))),
      confidence,
      componentCount: components.length,
      isBackup,
      version,
      description
    }
  }

  private analyzeComponents(components: DetectionResult[]): AggregatedProject['components'] {
    const result: AggregatedProject['components'] = {}

    for (const component of components) {
      const componentType = this.classifyComponent(component)

      // 选择最高置信度的组件作为该类型的代表
      if (!result[componentType] || component.confidence > result[componentType]!.confidence) {
        result[componentType] = component
      }
    }

    return result
  }

  /**
   * 分类组件类型
   */
  private classifyComponent(component: DetectionResult): keyof AggregatedProject['components'] {
    const directory = component.directory.toLowerCase()
    const techStack = (component.techStack || '').toLowerCase()

    // 后端技术栈
    if (techStack.includes('express') ||
      techStack.includes('fastify') ||
      techStack.includes('nest') ||
      techStack.includes('koa') ||
      directory.includes('backend') ||
      directory.includes('server') ||
      directory.includes('api')) {
      return 'backend'
    }

    // 移动端（需要更严格的匹配，避免误判）
    if (techStack.includes('react-native') ||
      techStack.includes('flutter') ||
      techStack.includes('ionic') ||
      techStack.includes('cordova') ||
      (directory.includes('mobile') && !directory.includes('portal')) ||
      (directory.includes('app') && techStack.includes('native'))) {
      return 'mobile'
    }

    // 前端技术栈（包括Web应用）
    if (techStack.includes('vue') ||
      techStack.includes('react') ||
      techStack.includes('angular') ||
      techStack.includes('svelte') ||
      techStack.includes('nodejs-web') ||
      directory.includes('frontend') ||
      directory.includes('client') ||
      directory.includes('web') ||
      directory.includes('portal')) {
      return 'frontend'
    }

    // 静态网站
    if (techStack.includes('static')) {
      return 'frontend'
    }

    // 默认归类为前端
    return 'frontend'
  }

  /**
   * 为项目分配智能端口
   */
  private async allocatePortsForProject(projectInfo: {
    projectKey: string
    name: string
    projectType: 'fullstack' | 'frontend' | 'backend' | 'static' | 'mobile'
    primaryTechStack: string
    components: AggregatedProject['components']
  }): Promise<AggregatedProject['portInfo']> {
    const portInfo: AggregatedProject['portInfo'] = {}

    try {
      // Map project type to port allocation type
      const mapType = (t: string): 'frontend' | 'backend' | 'other' => {
        if (t === 'frontend' || t === 'static' || t === 'mobile') return 'frontend';
        if (t === 'backend') return 'backend';
        return 'other';
      };

      // 为主项目分配端口
      const mainRequest: PortAllocationRequest = {
        appId: this.generateProjectId(projectInfo.projectKey),
        appName: projectInfo.name,
        type: mapType(projectInfo.projectType),
        techStack: projectInfo.primaryTechStack,
        description: `Main port for ${projectInfo.name}`
      }

      const mainPortResult = await this.portManager.allocatePort(mainRequest)
      portInfo.main = {
        port: mainPortResult.port,
        confidence: mainPortResult.confidence,
        source: mainPortResult.source,
        reasoning: mainPortResult.reasoning,
        alternatives: []
      }

      // 为前端组件分配端口（如果存在且与主项目不同）
      if (projectInfo.components.frontend && projectInfo.projectType === 'fullstack') {
        const frontendRequest: PortAllocationRequest = {
          appId: this.generateProjectId(projectInfo.projectKey) + '-frontend',
          appName: projectInfo.name + ' (Frontend)',
          type: 'frontend',
          techStack: projectInfo.components.frontend.techStack || 'frontend',
          description: `Frontend port for ${projectInfo.name}`
        }

        const frontendPortResult = await this.portManager.allocatePort(frontendRequest)
        portInfo.frontend = {
          port: frontendPortResult.port,
          confidence: frontendPortResult.confidence,
          source: frontendPortResult.source,
          reasoning: frontendPortResult.reasoning,
          alternatives: []
        }
      }

      // 为后端组件分配端口（如果存在且与主项目不同）
      if (projectInfo.components.backend && projectInfo.projectType === 'fullstack') {
        const backendRequest: PortAllocationRequest = {
          appId: this.generateProjectId(projectInfo.projectKey) + '-backend',
          appName: projectInfo.name + ' (Backend)',
          type: 'backend',
          techStack: projectInfo.components.backend.techStack || 'backend',
          description: `Backend port for ${projectInfo.name}`
        }

        const backendPortResult = await this.portManager.allocatePort(backendRequest)
        portInfo.backend = {
          port: backendPortResult.port,
          confidence: backendPortResult.confidence,
          source: backendPortResult.source,
          reasoning: backendPortResult.reasoning,
          alternatives: []
        }
      }

      logger.info('Port allocation completed', {
        project: projectInfo.name,
        mainPort: portInfo.main?.port,
        frontendPort: portInfo.frontend?.port,
        backendPort: portInfo.backend?.port
      })

    } catch (error) {
      logger.error('Port allocation failed', {
        project: projectInfo.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    return portInfo
  }

  /**
   * 确定项目类型
   */
  private determineProjectType(components: AggregatedProject['components']): AggregatedProject['type'] {
    const hasBackend = !!components.backend
    const hasFrontend = !!components.frontend
    const hasMobile = !!components.mobile

    if (hasMobile) {
      return 'mobile'
    }

    if (hasBackend && hasFrontend) {
      return 'fullstack'
    }

    if (hasBackend) {
      return 'backend'
    }

    if (hasFrontend) {
      // 判断是否是静态站点
      const frontendTech = components.frontend?.techStack?.toLowerCase() || ''
      if (frontendTech.includes('static')) {
        return 'static'
      }
      return 'frontend'
    }

    return 'static'
  }

  /**
   * 选择主要技术栈
   */
  private selectPrimaryTechStack(components: DetectionResult[]): string {
    // 按置信度排序，选择最高置信度的技术栈
    const sorted = components.sort((a, b) => b.confidence - a.confidence)
    return sorted[0]?.techStack || 'unknown'
  }

  /**
   * 计算项目置信度
   */
  private calculateProjectConfidence(
    components: DetectionResult[],
    projectType: AggregatedProject['type']
  ): number {
    const avgConfidence = components.reduce((sum, c) => sum + c.confidence, 0) / components.length

    // 全栈项目获得额外加分
    let typeBonus = 0
    if (projectType === 'fullstack') {
      typeBonus = 0.1
    } else if (projectType === 'mobile') {
      typeBonus = 0.05
    }

    return Math.min(avgConfidence + typeBonus, 1.0)
  }

  /**
   * 生成项目元数据
   */
  private generateProjectMetadata(projectKey: string, components: DetectionResult[]): {
    name: string
    description: string
    version?: string
    isBackup: boolean
  } {
    const pathParts = projectKey.replace(/\\/g, '/').split('/')
    const projectDir = pathParts[pathParts.length - 1]

    // 检查是否是备份
    const isBackup = projectKey.toLowerCase().includes('backup') ||
      projectKey.toLowerCase().includes('00 backup')

    // 提取版本信息
    const versionMatch = projectDir.match(/v?(\d+(?:\.\d+)*)/i)
    const version = versionMatch ? versionMatch[1] : undefined

    // 生成友好名称
    let name = projectDir
      .replace(/[-_]/g, ' ')
      .replace(/v?\d+(?:\.\d+)*/i, '') // 移除版本号
      .replace(/system/i, 'System')
      .replace(/app/i, 'App')
      .replace(/web/i, 'Web')
      .trim()

    if (!name) {
      name = 'Unknown Project'
    }

    // 生成描述
    const techStacks = Array.from(new Set(components.map(c => c.techStack).filter(Boolean)))
    let description = `${name}`

    if (version) {
      description += ` v${version}`
    }

    if (techStacks.length > 0) {
      description += ` (${techStacks.join(', ')})`
    }

    if (components.length > 1) {
      description += ` - ${components.length} components`
    }

    if (isBackup) {
      description += ' [Backup]'
    }

    return { name, description, version, isBackup }
  }

  /**
   * 生成项目ID
   */
  private generateProjectId(projectKey: string): string {
    return projectKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  }

  /**
   * 第四步：排序和排名
   */
  private sortAndRankProjects(projects: AggregatedProject[]): AggregatedProject[] {
    return projects.sort((a, b) => {
      // 非备份项目优先
      if (a.isBackup !== b.isBackup) {
        return a.isBackup ? 1 : -1
      }

      // 全栈项目优先
      if (a.type !== b.type) {
        const typeOrder = { fullstack: 0, mobile: 1, backend: 2, frontend: 3, static: 4 }
        return typeOrder[a.type] - typeOrder[b.type]
      }

      // 置信度优先
      if (Math.abs(a.confidence - b.confidence) > 0.1) {
        return b.confidence - a.confidence
      }

      // 组件数量优先
      return b.componentCount - a.componentCount
    })
  }

  /**
   * 辅助方法：判断是否是构建目录
   */
  private isBuildDirectory(directory: string): boolean {
    const buildDirs = [
      'dist', 'build', 'out', '.next', '.nuxt', 'public',
      'static', 'assets', 'target', 'bin', 'obj'
    ]

    const dirName = basename(directory).toLowerCase()
    return buildDirs.includes(dirName)
  }

  /**
   * 辅助方法：判断是否是排除目录
   */
  private isExcludedDirectory(directory: string): boolean {
    const excluded = [
      'node_modules', '.git', '.vscode', '.idea',
      'coverage', '.nyc_output', 'logs', 'temp', 'tmp'
    ]

    return excluded.some(pattern => directory.toLowerCase().includes(pattern))
  }

  /**
   * 智能合并相关项目 - 解决重复项目问题的核心算法
   */
  private mergeRelatedProjects(groups: Record<string, DetectionResult[]>): Record<string, DetectionResult[]> {
    const mergedGroups: Record<string, DetectionResult[]> = {}
    const processedKeys = new Set<string>()

    for (const [currentKey, currentResults] of Object.entries(groups)) {
      if (processedKeys.has(currentKey)) {
        continue // 已处理，跳过
      }

      // 寻找与当前项目相似的其他项目
      const similarKeys = this.findSimilarProjects(currentKey, Object.keys(groups))

      if (similarKeys.length > 1) {
        logger.debug('发现相似项目组', {
          baseProject: currentKey,
          similarProjects: similarKeys
        })

        // 选择最佳项目作为主项目
        const mainProjectKey = this.selectMainProject(similarKeys, groups)

        // 合并所有相关项目的检测结果
        const mergedResults: DetectionResult[] = []
        const projectVersions: string[] = []

        similarKeys.forEach(key => {
          if (groups[key]) {
            mergedResults.push(...groups[key])
            projectVersions.push(this.extractProjectVersion(key))
            processedKeys.add(key)
          }
        })

        mergedGroups[mainProjectKey] = mergedResults

        logger.info('成功合并项目', {
          mainProject: mainProjectKey,
          mergedVersions: projectVersions,
          totalComponents: mergedResults.length
        })

      } else {
        // 独立项目，直接保留
        mergedGroups[currentKey] = currentResults
        processedKeys.add(currentKey)
      }
    }

    return mergedGroups
  }

  /**
   * 寻找相似项目 - 基于项目名称和路径相似度
   */
  private findSimilarProjects(targetKey: string, allKeys: string[]): string[] {
    const targetBaseName = this.extractProjectBaseName(targetKey)
    const targetPath = this.extractProjectBasePath(targetKey)

    return allKeys.filter(key => {
      const keyBaseName = this.extractProjectBaseName(key)
      const keyPath = this.extractProjectBasePath(key)

      // 相同基础路径且项目名相似
      return keyPath === targetPath &&
        this.calculateNameSimilarity(targetBaseName, keyBaseName) > 0.8
    })
  }

  /**
   * 提取项目基础名称（移除版本号等）
   */
  private extractProjectBaseName(projectKey: string): string {
    const parts = projectKey.split('/')
    const projectDir = parts[parts.length - 1]

    return projectDir
      .replace(/_backup$/, '') // 移除备份后缀
      .replace(/[-_]?v?\d+(?:\.\d+)*[-_]?/gi, '') // 移除版本号
      .replace(/[-_]+(backup|copy|old|new|test)[-_]*$/gi, '') // 移除后缀
      .toLowerCase()
      .trim()
  }

  /**
   * 提取项目基础路径（不包含项目名）
   */
  private extractProjectBasePath(projectKey: string): string {
    const parts = projectKey.split('/')
    return parts.slice(0, -1).join('/')
  }

  /**
   * 计算项目名称相似度
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    if (name1 === name2) return 1.0

    // 使用简单的编辑距离算法
    const maxLength = Math.max(name1.length, name2.length)
    if (maxLength === 0) return 1.0

    const distance = this.levenshteinDistance(name1, name2)
    return 1 - (distance / maxLength)
  }

  /**
   * 计算编辑距离
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // 替换
            matrix[i][j - 1] + 1,     // 插入
            matrix[i - 1][j] + 1      // 删除
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }

  /**
   * 选择主项目 - 版本识别与选择的核心逻辑
   */
  private selectMainProject(projectKeys: string[], groups: Record<string, DetectionResult[]>): string {
    logger.debug('开始选择主项目', { candidates: projectKeys })

    // 第一优先级：非备份项目
    const nonBackupKeys = projectKeys.filter(key => !key.includes('_backup'))
    const keysToProcess = nonBackupKeys.length > 0 ? nonBackupKeys : projectKeys

    // 第二优先级：版本排序（最新版本优先）
    const sortedByVersion = keysToProcess.sort((a, b) => {
      const versionA = this.extractProjectVersion(a)
      const versionB = this.extractProjectVersion(b)
      return this.compareVersions(versionB, versionA) // 降序排列，最新在前
    })

    // 第三优先级：检测结果质量（置信度和数量）
    const selectedProject = sortedByVersion.sort((a, b) => {
      const resultsA = groups[a] || []
      const resultsB = groups[b] || []

      // 比较平均置信度
      const avgConfidenceA = resultsA.reduce((sum, r) => sum + r.confidence, 0) / resultsA.length || 0
      const avgConfidenceB = resultsB.reduce((sum, r) => sum + r.confidence, 0) / resultsB.length || 0

      if (Math.abs(avgConfidenceA - avgConfidenceB) > 0.1) {
        return avgConfidenceB - avgConfidenceA
      }

      // 比较检测结果数量
      return resultsB.length - resultsA.length
    })[0]

    logger.info('主项目选择完成', {
      selected: selectedProject,
      version: this.extractProjectVersion(selectedProject),
      isBackup: selectedProject.includes('_backup'),
      candidatesCount: projectKeys.length
    })

    return selectedProject
  }

  /**
   * 版本号比较 - 支持语义化版本
   */
  private compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(num => parseInt(num, 10) || 0)
    const v2Parts = version2.split('.').map(num => parseInt(num, 10) || 0)

    // 补齐版本号位数
    const maxLength = Math.max(v1Parts.length, v2Parts.length)
    while (v1Parts.length < maxLength) v1Parts.push(0)
    while (v2Parts.length < maxLength) v2Parts.push(0)

    // 逐位比较
    for (let i = 0; i < maxLength; i++) {
      if (v1Parts[i] !== v2Parts[i]) {
        return v1Parts[i] - v2Parts[i]
      }
    }

    return 0 // 版本号相同
  }

  /**
   * 提取项目版本信息
   */
  private extractProjectVersion(projectKey: string): string {
    const versionMatch = projectKey.match(/v?(\d+(?:\.\d+)*)/i)
    return versionMatch ? versionMatch[1] : '1.0.0'
  }
}