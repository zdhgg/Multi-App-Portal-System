-- =============================================================================
-- Migration 004: Add Deployment Mode Tracking
-- =============================================================================
-- 为应用表添加运行模式字段，持久化应用的部署模式（开发/生产/未知）
-- =============================================================================

-- 添加 deployment_mode 字段到 applications 表
ALTER TABLE applications ADD COLUMN deployment_mode TEXT DEFAULT 'unknown' CHECK (deployment_mode IN ('development', 'production', 'unknown'));

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_applications_deployment_mode ON applications(deployment_mode);

-- =============================================================================
-- 说明：
-- - deployment_mode: 应用的部署模式
--   * 'development': 开发模式（npm run dev）
--   * 'production': 生产模式（PM2）
--   * 'unknown': 未知（离线或未确定）
-- =============================================================================

