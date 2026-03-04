# AdvancedAnalytics API 文档

## 概述

AdvancedAnalytics 是一个高级数据分析和报告系统，提供端口使用模式分析、预测分析、聚类分析、时间序列分析等功能。本文档详细描述了所有公共API方法的使用方式。

## 类初始化

### 构造函数

```typescript
constructor(database: Database.Database, config?: Partial<AnalyticsConfig>)
```

**参数**：
- `database`: SQLite数据库实例
- `config`: 可选的配置参数

**配置参数**：
```typescript
interface AnalyticsConfig {
  enabled: boolean;                    // 是否启用分析系统
  analysisInterval: number;            // 分析间隔（毫秒）
  predictionWindow: number;            // 预测窗口（小时）
  dataRetentionDays: number;          // 数据保留天数
  mlModelUpdateInterval: number;       // ML模型更新间隔（小时）
  realTimeThreshold: number;          // 实时分析阈值（毫秒）
  accuracyTarget: number;             // 准确率目标（0-1）
  cacheEnabled?: boolean;             // 是否启用缓存
  cacheSize?: number;                 // 缓存大小
  cacheTTL?: number;                  // 缓存TTL（毫秒）
  maxConcurrentAnalysis?: number;     // 最大并发分析数
  performanceMonitoring?: boolean;    // 性能监控
  distributedAnalysis?: boolean;      // 是否启用分布式分析
}
```

**示例**：
```typescript
import Database from 'better-sqlite3';
import { AdvancedAnalytics } from './AdvancedAnalytics';

const database = new Database('analytics.db');
const analytics = new AdvancedAnalytics(database, {
  enabled: true,
  analysisInterval: 300000,  // 5分钟
  cacheEnabled: true,
  maxConcurrentAnalysis: 10
});
```

## 核心分析方法

### initializeAnalytics()

初始化分析系统，创建必要的数据库表和配置。

```typescript
async initializeAnalytics(): Promise<void>
```

**返回值**：Promise<void>

**示例**：
```typescript
await analytics.initializeAnalytics();
```

### start()

启动分析系统，开始定期分析任务。

```typescript
async start(): Promise<void>
```

**返回值**：Promise<void>

**示例**：
```typescript
await analytics.start();
```

### stop()

停止分析系统，清理资源。

```typescript
async stop(): Promise<void>
```

**返回值**：Promise<void>

**示例**：
```typescript
await analytics.stop();
```

### performPatternAnalysis()

执行端口使用模式分析。

```typescript
async performPatternAnalysis(): Promise<DataAnalysisResult>
```

**返回值**：
```typescript
interface DataAnalysisResult {
  id: string;
  analysisType: string;
  timestamp: string;
  dataPoints: number;
  accuracy: number;
  confidence: number | null;
  insights: AnalysisInsight[];
  recommendations: string[];
  metadata: any;
}
```

**示例**：
```typescript
const patternResult = await analytics.performPatternAnalysis();
console.log(`发现 ${patternResult.insights.length} 个模式洞察`);
console.log(`分析准确率: ${patternResult.accuracy * 100}%`);
```

### performClusteringAnalysis()

执行聚类分析，识别相似的应用使用模式。

```typescript
async performClusteringAnalysis(): Promise<DataAnalysisResult>
```

**返回值**：DataAnalysisResult（同上）

**示例**：
```typescript
const clusterResult = await analytics.performClusteringAnalysis();
console.log(`聚类分析完成，准确率: ${clusterResult.accuracy}`);
```

### performTimeSeriesAnalysis()

执行时间序列分析和预测。

```typescript
async performTimeSeriesAnalysis(): Promise<DataAnalysisResult>
```

**返回值**：DataAnalysisResult（同上）

**示例**：
```typescript
const timeSeriesResult = await analytics.performTimeSeriesAnalysis();
console.log(`时间序列分析完成，数据点: ${timeSeriesResult.dataPoints}`);
```

### performPredictiveAnalysis()

执行预测分析，基于历史数据预测未来趋势。

```typescript
async performPredictiveAnalysis(): Promise<PredictiveAnalysisResult>
```

**返回值**：
```typescript
interface PredictiveAnalysisResult {
  predictions: Array<{
    timestamp: number;
    metric: string;
    predictedValue: number;
    confidence: number;
    trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  }>;
  accuracy: number;
  modelType: string;
  forecastHorizon: number;
}
```

**示例**：
```typescript
const predictions = await analytics.performPredictiveAnalysis();
predictions.predictions.forEach(pred => {
  console.log(`${pred.metric}: ${pred.predictedValue} (置信度: ${pred.confidence})`);
});
```

### performAnomalyDetection()

执行异常检测分析。

```typescript
async performAnomalyDetection(): Promise<AnomalyDetectionResult>
```

**返回值**：
```typescript
interface AnomalyDetectionResult {
  anomalies: Array<{
    timestamp: number;
    metric: string;
    value: number;
    expectedValue: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: 'statistical' | 'pattern' | 'trend' | 'seasonal';
    confidence: number;
  }>;
  totalAnomalies: number;
  detectionAccuracy: number;
}
```

**示例**：
```typescript
const anomalies = await analytics.performAnomalyDetection();
console.log(`检测到 ${anomalies.totalAnomalies} 个异常`);
```

## 即时分析方法

### performInstantAnalysis()

执行即时分析，快速获取分析结果。

```typescript
async performInstantAnalysis(type: 'pattern' | 'clustering' | 'timeseries' | 'anomaly'): Promise<DataAnalysisResult>
```

**参数**：
- `type`: 分析类型

**返回值**：DataAnalysisResult

**示例**：
```typescript
const instantResult = await analytics.performInstantAnalysis('pattern');
console.log(`即时分析完成: ${instantResult.analysisType}`);
```

## 报告生成方法

### generateReport()

生成分析报告。

```typescript
async generateReport(templateId: string, options?: ReportOptions): Promise<GeneratedReport>
```

**参数**：
- `templateId`: 报告模板ID
- `options`: 可选的报告选项

**返回值**：
```typescript
interface GeneratedReport {
  id: string;
  templateId: string;
  title: string;
  content: string;
  format: 'markdown' | 'html' | 'pdf' | 'json';
  generatedAt: string;
  metadata: any;
}
```

**示例**：
```typescript
const report = await analytics.generateReport('executive-summary', {
  format: 'markdown',
  includeCharts: true
});
console.log(`报告生成完成: ${report.title}`);
```

### getAvailableReportTemplates()

获取可用的报告模板列表。

```typescript
async getAvailableReportTemplates(): Promise<ReportTemplate[]>
```

**返回值**：
```typescript
interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  format: string;
  parameters: any;
}
```

**示例**：
```typescript
const templates = await analytics.getAvailableReportTemplates();
templates.forEach(template => {
  console.log(`${template.name}: ${template.description}`);
});
```

## 仪表板方法

### createCustomDashboard()

创建自定义仪表板。

```typescript
async createCustomDashboard(config: DashboardConfig): Promise<string>
```

**参数**：
```typescript
interface DashboardConfig {
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  layout: DashboardLayout;
  refreshInterval?: number;
  realTimeSettings?: {
    enabled: boolean;
    updateInterval: number;
  };
}
```

**返回值**：仪表板ID（字符串）

**示例**：
```typescript
const dashboardId = await analytics.createCustomDashboard({
  name: '端口使用监控',
  widgets: [
    { type: 'chart', metric: 'port_usage', title: '端口使用趋势' },
    { type: 'gauge', metric: 'allocation_rate', title: '分配成功率' }
  ],
  layout: { columns: 2, rows: 1 },
  refreshInterval: 30000
});
```

### getDashboardData()

获取仪表板数据。

```typescript
async getDashboardData(dashboardId: string, timeRange?: TimeRange): Promise<DashboardData>
```

**参数**：
- `dashboardId`: 仪表板ID
- `timeRange`: 可选的时间范围

**返回值**：
```typescript
interface DashboardData {
  dashboardId: string;
  timestamp: string;
  widgets: Array<{
    id: string;
    type: string;
    data: any;
    lastUpdated: string;
  }>;
  metadata: any;
}
```

**示例**：
```typescript
const dashboardData = await analytics.getDashboardData(dashboardId, {
  start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 过去24小时
  end: new Date()
});
```

## 缓存和性能方法

### getCacheStatistics()

获取缓存统计信息。

```typescript
async getCacheStatistics(): Promise<CacheStatistics>
```

**返回值**：
```typescript
interface CacheStatistics {
  size: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  totalRequests: number;
}
```

**示例**：
```typescript
const cacheStats = await analytics.getCacheStatistics();
console.log(`缓存命中率: ${(cacheStats.hitRate * 100).toFixed(2)}%`);
```

### getSystemStatus()

获取系统状态信息。

```typescript
async getSystemStatus(): Promise<SystemStatus>
```

**返回值**：
```typescript
interface SystemStatus {
  isRunning: boolean;
  isInitialized: boolean;
  uptime: number;
  lastAnalysisTime: number;
  performanceMetrics: any;
  healthStatus: 'healthy' | 'warning' | 'critical';
}
```

**示例**：
```typescript
const status = await analytics.getSystemStatus();
console.log(`系统状态: ${status.healthStatus}`);
console.log(`运行时间: ${status.uptime}ms`);
```

## 错误处理

所有异步方法都可能抛出以下类型的错误：

### AnalyticsError

```typescript
class AnalyticsError extends Error {
  code: string;
  details?: any;
}
```

**常见错误代码**：
- `ANALYTICS_NOT_INITIALIZED`: 分析系统未初始化
- `ANALYTICS_NOT_RUNNING`: 分析系统未运行
- `INVALID_CONFIGURATION`: 无效的配置参数
- `DATABASE_ERROR`: 数据库操作错误
- `ANALYSIS_FAILED`: 分析执行失败
- `CACHE_ERROR`: 缓存操作错误

**错误处理示例**：
```typescript
try {
  const result = await analytics.performPatternAnalysis();
} catch (error) {
  if (error instanceof AnalyticsError) {
    console.error(`分析错误 [${error.code}]: ${error.message}`);
    if (error.details) {
      console.error('错误详情:', error.details);
    }
  } else {
    console.error('未知错误:', error);
  }
}
```

## 事件监听

AdvancedAnalytics 继承自 EventEmitter，支持以下事件：

### 事件类型

- `initialized`: 系统初始化完成
- `started`: 系统启动完成
- `stopped`: 系统停止完成
- `analysisCompleted`: 分析完成
- `instantAnalysisCompleted`: 即时分析完成
- `reportGenerated`: 报告生成完成
- `error`: 错误发生

**事件监听示例**：
```typescript
analytics.on('analysisCompleted', (data) => {
  console.log(`分析完成: ${data.analysisType}, 耗时: ${data.analysisTime}ms`);
});

analytics.on('error', (error) => {
  console.error('分析系统错误:', error);
});
```

## 最佳实践

### 1. 初始化和启动
```typescript
// 正确的初始化顺序
const analytics = new AdvancedAnalytics(database, config);
await analytics.initializeAnalytics();
await analytics.start();
```

### 2. 错误处理
```typescript
// 始终使用 try-catch 处理异步操作
try {
  const result = await analytics.performPatternAnalysis();
  // 处理结果
} catch (error) {
  // 处理错误
}
```

### 3. 资源清理
```typescript
// 应用关闭时清理资源
process.on('SIGINT', async () => {
  await analytics.stop();
  process.exit(0);
});
```

### 4. 性能优化
```typescript
// 启用缓存以提高性能
const analytics = new AdvancedAnalytics(database, {
  cacheEnabled: true,
  cacheSize: 1000,
  cacheTTL: 300000
});
```

---

**文档版本**: v1.0  
**最后更新**: 2025年9月27日  
**维护者**: 高级分析系统开发团队
