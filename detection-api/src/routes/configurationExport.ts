/**
 * Configuration Import/Export Routes
 * 配置导入导出路由
 */

import { Router, Request, Response } from 'express';
import { ConfigurationExporter, ExportOptions, ImportOptions } from '../services/configurationExporter';
import { AppConfigurationService } from '../services/appConfigurationService';
import { EnvironmentManager } from '../services/environmentManager';
import { logger } from '../utils/logger';
import path from 'path';
import { promises as fs } from 'fs';
import multer from 'multer';
import { validateConfigImportFile } from '../middleware/fileValidation.js';

const router = Router();

// 配置导入导出服务实例缓存
let configExporter: ConfigurationExporter | null = null;

// 配置multer用于文件上传（增强安全验证）
const upload = multer({
  dest: 'uploads/imports/',
  fileFilter: (req, file, cb) => {
    // 1. MIME类型白名单
    const allowedMimeTypes = [
      'application/json',
      'text/plain'  // 某些系统可能将JSON识别为text/plain
    ]

    // 2. 扩展名白名单
    const allowedExtensions = ['.json']
    const ext = path.extname(file.originalname).toLowerCase()

    // 3. 文件名安全检查（防止路径遍历）
    const filename = file.originalname
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return cb(new Error('文件名包含非法字符'))
    }

    // 4. 文件名长度检查
    if (filename.length > 255) {
      return cb(new Error('文件名过长'))
    }

    // 5. MIME类型和扩展名双重验证
    const mimeTypeValid = allowedMimeTypes.includes(file.mimetype)
    const extensionValid = allowedExtensions.includes(ext)

    if (!mimeTypeValid && !extensionValid) {
      return cb(new Error('只允许上传JSON文件'))
    }

    // 6. 记录上传尝试
    logger.info('文件上传请求', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    })

    cb(null, true)
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB限制
    files: 1 // 一次只允许上传一个文件
  }
});

// 初始化配置导入导出服务
export function initConfigExporter(database: any): void {
  const configService = new AppConfigurationService(database);
  const environmentManager = new EnvironmentManager(database);
  configExporter = new ConfigurationExporter(database, configService, environmentManager);
}

// 获取配置导入导出服务实例
function getConfigExporter(): ConfigurationExporter {
  if (!configExporter) {
    throw new Error('Configuration exporter not initialized. Call initConfigExporter first.');
  }
  return configExporter;
}

/**
 * 导出配置
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const options = req.body as ExportOptions;
    
    // 验证导出选项
    if (!options.format) {
      return res.status(400).json({
        success: false,
        error: 'Export format is required'
      });
    }

    if (!['json', 'yaml', 'zip'].includes(options.format)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid export format. Supported formats: json, yaml, zip'
      });
    }

    const exporter = getConfigExporter();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportDir = path.join(process.cwd(), 'exports');
    const exportPath = path.join(exportDir, `config-export-${timestamp}.${options.format}`);

    // 确保导出目录存在
    await fs.mkdir(exportDir, { recursive: true });

    // 执行导出
    await exporter.exportConfigurations(
      options,
      exportPath,
      req.headers['x-user-id'] as string
    );

    // 返回下载链接或文件内容
    if (options.format === 'json') {
      const exportContent = await fs.readFile(exportPath, 'utf-8');
      const exportData = JSON.parse(exportContent);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="config-export-${timestamp}.json"`);
      
      return res.json(exportData);
    }

    // 对于其他格式，返回成功信息
    res.json({
      success: true,
      message: 'Configuration exported successfully',
      data: {
        exportPath: exportPath,
        format: options.format,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to export configurations', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export configurations'
    });
  }
});

/**
 * 导入配置（文件上传 + 内容验证）
 */
router.post('/import', upload.single('configFile'), validateConfigImportFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Configuration file is required'
      });
    }

    const options: ImportOptions = {
      overwriteExisting: req.body.overwriteExisting === 'true',
      validateBeforeImport: req.body.validateBeforeImport !== 'false', // 默认为true
      mergeEnvironments: req.body.mergeEnvironments === 'true',
      createBackup: req.body.createBackup !== 'false' // 默认为true
    };

    const exporter = getConfigExporter();
    const result = await exporter.importConfigurations(
      req.file.path,
      options,
      req.headers['x-user-id'] as string
    );

    // 清理上传的临时文件
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      logger.warn('Failed to cleanup temporary import file', { error, filePath: req.file.path });
    }

    const statusCode = result.success ? 200 : (result.importedConfigurations > 0 || result.importedEnvironments > 0 ? 206 : 400);
    
    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.success 
        ? 'Configuration imported successfully' 
        : `Import completed with ${result.errors.length} errors and ${result.warnings.length} warnings`
    });
  } catch (error) {
    logger.error('Failed to import configurations', { error, file: req.file });
    
    // 清理上传的临时文件
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temporary import file after error', { 
          error: cleanupError, 
          filePath: req.file.path 
        });
      }
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import configurations'
    });
  }
});

/**
 * 从URL导入配置
 */
router.post('/import-from-url', async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Import URL is required'
      });
    }

    // TODO: 实现从URL导入配置的功能
    res.status(501).json({
      success: false,
      error: 'Import from URL is not yet implemented'
    });
  } catch (error) {
    logger.error('Failed to import from URL', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import from URL'
    });
  }
});

/**
 * 创建备份
 */
router.post('/backup', async (req: Request, res: Response) => {
  try {
    const options = req.body as ExportOptions;
    
    // 设置默认选项
    const backupOptions: ExportOptions = {
      includeEnvironments: options.includeEnvironments !== false,
      includeTemplates: options.includeTemplates !== false,
      includeSensitiveData: options.includeSensitiveData === true,
      format: 'json',
      appIds: options.appIds
    };

    const exporter = getConfigExporter();
    const backupInfo = await exporter.createBackup(
      backupOptions,
      undefined, // 让系统自动生成备份路径
      req.headers['x-user-id'] as string
    );

    res.json({
      success: true,
      data: backupInfo,
      message: 'Backup created successfully'
    });
  } catch (error) {
    logger.error('Failed to create backup', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create backup'
    });
  }
});

/**
 * 获取备份列表
 */
router.get('/backups', async (req: Request, res: Response) => {
  try {
    const exporter = getConfigExporter();
    const backups = await exporter.getBackups();

    res.json({
      success: true,
      data: backups
    });
  } catch (error) {
    logger.error('Failed to get backups', { error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get backups'
    });
  }
});

/**
 * 删除备份
 */
router.delete('/backups/:backupId', async (req: Request, res: Response) => {
  try {
    const { backupId } = req.params;
    
    const exporter = getConfigExporter();
    await exporter.deleteBackup(backupId);

    res.json({
      success: true,
      message: 'Backup deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete backup', { error, backupId: req.params.backupId });
    
    const status = error instanceof Error && error.message === 'Backup not found' ? 404 : 500;
    res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backup'
    });
  }
});

/**
 * 还原备份
 */
router.post('/backups/:backupId/restore', async (req: Request, res: Response) => {
  try {
    const { backupId } = req.params;
    const options: ImportOptions = {
      overwriteExisting: req.body.overwriteExisting === 'true',
      validateBeforeImport: req.body.validateBeforeImport !== 'false',
      mergeEnvironments: req.body.mergeEnvironments === 'true',
      createBackup: req.body.createBackup !== 'false'
    };

    // 获取备份信息
    const exporter = getConfigExporter();
    const backups = await exporter.getBackups();
    const backup = backups.find(b => b.id === backupId);
    
    if (!backup) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found'
      });
    }

    // 执行还原
    const result = await exporter.importConfigurations(
      backup.filePath,
      options,
      req.headers['x-user-id'] as string
    );

    const statusCode = result.success ? 200 : (result.importedConfigurations > 0 || result.importedEnvironments > 0 ? 206 : 400);
    
    res.status(statusCode).json({
      success: result.success,
      data: result,
      message: result.success 
        ? 'Backup restored successfully' 
        : `Restore completed with ${result.errors.length} errors and ${result.warnings.length} warnings`
    });
  } catch (error) {
    logger.error('Failed to restore backup', { error, backupId: req.params.backupId });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore backup'
    });
  }
});

/**
 * 验证导入文件（文件上传 + 内容验证）
 */
router.post('/validate-import', upload.single('configFile'), validateConfigImportFile, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Configuration file is required'
      });
    }

    // 读取和验证文件内容
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    let importData;
    
    try {
      importData = JSON.parse(fileContent);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON format'
      });
    }

    // TODO: 实现配置验证逻辑
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        configurations: importData.configurations?.length || 0,
        environments: importData.environments?.length || 0,
        templates: importData.templates?.length || 0
      }
    };

    // 清理临时文件
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      logger.warn('Failed to cleanup validation temp file', { error });
    }

    res.json({
      success: true,
      data: validationResult,
      message: validationResult.isValid ? 'Configuration file is valid' : 'Configuration file has validation issues'
    });
  } catch (error) {
    logger.error('Failed to validate import file', { error, file: req.file });
    
    // 清理临时文件
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup validation temp file after error', { error: cleanupError });
      }
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate import file'
    });
  }
});

export default router;