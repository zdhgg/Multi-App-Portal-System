/**
 * API v2 - 统一的RESTful API
 * 
 * 提供现代化、标准化的API接口
 */

import { Router, Request, Response } from 'express';
import { Database } from 'better-sqlite3';
import { logger } from '../../utils/logger';
import { ConfigManager } from '../../services/configManager';

// 导入v2子路由
import portsRouter from './ports';

const router = Router();

// 全局变量用于存储初始化后的依赖
let database: Database;
let configManager: ConfigManager;

// ===============================================================================
// 中间件
// ===============================================================================

// 标准响应格式中间件
interface StandardApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  metadata: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}

// 向后兼容的别名
interface ApiResponse extends StandardApiResponse {}

function standardResponseMiddleware(req: Request, res: Response, next: Function) {
  // 添加标准响应方法
  res.apiSuccess = (data: any, message?: string) => {
    const response: ApiResponse = {
      success: true,
      data,
      message,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v2.0.0',
        requestId: (req as any).id || (req as any).requestId || 'unknown'
      }
    };
    res.json(response);
  };

  res.apiError = (error: string, statusCode: number = 500) => {
    const response: ApiResponse = {
      success: false,
      error,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v2.0.0',
        requestId: (req as any).id || (req as any).requestId || 'unknown'
      }
    };
    res.status(statusCode).json(response);
  };

  next();
}

// 应用中间件
router.use(standardResponseMiddleware);

// ===============================================================================
// API v2 路由
// ===============================================================================

// API v2 根路径
router.get('/', (req: Request, res: Response) => {
  res.apiSuccess({
    name: 'Intelligent Multi-App Portal System API v2',
    description: '智能多应用门户系统统一RESTful API',
    version: 'v2.0.0',
    features: [
      '统一的响应格式',
      '标准化的错误处理',
      '完整的RESTful设计',
      '性能优化',
      '类型安全'
    ],
    endpoints: {
      ports: {
        allocations: 'POST /api/v2/ports/allocations',
        status: 'GET /api/v2/ports/{port}/status',
        conflicts: 'GET /api/v2/ports/conflicts',
        release: 'DELETE /api/v2/ports/allocations/{allocationId}'
      }
    },
    documentation: '/api/v2/docs'
  }, 'API v2 is running successfully');
});

// 挂载子路由
router.use('/ports', portsRouter);

// API文档路由
router.get('/docs', (req: Request, res: Response) => {
  res.apiSuccess({
    title: 'API v2 Documentation',
    version: 'v2.0.0',
    baseUrl: '/api/v2',
    authentication: 'Not required for current version',
    endpoints: [
      {
        path: '/ports/allocations',
        method: 'POST',
        description: '分配端口给应用程序',
        requestBody: {
          appId: 'string (required)',
          appName: 'string (required)',
          techStack: 'string (required)',
          projectType: 'string (required)',
          allocationType: 'string (required)',
          protocol: 'string (optional, default: http)'
        },
        responses: {
          200: {
            success: true,
            data: {
              port: 'number',
              allocationId: 'string',
              confidence: 'number',
              source: 'string'
            }
          }
        }
      },
      {
        path: '/ports/{port}/status',
        method: 'GET',
        description: '查询端口状态信息',
        parameters: {
          port: 'number (path parameter)'
        },
        responses: {
          200: {
            success: true,
            data: {
              port: 'number',
              status: 'string',
              applicationInfo: 'object'
            }
          }
        }
      },
      {
        path: '/ports/conflicts',
        method: 'GET',
        description: '检测端口冲突',
        parameters: {
          includeResolutions: 'boolean (query, optional)'
        },
        responses: {
          200: {
            success: true,
            data: {
              conflicts: 'array',
              resolutions: 'array (optional)'
            }
          }
        }
      }
    ]
  }, 'API documentation retrieved successfully');
});

// ===============================================================================
// 错误处理
// ===============================================================================

// 404处理
router.use('*', (req: Request, res: Response) => {
  res.apiError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 404);
});

// 错误处理中间件
router.use((error: Error, req: Request, res: Response, next: Function) => {
  logger.error('API v2 Error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });
  
  res.apiError('Internal server error', 500);
});

// ===============================================================================
// 初始化函数
// ===============================================================================

export function initializeApiV2(db: Database, config: ConfigManager): void {
  try {
    database = db;
    configManager = config;
    
    logger.info('API v2 initialized successfully', {
      version: 'v2.0.0',
      features: ['ports', 'documentation', 'error-handling']
    });
  } catch (error) {
    logger.error('Failed to initialize API v2', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

// 获取初始化的依赖
export function getDependencies() {
  return { database, configManager };
}

// ===============================================================================
// TypeScript类型扩展
// ===============================================================================

// Response types already declared in standardResponse.ts - removed duplicate declaration

export default router;
