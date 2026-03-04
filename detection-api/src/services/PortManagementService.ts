/**
 * Unified Port Management Service
 * 
 * Consolidates functionality from:
 * - PortScanService
 * - PortLeaseManager
 * - IntelligentPortAllocator
 * - PortConflictResolver
 * - IntelligentPortManager
 * 
 * Reduces complexity by unifying port management logic into a single cohesive service.
 */

import { Database } from 'better-sqlite3';
import { EventEmitter } from 'events';
import { createServer } from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { ConfigManager } from './configManager';
import { DatabaseTransactionManager } from './DatabaseTransactionManager';

const execAsync = promisify(exec);

// ===============================================================================
// Types & Interfaces
// ===============================================================================

export interface PortAllocationRequest {
    appId: string;
    appName: string;
    type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database' | 'other';
    protocol?: 'http' | 'https' | 'ws' | 'wss' | 'tcp' | 'udp' | 'grpc';
    preferredPort?: number;
    techStack?: string;
    description?: string;
}

export interface PortAllocationResult {
    port: number;
    allocationId: string;
    confidence: number;
    source: string;
    reasoning: string[];
    allocatedAt: Date;
    expiresAt?: Date;
}

export interface PortScanResult {
    port: number;
    status: 'listening' | 'allocated' | 'open' | 'closed' | 'error';
    process?: { pid: number | null; name: string | null };
    service?: string;
    timestamp: string;
}

export interface PortConflict {
    id: string;
    port: number;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedApps: string[];
    description: string;
    detectedAt: Date;
}

export interface LeaseInfo {
    id: string;
    port: number;
    appId: string;
    expiresAt: Date;
    status: 'active' | 'expired' | 'zombie';
}

// ===============================================================================
// PortManagementService
// ===============================================================================

export class PortManagementService extends EventEmitter {
    private db: Database;
    private configManager: ConfigManager;
    private transactionManager: DatabaseTransactionManager;

    // Configuration
    private readonly SYSTEM_PORTS = new Set([
        21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995,
        135, 139, 445, 1433, 1521, 3306, 3389, 5432, 5984, 6379, 27017
    ]);

    private readonly TECH_STACK_DEFAULTS: Record<string, number[]> = {
        'vue': [8080, 3000, 5173],
        'react': [3000, 3001, 3002],
        'angular': [4200, 4201, 4202],
        'express': [3000, 8000, 5000],
        'nestjs': [3000, 8000, 5000],
        'next': [3000, 3001, 3002],
        'nuxt': [3000, 3001, 3002]
    };

    constructor(database: Database, configManager: ConfigManager) {
        super();
        this.db = database;
        this.configManager = configManager;
        this.transactionManager = new DatabaseTransactionManager(database);

        this.initialize();
    }

    private async initialize() {
        await this.ensureTables();
        this.startBackgroundTasks();
        logger.debug('PortManagementService initialized');
    }

    // ===============================================================================
    // 1. Port Scanning & Status
    // ===============================================================================

    /**
     * Scan a range of ports
     */
    async scanPortRange(startPort: number, endPort: number): Promise<PortScanResult[]> {
        const results: PortScanResult[] = [];
        const ports = Array.from({ length: endPort - startPort + 1 }, (_, i) => startPort + i);

        // Limit concurrency
        const chunkSize = 10;
        for (let i = 0; i < ports.length; i += chunkSize) {
            const chunk = ports.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(chunk.map(p => this.scanSinglePort(p)));
            results.push(...chunkResults);
        }

        return results;
    }

    /**
     * Scan a single port
     */
    async scanSinglePort(port: number): Promise<PortScanResult> {
        try {
            const isListening = await this.checkPortListening(port);
            const allocation = await this.getAllocation(port);
            const processInfo = isListening ? await this.getProcessInfo(port) : undefined;

            let status: PortScanResult['status'] = 'closed';
            if (allocation) status = 'allocated';
            else if (isListening) status = 'listening';

            return {
                port,
                status,
                process: processInfo,
                service: this.getServiceName(port),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.warn(`Port scan failed for ${port}`, error);
            return {
                port,
                status: 'error',
                timestamp: new Date().toISOString()
            };
        }
    }

    private async checkPortListening(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = createServer();
            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') resolve(true);
                else resolve(false);
            });
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port);
        });
    }

    private async getProcessInfo(port: number): Promise<{ pid: number | null; name: string | null }> {
        try {
            if (process.platform === 'win32') {
                const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                    if (line.includes('LISTENING')) {
                        const parts = line.trim().split(/\s+/);
                        const pid = parseInt(parts[parts.length - 1]);
                        return { pid, name: null }; // Getting name requires another call, skipping for performance
                    }
                }
            } else {
                const { stdout } = await execAsync(`lsof -i :${port} -t`);
                const pid = parseInt(stdout.trim());
                return { pid, name: null };
            }
        } catch {
            // Ignore errors
        }
        return { pid: null, name: null };
    }

    private getServiceName(port: number): string | undefined {
        const map: Record<number, string> = {
            80: 'HTTP', 443: 'HTTPS', 3000: 'React/Node', 8080: 'Vue/Java',
            3306: 'MySQL', 5432: 'PostgreSQL', 6379: 'Redis', 27017: 'MongoDB'
        };
        return map[port];
    }

    // ===============================================================================
    // 2. Port Allocation (Intelligent)
    // ===============================================================================

    async allocatePort(request: PortAllocationRequest): Promise<PortAllocationResult> {
        logger.info('Allocating port', { request });

        // 1. Try preferred port
        if (request.preferredPort) {
            if (await this.isPortAvailable(request.preferredPort)) {
                return this.createAllocation(request.preferredPort, request, 'preferred');
            }
        }

        // 2. Try tech stack defaults
        if (request.techStack) {
            const defaults = this.TECH_STACK_DEFAULTS[request.techStack.toLowerCase()];
            if (defaults) {
                for (const port of defaults) {
                    if (await this.isPortAvailable(port)) {
                        return this.createAllocation(port, request, 'tech_stack');
                    }
                }
            }
        }

        // 3. Find random available port in range
        const start = request.type === 'backend' ? 4000 : 3000;
        const end = start + 1000;

        for (let i = 0; i < 50; i++) { // Try 50 times
            const port = Math.floor(Math.random() * (end - start) + start);
            if (await this.isPortAvailable(port)) {
                return this.createAllocation(port, request, 'random');
            }
        }

        throw new Error('No available ports found');
    }

    private async isPortAvailable(port: number): Promise<boolean> {
        // 1. 检查系统保留端口
        if (this.SYSTEM_PORTS.has(port)) return false;
        
        // 2. 检查 unified_port_allocations 表中的临时分配
        if (await this.getAllocation(port)) return false;
        
        // 3. 检查 applications 表中已添加应用的端口（主端口和次要端口）
        if (this.isPortUsedByExistingApp(port)) return false;
        
        // 4. 检查端口是否正在被监听
        return !(await this.checkPortListening(port));
    }

    /**
     * 检查端口是否已被已添加的应用使用
     * 查询 applications 表中的 network_config JSON 字段
     */
    private isPortUsedByExistingApp(port: number): boolean {
        try {
            // 查询所有应用的网络配置
            const apps = this.db.prepare('SELECT id, name, network_config FROM applications').all() as any[];
            
            for (const app of apps) {
                if (!app.network_config) continue;
                
                try {
                    const networkConfig = JSON.parse(app.network_config);
                    
                    // 检查主端口
                    if (networkConfig.primaryPort === port) {
                        logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为主端口`);
                        return true;
                    }
                    
                    // 检查次要端口
                    if (Array.isArray(networkConfig.secondaryPorts) && 
                        networkConfig.secondaryPorts.includes(port)) {
                        logger.debug(`端口 ${port} 已被应用 ${app.name} (${app.id}) 使用为次要端口`);
                        return true;
                    }
                } catch (parseError) {
                    logger.warn(`解析应用 ${app.id} 的网络配置失败`, parseError);
                }
            }
            
            return false;
        } catch (error) {
            logger.warn('检查已有应用端口时出错，跳过此检查', error);
            return false;
        }
    }

    private async createAllocation(port: number, request: PortAllocationRequest, source: string): Promise<PortAllocationResult> {
        const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const allocatedAt = new Date();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h lease

        const stmt = this.db.prepare(`
      INSERT INTO unified_port_allocations (
        id, port, app_id, app_name, allocation_type, 
        protocol, status, allocated_at, expires_at, tech_stack
      ) VALUES (?, ?, ?, ?, ?, ?, 'allocated', ?, ?, ?)
    `);

        stmt.run(
            allocationId, port, request.appId, request.appName, request.type,
            request.protocol || 'tcp', allocatedAt.toISOString(), expiresAt.toISOString(), request.techStack
        );

        return {
            port,
            allocationId,
            confidence: 1.0,
            source,
            reasoning: [`Allocated via ${source}`],
            allocatedAt,
            expiresAt
        };
    }

    // ===============================================================================
    // 3. Lease Management
    // ===============================================================================

    async renewLease(port: number, appId: string): Promise<boolean> {
        const stmt = this.db.prepare(`
      UPDATE unified_port_allocations 
      SET expires_at = ?, last_verified = ?
      WHERE port = ? AND app_id = ?
    `);

        const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const result = stmt.run(newExpiry, new Date().toISOString(), port, appId);
        return result.changes > 0;
    }

    async releasePort(port: number, appId?: string): Promise<void> {
        let sql = 'DELETE FROM unified_port_allocations WHERE port = ?';
        const args: any[] = [port];

        if (appId) {
            sql += ' AND app_id = ?';
            args.push(appId);
        }

        this.db.prepare(sql).run(...args);
        logger.info(`Released port ${port}`);
        this.emit('portReleased', { port, appId });
    }

    // ===============================================================================
    // 4. Conflict Resolution
    // ===============================================================================

    async detectConflicts(): Promise<PortConflict[]> {
        const conflicts: PortConflict[] = [];

        // Check for system port usage
        const allocations = this.getAllAllocations();
        for (const alloc of allocations) {
            if (this.SYSTEM_PORTS.has(alloc.port)) {
                conflicts.push({
                    id: `conflict_${alloc.port}`,
                    port: alloc.port,
                    type: 'system_port',
                    severity: 'critical',
                    affectedApps: [alloc.app_id],
                    description: 'App using system reserved port',
                    detectedAt: new Date()
                });
            }
        }

        // Check for physical port conflicts (listening but not allocated to self)
        // This is expensive, so maybe run less frequently or on demand

        return conflicts;
    }

    /**
     * Check specific ports for conflicts
     */
    async checkConflicts(ports: number[]): Promise<PortConflict[]> {
        const conflicts: PortConflict[] = [];

        for (const port of ports) {
            // 1. Check system ports
            if (this.SYSTEM_PORTS.has(port)) {
                conflicts.push({
                    id: `conflict_sys_${port}`,
                    port,
                    type: 'system_port',
                    severity: 'critical',
                    affectedApps: [],
                    description: 'Port is a reserved system port',
                    detectedAt: new Date()
                });
                continue;
            }

            // 2. Check allocations
            const allocation = await this.getAllocation(port);
            if (allocation) {
                conflicts.push({
                    id: `conflict_alloc_${port}`,
                    port,
                    type: 'allocation',
                    severity: 'high',
                    affectedApps: [allocation.app_id],
                    description: `Port is already allocated to ${allocation.app_name || allocation.app_id}`,
                    detectedAt: new Date()
                });
                continue;
            }

            // 3. Check if listening
            const isListening = await this.checkPortListening(port);
            if (isListening) {
                const processInfo = await this.getProcessInfo(port);
                conflicts.push({
                    id: `conflict_proc_${port}`,
                    port,
                    type: 'process',
                    severity: 'medium',
                    affectedApps: [],
                    description: `Port is occupied by process ${processInfo.pid || 'unknown'}`,
                    detectedAt: new Date()
                });
            }
        }

        return conflicts;
    }

    // ===============================================================================
    // 5. Compatibility Methods (for PortConfigController & Legacy Routes)
    // ===============================================================================

    async forceReleasePort(port: number): Promise<boolean> {
        try {
            // 1. Try to kill process if listening
            const processInfo = await this.getProcessInfo(port);
            if (processInfo.pid) {
                try {
                    if (process.platform === 'win32') {
                        await execAsync(`taskkill /F /PID ${processInfo.pid}`);
                    } else {
                        await execAsync(`kill -9 ${processInfo.pid}`);
                    }
                    logger.info(`Killed process ${processInfo.pid} on port ${port}`);
                } catch (e) {
                    logger.warn(`Failed to kill process on port ${port}`, e);
                }
            }

            // 2. Release from DB
            await this.releasePort(port);
            return true;
        } catch (error) {
            logger.error(`Failed to force release port ${port}`, error);
            return false;
        }
    }

    async getPortStatus(port: number): Promise<any> {
        const allocation = await this.getAllocation(port);
        const processInfo = await this.getProcessInfo(port);
        const isListening = await this.checkPortListening(port);

        return {
            port,
            status: allocation ? 'allocated' : (isListening ? 'listening' : 'closed'),
            is_listening: isListening,
            app_id: allocation?.app_id,
            app_name: allocation?.app_name,
            process_id: processInfo.pid,
            process_name: processInfo.name,
            allocation_data: allocation,
            updated_at: new Date().toISOString()
        };
    }

    getAppPorts(appId: string): any[] {
        try {
            return this.db.prepare('SELECT * FROM unified_port_allocations WHERE app_id = ?').all(appId);
        } catch (error) {
            logger.error(`Failed to get ports for app ${appId}`, error);
            return [];
        }
    }

    startPerformanceMonitoring(): void {
        logger.info('Performance monitoring started (compatibility stub)');
    }

    getPortPerformanceTrends(days: number = 7): any[] {
        // Return empty array for compatibility
        return [];
    }

    // ===============================================================================
    // Helpers & Background Tasks
    // ===============================================================================

    private async ensureTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS unified_port_allocations (
        id TEXT PRIMARY KEY,
        port INTEGER NOT NULL,
        app_id TEXT NOT NULL,
        app_name TEXT,
        allocation_type TEXT,
        protocol TEXT,
        status TEXT,
        allocated_at TEXT,
        expires_at TEXT,
        last_verified TEXT,
        tech_stack TEXT,
        configuration TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_upa_port ON unified_port_allocations(port);
      CREATE INDEX IF NOT EXISTS idx_upa_appid ON unified_port_allocations(app_id);
    `);

        // Create conflicts table if needed
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS port_conflicts (
        id TEXT PRIMARY KEY,
        port INTEGER,
        conflict_type TEXT,
        severity TEXT,
        affected_apps TEXT,
        details TEXT,
        detected_at TEXT,
        status TEXT
      )
    `);
    }

    private startBackgroundTasks() {
        // Cleanup expired leases every 10 mins
        setInterval(() => {
            const now = new Date().toISOString();
            this.db.prepare(`
        UPDATE unified_port_allocations 
        SET status = 'expired' 
        WHERE expires_at < ? AND status = 'allocated'
      `).run(now);
        }, 10 * 60 * 1000);
    }

    private async getAllocation(port: number): Promise<any> {
        return this.db.prepare("SELECT * FROM unified_port_allocations WHERE port = ? AND status = 'allocated'").get(port);
    }

    private getAllAllocations(): any[] {
        return this.db.prepare("SELECT * FROM unified_port_allocations WHERE status = 'allocated'").all();
    }

    // ===============================================================================
    // 5. Statistics & Monitoring (Compatibility)
    // ===============================================================================

    async getPortStatistics(): Promise<any> {
        const allocations = this.getAllAllocations();
        const allocated = allocations.length;

        // Basic stats
        return {
            total: 65535,
            allocated,
            available: 65535 - allocated,
            conflicts: 0,
            byType: {},
            byStatus: { allocated },
            byTechStack: {},
            averageResponseTime: 0,
            allocationSuccessRate: 100,
            rangeUtilization: {}
        };
    }

    async getEnhancedPortStatistics(): Promise<any> {
        const baseStats = await this.getPortStatistics();
        return {
            ...baseStats,
            enhancedMetrics: {
                avgResponseTime: 0,
                avgCpuUsage: 0,
                historicalDataPoints: 0,
                dataCollectionActive: true
            }
        };
    }

    /**
     * 获取所有端口分配（公开方法）
     * Public wrapper for getAllAllocations for compatibility with EnhancedPortManager interface
     */
    getAllPortAllocations(): any[] {
        return this.getAllAllocations();
    }

    // ===============================================================================
    // 6. Zombie Port Cleanup
    // ===============================================================================

    /**
     * 清理僵尸端口分配
     * 僵尸端口：数据库中有分配记录，但实际上没有进程在监听
     */
    async cleanupZombiePorts(): Promise<{
        cleanedCount: number;
        cleanedPorts: number[];
        errors: Array<{ port: number; error: string }>;
    }> {
        logger.info('开始清理僵尸端口分配...');
        
        const cleanedPorts: number[] = [];
        const errors: Array<{ port: number; error: string }> = [];
        
        try {
            // 1. 获取所有已分配的端口
            const allocations = this.getAllAllocations();
            logger.info(`发现 ${allocations.length} 个端口分配记录`);
            
            // 2. 检查每个分配的端口是否真正在监听
            for (const alloc of allocations) {
                try {
                    const port = alloc.port;
                    const isListening = await this.checkPortListening(port);
                    
                    if (!isListening) {
                        // 端口未被占用，是僵尸分配，需要清理
                        logger.info(`端口 ${port} 是僵尸分配（无进程监听），准备清理`);
                        
                        // 从数据库删除分配记录
                        this.db.prepare('DELETE FROM unified_port_allocations WHERE port = ?').run(port);
                        cleanedPorts.push(port);
                        
                        this.emit('zombiePortCleaned', { port, appId: alloc.app_id });
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : '未知错误';
                    logger.warn(`检查端口 ${alloc.port} 时出错: ${errorMsg}`);
                    errors.push({ port: alloc.port, error: errorMsg });
                }
            }
            
            // 3. 清理过期的分配记录
            const now = new Date().toISOString();
            const expiredResult = this.db.prepare(`
                DELETE FROM unified_port_allocations 
                WHERE expires_at < ? AND status = 'expired'
            `).run(now);
            
            if (expiredResult.changes > 0) {
                logger.info(`清理了 ${expiredResult.changes} 条过期分配记录`);
            }
            
            logger.info(`僵尸端口清理完成: 清理了 ${cleanedPorts.length} 个端口`, {
                cleanedPorts,
                errors: errors.length
            });
            
            return {
                cleanedCount: cleanedPorts.length,
                cleanedPorts,
                errors
            };
        } catch (error) {
            logger.error('僵尸端口清理失败', error);
            throw error;
        }
    }

    /**
     * 获取僵尸端口列表（不清理，仅检测）
     */
    async detectZombiePorts(): Promise<Array<{
        port: number;
        appId: string;
        appName: string | null;
        allocatedAt: string;
        reason: string;
    }>> {
        const zombies: Array<{
            port: number;
            appId: string;
            appName: string | null;
            allocatedAt: string;
            reason: string;
        }> = [];
        
        const allocations = this.getAllAllocations();
        
        for (const alloc of allocations) {
            const isListening = await this.checkPortListening(alloc.port);
            
            if (!isListening) {
                zombies.push({
                    port: alloc.port,
                    appId: alloc.app_id,
                    appName: alloc.app_name,
                    allocatedAt: alloc.allocated_at,
                    reason: '无进程监听'
                });
            }
        }
        
        return zombies;
    }
}
