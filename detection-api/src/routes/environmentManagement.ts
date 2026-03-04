/**
 * Environment Management Routes
 * 环境变量和启动参数管理路由
 */

import { Router, Request, Response } from 'express';
import { EnvironmentManager, EnvironmentProfile } from '../services/environmentManager';
import { logger } from '../utils/logger';
import path from 'path';

const router = Router();

// 环境管理服务实例缓存
let environmentManager: EnvironmentManager | null = null;

// 初始化环境管理服务
export function initEnvironmentManager(database: any): void {
  environmentManager = new EnvironmentManager(database);
}

// 获取环境管理服务实例
function getEnvironmentManager(): EnvironmentManager {
  if (!environmentManager) {
    throw new Error('Environment manager not initialized. Call initEnvironmentManager first.');
  }
  return environmentManager;
}

/**
 * 创建环境配置文件
 */
router.post('/profiles', async (req: Request, res: Response) => {
  try {
    const profileData = req.body as Omit<EnvironmentProfile, 'id' | 'createdAt' | 'updatedAt'>;
    
    // 验证必需字段
    if (!profileData.name || !profileData.appId || !profileData.variables || !profileData.parameters) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, appId, variables, parameters'
      });
    }

    const envMgr = getEnvironmentManager();
    const profileId = await envMgr.createProfile(profileData);

    return res.status(201).json({
      success: true,
      data: { id: profileId },
      message: 'Environment profile created successfully'
    });
  } catch (error) {
    logger.error('Failed to create environment profile', { error, body: req.body });
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create environment profile'
    });
  }
});

/**
 * 获取环境配置文件
 */
router.get('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const envMgr = getEnvironmentManager();
    const profile = await envMgr.getProfile(id);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Environment profile not found'
      });
    }

    return res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('Failed to get environment profile', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get environment profile'
    });
  }
});

/**
 * 获取应用的所有环境配置
 */
router.get('/profiles/app/:appId', async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const envMgr = getEnvironmentManager();
    const profiles = await envMgr.getProfilesByAppId(appId);

    return res.json({
      success: true,
      data: profiles
    });
  } catch (error) {
    logger.error('Failed to get environment profiles by app ID', { error, appId: req.params.appId });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get environment profiles'
    });
  }
});

/**
 * 更新环境配置文件
 */
router.put('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as Partial<EnvironmentProfile>;
    
    const envMgr = getEnvironmentManager();
    await envMgr.updateProfile(id, updates);

    return res.json({
      success: true,
      message: 'Environment profile updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update environment profile', { error, id: req.params.id, body: req.body });
    
    const status = error instanceof Error && error.message === 'Environment profile not found' ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update environment profile'
    });
  }
});

/**
 * 验证环境变量
 */
router.post('/profiles/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const envMgr = getEnvironmentManager();
    
    const profile = await envMgr.getProfile(id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Environment profile not found'
      });
    }

    const validation = await envMgr.validateEnvironmentVariables(profile.variables);

    return res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Failed to validate environment variables', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate environment variables'
    });
  }
});

/**
 * 验证环境变量（不需要保存的配置）
 */
router.post('/validate-variables', async (req: Request, res: Response) => {
  try {
    const { variables } = req.body;
    
    if (!Array.isArray(variables)) {
      return res.status(400).json({
        success: false,
        error: 'Variables should be an array'
      });
    }

    const envMgr = getEnvironmentManager();
    const validation = await envMgr.validateEnvironmentVariables(variables);

    return res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    logger.error('Failed to validate environment variables', { error, body: req.body });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate environment variables'
    });
  }
});

/**
 * 生成.env文件
 */
router.post('/profiles/:id/generate-env', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path is required'
      });
    }

    const envMgr = getEnvironmentManager();
    await envMgr.generateEnvFile(id, filePath);

    return res.json({
      success: true,
      message: 'Environment file generated successfully',
      data: { filePath }
    });
  } catch (error) {
    logger.error('Failed to generate environment file', { error, id: req.params.id, body: req.body });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate environment file'
    });
  }
});

/**
 * 获取环境模板
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const envMgr = getEnvironmentManager();
    const templates = await envMgr.getTemplates();

    return res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Failed to get environment templates', { error });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get environment templates'
    });
  }
});

/**
 * 从模板创建环境配置
 */
router.post('/profiles/from-template/:templateId', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { appId, customizations } = req.body;
    
    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'appId is required'
      });
    }

    const envMgr = getEnvironmentManager();
    const profileId = await envMgr.createFromTemplate(templateId, appId, customizations || {});

    return res.status(201).json({
      success: true,
      data: { id: profileId },
      message: 'Environment profile created from template successfully'
    });
  } catch (error) {
    logger.error('Failed to create environment profile from template', { 
      error, 
      templateId: req.params.templateId, 
      body: req.body 
    });
    
    const status = error instanceof Error && error.message === 'Environment template not found' ? 404 : 400;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create environment profile from template'
    });
  }
});

/**
 * 克隆环境配置文件
 */
router.post('/profiles/:id/clone', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newAppId, name } = req.body;
    
    const envMgr = getEnvironmentManager();
    const originalProfile = await envMgr.getProfile(id);

    if (!originalProfile) {
      return res.status(404).json({
        success: false,
        error: 'Environment profile not found'
      });
    }

    // 创建克隆配置
    const clonedProfile = {
      ...originalProfile,
      appId: newAppId || originalProfile.appId,
      name: name || `${originalProfile.name} - 副本`,
      isDefault: false, // 克隆的配置不应该是默认配置
      createdBy: req.headers['x-user-id'] as string
    };

    // 移除不需要的字段
    delete (clonedProfile as any).id;
    delete (clonedProfile as any).createdAt;
    delete (clonedProfile as any).updatedAt;

    const profileId = await envMgr.createProfile(clonedProfile);

    return res.status(201).json({
      success: true,
      data: { id: profileId },
      message: 'Environment profile cloned successfully'
    });
  } catch (error) {
    logger.error('Failed to clone environment profile', { error, id: req.params.id, body: req.body });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone environment profile'
    });
  }
});

/**
 * 删除环境配置文件
 */
router.delete('/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const envMgr = getEnvironmentManager();
    
    // 获取配置详情
    const profile = await envMgr.getProfile(id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Environment profile not found'
      });
    }

    // 如果是默认配置，不允许删除
    if (profile.isDefault) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete default environment profile'
      });
    }

    // TODO: 实现软删除或硬删除逻辑
    // 这里暂时不实现删除功能，因为环境配置通常需要保留历史记录

    return res.json({
      success: true,
      message: 'Environment profile deletion is not implemented for safety reasons'
    });
  } catch (error) {
    logger.error('Failed to delete environment profile', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete environment profile'
    });
  }
});

/**
 * 导出环境配置为JSON格式
 */
router.get('/profiles/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { format = 'json', includeSensitive = 'false' } = req.query;
    
    const envMgr = getEnvironmentManager();
    const profile = await envMgr.getProfile(id);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Environment profile not found'
      });
    }

    // 处理敏感信息
    let exportProfile = { ...profile };
    if (includeSensitive === 'false') {
      exportProfile.variables = profile.variables.map(variable => ({
        ...variable,
        value: variable.sensitive ? '***SENSITIVE_VALUE***' : variable.value
      }));
    }

    if (format === 'env') {
      // 导出为.env文件格式
      const envContent = profile.variables
        .map(variable => {
          const value = variable.sensitive && includeSensitive === 'false' 
            ? '***SENSITIVE_VALUE***' 
            : variable.value;
          const comment = variable.description ? `# ${variable.description}` : '';
          return `${comment}\n${variable.key}=${value}`;
        })
        .join('\n\n');

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${profile.name}.env"`);
      return res.send(envContent);
    } else {
      // 导出为JSON格式
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${profile.name}.json"`);
      return res.json({
        success: true,
        data: exportProfile,
        exportedAt: new Date().toISOString(),
        format: 'json'
      });
    }
  } catch (error) {
    logger.error('Failed to export environment profile', { error, id: req.params.id });
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export environment profile'
    });
  }
});

export default router;