-- 构建执行历史表
CREATE TABLE IF NOT EXISTS build_executions (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    build_tool TEXT NOT NULL,
    build_script TEXT NOT NULL,
    output_dir TEXT NOT NULL,
    environment TEXT DEFAULT 'production',
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
    progress INTEGER DEFAULT 0,
    current_step TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER,
    output_size INTEGER,
    error_message TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (app_id) REFERENCES applications (id) ON DELETE CASCADE
);

-- 构建执行日志表
CREATE TABLE IF NOT EXISTS build_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
    message TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('stdout', 'stderr', 'system')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (execution_id) REFERENCES build_executions (id) ON DELETE CASCADE
);

-- 构建产物表
CREATE TABLE IF NOT EXISTS build_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT,
    checksum TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (execution_id) REFERENCES build_executions (id) ON DELETE CASCADE
);

-- 构建队列表
CREATE TABLE IF NOT EXISTS build_queue (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    build_tool TEXT NOT NULL,
    build_script TEXT NOT NULL,
    output_dir TEXT NOT NULL,
    environment TEXT DEFAULT 'production',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    queue_time INTEGER NOT NULL,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    dependencies TEXT, -- JSON array of dependency IDs
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    execution_id TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (app_id) REFERENCES applications (id) ON DELETE CASCADE,
    FOREIGN KEY (execution_id) REFERENCES build_executions (id) ON DELETE SET NULL
);

-- PM2配置模板表
CREATE TABLE IF NOT EXISTS pm2_config_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    template_type TEXT NOT NULL CHECK (template_type IN ('unified', 'spa', 'ssr', 'static')),
    config_template TEXT NOT NULL, -- JSON template
    is_default BOOLEAN DEFAULT FALSE,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 构建优化应用记录表
CREATE TABLE IF NOT EXISTS build_optimization_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT NOT NULL,
    optimization_type TEXT NOT NULL,
    optimization_config TEXT NOT NULL, -- JSON config
    applied_at INTEGER NOT NULL,
    applied_by TEXT,
    status TEXT NOT NULL CHECK (status IN ('applied', 'reverted', 'failed')),
    before_config TEXT, -- JSON of config before optimization
    after_config TEXT, -- JSON of config after optimization
    performance_impact TEXT, -- JSON of performance metrics
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (app_id) REFERENCES applications (id) ON DELETE CASCADE
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_build_executions_app_id ON build_executions (app_id);
CREATE INDEX IF NOT EXISTS idx_build_executions_status ON build_executions (status);
CREATE INDEX IF NOT EXISTS idx_build_executions_start_time ON build_executions (start_time);
CREATE INDEX IF NOT EXISTS idx_build_execution_logs_execution_id ON build_execution_logs (execution_id);
CREATE INDEX IF NOT EXISTS idx_build_execution_logs_timestamp ON build_execution_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_build_artifacts_execution_id ON build_artifacts (execution_id);
CREATE INDEX IF NOT EXISTS idx_build_queue_app_id ON build_queue (app_id);
CREATE INDEX IF NOT EXISTS idx_build_queue_status ON build_queue (status);
CREATE INDEX IF NOT EXISTS idx_build_queue_priority ON build_queue (priority);
CREATE INDEX IF NOT EXISTS idx_build_queue_queue_time ON build_queue (queue_time);
CREATE INDEX IF NOT EXISTS idx_build_optimization_applications_app_id ON build_optimization_applications (app_id);
CREATE INDEX IF NOT EXISTS idx_build_optimization_applications_applied_at ON build_optimization_applications (applied_at);

-- 插入默认的PM2配置模板
INSERT OR IGNORE INTO pm2_config_templates (name, description, template_type, config_template, is_default) VALUES
('统一部署模板', '前端构建后与后端统一部署的PM2配置模板', 'unified', '{
  "name": "{{appName}}",
  "script": "{{backendScript}}",
  "cwd": "{{projectPath}}",
  "instances": 1,
  "exec_mode": "fork",
  "env": {
    "NODE_ENV": "production",
    "PORT": "{{port}}"
  },
  "log_file": "logs/{{appName}}.log",
  "error_file": "logs/{{appName}}-error.log",
  "out_file": "logs/{{appName}}-out.log",
  "time": true,
  "max_memory_restart": "500M",
  "watch": false,
  "ignore_watch": ["node_modules", "logs", "{{outputDir}}"],
  "restart_delay": 4000,
  "max_restarts": 10,
  "min_uptime": "10s"
}', TRUE),

('SPA应用模板', '单页应用的PM2配置模板，支持路由回退', 'spa', '{
  "name": "{{appName}}-spa",
  "script": "serve",
  "args": ["-s", "{{outputDir}}", "-l", "{{port}}"],
  "cwd": "{{projectPath}}",
  "instances": 1,
  "exec_mode": "fork",
  "env": {
    "NODE_ENV": "production"
  },
  "log_file": "logs/{{appName}}-spa.log",
  "error_file": "logs/{{appName}}-spa-error.log",
  "out_file": "logs/{{appName}}-spa-out.log",
  "time": true,
  "max_memory_restart": "200M",
  "watch": false,
  "restart_delay": 2000,
  "max_restarts": 10,
  "min_uptime": "5s"
}', FALSE),

('SSR应用模板', '服务端渲染应用的PM2配置模板', 'ssr', '{
  "name": "{{appName}}-ssr",
  "script": "{{ssrScript}}",
  "cwd": "{{projectPath}}",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": "{{port}}"
  },
  "log_file": "logs/{{appName}}-ssr.log",
  "error_file": "logs/{{appName}}-ssr-error.log",
  "out_file": "logs/{{appName}}-ssr-out.log",
  "time": true,
  "max_memory_restart": "1G",
  "watch": false,
  "restart_delay": 4000,
  "max_restarts": 10,
  "min_uptime": "10s"
}', FALSE),

('静态文件模板', '纯静态文件服务的PM2配置模板', 'static', '{
  "name": "{{appName}}-static",
  "script": "http-server",
  "args": ["{{outputDir}}", "-p", "{{port}}", "-c-1", "--cors"],
  "cwd": "{{projectPath}}",
  "instances": 1,
  "exec_mode": "fork",
  "env": {
    "NODE_ENV": "production"
  },
  "log_file": "logs/{{appName}}-static.log",
  "error_file": "logs/{{appName}}-static-error.log",
  "out_file": "logs/{{appName}}-static-out.log",
  "time": true,
  "max_memory_restart": "100M",
  "watch": false,
  "restart_delay": 2000,
  "max_restarts": 10,
  "min_uptime": "5s"
}', FALSE);

-- 创建触发器以自动更新 updated_at 字段
CREATE TRIGGER IF NOT EXISTS update_build_executions_updated_at
    AFTER UPDATE ON build_executions
    FOR EACH ROW
BEGIN
    UPDATE build_executions SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_build_queue_updated_at
    AFTER UPDATE ON build_queue
    FOR EACH ROW
BEGIN
    UPDATE build_queue SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_pm2_config_templates_updated_at
    AFTER UPDATE ON pm2_config_templates
    FOR EACH ROW
BEGIN
    UPDATE pm2_config_templates SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
