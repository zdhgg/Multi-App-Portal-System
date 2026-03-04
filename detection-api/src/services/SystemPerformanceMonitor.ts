/**
 * 系统性能监控器
 * 用于监控端口分配和系统资源的性能指标
 */

import { EventEmitter } from 'events';
import { Database } from 'better-sqlite3';
import { logger } from '../utils/logger';

export interface PerformanceMetric {
  timestamp: Date;
  metricType: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface AllocationMetric {
  duration: number;
  port: number;
  appId: string;
  success: boolean;
  timestamp: Date;
}

export interface DatabaseMetric {
  queryType: string;
  duration: number;
  success: boolean;
  timestamp: Date;
}

export interface PerformanceSummary {
  timeRange: string;
  totalAllocations: number;
  avgAllocationTime: number;
  successRate: number;
  peakLoad: number;
}

export interface MonitoringConfig {
  enabled?: boolean;
  metricsRetentionDays?: number;
  alertThresholds?: {
    allocationTime?: number;
    errorRate?: number;
  };
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  diskUsage: number;
  timestamp: Date;
}

export interface PerformanceAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface MonitoringStatus {
  enabled: boolean;
  isRunning: boolean;
  metricsCollected: number;
  uptime: number;
}

/**
 * 系统性能监控器类
 */
export class SystemPerformanceMonitor extends EventEmitter {
  private db: Database;
  private config: MonitoringConfig;
  private isInitialized = false;
  private isRunning = false;
  private startTime = Date.now();
  private metricsCount = 0;
  private alerts: Map<string, PerformanceAlert> = new Map();

  constructor(database: Database, config?: Partial<MonitoringConfig>) {
    super();
    this.db = database;
    this.config = {
      enabled: true,
      metricsRetentionDays: 7,
      alertThresholds: {
        allocationTime: 1000,  // 1秒
        errorRate: 0.05        // 5%
      },
      ...config
    };
    
    logger.info('SystemPerformanceMonitor created', { config: this.config });
  }

  /**
   * 初始化监控器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('SystemPerformanceMonitor already initialized');
      return;
    }

    try {
      // 创建性能指标表（如果不存在）
      this.createTables();
      
      this.isInitialized = true;
      this.isRunning = true;
      
      logger.info('✅ SystemPerformanceMonitor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SystemPerformanceMonitor', { error });
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private createTables(): void {
    // 使用已有的表，不重复创建
    // port_performance_metrics 等表已在其他地方创建
  }

  /**
   * 记录端口分配性能指标
   */
  recordAllocationMetric(metric: AllocationMetric): void {
    if (!this.config.enabled) return;

    try {
      this.metricsCount++;
      
      // 检查是否需要告警
      if (metric.duration > (this.config.alertThresholds?.allocationTime || 1000)) {
        this.emit('alertTriggered', {
          type: 'slow_allocation',
          severity: 'medium',
          message: `Port allocation took ${metric.duration}ms`,
          port: metric.port,
          appId: metric.appId
        });
      }

      this.emit('allocationMetricRecorded', metric);
    } catch (error) {
      logger.error('Failed to record allocation metric', { error, metric });
    }
  }

  /**
   * 记录数据库操作性能指标
   */
  recordDatabaseMetric(metric: DatabaseMetric): void {
    if (!this.config.enabled) return;

    try {
      this.metricsCount++;
      this.emit('databaseMetricRecorded', metric);
    } catch (error) {
      logger.error('Failed to record database metric', { error, metric });
    }
  }

  /**
   * 获取性能摘要
   */
  async getPerformanceSummary(timeRange?: string): Promise<PerformanceSummary> {
    try {
      // 返回简单的统计信息
      return {
        timeRange: timeRange || 'last_hour',
        totalAllocations: this.metricsCount,
        avgAllocationTime: 50, // 模拟数据
        successRate: 0.98,
        peakLoad: 10
      };
    } catch (error) {
      logger.error('Failed to get performance summary', { error });
      throw error;
    }
  }

  /**
   * 获取实时系统指标
   */
  getRealtimeSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    return {
      cpu: process.cpuUsage().user / 1000000, // 转换为毫秒
      memory: (memUsage.heapUsed / memUsage.heapTotal) * 100,
      diskUsage: 0, // 简化实现
      timestamp: new Date()
    };
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.acknowledged);
  }

  /**
   * 确认告警
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      logger.info('Alert acknowledged', { alertId });
    }
  }

  /**
   * 检测端口泄漏
   */
  async detectPortLeaks(): Promise<any[]> {
    try {
      // 查询长时间占用但无活动的端口
      const stmt = this.db.prepare(`
        SELECT port, app_id, allocated_at
        FROM port_allocations
        WHERE status = 'allocated'
        AND allocated_at < datetime('now', '-1 hour')
        LIMIT 100
      `);
      
      return stmt.all();
    } catch (error) {
      logger.error('Failed to detect port leaks', { error });
      return [];
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('SystemPerformanceMonitor config updated', { config: this.config });
  }

  /**
   * 获取监控状态
   */
  getMonitoringStatus(): MonitoringStatus {
    return {
      enabled: this.config.enabled || false,
      isRunning: this.isRunning,
      metricsCollected: this.metricsCount,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    this.isRunning = false;
    this.removeAllListeners();
    logger.info('SystemPerformanceMonitor destroyed');
  }
}

