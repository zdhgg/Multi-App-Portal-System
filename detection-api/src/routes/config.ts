import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import ConfigService from '../services/configService';
import { ServiceContainer } from '../core/ServiceContainer.js';
import { getPortalConfigFilePath, readPortalConfigFileSync } from '../utils/portalConfigPath.js';

const router = Router();
const configService = ConfigService.getInstance();

/**
 * Get UI configuration
 */
router.get('/ui', async (req: Request, res: Response) => {
  try {
    const config = await configService.loadConfig();
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Failed to get UI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load UI configuration'
    });
  }
});

/**
 * Get portal configuration including port ranges
 */
router.get('/portal', async (req: Request, res: Response) => {
  try {
    const configPath = getPortalConfigFilePath();
    
    if (configPath && existsSync(configPath)) {
      const configContent = readPortalConfigFileSync();
      const config = JSON.parse(configContent);
      
      res.json({
        success: true,
        data: {
          portConfiguration: config.portConfiguration
        }
      });
      return;
    }

    // 返回默认配置
    res.json({
      success: true,
      data: {
        portConfiguration: {
          frontendRange: { start: 3001, end: 3100, description: "前端应用端口范围" },
          backendRange: { start: 8001, end: 8100, description: "后端应用端口范围" }
        }
      }
    });
  } catch (error) {
    console.error('Failed to get portal config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load portal configuration'
    });
  }
});

/**
 * Get tech stack icons mapping
 */
router.get('/tech-stack-icons', async (req: Request, res: Response) => {
  try {
    const config = await configService.loadConfig();
    res.json({
      success: true,
      data: config.techStackIcons
    });
  } catch (error) {
    console.error('Failed to get tech stack icons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tech stack icons'
    });
  }
});

/**
 * Get available tech stacks from applications
 */
router.get('/tech-stacks', async (req: Request, res: Response) => {
  try {
    // For now, return some default tech stacks with dynamic configuration
    const defaultTechStacks = ['React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Express', 'TypeScript'];
    
    // Get display names for each tech stack
    const techStacksWithDisplayNames = await Promise.all(
      defaultTechStacks.map(async (tech: string) => ({
        value: tech.toLowerCase().replace(/[\s.]/g, '-'),
        label: await configService.getTechStackDisplayName(tech),
        icon: await configService.getTechStackIcon(tech)
      }))
    );

    res.json({
      success: true,
      data: techStacksWithDisplayNames
    });
  } catch (error) {
    console.error('Failed to get tech stacks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tech stacks'
    });
  }
});

/**
 * Get status configuration
 */
router.get('/status-config', async (req: Request, res: Response) => {
  try {
    const config = await configService.loadConfig();
    
    const statusConfig = {
      icons: config.statusIcons,
      colors: config.statusColors
    };

    res.json({
      success: true,
      data: statusConfig
    });
  } catch (error) {
    console.error('Failed to get status config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load status configuration'
    });
  }
});

/**
 * Get app type icons
 */
router.get('/app-type-icons', async (req: Request, res: Response) => {
  try {
    const config = await configService.loadConfig();
    res.json({
      success: true,
      data: config.appTypeIcons
    });
  } catch (error) {
    console.error('Failed to get app type icons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load app type icons'
    });
  }
});

/**
 * Get default settings
 */
router.get('/default-settings', async (req: Request, res: Response) => {
  try {
    const settings = await configService.getDefaultSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to get default settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load default settings'
    });
  }
});

/**
 * Get user settings
 */
router.get('/user-settings', async (req: Request, res: Response) => {
  try {
    const settings = await configService.getUserSettings();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to get user settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load user settings'
    });
  }
});

/**
 * Update user settings
 */
router.put('/user-settings', async (req: Request, res: Response) => {
  try {
    const settings = await configService.updateUserSettings(req.body);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to update user settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user settings'
    });
  }
});

/**
 * Add preset path
 */
router.post('/user-settings/preset-paths', async (req: Request, res: Response) => {
  try {
    const settings = await configService.addPresetPath(req.body);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to add preset path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add preset path'
    });
  }
});

/**
 * Remove preset path
 */
router.delete('/user-settings/preset-paths/:path', async (req: Request, res: Response) => {
  try {
    const pathValue = decodeURIComponent(req.params.path);
    const settings = await configService.removePresetPath(pathValue);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to remove preset path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove preset path'
    });
  }
});

/**
 * Add recent path
 */
router.post('/user-settings/recent-paths', async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    const settings = await configService.addRecentPath(path);
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to add recent path:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add recent path'
    });
  }
});

/**
 * Clear recent paths
 */
router.delete('/user-settings/recent-paths', async (req: Request, res: Response) => {
  try {
    const settings = await configService.clearRecentPaths();
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Failed to clear recent paths:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear recent paths'
    });
  }
});

/**
 * Get tech stack detection rules
 */
router.get('/tech-stack-rules', async (req: Request, res: Response) => {
  try {
    // Define dynamic tech stack detection rules
    const detectionRules = {
      packageJsonRules: [
        {
          dependency: 'react',
          techStack: 'React',
          priority: 1
        },
        {
          dependency: 'vue',
          techStack: 'Vue',
          priority: 1
        },
        {
          dependency: '@angular/core',
          techStack: 'Angular',
          priority: 1
        },
        {
          dependency: 'next',
          techStack: 'Next.js',
          priority: 2
        },
        {
          dependency: 'nuxt',
          techStack: 'Nuxt.js',
          priority: 2
        },
        {
          dependency: 'vite',
          techStack: 'Vite',
          priority: 3
        },
        {
          dependency: 'express',
          techStack: 'Express',
          priority: 1
        },
        {
          dependency: 'typescript',
          techStack: 'TypeScript',
          priority: 4
        }
      ],
      filePatternRules: [
        {
          pattern: 'angular.json',
          techStack: 'Angular',
          priority: 1
        },
        {
          pattern: 'next.config.js',
          techStack: 'Next.js',
          priority: 1
        },
        {
          pattern: 'nuxt.config.js',
          techStack: 'Nuxt.js',
          priority: 1
        },
        {
          pattern: 'vite.config.*',
          techStack: 'Vite',
          priority: 1
        },
        {
          pattern: 'tsconfig.json',
          techStack: 'TypeScript',
          priority: 3
        },
        {
          pattern: 'Dockerfile',
          techStack: 'Docker',
          priority: 2
        }
      ],
      scriptRules: [
        {
          script: 'react-scripts',
          techStack: 'React',
          priority: 1
        },
        {
          script: 'vue-cli-service',
          techStack: 'Vue',
          priority: 1
        },
        {
          script: 'ng serve',
          techStack: 'Angular',
          priority: 1
        },
        {
          script: 'next dev',
          techStack: 'Next.js',
          priority: 1
        },
        {
          script: 'nuxt dev',
          techStack: 'Nuxt.js',
          priority: 1
        },
        {
          script: 'vite',
          techStack: 'Vite',
          priority: 1
        }
      ]
    };

    res.json({
      success: true,
      data: detectionRules
    });
  } catch (error) {
    console.error('Failed to get tech stack rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tech stack detection rules'
    });
  }
});

export default router;
