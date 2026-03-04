/**
 * 端口使用模式分析器
 * 分析历史端口使用数据，识别应用的端口使用习惯和偏好
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface PortUsagePattern {
  appId: string;
  appName: string;
  techStack?: string;
  preferredPorts: number[];
  portRanges: { start: number; end: number; frequency: number }[];
  timePatterns: { hour: number; frequency: number }[];
  conflictHistory: { port: number; conflicts: number }[];
  successRate: number;
  averageUsageDuration: number;
  lastUsed: Date;
  totalAllocations: number;
}

export interface PortAffinityRule {
  appId: string;
  relatedApps: string[];
  preferredDistance: number; // 相邻端口的距离
  affinityType: 'adjacent' | 'range' | 'avoid';
  strength: number; // 0-1，亲和性强度
}

export interface LoadBalancingMetrics {
  portRanges: { start: number; end: number; load: number; capacity: number }[];
  hotspots: number[]; // 高负载端口
  recommendations: { action: 'avoid' | 'prefer'; ports: number[]; reason: string }[];
}

export class PortUsagePatternAnalyzer {
  private db: Database.Database;
  private patterns: Map<string, PortUsagePattern> = new Map();
  private affinityRules: Map<string, PortAffinityRule[]> = new Map();
  private loadMetrics: LoadBalancingMetrics | null = null;
  private lastAnalysisTime: Date | null = null;
  private analysisInterval = 5 * 60 * 1000; // 5分钟

  constructor(database: Database.Database) {
    this.db = database;
    this.initializeAnalyzer();
  }

  /**
   * 初始化分析器
   */
  private initializeAnalyzer(): void {
    logger.info('初始化端口使用模式分析器');
    
    // 创建分析结果存储表
    this.createAnalysisResultTables();
    
    // 启动定期分析任务
    this.startPeriodicAnalysis();
  }

  /**
   * 创建分析结果存储表
   */
  private createAnalysisResultTables(): void {
    try {
      // 端口使用模式表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS port_usage_patterns (
          app_id TEXT PRIMARY KEY,
          app_name TEXT NOT NULL,
          tech_stack TEXT,
          preferred_ports TEXT, -- JSON array
          port_ranges TEXT,     -- JSON array
          time_patterns TEXT,   -- JSON array
          conflict_history TEXT, -- JSON array
          success_rate REAL DEFAULT 0.0,
          average_usage_duration INTEGER DEFAULT 0,
          last_used INTEGER,
          total_allocations INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // 端口亲和性规则表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS port_affinity_rules (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          related_apps TEXT, -- JSON array
          preferred_distance INTEGER DEFAULT 1,
          affinity_type TEXT DEFAULT 'adjacent',
          strength REAL DEFAULT 0.5,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // 负载均衡指标表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS load_balancing_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          port_ranges TEXT, -- JSON array
          hotspots TEXT,    -- JSON array
          recommendations TEXT, -- JSON array
          analysis_time INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_patterns_app_id ON port_usage_patterns(app_id);
        CREATE INDEX IF NOT EXISTS idx_patterns_tech_stack ON port_usage_patterns(tech_stack);
        CREATE INDEX IF NOT EXISTS idx_affinity_app_id ON port_affinity_rules(app_id);
        CREATE INDEX IF NOT EXISTS idx_metrics_time ON load_balancing_metrics(analysis_time);
      `);

      logger.info('端口使用模式分析表创建完成');
    } catch (error) {
      logger.error('创建分析结果表失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动定期分析任务
   */
  private startPeriodicAnalysis(): void {
    // 立即执行一次分析
    this.performFullAnalysis().catch(error => {
      logger.error('初始分析失败', { error: error.message });
    });

    // 设置定期分析
    setInterval(() => {
      this.performFullAnalysis().catch(error => {
        logger.error('定期分析失败', { error: error.message });
      });
    }, this.analysisInterval);

    logger.info('定期分析任务已启动', { interval: this.analysisInterval });
  }

  /**
   * 执行完整分析
   */
  async performFullAnalysis(): Promise<void> {
    const startTime = Date.now();
    logger.info('开始执行端口使用模式分析');

    try {
      // 1. 分析应用端口使用模式
      await this.analyzeAppUsagePatterns();

      // 2. 分析端口亲和性规则
      await this.analyzePortAffinity();

      // 3. 分析负载均衡指标
      await this.analyzeLoadBalancing();

      // 4. 更新分析时间
      this.lastAnalysisTime = new Date();

      const duration = Date.now() - startTime;
      logger.info('端口使用模式分析完成', { 
        duration,
        patternsCount: this.patterns.size,
        affinityRulesCount: Array.from(this.affinityRules.values()).reduce((sum, rules) => sum + rules.length, 0)
      });

    } catch (error) {
      logger.error('端口使用模式分析失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 分析应用端口使用模式
   */
  private async analyzeAppUsagePatterns(): Promise<void> {
    try {
      // 获取所有应用的历史分配数据
      const appsQuery = `
        SELECT DISTINCT 
          pc.app_id AS app_id,
          pc.app_name AS app_name,
          pe.tech_stack AS tech_stack
        FROM port_allocations_core pc
        LEFT JOIN port_allocations_extended pe 
          ON pe.allocation_id = pc.id
        WHERE pc.app_id IS NOT NULL
      `;
      
      const apps = this.db.prepare(appsQuery).all() as any[];

      for (const app of apps) {
        const pattern = await this.analyzeAppPattern(app.app_id, app.app_name, app.tech_stack);
        this.patterns.set(app.app_id, pattern);
        
        // 保存到数据库
        await this.savePatternToDatabase(pattern);
      }

      logger.debug('应用端口使用模式分析完成', { appsCount: apps.length });
    } catch (error) {
      logger.error('分析应用端口使用模式失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 分析单个应用的端口使用模式
   */
  private async analyzeAppPattern(appId: string, appName: string, techStack?: string): Promise<PortUsagePattern> {
    // 获取应用的历史分配数据
    const allocationsQuery = `
      SELECT port, allocated_at, released_at, status
      FROM port_allocations_core
      WHERE app_id = ?
      ORDER BY allocated_at DESC
      LIMIT 1000
    `;
    
    const allocations = this.db.prepare(allocationsQuery).all(appId) as any[];

    // 获取历史记录数据
    const historyQuery = `
      SELECT port, action, result, timestamp
      FROM port_usage_history_current
      WHERE app_id = ?
      ORDER BY timestamp DESC
      LIMIT 5000
    `;
    
    const history = this.db.prepare(historyQuery).all(appId) as any[];

    // 分析首选端口
    const portFrequency = new Map<number, number>();
    allocations.forEach(alloc => {
      const count = portFrequency.get(alloc.port) || 0;
      portFrequency.set(alloc.port, count + 1);
    });

    const preferredPorts = Array.from(portFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([port]) => port);

    // 分析端口范围偏好
    const portRanges = this.analyzePortRanges(preferredPorts);

    // 分析时间模式
    const timePatterns = this.analyzeTimePatterns(allocations);

    // 分析冲突历史
    const conflictHistory = this.analyzeConflictHistory(history);

    // 计算成功率
    const successfulAllocations = history.filter(h => h.result === 0).length; // 0 = success
    const totalAttempts = history.length;
    const successRate = totalAttempts > 0 ? successfulAllocations / totalAttempts : 0;

    // 计算平均使用时长
    const averageUsageDuration = this.calculateAverageUsageDuration(allocations);

    // 获取最后使用时间
    const lastUsed = allocations.length > 0 ? new Date(allocations[0].allocated_at * 1000) : new Date(0);

    return {
      appId,
      appName,
      techStack,
      preferredPorts,
      portRanges,
      timePatterns,
      conflictHistory,
      successRate,
      averageUsageDuration,
      lastUsed,
      totalAllocations: allocations.length
    };
  }

  /**
   * 分析端口范围偏好
   */
  private analyzePortRanges(ports: number[]): { start: number; end: number; frequency: number }[] {
    if (ports.length === 0) return [];

    const ranges: { start: number; end: number; frequency: number }[] = [];
    const sortedPorts = [...ports].sort((a, b) => a - b);

    let rangeStart = sortedPorts[0];
    let rangeEnd = sortedPorts[0];
    let frequency = 1;

    for (let i = 1; i < sortedPorts.length; i++) {
      if (sortedPorts[i] - sortedPorts[i - 1] <= 100) { // 认为100以内的端口属于同一范围
        rangeEnd = sortedPorts[i];
        frequency++;
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd, frequency });
        rangeStart = sortedPorts[i];
        rangeEnd = sortedPorts[i];
        frequency = 1;
      }
    }

    ranges.push({ start: rangeStart, end: rangeEnd, frequency });
    return ranges.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 分析时间使用模式
   */
  private analyzeTimePatterns(allocations: any[]): { hour: number; frequency: number }[] {
    const hourFrequency = new Map<number, number>();

    allocations.forEach(alloc => {
      const hour = new Date(alloc.allocated_at * 1000).getHours();
      const count = hourFrequency.get(hour) || 0;
      hourFrequency.set(hour, count + 1);
    });

    return Array.from(hourFrequency.entries())
      .map(([hour, frequency]) => ({ hour, frequency }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * 分析冲突历史
   */
  private analyzeConflictHistory(history: any[]): { port: number; conflicts: number }[] {
    const conflictCounts = new Map<number, number>();

    history.forEach(record => {
      if (record.result === 1) { // 1 = failed
        const count = conflictCounts.get(record.port) || 0;
        conflictCounts.set(record.port, count + 1);
      }
    });

    return Array.from(conflictCounts.entries())
      .map(([port, conflicts]) => ({ port, conflicts }))
      .sort((a, b) => b.conflicts - a.conflicts);
  }

  /**
   * 计算平均使用时长
   */
  private calculateAverageUsageDuration(allocations: any[]): number {
    const durations = allocations
      .filter(alloc => alloc.released_at)
      .map(alloc => alloc.released_at - alloc.allocated_at);

    if (durations.length === 0) return 0;

    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    return Math.floor(totalDuration / durations.length);
  }

  /**
   * 保存模式到数据库
   */
  private async savePatternToDatabase(pattern: PortUsagePattern): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO port_usage_patterns (
          app_id, app_name, tech_stack, preferred_ports, port_ranges,
          time_patterns, conflict_history, success_rate, average_usage_duration,
          last_used, total_allocations, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `);

      stmt.run(
        pattern.appId,
        pattern.appName,
        pattern.techStack,
        JSON.stringify(pattern.preferredPorts),
        JSON.stringify(pattern.portRanges),
        JSON.stringify(pattern.timePatterns),
        JSON.stringify(pattern.conflictHistory),
        pattern.successRate,
        pattern.averageUsageDuration,
        Math.floor(pattern.lastUsed.getTime() / 1000),
        pattern.totalAllocations
      );

    } catch (error) {
      logger.error('保存端口使用模式失败', { appId: pattern.appId, error: error.message });
      throw error;
    }
  }

  /**
   * 分析端口亲和性规则
   */
  private async analyzePortAffinity(): Promise<void> {
    try {
      // 分析应用间的端口使用关联性
      const appsQuery = `
        SELECT DISTINCT app_id, app_name
        FROM port_allocations_core
        WHERE app_id IS NOT NULL
      `;
      
      const apps = this.db.prepare(appsQuery).all() as any[];

      for (const app of apps) {
        const affinityRules = await this.analyzeAppAffinity(app.app_id);
        if (affinityRules.length > 0) {
          this.affinityRules.set(app.app_id, affinityRules);
          
          // 保存到数据库
          for (const rule of affinityRules) {
            await this.saveAffinityRuleToDatabase(rule);
          }
        }
      }

      logger.debug('端口亲和性规则分析完成');
    } catch (error) {
      logger.error('分析端口亲和性规则失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 分析单个应用的亲和性规则
   */
  private async analyzeAppAffinity(appId: string): Promise<PortAffinityRule[]> {
    // 获取应用的端口使用历史
    const appPortsQuery = `
      SELECT DISTINCT port
      FROM port_allocations_core
      WHERE app_id = ?
    `;
    
    const appPorts = this.db.prepare(appPortsQuery).all(appId).map((row: any) => row.port);

    if (appPorts.length === 0) return [];

    // 查找在相似时间段内分配的其他应用
    const relatedAppsQuery = `
      SELECT DISTINCT app_id, port, allocated_at
      FROM port_allocations_core
      WHERE app_id != ? AND allocated_at > (strftime('%s', 'now') - 86400 * 30)
      ORDER BY allocated_at DESC
    `;
    
    const relatedApps = this.db.prepare(relatedAppsQuery).all(appId) as any[];

    // 分析端口距离关联性
    const affinityMap = new Map<string, { distance: number; frequency: number }>();

    for (const appPort of appPorts) {
      for (const related of relatedApps) {
        const distance = Math.abs(related.port - appPort);
        if (distance <= 10) { // 只考虑距离10以内的端口
          const key = related.app_id;
          const existing = affinityMap.get(key) || { distance: 0, frequency: 0 };
          existing.distance = (existing.distance * existing.frequency + distance) / (existing.frequency + 1);
          existing.frequency++;
          affinityMap.set(key, existing);
        }
      }
    }

    // 生成亲和性规则
    const rules: PortAffinityRule[] = [];
    
    for (const [relatedAppId, affinity] of affinityMap.entries()) {
      if (affinity.frequency >= 3) { // 至少3次关联才认为有亲和性
        const strength = Math.min(affinity.frequency / 10, 1.0); // 频率越高强度越大
        
        rules.push({
          appId,
          relatedApps: [relatedAppId],
          preferredDistance: Math.round(affinity.distance),
          affinityType: affinity.distance <= 3 ? 'adjacent' : 'range',
          strength
        });
      }
    }

    return rules;
  }

  /**
   * 保存亲和性规则到数据库
   */
  private async saveAffinityRuleToDatabase(rule: PortAffinityRule): Promise<void> {
    try {
      const id = `${rule.appId}_${rule.relatedApps.join('_')}_${Date.now()}`;
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO port_affinity_rules (
          id, app_id, related_apps, preferred_distance, affinity_type, strength, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
      `);

      stmt.run(
        id,
        rule.appId,
        JSON.stringify(rule.relatedApps),
        rule.preferredDistance,
        rule.affinityType,
        rule.strength
      );

    } catch (error) {
      logger.error('保存端口亲和性规则失败', { appId: rule.appId, error: error.message });
      throw error;
    }
  }

  /**
   * 分析负载均衡指标
   */
  private async analyzeLoadBalancing(): Promise<void> {
    try {
      // 分析端口范围负载
      const portRanges = await this.analyzePortRangeLoad();
      
      // 识别热点端口
      const hotspots = await this.identifyPortHotspots();
      
      // 生成负载均衡建议
      const recommendations = this.generateLoadBalancingRecommendations(portRanges, hotspots);

      this.loadMetrics = {
        portRanges,
        hotspots,
        recommendations
      };

      // 保存到数据库
      await this.saveLoadMetricsToDatabase(this.loadMetrics);

      logger.debug('负载均衡指标分析完成', { 
        rangesCount: portRanges.length,
        hotspotsCount: hotspots.length,
        recommendationsCount: recommendations.length
      });

    } catch (error) {
      logger.error('分析负载均衡指标失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 分析端口范围负载
   */
  private async analyzePortRangeLoad(): Promise<{ start: number; end: number; load: number; capacity: number }[]> {
    const ranges = [
      { start: 3000, end: 3099, capacity: 100 },
      { start: 4000, end: 4099, capacity: 100 },
      { start: 5000, end: 5099, capacity: 100 },
      { start: 8000, end: 8099, capacity: 100 },
      { start: 8080, end: 8179, capacity: 100 }
    ];

    const rangeLoads = [];

    for (const range of ranges) {
      const loadQuery = `
        SELECT COUNT(*) as load
        FROM port_allocations_core
        WHERE port >= ? AND port <= ? AND status IN (0, 1, 2)
      `;
      
      const result = this.db.prepare(loadQuery).get(range.start, range.end) as any;
      
      rangeLoads.push({
        start: range.start,
        end: range.end,
        load: result.load || 0,
        capacity: range.capacity
      });
    }

    return rangeLoads;
  }

  /**
   * 识别端口热点
   */
  private async identifyPortHotspots(): Promise<number[]> {
    const hotspotQuery = `
      SELECT port, COUNT(*) as usage_count
      FROM port_usage_history_current
      WHERE timestamp > (strftime('%s', 'now') - 86400)
      GROUP BY port
      HAVING usage_count > 10
      ORDER BY usage_count DESC
      LIMIT 20
    `;
    
    const hotspots = this.db.prepare(hotspotQuery).all() as any[];
    return hotspots.map(h => h.port);
  }

  /**
   * 生成负载均衡建议
   */
  private generateLoadBalancingRecommendations(
    portRanges: { start: number; end: number; load: number; capacity: number }[],
    hotspots: number[]
  ): { action: 'avoid' | 'prefer'; ports: number[]; reason: string }[] {
    const recommendations = [];

    // 避免高负载范围
    for (const range of portRanges) {
      const loadRatio = range.load / range.capacity;
      if (loadRatio > 0.8) {
        const ports = [];
        for (let port = range.start; port <= range.end; port++) {
          ports.push(port);
        }
        recommendations.push({
          action: 'avoid' as const,
          ports,
          reason: `端口范围 ${range.start}-${range.end} 负载过高 (${(loadRatio * 100).toFixed(1)}%)`
        });
      } else if (loadRatio < 0.3) {
        const ports = [];
        for (let port = range.start; port <= range.end; port++) {
          ports.push(port);
        }
        recommendations.push({
          action: 'prefer' as const,
          ports,
          reason: `端口范围 ${range.start}-${range.end} 负载较低 (${(loadRatio * 100).toFixed(1)}%)，推荐使用`
        });
      }
    }

    // 避免热点端口
    if (hotspots.length > 0) {
      recommendations.push({
        action: 'avoid',
        ports: hotspots,
        reason: '这些端口在过去24小时内使用频率过高'
      });
    }

    return recommendations;
  }

  /**
   * 保存负载指标到数据库
   */
  private async saveLoadMetricsToDatabase(metrics: LoadBalancingMetrics): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO load_balancing_metrics (port_ranges, hotspots, recommendations)
        VALUES (?, ?, ?)
      `);

      stmt.run(
        JSON.stringify(metrics.portRanges),
        JSON.stringify(metrics.hotspots),
        JSON.stringify(metrics.recommendations)
      );

      // 清理旧数据，只保留最近7天的记录
      const cleanupStmt = this.db.prepare(`
        DELETE FROM load_balancing_metrics
        WHERE analysis_time < (strftime('%s', 'now') - 86400 * 7)
      `);
      cleanupStmt.run();

    } catch (error) {
      logger.error('保存负载均衡指标失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 获取应用的端口使用模式
   */
  getAppPattern(appId: string): PortUsagePattern | null {
    return this.patterns.get(appId) || null;
  }

  /**
   * 获取应用的亲和性规则
   */
  getAffinityRules(appId: string): PortAffinityRule[] {
    return this.affinityRules.get(appId) || [];
  }

  /**
   * 获取负载均衡指标
   */
  getLoadBalancingMetrics(): LoadBalancingMetrics | null {
    return this.loadMetrics;
  }

  /**
   * 获取所有应用模式
   */
  getAllPatterns(): Map<string, PortUsagePattern> {
    return new Map(this.patterns);
  }

  /**
   * 强制重新分析
   */
  async forceAnalysis(): Promise<void> {
    logger.info('强制执行端口使用模式分析');
    await this.performFullAnalysis();
  }

  /**
   * 获取分析统计信息
   */
  getAnalysisStats(): {
    lastAnalysisTime: Date | null;
    patternsCount: number;
    affinityRulesCount: number;
    loadMetricsAvailable: boolean;
  } {
    return {
      lastAnalysisTime: this.lastAnalysisTime,
      patternsCount: this.patterns.size,
      affinityRulesCount: Array.from(this.affinityRules.values()).reduce((sum, rules) => sum + rules.length, 0),
      loadMetricsAvailable: this.loadMetrics !== null
    };
  }

  /**
   * 销毁分析器
   */
  destroy(): void {
    logger.info('销毁端口使用模式分析器');
    // 清理定时器等资源
  }
}
