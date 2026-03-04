/**
 * Build Template Service - 构建模板服务
 * 
 * 提供构建配置模板管理、预设配置、模板导入导出等功能
 * 支持常用框架的预设配置和自定义构建脚本
 */

import fs from 'fs/promises'
import path from 'path'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'

export interface BuildTemplate {
  id: string
  name: string
  description: string
  framework: string
  buildTool: string
  category: 'official' | 'community' | 'custom'
  config: BuildTemplateConfig
  environmentVariables: Record<string, string>
  buildScripts: Record<string, string>
  deploymentConfig: any
  tags: string[]
  version: string
  author: string
  createdAt: number
  updatedAt: number
  usageCount: number
  isActive: boolean
}

export interface BuildTemplateConfig {
  buildCommand: string
  outputDir: string
  publicPath?: string
  sourceMap?: boolean
  minify?: boolean
  target?: string
  mode?: 'development' | 'production'
  optimization?: {
    splitChunks?: boolean
    treeshaking?: boolean
    compression?: boolean
  }
  plugins?: Array<{
    name: string
    options: any
  }>
  customConfig?: any
}

export interface TemplatePreset {
  id: string
  name: string
  description: string
  framework: string
  buildTool: string
  template: Partial<BuildTemplate>
  isBuiltIn: boolean
}

export class BuildTemplateService {
  private templatesDir: string

  constructor(private db: Database, templatesBaseDir = './templates') {
    this.templatesDir = path.resolve(templatesBaseDir, 'build-templates')
    this.initializeTemplates()
  }

  /**
   * 初始化模板系统
   */
  private async initializeTemplates(): Promise<void> {
    try {
      await fs.mkdir(this.templatesDir, { recursive: true })
      
      // 创建模板表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS build_templates (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          framework TEXT NOT NULL,
          build_tool TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'custom',
          config TEXT NOT NULL,
          environment_variables TEXT,
          build_scripts TEXT,
          deployment_config TEXT,
          tags TEXT,
          version TEXT NOT NULL DEFAULT '1.0.0',
          author TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          usage_count INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_build_templates_framework ON build_templates (framework);
        CREATE INDEX IF NOT EXISTS idx_build_templates_build_tool ON build_templates (build_tool);
        CREATE INDEX IF NOT EXISTS idx_build_templates_category ON build_templates (category);
        CREATE INDEX IF NOT EXISTS idx_build_templates_is_active ON build_templates (is_active);
      `)

      // 初始化内置模板
      await this.initializeBuiltInTemplates()

      logger.debug('Build template service initialized', { templatesDir: this.templatesDir })
    } catch (error) {
      logger.error('Failed to initialize build templates', { error })
      throw error
    }
  }

  /**
   * 初始化内置模板
   */
  private async initializeBuiltInTemplates(): Promise<void> {
    const builtInTemplates = this.getBuiltInTemplates()
    
    for (const template of builtInTemplates) {
      try {
        const existing = await this.getTemplateById(template.id)
        if (!existing) {
          await this.createTemplate(template)
          logger.info('Built-in template created', { id: template.id, name: template.name })
        }
      } catch (error) {
        logger.warn('Failed to create built-in template', { id: template.id, error })
      }
    }
  }

  /**
   * 获取内置模板定义
   */
  private getBuiltInTemplates(): BuildTemplate[] {
    return [
      {
        id: 'react-vite-ts',
        name: 'React + Vite + TypeScript',
        description: 'Modern React application with Vite and TypeScript',
        framework: 'react',
        buildTool: 'vite',
        category: 'official',
        config: {
          buildCommand: 'npm run build',
          outputDir: 'dist',
          publicPath: '/',
          sourceMap: true,
          minify: true,
          target: 'es2015',
          mode: 'production',
          optimization: {
            splitChunks: true,
            treeshaking: true,
            compression: true
          }
        },
        environmentVariables: {
          NODE_ENV: 'production',
          VITE_APP_TITLE: 'React App'
        },
        buildScripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        },
        deploymentConfig: {
          type: 'spa',
          fallback: 'index.html'
        },
        tags: ['react', 'vite', 'typescript', 'spa'],
        version: '1.0.0',
        author: 'System',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        isActive: true
      },
      {
        id: 'vue3-vite-ts',
        name: 'Vue 3 + Vite + TypeScript',
        description: 'Vue 3 application with Composition API, Vite and TypeScript',
        framework: 'vue',
        buildTool: 'vite',
        category: 'official',
        config: {
          buildCommand: 'npm run build',
          outputDir: 'dist',
          publicPath: '/',
          sourceMap: true,
          minify: true,
          target: 'es2015',
          mode: 'production',
          optimization: {
            splitChunks: true,
            treeshaking: true,
            compression: true
          }
        },
        environmentVariables: {
          NODE_ENV: 'production',
          VITE_APP_TITLE: 'Vue App'
        },
        buildScripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        },
        deploymentConfig: {
          type: 'spa',
          fallback: 'index.html'
        },
        tags: ['vue', 'vue3', 'vite', 'typescript', 'spa'],
        version: '1.0.0',
        author: 'System',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        isActive: true
      },
      {
        id: 'nextjs-ts',
        name: 'Next.js + TypeScript',
        description: 'Next.js application with TypeScript and SSR support',
        framework: 'nextjs',
        buildTool: 'nextjs',
        category: 'official',
        config: {
          buildCommand: 'npm run build',
          outputDir: '.next',
          publicPath: '/',
          sourceMap: true,
          minify: true,
          target: 'es2015',
          mode: 'production',
          optimization: {
            splitChunks: true,
            treeshaking: true,
            compression: true
          }
        },
        environmentVariables: {
          NODE_ENV: 'production',
          NEXT_PUBLIC_APP_NAME: 'Next.js App'
        },
        buildScripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start'
        },
        deploymentConfig: {
          type: 'ssr',
          port: 3000
        },
        tags: ['nextjs', 'react', 'typescript', 'ssr'],
        version: '1.0.0',
        author: 'System',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        isActive: true
      },
      {
        id: 'angular-ts',
        name: 'Angular + TypeScript',
        description: 'Angular application with TypeScript and Angular CLI',
        framework: 'angular',
        buildTool: 'angular',
        category: 'official',
        config: {
          buildCommand: 'ng build --prod',
          outputDir: 'dist',
          publicPath: '/',
          sourceMap: false,
          minify: true,
          target: 'es2015',
          mode: 'production',
          optimization: {
            splitChunks: true,
            treeshaking: true,
            compression: true
          }
        },
        environmentVariables: {
          NODE_ENV: 'production'
        },
        buildScripts: {
          dev: 'ng serve',
          build: 'ng build --prod',
          test: 'ng test'
        },
        deploymentConfig: {
          type: 'spa',
          fallback: 'index.html'
        },
        tags: ['angular', 'typescript', 'spa'],
        version: '1.0.0',
        author: 'System',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0,
        isActive: true
      }
    ]
  }

  /**
   * 创建模板
   */
  async createTemplate(template: Omit<BuildTemplate, 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Date.now()
    const templateWithTimestamps = {
      ...template,
      createdAt: now,
      updatedAt: now
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO build_templates (
          id, name, description, framework, build_tool, category,
          config, environment_variables, build_scripts, deployment_config,
          tags, version, author, created_at, updated_at, usage_count, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        templateWithTimestamps.id,
        templateWithTimestamps.name,
        templateWithTimestamps.description,
        templateWithTimestamps.framework,
        templateWithTimestamps.buildTool,
        templateWithTimestamps.category,
        JSON.stringify(templateWithTimestamps.config),
        JSON.stringify(templateWithTimestamps.environmentVariables),
        JSON.stringify(templateWithTimestamps.buildScripts),
        JSON.stringify(templateWithTimestamps.deploymentConfig),
        JSON.stringify(templateWithTimestamps.tags),
        templateWithTimestamps.version,
        templateWithTimestamps.author,
        templateWithTimestamps.createdAt,
        templateWithTimestamps.updatedAt,
        templateWithTimestamps.usageCount,
        templateWithTimestamps.isActive ? 1 : 0
      )

      logger.info('Template created', { id: template.id, name: template.name })
      return template.id
    } catch (error) {
      logger.error('Failed to create template', { error })
      throw error
    }
  }

  /**
   * 获取模板列表
   */
  async getTemplates(filters?: {
    framework?: string
    buildTool?: string
    category?: string
    tags?: string[]
    isActive?: boolean
  }): Promise<BuildTemplate[]> {
    try {
      let query = 'SELECT * FROM build_templates WHERE 1=1'
      const params: any[] = []

      if (filters?.framework) {
        query += ' AND framework = ?'
        params.push(filters.framework)
      }

      if (filters?.buildTool) {
        query += ' AND build_tool = ?'
        params.push(filters.buildTool)
      }

      if (filters?.category) {
        query += ' AND category = ?'
        params.push(filters.category)
      }

      if (filters?.isActive !== undefined) {
        query += ' AND is_active = ?'
        params.push(filters.isActive ? 1 : 0)
      }

      query += ' ORDER BY usage_count DESC, created_at DESC'

      const stmt = this.db.prepare(query)
      const rows = stmt.all(...params) as any[]

      const templates = rows.map(row => this.mapRowToTemplate(row))

      // 如果有标签过滤，进一步筛选
      if (filters?.tags && filters.tags.length > 0) {
        return templates.filter(template => 
          filters.tags!.some(tag => template.tags.includes(tag))
        )
      }

      return templates
    } catch (error) {
      logger.error('Failed to get templates', { error })
      throw error
    }
  }

  /**
   * 根据ID获取模板
   */
  async getTemplateById(id: string): Promise<BuildTemplate | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM build_templates WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      return this.mapRowToTemplate(row)
    } catch (error) {
      logger.error('Failed to get template by id', { id, error })
      return null
    }
  }

  /**
   * 更新模板
   */
  async updateTemplate(id: string, updates: Partial<BuildTemplate>): Promise<void> {
    try {
      const existing = await this.getTemplateById(id)
      if (!existing) {
        throw new Error('Template not found')
      }

      const updatedTemplate = { ...existing, ...updates, updatedAt: Date.now() }

      const stmt = this.db.prepare(`
        UPDATE build_templates SET
          name = ?, description = ?, framework = ?, build_tool = ?, category = ?,
          config = ?, environment_variables = ?, build_scripts = ?, deployment_config = ?,
          tags = ?, version = ?, author = ?, updated_at = ?, is_active = ?
        WHERE id = ?
      `)

      stmt.run(
        updatedTemplate.name,
        updatedTemplate.description,
        updatedTemplate.framework,
        updatedTemplate.buildTool,
        updatedTemplate.category,
        JSON.stringify(updatedTemplate.config),
        JSON.stringify(updatedTemplate.environmentVariables),
        JSON.stringify(updatedTemplate.buildScripts),
        JSON.stringify(updatedTemplate.deploymentConfig),
        JSON.stringify(updatedTemplate.tags),
        updatedTemplate.version,
        updatedTemplate.author,
        updatedTemplate.updatedAt,
        updatedTemplate.isActive ? 1 : 0,
        id
      )

      logger.info('Template updated', { id, name: updatedTemplate.name })
    } catch (error) {
      logger.error('Failed to update template', { id, error })
      throw error
    }
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      const stmt = this.db.prepare('DELETE FROM build_templates WHERE id = ?')
      const result = stmt.run(id)

      if (result.changes === 0) {
        throw new Error('Template not found')
      }

      logger.info('Template deleted', { id })
    } catch (error) {
      logger.error('Failed to delete template', { id, error })
      throw error
    }
  }

  /**
   * 增加模板使用次数
   */
  async incrementUsageCount(id: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE build_templates SET usage_count = usage_count + 1 WHERE id = ?
      `)
      stmt.run(id)
    } catch (error) {
      logger.error('Failed to increment usage count', { id, error })
    }
  }

  /**
   * 导出模板
   */
  async exportTemplate(id: string): Promise<string> {
    try {
      const template = await this.getTemplateById(id)
      if (!template) {
        throw new Error('Template not found')
      }

      const exportData = {
        ...template,
        exportedAt: Date.now(),
        exportVersion: '1.0.0'
      }

      return JSON.stringify(exportData, null, 2)
    } catch (error) {
      logger.error('Failed to export template', { id, error })
      throw error
    }
  }

  /**
   * 导入模板
   */
  async importTemplate(templateData: string): Promise<string> {
    try {
      const data = JSON.parse(templateData)
      
      // 验证模板数据
      if (!data.id || !data.name || !data.framework || !data.buildTool) {
        throw new Error('Invalid template data')
      }

      // 生成新的ID以避免冲突
      const newId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const template: BuildTemplate = {
        ...data,
        id: newId,
        category: 'custom',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        usageCount: 0
      }

      await this.createTemplate(template)
      logger.info('Template imported', { id: newId, name: template.name })
      
      return newId
    } catch (error) {
      logger.error('Failed to import template', { error })
      throw error
    }
  }

  /**
   * 应用模板到项目
   */
  async applyTemplate(templateId: string, projectPath: string, variables?: Record<string, string>): Promise<void> {
    try {
      const template = await this.getTemplateById(templateId)
      if (!template) {
        throw new Error('Template not found')
      }

      // 增加使用次数
      await this.incrementUsageCount(templateId)

      // 应用环境变量
      if (template.environmentVariables) {
        await this.applyEnvironmentVariables(projectPath, template.environmentVariables, variables)
      }

      // 应用构建脚本
      if (template.buildScripts) {
        await this.applyBuildScripts(projectPath, template.buildScripts)
      }

      logger.info('Template applied', { templateId, projectPath })
    } catch (error) {
      logger.error('Failed to apply template', { templateId, error })
      throw error
    }
  }

  /**
   * 应用环境变量
   */
  private async applyEnvironmentVariables(
    projectPath: string,
    envVars: Record<string, string>,
    variables?: Record<string, string>
  ): Promise<void> {
    const envFilePath = path.join(projectPath, '.env')
    let envContent = ''

    // 替换变量
    for (const [key, value] of Object.entries(envVars)) {
      let finalValue = value
      if (variables) {
        for (const [varKey, varValue] of Object.entries(variables)) {
          finalValue = finalValue.replace(new RegExp(`\\$\\{${varKey}\\}`, 'g'), varValue)
        }
      }
      envContent += `${key}=${finalValue}\n`
    }

    await fs.writeFile(envFilePath, envContent)
  }

  /**
   * 应用构建脚本
   */
  private async applyBuildScripts(projectPath: string, buildScripts: Record<string, string>): Promise<void> {
    const packageJsonPath = path.join(projectPath, 'package.json')
    
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent)
      
      if (!packageJson.scripts) {
        packageJson.scripts = {}
      }

      // 合并构建脚本
      Object.assign(packageJson.scripts, buildScripts)

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
    } catch (error) {
      logger.warn('Failed to apply build scripts', { projectPath, error })
    }
  }

  /**
   * 映射数据库行到模板对象
   */
  private mapRowToTemplate(row: any): BuildTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      framework: row.framework,
      buildTool: row.build_tool,
      category: row.category,
      config: JSON.parse(row.config),
      environmentVariables: JSON.parse(row.environment_variables || '{}'),
      buildScripts: JSON.parse(row.build_scripts || '{}'),
      deploymentConfig: JSON.parse(row.deployment_config || '{}'),
      tags: JSON.parse(row.tags || '[]'),
      version: row.version,
      author: row.author,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      usageCount: row.usage_count,
      isActive: row.is_active === 1
    }
  }
}
