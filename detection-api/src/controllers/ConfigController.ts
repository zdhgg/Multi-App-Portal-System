/**
 * Configuration Controller - Centralized System Configuration Management
 * 
 * Provides APIs for frontend to retrieve dynamic configuration data
 * including tech stack mappings, icons, and other system settings.
 */

import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger'

export class ConfigController {
  private router = Router()

  constructor() {
    this.setupRoutes()
  }

  private setupRoutes(): void {
    // Get tech stack configuration
    this.router.get('/tech-stacks', this.getTechStackConfig.bind(this))
    
    // Get system configuration
    this.router.get('/system', this.getSystemConfig.bind(this))
    
    // Health check for config service
    this.router.get('/health', this.getHealth.bind(this))
  }

  /**
   * Get tech stack configuration including icons, display names, and styling
   */
  private async getTechStackConfig(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching tech stack configuration')

      const techStackConfig = {
        techStacks: {
          'react': {
            icon: '⚛️',
            displayName: 'React',
            color: '#61DAFB',
            tagType: 'primary',
            category: 'frontend'
          },
          'vue': {
            icon: '💚',
            displayName: 'Vue.js',
            color: '#4FC08D',
            tagType: 'success',
            category: 'frontend'
          },
          'vue-vite': {
            icon: '⚡',
            displayName: 'Vue + Vite',
            color: '#646CFF',
            tagType: 'success',
            category: 'frontend'
          },
          'angular': {
            icon: '🅰️',
            displayName: 'Angular',
            color: '#DD0031',
            tagType: 'danger',
            category: 'frontend'
          },
          'nextjs': {
            icon: '▲',
            displayName: 'Next.js',
            color: '#000000',
            tagType: 'primary',
            category: 'fullstack'
          },
          'nuxtjs': {
            icon: '💚',
            displayName: 'Nuxt.js',
            color: '#00C58E',
            tagType: 'success',
            category: 'fullstack'
          },
          'express': {
            icon: '🚀',
            displayName: 'Express',
            color: '#000000',
            tagType: 'info',
            category: 'backend'
          },
          'express-typescript': {
            icon: '🔷',
            displayName: 'Express + TypeScript',
            color: '#3178C6',
            tagType: 'primary',
            category: 'backend'
          },
          'nodejs': {
            icon: '🟢',
            displayName: 'Node.js',
            color: '#339933',
            tagType: 'warning',
            category: 'backend'
          },
          'nodejs-web': {
            icon: '🌐',
            displayName: 'Node.js Web',
            color: '#339933',
            tagType: 'warning',
            category: 'backend'
          },
          'static-html': {
            icon: '📄',
            displayName: 'Static HTML',
            color: '#E34F26',
            tagType: 'info',
            category: 'static'
          },
          'vite': {
            icon: '⚡',
            displayName: 'Vite',
            color: '#646CFF',
            tagType: 'primary',
            category: 'build-tool'
          },
          'webpack': {
            icon: '📦',
            displayName: 'Webpack',
            color: '#8DD6F9',
            tagType: 'info',
            category: 'build-tool'
          },
          'svelte': {
            icon: '🔥',
            displayName: 'Svelte',
            color: '#FF3E00',
            tagType: 'danger',
            category: 'frontend'
          },
          'gatsby': {
            icon: '⚡',
            displayName: 'Gatsby',
            color: '#663399',
            tagType: 'primary',
            category: 'static'
          },
          'remix': {
            icon: '💿',
            displayName: 'Remix',
            color: '#000000',
            tagType: 'info',
            category: 'fullstack'
          }
        },
        defaultTechStack: {
          icon: '🚀',
          displayName: 'Unknown',
          color: '#909399',
          tagType: 'info',
          category: 'unknown'
        },
        categories: {
          'frontend': { name: 'Frontend', color: '#61DAFB' },
          'backend': { name: 'Backend', color: '#339933' },
          'fullstack': { name: 'Full Stack', color: '#000000' },
          'static': { name: 'Static Site', color: '#E34F26' },
          'build-tool': { name: 'Build Tool', color: '#646CFF' },
          'unknown': { name: 'Unknown', color: '#909399' }
        }
      }

      res.json({
        success: true,
        data: techStackConfig,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Failed to fetch tech stack configuration', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch tech stack configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Get general system configuration
   */
  private async getSystemConfig(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Fetching system configuration')

      const systemConfig = {
        version: '2.0.0',
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

      res.json({
        success: true,
        data: systemConfig,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Failed to fetch system configuration', error)
      res.status(500).json({
        success: false,
        error: 'Failed to fetch system configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  /**
   * Health check for configuration service
   */
  private async getHealth(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'healthy',
      service: 'ConfigController',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    })
  }

  getRouter(): Router {
    return this.router
  }
}