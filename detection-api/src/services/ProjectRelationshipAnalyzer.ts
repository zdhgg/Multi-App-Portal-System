/**
 * Project Relationship Analyzer
 * 
 * 项目关联分析器 - 分析项目间的依赖关系和启动顺序
 * 
 * 核心功能：
 * 1. 检测项目间的API调用依赖
 * 2. 分析配置文件中的依赖关系
 * 3. 识别共享资源（数据库、配置等）
 * 4. 生成最优启动顺序
 * 5. 预警潜在的集成问题
 */

import { readFile, existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
import type { AggregatedProject } from '../core/ProjectAggregator.js';

const readFileAsync = promisify(readFile);

// 项目依赖关系类型定义
export interface ProjectDependency {
  from: string;           // 依赖方项目ID
  to: string;             // 被依赖方项目ID
  type: DependencyType;   // 依赖类型
  confidence: number;     // 依赖关系的置信度 (0-1)
  details: DependencyDetails;
}

export type DependencyType = 
  | 'api_call'          // API调用依赖
  | 'database_shared'   // 共享数据库
  | 'config_shared'     // 共享配置
  | 'file_shared'       // 共享文件
  | 'service_call'      // 服务调用
  | 'websocket'         // WebSocket连接
  | 'static_resource';  // 静态资源依赖

export interface DependencyDetails {
  description: string;
  evidence: string[];     // 检测到依赖关系的证据
  ports?: number[];       // 涉及的端口
  urls?: string[];        // 涉及的URL
  files?: string[];       // 涉及的文件
  severity: 'low' | 'medium' | 'high';  // 依赖严重程度
}

// 项目关联图谱
export interface ProjectRelationshipGraph {
  projects: ProjectNode[];
  dependencies: ProjectDependency[];
  startupOrder: StartupSequence;
  issues: IntegrationIssue[];
  metadata: {
    totalProjects: number;
    totalDependencies: number;
    complexity: 'simple' | 'moderate' | 'complex';
    analysisTime: number;
  };
}

export interface ProjectNode {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'fullstack' | 'static' | 'mobile';
  ports: number[];
  dependencies: string[];  // 依赖的项目ID列表
  dependents: string[];    // 依赖此项目的项目ID列表
  level: number;           // 在依赖层级中的位置
}

export interface StartupSequence {
  phases: StartupPhase[];
  totalTime: number;       // 预估总启动时间（秒）
  parallelizable: boolean; // 是否可以并行启动
}

export interface StartupPhase {
  phase: number;
  projects: string[];      // 此阶段可以并行启动的项目ID
  estimatedTime: number;   // 预估此阶段启动时间（秒）
  description: string;
}

export interface IntegrationIssue {
  type: 'port_conflict' | 'missing_dependency' | 'circular_dependency' | 'version_mismatch' | 'config_inconsistency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  projects: string[];      // 涉及的项目ID
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

export class ProjectRelationshipAnalyzer {
  
  private readonly apiCallPatterns = [
    // HTTP API调用模式
    /(?:fetch|axios|http).*?['"`]https?:\/\/[^'"`]*:(\d+)[^'"`]*['"`]/g,
    /(?:baseURL|apiUrl|endpoint).*?['"`]https?:\/\/[^'"`]*:(\d+)[^'"`]*['"`]/g,
    /localhost:(\d+)/g,
    /127\.0\.0\.1:(\d+)/g,
    // 环境变量模式
    /process\.env\.(?:API_URL|BASE_URL|BACKEND_URL)/g,
    // 配置文件模式
    /(?:api|backend|server).*?port.*?(\d+)/gi
  ];

  private readonly databasePatterns = [
    // 数据库连接模式
    /(?:mongodb|mysql|postgres|sqlite):\/\/[^'"`\s]*/g,
    /(?:DB_HOST|DATABASE_URL|DB_CONNECTION)/g,
    /\.db$|\.sqlite$|\.sql$/g
  ];

  private readonly configPatterns = [
    // 配置文件共享模式
    /\.env(?:\.[^.]*)?$/g,
    /config\/[^'"`\s]*/g,
    /\.config\.[jt]s$/g
  ];

  /**
   * 分析项目间的关联关系
   */
  async analyzeRelationships(projects: AggregatedProject[]): Promise<ProjectRelationshipGraph> {
    const startTime = Date.now();
    
    logger.info('Starting project relationship analysis', { 
      projectCount: projects.length 
    });

    try {
      // 1. 构建项目节点
      const projectNodes = await this.buildProjectNodes(projects);
      
      // 2. 检测依赖关系
      const dependencies = await this.detectDependencies(projects);
      
      // 3. 生成启动顺序
      const startupOrder = this.generateStartupSequence(projectNodes, dependencies);
      
      // 4. 检测集成问题
      const issues = this.detectIntegrationIssues(projectNodes, dependencies);
      
      const analysisTime = Date.now() - startTime;
      
      const graph: ProjectRelationshipGraph = {
        projects: projectNodes,
        dependencies,
        startupOrder,
        issues,
        metadata: {
          totalProjects: projects.length,
          totalDependencies: dependencies.length,
          complexity: this.calculateComplexity(dependencies.length, projects.length),
          analysisTime
        }
      };

      logger.info('Project relationship analysis completed', {
        totalProjects: graph.metadata.totalProjects,
        totalDependencies: graph.metadata.totalDependencies,
        complexity: graph.metadata.complexity,
        analysisTime: `${analysisTime}ms`,
        issuesFound: issues.length
      });

      return graph;
      
    } catch (error) {
      logger.error('Project relationship analysis failed', { error });
      throw new Error(`关联分析失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 构建项目节点
   */
  private async buildProjectNodes(projects: AggregatedProject[]): Promise<ProjectNode[]> {
    const nodes: ProjectNode[] = [];
    
    for (const project of projects) {
      const ports = this.extractProjectPorts(project);
      
      const node: ProjectNode = {
        id: project.id,
        name: project.name,
        type: project.type,
        ports,
        dependencies: [],
        dependents: [],
        level: 0
      };
      
      nodes.push(node);
    }
    
    return nodes;
  }

  /**
   * 提取项目端口信息
   */
  private extractProjectPorts(project: AggregatedProject): number[] {
    const ports: number[] = [];
    
    if (project.portInfo) {
      if (project.portInfo.main) ports.push(project.portInfo.main.port);
      if (project.portInfo.frontend) ports.push(project.portInfo.frontend.port);
      if (project.portInfo.backend) ports.push(project.portInfo.backend.port);
      if (project.portInfo.api) ports.push(project.portInfo.api.port);
    }
    
    return [...new Set(ports)]; // 去重
  }

  /**
   * 检测项目间的依赖关系
   */
  private async detectDependencies(projects: AggregatedProject[]): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];
    
    for (const project of projects) {
      // 检测API调用依赖
      const apiDeps = await this.detectApiDependencies(project, projects);
      dependencies.push(...apiDeps);
      
      // 检测数据库共享
      const dbDeps = await this.detectDatabaseDependencies(project, projects);
      dependencies.push(...dbDeps);
      
      // 检测配置共享
      const configDeps = await this.detectConfigDependencies(project, projects);
      dependencies.push(...configDeps);
    }
    
    return dependencies;
  }

  /**
   * 检测API调用依赖
   */
  private async detectApiDependencies(
    project: AggregatedProject, 
    allProjects: AggregatedProject[]
  ): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];
    
    try {
      // 扫描项目文件中的API调用
      const sourceFiles = await this.findSourceFiles(project.directory);
      
      for (const file of sourceFiles) {
        const content = await readFileAsync(file, 'utf-8');
        const apiCalls = this.extractApiCalls(content);
        
        for (const apiCall of apiCalls) {
          // 查找匹配的目标项目
          const targetProject = this.findProjectByPort(apiCall.port, allProjects);
          
          if (targetProject && targetProject.id !== project.id) {
            dependencies.push({
              from: project.id,
              to: targetProject.id,
              type: 'api_call',
              confidence: apiCall.confidence,
              details: {
                description: `${project.name} 调用 ${targetProject.name} 的API`,
                evidence: [`在文件 ${file} 中发现API调用: ${apiCall.url}`],
                ports: [apiCall.port],
                urls: [apiCall.url],
                files: [file],
                severity: 'high'
              }
            });
          }
        }
      }
      
    } catch (error) {
      logger.debug('API dependency detection failed', { 
        project: project.name, 
        error 
      });
    }
    
    return dependencies;
  }

  // 其他方法将在下一个文件中继续实现...
  
  private async findSourceFiles(directory: string): Promise<string[]> {
    // 简化实现，实际应该递归扫描
    const extensions = ['.js', '.ts', '.vue', '.jsx', '.tsx'];
    const files: string[] = [];
    
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const scanDir = (dir: string) => {
        if (!existsSync(dir)) return;
        
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          const fullPath = path.join(dir, entry);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
            scanDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => entry.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      };
      
      scanDir(directory);
    } catch (error) {
      logger.debug('Source file scanning failed', { directory, error });
    }
    
    return files.slice(0, 50); // 限制文件数量，避免性能问题
  }

  private extractApiCalls(content: string): Array<{url: string, port: number, confidence: number}> {
    const calls: Array<{url: string, port: number, confidence: number}> = [];
    
    for (const pattern of this.apiCallPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const port = parseInt(match[1], 10);
        if (port && port > 1000 && port < 65536) {
          calls.push({
            url: match[0],
            port,
            confidence: 0.8
          });
        }
      }
    }
    
    return calls;
  }

  private findProjectByPort(port: number, projects: AggregatedProject[]): AggregatedProject | null {
    for (const project of projects) {
      const ports = this.extractProjectPorts(project);
      if (ports.includes(port)) {
        return project;
      }
    }
    return null;
  }

  private async detectDatabaseDependencies(
    project: AggregatedProject,
    allProjects: AggregatedProject[]
  ): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];

    try {
      // 检查项目配置文件中的数据库连接
      const configFiles = await this.findConfigFiles(project.directory);

      for (const configFile of configFiles) {
        const content = await readFileAsync(configFile, 'utf-8');
        const dbConnections = this.extractDatabaseConnections(content);

        for (const dbConnection of dbConnections) {
          // 查找使用相同数据库的其他项目
          const sharedProjects = await this.findProjectsWithSameDatabase(
            dbConnection, project, allProjects
          );

          for (const sharedProject of sharedProjects) {
            dependencies.push({
              from: project.id,
              to: sharedProject.id,
              type: 'database_shared',
              confidence: 0.9,
              details: {
                description: `${project.name} 和 ${sharedProject.name} 共享数据库`,
                evidence: [`在配置文件 ${configFile} 中发现数据库连接: ${dbConnection.type}`],
                files: [configFile],
                severity: 'medium'
              }
            });
          }
        }
      }

    } catch (error) {
      logger.debug('Database dependency detection failed', {
        project: project.name,
        error
      });
    }

    return dependencies;
  }

  private async detectConfigDependencies(
    project: AggregatedProject,
    allProjects: AggregatedProject[]
  ): Promise<ProjectDependency[]> {
    const dependencies: ProjectDependency[] = [];

    try {
      // 检查共享配置文件
      const sharedConfigs = await this.findSharedConfigFiles(project, allProjects);

      for (const sharedConfig of sharedConfigs) {
        dependencies.push({
          from: project.id,
          to: sharedConfig.targetProject.id,
          type: 'config_shared',
          confidence: 0.7,
          details: {
            description: `${project.name} 和 ${sharedConfig.targetProject.name} 共享配置文件`,
            evidence: [`共享配置文件: ${sharedConfig.configPath}`],
            files: [sharedConfig.configPath],
            severity: 'low'
          }
        });
      }

    } catch (error) {
      logger.debug('Config dependency detection failed', {
        project: project.name,
        error
      });
    }

    return dependencies;
  }

  private generateStartupSequence(
    nodes: ProjectNode[],
    dependencies: ProjectDependency[]
  ): StartupSequence {
    // 构建依赖图
    const dependencyMap = new Map<string, Set<string>>();
    const dependentMap = new Map<string, Set<string>>();

    // 初始化映射
    for (const node of nodes) {
      dependencyMap.set(node.id, new Set());
      dependentMap.set(node.id, new Set());
    }

    // 填充依赖关系
    for (const dep of dependencies) {
      if (dep.type === 'api_call' || dep.type === 'database_shared') {
        dependencyMap.get(dep.from)?.add(dep.to);
        dependentMap.get(dep.to)?.add(dep.from);
      }
    }

    // 拓扑排序生成启动顺序
    const phases: StartupPhase[] = [];
    const visited = new Set<string>();
    let phase = 1;

    while (visited.size < nodes.length) {
      const currentPhase: string[] = [];

      // 找到当前可以启动的项目（没有未满足的依赖）
      for (const node of nodes) {
        if (visited.has(node.id)) continue;

        const dependencies = dependencyMap.get(node.id) || new Set();
        const canStart = Array.from(dependencies).every(dep => visited.has(dep));

        if (canStart) {
          currentPhase.push(node.id);
        }
      }

      if (currentPhase.length === 0) {
        // 检测到循环依赖，强制启动剩余项目
        const remaining = nodes.filter(n => !visited.has(n.id));
        currentPhase.push(...remaining.map(n => n.id));
      }

      // 添加到启动阶段
      phases.push({
        phase,
        projects: currentPhase,
        estimatedTime: this.estimateStartupTime(currentPhase, nodes),
        description: this.generatePhaseDescription(phase, currentPhase, nodes)
      });

      // 标记为已访问
      currentPhase.forEach(id => visited.add(id));
      phase++;
    }

    return {
      phases,
      totalTime: phases.reduce((sum, p) => sum + p.estimatedTime, 0),
      parallelizable: phases.some(p => p.projects.length > 1)
    };
  }

  private detectIntegrationIssues(
    nodes: ProjectNode[], 
    dependencies: ProjectDependency[]
  ): IntegrationIssue[] {
    const issues: IntegrationIssue[] = [];
    
    // 检测端口冲突
    const portMap = new Map<number, string[]>();
    for (const node of nodes) {
      for (const port of node.ports) {
        if (!portMap.has(port)) {
          portMap.set(port, []);
        }
        portMap.get(port)!.push(node.id);
      }
    }
    
    for (const [port, projectIds] of portMap) {
      if (projectIds.length > 1) {
        issues.push({
          type: 'port_conflict',
          severity: 'high',
          projects: projectIds,
          description: `端口 ${port} 被多个项目使用`,
          suggestion: '为冲突的项目分配不同的端口',
          autoFixable: true
        });
      }
    }
    
    return issues;
  }

  private calculateComplexity(depCount: number, projCount: number): 'simple' | 'moderate' | 'complex' {
    const ratio = depCount / projCount;
    if (ratio < 0.5) return 'simple';
    if (ratio < 1.5) return 'moderate';
    return 'complex';
  }

  // 辅助方法实现
  private async findConfigFiles(directory: string): Promise<string[]> {
    const configFiles: string[] = [];
    const configNames = [
      'package.json', '.env', '.env.local', '.env.development', '.env.production',
      'config.js', 'config.ts', 'app.config.js', 'nuxt.config.js', 'vite.config.js'
    ];

    for (const configName of configNames) {
      const configPath = join(directory, configName);
      if (existsSync(configPath)) {
        configFiles.push(configPath);
      }
    }

    return configFiles;
  }

  private extractDatabaseConnections(content: string): Array<{type: string, connection: string}> {
    const connections: Array<{type: string, connection: string}> = [];

    // 检测各种数据库连接模式
    const patterns = [
      { type: 'MongoDB', pattern: /mongodb:\/\/[^'"`\s]*/g },
      { type: 'MySQL', pattern: /mysql:\/\/[^'"`\s]*/g },
      { type: 'PostgreSQL', pattern: /postgres(?:ql)?:\/\/[^'"`\s]*/g },
      { type: 'SQLite', pattern: /\.(?:db|sqlite|sqlite3)(?:['"`]|$)/g }
    ];

    for (const { type, pattern } of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        connections.push({ type, connection: match[0] });
      }
    }

    return connections;
  }

  private async findProjectsWithSameDatabase(
    dbConnection: {type: string, connection: string},
    currentProject: AggregatedProject,
    allProjects: AggregatedProject[]
  ): Promise<AggregatedProject[]> {
    const sharedProjects: AggregatedProject[] = [];

    for (const project of allProjects) {
      if (project.id === currentProject.id) continue;

      try {
        const configFiles = await this.findConfigFiles(project.directory);
        for (const configFile of configFiles) {
          const content = await readFileAsync(configFile, 'utf-8');
          const connections = this.extractDatabaseConnections(content);

          if (connections.some(conn =>
            conn.type === dbConnection.type &&
            conn.connection.includes(dbConnection.connection.split('/').pop() || '')
          )) {
            sharedProjects.push(project);
            break;
          }
        }
      } catch (error) {
        // 忽略读取错误
      }
    }

    return sharedProjects;
  }

  private async findSharedConfigFiles(
    project: AggregatedProject,
    allProjects: AggregatedProject[]
  ): Promise<Array<{targetProject: AggregatedProject, configPath: string}>> {
    const sharedConfigs: Array<{targetProject: AggregatedProject, configPath: string}> = [];

    // 简化实现：检查是否有项目在同一父目录下共享.env文件
    const projectDir = project.directory;
    const parentDir = join(projectDir, '..');
    const sharedEnvPath = join(parentDir, '.env');

    if (existsSync(sharedEnvPath)) {
      for (const otherProject of allProjects) {
        if (otherProject.id !== project.id &&
            otherProject.directory.startsWith(parentDir)) {
          sharedConfigs.push({
            targetProject: otherProject,
            configPath: sharedEnvPath
          });
        }
      }
    }

    return sharedConfigs;
  }

  private estimateStartupTime(projectIds: string[], nodes: ProjectNode[]): number {
    // 根据项目类型估算启动时间
    let totalTime = 0;

    for (const projectId of projectIds) {
      const node = nodes.find(n => n.id === projectId);
      if (!node) continue;

      switch (node.type) {
        case 'backend':
          totalTime = Math.max(totalTime, 10); // 后端服务通常需要10秒
          break;
        case 'frontend':
          totalTime = Math.max(totalTime, 5);  // 前端应用通常需要5秒
          break;
        case 'fullstack':
          totalTime = Math.max(totalTime, 15); // 全栈应用需要更长时间
          break;
        default:
          totalTime = Math.max(totalTime, 3);  // 其他类型3秒
      }
    }

    return totalTime;
  }

  private generatePhaseDescription(phase: number, projectIds: string[], nodes: ProjectNode[]): string {
    const types = projectIds.map(id => {
      const node = nodes.find(n => n.id === id);
      return node?.type || 'unknown';
    });

    const typeCount = types.reduce((acc, type) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const descriptions = Object.entries(typeCount).map(([type, count]) => {
      const typeName = {
        'backend': '后端服务',
        'frontend': '前端应用',
        'fullstack': '全栈应用',
        'static': '静态站点',
        'mobile': '移动应用'
      }[type] || type;

      return count > 1 ? `${count}个${typeName}` : `${typeName}`;
    });

    return `第${phase}阶段: 启动${descriptions.join('、')}`;
  }
}
