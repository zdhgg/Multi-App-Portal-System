# 故障排除和调试指南

## 概述

本指南提供了高级分析和报告系统常见问题的诊断和解决方法，帮助开发者和运维人员快速定位和解决问题。

## 诊断工具

### 1. 系统状态检查

```typescript
// 快速系统健康检查
async function quickHealthCheck(): Promise<HealthCheckResult> {
  const analytics = getAnalyticsInstance();
  
  const checks = {
    // 基础检查
    isInitialized: analytics.isInitialized(),
    isRunning: analytics.isRunning(),
    
    // 数据库检查
    databaseConnection: await checkDatabaseConnection(),
    
    // 性能检查
    memoryUsage: process.memoryUsage(),
    cacheStatus: await analytics.getCacheStatistics(),
    
    // 功能检查
    analysisCapability: await testAnalysisCapability(),
    
    // 最近错误
    recentErrors: await getRecentErrors()
  };
  
  return {
    overall: calculateOverallHealth(checks),
    details: checks,
    timestamp: new Date()
  };
}

// 使用示例
const healthStatus = await quickHealthCheck();
console.log('系统健康状态:', healthStatus.overall);
if (healthStatus.overall !== 'healthy') {
  console.log('问题详情:', healthStatus.details);
}
```

### 2. 详细诊断工具

```typescript
class DiagnosticTool {
  async runFullDiagnostic(): Promise<DiagnosticReport> {
    const report: DiagnosticReport = {
      timestamp: new Date(),
      systemInfo: await this.getSystemInfo(),
      databaseStatus: await this.checkDatabase(),
      performanceMetrics: await this.getPerformanceMetrics(),
      configurationStatus: await this.checkConfiguration(),
      analysisStatus: await this.checkAnalysisComponents(),
      recommendations: []
    };
    
    // 生成建议
    report.recommendations = this.generateRecommendations(report);
    
    return report;
  }
  
  private async getSystemInfo(): Promise<SystemInfo> {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    };
  }
  
  private async checkDatabase(): Promise<DatabaseStatus> {
    try {
      const database = getDatabaseInstance();
      
      // 检查连接
      const connectionTest = database.prepare('SELECT 1 as test').get();
      
      // 检查表结构
      const tables = database.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name LIKE 'analytics_%'
      `).all();
      
      // 检查数据量
      const dataCounts = {};
      for (const table of tables) {
        const count = database.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        dataCounts[table.name] = count.count;
      }
      
      return {
        connected: true,
        tablesExist: tables.length > 0,
        tableCount: tables.length,
        dataCounts,
        lastError: null
      };
    } catch (error) {
      return {
        connected: false,
        tablesExist: false,
        tableCount: 0,
        dataCounts: {},
        lastError: error.message
      };
    }
  }
}
```

## 常见问题及解决方案

### 1. 初始化问题

#### 问题：分析系统初始化失败

**错误信息**：
```
Error: ANALYTICS_NOT_INITIALIZED
Database initialization failed
```

**诊断步骤**：
```typescript
async function diagnoseInitializationIssue(): Promise<void> {
  console.log('=== 初始化问题诊断 ===');
  
  // 1. 检查数据库文件
  const dbPath = './analytics.db';
  if (!fs.existsSync(dbPath)) {
    console.log('❌ 数据库文件不存在:', dbPath);
    console.log('解决方案: 创建数据库文件或检查路径配置');
    return;
  }
  
  // 2. 检查数据库权限
  try {
    fs.accessSync(dbPath, fs.constants.R_OK | fs.constants.W_OK);
    console.log('✅ 数据库文件权限正常');
  } catch (error) {
    console.log('❌ 数据库文件权限问题:', error.message);
    console.log('解决方案: 检查文件权限，确保应用有读写权限');
    return;
  }
  
  // 3. 检查数据库连接
  try {
    const database = new Database(dbPath);
    const result = database.prepare('SELECT 1').get();
    console.log('✅ 数据库连接正常');
    database.close();
  } catch (error) {
    console.log('❌ 数据库连接失败:', error.message);
    console.log('解决方案: 检查数据库文件是否损坏，考虑重新创建');
    return;
  }
  
  // 4. 检查表结构
  try {
    const database = new Database(dbPath);
    const analytics = new AdvancedAnalytics(database);
    await analytics.initializeAnalytics();
    console.log('✅ 分析系统初始化成功');
  } catch (error) {
    console.log('❌ 分析系统初始化失败:', error.message);
    console.log('解决方案: 检查SQL语句和表结构定义');
  }
}
```

**解决方案**：
1. 确保数据库文件存在且有正确权限
2. 检查数据库连接字符串
3. 验证表结构创建SQL语句
4. 清理并重新初始化数据库

### 2. 性能问题

#### 问题：分析执行时间过长

**诊断步骤**：
```typescript
async function diagnosePerformanceIssue(): Promise<void> {
  console.log('=== 性能问题诊断 ===');
  
  const analytics = getAnalyticsInstance();
  
  // 1. 检查缓存状态
  const cacheStats = await analytics.getCacheStatistics();
  console.log('缓存统计:', {
    命中率: `${(cacheStats.hitRate * 100).toFixed(2)}%`,
    缓存大小: cacheStats.size,
    总请求数: cacheStats.totalRequests
  });
  
  if (cacheStats.hitRate < 0.3) {
    console.log('⚠️  缓存命中率过低，建议优化缓存策略');
  }
  
  // 2. 检查并发分析数量
  const systemStatus = await analytics.getSystemStatus();
  console.log('系统状态:', {
    运行状态: systemStatus.isRunning ? '运行中' : '已停止',
    平均响应时间: `${systemStatus.performanceMetrics?.avgResponseTime || 0}ms`,
    错误率: `${((systemStatus.performanceMetrics?.errorRate || 0) * 100).toFixed(2)}%`
  });
  
  // 3. 内存使用检查
  const memoryUsage = process.memoryUsage();
  console.log('内存使用:', {
    RSS: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
    堆内存: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
    堆总量: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
  });
  
  if (memoryUsage.heapUsed > 500 * 1024 * 1024) {
    console.log('⚠️  内存使用过高，可能存在内存泄漏');
  }
  
  // 4. 数据量检查
  const database = getDatabaseInstance();
  const dataCounts = {
    port_allocations: database.prepare('SELECT COUNT(*) as count FROM port_allocations').get().count,
    analytics_results: database.prepare('SELECT COUNT(*) as count FROM analytics_results').get().count,
    performance_metrics: database.prepare('SELECT COUNT(*) as count FROM performance_metrics').get().count
  };
  
  console.log('数据量统计:', dataCounts);
  
  if (dataCounts.port_allocations > 100000) {
    console.log('⚠️  数据量过大，建议实施数据清理策略');
  }
}
```

**解决方案**：
1. 优化缓存配置，增加缓存大小和TTL
2. 减少并发分析数量
3. 实施数据清理策略
4. 优化数据库查询和索引

### 3. 内存泄漏问题

#### 问题：内存使用持续增长

**诊断工具**：
```typescript
class MemoryLeakDetector {
  private memorySnapshots: MemorySnapshot[] = [];
  
  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    setInterval(async () => {
      const snapshot = await this.takeMemorySnapshot();
      this.memorySnapshots.push(snapshot);
      
      // 保留最近100个快照
      if (this.memorySnapshots.length > 100) {
        this.memorySnapshots.shift();
      }
      
      // 检查内存泄漏
      if (this.memorySnapshots.length >= 10) {
        const leakDetected = this.detectMemoryLeak();
        if (leakDetected) {
          console.warn('⚠️  检测到可能的内存泄漏');
          await this.generateMemoryReport();
        }
      }
    }, intervalMs);
  }
  
  private async takeMemorySnapshot(): Promise<MemorySnapshot> {
    const memoryUsage = process.memoryUsage();
    const cacheStats = await getAnalyticsInstance().getCacheStatistics();
    
    return {
      timestamp: Date.now(),
      rss: memoryUsage.rss,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      cacheSize: cacheStats.size,
      activeAnalyses: await this.getActiveAnalysesCount()
    };
  }
  
  private detectMemoryLeak(): boolean {
    if (this.memorySnapshots.length < 10) return false;
    
    const recent = this.memorySnapshots.slice(-10);
    const trend = this.calculateTrend(recent.map(s => s.heapUsed));
    
    // 如果内存使用呈持续上升趋势，且增长率超过阈值
    return trend.slope > 1024 * 1024 && trend.correlation > 0.8; // 1MB/分钟
  }
  
  private calculateTrend(values: number[]): { slope: number; correlation: number } {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumYY = values.reduce((sum, yi) => sum + yi * yi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
    
    return { slope, correlation };
  }
}
```

**解决方案**：
1. 定期清理缓存
2. 确保事件监听器正确移除
3. 检查定时器是否正确清理
4. 优化数据结构，避免循环引用

### 4. 分析准确率问题

#### 问题：分析结果准确率低于预期

**诊断步骤**：
```typescript
async function diagnoseAccuracyIssue(): Promise<void> {
  console.log('=== 准确率问题诊断 ===');
  
  const analytics = getAnalyticsInstance();
  
  // 1. 数据质量评估
  const dataQuality = await analytics.assessDataQuality();
  console.log('数据质量评估:', {
    完整性: `${(dataQuality.completeness * 100).toFixed(2)}%`,
    一致性: `${(dataQuality.consistency * 100).toFixed(2)}%`,
    准确性: `${(dataQuality.accuracy * 100).toFixed(2)}%`,
    时效性: `${(dataQuality.timeliness * 100).toFixed(2)}%`
  });
  
  // 2. 模型性能评估
  const modelMetrics = await analytics.getModelMetrics();
  console.log('模型性能:', {
    预测准确率: `${(modelMetrics.predictionAccuracy * 100).toFixed(2)}%`,
    聚类质量: `${(modelMetrics.clusteringQuality * 100).toFixed(2)}%`,
    异常检测精度: `${(modelMetrics.anomalyDetectionPrecision * 100).toFixed(2)}%`
  });
  
  // 3. 训练数据分析
  const trainingDataStats = await analytics.getTrainingDataStatistics();
  console.log('训练数据统计:', {
    样本数量: trainingDataStats.sampleCount,
    特征数量: trainingDataStats.featureCount,
    数据分布: trainingDataStats.distribution,
    最后更新: new Date(trainingDataStats.lastUpdate).toLocaleString()
  });
  
  // 4. 生成改进建议
  const recommendations = [];
  
  if (dataQuality.completeness < 0.8) {
    recommendations.push('增加数据收集覆盖率，确保数据完整性');
  }
  
  if (dataQuality.consistency < 0.7) {
    recommendations.push('检查数据收集逻辑，确保数据一致性');
  }
  
  if (trainingDataStats.sampleCount < 1000) {
    recommendations.push('增加训练样本数量，提高模型泛化能力');
  }
  
  if (Date.now() - trainingDataStats.lastUpdate > 7 * 24 * 60 * 60 * 1000) {
    recommendations.push('更新训练数据，重新训练模型');
  }
  
  console.log('改进建议:', recommendations);
}
```

**解决方案**：
1. 提高数据质量和完整性
2. 增加训练样本数量
3. 定期重新训练模型
4. 调整模型参数和算法
5. 实施特征工程优化

## 调试技巧

### 1. 启用详细日志

```typescript
// 配置详细日志
const analytics = new AdvancedAnalytics(database, {
  logLevel: 'debug',
  enablePerformanceLogging: true,
  enableAnalysisLogging: true
});

// 自定义日志处理
analytics.on('log', (logEntry) => {
  console.log(`[${logEntry.level}] ${logEntry.timestamp}: ${logEntry.message}`);
  if (logEntry.data) {
    console.log('数据:', JSON.stringify(logEntry.data, null, 2));
  }
});
```

### 2. 性能分析

```typescript
// 性能分析装饰器
function performanceAnalysis(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await method.apply(this, args);
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      console.log(`性能分析 - ${propertyName}:`, {
        执行时间: `${(endTime - startTime).toFixed(2)}ms`,
        内存变化: `${Math.round((endMemory - startMemory) / 1024)}KB`,
        参数: args.length > 0 ? args[0] : '无'
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      console.error(`性能分析 - ${propertyName} 执行失败:`, {
        执行时间: `${(endTime - startTime).toFixed(2)}ms`,
        错误: error.message
      });
      throw error;
    }
  };
}

// 使用示例
class AdvancedAnalytics {
  @performanceAnalysis
  async performPatternAnalysis(): Promise<DataAnalysisResult> {
    // 方法实现
  }
}
```

### 3. 断点调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Analytics Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "src/tests/AdvancedAnalytics.test.ts", "--reporter=verbose"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "test",
        "DEBUG": "analytics:*"
      }
    },
    {
      "name": "Debug Analytics Service",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/services/AdvancedAnalytics.ts",
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "analytics:*"
      }
    }
  ]
}
```

## 监控和告警

### 1. 实时监控仪表板

```typescript
// 创建监控仪表板
async function createMonitoringDashboard(): Promise<void> {
  const analytics = getAnalyticsInstance();
  
  const dashboardConfig = {
    name: '系统监控仪表板',
    widgets: [
      {
        type: 'gauge',
        metric: 'system_health',
        title: '系统健康度',
        config: { min: 0, max: 100, thresholds: [70, 90] }
      },
      {
        type: 'chart',
        metric: 'memory_usage',
        title: '内存使用趋势',
        config: { chartType: 'line', timeRange: '1h' }
      },
      {
        type: 'table',
        metric: 'recent_errors',
        title: '最近错误',
        config: { maxRows: 10 }
      }
    ],
    refreshInterval: 30000
  };
  
  const dashboardId = await analytics.createCustomDashboard(dashboardConfig);
  console.log('监控仪表板创建成功:', dashboardId);
}
```

### 2. 自动告警系统

```typescript
class AlertSystem {
  private alerts: Alert[] = [];
  
  async checkAlerts(): Promise<void> {
    const analytics = getAnalyticsInstance();
    const systemStatus = await analytics.getSystemStatus();
    
    // 检查系统健康状态
    if (systemStatus.healthStatus === 'critical') {
      await this.sendAlert({
        level: 'critical',
        message: '分析系统处于严重状态',
        details: systemStatus,
        timestamp: new Date()
      });
    }
    
    // 检查内存使用
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
      await this.sendAlert({
        level: 'warning',
        message: '内存使用过高',
        details: { memoryUsage },
        timestamp: new Date()
      });
    }
    
    // 检查分析准确率
    const accuracy = await analytics.getCurrentAccuracy();
    if (accuracy < 0.8) {
      await this.sendAlert({
        level: 'warning',
        message: '分析准确率低于阈值',
        details: { accuracy },
        timestamp: new Date()
      });
    }
  }
  
  private async sendAlert(alert: Alert): Promise<void> {
    console.log(`🚨 告警 [${alert.level}]: ${alert.message}`);
    
    // 发送到监控系统
    // await this.sendToMonitoringSystem(alert);
    
    // 发送邮件通知
    // await this.sendEmailNotification(alert);
    
    // 记录告警历史
    this.alerts.push(alert);
  }
}
```

## 最佳实践

### 1. 预防性维护

```typescript
// 定期维护任务
class MaintenanceScheduler {
  async scheduleMaintenanceTasks(): Promise<void> {
    // 每日任务
    cron.schedule('0 2 * * *', async () => {
      await this.dailyMaintenance();
    });
    
    // 每周任务
    cron.schedule('0 3 * * 0', async () => {
      await this.weeklyMaintenance();
    });
    
    // 每月任务
    cron.schedule('0 4 1 * *', async () => {
      await this.monthlyMaintenance();
    });
  }
  
  private async dailyMaintenance(): Promise<void> {
    console.log('执行每日维护任务...');
    
    // 清理过期缓存
    await this.cleanExpiredCache();
    
    // 清理过期日志
    await this.cleanOldLogs();
    
    // 检查系统健康状态
    await this.performHealthCheck();
  }
  
  private async weeklyMaintenance(): Promise<void> {
    console.log('执行每周维护任务...');
    
    // 数据库优化
    await this.optimizeDatabase();
    
    // 重新训练模型
    await this.retrainModels();
    
    // 生成性能报告
    await this.generatePerformanceReport();
  }
  
  private async monthlyMaintenance(): Promise<void> {
    console.log('执行每月维护任务...');
    
    // 数据归档
    await this.archiveOldData();
    
    // 系统备份
    await this.performSystemBackup();
    
    // 容量规划分析
    await this.performCapacityPlanning();
  }
}
```

### 2. 错误恢复策略

```typescript
class ErrorRecoveryManager {
  async handleSystemError(error: Error): Promise<void> {
    console.error('系统错误:', error);
    
    // 记录错误
    await this.logError(error);
    
    // 尝试自动恢复
    const recovered = await this.attemptAutoRecovery(error);
    
    if (!recovered) {
      // 启用降级模式
      await this.enableDegradedMode();
      
      // 通知管理员
      await this.notifyAdministrators(error);
    }
  }
  
  private async attemptAutoRecovery(error: Error): Promise<boolean> {
    try {
      if (error.message.includes('database')) {
        // 数据库错误恢复
        await this.recoverDatabase();
        return true;
      }
      
      if (error.message.includes('memory')) {
        // 内存错误恢复
        await this.recoverMemory();
        return true;
      }
      
      if (error.message.includes('cache')) {
        // 缓存错误恢复
        await this.recoverCache();
        return true;
      }
      
      return false;
    } catch (recoveryError) {
      console.error('自动恢复失败:', recoveryError);
      return false;
    }
  }
}
```

---

**文档版本**: v1.0  
**最后更新**: 2025年9月27日  
**维护者**: 故障排除团队
