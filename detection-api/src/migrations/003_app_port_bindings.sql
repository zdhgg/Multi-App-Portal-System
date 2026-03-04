-- =============================================================================
-- App Port Bindings Migration
-- 为应用端口绑定功能创建必要的数据库表
-- =============================================================================

-- 应用端口绑定主表
CREATE TABLE IF NOT EXISTS app_port_bindings (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL UNIQUE,
    app_name TEXT NOT NULL,
    tech_stack TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'allocated', 'active', 'error')) DEFAULT 'pending',
    priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')) DEFAULT 'normal',
    environment TEXT NOT NULL CHECK (environment IN ('development', 'testing', 'production')) DEFAULT 'development',
    tags TEXT, -- JSON数组
    auto_allocate BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT DEFAULT 'system',
    last_allocated_at DATETIME
);

-- 端口需求表
CREATE TABLE IF NOT EXISTS port_requirements (
    id TEXT PRIMARY KEY,
    binding_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('frontend', 'backend', 'api', 'websocket')),
    protocol TEXT NOT NULL CHECK (protocol IN ('http', 'https', 'ws', 'wss')),
    count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0 AND count <= 10),
    preferred_range TEXT CHECK (preferred_range IN ('frontend', 'backend', 'auto')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
);

-- 已分配端口表
CREATE TABLE IF NOT EXISTS allocated_ports (
    id TEXT PRIMARY KEY,
    binding_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    port INTEGER NOT NULL,
    type TEXT NOT NULL,
    protocol TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('allocated', 'active', 'inactive')) DEFAULT 'allocated',
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME,
    process_id INTEGER,
    last_verified DATETIME,
    verification_result TEXT,
    FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE,
    FOREIGN KEY (requirement_id) REFERENCES port_requirements(id) ON DELETE CASCADE,
    UNIQUE (port, status) -- 确保同一端口在同一状态下只能分配给一个应用
);

-- 端口分配历史表
CREATE TABLE IF NOT EXISTS port_allocation_history (
    id TEXT PRIMARY KEY,
    binding_id TEXT NOT NULL,
    port INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('allocate', 'release', 'verify', 'conflict')),
    result TEXT NOT NULL CHECK (result IN ('success', 'failed', 'conflict')),
    details TEXT, -- JSON格式的详细信息
    error_message TEXT,
    allocated_by TEXT DEFAULT 'system',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
);

-- 端口冲突记录表
CREATE TABLE IF NOT EXISTS port_binding_conflicts (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    existing_binding_id TEXT NOT NULL,
    new_binding_id TEXT NOT NULL,
    conflict_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
    auto_resolvable BOOLEAN DEFAULT false,
    suggested_actions TEXT, -- JSON数组
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolution TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'resolved', 'ignored')) DEFAULT 'active',
    FOREIGN KEY (existing_binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE,
    FOREIGN KEY (new_binding_id) REFERENCES app_port_bindings(id) ON DELETE CASCADE
);

-- 创建索引以提升查询性能
CREATE INDEX IF NOT EXISTS idx_app_port_bindings_app_id ON app_port_bindings(app_id);
CREATE INDEX IF NOT EXISTS idx_app_port_bindings_status ON app_port_bindings(status);
CREATE INDEX IF NOT EXISTS idx_app_port_bindings_tech_stack ON app_port_bindings(tech_stack);
CREATE INDEX IF NOT EXISTS idx_app_port_bindings_environment ON app_port_bindings(environment);
CREATE INDEX IF NOT EXISTS idx_app_port_bindings_created_at ON app_port_bindings(created_at);

CREATE INDEX IF NOT EXISTS idx_port_requirements_binding_id ON port_requirements(binding_id);
CREATE INDEX IF NOT EXISTS idx_port_requirements_type ON port_requirements(type);

CREATE INDEX IF NOT EXISTS idx_allocated_ports_binding_id ON allocated_ports(binding_id);
CREATE INDEX IF NOT EXISTS idx_allocated_ports_port ON allocated_ports(port);
CREATE INDEX IF NOT EXISTS idx_allocated_ports_status ON allocated_ports(status);
CREATE INDEX IF NOT EXISTS idx_allocated_ports_allocated_at ON allocated_ports(allocated_at);

CREATE INDEX IF NOT EXISTS idx_port_allocation_history_binding_id ON port_allocation_history(binding_id);
CREATE INDEX IF NOT EXISTS idx_port_allocation_history_port ON port_allocation_history(port);
CREATE INDEX IF NOT EXISTS idx_port_allocation_history_timestamp ON port_allocation_history(timestamp);

CREATE INDEX IF NOT EXISTS idx_port_binding_conflicts_port ON port_binding_conflicts(port);
CREATE INDEX IF NOT EXISTS idx_port_binding_conflicts_status ON port_binding_conflicts(status);
CREATE INDEX IF NOT EXISTS idx_port_binding_conflicts_detected_at ON port_binding_conflicts(detected_at);

-- 创建视图以简化查询
CREATE VIEW IF NOT EXISTS app_port_bindings_with_stats AS
SELECT 
    apb.*,
    COUNT(DISTINCT pr.id) as requirement_count,
    COUNT(DISTINCT ap.id) as allocated_port_count,
    COUNT(DISTINCT CASE WHEN ap.status = 'active' THEN ap.id END) as active_port_count,
    COUNT(DISTINCT CASE WHEN pbc.status = 'active' THEN pbc.id END) as conflict_count
FROM app_port_bindings apb
LEFT JOIN port_requirements pr ON apb.id = pr.binding_id
LEFT JOIN allocated_ports ap ON apb.id = ap.binding_id
LEFT JOIN port_binding_conflicts pbc ON (apb.id = pbc.existing_binding_id OR apb.id = pbc.new_binding_id)
GROUP BY apb.id;

-- 创建用于端口使用统计的视图
CREATE VIEW IF NOT EXISTS port_usage_statistics AS
SELECT 
    ap.port,
    ap.type,
    ap.protocol,
    ap.status,
    apb.app_name,
    apb.tech_stack,
    apb.environment,
    ap.allocated_at,
    ap.last_verified,
    CASE 
        WHEN ap.status = 'active' AND ap.last_verified > datetime('now', '-5 minutes') THEN 'healthy'
        WHEN ap.status = 'active' AND ap.last_verified <= datetime('now', '-5 minutes') THEN 'stale'
        WHEN ap.status = 'allocated' THEN 'allocated'
        ELSE 'inactive'
    END as health_status
FROM allocated_ports ap
JOIN app_port_bindings apb ON ap.binding_id = apb.id
WHERE ap.released_at IS NULL;

-- 插入一些默认数据
INSERT OR IGNORE INTO app_port_bindings (
    id, app_id, app_name, tech_stack, description, status, priority, environment, tags, auto_allocate
) VALUES 
    ('binding-portal-frontend', 'portal-frontend', '门户前端', 'Vue 3 + Vite', '主要的门户前端应用', 'allocated', 'high', 'production', '["前端项目", "核心应用"]', true),
    ('binding-detection-api', 'detection-api', '检测API服务', 'Node.js + Express', '应用检测和管理API服务', 'allocated', 'high', 'production', '["后端服务", "API服务", "核心应用"]', true);

INSERT OR IGNORE INTO port_requirements (
    id, binding_id, type, protocol, count, preferred_range, description
) VALUES 
    ('req-portal-frontend-1', 'binding-portal-frontend', 'frontend', 'http', 1, 'frontend', '前端开发服务器端口'),
    ('req-detection-api-1', 'binding-detection-api', 'backend', 'http', 1, 'backend', 'API服务主端口'),
    ('req-detection-api-2', 'binding-detection-api', 'websocket', 'ws', 1, 'backend', 'WebSocket实时通信端口');

INSERT OR IGNORE INTO allocated_ports (
    id, binding_id, requirement_id, port, type, protocol, status, allocated_at, last_verified
) VALUES 
    ('port-3000', 'binding-portal-frontend', 'req-portal-frontend-1', 3000, 'frontend', 'http', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('port-8001', 'binding-detection-api', 'req-detection-api-1', 8001, 'backend', 'http', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('port-8003', 'binding-detection-api', 'req-detection-api-2', 8003, 'websocket', 'ws', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 创建触发器以自动更新时间戳
CREATE TRIGGER IF NOT EXISTS update_app_port_bindings_timestamp
    AFTER UPDATE ON app_port_bindings
    FOR EACH ROW
BEGIN
    UPDATE app_port_bindings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_allocated_ports_timestamp
    AFTER UPDATE ON allocated_ports
    FOR EACH ROW
BEGIN
    UPDATE allocated_ports SET last_verified = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

