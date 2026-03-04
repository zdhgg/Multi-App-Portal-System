import { join } from 'path'
import { existsSync } from 'fs'
import { AbstractDetector } from './AbstractDetector'
import { ITechStackDetector, UnifiedDetectionResult, DetectionOptions, TechStackAnalysisResult } from './IDetector'
import { v4 as uuidv4 } from 'uuid'

export class TechStackDetector extends AbstractDetector implements ITechStackDetector {
  public readonly name = 'tech-stack-detector'
  public readonly version = '1.0.0'
  public readonly supportedTypes: readonly string[] = ['techstack', 'tech-stack']

  async analyzeTechStack(directory: string, packageJson?: any): Promise<TechStackAnalysisResult> {
    const pj = packageJson ?? this.readPackageJson(directory)
    if (!pj) {
      return { techStack: 'unknown', category: 'fullstack', confidence: 0.2, reasoning: ['未找到package.json'], alternatives: [] }
    }

    const deps = new Set<string>([
      ...Object.keys(pj.dependencies || {}),
      ...Object.keys(pj.devDependencies || {})
    ])

    const reasoning: string[] = []
    const hasAny = (...names: string[]) => names.some(n => deps.has(n) || Array.from(deps).some(d => d.includes(n)))

    // 增强的前端框架检测
    if (hasAny('react', 'next')) {
      reasoning.push('检测到 React 相关依赖')
      let techStack = 'React'
      let confidence = 0.9

      if (hasAny('next')) {
        techStack = 'Next.js'
        reasoning.push('检测到 Next.js 框架')
      } else if (hasAny('react-scripts')) {
        techStack = 'Create React App'
        reasoning.push('检测到 Create React App')
      }

      return { techStack, category: 'frontend', confidence, reasoning, alternatives: [] }
    }

    if (hasAny('vue', 'nuxt')) {
      reasoning.push('检测到 Vue 相关依赖')
      let techStack = 'Vue'
      let confidence = 0.9

      if (hasAny('nuxt')) {
        techStack = 'Nuxt.js'
        reasoning.push('检测到 Nuxt.js 框架')
      } else if (hasAny('@vue/cli-service')) {
        techStack = 'Vue CLI'
        reasoning.push('检测到 Vue CLI')
      }

      return { techStack, category: 'frontend', confidence, reasoning, alternatives: [] }
    }

    if (hasAny('angular', '@angular/core')) {
      reasoning.push('检测到 Angular 相关依赖')
      return { techStack: 'Angular', category: 'frontend', confidence: 0.85, reasoning, alternatives: [] }
    }

    if (hasAny('svelte')) {
      reasoning.push('检测到 Svelte 相关依赖')
      return { techStack: 'Svelte', category: 'frontend', confidence: 0.85, reasoning, alternatives: [] }
    }

    // 增强的构建工具检测
    if (hasAny('vite', '@vitejs/plugin-vue', '@vitejs/plugin-react')) {
      reasoning.push('检测到 Vite 构建工具')
      return { techStack: 'Vite', category: 'frontend', confidence: 0.8, reasoning, alternatives: [] }
    }

    // 后端框架检测
    if (hasAny('express', 'koa', 'fastify', 'nestjs')) {
      reasoning.push('检测到 Node.js 后端框架依赖')
      let techStack = 'Node.js'

      if (hasAny('nestjs', '@nestjs/core')) {
        techStack = 'NestJS'
        reasoning.push('检测到 NestJS 框架')
      } else if (hasAny('fastify')) {
        techStack = 'Fastify'
        reasoning.push('检测到 Fastify 框架')
      } else if (hasAny('koa')) {
        techStack = 'Koa'
        reasoning.push('检测到 Koa 框架')
      } else if (hasAny('express')) {
        techStack = 'Express'
        reasoning.push('检测到 Express 框架')
      }

      return { techStack, category: 'backend', confidence: 0.85, reasoning, alternatives: [] }
    }

    // 配置文件检测增强
    const configFileDetection = this.detectByConfigFiles(directory, reasoning)
    if (configFileDetection) {
      return configFileDetection
    }

    reasoning.push('未匹配到常见技术栈')
    return { techStack: 'unknown', category: 'fullstack', confidence: 0.4, reasoning, alternatives: [] }
  }

  /**
   * 通过配置文件检测技术栈
   */
  private detectByConfigFiles(directory: string, reasoning: string[]): TechStackAnalysisResult | null {
    // Angular 检测
    if (existsSync(join(directory, 'angular.json'))) {
      reasoning.push('检测到 angular.json 配置文件')
      return { techStack: 'Angular', category: 'frontend', confidence: 0.9, reasoning, alternatives: [] }
    }

    // Next.js 检测
    if (existsSync(join(directory, 'next.config.js')) || existsSync(join(directory, 'next.config.mjs'))) {
      reasoning.push('检测到 Next.js 配置文件')
      return { techStack: 'Next.js', category: 'frontend', confidence: 0.9, reasoning, alternatives: [] }
    }

    // Nuxt.js 检测
    if (existsSync(join(directory, 'nuxt.config.js')) || existsSync(join(directory, 'nuxt.config.ts'))) {
      reasoning.push('检测到 Nuxt.js 配置文件')
      return { techStack: 'Nuxt.js', category: 'frontend', confidence: 0.9, reasoning, alternatives: [] }
    }

    // Vite 检测
    if (existsSync(join(directory, 'vite.config.js')) || existsSync(join(directory, 'vite.config.ts'))) {
      reasoning.push('检测到 Vite 配置文件')
      return { techStack: 'Vite', category: 'frontend', confidence: 0.85, reasoning, alternatives: [] }
    }

    // Vue CLI 检测
    if (existsSync(join(directory, 'vue.config.js'))) {
      reasoning.push('检测到 Vue CLI 配置文件')
      return { techStack: 'Vue CLI', category: 'frontend', confidence: 0.85, reasoning, alternatives: [] }
    }

    // Webpack 检测
    if (existsSync(join(directory, 'webpack.config.js'))) {
      reasoning.push('检测到 Webpack 配置文件')
      return { techStack: 'Webpack', category: 'frontend', confidence: 0.7, reasoning, alternatives: [] }
    }

    return null
  }

  getSupportedTechStacks(): readonly string[] {
    return [
      'React', 'Vue', 'Angular', 'Svelte',
      'Next.js', 'Nuxt.js', 'Create React App', 'Vue CLI',
      'Vite', 'Webpack',
      'Node.js', 'Express', 'Koa', 'Fastify', 'NestJS'
    ]
  }

  protected async performDetection(directory: string, options?: DetectionOptions): Promise<UnifiedDetectionResult> {
    const start = Date.now()
    const pj = this.readPackageJson(directory)
    const features = await this.extractFeatures(directory, pj)
    const analysis = await this.analyzeTechStack(directory, pj)

    const result: UnifiedDetectionResult = {
      id: uuidv4(),
      directory,
      techStack: analysis.techStack,
      appType: analysis.category === 'backend' ? 'backend' : 'frontend',
      confidence: analysis.confidence,
      features,
      issues: [],
      metadata: this.createMetadata([...analysis.reasoning], {
        dependency_match: analysis.confidence,
        config_match: features.configFiles.length ? 0.6 : 0.2,
        structure_match: features.directories.length ? 0.6 : 0.3,
        script_match: features.scripts.length ? 0.6 : 0.3
      }),
      createdAt: Math.floor(Date.now() / 1000)
    }

    const ms = Date.now() - start
    // Create a new result with updated detectionTime since metadata is readonly
    return {
      ...result,
      metadata: {
        ...result.metadata,
        detectionTime: ms
      }
    }
  }

  protected async checkAvailability(): Promise<boolean> {
    // 只要能访问文件系统即可认为可用
    try {
      return existsSync(process.cwd())
    } catch {
      return true
    }
  }
}

export default TechStackDetector
