/**
 * Enhanced Project Analyzer
 * 
 * 多维度项目分析器，提供更精确的项目类型检测和分类
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';

export interface ProjectAnalysisResult {
  dependencyScore: number;      // 依赖项分析得分
  structureScore: number;       // 目录结构分析得分
  scriptScore: number;          // 启动脚本分析得分
  configScore: number;          // 配置文件分析得分
  runtimeScore: number;         // 运行时特征分析得分
  finalClassification: 'frontend' | 'backend' | 'fullstack' | 'static';
  confidence: number;
  features: ProjectFeatures;
  issues: string[];
}

export interface ProjectFeatures {
  // 依赖特征
  hasReactComponents: boolean;
  hasVueComponents: boolean;
  hasAngularComponents: boolean;
  hasExpressServer: boolean;
  hasNestJSFeatures: boolean;
  hasFastifyFeatures: boolean;

  // 结构特征
  hasFrontendBuildTools: boolean;
  hasStaticAssets: boolean;
  hasFrontendRouting: boolean;
  hasServerCode: boolean;
  hasApiRoutes: boolean;
  hasDatabase: boolean;

  // 全栈项目特征
  isSeparatedFullstack: boolean;
  hasBackendDirectory: boolean;
  hasFrontendDirectory: boolean;

  // 文件类型分布
  jsFileCount: number;
  tsFileCount: number;
  vueFileCount: number;
  reactFileCount: number;
  htmlFileCount: number;
  cssFileCount: number;

  // 配置文件
  hasWebpackConfig: boolean;
  hasViteConfig: boolean;
  hasNextConfig: boolean;
  hasNuxtConfig: boolean;
  hasAngularConfig: boolean;

  // 脚本特征
  hasDevScript: boolean;
  hasBuildScript: boolean;
  hasStartScript: boolean;
  hasTestScript: boolean;
}

export class EnhancedProjectAnalyzer {
  
  async analyzeProject(directory: string): Promise<ProjectAnalysisResult> {
    logger.info('Starting enhanced project analysis', { directory });
    
    try {
      // 1. 深度依赖分析
      const dependencyAnalysis = await this.analyzeDependencyUsage(directory);
      
      // 2. 智能结构分析
      const structureAnalysis = await this.analyzeProjectStructure(directory);
      
      // 3. 脚本内容分析
      const scriptAnalysis = await this.analyzeScriptContent(directory);
      
      // 4. 配置文件深度分析
      const configAnalysis = await this.analyzeConfigFiles(directory);
      
      // 5. 运行时特征检测
      const runtimeAnalysis = await this.analyzeRuntimeFeatures(directory);
      
      // 合并所有特征
      const features = this.mergeFeatures([
        dependencyAnalysis.features,
        structureAnalysis.features,
        scriptAnalysis.features,
        configAnalysis.features,
        runtimeAnalysis.features
      ]);
      
      // 计算各维度得分
      const scores = {
        dependencyScore: dependencyAnalysis.score,
        structureScore: structureAnalysis.score,
        scriptScore: scriptAnalysis.score,
        configScore: configAnalysis.score,
        runtimeScore: runtimeAnalysis.score
      };
      
      // 计算最终分类和置信度
      const classification = this.calculateFinalClassification(features, scores);
      const confidence = this.calculateConfidence(features, scores, classification);
      
      const result: ProjectAnalysisResult = {
        ...scores,
        finalClassification: classification,
        confidence,
        features,
        issues: this.collectIssues([
          dependencyAnalysis.issues,
          structureAnalysis.issues,
          scriptAnalysis.issues,
          configAnalysis.issues,
          runtimeAnalysis.issues
        ])
      };
      
      logger.info('Enhanced project analysis completed', {
        directory,
        classification: result.finalClassification,
        confidence: result.confidence
      });
      
      return result;
      
    } catch (error) {
      logger.error('Enhanced project analysis failed', { directory, error });
      throw error;
    }
  }
  
  /**
   * 分析依赖项的实际使用情况
   */
  private async analyzeDependencyUsage(directory: string): Promise<{
    score: number;
    features: Partial<ProjectFeatures>;
    issues: string[];
  }> {
    const packageJsonPath = join(directory, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return { score: 0, features: {}, issues: ['No package.json found'] };
    }
    
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      const features: Partial<ProjectFeatures> = {};
      let score = 0;
      const issues: string[] = [];
      
      // React 检测
      if (allDeps.react) {
        features.hasReactComponents = await this.detectReactComponents(directory);
        if (features.hasReactComponents) score += 0.3;
      }
      
      // Vue 检测
      if (allDeps.vue) {
        features.hasVueComponents = await this.detectVueComponents(directory);
        if (features.hasVueComponents) score += 0.3;
      }
      
      // Angular 检测
      if (allDeps['@angular/core']) {
        features.hasAngularComponents = await this.detectAngularComponents(directory);
        if (features.hasAngularComponents) score += 0.3;
      }
      
      // Express 检测
      if (allDeps.express) {
        features.hasExpressServer = await this.detectExpressServer(directory);
        if (features.hasExpressServer) score += 0.3;
      }
      
      // NestJS 检测
      if (allDeps['@nestjs/core']) {
        features.hasNestJSFeatures = await this.detectNestJSFeatures(directory);
        if (features.hasNestJSFeatures) score += 0.3;
      }
      
      // Fastify 检测
      if (allDeps.fastify) {
        features.hasFastifyFeatures = await this.detectFastifyFeatures(directory);
        if (features.hasFastifyFeatures) score += 0.3;
      }
      
      return { score: Math.min(score, 1.0), features, issues };
      
    } catch (error) {
      return { score: 0, features: {}, issues: [`Failed to analyze dependencies: ${error}`] };
    }
  }
  
  /**
   * 分析项目结构和文件分布
   */
  private async analyzeProjectStructure(directory: string): Promise<{
    score: number;
    features: Partial<ProjectFeatures>;
    issues: string[];
  }> {
    try {
      const files = await this.getAllFiles(directory);
      const features: Partial<ProjectFeatures> = {};
      let score = 0;
      const issues: string[] = [];

      // 统计文件类型
      features.jsFileCount = files.filter(f => extname(f) === '.js').length;
      features.tsFileCount = files.filter(f => extname(f) === '.ts').length;
      features.vueFileCount = files.filter(f => extname(f) === '.vue').length;
      features.reactFileCount = files.filter(f => f.includes('.jsx') || f.includes('.tsx')).length;
      features.htmlFileCount = files.filter(f => extname(f) === '.html').length;
      features.cssFileCount = files.filter(f => ['.css', '.scss', '.sass', '.less'].includes(extname(f))).length;

      // 检测分离式全栈项目结构
      const fullstackStructure = await this.detectSeparatedFullstackStructure(directory);
      if (fullstackStructure.isFullstack) {
        features.isSeparatedFullstack = true;
        features.hasBackendDirectory = fullstackStructure.hasBackend;
        features.hasFrontendDirectory = fullstackStructure.hasFrontend;
        score += 0.4; // 分离式全栈项目高分
        issues.push(`检测到分离式全栈项目: backend=${fullstackStructure.hasBackend}, frontend=${fullstackStructure.hasFrontend}`);
      }

      // 检测静态资源
      features.hasStaticAssets = files.some(f =>
        f.includes('/assets/') || f.includes('/static/') || f.includes('/public/')
      );
      if (features.hasStaticAssets) score += 0.2;

      // 检测前端路由
      features.hasFrontendRouting = files.some(f =>
        f.includes('router') || f.includes('routes') && !f.includes('api')
      );
      if (features.hasFrontendRouting) score += 0.2;

      // 检测服务器代码
      features.hasServerCode = files.some(f =>
        basename(f).includes('server') || basename(f).includes('app.js') || basename(f).includes('index.js')
      );
      if (features.hasServerCode) score += 0.2;

      // 检测API路由
      features.hasApiRoutes = files.some(f =>
        f.includes('/api/') || f.includes('/routes/') || f.includes('controller')
      );
      if (features.hasApiRoutes) score += 0.2;

      // 检测数据库相关
      features.hasDatabase = files.some(f =>
        f.includes('model') || f.includes('schema') || f.includes('migration') || f.includes('database')
      );
      if (features.hasDatabase) score += 0.2;

      return { score: Math.min(score, 1.0), features, issues };

    } catch (error) {
      return { score: 0, features: {}, issues: [`Failed to analyze project structure: ${error}`] };
    }
  }
  
  /**
   * 获取目录下所有文件
   */
  private async getAllFiles(directory: string, maxDepth: number = 3): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dir: string, currentDepth: number) => {
      if (currentDepth > maxDepth) return;
      
      try {
        const entries = await readdir(dir);
        
        for (const entry of entries) {
          // 跳过常见的忽略目录
          if (['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'].includes(entry)) {
            continue;
          }
          
          const fullPath = join(dir, entry);
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            await scanDirectory(fullPath, currentDepth + 1);
          } else {
            files.push(fullPath.replace(directory, ''));
          }
        }
      } catch (error) {
        // 忽略权限错误等
      }
    };
    
    await scanDirectory(directory, 0);
    return files;
  }
  
  // 其他辅助方法将在下一个文件中继续实现...
  
  private mergeFeatures(featuresList: Partial<ProjectFeatures>[]): ProjectFeatures {
    const merged: ProjectFeatures = {
      hasReactComponents: false,
      hasVueComponents: false,
      hasAngularComponents: false,
      hasExpressServer: false,
      hasNestJSFeatures: false,
      hasFastifyFeatures: false,
      hasFrontendBuildTools: false,
      hasStaticAssets: false,
      hasFrontendRouting: false,
      hasServerCode: false,
      hasApiRoutes: false,
      hasDatabase: false,
      isSeparatedFullstack: false,
      hasBackendDirectory: false,
      hasFrontendDirectory: false,
      jsFileCount: 0,
      tsFileCount: 0,
      vueFileCount: 0,
      reactFileCount: 0,
      htmlFileCount: 0,
      cssFileCount: 0,
      hasWebpackConfig: false,
      hasViteConfig: false,
      hasNextConfig: false,
      hasNuxtConfig: false,
      hasAngularConfig: false,
      hasDevScript: false,
      hasBuildScript: false,
      hasStartScript: false,
      hasTestScript: false
    };

    // 合并所有特征
    for (const features of featuresList) {
      Object.assign(merged, features);
    }

    return merged;
  }
  
  private collectIssues(issuesList: string[][]): string[] {
    return issuesList.flat().filter(Boolean);
  }

  /**
   * 检测分离式全栈项目结构
   */
  private async detectSeparatedFullstackStructure(directory: string): Promise<{
    isFullstack: boolean;
    hasBackend: boolean;
    hasFrontend: boolean;
    backendPath?: string;
    frontendPath?: string;
  }> {
    try {
      const entries = await readdir(directory);

      // 检查是否有backend和frontend目录
      const backendDirs = entries.filter(entry =>
        ['backend', 'server', 'api', 'back-end'].includes(entry.toLowerCase())
      );
      const frontendDirs = entries.filter(entry =>
        ['frontend', 'client', 'web', 'front-end', 'ui'].includes(entry.toLowerCase())
      );

      let hasBackend = false;
      let hasFrontend = false;
      let backendPath: string | undefined;
      let frontendPath: string | undefined;

      // 验证backend目录
      for (const backendDir of backendDirs) {
        const backendFullPath = join(directory, backendDir);
        const backendStat = await stat(backendFullPath);
        if (backendStat.isDirectory()) {
          const hasBackendPackageJson = existsSync(join(backendFullPath, 'package.json'));
          if (hasBackendPackageJson) {
            // 检查是否是真正的后端项目
            const packageJson = JSON.parse(await readFile(join(backendFullPath, 'package.json'), 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            // 检查后端特征
            if (deps.express || deps.fastify || deps.koa || deps['@nestjs/core'] ||
                packageJson.scripts?.start || packageJson.scripts?.dev) {
              hasBackend = true;
              backendPath = backendFullPath;
              break;
            }
          }
        }
      }

      // 验证frontend目录
      for (const frontendDir of frontendDirs) {
        const frontendFullPath = join(directory, frontendDir);
        const frontendStat = await stat(frontendFullPath);
        if (frontendStat.isDirectory()) {
          const hasFrontendPackageJson = existsSync(join(frontendFullPath, 'package.json'));
          if (hasFrontendPackageJson) {
            // 检查是否是真正的前端项目
            const packageJson = JSON.parse(await readFile(join(frontendFullPath, 'package.json'), 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

            // 检查前端特征
            if (deps.vue || deps.react || deps['@angular/core'] || deps.vite || deps.webpack ||
                packageJson.scripts?.dev || packageJson.scripts?.build) {
              hasFrontend = true;
              frontendPath = frontendFullPath;
              break;
            }
          }
        }
      }

      const isFullstack = hasBackend && hasFrontend;

      return {
        isFullstack,
        hasBackend,
        hasFrontend,
        backendPath,
        frontendPath
      };

    } catch (error) {
      return {
        isFullstack: false,
        hasBackend: false,
        hasFrontend: false
      };
    }
  }
  
  /**
   * 检测React组件
   */
  private async detectReactComponents(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      return files.some(f =>
        (f.includes('.jsx') || f.includes('.tsx')) ||
        (f.includes('.js') || f.includes('.ts')) &&
        this.fileContainsReactPatterns(join(directory, f))
      );
    } catch {
      return false;
    }
  }

  /**
   * 检测Vue组件
   */
  private async detectVueComponents(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      return files.some(f => f.includes('.vue'));
    } catch {
      return false;
    }
  }

  /**
   * 检测Angular组件
   */
  private async detectAngularComponents(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      return files.some(f =>
        f.includes('.component.ts') ||
        f.includes('.service.ts') ||
        f.includes('.module.ts')
      );
    } catch {
      return false;
    }
  }

  /**
   * 检测Express服务器
   */
  private async detectExpressServer(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      for (const file of files) {
        if (file.includes('.js') || file.includes('.ts')) {
          const content = await this.readFileContent(join(directory, file));
          if (content.includes('express()') || content.includes('app.listen')) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 检测NestJS特征
   */
  private async detectNestJSFeatures(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      return files.some(f =>
        f.includes('.controller.ts') ||
        f.includes('.service.ts') ||
        f.includes('.module.ts')
      ) && existsSync(join(directory, 'nest-cli.json'));
    } catch {
      return false;
    }
  }

  /**
   * 检测Fastify特征
   */
  private async detectFastifyFeatures(directory: string): Promise<boolean> {
    try {
      const files = await this.getAllFiles(directory);
      for (const file of files) {
        if (file.includes('.js') || file.includes('.ts')) {
          const content = await this.readFileContent(join(directory, file));
          if (content.includes('fastify()') || content.includes('fastify.listen')) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 分析脚本内容
   */
  private async analyzeScriptContent(directory: string): Promise<{
    score: number;
    features: Partial<ProjectFeatures>;
    issues: string[];
  }> {
    const packageJsonPath = join(directory, 'package.json');
    if (!existsSync(packageJsonPath)) {
      return { score: 0, features: {}, issues: ['No package.json found'] };
    }

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      const features: Partial<ProjectFeatures> = {
        hasDevScript: !!scripts.dev || !!scripts.develop,
        hasBuildScript: !!scripts.build,
        hasStartScript: !!scripts.start,
        hasTestScript: !!scripts.test
      };

      let score = 0;
      if (features.hasDevScript) score += 0.25;
      if (features.hasBuildScript) score += 0.25;
      if (features.hasStartScript) score += 0.25;
      if (features.hasTestScript) score += 0.25;

      return { score, features, issues: [] };

    } catch (error) {
      return { score: 0, features: {}, issues: [`Failed to analyze scripts: ${error}`] };
    }
  }

  /**
   * 分析配置文件
   */
  private async analyzeConfigFiles(directory: string): Promise<{
    score: number;
    features: Partial<ProjectFeatures>;
    issues: string[];
  }> {
    const features: Partial<ProjectFeatures> = {
      hasWebpackConfig: existsSync(join(directory, 'webpack.config.js')),
      hasViteConfig: existsSync(join(directory, 'vite.config.js')) || existsSync(join(directory, 'vite.config.ts')),
      hasNextConfig: existsSync(join(directory, 'next.config.js')),
      hasNuxtConfig: existsSync(join(directory, 'nuxt.config.js')),
      hasAngularConfig: existsSync(join(directory, 'angular.json'))
    };

    let score = 0;
    Object.values(features).forEach(hasConfig => {
      if (hasConfig) score += 0.2;
    });

    return { score: Math.min(score, 1.0), features, issues: [] };
  }

  /**
   * 分析运行时特征
   */
  private async analyzeRuntimeFeatures(directory: string): Promise<{
    score: number;
    features: Partial<ProjectFeatures>;
    issues: string[];
  }> {
    // 这里可以添加更多运行时特征检测
    return { score: 0, features: {}, issues: [] };
  }

  /**
   * 计算最终分类
   */
  private calculateFinalClassification(
    features: ProjectFeatures,
    scores: any
  ): 'frontend' | 'backend' | 'fullstack' | 'static' {
    const frontendScore = this.calculateFrontendScore(features);
    const backendScore = this.calculateBackendScore(features);
    const fullstackScore = this.calculateFullstackScore(features);
    const staticScore = this.calculateStaticScore(features);

    const maxScore = Math.max(frontendScore, backendScore, fullstackScore, staticScore);

    if (maxScore === fullstackScore && fullstackScore > 0.6) return 'fullstack';
    if (maxScore === backendScore && backendScore > 0.5) return 'backend';
    if (maxScore === staticScore && staticScore > 0.7) return 'static';
    return 'frontend';
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
    features: ProjectFeatures,
    scores: any,
    classification: string
  ): number {
    const weights = {
      dependencyScore: 0.25,
      structureScore: 0.25,
      scriptScore: 0.20,
      configScore: 0.15,
      runtimeScore: 0.15
    };

    const weightedScore =
      scores.dependencyScore * weights.dependencyScore +
      scores.structureScore * weights.structureScore +
      scores.scriptScore * weights.scriptScore +
      scores.configScore * weights.configScore +
      scores.runtimeScore * weights.runtimeScore;

    return Math.min(Math.max(weightedScore, 0.1), 0.95);
  }

  // 辅助方法
  private async fileContainsReactPatterns(filePath: string): Promise<boolean> {
    try {
      const content = await this.readFileContent(filePath);
      return content.includes('React') || content.includes('jsx') || content.includes('useState');
    } catch {
      return false;
    }
  }

  private async readFileContent(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * 计算前端评分
   */
  private calculateFrontendScore(features: ProjectFeatures): number {
    let score = 0;

    // UI框架检测
    if (features.hasReactComponents) score += 0.3;
    if (features.hasVueComponents) score += 0.3;
    if (features.hasAngularComponents) score += 0.3;

    // 前端构建工具
    if (features.hasViteConfig || features.hasWebpackConfig) score += 0.2;

    // 静态资源
    if (features.hasStaticAssets) score += 0.15;

    // 前端路由
    if (features.hasFrontendRouting) score += 0.15;

    // 文件类型分布
    const totalFiles = features.jsFileCount + features.tsFileCount + features.vueFileCount + features.reactFileCount;
    if (totalFiles > 0) {
      const frontendFileRatio = (features.vueFileCount + features.reactFileCount + features.htmlFileCount + features.cssFileCount) / totalFiles;
      score += frontendFileRatio * 0.2;
    }

    // 排除后端特征
    if (features.hasServerCode) score -= 0.2;
    if (features.hasApiRoutes) score -= 0.2;
    if (features.hasDatabase) score -= 0.15;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算后端评分
   */
  private calculateBackendScore(features: ProjectFeatures): number {
    let score = 0;

    // 后端框架检测
    if (features.hasExpressServer) score += 0.3;
    if (features.hasNestJSFeatures) score += 0.3;
    if (features.hasFastifyFeatures) score += 0.3;

    // 服务器特征
    if (features.hasServerCode) score += 0.25;
    if (features.hasApiRoutes) score += 0.25;
    if (features.hasDatabase) score += 0.2;

    // 排除前端特征
    if (features.hasReactComponents || features.hasVueComponents || features.hasAngularComponents) {
      score -= 0.2;
    }
    if (features.hasStaticAssets) score -= 0.1;
    if (features.hasFrontendRouting) score -= 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * 计算全栈评分
   */
  private calculateFullstackScore(features: ProjectFeatures): number {
    const frontendScore = this.calculateFrontendScore(features);
    const backendScore = this.calculateBackendScore(features);

    // 全栈项目需要同时具备前端和后端特征
    if (frontendScore > 0.3 && backendScore > 0.3) {
      return (frontendScore + backendScore) / 2 + 0.1; // 全栈加分
    }

    // 检测全栈框架
    if (features.hasNextConfig || features.hasNuxtConfig) {
      return Math.max(0.7, (frontendScore + backendScore) / 2);
    }

    return 0;
  }

  /**
   * 计算静态网站评分
   */
  private calculateStaticScore(features: ProjectFeatures): number {
    let score = 0;

    // 静态网站特征
    if (features.htmlFileCount > 0) score += 0.3;
    if (features.cssFileCount > 0) score += 0.2;
    if (features.hasStaticAssets) score += 0.2;

    // 构建工具但无框架
    if ((features.hasWebpackConfig || features.hasViteConfig) &&
        !features.hasReactComponents && !features.hasVueComponents && !features.hasAngularComponents) {
      score += 0.3;
    }

    // 排除动态特征
    if (features.hasServerCode || features.hasApiRoutes || features.hasDatabase) {
      score -= 0.4;
    }

    return Math.max(0, Math.min(1, score));
  }
}
