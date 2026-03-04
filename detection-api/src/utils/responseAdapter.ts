/**
 * 前端适配层 - 确保响应格式变更对前端无感知
 * 
 * 提供传统格式与标准格式之间的转换，支持渐进式迁移
 */

import { StandardApiResponse } from '../middleware/standardResponse';

// ===============================================================================
// 类型定义
// ===============================================================================

/**
 * 传统API响应格式（多种变体）
 */
export type LegacyApiResponse = 
  | { data: any }                                    // 格式1: 只有data
  | { success: boolean; data: any; timestamp?: string } // 格式2: 简单success格式
  | { error: string; message?: string }             // 格式3: 错误格式
  | { success: boolean; data: any; message?: string; timestamp?: string } // 格式4: 完整格式
  | any; // 其他格式

/**
 * 前端期望的响应格式（向后兼容）
 */
export interface FrontendCompatibleResponse {
  success?: boolean;
  data?: any;
  error?: string;
  message?: string;
  timestamp?: string;
  // 可选的新标准字段
  metadata?: {
    timestamp: string;
    version: string;
    requestId: string;
    processingTime?: number;
  };
}

// ===============================================================================
// 响应格式适配器
// ===============================================================================

/**
 * 将标准响应转换为前端兼容格式
 */
export function adaptToFrontendFormat(standardResponse: StandardApiResponse): FrontendCompatibleResponse {
  const adapted: FrontendCompatibleResponse = {
    success: standardResponse.success,
    data: standardResponse.data,
    error: standardResponse.error,
    message: standardResponse.message,
    timestamp: standardResponse.metadata.timestamp,
    metadata: standardResponse.metadata
  };

  // 清理undefined字段
  Object.keys(adapted).forEach(key => {
    if (adapted[key as keyof FrontendCompatibleResponse] === undefined) {
      delete adapted[key as keyof FrontendCompatibleResponse];
    }
  });

  return adapted;
}

/**
 * 将传统响应转换为标准格式
 */
export function adaptToStandardFormat(legacyResponse: LegacyApiResponse): StandardApiResponse {
  const generateRequestId = () => `adapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 如果已经是标准格式，直接返回
  if (legacyResponse && 
      typeof legacyResponse === 'object' && 
      'metadata' in legacyResponse && 
      legacyResponse.metadata &&
      'timestamp' in legacyResponse.metadata) {
    return legacyResponse as StandardApiResponse;
  }

  const standardResponse: StandardApiResponse = {
    success: true,
    metadata: {
      timestamp: new Date().toISOString(),
      version: 'v2.0.0',
      requestId: generateRequestId()
    }
  };

  if (!legacyResponse || typeof legacyResponse !== 'object') {
    // 原始值直接作为data
    standardResponse.data = legacyResponse;
    return standardResponse;
  }

  // 处理各种传统格式
  if ('success' in legacyResponse && typeof legacyResponse.success === 'boolean') {
    standardResponse.success = legacyResponse.success;
  }

  if ('data' in legacyResponse) {
    standardResponse.data = legacyResponse.data;
  }

  if ('error' in legacyResponse) {
    standardResponse.success = false;
    standardResponse.error = legacyResponse.error;
  }

  if ('message' in legacyResponse) {
    standardResponse.message = legacyResponse.message;
  }

  // 如果没有data字段且不是错误，将整个对象作为data
  if (!('data' in legacyResponse) && !('error' in legacyResponse)) {
    standardResponse.data = legacyResponse;
  }

  return standardResponse;
}

// ===============================================================================
// Express中间件适配器
// ===============================================================================

/**
 * 为传统端点提供标准响应格式的中间件
 */
export function legacyResponseAdapter() {
  return (req: any, res: any, next: any) => {
    const originalJson = res.json;

    res.json = function(data: any) {
      // 如果已经使用了新的响应方法，直接调用原始方法
      if (res.headersSent || (data && data.metadata && data.metadata.version === 'v2.0.0')) {
        return originalJson.call(this, data);
      }

      // 转换传统格式为标准格式
      const standardResponse = adaptToStandardFormat(data);
      return originalJson.call(this, standardResponse);
    };

    next();
  };
}

// ===============================================================================
// 前端兼容性检测
// ===============================================================================

/**
 * 检测前端是否支持新的标准响应格式
 */
export function detectFrontendCapability(req: any): {
  supportsStandardFormat: boolean;
  preferredFormat: 'standard' | 'legacy';
  clientVersion?: string;
} {
  const userAgent = req.headers['user-agent'] || '';
  const apiVersion = req.headers['api-version'] || req.query.apiVersion;
  const clientVersion = req.headers['client-version'];

  // 检测标准格式支持
  const supportsStandardFormat = 
    apiVersion === 'v2' || 
    apiVersion === 'v2.0' || 
    req.headers['accept-standard-format'] === 'true' ||
    clientVersion && parseVersion(clientVersion) >= parseVersion('2.0.0');

  return {
    supportsStandardFormat,
    preferredFormat: supportsStandardFormat ? 'standard' : 'legacy',
    clientVersion
  };
}

/**
 * 解析版本号为数字
 */
function parseVersion(version: string): number {
  const parts = version.split('.').map(Number);
  return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

// ===============================================================================
// 响应格式协商中间件
// ===============================================================================

/**
 * 响应格式协商中间件 - 根据客户端能力选择合适的响应格式
 */
export function responseFormatNegotiator() {
  return (req: any, res: any, next: any) => {
    const capability = detectFrontendCapability(req);

    // 添加格式协商信息到请求对象
    req.responseFormat = capability;

    // 如果客户端不支持标准格式，提供兼容性包装
    if (!capability.supportsStandardFormat) {
      const originalApiSuccess = res.apiSuccess;
      const originalApiError = res.apiError;

      if (originalApiSuccess) {
        res.apiSuccess = function(data: any, message?: string, options?: any) {
          // 调用原始方法获取标准响应
          const originalJson = res.json;
          res.json = function(standardResponse: StandardApiResponse) {
            // 转换为前端兼容格式
            const compatibleResponse = adaptToFrontendFormat(standardResponse);
            return originalJson.call(this, compatibleResponse);
          };
          
          return originalApiSuccess.call(this, data, message, options);
        };
      }

      if (originalApiError) {
        res.apiError = function(error: string, statusCode?: number, data?: any) {
          const originalJson = res.json;
          res.json = function(standardResponse: StandardApiResponse) {
            const compatibleResponse = adaptToFrontendFormat(standardResponse);
            return originalJson.call(this, compatibleResponse);
          };
          
          return originalApiError.call(this, error, statusCode, data);
        };
      }
    }

    next();
  };
}

// ===============================================================================
// 工具函数
// ===============================================================================

/**
 * 检查响应是否为标准格式
 */
export function isStandardFormat(response: any): response is StandardApiResponse {
  return response && 
         typeof response === 'object' &&
         typeof response.success === 'boolean' &&
         response.metadata &&
         typeof response.metadata === 'object' &&
         response.metadata.timestamp &&
         response.metadata.version;
}

/**
 * 检查响应是否为传统格式
 */
export function isLegacyFormat(response: any): boolean {
  if (!response || typeof response !== 'object') {
    return true; // 原始值被认为是传统格式
  }
  
  return !isStandardFormat(response);
}

/**
 * 获取响应格式统计信息
 */
export function getFormatStats(responses: any[]): {
  total: number;
  standard: number;
  legacy: number;
  standardPercentage: number;
} {
  const total = responses.length;
  const standard = responses.filter(isStandardFormat).length;
  const legacy = total - standard;
  
  return {
    total,
    standard,
    legacy,
    standardPercentage: total > 0 ? (standard / total) * 100 : 0
  };
}

export default {
  adaptToFrontendFormat,
  adaptToStandardFormat,
  legacyResponseAdapter,
  responseFormatNegotiator,
  detectFrontendCapability,
  isStandardFormat,
  isLegacyFormat,
  getFormatStats
};
