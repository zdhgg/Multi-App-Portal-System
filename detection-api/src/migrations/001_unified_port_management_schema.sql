-- ===============================================================================
-- 统一端口管理数据模型 - 第一阶段架构重构
-- ===============================================================================
-- 版本: 2.0.0
-- 创建时间: 2025-09-26
-- 说明: 整合所有端口管理功能到统一的数据模型中
-- ===============================================================================

-- 备份现有数据（如果表存在）
CREATE TABLE IF NOT EXISTS port_allocations_backup AS SELECT * FROM port_allocations WHERE 1=0;
INSERT OR IGNORE INTO port_allocations_backup SELECT * FROM port_allocations;

-- ===============================================================================
-- 核心端口分配表 - 统一的端口管理中心
-- ===============================================================================
DROP TABLE IF EXISTS unified_port_allocations;
CREATE TABLE unified_port_allocations (
    id TEXT PRIMARY KEY,
    port INTEGER UNIQUE NOT NULL,
    
    -- 应用信息
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    
    -- 端口分类和用途
    allocation_type TEXT NOT NULL CHECK(allocation_type IN ('frontend', 'backend', 'api', 'websocket', 'database', 'system', 'other')),
    protocol TEXT NOT NULL DEFAULT 'http' CHECK(protocol IN ('http', 'https', 'ws', 'wss', 'tcp', 'udp', 'grpc')),
    
    -- 状态管理
    status TEXT NOT NULL DEFAULT 'allocated' CHECK(status IN ('allocated', 'active', 'inactive', 'zombie', 'released', 'reserved', 'conflict')),
    
    -- 进程信息
    process_id INTEGER,
    process_name TEXT,
    process_command TEXT,
    
    -- 时间戳管理
    allocated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_verified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    released_at TIMESTAMP,
    
    -- 技术栈和配置
    tech_stack TEXT,
    configuration JSON,  -- 存储端口相关配置信息
    
    -- 元数据
    description TEXT,
    tags TEXT,  -- 逗号分隔的标签
    priority INTEGER DEFAULT 50,  -- 0-100，数值越高优先级越高
    
    -- 审计信息
    created_by TEXT DEFAULT 'system',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 外键约束
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- ===============================================================================
-- 端口配置范围表 - 管理不同类型的端口范围
-- ===============================================================================
DROP TABLE IF EXISTS port_ranges;
CREATE TABLE port_ranges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('frontend', 'backend', 'api', 'websocket', 'database', 'system', 'custom')),
    start_port INTEGER NOT NULL,
    end_port INTEGER NOT NULL,
    description TEXT,
    auto_allocate BOOLEAN DEFAULT 1,
    max_allocations INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CHECK(start_port <= end_port),
    CHECK(start_port > 0 AND end_port <= 65535)
);

-- ===============================================================================
-- 端口冲突记录表 - 增强的冲突检测和解决
-- ===============================================================================
DROP TABLE IF EXISTS port_conflicts;
CREATE TABLE port_conflicts (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    
    -- 冲突类型和严重程度
    conflict_type TEXT NOT NULL CHECK(conflict_type IN ('process', 'allocation', 'system', 'range', 'permission')),
    severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
    
    -- 冲突详情
    details TEXT NOT NULL,
    affected_apps TEXT,  -- JSON数组格式
    conflicting_process JSON,  -- 冲突进程的详细信息
    
    -- 解决方案
    resolution_status TEXT DEFAULT 'active' CHECK(resolution_status IN ('active', 'resolved', 'ignored', 'auto_resolved')),
    resolution_method TEXT,
    resolution_details TEXT,
    resolved_by TEXT,
    
    -- 时间信息
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    
    -- 自动重试信息
    auto_retry_count INTEGER DEFAULT 0,
    max_auto_retries INTEGER DEFAULT 3
);

-- ===============================================================================
-- 端口使用历史表 - 完整的操作审计
-- ===============================================================================
DROP TABLE IF EXISTS port_usage_history;
CREATE TABLE port_usage_history (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 操作类型
    action TEXT NOT NULL CHECK(action IN ('allocated', 'released', 'verified', 'conflict_detected', 'conflict_resolved', 'expired', 'force_released')),
    
    -- 操作结果和详情
    result TEXT NOT NULL CHECK(result IN ('success', 'failed', 'partial')),
    details TEXT,
    error_message TEXT,
    
    -- 性能指标
    response_time_ms INTEGER,
    verification_method TEXT,
    
    -- 上下文信息
    user_agent TEXT,
    initiated_by TEXT DEFAULT 'system',
    request_id TEXT,
    
    -- 时间戳
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_port_history_port (port),
    INDEX idx_port_history_app (app_id),
    INDEX idx_port_history_action (action),
    INDEX idx_port_history_timestamp (timestamp)
);

-- ===============================================================================
-- 端口性能监控表 - 实时性能数据
-- ===============================================================================
DROP TABLE IF EXISTS port_performance_metrics;
CREATE TABLE port_performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 性能指标
    response_time_ms INTEGER DEFAULT 0,
    throughput_mbps REAL DEFAULT 0,
    concurrent_connections INTEGER DEFAULT 0,
    error_rate REAL DEFAULT 0,  -- 0-1 之间的错误率
    cpu_usage_percent REAL DEFAULT 0,
    memory_usage_mb INTEGER DEFAULT 0,
    
    -- 网络指标
    bytes_sent INTEGER DEFAULT 0,
    bytes_received INTEGER DEFAULT 0,
    packets_sent INTEGER DEFAULT 0,
    packets_received INTEGER DEFAULT 0,
    
    -- 健康评分
    health_score INTEGER DEFAULT 100,  -- 0-100
    availability_percent REAL DEFAULT 100,  -- 0-100
    
    -- 采集信息
    collection_method TEXT DEFAULT 'auto',  -- auto, manual, api
    collection_interval_seconds INTEGER DEFAULT 300,
    
    -- 时间戳
    collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_performance_port (port),
    INDEX idx_performance_app (app_id),
    INDEX idx_performance_collected_at (collected_at)
);

-- ===============================================================================
-- 端口预留表 - 系统和用户端口预留
-- ===============================================================================
DROP TABLE IF EXISTS port_reservations;
CREATE TABLE port_reservations (
    id TEXT PRIMARY KEY,
    port_start INTEGER NOT NULL,
    port_end INTEGER NOT NULL,
    
    -- 预留信息
    reserved_for TEXT NOT NULL,  -- 'system', 'user', 'application'
    reservation_type TEXT NOT NULL CHECK(reservation_type IN ('permanent', 'temporary', 'conditional')),
    priority INTEGER DEFAULT 50,  -- 0-100
    
    -- 描述和原因
    reason TEXT NOT NULL,
    description TEXT,
    contact_info TEXT,
    
    -- 时间管理
    reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    auto_extend BOOLEAN DEFAULT 0,
    
    -- 状态
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'expired', 'revoked')),
    
    CHECK(port_start <= port_end),
    CHECK(port_start > 0 AND port_end <= 65535)
);

-- ===============================================================================
-- 智能分配规则表 - 基于规则的端口分配
-- ===============================================================================
DROP TABLE IF EXISTS port_allocation_rules;
CREATE TABLE port_allocation_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    
    -- 规则条件
    tech_stack_pattern TEXT,  -- 技术栈匹配模式
    app_name_pattern TEXT,    -- 应用名称匹配模式
    project_type TEXT,        -- 项目类型
    
    -- 分配策略
    preferred_range_id TEXT,  -- 引用 port_ranges 表
    allocation_strategy TEXT NOT NULL CHECK(allocation_strategy IN ('sequential', 'random', 'optimized', 'clustered')),
    avoid_ports TEXT,         -- JSON数组，要避免的端口
    
    -- 规则优先级和状态
    priority INTEGER DEFAULT 50,
    enabled BOOLEAN DEFAULT 1,
    
    -- 时间信息
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    
    FOREIGN KEY (preferred_range_id) REFERENCES port_ranges(id)
);

-- ===============================================================================
-- 创建索引以优化查询性能
-- ===============================================================================

-- 端口分配表索引
CREATE INDEX idx_unified_port_allocations_port ON unified_port_allocations(port);
CREATE INDEX idx_unified_port_allocations_app_id ON unified_port_allocations(app_id);
CREATE INDEX idx_unified_port_allocations_type ON unified_port_allocations(allocation_type);
CREATE INDEX idx_unified_port_allocations_status ON unified_port_allocations(status);
CREATE INDEX idx_unified_port_allocations_allocated_at ON unified_port_allocations(allocated_at);
CREATE INDEX idx_unified_port_allocations_last_verified ON unified_port_allocations(last_verified);
CREATE INDEX idx_unified_port_allocations_tech_stack ON unified_port_allocations(tech_stack);

-- 端口冲突表索引
CREATE INDEX idx_port_conflicts_port ON port_conflicts(port);
CREATE INDEX idx_port_conflicts_type ON port_conflicts(conflict_type);
CREATE INDEX idx_port_conflicts_severity ON port_conflicts(severity);
CREATE INDEX idx_port_conflicts_status ON port_conflicts(resolution_status);
CREATE INDEX idx_port_conflicts_detected_at ON port_conflicts(detected_at);

-- 端口范围表索引
CREATE INDEX idx_port_ranges_type ON port_ranges(type);
CREATE INDEX idx_port_ranges_start_end ON port_ranges(start_port, end_port);

-- 端口预留表索引
CREATE INDEX idx_port_reservations_range ON port_reservations(port_start, port_end);
CREATE INDEX idx_port_reservations_status ON port_reservations(status);
CREATE INDEX idx_port_reservations_expires_at ON port_reservations(expires_at);

-- 分配规则表索引
CREATE INDEX idx_port_allocation_rules_tech_stack ON port_allocation_rules(tech_stack_pattern);
CREATE INDEX idx_port_allocation_rules_priority ON port_allocation_rules(priority);
CREATE INDEX idx_port_allocation_rules_enabled ON port_allocation_rules(enabled);

-- ===============================================================================
-- 插入默认配置数据
-- ===============================================================================

-- 默认端口范围配置
INSERT INTO port_ranges (id, name, type, start_port, end_port, description, auto_allocate, max_allocations) VALUES
('frontend-default', '前端开发端口', 'frontend', 3001, 3100, '前端应用默认端口范围', 1, 50),
('backend-default', '后端服务端口', 'backend', 4001, 4100, '后端服务默认端口范围', 1, 50),
('api-default', 'API服务端口', 'api', 5001, 5100, 'RESTful API服务端口范围', 1, 30),
('websocket-default', 'WebSocket端口', 'websocket', 6001, 6100, 'WebSocket连接端口范围', 1, 20),
('database-default', '数据库端口', 'database', 7001, 7100, '数据库连接端口范围', 1, 10),
('system-reserved', '系统保留端口', 'system', 1, 1023, '系统和知名服务保留端口', 0, 0),
('custom-high', '用户自定义高端口', 'custom', 10000, 65535, '用户自定义端口范围', 1, 1000);

-- 系统端口预留
INSERT INTO port_reservations (id, port_start, port_end, reserved_for, reservation_type, reason, description) VALUES
('system-well-known', 1, 1023, 'system', 'permanent', '系统知名端口', '操作系统和标准服务使用的端口'),
('common-dev', 3000, 3000, 'system', 'permanent', '常用开发端口', 'Create React App等常用开发工具默认端口'),
('http-alt', 8000, 8001, 'system', 'permanent', 'HTTP替代端口', '常用的HTTP服务替代端口'),
('common-db', 3306, 3306, 'system', 'permanent', 'MySQL默认端口', 'MySQL数据库服务默认端口'),
('postgres-default', 5432, 5432, 'system', 'permanent', 'PostgreSQL默认端口', 'PostgreSQL数据库服务默认端口'),
('redis-default', 6379, 6379, 'system', 'permanent', 'Redis默认端口', 'Redis缓存服务默认端口'),
('mongodb-default', 27017, 27017, 'system', 'permanent', 'MongoDB默认端口', 'MongoDB数据库服务默认端口');

-- 默认分配规则
INSERT INTO port_allocation_rules (id, name, tech_stack_pattern, preferred_range_id, allocation_strategy, priority, enabled) VALUES
('vue-frontend', 'Vue.js前端应用', '%vue%', 'frontend-default', 'sequential', 90, 1),
('react-frontend', 'React前端应用', '%react%', 'frontend-default', 'sequential', 90, 1),
('angular-frontend', 'Angular前端应用', '%angular%', 'frontend-default', 'sequential', 90, 1),
('node-backend', 'Node.js后端服务', '%node%', 'backend-default', 'optimized', 80, 1),
('express-backend', 'Express后端服务', '%express%', 'backend-default', 'optimized', 80, 1),
('api-services', 'API服务', '%api%', 'api-default', 'clustered', 70, 1),
('websocket-services', 'WebSocket服务', '%websocket%', 'websocket-default', 'sequential', 60, 1);

-- ===============================================================================
-- 创建视图以简化常用查询
-- ===============================================================================

-- 活跃端口分配视图
CREATE VIEW active_port_allocations AS
SELECT 
    upa.*,
    pr.name as range_name,
    pr.type as range_type
FROM unified_port_allocations upa
LEFT JOIN port_ranges pr ON upa.port BETWEEN pr.start_port AND pr.end_port
WHERE upa.status IN ('allocated', 'active');

-- 端口使用统计视图
CREATE VIEW port_usage_statistics AS
SELECT 
    pr.name as range_name,
    pr.type as range_type,
    COUNT(upa.port) as allocated_count,
    pr.max_allocations as max_allocations,
    ROUND(COUNT(upa.port) * 100.0 / pr.max_allocations, 2) as usage_percentage
FROM port_ranges pr
LEFT JOIN unified_port_allocations upa ON upa.port BETWEEN pr.start_port AND pr.end_port 
    AND upa.status IN ('allocated', 'active')
GROUP BY pr.id, pr.name, pr.type, pr.max_allocations;

-- 冲突摘要视图
CREATE VIEW port_conflict_summary AS
SELECT 
    conflict_type,
    severity,
    COUNT(*) as conflict_count,
    COUNT(CASE WHEN resolution_status = 'active' THEN 1 END) as active_conflicts,
    COUNT(CASE WHEN resolution_status = 'resolved' THEN 1 END) as resolved_conflicts
FROM port_conflicts
GROUP BY conflict_type, severity;

-- ===============================================================================
-- 创建触发器以维护数据一致性
-- ===============================================================================

-- 自动更新 updated_at 字段
CREATE TRIGGER update_port_allocation_timestamp 
    AFTER UPDATE ON unified_port_allocations
BEGIN
    UPDATE unified_port_allocations 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- 端口释放时自动记录历史
CREATE TRIGGER log_port_release 
    AFTER UPDATE OF status ON unified_port_allocations
    WHEN OLD.status != 'released' AND NEW.status = 'released'
BEGIN
    INSERT INTO port_usage_history (id, port, app_id, action, result, details, initiated_by)
    VALUES (
        'release_' || NEW.port || '_' || strftime('%s', 'now'),
        NEW.port,
        NEW.app_id,
        'released',
        'success',
        'Port automatically released: status changed to released',
        'system_trigger'
    );
    
    UPDATE unified_port_allocations 
    SET released_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id;
END;

-- 自动清理过期的预留
CREATE TRIGGER cleanup_expired_reservations
    AFTER UPDATE ON port_reservations
    WHEN NEW.expires_at IS NOT NULL AND NEW.expires_at < datetime('now')
BEGIN
    UPDATE port_reservations 
    SET status = 'expired' 
    WHERE id = NEW.id AND status = 'active';
END;

-- ===============================================================================
-- 数据迁移完成标记
-- ===============================================================================
CREATE TABLE schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description) VALUES 
('001', '统一端口管理数据模型 - 初始创建');

-- ===============================================================================
-- 模式创建完成
-- ===============================================================================
-- 这个统一的数据模型整合了以下功能：
-- 1. 端口分配和管理
-- 2. 冲突检测和解决
-- 3. 性能监控
-- 4. 使用历史追踪
-- 5. 智能分配规则
-- 6. 端口预留管理
-- 7. 范围配置管理
-- ===============================================================================
