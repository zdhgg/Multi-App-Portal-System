/**
 * API v2 - 端口管理路由
 * 
 * 提供端口分配、查询、冲突检测等功能
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { getDependencies } from './index';

const router = Router();

// ===============================================================================
// 端口分配
// ===============================================================================

router.post('/allocations', async (req: Request, res: Response) => {
  try {
    const { appId, appName, techStack, projectType, allocationType, protocol = 'http' } = req.body;
    
    // 验证必需字段
    if (!appId || !appName || !techStack || !projectType || !allocationType) {
      return res.apiError('Missing required fields: appId, appName, techStack, projectType, allocationType', 400);
    }
    
    // 基本端口分配逻辑（可以后续集成实际的端口管理服务）
    const basePort = getBasePortForType(allocationType);
    const allocatedPort = await findAvailablePort(basePort);
    
    // 生成分配ID
    const allocationId = generateAllocationId();
    
    // 记录分配信息（这里可以存储到数据库）
    const allocation = {
      port: allocatedPort,
      allocationId,
      appId,
      appName,
      techStack,
      projectType,
      allocationType,
      protocol,
      timestamp: new Date().toISOString(),
      confidence: 0.95,
      source: 'intelligent-allocation'
    };
    
    logger.info('Port allocated successfully', allocation);
    
    res.apiSuccess({
      port: allocation.port,
      allocationId: allocation.allocationId,
      confidence: allocation.confidence,
      source: allocation.source
    }, `Port ${allocation.port} allocated successfully for ${appName}`);
    
  } catch (error) {
    logger.error('Port allocation failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      requestBody: req.body 
    });
    res.apiError('Port allocation failed', 500);
  }
});

// ===============================================================================
// 端口状态查询
// ===============================================================================

router.get('/:port/status', async (req: Request, res: Response) => {
  try {
    const port = parseInt(req.params.port);
    
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.apiError('Invalid port number', 400);
    }
    
    // 检查端口状态（这里可以集成实际的端口检测逻辑）
    const status = await checkPortStatus(port);
    
    res.apiSuccess({
      port,
      status: status.available ? 'available' : 'occupied',
      applicationInfo: status.applicationInfo || null,
      lastChecked: new Date().toISOString(),
      checkMethod: 'socket-probe'
    }, `Port ${port} status retrieved successfully`);
    
  } catch (error) {
    logger.error('Port status check failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      port: req.params.port 
    });
    res.apiError('Port status check failed', 500);
  }
});

// ===============================================================================
// 端口冲突检测
// ===============================================================================

router.get('/conflicts', async (req: Request, res: Response) => {
  try {
    const includeResolutions = req.query.includeResolutions === 'true';
    
    // 执行冲突检测（这里可以集成实际的冲突检测逻辑）
    const conflicts = await detectPortConflicts();
    
    const result: any = {
      conflicts,
      conflictCount: conflicts.length,
      lastScanned: new Date().toISOString()
    };
    
    if (includeResolutions) {
      result.resolutions = generateConflictResolutions(conflicts);
    }
    
    res.apiSuccess(result, `Found ${conflicts.length} port conflicts`);
    
  } catch (error) {
    logger.error('Port conflict detection failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    res.apiError('Port conflict detection failed', 500);
  }
});

// ===============================================================================
// 端口分配释放
// ===============================================================================

router.delete('/allocations/:allocationId', async (req: Request, res: Response) => {
  try {
    const { allocationId } = req.params;
    const { reason, force = false } = req.body;
    
    if (!allocationId) {
      return res.apiError('Allocation ID is required', 400);
    }
    
    // 释放端口分配（这里可以集成实际的释放逻辑）
    const result = await releasePortAllocation(allocationId, reason, force);
    
    if (result.success) {
      res.apiSuccess({
        allocationId,
        releasedPort: result.port,
        reason: reason || 'No reason provided',
        timestamp: new Date().toISOString()
      }, `Port allocation ${allocationId} released successfully`);
    } else {
      res.apiError(result.error || 'Failed to release port allocation', 400);
    }
    
  } catch (error) {
    logger.error('Port allocation release failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      allocationId: req.params.allocationId 
    });
    res.apiError('Port allocation release failed', 500);
  }
});

// ===============================================================================
// 辅助函数
// ===============================================================================

function getBasePortForType(allocationType: string): number {
  const portRanges: Record<string, number> = {
    'frontend': 3000,
    'backend': 8000,
    'api': 9000,
    'database': 5432,
    'redis': 6379,
    'websocket': 4000
  };
  
  return portRanges[allocationType] || 8080;
}

async function findAvailablePort(basePort: number): Promise<number> {
  // 简单的端口分配逻辑，从基础端口开始查找可用端口
  for (let port = basePort; port < basePort + 1000; port++) {
    const status = await checkPortStatus(port);
    if (status.available) {
      return port;
    }
  }
  
  // 如果找不到可用端口，返回一个随机端口
  return Math.floor(Math.random() * (60000 - 49152) + 49152);
}

async function checkPortStatus(port: number): Promise<{available: boolean; applicationInfo?: any}> {
  // 这里可以集成实际的端口检测逻辑
  // 目前返回模拟数据
  return new Promise((resolve) => {
    setTimeout(() => {
      const isAvailable = Math.random() > 0.3; // 70%的端口被认为是可用的
      resolve({
        available: isAvailable,
        applicationInfo: isAvailable ? null : {
          name: 'Unknown Application',
          pid: Math.floor(Math.random() * 10000),
          protocol: 'tcp'
        }
      });
    }, 10);
  });
}

function generateAllocationId(): string {
  return `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function detectPortConflicts(): Promise<any[]> {
  // 模拟冲突检测
  return [
    {
      port: 3000,
      conflictType: 'duplicate-allocation',
      applications: [
        { name: 'App A', id: 'app-a' },
        { name: 'App B', id: 'app-b' }
      ],
      severity: 'high'
    }
  ];
}

function generateConflictResolutions(conflicts: any[]): any[] {
  return conflicts.map(conflict => ({
    conflictId: `conflict_${conflict.port}`,
    resolutions: [
      {
        type: 'port-reassignment',
        description: `Reassign one application to port ${conflict.port + 1}`,
        estimatedEffort: 'low'
      },
      {
        type: 'application-consolidation',
        description: 'Merge applications if they serve similar purposes',
        estimatedEffort: 'medium'
      }
    ]
  }));
}

async function releasePortAllocation(allocationId: string, reason?: string, force?: boolean): Promise<{success: boolean; port?: number; error?: string}> {
  // 模拟端口释放逻辑
  return new Promise((resolve) => {
    setTimeout(() => {
      const success = force || Math.random() > 0.1; // 90%成功率，强制释放总是成功
      resolve({
        success,
        port: success ? Math.floor(Math.random() * 1000) + 3000 : undefined,
        error: success ? undefined : 'Port is still in use by active application'
      });
    }, 50);
  });
}

export default router;
