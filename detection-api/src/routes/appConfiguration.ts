/**
 * Application Configuration Routes
 * 应用配置管理路由
 */

import { Router, Request, Response } from 'express';
import { AppConfigurationService } from '../services/appConfigurationService';
import { logger } from '../utils/logger';
import type { AppConfiguration } from '../models/AppConfiguration';

const router = Router();

// 配置服务实例缓存
let configService: AppConfigurationService | null = null;
let applicationService: { findById(id: string): Promise<any> } | null = null;

// 初始化配置服务
export function initConfigService(database: any, appService?: { findById(id: string): Promise<any> }): void {
  configService = new AppConfigurationService(database);
  applicationService = appService || null;
}

// 获取配置服务实例
function getConfigService(): AppConfigurationService {
  if (!configService) {
    throw new Error('Configuration service not initialized. Call initConfigService first.');
  }
  return configService;
}

async function getApplicationForPortConfig(appId: string): Promise<any | null> {
  if (!applicationService) {
    throw new Error('Application service not initialized. Cannot resolve app for port configuration.');
  }

  try {
    return await applicationService.findById(appId);
  } catch (error: any) {
    if (error?.code === 'APPLICATION_NOT_FOUND' || error?.message === 'Application not found') {
      return null;
    }
    throw error;
  }
}

/**
 * 获取应用的所有配置
 */
router.get('/app/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const configService = getConfigService();
    const configurations = await configService.getConfigurationsByAppId(appId);

    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    logger.error('Failed to get configurations', { error, appId: req.params.appId });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configurations'
    });
  }
});

/**
 * 获取单个配置
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configService = getConfigService();
    const configuration = await configService.getConfiguration(id);

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    res.json({
      success: true,
      data: configuration
    });
  } catch (error) {
    logger.error('Failed to get configuration', { error, id: req.params.id });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configuration'
    });
  }
});

/**
 * 创建新配置
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const configService = getConfigService();
    const configData = req.body as Omit<AppConfiguration, 'id' | 'createdAt' | 'updatedAt'>;
    
    // 设置默认值
    if (!configData.version) configData.version = '1.0.0';
    if (!configData.tags) configData.tags = [];
    if (configData.isActive === undefined) configData.isActive = true;

    const configId = await configService.createConfiguration(configData);

    res.status(201).json({
      success: true,
      data: { id: configId },
      message: 'Configuration created successfully'
    });
  } catch (error) {
    logger.error('Failed to create configuration', { error, body: req.body });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create configuration'
    });
  }
});

/**
 * 更新配置
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as Partial<AppConfiguration>;
    const updatedBy = req.headers['x-user-id'] as string;
    
    const configService = getConfigService();
    await configService.updateConfiguration(id, updates, updatedBy);

    res.json({
      success: true,
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update configuration', { error, id: req.params.id, body: req.body });
    
    const status = error instanceof Error && error.message === 'Configuration not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update configuration'
    });
  }
});

/**
 * 验证配置（通过ID）
 */
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configService = getConfigService();
    const configuration = await configService.getConfiguration(id);

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    const validation = await configService.validateConfiguration(configuration);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Failed to validate configuration', { error, id: req.params.id });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate configuration'
    });
  }
});

/**
 * 验证配置对象（不需要保存）
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const configuration = req.body;

    if (!configuration) {
      return res.status(400).json({
        success: false,
        error: 'Configuration data is required'
      });
    }

    const configService = getConfigService();
    const validation = await configService.validateConfiguration(configuration);

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Failed to validate configuration object', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate configuration'
    });
  }
});

/**
 * 获取配置模板
 */
router.get('/templates/list', async (req: Request, res: Response) => {
  try {
    const configService = getConfigService();
    const templates = await configService.getTemplates();

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Failed to get configuration templates', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates'
    });
  }
});

/**
 * 从模板创建配置
 */
router.post('/from-template/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { appId, customizations } = req.body;
    
    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'appId is required'
      });
    }

    const configService = getConfigService();
    const configId = await configService.createFromTemplate(templateId, appId, customizations || {});

    res.status(201).json({
      success: true,
      data: { id: configId },
      message: 'Configuration created from template successfully'
    });
  } catch (error) {
    logger.error('Failed to create configuration from template', { 
      error, 
      templateId: req.params.templateId, 
      body: req.body 
    });
    
    const status = error instanceof Error && error.message === 'Template not found' ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create configuration from template'
    });
  }
});

/**
 * 克隆配置
 */
router.post('/:id/clone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newAppId, name } = req.body;
    
    const configService = getConfigService();
    const originalConfig = await configService.getConfiguration(id);

    if (!originalConfig) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // 创建克隆配置
    const clonedConfig = {
      ...originalConfig,
      appId: newAppId || originalConfig.appId,
      name: name || `${originalConfig.name} - 副本`,
      createdBy: req.headers['x-user-id'] as string
    };

    // 移除不需要的字段
    delete (clonedConfig as any).id;
    delete (clonedConfig as any).createdAt;
    delete (clonedConfig as any).updatedAt;

    const configId = await configService.createConfiguration(clonedConfig);

    res.status(201).json({
      success: true,
      data: { id: configId },
      message: 'Configuration cloned successfully'
    });
  } catch (error) {
    logger.error('Failed to clone configuration', { error, id: req.params.id, body: req.body });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone configuration'
    });
  }
});

/**
 * 删除配置
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const configService = getConfigService();
    
    // 获取配置详情用于软删除
    const configuration = await configService.getConfiguration(id);
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // 软删除：将配置标记为非活跃状态
    await configService.updateConfiguration(id, { 
      isActive: false 
    }, req.headers['x-user-id'] as string);

    res.json({
      success: true,
      message: 'Configuration deactivated successfully'
    });
  } catch (error) {
    logger.error('Failed to delete configuration', { error, id: req.params.id });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete configuration'
    });
  }
});

/**
 * 动态配置应用端口
 * POST /api/app-configurations/:appId/configure-ports
 * POST /api/app-configuration/:appId/configure-ports (legacy alias)
 */
router.post('/:appId/configure-ports', async (req, res) => {
  try {
    const { appId } = req.params
    const ports = req.body

    logger.info('收到端口配置请求', { appId, ports })

    // 验证端口配置
    if (!ports.frontend && !ports.backend && !ports.api) {
      return res.status(400).json({
        success: false,
        message: '至少需要提供一个端口配置'
      })
    }

    // 获取完整应用信息，端口配置服务需要 directory、techStack、fullStack 等字段
    const app = await getApplicationForPortConfig(appId)
    if (!app) {
      return res.status(404).json({
        success: false,
        message: '应用不存在'
      })
    }

    // 使用已初始化的配置服务
    const configServiceInstance = getConfigService()

    // 配置端口
    const success = await configServiceInstance.configureAppPorts(app as any, ports)

    if (success) {
      res.json({
        success: true,
        message: '端口配置成功',
        data: {
          appId,
          ports,
          configuredAt: new Date().toISOString()
        }
      })
    } else {
      res.status(500).json({
        success: false,
        message: '端口配置失败'
      })
    }

  } catch (error) {
    logger.error('配置应用端口失败', { error })
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error instanceof Error ? error.message : '未知错误'
    })
  }
})

/**
 * 回滚应用配置
 * POST /api/app-configurations/:appId/rollback
 * POST /api/app-configuration/:appId/rollback (legacy alias)
 */
router.post('/:appId/rollback', async (req, res) => {
  try {
    const { appId } = req.params

    logger.info('收到配置回滚请求', { appId })

    // 使用已初始化的配置服务
    const configServiceInstance = getConfigService()

    // 回滚配置
    await configServiceInstance.rollbackConfigurations(appId)

    res.json({
      success: true,
      message: '配置回滚成功',
      data: {
        appId,
        rolledBackAt: new Date().toISOString()
      }
    })

  } catch (error) {
    logger.error('回滚应用配置失败', { error })
    res.status(500).json({
      success: false,
      message: '服务器内部错误',
      error: error instanceof Error ? error.message : '未知错误'
    })
  }
})

export default router;
