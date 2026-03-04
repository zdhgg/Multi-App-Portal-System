-- =============================================================================
-- Database Schema - Clean Design
-- =============================================================================
-- This schema follows Clean Architecture principles:
-- 1. One concept, one table
-- 2. No redundant fields
-- 3. JSON only for truly complex nested data
-- 4. Clear, consistent naming
-- =============================================================================

-- Drop legacy tables if they exist
DROP TABLE IF EXISTS apps;
DROP TABLE IF EXISTS detection_records;
DROP TABLE IF EXISTS scan_sessions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS settings;

-- =============================================================================
-- APPLICATIONS TABLE - Core application data
-- =============================================================================
CREATE TABLE applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    directory TEXT NOT NULL UNIQUE,
    tech_stack TEXT NOT NULL,
    
    -- Network configuration as JSON
    -- Structure: {primaryPort: number, secondaryPorts: number[], protocol: string}
    network_config TEXT NOT NULL,
    
    -- Simple state enum
    state TEXT NOT NULL CHECK (state IN ('stopped', 'running', 'failed')),
    
    -- Timestamps as Unix timestamps (integers)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_applications_directory ON applications(directory);
CREATE UNIQUE INDEX idx_applications_directory_normalized
  ON applications (lower(replace(rtrim(directory, '/\\'), '\\', '/')));
CREATE INDEX idx_applications_state ON applications(state);
CREATE INDEX idx_applications_tech_stack ON applications(tech_stack);

-- =============================================================================
-- APPLICATION_METADATA TABLE - Separated metadata
-- =============================================================================
CREATE TABLE application_metadata (
    app_id TEXT PRIMARY KEY,
    description TEXT,
    icon TEXT,
    color TEXT,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    access_path TEXT,
    FOREIGN KEY (app_id) REFERENCES applications(id) ON DELETE CASCADE
);

-- =============================================================================
-- DETECTION_SESSIONS TABLE - Simplified detection sessions
-- =============================================================================
CREATE TABLE detection_sessions (
    id TEXT PRIMARY KEY,
    workspace_path TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'failed')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    
    -- Summary as JSON (only when completed)
    -- Structure: {totalScanned: number, validFound: number, warningCount: number, errorCount: number}
    summary TEXT
);

-- Index for active sessions
CREATE INDEX idx_detection_sessions_state ON detection_sessions(state);

-- =============================================================================
-- DETECTION_RESULTS TABLE - Flattened detection results
-- =============================================================================
CREATE TABLE detection_results (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    directory TEXT NOT NULL,
    tech_stack TEXT,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    
    -- Issues as JSON array
    -- Structure: Array<{type: string, code: string, message: string, file?: string, suggestion?: string}>
    issues TEXT NOT NULL DEFAULT '[]',
    
    created_at INTEGER NOT NULL,
    
    FOREIGN KEY (session_id) REFERENCES detection_sessions(id) ON DELETE SET NULL
);

-- Indexes for queries
CREATE INDEX idx_detection_results_session_id ON detection_results(session_id);
CREATE INDEX idx_detection_results_tech_stack ON detection_results(tech_stack);

-- =============================================================================
-- PORT_ALLOCATIONS TABLE - Enhanced port tracking
-- =============================================================================
CREATE TABLE port_allocations (
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

-- Index for performance
CREATE INDEX idx_port_allocations_app_id ON port_allocations(app_id);
CREATE INDEX idx_port_allocations_status ON port_allocations(status);
CREATE INDEX idx_port_allocations_type ON port_allocations(type);

-- =============================================================================
-- CLEAN PRODUCTION SCHEMA - NO SAMPLE DATA
-- =============================================================================
-- Note: This schema creates clean tables without any sample/test data
-- Applications will be added through the detection and management interface
