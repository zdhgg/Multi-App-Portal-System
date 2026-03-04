/**
 * 统一鉴权中间件 - Phase 1 RBAC 实现
 * 
 * 提供：
 * - requireAuth: 要求登录认证
 * - requireRole: 要求特定角色（支持多角色）
 * - requireAdmin: 要求管理员权限
 * - requireOperator: 要求操作员或管理员权限
 * 
 * 紧急开关：环境变量 AUTH_ENFORCEMENT=off 可临时关闭（仅内网应急）
 */

import { Request, Response, NextFunction } from 'express';
import { authSecurityEnhancer } from '../core/security/AuthSecurityEnhancer.js';
import { logger } from '../utils/logger.js';
import { auditLogService } from '../services/auditLogService.js';

// ===============================================================================
// 类型定义
// ===============================================================================

export type UserRole = 'admin' | 'operator' | 'guest';

export interface AuthContext {
  userId: string;
  username?: string;
  role: UserRole;
  jti?: string;
  isMock?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// ===============================================================================
// 配置
// ===============================================================================

const isAuthEnforcementEnabled = (): boolean => {
  const enforcement = process.env.AUTH_ENFORCEMENT?.toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  // 默认启用，只有明确设置为 'off' 或 'false' 才关闭
  if (enforcement === 'off' || enforcement === 'false') {
    if (isProduction) {
      logger.error('生产环境禁止关闭认证，已强制启用 AUTH_ENFORCEMENT');
      return true;
    }
    logger.warn('⚠️ AUTH_ENFORCEMENT is disabled - security bypass active');
    return false;
  }
  return true;
};

// ===============================================================================
// 核心中间件
// ===============================================================================

/**
 * 要求登录认证
 * 
 * 验证 Bearer Token 并将用户信息写入 req.auth
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  // 紧急开关检查
  if (!isAuthEnforcementEnabled()) {
    // 模拟一个 admin 用户以便后续中间件不会失败
    req.auth = { userId: 'bypass-user', role: 'admin', username: 'bypass' };
    return next();
  }

  // 使用 AuthSecurityEnhancer 的中间件
  const authMiddleware = authSecurityEnhancer.authMiddleware(true);
  authMiddleware(req, res, (err?: any) => {
    if (err) {
      return next(err);
    }
    
    // 检查 auth 是否已设置
    if (!req.auth) {
      logger.warn('认证失败：req.auth 未设置', { 
        path: req.path, 
        method: req.method,
        ip: req.ip 
      });
      return res.status(401).json({
        success: false,
        message: '未提供有效的认证信息',
        code: 'UNAUTHORIZED'
      });
    }
    
    next();
  });
};

/**
 * 要求特定角色（支持多角色）
 * 
 * @param allowedRoles 允许的角色列表
 * @returns Express 中间件
 * 
 * 使用示例：
 * - requireRole('admin') - 仅管理员
 * - requireRole('admin', 'operator') - 管理员或操作员
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 紧急开关检查
    if (!isAuthEnforcementEnabled()) {
      return next();
    }

    // 必须先通过认证
    if (!req.auth) {
      logger.warn('角色检查失败：未认证', { 
        path: req.path, 
        method: req.method,
        requiredRoles: allowedRoles 
      });
      return res.status(401).json({
        success: false,
        message: '未提供有效的认证信息',
        code: 'UNAUTHORIZED'
      }) as any;
    }

    const userRole = req.auth.role;
    
    // admin 拥有所有权限
    if (userRole === 'admin') {
      return next();
    }

    // 检查用户角色是否在允许列表中
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // 权限不足
    logger.warn('权限不足', {
      userId: req.auth.userId,
      userRole,
      requiredRoles: allowedRoles,
      path: req.path,
      method: req.method
    });

    return res.status(403).json({
      success: false,
      message: '权限不足，您没有访问此资源的权限',
      code: 'FORBIDDEN',
      details: {
        required: allowedRoles,
        current: userRole
      }
    }) as any;
  };
};

/**
 * 要求管理员权限
 * 
 * 等价于 requireRole('admin')
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  requireRole('admin')(req, res, next);
};

/**
 * 要求操作员或管理员权限
 * 
 * 等价于 requireRole('admin', 'operator')
 */
export const requireOperator = (req: Request, res: Response, next: NextFunction): void => {
  requireRole('admin', 'operator')(req, res, next);
};

// ===============================================================================
// 组合中间件（便捷方法）
// ===============================================================================

/**
 * 认证 + 管理员权限
 */
export const authAdmin = [requireAuth, requireAdmin];

/**
 * 认证 + 操作员权限（含管理员）
 */
export const authOperator = [requireAuth, requireOperator];

/**
 * 仅认证（任何登录用户）
 */
export const authOnly = [requireAuth];

// ===============================================================================
// 细粒度权限检查（用于特定 API 的读写分离）
// ===============================================================================

/**
 * 检查是否为只读操作
 */
export const isReadOnlyMethod = (method: string): boolean => {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
};

/**
 * 操作员只读中间件
 * 
 * - GET/HEAD/OPTIONS: operator 和 admin 都可以
 * - POST/PUT/PATCH/DELETE: 仅 admin 可以
 */
export const operatorReadOnly = (req: Request, res: Response, next: NextFunction): void => {
  // 紧急开关检查
  if (!isAuthEnforcementEnabled()) {
    return next();
  }

  if (!req.auth) {
    return res.status(401).json({
      success: false,
      message: '未提供有效的认证信息',
      code: 'UNAUTHORIZED'
    }) as any;
  }

  const userRole = req.auth.role;
  
  // admin 拥有所有权限
  if (userRole === 'admin') {
    return next();
  }

  // operator 只能执行只读操作
  if (userRole === 'operator') {
    if (isReadOnlyMethod(req.method)) {
      return next();
    }
    
    logger.warn('Operator 尝试写操作', {
      userId: req.auth.userId,
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      success: false,
      message: '操作员只有只读权限，无法执行此操作',
      code: 'FORBIDDEN',
      details: {
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        attemptedMethod: req.method
      }
    }) as any;
  }

  // guest 无权限
  return res.status(403).json({
    success: false,
    message: '权限不足',
    code: 'FORBIDDEN'
  }) as any;
};

// ===============================================================================
// 路由级权限配置类型
// ===============================================================================

export interface RoutePermission {
  path: string;
  methods?: string[];  // 默认所有方法
  roles: UserRole[];
  description?: string;
}

/**
 * 创建基于配置的权限中间件
 * 
 * @param permissions 路由权限配置
 */
export const createPermissionMiddleware = (permissions: RoutePermission[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isAuthEnforcementEnabled()) {
      return next();
    }

    const matchedPermission = permissions.find(p => {
      const pathMatch = req.path.startsWith(p.path) || req.path === p.path;
      const methodMatch = !p.methods || p.methods.includes(req.method.toUpperCase());
      return pathMatch && methodMatch;
    });

    if (!matchedPermission) {
      // 没有匹配的权限配置，默认需要 admin
      return requireAdmin(req, res, next);
    }

    // 应用匹配的角色要求
    return requireRole(...matchedPermission.roles)(req, res, next);
  };
};

// ===============================================================================
// 日志和审计
// ===============================================================================

/**
 * 审计日志中间件
 * 
 * 记录敏感操作到日志（使用 auditLogService 持久化）
 */
export const auditLog = (action: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    // 响应完成后记录
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const success = res.statusCode < 400;
      
      // 使用审计日志服务持久化记录
      auditLogService.log({
        action,
        userId: req.auth?.userId || 'anonymous',
        username: req.auth?.username,
        userRole: req.auth?.role || 'guest',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: (req.ip || req.socket.remoteAddress || 'unknown'),
        userAgent: req.headers['user-agent'],
        success,
        details: {
          query: req.query,
          params: req.params
        }
      }).catch(err => {
        logger.error('审计日志记录失败', { error: err, action });
      });
    });

    next();
  };
};

export default {
  requireAuth,
  requireRole,
  requireAdmin,
  requireOperator,
  authAdmin,
  authOperator,
  authOnly,
  operatorReadOnly,
  auditLog,
  isAuthEnforcementEnabled
};
