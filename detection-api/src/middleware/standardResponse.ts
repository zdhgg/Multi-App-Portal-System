/**
 * 标准响应格式中间件
 * 
 * 提供统一的API响应格式，支持成功响应、错误响应和分页响应
 * 符合第一阶段制定的StandardApiResponse规范
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ===============================================================================
// 类型定义
// ===============================================================================

/**
 * 标准API响应接口
 */
export interface StandardApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  metadata: {
    timestamp: string;
    version: string;
    requestId: string;
    processingTime?: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * 分页选项
 */
export interface PaginationOptions {
  page: number;
  limit: number;
  total: number;
}

/**
 * 响应选项
 */
export interface ResponseOptions {
  statusCode?: number;
  pagination?: PaginationOptions;
  scanRange?: { startPort: number; endPort: number };
  totalPortsScanned?: number;
  activePortsFound?: number;
  [key: string]: any;
}

// ===============================================================================
// 辅助函数
// ===============================================================================

/**
 * 生成请求ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 计算分页信息
 */
function calculatePagination(options: PaginationOptions) {
  const { page, limit, total } = options;
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

// ===============================================================================
// 主中间件
// ===============================================================================

/**
 * 标准响应格式中间件
 * 
 * 为Express响应对象添加标准化方法：
 * - res.apiSuccess() - 成功响应
 * - res.apiError() - 错误响应  
 * - res.apiPaginated() - 分页响应
 */
export function standardResponseMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 设置请求开始时间
  req.startTime = Date.now();
  
  // 设置或获取请求ID
  req.requestId = req.requestId || req.headers['x-request-id'] as string || generateRequestId();

  /**
   * 成功响应方法
   */
  res.apiSuccess = <T>(data: T, message?: string, options: ResponseOptions = {}): void => {
    const { statusCode = 200, pagination } = options;
    
    const response: StandardApiResponse<T> = {
      success: true,
      data,
      message,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v2.0.0',
        requestId: req.requestId!,
        processingTime: Date.now() - (req.startTime || Date.now())
      }
    };

    // 如果有分页信息，添加分页数据
    if (pagination) {
      response.pagination = calculatePagination(pagination);
    }

    res.status(statusCode).json(response);
  };

  /**
   * 错误响应方法
   */
  res.apiError = (error: string, statusCode: number = 500, data?: any): void => {
    const response: StandardApiResponse = {
      success: false,
      error,
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v2.0.0',
        requestId: req.requestId!,
        processingTime: Date.now() - (req.startTime || Date.now())
      }
    };

    // 记录错误日志
    logger.error('API Error Response', {
      error,
      statusCode,
      requestId: req.requestId,
      url: req.url,
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    res.status(statusCode).json(response);
  };

  /**
   * 分页响应方法
   */
  res.apiPaginated = <T>(
    data: T[], 
    pagination: PaginationOptions, 
    message?: string
  ): void => {
    res.apiSuccess(data, message, { pagination });
  };

  /**
   * 资源创建成功响应
   */
  res.apiCreated = <T>(data: T, message?: string): void => {
    res.apiSuccess(data, message, { statusCode: 201 });
  };

  /**
   * 无内容成功响应
   */
  res.apiNoContent = (message?: string): void => {
    const response: StandardApiResponse = {
      success: true,
      message,
      metadata: {
        timestamp: new Date().toISOString(),
        version: 'v2.0.0',
        requestId: req.requestId!,
        processingTime: Date.now() - (req.startTime || Date.now())
      }
    };

    res.status(204).json(response);
  };

  next();
}

// ===============================================================================
// 专用错误响应方法
// ===============================================================================

/**
 * 常用错误响应的便捷方法
 */
export const ErrorResponses = {
  /**
   * 400 - 请求参数错误
   */
  badRequest: (res: Response, message: string = '请求参数错误', details?: any) => {
    res.apiError(message, 400, details);
  },

  /**
   * 401 - 未认证
   */
  unauthorized: (res: Response, message: string = '未认证或认证信息无效') => {
    res.apiError(message, 401);
  },

  /**
   * 403 - 权限不足
   */
  forbidden: (res: Response, message: string = '权限不足，无法访问此资源') => {
    res.apiError(message, 403);
  },

  /**
   * 404 - 资源不存在
   */
  notFound: (res: Response, message: string = '请求的资源不存在') => {
    res.apiError(message, 404);
  },

  /**
   * 409 - 资源冲突
   */
  conflict: (res: Response, message: string = '资源冲突', details?: any) => {
    res.apiError(message, 409, details);
  },

  /**
   * 422 - 业务逻辑错误
   */
  unprocessableEntity: (res: Response, message: string = '请求数据有效但业务逻辑不允许', details?: any) => {
    res.apiError(message, 422, details);
  },

  /**
   * 429 - 请求过于频繁
   */
  tooManyRequests: (res: Response, message: string = '请求过于频繁，请稍后重试') => {
    res.apiError(message, 429);
  },

  /**
   * 500 - 内部服务器错误
   */
  internalServerError: (res: Response, message: string = '内部服务器错误') => {
    res.apiError(message, 500);
  },

  /**
   * 503 - 服务不可用
   */
  serviceUnavailable: (res: Response, message: string = '服务暂时不可用，请稍后重试') => {
    res.apiError(message, 503);
  }
};

// ===============================================================================
// 传统响应格式适配器
// ===============================================================================

/**
 * 传统响应格式转换为标准格式
 */
export function adaptLegacyResponse(legacyResponse: any): StandardApiResponse {
  // 如果已经是标准格式，直接返回
  if (legacyResponse && typeof legacyResponse.success === 'boolean' && legacyResponse.metadata) {
    return legacyResponse;
  }

  // 转换传统格式
  const adapted: StandardApiResponse = {
    success: true,
    metadata: {
      timestamp: new Date().toISOString(),
      version: 'v2.0.0',
      requestId: generateRequestId()
    }
  };

  // 处理不同的传统格式
  if (legacyResponse && typeof legacyResponse === 'object') {
    // 格式1: { data: ... }
    if ('data' in legacyResponse) {
      adapted.data = legacyResponse.data;
    }
    
    // 格式2: { success: boolean, data: ..., timestamp: ... }
    if ('success' in legacyResponse) {
      adapted.success = legacyResponse.success;
    }
    
    // 格式3: { error: ... }
    if ('error' in legacyResponse) {
      adapted.success = false;
      adapted.error = legacyResponse.error;
    }
    
    // 格式4: { message: ... }
    if ('message' in legacyResponse) {
      adapted.message = legacyResponse.message;
    }
    
    // 如果没有data字段且不是错误，将整个对象作为data
    if (!('data' in legacyResponse) && !('error' in legacyResponse)) {
      adapted.data = legacyResponse;
    }
  } else {
    // 原始数据直接作为data
    adapted.data = legacyResponse;
  }

  return adapted;
}

// ===============================================================================
// Express类型扩展
// ===============================================================================

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
    
    interface Response {
      apiSuccess: <T>(data: T, message?: string, options?: ResponseOptions) => void;
      apiError: (error: string, statusCode?: number, data?: any) => void;
      apiPaginated: <T>(data: T[], pagination: PaginationOptions, message?: string) => void;
      apiCreated: <T>(data: T, message?: string) => void;
      apiNoContent: (message?: string) => void;
    }
  }
}

export default standardResponseMiddleware;
