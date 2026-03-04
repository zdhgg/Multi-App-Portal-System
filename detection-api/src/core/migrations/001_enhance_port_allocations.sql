-- Port Allocations Table Enhancement Migration
-- 增强端口分配表结构

-- 创建新的端口分配表（如果不存在）
CREATE TABLE IF NOT EXISTS port_allocations_new (
    port INTEGER PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('frontend', 'backend', 'api', 'websocket', 'database', 'other')),
    protocol TEXT NOT NULL DEFAULT 'tcp' CHECK (protocol IN ('http', 'https', 'ws', 'wss', 'tcp', 'udp')),
    app_id TEXT,
    app_name TEXT,
    status TEXT NOT NULL DEFAULT 'allocated' CHECK (status IN ('available', 'allocated', 'in_use', 'reserved', 'conflict')),
    process_id INTEGER,
    process_name TEXT,
    allocated_at INTEGER NOT NULL,
    last_checked INTEGER NOT NULL,
    description TEXT,
    
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- 如果旧表存在，迁移数据
INSERT OR IGNORE INTO port_allocations_new (port, app_id, allocated_at, last_checked)
SELECT 
    port, 
    allocated_to as app_id, 
    allocated_at,
    allocated_at as last_checked
FROM port_allocations
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='port_allocations');

-- 删除旧表并重命名新表
DROP TABLE IF EXISTS port_allocations;
ALTER TABLE port_allocations_new RENAME TO port_allocations;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_port_allocations_app_id ON port_allocations(app_id);
CREATE INDEX IF NOT EXISTS idx_port_allocations_status ON port_allocations(status);
CREATE INDEX IF NOT EXISTS idx_port_allocations_type ON port_allocations(type);
