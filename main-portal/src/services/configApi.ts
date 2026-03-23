import { apiService as api } from './api'

export interface TechStackConfig {
  icon: string
  displayName: string
  color: string
  tagType: 'primary' | 'success' | 'info' | 'warning' | 'danger'
  category: string
}

export interface TechStackConfigResponse {
  techStacks: Record<string, TechStackConfig>
  defaultTechStack: TechStackConfig
  categories: Record<string, { name: string; color: string }>
}

export interface SystemConfig {
  version: string
  name: string
  features: Record<string, boolean>
  limits: {
    maxApplications: number
    maxPortRange: { start: number; end: number }
    maxProcessTimeout: number
  }
  ui: {
    theme: string
    refreshInterval: number
    animationEnabled: boolean
  }
}

class ConfigApiService {
  private techStackConfigCache: TechStackConfigResponse | null = null
  private systemConfigCache: SystemConfig | null = null
  private cacheExpiry = 5 * 60 * 1000 // 5 minutes cache

  /**
   * 获取技术栈配置
   */
  async getTechStackConfig(): Promise<TechStackConfigResponse> {
    try {
      // 检查缓存
      if (this.techStackConfigCache) {
        return this.techStackConfigCache
      }

      // 尝试从新的配置API获取数据
      const response = await api.get('/v2/config/tech-stacks')
      
      if (response.data.success) {
        // 转换新API格式为旧格式
        const techStackData = response.data.data
        const techStacks: Record<string, TechStackConfig> = {}
        
        for (const item of techStackData) {
          const normalizedKey = item.value.toLowerCase().replace(/[\s-_.]/g, '')
          techStacks[normalizedKey] = {
            icon: item.icon,
            displayName: item.label,
            color: this.getTechStackColor(item.value),
            tagType: this.getTechStackTagType(item.value),
            category: this.getTechStackCategory(item.value)
          }
        }

        this.techStackConfigCache = {
          techStacks,
          defaultTechStack: { icon: '🚀', displayName: 'Unknown', color: '#909399', tagType: 'info', category: 'unknown' },
          categories: {
            'frontend': { name: 'Frontend', color: '#61DAFB' },
            'backend': { name: 'Backend', color: '#339933' },
            'static': { name: 'Static Site', color: '#E34F26' },
            'unknown': { name: 'Unknown', color: '#909399' }
          }
        }
        
        // 设置缓存过期
        setTimeout(() => {
          this.techStackConfigCache = null
        }, this.cacheExpiry)

        return this.techStackConfigCache
      } else {
        throw new Error(response.data.message || 'Failed to fetch tech stack config')
      }
    } catch (error) {
      console.error('Failed to fetch tech stack configuration:', error)
      
      // 返回默认配置作为后备
      return this.getDefaultTechStackConfig()
    }
  }

  /**
   * 获取系统配置
   */
  async getSystemConfig(): Promise<SystemConfig> {
    try {
      // 检查缓存
      if (this.systemConfigCache) {
        return this.systemConfigCache
      }

      const response = await api.get('/v2/config/system')
      
      if (response.data.success) {
        const configData = response.data.data as SystemConfig
        this.systemConfigCache = configData
        
        // 设置缓存过期
        setTimeout(() => {
          this.systemConfigCache = null
        }, this.cacheExpiry)

        return configData
      } else {
        throw new Error(response.data.message || 'Failed to fetch system config')
      }
    } catch (error) {
      console.error('Failed to fetch system configuration:', error)
      
      // 返回默认配置作为后备
      return this.getDefaultSystemConfig()
    }
  }

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    this.techStackConfigCache = null
    this.systemConfigCache = null
  }

  /**
   * 获取技术栈颜色
   */
  private getTechStackColor(techStack: string): string {
    const colorMap: Record<string, string> = {
      'react': '#61DAFB',
      'vue': '#4FC08D',
      'angular': '#DD0031',
      'nodejs': '#339933',
      'node.js': '#339933',
      'express': '#000000',
      'next.js': '#000000',
      'nuxt.js': '#00DC82',
      'typescript': '#3178C6',
      'javascript': '#F7DF1E',
      'vite': '#646CFF',
      'webpack': '#8DD6F9'
    }
    return colorMap[techStack.toLowerCase()] || '#909399'
  }

  /**
   * 获取技术栈标签类型
   */
  private getTechStackTagType(techStack: string): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
    const typeMap: Record<string, 'primary' | 'success' | 'info' | 'warning' | 'danger'> = {
      'react': 'primary',
      'vue': 'success',
      'angular': 'danger',
      'nodejs': 'warning',
      'node.js': 'warning',
      'express': 'info',
      'next.js': 'primary',
      'nuxt.js': 'success',
      'typescript': 'primary',
      'javascript': 'warning'
    }
    return typeMap[techStack.toLowerCase()] || 'info'
  }

  /**
   * 获取技术栈分类
   */
  private getTechStackCategory(techStack: string): string {
    const categoryMap: Record<string, string> = {
      'react': 'frontend',
      'vue': 'frontend',
      'angular': 'frontend',
      'next.js': 'frontend',
      'nuxt.js': 'frontend',
      'nodejs': 'backend',
      'node.js': 'backend',
      'express': 'backend',
      'typescript': 'language',
      'javascript': 'language',
      'vite': 'tool',
      'webpack': 'tool'
    }
    return categoryMap[techStack.toLowerCase()] || 'unknown'
  }

  /**
   * 获取默认技术栈配置（后备方案）
   */
  private getDefaultTechStackConfig(): TechStackConfigResponse {
    return {
      techStacks: {
        'react': { icon: '⚛️', displayName: 'React', color: '#61DAFB', tagType: 'primary', category: 'frontend' },
        'vue': { icon: '💚', displayName: 'Vue.js', color: '#4FC08D', tagType: 'success', category: 'frontend' },
        'angular': { icon: '🅰️', displayName: 'Angular', color: '#DD0031', tagType: 'danger', category: 'frontend' },
        'nodejs': { icon: '🟢', displayName: 'Node.js', color: '#339933', tagType: 'warning', category: 'backend' },
        'express': { icon: '🚀', displayName: 'Express', color: '#000000', tagType: 'info', category: 'backend' },
        'static-html': { icon: '📄', displayName: 'Static HTML', color: '#E34F26', tagType: 'info', category: 'static' }
      },
      defaultTechStack: { icon: '🚀', displayName: 'Unknown', color: '#909399', tagType: 'info', category: 'unknown' },
      categories: {
        'frontend': { name: 'Frontend', color: '#61DAFB' },
        'backend': { name: 'Backend', color: '#339933' },
        'static': { name: 'Static Site', color: '#E34F26' },
        'unknown': { name: 'Unknown', color: '#909399' }
      }
    }
  }

  /**
   * 获取默认系统配置（后备方案）
   */
  private getDefaultSystemConfig(): SystemConfig {
    return {
      version: '1.1.1',
      name: 'Intelligent Multi-App Portal System',
      features: {
        realTimeMonitoring: true,
        processManagement: true,
        portAllocation: true,
        webSocketUpdates: true,
        techStackDetection: true
      },
      limits: {
        maxApplications: 100,
        maxPortRange: { start: 3001, end: 9999 },
        maxProcessTimeout: 30000
      },
      ui: {
        theme: 'light',
        refreshInterval: 5000,
        animationEnabled: true
      }
    }
  }
}

export const configApiService = new ConfigApiService()
