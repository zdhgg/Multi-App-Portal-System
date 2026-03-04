-- =============================================================================
-- Migration 001: Add Build Configuration Support
-- =============================================================================
-- 为应用表添加构建配置相关字段，支持智能化前端构建功能
-- =============================================================================

-- 检查是否已经存在构建配置字段
-- SQLite 不支持 IF NOT EXISTS 对列，所以我们需要在代码中处理

-- 为 applications 表添加构建配置字段
ALTER TABLE applications ADD COLUMN build_tool TEXT;
ALTER TABLE applications ADD COLUMN build_script TEXT;
ALTER TABLE applications ADD COLUMN build_output_dir TEXT;
ALTER TABLE applications ADD COLUMN build_config_file TEXT;
ALTER TABLE applications ADD COLUMN build_features TEXT; -- JSON: {hasCodeSplitting, hasMinification, hasSourceMap}
ALTER TABLE applications ADD COLUMN build_last_analysis INTEGER; -- Unix timestamp
ALTER TABLE applications ADD COLUMN build_confidence REAL; -- 0.0 - 1.0

-- =============================================================================
-- BUILD_ANALYSES TABLE - 构建分析历史记录
-- =============================================================================
CREATE TABLE IF NOT EXISTS build_analyses (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    build_tool TEXT NOT NULL,
    build_script TEXT NOT NULL,
    output_dir TEXT NOT NULL,
    config_file TEXT,
    
    -- 构建特性 JSON
    -- Structure: {hasCodeSplitting: boolean, hasMinification: boolean, hasSourceMap: boolean, customConfig?: any}
    features TEXT NOT NULL DEFAULT '{}',
    
    -- 优化建议 JSON
    -- Structure: Array<{type: string, description: string, priority: string, config: any}>
    optimizations TEXT NOT NULL DEFAULT '[]',
    
    -- 部署策略 JSON
    -- Structure: {type: string, description: string, benefits: string[], requirements?: string[]}
    deployment_strategy TEXT NOT NULL DEFAULT '{}',
    
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    
    -- 发现的问题 JSON
    -- Structure: Array<string>
    issues TEXT NOT NULL DEFAULT '[]',
    
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_build_analyses_app_id ON build_analyses(app_id);
CREATE INDEX IF NOT EXISTS idx_build_analyses_build_tool ON build_analyses(build_tool);
CREATE INDEX IF NOT EXISTS idx_build_analyses_created_at ON build_analyses(created_at);

-- =============================================================================
-- BUILD_OPTIMIZATIONS TABLE - 构建优化配置
-- =============================================================================
CREATE TABLE IF NOT EXISTS build_optimizations (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    optimization_type TEXT NOT NULL, -- code-splitting, minification, sourcemap, caching, etc.
    description TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    
    -- 优化配置 JSON
    config TEXT NOT NULL DEFAULT '{}',
    
    -- 应用状态
    applied BOOLEAN DEFAULT FALSE,
    applied_at INTEGER,
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_build_optimizations_app_id ON build_optimizations(app_id);
CREATE INDEX IF NOT EXISTS idx_build_optimizations_type ON build_optimizations(optimization_type);
CREATE INDEX IF NOT EXISTS idx_build_optimizations_priority ON build_optimizations(priority);
CREATE INDEX IF NOT EXISTS idx_build_optimizations_applied ON build_optimizations(applied);

-- =============================================================================
-- BUILD_EXECUTION_HISTORY TABLE - 构建执行历史
-- =============================================================================
CREATE TABLE IF NOT EXISTS build_execution_history (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    analysis_id TEXT, -- 关联的分析记录
    
    -- 执行信息
    build_command TEXT NOT NULL,
    execution_status TEXT NOT NULL CHECK (execution_status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
    
    -- 执行结果
    output_path TEXT,
    build_size INTEGER, -- 构建产物大小（字节）
    build_time INTEGER, -- 构建耗时（毫秒）
    
    -- 执行日志和错误信息
    stdout_log TEXT,
    stderr_log TEXT,
    error_message TEXT,
    
    -- 时间戳
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    
    -- 执行环境信息
    node_version TEXT,
    npm_version TEXT,
    
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (analysis_id) REFERENCES build_analyses(id) ON DELETE SET NULL
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_build_execution_app_id ON build_execution_history(app_id);
CREATE INDEX IF NOT EXISTS idx_build_execution_status ON build_execution_history(execution_status);
CREATE INDEX IF NOT EXISTS idx_build_execution_started_at ON build_execution_history(started_at);

-- =============================================================================
-- 更新现有应用的默认构建配置
-- =============================================================================
-- 为现有的前端应用设置默认构建配置
UPDATE applications 
SET 
    build_script = 'npm run build',
    build_output_dir = 'dist',
    build_last_analysis = strftime('%s', 'now'),
    build_confidence = 0.5
WHERE tech_stack IN ('React', 'Vue', 'Angular', 'Next.js', 'Nuxt.js', 'Vite', 'Svelte');

-- 为 Vite 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Vite',
    build_config_file = 'vite.config.ts',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'Vite';

-- 为 Next.js 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Next.js',
    build_output_dir = '.next',
    build_config_file = 'next.config.js',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'Next.js';

-- 为 Nuxt.js 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Nuxt.js',
    build_output_dir = '.nuxt',
    build_config_file = 'nuxt.config.js',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'Nuxt.js';

-- 为 React 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Create React App',
    build_output_dir = 'build',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'React';

-- 为 Vue 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Vue CLI',
    build_config_file = 'vue.config.js',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'Vue';

-- 为 Angular 项目设置特定配置
UPDATE applications 
SET 
    build_tool = 'Angular CLI',
    build_config_file = 'angular.json',
    build_features = '{"hasCodeSplitting": true, "hasMinification": true, "hasSourceMap": true}'
WHERE tech_stack = 'Angular';
