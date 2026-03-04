# AdvancedAnalytics REST API 文档

## 概述

本文档描述了高级分析和报告系统的REST API端点。所有API都遵循RESTful设计原则，使用JSON格式进行数据交换。

## 基础信息

- **基础URL**: `http://localhost:3000/api/v1/analytics`
- **认证方式**: Bearer Token
- **内容类型**: `application/json`
- **API版本**: v1.0

## 认证

所有API请求都需要在请求头中包含认证令牌：

```http
Authorization: Bearer <your-token>
Content-Type: application/json
```

## 通用响应格式

### 成功响应
```json
{
  "success": true,
  "data": {},
  "timestamp": "2025-09-27T10:00:00.000Z",
  "requestId": "uuid-string"
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  },
  "timestamp": "2025-09-27T10:00:00.000Z",
  "requestId": "uuid-string"
}
```

## 系统管理端点

### 获取系统状态

```http
GET /status
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "isInitialized": true,
    "uptime": 3600000,
    "lastAnalysisTime": 1695801600000,
    "healthStatus": "healthy",
    "performanceMetrics": {
      "avgResponseTime": 45,
      "totalRequests": 1250,
      "errorRate": 0.02
    }
  }
}
```

### 启动分析系统

```http
POST /start
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "message": "分析系统启动成功",
    "startTime": "2025-09-27T10:00:00.000Z"
  }
}
```

### 停止分析系统

```http
POST /stop
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "message": "分析系统停止成功",
    "stopTime": "2025-09-27T10:00:00.000Z"
  }
}
```

## 分析端点

### 执行模式分析

```http
POST /analysis/pattern
```

**请求参数**：
```json
{
  "timeRange": {
    "start": "2025-09-26T00:00:00.000Z",
    "end": "2025-09-27T00:00:00.000Z"
  },
  "options": {
    "includeRecommendations": true,
    "detailLevel": "high"
  }
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "analysis-uuid",
    "analysisType": "pattern",
    "timestamp": "2025-09-27T10:00:00.000Z",
    "dataPoints": 1000,
    "accuracy": 0.95,
    "confidence": 0.87,
    "insights": [
      {
        "type": "usage_pattern",
        "description": "检测到高峰期端口使用模式",
        "confidence": 0.92,
        "impact": "high",
        "recommendations": ["增加端口池大小", "优化分配算法"]
      }
    ],
    "recommendations": [
      "建议在高峰期预分配更多端口",
      "考虑实施动态端口池管理"
    ]
  }
}
```

### 执行聚类分析

```http
POST /analysis/clustering
```

**请求参数**：
```json
{
  "algorithm": "kmeans",
  "clusters": 5,
  "features": ["port_usage", "allocation_frequency", "duration"]
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "clustering-uuid",
    "analysisType": "clustering",
    "clusters": [
      {
        "id": 0,
        "size": 250,
        "centroid": [0.75, 0.82, 0.65],
        "characteristics": "高频短时使用模式"
      },
      {
        "id": 1,
        "size": 180,
        "centroid": [0.45, 0.23, 0.89],
        "characteristics": "低频长时使用模式"
      }
    ],
    "accuracy": 0.88,
    "silhouetteScore": 0.72
  }
}
```

### 执行时间序列分析

```http
POST /analysis/timeseries
```

**请求参数**：
```json
{
  "metric": "port_allocation_rate",
  "forecastHorizon": 24,
  "model": "arima"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "timeseries-uuid",
    "analysisType": "timeseries",
    "forecast": [
      {
        "timestamp": 1695801600000,
        "value": 0.75,
        "confidence": 0.85,
        "trend": "increasing"
      }
    ],
    "accuracy": 0.91,
    "modelMetrics": {
      "mse": 0.02,
      "mae": 0.15,
      "r2": 0.89
    }
  }
}
```

### 执行预测分析

```http
POST /analysis/predictive
```

**请求参数**：
```json
{
  "metrics": ["port_demand", "allocation_success_rate"],
  "horizon": 48,
  "confidence": 0.95
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "predictions": [
      {
        "timestamp": 1695801600000,
        "metric": "port_demand",
        "predictedValue": 850,
        "confidence": 0.92,
        "trend": "increasing"
      }
    ],
    "accuracy": 0.94,
    "modelType": "ensemble",
    "forecastHorizon": 48
  }
}
```

### 执行异常检测

```http
POST /analysis/anomaly
```

**请求参数**：
```json
{
  "sensitivity": "medium",
  "methods": ["statistical", "pattern", "trend"],
  "timeWindow": 24
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "anomalies": [
      {
        "timestamp": 1695801600000,
        "metric": "allocation_failure_rate",
        "value": 0.15,
        "expectedValue": 0.02,
        "severity": "high",
        "type": "statistical",
        "confidence": 0.95
      }
    ],
    "totalAnomalies": 3,
    "detectionAccuracy": 0.89
  }
}
```

### 即时分析

```http
POST /analysis/instant
```

**请求参数**：
```json
{
  "type": "pattern",
  "priority": "high"
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "instant-uuid",
    "analysisType": "pattern",
    "executionTime": 45,
    "insights": [],
    "accuracy": 0.87
  }
}
```

## 报告端点

### 生成报告

```http
POST /reports/generate
```

**请求参数**：
```json
{
  "templateId": "executive-summary",
  "format": "pdf",
  "options": {
    "includeCharts": true,
    "timeRange": {
      "start": "2025-09-26T00:00:00.000Z",
      "end": "2025-09-27T00:00:00.000Z"
    }
  }
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "report-uuid",
    "templateId": "executive-summary",
    "title": "端口管理系统执行摘要",
    "format": "pdf",
    "downloadUrl": "/api/v1/reports/download/report-uuid",
    "generatedAt": "2025-09-27T10:00:00.000Z",
    "size": 2048576
  }
}
```

### 获取报告模板

```http
GET /reports/templates
```

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "executive-summary",
      "name": "执行摘要",
      "description": "高层管理报告，包含关键指标和趋势",
      "category": "management",
      "format": "pdf",
      "parameters": {
        "timeRange": "required",
        "includeCharts": "optional"
      }
    }
  ]
}
```

### 下载报告

```http
GET /reports/download/{reportId}
```

**响应**：二进制文件流

## 仪表板端点

### 创建仪表板

```http
POST /dashboards
```

**请求参数**：
```json
{
  "name": "端口使用监控",
  "description": "实时端口使用情况监控仪表板",
  "widgets": [
    {
      "type": "chart",
      "metric": "port_usage",
      "title": "端口使用趋势",
      "config": {
        "chartType": "line",
        "timeRange": "24h"
      }
    }
  ],
  "layout": {
    "columns": 2,
    "rows": 2
  },
  "refreshInterval": 30000
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "dashboard-uuid",
    "name": "端口使用监控",
    "createdAt": "2025-09-27T10:00:00.000Z",
    "url": "/dashboards/dashboard-uuid"
  }
}
```

### 获取仪表板数据

```http
GET /dashboards/{dashboardId}/data
```

**查询参数**：
- `timeRange`: 时间范围（可选）
- `refresh`: 是否强制刷新（可选）

**响应示例**：
```json
{
  "success": true,
  "data": {
    "dashboardId": "dashboard-uuid",
    "timestamp": "2025-09-27T10:00:00.000Z",
    "widgets": [
      {
        "id": "widget-1",
        "type": "chart",
        "data": {
          "labels": ["09:00", "10:00", "11:00"],
          "values": [75, 82, 78]
        },
        "lastUpdated": "2025-09-27T10:00:00.000Z"
      }
    ]
  }
}
```

## 缓存和性能端点

### 获取缓存统计

```http
GET /cache/statistics
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "size": 850,
    "hitRate": 0.75,
    "missRate": 0.25,
    "evictions": 12,
    "totalRequests": 3400
  }
}
```

### 清理缓存

```http
DELETE /cache
```

**请求参数**：
```json
{
  "pattern": "analysis:*",
  "force": false
}
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "clearedEntries": 45,
    "message": "缓存清理完成"
  }
}
```

## 错误代码

| 错误代码 | HTTP状态码 | 描述 |
|---------|-----------|------|
| ANALYTICS_NOT_INITIALIZED | 503 | 分析系统未初始化 |
| ANALYTICS_NOT_RUNNING | 503 | 分析系统未运行 |
| INVALID_REQUEST | 400 | 请求参数无效 |
| UNAUTHORIZED | 401 | 未授权访问 |
| FORBIDDEN | 403 | 禁止访问 |
| NOT_FOUND | 404 | 资源不存在 |
| ANALYSIS_FAILED | 500 | 分析执行失败 |
| DATABASE_ERROR | 500 | 数据库错误 |
| CACHE_ERROR | 500 | 缓存操作错误 |
| INTERNAL_ERROR | 500 | 内部服务器错误 |

## 限流和配额

- **请求频率限制**: 每分钟最多100个请求
- **并发分析限制**: 最多10个并发分析任务
- **报告生成限制**: 每小时最多5个报告
- **数据查询限制**: 单次查询最多返回10000条记录

## 示例代码

### JavaScript/Node.js

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'http://localhost:3000/api/v1/analytics',
  headers: {
    'Authorization': 'Bearer your-token',
    'Content-Type': 'application/json'
  }
});

// 执行模式分析
async function performPatternAnalysis() {
  try {
    const response = await client.post('/analysis/pattern', {
      timeRange: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      }
    });
    console.log('分析结果:', response.data);
  } catch (error) {
    console.error('分析失败:', error.response.data);
  }
}
```

### Python

```python
import requests
import json
from datetime import datetime, timedelta

class AnalyticsClient:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def perform_pattern_analysis(self):
        url = f'{self.base_url}/analysis/pattern'
        data = {
            'timeRange': {
                'start': (datetime.now() - timedelta(days=1)).isoformat(),
                'end': datetime.now().isoformat()
            }
        }
        
        response = requests.post(url, headers=self.headers, json=data)
        return response.json()

# 使用示例
client = AnalyticsClient('http://localhost:3000/api/v1/analytics', 'your-token')
result = client.perform_pattern_analysis()
print(json.dumps(result, indent=2))
```

---

**文档版本**: v1.0  
**最后更新**: 2025年9月27日  
**维护者**: 高级分析系统开发团队
