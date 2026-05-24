/**
 * API Routes - Clean Architecture
 * 
 * This router only handles basic health checks and API info.
 * All main functionality is handled by controllers through ServiceContainer.
 * 
 * Phase 1 RBAC: 权限控制已在此处统一配置
 */

import { Router } from 'express'
import healthRouter from './health'
import configRouter from './config'
import pm2Router from './pm2'
import logsRouter, { initLogService } from './logs'
import configExportRouter from './configurationExport'
import logManagementRouter from './logManagement'
import appConfigurationRouter from './appConfiguration'
import buildRouter, { initBuildService } from './build'
import filesystemRouter from './filesystem'
import {
  requireAuth,
  requireAdmin,
  operatorReadOnly,
  auditLog
} from '../middleware/authMiddleware.js'

const router = Router()

// Export init functions
export { initLogService }
export { initLogManagementService } from './logManagement'
export { initConfigService } from './appConfiguration'
export { initBuildService } from './build'

// ===============================================================================
// 公开接口（无需认证）
// ===============================================================================

// Basic health check - 公开
router.use('/health', healthRouter)

// ===============================================================================
// 认证后接口（按角色控制）
// ===============================================================================

// Configuration endpoints - operator只读，admin可写
router.use('/config', requireAuth, operatorReadOnly, configRouter)

// Configuration export/import and backup endpoints - 仅admin
router.use('/config-export', requireAuth, requireAdmin, auditLog('config-export'), configExportRouter)

// PM2 process management endpoints - 已在pm2Router内部处理细粒度权限
router.use('/pm2', pm2Router)

// App configuration endpoints - operator只读，admin可写
router.use('/app-configurations', requireAuth, operatorReadOnly, appConfigurationRouter)
// Backward-compatible alias for older portal builds and legacy docs.
router.use('/app-configuration', requireAuth, operatorReadOnly, appConfigurationRouter)

// Build analysis and history endpoints - 已在UnifiedApiRouter中处理（此处为legacy入口）
router.use('/build', requireAuth, operatorReadOnly, buildRouter)

// Logs management endpoints - operator可读，admin可写
router.use('/', requireAuth, operatorReadOnly, logsRouter)

// Log management endpoints (cleanup, archive, stats) - operator只读，admin可清理/归档
router.use('/log-management', requireAuth, operatorReadOnly, auditLog('log-management'), logManagementRouter)

// 🗂️ Filesystem operations - 仅admin（高危）
router.use('/filesystem', requireAuth, requireAdmin, auditLog('filesystem'), filesystemRouter)

// API root info
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: '智能多Web应用门户系统 - Clean Architecture API',
    version: '2.0.0',
    endpoints: {
      health: '/api/health',
      applications: '/api/applications',
      detection: '/api/detection',
      config: '/api/config',
      pm2: '/api/pm2'
    },
    architecture: {
      design: 'Clean Architecture',
      status: 'Legacy routes removed, using modern endpoints',
      documentation: 'See QUICK-START.md'
    },
    timestamp: new Date().toISOString()
  })
})

export default router
