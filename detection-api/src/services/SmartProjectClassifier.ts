/**
 * Smart Project Classifier
 * 
 * 智能项目分类器，使用加权评分系统替代简单字符串匹配
 */

import { logger } from '../utils/logger.js';
import { ProjectFeatures, ProjectAnalysisResult } from './EnhancedProjectAnalyzer';

export interface ProjectClassification {
  classification: 'frontend' | 'backend' | 'fullstack' | 'static';
  confidence: number;
  scores: ClassificationScores;
  reasoning: string[];
}

export interface ClassificationScores {
  frontend: number;
  backend: number;
  fullstack: number;
  static: number;
}

export class SmartProjectClassifier {
  
  /**
   * 对项目进行智能分类
   */
  classifyProject(analysisResult: ProjectAnalysisResult): ProjectClassification {
    logger.info('Starting smart project classification', {
      features: this.summarizeFeatures(analysisResult.features)
    });
    
    const scores = this.calculateAllScores(analysisResult.features);
    const classification = this.selectBestClassification(scores);
    const confidence = this.calculateClassificationConfidence(scores, classification, analysisResult);
    const reasoning = this.generateReasoning(scores, classification, analysisResult.features);
    
    const result: ProjectClassification = {
      classification,
      confidence,
      scores,
      reasoning
    };
    
    logger.info('Smart classification completed', {
      classification: result.classification,
      confidence: result.confidence,
      scores: result.scores
    });
    
    return result;
  }
  
  /**
   * 计算所有分类的评分
   */
  private calculateAllScores(features: ProjectFeatures): ClassificationScores {
    return {
      frontend: this.calculateFrontendScore(features),
      backend: this.calculateBackendScore(features),
      fullstack: this.calculateFullstackScore(features),
      static: this.calculateStaticScore(features)
    };
  }
  
  /**
   * 选择最佳分类
   */
  private selectBestClassification(scores: ClassificationScores): 'frontend' | 'backend' | 'fullstack' | 'static' {
    const entries = Object.entries(scores) as [keyof ClassificationScores, number][];
    const sortedEntries = entries.sort((a, b) => b[1] - a[1]);
    
    const [bestType, bestScore] = sortedEntries[0];
    const [secondType, secondScore] = sortedEntries[1] || ['', 0];
    
    // 如果最高分和第二高分差距很小，需要特殊处理
    if (bestScore - secondScore < 0.1 && bestScore > 0.4) {
      // 优先选择全栈，因为它通常更准确
      if (bestType === 'fullstack' || secondType === 'fullstack') {
        return 'fullstack';
      }
    }
    
    // 设置最低阈值
    if (bestScore < 0.3) {
      return 'frontend'; // 默认分类
    }
    
    return bestType;
  }
  
  /**
   * 计算分类置信度
   */
  private calculateClassificationConfidence(
    scores: ClassificationScores, 
    classification: string,
    analysisResult: ProjectAnalysisResult
  ): number {
    const selectedScore = scores[classification as keyof ClassificationScores];
    const maxScore = Math.max(...Object.values(scores));
    const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
    
    // 基础置信度基于选中分类的得分
    let confidence = selectedScore;
    
    // 如果选中的分类明显高于其他分类，增加置信度
    if (selectedScore > avgScore + 0.2) {
      confidence += 0.1;
    }
    
    // 如果选中的分类是最高分，增加置信度
    if (selectedScore === maxScore) {
      confidence += 0.05;
    }
    
    // 结合原始分析结果的置信度
    confidence = (confidence + analysisResult.confidence) / 2;
    
    return Math.min(Math.max(confidence, 0.1), 0.95);
  }
  
  /**
   * 生成分类推理过程
   */
  private generateReasoning(
    scores: ClassificationScores, 
    classification: string, 
    features: ProjectFeatures
  ): string[] {
    const reasoning: string[] = [];
    const selectedScore = scores[classification as keyof ClassificationScores];
    
    reasoning.push(`选择 ${classification} 分类，得分: ${selectedScore.toFixed(2)}`);
    
    // 根据特征生成推理
    if (classification === 'frontend') {
      if (features.hasReactComponents) reasoning.push('检测到 React 组件');
      if (features.hasVueComponents) reasoning.push('检测到 Vue 组件');
      if (features.hasAngularComponents) reasoning.push('检测到 Angular 组件');
      if (features.hasStaticAssets) reasoning.push('包含静态资源');
      if (features.hasFrontendRouting) reasoning.push('包含前端路由');
    }
    
    if (classification === 'backend') {
      if (features.hasExpressServer) reasoning.push('检测到 Express 服务器');
      if (features.hasNestJSFeatures) reasoning.push('检测到 NestJS 特征');
      if (features.hasFastifyFeatures) reasoning.push('检测到 Fastify 特征');
      if (features.hasApiRoutes) reasoning.push('包含 API 路由');
      if (features.hasDatabase) reasoning.push('包含数据库相关代码');
    }
    
    if (classification === 'fullstack') {
      if (features.isSeparatedFullstack) {
        reasoning.push('检测到分离式全栈项目结构');
        if (features.hasBackendDirectory) reasoning.push('包含独立的后端目录');
        if (features.hasFrontendDirectory) reasoning.push('包含独立的前端目录');
      } else {
        reasoning.push('同时具备前端和后端特征');
      }
      if (features.hasNextConfig) reasoning.push('检测到 Next.js 配置');
      if (features.hasNuxtConfig) reasoning.push('检测到 Nuxt.js 配置');
    }
    
    if (classification === 'static') {
      if (features.htmlFileCount > 0) reasoning.push(`包含 ${features.htmlFileCount} 个 HTML 文件`);
      if (features.cssFileCount > 0) reasoning.push(`包含 ${features.cssFileCount} 个 CSS 文件`);
      if (features.hasStaticAssets) reasoning.push('包含静态资源');
    }
    
    return reasoning;
  }
  
  /**
   * 计算前端评分
   */
  private calculateFrontendScore(features: ProjectFeatures): number {
    let score = 0;
    
    // UI框架检测 (权重最高)
    if (features.hasReactComponents) score += 0.35;
    if (features.hasVueComponents) score += 0.35;
    if (features.hasAngularComponents) score += 0.35;
    
    // 前端构建工具
    if (features.hasViteConfig) score += 0.15;
    if (features.hasWebpackConfig) score += 0.15;
    
    // 静态资源和路由
    if (features.hasStaticAssets) score += 0.1;
    if (features.hasFrontendRouting) score += 0.1;
    
    // 文件类型分布
    const totalFiles = features.jsFileCount + features.tsFileCount + features.vueFileCount + features.reactFileCount;
    if (totalFiles > 0) {
      const frontendFileRatio = (features.vueFileCount + features.reactFileCount + features.htmlFileCount + features.cssFileCount) / totalFiles;
      score += frontendFileRatio * 0.15;
    }
    
    // 脚本特征
    if (features.hasDevScript && features.hasBuildScript) score += 0.1;
    
    // 排除后端特征 (负分)
    if (features.hasServerCode) score -= 0.25;
    if (features.hasApiRoutes) score -= 0.2;
    if (features.hasDatabase) score -= 0.15;
    if (features.hasExpressServer || features.hasNestJSFeatures || features.hasFastifyFeatures) {
      score -= 0.3;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * 计算后端评分
   */
  private calculateBackendScore(features: ProjectFeatures): number {
    let score = 0;
    
    // 后端框架检测 (权重最高)
    if (features.hasExpressServer) score += 0.4;
    if (features.hasNestJSFeatures) score += 0.4;
    if (features.hasFastifyFeatures) score += 0.4;
    
    // 服务器特征
    if (features.hasServerCode) score += 0.2;
    if (features.hasApiRoutes) score += 0.2;
    if (features.hasDatabase) score += 0.15;
    
    // 脚本特征
    if (features.hasStartScript) score += 0.1;
    
    // 排除前端特征 (负分)
    if (features.hasReactComponents || features.hasVueComponents || features.hasAngularComponents) {
      score -= 0.3;
    }
    if (features.hasStaticAssets) score -= 0.1;
    if (features.hasFrontendRouting) score -= 0.1;
    if (features.hasViteConfig || features.hasWebpackConfig) score -= 0.15;
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * 计算全栈评分
   */
  private calculateFullstackScore(features: ProjectFeatures): number {
    let score = 0;

    // 分离式全栈项目 - 最高优先级
    if (features.isSeparatedFullstack) {
      score = 0.9; // 分离式全栈项目直接高分
      if (features.hasBackendDirectory && features.hasFrontendDirectory) {
        score = 0.95; // 完整的分离式全栈项目
      }
      return score;
    }

    // 全栈框架 - 高优先级
    if (features.hasNextConfig || features.hasNuxtConfig) {
      return 0.85;
    }

    // 传统全栈检测 - 同一项目中包含前后端特征
    const frontendScore = this.calculateFrontendScore(features);
    const backendScore = this.calculateBackendScore(features);

    // 需要同时具备前端和后端特征
    if (frontendScore > 0.3 && backendScore > 0.3) {
      return Math.min((frontendScore + backendScore) / 2 + 0.15, 0.85); // 全栈加分
    }

    // 如果只有一方面特征很强，但另一方面也有一些特征
    if ((frontendScore > 0.5 && backendScore > 0.1) || (backendScore > 0.5 && frontendScore > 0.1)) {
      return (frontendScore + backendScore) / 2;
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
      score += 0.25;
    }
    
    // 只有基础脚本
    if (features.hasBuildScript && !features.hasDevScript) score += 0.1;
    
    // 排除动态特征 (负分)
    if (features.hasServerCode || features.hasApiRoutes || features.hasDatabase) {
      score -= 0.5;
    }
    if (features.hasReactComponents || features.hasVueComponents || features.hasAngularComponents) {
      score -= 0.3;
    }
    
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * 总结特征用于日志
   */
  private summarizeFeatures(features: ProjectFeatures): any {
    return {
      frameworks: {
        react: features.hasReactComponents,
        vue: features.hasVueComponents,
        angular: features.hasAngularComponents,
        express: features.hasExpressServer,
        nestjs: features.hasNestJSFeatures,
        fastify: features.hasFastifyFeatures
      },
      files: {
        js: features.jsFileCount,
        ts: features.tsFileCount,
        vue: features.vueFileCount,
        react: features.reactFileCount,
        html: features.htmlFileCount,
        css: features.cssFileCount
      },
      features: {
        staticAssets: features.hasStaticAssets,
        apiRoutes: features.hasApiRoutes,
        database: features.hasDatabase,
        frontendRouting: features.hasFrontendRouting
      }
    };
  }
}
