/**
 * API适配器 - 将新的API v2与现有系统集成
 * 
 * 提供平滑的迁移路径，支持v1和v2 API共存
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { Database } from 'better-sqlite3';
import { ConfigManager } from '../services/configManager';

// 导入新的API v2
import apiV2Router, { initializeApiV2 } from './v2/index';

// 导入现有的路由（如果需要保持兼容性）
// Note: portManagement module removed - using v2 routes instead
const portManagementV1Router = Router(); // Empty router placeholder

const router = Router();

// ===============================================================================
// API版本检测中间件
// ===============================================================================

function apiVersionMiddleware(req: Request, res: Response, next: NextFunction) {
  // 从URL路径、查询参数或头部检测API版本
  let apiVersion = 'v1'; // 默认版本
  
  if (req.path.startsWith('/v2-ports')) {
    apiVersion = 'v2-ports';
  } else if (req.path.startsWith('/v2')) {
    apiVersion = 'v2';
  } else if (req.query.version === 'v2' || req.headers['api-version'] === 'v2') {
    apiVersion = 'v2';
  }
  
  req.apiVersion = apiVersion;
  next();
}

// API版本信息中间件
function versionInfoMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('API-Version', req.apiVersion || 'v1');
  res.setHeader('API-Available-Versions', 'v1, v2');
  next();
}

// 应用中间件
router.use(apiVersionMiddleware);
router.use(versionInfoMiddleware);

// ===============================================================================
// API路由配置
// ===============================================================================

// API根路径 - 显示版本信息
router.get('/', (req, res) => {
  res.json({
    name: 'Intelligent Multi-App Portal System API',
    description: '智能多应用门户系统统一API',
    availableVersions: {
      'v1': {
        path: '/api/port-management',
        status: 'legacy',
        description: '传统端口管理API（向后兼容）',
        deprecationDate: '2024-12-31',
        migrationGuide: '/api/migration-guide'
      },
      'v2': {
        path: '/api/v2',
        status: 'current',
        description: '统一的RESTful API（推荐使用，通过ServiceContainer）',
        features: [
          '统一的响应格式',
          '更好的错误处理',
          '标准化的端点命名',
          '完整的OpenAPI文档',
          '性能优化',
          '扩展的功能支持'
        ]
      },
      'v2-ports': {
        path: '/api/v2-ports',
        status: 'legacy',
        description: '端口管理专用API（兼容性路由，建议迁移到v2）',
        features: [
          '端口分配和管理',
          '端口状态查询',
          '冲突检测',
          '标准响应格式'
        ],
        migrationTo: '/api/v2/config/ports'
      }
    },
    migration: {
      guide: '/api/migration-guide',
      tools: '/api/migration-tools',
      support: 'support@example.com'
    },
    documentation: {
      v1: '/api/docs/v1',
      v2: '/api/v2/docs',
      'v2-ports': '/api/v2-ports/docs'
    },
    timestamp: new Date().toISOString()
  });
});

// 挂载API v2端口管理路由 (重命名避免与ServiceContainer v2路径冲突)
router.use('/v2-ports', apiV2Router);

// 兼容性路由 - 重定向或适配v1请求到v2
router.use('/port-management', (req, res, next) => {
  // 在响应头中提醒客户端使用新版API
  res.setHeader('X-API-Deprecation-Warning', 'This API version is deprecated. Please migrate to v2.');
  res.setHeader('X-API-Migration-Guide', '/api/migration-guide');
  next();
}, portManagementV1Router);

// ===============================================================================
// API迁移工具和指南
// ===============================================================================

// 迁移指南
router.get('/migration-guide', (req, res) => {
  res.json({
    title: 'API Migration Guide - v1 to v2',
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    overview: {
      description: 'Guide for migrating from API v1 to v2',
      benefits: [
        '更一致的API设计',
        '更好的性能',
        '增强的错误处理',
        '完整的类型定义',
        '更丰富的响应信息'
      ],
      timeline: {
        v1Support: '2024年12月31日前继续支持v1',
        deprecationDate: '2024年12月31日',
        eolDate: '2025年6月30日'
      }
    },
    mappings: {
      endpoints: [
        {
          v1: 'POST /api/port-management/allocate',
          v2: 'POST /api/v2-ports/allocations',
          changes: [
            '请求体结构略有不同',
            '响应格式标准化',
            '增加了更多的配置选项'
          ],
          migration: {
            requestMapping: {
              from: {
                appId: 'appId',
                appName: 'appName',
                type: 'type',
                protocol: 'protocol'
              },
              to: {
                appId: 'appId',
                appName: 'appName',
                allocationType: 'type',
                protocol: 'protocol',
                techStack: 'required - 新增字段',
                projectType: 'required - 新增字段'
              }
            },
            responseMapping: {
              from: { data: { port: 'number' } },
              to: { 
                data: { 
                  port: 'number',
                  allocationId: 'string',
                  confidence: 'number',
                  source: 'string'
                } 
              }
            }
          }
        },
        {
          v1: 'DELETE /api/port-management/:port/app/:appId',
          v2: 'DELETE /api/v2-ports/allocations/:allocationId',
          changes: [
            '使用allocationId代替port+appId组合',
            '支持可选的释放原因和强制释放'
          ]
        },
        {
          v1: 'GET /api/port-management/:port',
          v2: 'GET /api/v2-ports/:port/status',
          changes: [
            '端点路径更清晰',
            '响应数据结构化程度更高',
            '包含更多的状态信息'
          ]
        },
        {
          v1: 'GET /api/port-management/conflicts/detect',
          v2: 'GET /api/v2-ports/conflicts',
          changes: [
            '支持查询参数过滤',
            '响应格式标准化',
            '包含解决方案建议'
          ]
        }
      ],
      responseFormat: {
        v1: 'Inconsistent response formats across endpoints',
        v2: {
          success: 'boolean',
          data: 'any',
          error: 'string (optional)',
          message: 'string (optional)', 
          metadata: {
            timestamp: 'string',
            version: 'string',
            requestId: 'string'
          }
        }
      }
    },
    migrationSteps: [
      {
        step: 1,
        title: '评估当前使用情况',
        description: '识别所有使用v1 API的代码位置',
        tools: ['代码搜索工具', '日志分析']
      },
      {
        step: 2,
        title: '更新请求格式',
        description: '根据映射表更新请求参数和URL',
        examples: {
          before: 'POST /api/port-management/allocate',
          after: 'POST /api/v2-ports/allocations'
        }
      },
      {
        step: 3,
        title: '更新响应处理',
        description: '适配新的响应格式',
        examples: {
          before: 'response.data.port',
          after: 'response.data.port, response.data.allocationId'
        }
      },
      {
        step: 4,
        title: '添加错误处理',
        description: '利用新的标准化错误响应格式',
        examples: {
          errorHandling: 'Check response.success and response.error fields'
        }
      },
      {
        step: 5,
        title: '测试和验证',
        description: '全面测试所有功能',
        checklist: [
          '端口分配功能',
          '端口释放功能', 
          '状态查询功能',
          '冲突检测功能',
          '错误处理'
        ]
      }
    ],
    codeExamples: {
      allocation: {
        v1: {
          javascript: `
// v1 API
const response = await fetch('/api/port-management/allocate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: 'app-123',
    appName: 'My App',
    type: 'frontend',
    protocol: 'http'
  })
});
const data = await response.json();
const port = data.data.port;`
        },
        v2: {
          javascript: `
// v2 API  
const response = await fetch('/api/v2-ports/allocations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appId: 'app-123',
    appName: 'My App',
    techStack: 'Vue.js',
    projectType: 'frontend',
    allocationType: 'frontend',
    protocol: 'http'
  })
});
const data = await response.json();
if (data.success) {
  const port = data.data.port;
  const allocationId = data.data.allocationId;
} else {
  console.error('Allocation failed:', data.error);
}`
        }
      }
    },
    automaticMigration: {
      available: true,
      description: '自动迁移工具可以帮助转换大部分代码',
      tool: '/api/migration-tools/converter',
      limitations: [
        '需要手动处理复杂的业务逻辑',
        '错误处理逻辑需要手动调整',
        '建议在测试环境中验证结果'
      ]
    },
    support: {
      documentation: '/api/v2-ports/docs',
      examples: '/api/examples',
      contact: 'support@example.com',
      migration_assistance: '可提供迁移协助服务'
    }
  });
});

// 自动迁移工具
router.post('/migration-tools/converter', (req, res) => {
  const { code, sourceVersion = 'v1', targetVersion = 'v2' } = req.body;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      error: 'Code is required for conversion'
    });
  }
  
  // 简单的代码转换示例
  let convertedCode = code;
  
  if (sourceVersion === 'v1' && targetVersion === 'v2') {
    // 基本的URL替换
    convertedCode = convertedCode
      .replace(/\/api\/port-management\/allocate/g, '/api/v2-ports/allocations')
      .replace(/\/api\/port-management\/([0-9]+)\/app\/([^\/]+)/g, '/api/v2-ports/allocations/$2') // 需要allocationId
      .replace(/\/api\/port-management\/([0-9]+)/g, '/api/v2-ports/$1/status')
      .replace(/\/api\/port-management\/conflicts\/detect/g, '/api/v2-ports/conflicts');
    
    // 响应处理的转换提示
    convertedCode += '\n\n// 注意：请手动更新响应处理逻辑以适配新的响应格式\n';
    convertedCode += '// 新格式：{ success: boolean, data: any, metadata: object }\n';
  }
  
  res.json({
    success: true,
    data: {
      originalCode: code,
      convertedCode,
      sourceVersion,
      targetVersion,
      warnings: [
        '这是基础的自动转换，可能需要手动调整',
        '请仔细检查错误处理逻辑',
        '建议在测试环境中验证结果'
      ],
      manualStepsRequired: [
        '更新请求体结构以包含必需的新字段',
        '适配新的响应格式',
        '更新错误处理逻辑',
        '测试所有功能'
      ]
    },
    metadata: {
      timestamp: new Date().toISOString(),
      version: 'v2.0.0'
    }
  });
});

// ===============================================================================
// 兼容性检查和警告
// ===============================================================================

// API兼容性检查
router.get('/compatibility-check', (req, res) => {
  const { endpoint, version = 'v1' } = req.query;
  
  const compatibilityInfo = {
    endpoint: endpoint as string,
    currentVersion: version,
    isDeprecated: version === 'v1',
    replacementAvailable: true,
    migrationRequired: version === 'v1',
    supportEndDate: '2025-06-30',
    recommendations: version === 'v1' ? [
      '尽快迁移到API v2',
      '查看迁移指南：/api/migration-guide',
      '使用迁移工具协助转换'
    ] : [
      'Already using the latest version'
    ]
  };
  
  res.json({
    success: true,
    data: compatibilityInfo,
    metadata: {
      timestamp: new Date().toISOString(),
      version: 'v2.0.0'
    }
  });
});

// ===============================================================================
// 初始化函数
// ===============================================================================

export function initializeApiAdapter(database: Database, configManager: ConfigManager) {
  try {
    // 初始化API v2
    initializeApiV2(database, configManager);
    
    logger.info('API Adapter initialized successfully', {
      supportedVersions: ['v1', 'v2'],
      defaultVersion: 'v1',
      recommendedVersion: 'v2'
    });
  } catch (error) {
    logger.error('Failed to initialize API Adapter', { error: error.message });
    throw error;
  }
}

// ===============================================================================
// 扩展Express Request类型
// ===============================================================================
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}

export default router;
