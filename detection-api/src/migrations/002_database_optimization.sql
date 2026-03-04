-- ===============================================================================
-- 数据库结构优化 - 第一阶段任务1.4
-- ===============================================================================
-- 版本: 2.1.0
-- 创建时间: 2025-09-26
-- 说明: 优化数据库结构，提升查询性能，减少存储空间
-- 目标: 查询性能提升50%+，存储空间减少20%+
-- ===============================================================================

-- 备份现有数据
CREATE TABLE IF NOT EXISTS unified_port_allocations_backup AS SELECT * FROM unified_port_allocations;
CREATE TABLE IF NOT EXISTS port_usage_history_backup AS SELECT * FROM port_usage_history;
CREATE TABLE IF NOT EXISTS port_performance_metrics_backup AS SELECT * FROM port_performance_metrics;

-- ===============================================================================
-- 优化核心端口分配表 - 拆分为核心表和扩展表
-- ===============================================================================

-- 核心端口分配表 - 只包含最常用的字段
DROP TABLE IF EXISTS port_allocations_core;
CREATE TABLE port_allocations_core (
    id TEXT PRIMARY KEY,
    port INTEGER UNIQUE NOT NULL,
    app_id TEXT NOT NULL,
    app_name TEXT NOT NULL,
    
    -- 核心分类字段（使用更小的数据类型）
    allocation_type TINYINT NOT NULL DEFAULT 0, -- 0:frontend, 1:backend, 2:api, 3:websocket, 4:database, 5:system, 6:other
    protocol TINYINT NOT NULL DEFAULT 0,        -- 0:http, 1:https, 2:ws, 3:wss, 4:tcp, 5:udp, 6:grpc
    status TINYINT NOT NULL DEFAULT 0,          -- 0:allocated, 1:active, 2:inactive, 3:zombie, 4:released, 5:reserved, 6:conflict
    
    -- 时间戳（使用INTEGER存储Unix时间戳，节省空间）
    allocated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_verified INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER,
    released_at INTEGER,
    
    -- 进程信息
    process_id INTEGER,
    
    -- 审计信息
    created_by TINYINT DEFAULT 0,  -- 0:system, 1:user, 2:migration, 3:api
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 端口分配扩展表 - 包含不常用的字段
DROP TABLE IF EXISTS port_allocations_extended;
CREATE TABLE port_allocations_extended (
    allocation_id TEXT PRIMARY KEY,
    
    -- 扩展信息
    process_name TEXT,
    process_command TEXT,
    tech_stack TEXT,
    description TEXT,
    tags TEXT,
    priority TINYINT DEFAULT 50,
    
    -- 配置信息（优化后的JSON）
    renewal_count INTEGER DEFAULT 0,
    max_renewals INTEGER DEFAULT 10,
    custom_config TEXT, -- 只存储真正需要的自定义配置
    
    FOREIGN KEY (allocation_id) REFERENCES port_allocations_core(id) ON DELETE CASCADE
);

-- ===============================================================================
-- 优化端口使用历史表 - 分区和归档策略
-- ===============================================================================

-- 当前历史表（保留最近30天的数据）
DROP TABLE IF EXISTS port_usage_history_current;
CREATE TABLE port_usage_history_current (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 操作类型（使用数字编码）
    action TINYINT NOT NULL, -- 0:allocated, 1:released, 2:verified, 3:conflict_detected, 4:conflict_resolved, 5:expired, 6:force_released, 7:lease_created, 8:lease_renewed
    result TINYINT NOT NULL, -- 0:success, 1:failed, 2:partial
    
    -- 性能指标
    response_time_ms SMALLINT,
    
    -- 上下文信息（压缩存储）
    initiated_by TINYINT DEFAULT 0, -- 0:system, 1:user, 2:api, 3:migration
    
    -- 时间戳
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    
    -- 详情（只在必要时存储）
    details TEXT,
    error_message TEXT
);

-- 历史归档表（30天以前的数据）
DROP TABLE IF EXISTS port_usage_history_archive;
CREATE TABLE port_usage_history_archive (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL,
    app_id TEXT,
    action TINYINT NOT NULL,
    result TINYINT NOT NULL,
    response_time_ms SMALLINT,
    initiated_by TINYINT DEFAULT 0,
    timestamp INTEGER NOT NULL,
    details TEXT,
    error_message TEXT
);

-- ===============================================================================
-- 优化性能监控表 - 聚合和分区策略
-- ===============================================================================

-- 实时性能数据（保留最近24小时）
DROP TABLE IF EXISTS port_performance_realtime;
CREATE TABLE port_performance_realtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 核心性能指标（使用更小的数据类型）
    response_time_ms SMALLINT DEFAULT 0,
    throughput_kbps INTEGER DEFAULT 0,  -- 改为KB/s，使用INTEGER
    concurrent_connections SMALLINT DEFAULT 0,
    error_rate SMALLINT DEFAULT 0,      -- 使用千分比，0-1000
    
    -- 资源使用
    cpu_usage_percent TINYINT DEFAULT 0,    -- 0-100
    memory_usage_mb SMALLINT DEFAULT 0,
    
    -- 网络指标（压缩存储）
    bytes_sent INTEGER DEFAULT 0,
    bytes_received INTEGER DEFAULT 0,
    
    -- 健康评分
    health_score TINYINT DEFAULT 100,       -- 0-100
    availability_percent TINYINT DEFAULT 100, -- 0-100
    
    -- 采集信息
    collection_method TINYINT DEFAULT 0,    -- 0:auto, 1:manual, 2:api
    
    -- 时间戳
    collected_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 每小时聚合性能数据
DROP TABLE IF EXISTS port_performance_hourly;
CREATE TABLE port_performance_hourly (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 聚合指标
    avg_response_time_ms SMALLINT,
    max_response_time_ms SMALLINT,
    min_response_time_ms SMALLINT,
    avg_throughput_kbps INTEGER,
    max_concurrent_connections SMALLINT,
    total_requests INTEGER,
    total_errors INTEGER,
    avg_cpu_usage TINYINT,
    avg_memory_usage_mb SMALLINT,
    avg_health_score TINYINT,
    uptime_percent TINYINT,
    
    -- 时间窗口
    hour_timestamp INTEGER NOT NULL, -- 小时的开始时间戳
    sample_count INTEGER DEFAULT 0   -- 该小时内的样本数量
);

-- 每日聚合性能数据
DROP TABLE IF EXISTS port_performance_daily;
CREATE TABLE port_performance_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    port INTEGER NOT NULL,
    app_id TEXT,
    
    -- 日聚合指标
    avg_response_time_ms SMALLINT,
    max_response_time_ms SMALLINT,
    avg_throughput_kbps INTEGER,
    peak_concurrent_connections SMALLINT,
    total_requests INTEGER,
    total_errors INTEGER,
    avg_cpu_usage TINYINT,
    avg_memory_usage_mb SMALLINT,
    avg_health_score TINYINT,
    uptime_percent TINYINT,
    
    -- 时间窗口
    date_timestamp INTEGER NOT NULL, -- 日期的开始时间戳
    hour_count INTEGER DEFAULT 0     -- 该日内的小时数据数量
);

-- ===============================================================================
-- 创建优化的索引
-- ===============================================================================

-- 核心端口分配表索引（覆盖索引优化）
CREATE UNIQUE INDEX idx_port_core_port ON port_allocations_core(port);
CREATE INDEX idx_port_core_app_status ON port_allocations_core(app_id, status);
CREATE INDEX idx_port_core_type_status ON port_allocations_core(allocation_type, status);
CREATE INDEX idx_port_core_expires ON port_allocations_core(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_port_core_allocated_at ON port_allocations_core(allocated_at);
CREATE INDEX idx_port_core_last_verified ON port_allocations_core(last_verified);

-- 复合索引优化常用查询
CREATE INDEX idx_port_core_status_expires ON port_allocations_core(status, expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_port_core_app_type ON port_allocations_core(app_id, allocation_type);

-- 历史表索引
CREATE INDEX idx_history_current_port_time ON port_usage_history_current(port, timestamp);
CREATE INDEX idx_history_current_app_time ON port_usage_history_current(app_id, timestamp);
CREATE INDEX idx_history_current_action_time ON port_usage_history_current(action, timestamp);
CREATE INDEX idx_history_current_timestamp ON port_usage_history_current(timestamp);

-- 性能表索引
CREATE INDEX idx_perf_realtime_port_time ON port_performance_realtime(port, collected_at);
CREATE INDEX idx_perf_realtime_app_time ON port_performance_realtime(app_id, collected_at);
CREATE INDEX idx_perf_hourly_port_hour ON port_performance_hourly(port, hour_timestamp);
CREATE INDEX idx_perf_daily_port_date ON port_performance_daily(port, date_timestamp);

-- ===============================================================================
-- 创建数据类型映射函数
-- ===============================================================================

-- 分配类型映射
CREATE VIEW allocation_type_mapping AS
SELECT 0 as id, 'frontend' as name
UNION SELECT 1, 'backend'
UNION SELECT 2, 'api'
UNION SELECT 3, 'websocket'
UNION SELECT 4, 'database'
UNION SELECT 5, 'system'
UNION SELECT 6, 'other';

-- 协议类型映射
CREATE VIEW protocol_mapping AS
SELECT 0 as id, 'http' as name
UNION SELECT 1, 'https'
UNION SELECT 2, 'ws'
UNION SELECT 3, 'wss'
UNION SELECT 4, 'tcp'
UNION SELECT 5, 'udp'
UNION SELECT 6, 'grpc';

-- 状态映射
CREATE VIEW status_mapping AS
SELECT 0 as id, 'allocated' as name
UNION SELECT 1, 'active'
UNION SELECT 2, 'inactive'
UNION SELECT 3, 'zombie'
UNION SELECT 4, 'released'
UNION SELECT 5, 'reserved'
UNION SELECT 6, 'conflict';

-- 操作类型映射
CREATE VIEW action_mapping AS
SELECT 0 as id, 'allocated' as name
UNION SELECT 1, 'released'
UNION SELECT 2, 'verified'
UNION SELECT 3, 'conflict_detected'
UNION SELECT 4, 'conflict_resolved'
UNION SELECT 5, 'expired'
UNION SELECT 6, 'force_released'
UNION SELECT 7, 'lease_created'
UNION SELECT 8, 'lease_renewed';

-- ===============================================================================
-- 创建优化的视图
-- ===============================================================================

-- 活跃端口分配视图（优化版）
CREATE VIEW active_port_allocations_v2 AS
SELECT 
    pc.id,
    pc.port,
    pc.app_id,
    pc.app_name,
    atm.name as allocation_type,
    pm.name as protocol,
    sm.name as status,
    datetime(pc.allocated_at, 'unixepoch') as allocated_at,
    datetime(pc.last_verified, 'unixepoch') as last_verified,
    datetime(pc.expires_at, 'unixepoch') as expires_at,
    pc.process_id,
    pe.process_name,
    pe.tech_stack,
    pe.description,
    pe.renewal_count
FROM port_allocations_core pc
LEFT JOIN port_allocations_extended pe ON pc.id = pe.allocation_id
LEFT JOIN allocation_type_mapping atm ON pc.allocation_type = atm.id
LEFT JOIN protocol_mapping pm ON pc.protocol = pm.id
LEFT JOIN status_mapping sm ON pc.status = sm.id
WHERE pc.status IN (0, 1); -- allocated, active

-- 端口使用统计视图（优化版）
CREATE VIEW port_usage_statistics_v2 AS
SELECT 
    pr.name as range_name,
    pr.type as range_type,
    COUNT(pc.port) as allocated_count,
    pr.max_allocations as max_allocations,
    ROUND(COUNT(pc.port) * 100.0 / pr.max_allocations, 2) as usage_percentage
FROM port_ranges pr
LEFT JOIN port_allocations_core pc ON pc.port BETWEEN pr.start_port AND pr.end_port 
    AND pc.status IN (0, 1) -- allocated, active
GROUP BY pr.id, pr.name, pr.type, pr.max_allocations;

-- 记录迁移版本
INSERT INTO schema_migrations (version, description) VALUES 
('002', '数据库结构优化 - 性能和存储优化');
