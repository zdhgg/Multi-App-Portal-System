/**
 * 增强型全栈项目检测器
 * 解决分离式全栈项目（如 frontend + backend 目录）识别问题
 * 
 * Refactored to use Async I/O for performance optimization
 */

import { join, basename } from 'path';
import { access, readdir, stat, readFile } from 'fs/promises';
import { constants } from 'fs';
import { logger } from '../utils/logger';

export interface FullStackProject {
  id: string;
  name: string;
  directory: string;
  type: 'separated_fullstack' | 'monorepo_fullstack' | 'nested_fullstack';
  backend: SubProject;
  frontend: SubProject;
  confidence: number;
  metadata?: {
    rootPackageJson?: any;
    workspaces?: string[];
    detectionReason: string;
  };
}

export interface SubProject {
  name: string;
  directory: string;
  techStack: string;
  packageJson?: any;
  configFiles: string[];
  ports: number[];
  isValid: boolean;
}

export interface DetectionOptions {
  minConfidence: number;
  maxDepth: number;
  includeNodeModules: boolean;
  customPatterns?: {
    backend: string[];
    frontend: string[];
  };
}

export class EnhancedFullStackDetector {
  private readonly defaultOptions: DetectionOptions = {
    minConfidence: 0.6,
    maxDepth: 3,
    includeNodeModules: false,
    customPatterns: {
      backend: ['backend', 'api', 'server', 'services', 'app'],
      frontend: ['frontend', 'client', 'web', 'ui', 'app-ui', 'portal']
    }
  };

  /**
   * 检测全栈项目
   */
  async detectFullStackProjects(
    rootDirectory: string, 
    options?: Partial<DetectionOptions>
  ): Promise<FullStackProject[]> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();
    
    logger.info('开始全栈项目检测 (Async)', { 
      rootDirectory, 
      options: opts 
    });

    try {
      const projects: FullStackProject[] = [];
      
      // 1. 检测分离式全栈项目（frontend + backend 目录）
      const separatedProjects = await this.detectSeparatedFullStack(rootDirectory, opts);
      projects.push(...separatedProjects);
      
      // 2. 检测单体全栈项目（monorepo 风格）
      const monorepoProjects = await this.detectMonorepoFullStack(rootDirectory, opts);
      projects.push(...monorepoProjects);
      
      // 3. 检测嵌套全栈项目
      const nestedProjects = await this.detectNestedFullStack(rootDirectory, opts);
      projects.push(...nestedProjects);

      // 过滤低置信度项目
      const validProjects = projects.filter(p => p.confidence >= opts.minConfidence);
      
      const duration = Date.now() - startTime;
      logger.info('全栈项目检测完成', {
        rootDirectory,
        totalFound: projects.length,
        validProjects: validProjects.length,
        duration: `${duration}ms`
      });

      return validProjects;
      
    } catch (error) {
      logger.error('全栈项目检测失败', { rootDirectory, error });
      return [];
    }
  }

  /**
   * 检测分离式全栈项目（最常见的情况）
   */
  private async detectSeparatedFullStack(
    directory: string, 
    options: DetectionOptions
  ): Promise<FullStackProject[]> {
    if (!(await this.exists(directory))) return [];

    try {
      const subDirs = await this.getSubDirectories(directory);
      const projects: FullStackProject[] = [];
      
      // 查找后端目录
      const backendDirs = subDirs.filter(dir => 
        this.matchesPattern(dir, options.customPatterns!.backend)
      );
      
      // 查找前端目录  
      const frontendDirs = subDirs.filter(dir =>
        this.matchesPattern(dir, options.customPatterns!.frontend)
      );

      if (backendDirs.length === 0 || frontendDirs.length === 0) {
        return [];
      }

      // 尝试每个后端和前端目录的组合
      for (const backendDir of backendDirs) {
        for (const frontendDir of frontendDirs) {
          const backendPath = join(directory, backendDir);
          const frontendPath = join(directory, frontendDir);

          // 验证是否为有效的Web应用
          const backendProject = await this.validateAsWebApp(backendPath, 'backend');
          const frontendProject = await this.validateAsWebApp(frontendPath, 'frontend');

          if (backendProject.isValid && frontendProject.isValid) {
            // 读取根目录的 package.json（如果存在）
            const rootPackageJsonPath = join(directory, 'package.json');
            let rootPackageJson = null;
            try {
              if (await this.exists(rootPackageJsonPath)) {
                const content = await readFile(rootPackageJsonPath, 'utf-8');
                rootPackageJson = JSON.parse(content);
              }
            } catch (e) {
              // 忽略解析错误
            }

            const project: FullStackProject = {
              id: `fullstack_${basename(directory)}_${Date.now()}`,
              name: rootPackageJson?.name || basename(directory),
              directory,
              type: 'separated_fullstack',
              backend: backendProject,
              frontend: frontendProject,
              confidence: this.calculateSeparatedConfidence(
                backendProject, 
                frontendProject, 
                rootPackageJson
              ),
              metadata: {
                rootPackageJson,
                detectionReason: `分离式全栈：${backendDir} + ${frontendDir}`
              }
            };

            projects.push(project);
          }
        }
      }

      return projects;
      
    } catch (error) {
      logger.error('分离式全栈检测失败', { directory, error });
      return [];
    }
  }

  /**
   * 检测 Monorepo 风格全栈项目
   */
  private async detectMonorepoFullStack(
    directory: string, 
    options: DetectionOptions
  ): Promise<FullStackProject[]> {
    if (!(await this.exists(directory))) return [];

    try {
      const packageJsonPath = join(directory, 'package.json');
      if (!(await this.exists(packageJsonPath))) return [];

      const content = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(content);
      
      // 检查是否有 workspaces 或 packages 配置
      if (!packageJson.workspaces && !packageJson.packages) return [];

      const workspaces = packageJson.workspaces || packageJson.packages || [];
      const projects: FullStackProject[] = [];
      
      // 解析 workspace 路径
      const workspacePaths = await this.resolveWorkspacePaths(directory, workspaces);
      
      // 按技术栈类型分组
      const backendWorkspaces: SubProject[] = [];
      const frontendWorkspaces: SubProject[] = [];
      
      for (const workspacePath of workspacePaths) {
        const subProject = await this.validateAsWebApp(workspacePath);
        if (subProject.isValid) {
          if (this.isBackendTechStack(subProject.techStack)) {
            backendWorkspaces.push(subProject);
          } else if (this.isFrontendTechStack(subProject.techStack)) {
            frontendWorkspaces.push(subProject);
          }
        }
      }

      // 如果找到了前端和后端工作区
      if (backendWorkspaces.length > 0 && frontendWorkspaces.length > 0) {
        const project: FullStackProject = {
          id: `monorepo_${basename(directory)}_${Date.now()}`,
          name: packageJson.name || basename(directory),
          directory,
          type: 'monorepo_fullstack',
          backend: backendWorkspaces[0], // 取第一个后端项目
          frontend: frontendWorkspaces[0], // 取第一个前端项目
          confidence: this.calculateMonorepoConfidence(backendWorkspaces, frontendWorkspaces),
          metadata: {
            rootPackageJson: packageJson,
            workspaces: workspacePaths,
            detectionReason: `Monorepo 全栈：${backendWorkspaces.length} 后端 + ${frontendWorkspaces.length} 前端`
          }
        };

        projects.push(project);
      }

      return projects;
      
    } catch (error) {
      logger.error('Monorepo全栈检测失败', { directory, error });
      return [];
    }
  }

  /**
   * 检测嵌套全栈项目
   */
  private async detectNestedFullStack(
    directory: string, 
    options: DetectionOptions
  ): Promise<FullStackProject[]> {
    // 递归检测子目录中的全栈项目
    const projects: FullStackProject[] = [];
    
    if (options.maxDepth <= 0) return projects;

    try {
      const subDirs = await this.getSubDirectories(directory);
      
      for (const subDir of subDirs) {
        if (options.includeNodeModules || subDir !== 'node_modules') {
          const subPath = join(directory, subDir);
          const nestedOptions = { ...options, maxDepth: options.maxDepth - 1 };
          
          const nestedProjects = await this.detectFullStackProjects(subPath, nestedOptions);
          projects.push(...nestedProjects);
        }
      }
      
    } catch (error) {
      logger.error('嵌套全栈检测失败', { directory, error });
    }

    return projects;
  }

  /**
   * 验证目录是否为有效的Web应用
   */
  private async validateAsWebApp(
    directory: string, 
    expectedType?: 'frontend' | 'backend'
  ): Promise<SubProject> {
    const result: SubProject = {
      name: basename(directory),
      directory,
      techStack: 'unknown',
      configFiles: [],
      ports: [],
      isValid: false
    };

    if (!(await this.exists(directory))) {
      return result;
    }

    try {
      // 检查 package.json
      const packageJsonPath = join(directory, 'package.json');
      if (await this.exists(packageJsonPath)) {
        const content = await readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(content);
        result.packageJson = packageJson;
        result.name = packageJson.name || result.name;

        // 分析技术栈
        result.techStack = this.analyzeTechStack(packageJson, directory);
        
        // 提取端口配置
        result.ports = this.extractPortsFromPackage(packageJson);
      }

      // 收集配置文件
      result.configFiles = await this.collectConfigFiles(directory);

      // 验证是否为Web应用
      result.isValid = this.isValidWebApp(result, expectedType);

      return result;
      
    } catch (error) {
      logger.error('Web应用验证失败', { directory, error });
      return result;
    }
  }

  /**
   * 分析技术栈
   */
  private analyzeTechStack(packageJson: any, directory: string): string {
    const dependencies = { 
      ...packageJson.dependencies, 
      ...packageJson.devDependencies 
    };

    // React 生态系统
    if (dependencies['react'] || dependencies['next']) {
      if (dependencies['next']) return 'Next.js';
      return 'React';
    }

    // Vue 生态系统
    if (dependencies['vue'] || dependencies['nuxt']) {
      if (dependencies['nuxt']) return 'Nuxt.js';
      return 'Vue';
    }

    // Angular
    if (dependencies['@angular/core']) {
      return 'Angular';
    }

    // Svelte
    if (dependencies['svelte']) {
      return 'Svelte';
    }

    // 后端框架
    if (dependencies['express']) return 'Express';
    if (dependencies['koa']) return 'Koa';
    if (dependencies['fastify']) return 'Fastify';
    if (dependencies['@nestjs/core']) return 'NestJS';

    // 构建工具
    if (dependencies['vite'] || dependencies['@vitejs/plugin-vue'] || dependencies['@vitejs/plugin-react']) {
      return 'Vite';
    }

    // 通用Node.js
    if (packageJson.scripts?.start || packageJson.scripts?.dev) {
      return 'Node.js';
    }

    return 'unknown';
  }

  /**
   * 从 package.json 提取端口配置
   */
  private extractPortsFromPackage(packageJson: any): number[] {
    const ports: number[] = [];
    
    if (packageJson.scripts) {
      for (const script of Object.values(packageJson.scripts) as string[]) {
        const scriptPorts = this.extractPortsFromCommand(script);
        ports.push(...scriptPorts);
      }
    }

    // 从配置字段提取
    if (packageJson.config) {
      const configPorts = this.extractPortsFromObject(packageJson.config);
      ports.push(...configPorts);
    }

    return [...new Set(ports)]; // 去重
  }

  /**
   * 从命令字符串提取端口
   */
  private extractPortsFromCommand(command: string): number[] {
    const ports: number[] = [];
    const patterns = [
      /--port[\s=]+(\d+)/gi,
      /-p[\s=]+(\d+)/gi,
      /PORT[\s=]+(\d+)/gi,
      /localhost:(\d+)/gi,
      /:(\d{4,5})\b/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const port = parseInt(match[1]);
        if (port >= 1000 && port <= 65535) {
          ports.push(port);
        }
      }
    });

    return ports;
  }

  /**
   * 从对象中提取端口
   */
  private extractPortsFromObject(obj: any): number[] {
    const ports: number[] = [];
    
    const traverse = (item: any) => {
      if (typeof item === 'number' && item >= 1000 && item <= 65535) {
        ports.push(item);
      } else if (typeof item === 'object' && item !== null) {
        for (const value of Object.values(item)) {
          traverse(value);
        }
      }
    };

    traverse(obj);
    return ports;
  }

  /**
   * 收集配置文件
   */
  private async collectConfigFiles(directory: string): Promise<string[]> {
    const configFiles = [
      'vite.config.js', 'vite.config.ts', 'vite.config.mjs',
      'next.config.js', 'next.config.ts', 'next.config.mjs',
      'vue.config.js', 'vue.config.ts',
      'angular.json', 'ng-package.json',
      'svelte.config.js', 'svelte.config.ts',
      'webpack.config.js', 'webpack.config.ts',
      'rollup.config.js', 'rollup.config.ts'
    ];

    const foundFiles: string[] = [];
    for (const file of configFiles) {
      if (await this.exists(join(directory, file))) {
        foundFiles.push(file);
      }
    }
    return foundFiles;
  }

  /**
   * 验证是否为有效Web应用
   */
  private isValidWebApp(project: SubProject, expectedType?: 'frontend' | 'backend'): boolean {
    // 必须有 package.json
    if (!project.packageJson) return false;

    // 技术栈不能为 unknown
    if (project.techStack === 'unknown') return false;

    // 如果指定了期望类型，需要匹配
    if (expectedType === 'frontend' && !this.isFrontendTechStack(project.techStack)) {
      return false;
    }
    
    if (expectedType === 'backend' && !this.isBackendTechStack(project.techStack)) {
      return false;
    }

    // 必须有启动脚本
    const scripts = project.packageJson.scripts || {};
    if (!scripts.start && !scripts.dev && !scripts.serve) {
      return false;
    }

    return true;
  }

  /**
   * 判断是否为前端技术栈
   */
  private isFrontendTechStack(techStack: string): boolean {
    const frontendStacks = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt.js', 'Vite'];
    return frontendStacks.includes(techStack);
  }

  /**
   * 判断是否为后端技术栈
   */
  private isBackendTechStack(techStack: string): boolean {
    const backendStacks = ['Express', 'Koa', 'Fastify', 'NestJS', 'Node.js'];
    return backendStacks.includes(techStack);
  }

  /**
   * 计算分离式全栈项目的置信度
   */
  private calculateSeparatedConfidence(
    backend: SubProject, 
    frontend: SubProject, 
    rootPackageJson?: any
  ): number {
    let confidence = 0.7; // 基础分数

    // 技术栈匹配度
    if (this.isBackendTechStack(backend.techStack)) confidence += 0.1;
    if (this.isFrontendTechStack(frontend.techStack)) confidence += 0.1;

    // 配置文件完整度
    if (backend.configFiles.length > 0) confidence += 0.05;
    if (frontend.configFiles.length > 0) confidence += 0.05;

    // 根目录有配置
    if (rootPackageJson) confidence += 0.1;

    // 端口配置
    if (backend.ports.length > 0) confidence += 0.05;
    if (frontend.ports.length > 0) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  /**
   * 计算 Monorepo 全栈项目的置信度
   */
  private calculateMonorepoConfidence(
    backendWorkspaces: SubProject[], 
    frontendWorkspaces: SubProject[]
  ): number {
    let confidence = 0.8; // Monorepo 基础分数更高

    // 项目数量平衡度
    const ratio = Math.min(backendWorkspaces.length, frontendWorkspaces.length) / 
                  Math.max(backendWorkspaces.length, frontendWorkspaces.length);
    confidence += ratio * 0.15;

    // 技术栈多样性
    const backendStacks = new Set(backendWorkspaces.map(p => p.techStack));
    const frontendStacks = new Set(frontendWorkspaces.map(p => p.techStack));
    
    if (backendStacks.size > 1 || frontendStacks.size > 1) {
      confidence += 0.05; // 多样性加分
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * 获取子目录列表
   */
  private async getSubDirectories(directory: string): Promise<string[]> {
    try {
      const files = await readdir(directory);
      const dirs: string[] = [];
      
      for (const file of files) {
        const fullPath = join(directory, file);
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          dirs.push(file);
        }
      }
      return dirs;
    } catch (error) {
      logger.warn('读取子目录失败', { directory, error });
      return [];
    }
  }

  /**
   * 检查目录名是否匹配模式
   */
  private matchesPattern(dirName: string, patterns: string[]): boolean {
    const lowerDirName = dirName.toLowerCase();
    return patterns.some(pattern => 
      lowerDirName.includes(pattern.toLowerCase()) ||
      pattern.toLowerCase().includes(lowerDirName)
    );
  }

  /**
   * 解析 workspace 路径
   */
  private async resolveWorkspacePaths(rootDir: string, workspaces: string[]): Promise<string[]> {
    const paths: string[] = [];
    
    for (const workspace of workspaces) {
      // 简单处理，不支持 glob (如 packages/*)
      // 如果需要支持 glob，需要引入 fast-glob 或类似库
      // 这里假设 workspace 是具体路径
      const workspacePath = join(rootDir, workspace);
      if (await this.exists(workspacePath)) {
        paths.push(workspacePath);
      }
    }
    
    return paths;
  }

  /**
   * 辅助方法：检查文件是否存在
   */
  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

// 导出单例实例
export const enhancedFullStackDetector = new EnhancedFullStackDetector();