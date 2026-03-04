/**
 * 增强型项目聚合器
 * 专门解决全栈项目检测问题，特别是 training-system-v3.2 类型的分离式全栈项目
 */

import { DetectionResult } from './types';
import { logger } from '../utils/logger';
import { dirname, basename, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { enhancedFullStackDetector, FullStackProject } from '../services/enhancedFullStackDetector';
import { ConfigManager } from '../services/configManager';

// 全栈端口分配策略接口
interface FullStackPortStrategy {
  frontend: number;
  backend: number;
  allocation: 'sequential' | 'paired' | 'separated';
  reasoning: string[];
}

// 端口冲突解决器
class PortConflictResolver {
  private allocatedPorts = new Set<number>();
  private projectIndex = 0;
  private getRanges: () => { frontend: { start: number; end: number }; backend: { start: number; end: number } };

  constructor(getRanges: () => { frontend: { start: number; end: number }; backend: { start: number; end: number } }) {
    this.getRanges = getRanges;
  }

  allocateFullStackPorts(project: FullStackProject): FullStackPortStrategy {
    // 为每个全栈项目分配分离式端口（前端在3001-3100，后端在4001-4100）
    const ranges = this.getRanges();
    const frontendBasePort = ranges.frontend.start + (this.projectIndex * 10);
    const backendBasePort = ranges.backend.start + (this.projectIndex * 10);
    this.projectIndex++;

    const frontendPort = this.resolvePortConflict(frontendBasePort, 'frontend');
    const backendPort = this.resolvePortConflict(backendBasePort, 'backend');

    return {
      frontend: frontendPort,
      backend: backendPort,
      allocation: 'separated',
      reasoning: [
        `项目索引: ${this.projectIndex - 1}`,
        `前端基础端口: ${frontendBasePort}`,
        `后端基础端口: ${backendBasePort}`,
        `分离式端口分配确保端口在正确范围内`,
        `前端: ${frontendPort}, 后端: ${backendPort}`
      ]
    };
  }

  private resolvePortConflict(requestedPort: number, type: 'frontend' | 'backend'): number {
    if (!this.allocatedPorts.has(requestedPort)) {
      this.allocatedPorts.add(requestedPort);
      return requestedPort;
    }

    // 寻找下一个可用端口，使用与配置文件一致的端口范围
    const portRanges = this.getRanges();

    const range = type === 'frontend' ? portRanges.frontend : portRanges.backend;
    for (let port = range.start; port <= range.end; port++) {
      if (!this.allocatedPorts.has(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }

    throw new Error(`无法为${type}分配端口：范围${range.start}-${range.end}已满`);
  }

  resetAllocator() {
    this.allocatedPorts.clear();
    this.projectIndex = 0;
    this.preAllocateCommonPorts();
  }

  /**
   * 预分配常用端口，避免冲突
   */
  private preAllocateCommonPorts() {
    // 预分配一些常用的开发端口，避免分配时冲突
    const commonPorts = [3000, 3001, 4000, 4001, 5000, 8000, 8080, 9000];
    const reservedPorts = [22, 80, 443, 993, 995]; // 系统保留端口
    
    const allPorts = commonPorts.concat(reservedPorts);
    allPorts.forEach(port => {
      this.allocatedPorts.add(port);
    });
    
    logger.debug('预分配端口完成', { 
      commonPorts: commonPorts.length,
      reservedPorts: reservedPorts.length,
      totalPreAllocated: allPorts.length
    });
  }

  /**
   * 获取端口分配摘要
   */
  getPortSummary(): {
    totalAllocated: number;
    frontendPorts: number[];
    backendPorts: number[];
    projectCount: number;
  } {
    const ranges = this.getRanges();
    const frontendPorts = Array.from(this.allocatedPorts).filter(port => port >= ranges.frontend.start && port <= ranges.frontend.end);
    const backendPorts = Array.from(this.allocatedPorts).filter(port => port >= ranges.backend.start && port <= ranges.backend.end);
    
    return {
      totalAllocated: this.allocatedPorts.size,
      frontendPorts,
      backendPorts,
      projectCount: this.projectIndex
    };
  }
}

export interface EnhancedAggregatedProject {
  id: string;
  name: string;
  directory: string;
  type: 'fullstack' | 'frontend' | 'backend' | 'static' | 'mobile';
  
  // 增强的项目组件信息
  components: {
    frontend?: DetectionResult & { originalPort?: number };
    backend?: DetectionResult & { originalPort?: number };
    mobile?: DetectionResult;
    database?: DetectionResult;
    docs?: DetectionResult;
  };
  
  // 全栈项目特有属性
  fullstackInfo?: {
    detectionType: 'separated' | 'monorepo' | 'nested';
    frontendPath: string;
    backendPath: string;
    rootPackageJson?: any;
    // 增强的端口分配信息
    portAllocation?: {
      strategy: 'sequential' | 'paired' | 'separated';
      ports: {
        frontend: number;
        backend: number;
      };
      reasoning: string[];
    };
    originalPorts: {
      frontend: number[];
      backend: number[];
    };
  };
  
  primaryTechStack: string;
  techStacks: string[];
  confidence: number;
  componentCount: number;
  
  // 元数据
  isBackup: boolean;
  version?: string;
  description: string;
  detectionReason: string;
}

export class EnhancedProjectAggregator {
  private configManager?: ConfigManager;
  private portResolver: PortConflictResolver;
  private currentMaxDepth: number = 3;  // 当前扫描深度配置

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager;
    const rangeProvider = () => {
      const cfg = this.configManager?.getPortConfig();
      return {
        frontend: cfg?.frontendRange || { start: 3001, end: 3100 },
        backend: cfg?.backendRange || { start: 8001, end: 8100 }
      };
    };
    this.portResolver = new PortConflictResolver(rangeProvider);
  }
  
  /**
   * 增强的项目聚合，优先检测全栈项目
   * @param results 检测结果
   * @param options 配置选项，包含 maxDepth 扫描深度
   */
  async aggregateProjects(results: DetectionResult[], options?: { maxDepth?: number }): Promise<EnhancedAggregatedProject[]> {
    // 保存扫描深度配置
    this.currentMaxDepth = options?.maxDepth ?? 3;
    
    logger.info('开始增强型项目聚合', { inputCount: results.length, maxDepth: this.currentMaxDepth });
    
    const startTime = Date.now();
    
    try {
      // 第零步：重置端口分配器，避免端口冲突
      this.portResolver.resetAllocator();
      logger.info('端口分配器已重置');
      
      // 第一步：预处理和过滤
      const filteredResults = this.filterResults(results);
      logger.info('过滤后结果', { count: filteredResults.length });
      
      // 第二步：专门检测全栈项目（使用用户设置的扫描深度）
      const fullStackProjects = await this.detectFullStackProjects(filteredResults);
      logger.info('检测到全栈项目', { count: fullStackProjects.length });
      
      // 第三步：处理剩余的单体项目
      const remainingResults = this.excludeFullStackComponents(filteredResults, fullStackProjects);
      const singleProjects = await this.processSingleProjects(remainingResults);
      logger.info('处理单体项目', { count: singleProjects.length });
      
      // 第四步：合并和排序
      const allProjects = [...fullStackProjects, ...singleProjects];
      const sortedProjects = this.sortAndRankProjects(allProjects);
      
      const duration = Date.now() - startTime;
      logger.info('增强型项目聚合完成', {
        总耗时: `${duration}ms`,
        原始检测数: results.length,
        最终项目数: sortedProjects.length,
        全栈项目数: fullStackProjects.length,
        单体项目数: singleProjects.length
      });
      
      return sortedProjects;
      
    } catch (error) {
      logger.error('增强型项目聚合失败', { error });
      return [];
    }
  }
  
  /**
   * 专门检测全栈项目
   */
  private async detectFullStackProjects(results: DetectionResult[]): Promise<EnhancedAggregatedProject[]> {
    const fullStackProjects: EnhancedAggregatedProject[] = [];
    const processedDirectories = new Set<string>();
    
    // 获取所有可能的项目根目录
    const potentialRoots = this.identifyPotentialProjectRoots(results);
    
    for (const rootDir of potentialRoots) {
      if (processedDirectories.has(rootDir)) continue;
      
      logger.debug('检查全栈项目根目录', { rootDir });
      
      try {
        // 使用增强检测器检测全栈项目（使用用户设置的扫描深度）
        const detectedProjects = await enhancedFullStackDetector.detectFullStackProjects(rootDir, {
          minConfidence: 0.6,
          maxDepth: this.currentMaxDepth,  // 使用用户设置的扫描深度
          includeNodeModules: false
        });
        
        // 转换为聚合项目格式
        for (const fullStackProject of detectedProjects) {
          const aggregated = await this.convertFullStackToAggregated(fullStackProject, results);
          if (aggregated) {
            fullStackProjects.push(aggregated);
            processedDirectories.add(fullStackProject.directory);
            
            // 标记相关组件目录为已处理
            processedDirectories.add(fullStackProject.backend.directory);
            processedDirectories.add(fullStackProject.frontend.directory);
            
            logger.info('成功检测全栈项目', {
              name: aggregated.name,
              type: aggregated.fullstackInfo?.detectionType,
              confidence: aggregated.confidence
            });
          }
        }
        
      } catch (error) {
        logger.error('全栈项目检测失败', { rootDir, error });
      }
    }
    
    return fullStackProjects;
  }
  
  /**
   * 识别潜在的项目根目录
   */
  private identifyPotentialProjectRoots(results: DetectionResult[]): string[] {
    const roots = new Set<string>();
    
    for (const result of results) {
      // 获取父目录
      const parentDir = dirname(result.directory);
      roots.add(parentDir);
      
      // 如果当前目录看起来像组件目录，也添加祖父目录
      const dirName = basename(result.directory).toLowerCase();
      if (this.isProjectComponent(dirName)) {
        const grandParentDir = dirname(parentDir);
        roots.add(grandParentDir);
      }
      
      // 直接添加当前目录（可能本身就是项目根）
      roots.add(result.directory);
    }
    
    return Array.from(roots).sort();
  }
  
  /**
   * 转换全栈项目为聚合格式
   */
  private async convertFullStackToAggregated(
    fullStackProject: FullStackProject, 
    originalResults: DetectionResult[]
  ): Promise<EnhancedAggregatedProject | null> {
    try {
      // 使用智能端口分配策略
      const portStrategy = this.portResolver.allocateFullStackPorts(fullStackProject);
      
      logger.info('分配全栈项目端口', {
        project: fullStackProject.name,
        strategy: portStrategy.allocation,
        frontendPort: portStrategy.frontend,
        backendPort: portStrategy.backend,
        reasoning: portStrategy.reasoning
      });
      
      // 查找对应的检测结果
      const frontendResult = originalResults.find(r => 
        r.directory === fullStackProject.frontend.directory
      );
      const backendResult = originalResults.find(r => 
        r.directory === fullStackProject.backend.directory
      );
      
      // 增强组件信息（添加智能分配的端口）
      const frontendComponent = frontendResult ? {
        ...frontendResult,
        originalPort: portStrategy.frontend, // 使用智能分配的端口
        portReasoning: portStrategy.reasoning
      } : undefined;
      
      const backendComponent = backendResult ? {
        ...backendResult,
        originalPort: portStrategy.backend, // 使用智能分配的端口
        portReasoning: portStrategy.reasoning
      } : undefined;
      
      const aggregated: EnhancedAggregatedProject = {
        id: fullStackProject.id,
        name: fullStackProject.name,
        directory: fullStackProject.directory,
        type: 'fullstack',
        components: {
          frontend: frontendComponent,
          backend: backendComponent
        },
        fullstackInfo: {
          detectionType: fullStackProject.type === 'separated_fullstack' ? 'separated' : 
                       fullStackProject.type === 'monorepo_fullstack' ? 'monorepo' : 'nested',
          frontendPath: fullStackProject.frontend.directory,
          backendPath: fullStackProject.backend.directory,
          rootPackageJson: fullStackProject.metadata?.rootPackageJson,
          // 增强的端口分配信息
          portAllocation: {
            strategy: portStrategy.allocation,
            ports: {
              frontend: portStrategy.frontend,
              backend: portStrategy.backend
            },
            reasoning: portStrategy.reasoning
          },
          originalPorts: {
            frontend: fullStackProject.frontend.ports,
            backend: fullStackProject.backend.ports
          }
        },
        primaryTechStack: this.determinePrimaryTechStack([
          fullStackProject.frontend.techStack,
          fullStackProject.backend.techStack
        ]),
        techStacks: [fullStackProject.frontend.techStack, fullStackProject.backend.techStack],
        confidence: fullStackProject.confidence,
        componentCount: 2,
        isBackup: this.isBackupProject(fullStackProject.directory),
        description: `全栈项目：${fullStackProject.frontend.techStack} + ${fullStackProject.backend.techStack}`,
        detectionReason: fullStackProject.metadata?.detectionReason || '增强检测器识别'
      };
      
      return aggregated;
      
    } catch (error) {
      logger.error('转换全栈项目失败', { fullStackProject: fullStackProject.name, error });
      return null;
    }
  }
  
  /**
   * 处理单体项目（非全栈）
   */
  private async processSingleProjects(results: DetectionResult[]): Promise<EnhancedAggregatedProject[]> {
    const projects: EnhancedAggregatedProject[] = [];
    
    // 按项目分组
    const groups = this.groupByProject(results);
    
    for (const [projectKey, components] of Object.entries(groups)) {
      const project = this.createSingleProject(projectKey, components);
      projects.push(project);
    }
    
    return projects;
  }
  
  /**
   * 创建单体项目
   */
  private createSingleProject(projectKey: string, components: DetectionResult[]): EnhancedAggregatedProject {
    const primaryComponent = components.sort((a, b) => b.confidence - a.confidence)[0];
    const projectType = this.determineProjectType(components);
    
    const projectComponents: EnhancedAggregatedProject['components'] = {};
    
    // 分类组件
    for (const component of components) {
      const componentType = this.classifyComponent(component);
      if (!projectComponents[componentType] || component.confidence > projectComponents[componentType]!.confidence) {
        projectComponents[componentType] = component;
      }
    }
    
    const { name, description, version, isBackup } = this.generateProjectMetadata(projectKey, components);
    
    return {
      id: this.generateProjectId(projectKey),
      name,
      directory: projectKey,
      type: projectType,
      components: projectComponents,
      primaryTechStack: primaryComponent.techStack || 'unknown',
      techStacks: [...new Set(components.map(c => c.techStack || 'unknown'))],
      confidence: this.calculateProjectConfidence(components, projectType),
      componentCount: components.length,
      isBackup,
      version,
      description,
      detectionReason: '传统聚合检测'
    };
  }
  
  /**
   * 排除已经被全栈项目包含的组件
   */
  private excludeFullStackComponents(
    results: DetectionResult[],
    fullStackProjects: EnhancedAggregatedProject[]
  ): DetectionResult[] {
    const excludedPaths = new Set<string>();

    // 收集全栈项目的组件路径和根目录
    for (const project of fullStackProjects) {
      if (project.fullstackInfo) {
        excludedPaths.add(project.fullstackInfo.frontendPath);
        excludedPaths.add(project.fullstackInfo.backendPath);
        // 添加全栈项目根目录，避免重复检测
        excludedPaths.add(project.directory);
      }
    }

    logger.info('排除全栈项目相关路径', {
      excludedCount: excludedPaths.size,
      excludedPaths: Array.from(excludedPaths)
    });

    return results.filter(result => !excludedPaths.has(result.directory));
  }
  
  /**
   * 确定主要技术栈
   */
  private determinePrimaryTechStack(techStacks: string[]): string {
    // 前端技术栈优先级更高（用户更关心前端技术）
    const frontendPriority = ['Vue', 'React', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js'];
    
    for (const priority of frontendPriority) {
      if (techStacks.some(stack => stack.includes(priority))) {
        return techStacks.find(stack => stack.includes(priority)) || priority;
      }
    }
    
    return techStacks[0] || 'unknown';
  }
  
  /**
   * 过滤结果（继承原有逻辑但调整阈值）
   */
  private filterResults(results: DetectionResult[]): DetectionResult[] {
    return results.filter(result => {
      // 过滤构建目录
      if (this.isBuildDirectory(result.directory)) {
        logger.debug('过滤构建目录', { directory: result.directory });
        return false;
      }
      
      // 过滤排除目录
      if (this.isExcludedDirectory(result.directory)) {
        logger.debug('过滤排除目录', { directory: result.directory });
        return false;
      }
      
      // 降低置信度阈值以包含更多潜在的全栈组件
      if (result.confidence < 0.2) {
        logger.debug('过滤低置信度结果', { 
          directory: result.directory, 
          confidence: result.confidence 
        });
        return false;
      }
      
      return true;
    });
  }
  
  // 以下方法继承原有ProjectAggregator的逻辑
  
  private groupByProject(results: DetectionResult[]): Record<string, DetectionResult[]> {
    const groups: Record<string, DetectionResult[]> = {};
    
    for (const result of results) {
      const projectKey = this.getProjectKey(result.directory);
      
      if (!groups[projectKey]) {
        groups[projectKey] = [];
      }
      
      groups[projectKey].push(result);
    }
    
    return groups;
  }
  
  private getProjectKey(directory: string): string {
    const normalizedPath = directory.replace(/\\/g, '/');
    const parts = normalizedPath.split('/');
    
    const lastDir = parts[parts.length - 1];
    if (this.isProjectComponent(lastDir)) {
      return parts.slice(0, -1).join('/');
    }
    
    return normalizedPath;
  }
  
  private isProjectComponent(dirName: string): boolean {
    const components = [
      'frontend', 'backend', 'server', 'client', 'web', 'api',
      'app', 'admin', 'dashboard', 'mobile', 'desktop',
      'services', 'microservices', 'gateway'
    ];
    
    return components.includes(dirName.toLowerCase());
  }
  
  private classifyComponent(component: DetectionResult): keyof EnhancedAggregatedProject['components'] {
    const directory = component.directory.toLowerCase();
    const techStack = (component.techStack || '').toLowerCase();
    
    // 后端技术栈
    if (techStack.includes('express') || 
        techStack.includes('fastify') || 
        techStack.includes('nest') ||
        techStack.includes('koa') ||
        directory.includes('backend') ||
        directory.includes('server') ||
        directory.includes('api')) {
      return 'backend';
    }
    
    // 移动端
    if (techStack.includes('react-native') ||
        techStack.includes('flutter') ||
        techStack.includes('ionic') ||
        techStack.includes('cordova') ||
        (directory.includes('mobile') && !directory.includes('portal')) ||
        (directory.includes('app') && techStack.includes('native'))) {
      return 'mobile';
    }
    
    // 前端技术栈（默认）
    return 'frontend';
  }
  
  private determineProjectType(components: DetectionResult[]): EnhancedAggregatedProject['type'] {
    const hasBackend = components.some(c => this.classifyComponent(c) === 'backend');
    const hasFrontend = components.some(c => this.classifyComponent(c) === 'frontend');
    const hasMobile = components.some(c => this.classifyComponent(c) === 'mobile');
    
    if (hasMobile) return 'mobile';
    if (hasBackend && hasFrontend) return 'fullstack';
    if (hasBackend) return 'backend';
    if (hasFrontend) return 'frontend';
    
    return 'static';
  }
  
  private calculateProjectConfidence(
    components: DetectionResult[], 
    projectType: EnhancedAggregatedProject['type']
  ): number {
    const avgConfidence = components.reduce((sum, c) => sum + c.confidence, 0) / components.length;
    
    let typeBonus = 0;
    if (projectType === 'fullstack') {
      typeBonus = 0.15; // 全栈项目获得更多加分
    } else if (projectType === 'mobile') {
      typeBonus = 0.1;
    }
    
    return Math.min(avgConfidence + typeBonus, 1.0);
  }
  
  private generateProjectMetadata(projectKey: string, components: DetectionResult[]): {
    name: string;
    description: string;
    version?: string;
    isBackup: boolean;
  } {
    const pathParts = projectKey.replace(/\\/g, '/').split('/');
    const projectDir = pathParts[pathParts.length - 1];
    
    const isBackup = this.isBackupProject(projectKey);
    
    const versionMatch = projectDir.match(/v?(\d+(?:\.\d+)*)/i);
    const version = versionMatch ? versionMatch[1] : undefined;
    
    let name = projectDir
      .replace(/[-_]/g, ' ')
      .replace(/v?\d+(?:\.\d+)*/i, '')
      .replace(/system/i, 'System')
      .replace(/app/i, 'App')
      .replace(/web/i, 'Web')
      .trim();
    
    if (!name) {
      name = 'Unknown Project';
    }
    
    const techStacks = [...new Set(components.map(c => c.techStack).filter(Boolean))];
    let description = `${name}`;
    
    if (version) {
      description += ` v${version}`;
    }
    
    if (techStacks.length > 0) {
      description += ` (${techStacks.join(', ')})`;
    }
    
    if (components.length > 1) {
      description += ` - ${components.length} components`;
    }
    
    if (isBackup) {
      description += ' [Backup]';
    }
    
    return { name, description, version, isBackup };
  }
  
  private isBackupProject(directory: string): boolean {
    const lowerDir = directory.toLowerCase();
    return lowerDir.includes('backup') || lowerDir.includes('00 backup');
  }
  
  private generateProjectId(projectKey: string): string {
    return projectKey.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }
  
  private sortAndRankProjects(projects: EnhancedAggregatedProject[]): EnhancedAggregatedProject[] {
    return projects.sort((a, b) => {
      // 非备份项目优先
      if (a.isBackup !== b.isBackup) {
        return a.isBackup ? 1 : -1;
      }
      
      // 全栈项目优先（特别是新检测到的）
      if (a.type !== b.type) {
        const typeOrder = { fullstack: 0, mobile: 1, backend: 2, frontend: 3, static: 4 };
        return typeOrder[a.type] - typeOrder[b.type];
      }
      
      // 置信度优先
      if (Math.abs(a.confidence - b.confidence) > 0.05) {
        return b.confidence - a.confidence;
      }
      
      // 组件数量优先
      return b.componentCount - a.componentCount;
    });
  }
  
  private isBuildDirectory(directory: string): boolean {
    const buildDirs = [
      'dist', 'build', 'out', '.next', '.nuxt', 'public',
      'static', 'assets', 'target', 'bin', 'obj'
    ];
    
    const dirName = basename(directory).toLowerCase();
    return buildDirs.includes(dirName);
  }
  
  private isExcludedDirectory(directory: string): boolean {
    const excluded = [
      'node_modules', '.git', '.vscode', '.idea', 
      'coverage', '.nyc_output', 'logs', 'temp', 'tmp'
    ];
    
    return excluded.some(pattern => directory.toLowerCase().includes(pattern));
  }
}

// 导出单例
// export const enhancedProjectAggregator = new EnhancedProjectAggregator();

