/**
 * 智能分析引擎
 * Intelligent Analysis Engine
 */

import { logger } from '../utils/logger';
import { EnhancedPortManager } from './enhancedPortManager';

export interface PredictionResult {
  port: number;
  predictedUsage: number;
  confidence: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface AnomalyDetection {
  id: string;
  port: number;
  anomalyType: 'usage_spike' | 'response_time' | 'error_rate' | 'memory_leak' | 'connection_flood';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  metrics: {
    currentValue: number;
    expectedValue: number;
    deviation: number;
  };
  recommendations: string[];
}

export interface PerformanceBottleneck {
  id: string;
  port: number;
  bottleneckType: 'cpu' | 'memory' | 'network' | 'database' | 'disk_io';
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  description: string;
  impact: string;
  affectedMetrics: string[];
  optimizationSuggestions: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    estimatedImpact: string;
    implementation: string;
  }>;
}

export class IntelligentAnalysisEngine {
  private portManager: EnhancedPortManager;
  private analysisHistory: Map<number, Array<any>> = new Map();

  constructor(portManager: EnhancedPortManager) {
    this.portManager = portManager;
  }

  /**
   * 端口使用预测算法
   */
  async predictPortUsage(port: number, daysAhead: number = 7): Promise<PredictionResult> {
    try {
      // 获取历史数据
      const historicalData = this.getPortHistoricalData(port);
      
      // 简单的线性回归预测（在生产环境中应使用更复杂的ML算法）
      const prediction = this.performLinearRegression(historicalData, daysAhead);
      
      // 计算置信度
      const confidence = this.calculateConfidence(historicalData, prediction);
      
      // 确定趋势
      const trend = this.determineTrend(historicalData);
      
      // 评估风险等级
      const riskLevel = this.assessRiskLevel(prediction.predictedUsage, trend);
      
      // 生成建议
      const recommendations = this.generatePredictionRecommendations(prediction, riskLevel, trend);

      return {
        port,
        predictedUsage: Math.round(prediction.predictedUsage),
        confidence: Math.round(confidence * 100),
        trend,
        riskLevel,
        recommendations
      };
    } catch (error) {
      logger.error(`Failed to predict usage for port ${port}`, { error });
      return {
        port,
        predictedUsage: 50,
        confidence: 0,
        trend: 'stable',
        riskLevel: 'low',
        recommendations: ['无法生成预测，建议检查历史数据']
      };
    }
  }

  /**
   * 异常检测算法
   */
  async detectAnomalies(): Promise<AnomalyDetection[]> {
    try {
      const anomalies: AnomalyDetection[] = [];
      const allocations = this.portManager.getAllPortAllocations();

      for (const allocation of allocations) {
        const portAnomalies = await this.detectPortAnomalies(allocation.port);
        anomalies.push(...portAnomalies);
      }

      return anomalies;
    } catch (error) {
      logger.error('Failed to detect anomalies', { error });
      return [];
    }
  }

  /**
   * 性能瓶颈诊断
   */
  async diagnosePerformanceBottlenecks(): Promise<PerformanceBottleneck[]> {
    try {
      const bottlenecks: PerformanceBottleneck[] = [];
      const allocations = this.portManager.getAllPortAllocations();

      for (const allocation of allocations) {
        // getPortUsageInfo 方法不存在，使用空对象作为默认值
        const usageInfo = {};
        const portBottlenecks = this.analyzePerformanceBottlenecks(allocation, usageInfo);
        bottlenecks.push(...portBottlenecks);
      }

      return bottlenecks;
    } catch (error) {
      logger.error('Failed to diagnose performance bottlenecks', { error });
      return [];
    }
  }

  /**
   * 智能优化建议生成
   */
  async generateOptimizationPlan(): Promise<{
    summary: string;
    criticalIssues: number;
    optimizations: Array<{
      category: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      title: string;
      description: string;
      estimatedImpact: string;
      implementationSteps: string[];
    }>;
  }> {
    try {
      const [predictions, anomalies, bottlenecks] = await Promise.all([
        this.getPredictionsForAllPorts(),
        this.detectAnomalies(),
        this.diagnosePerformanceBottlenecks()
      ]);

      const criticalIssues = anomalies.filter(a => a.severity === 'critical').length +
                           bottlenecks.filter(b => b.severity === 'critical').length;

      const optimizations = [
        ...this.generatePredictionOptimizations(predictions),
        ...this.generateAnomalyOptimizations(anomalies),
        ...this.generateBottleneckOptimizations(bottlenecks)
      ].sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority));

      return {
        summary: this.generateOptimizationSummary(criticalIssues, optimizations.length),
        criticalIssues,
        optimizations: optimizations.slice(0, 10) // 限制为前10个建议
      };
    } catch (error) {
      logger.error('Failed to generate optimization plan', { error });
      return {
        summary: '优化计划生成失败',
        criticalIssues: 0,
        optimizations: []
      };
    }
  }

  // 私有方法实现

  private getPortHistoricalData(port: number): Array<{ timestamp: Date; usage: number }> {
    // 在实际环境中，这里应该从数据库获取历史数据
    // 这里生成模拟的历史数据用于演示
    const data = [];
    const now = new Date();
    
    for (let i = 30; i > 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // 生成带有趋势的模拟数据
      const baseUsage = 40 + Math.sin(i * 0.1) * 20; // 基础使用率 + 周期性变化
      const noise = (Math.random() - 0.5) * 10; // 随机噪声
      const trend = (30 - i) * 0.5; // 上升趋势
      
      data.push({
        timestamp: date,
        usage: Math.max(0, Math.min(100, baseUsage + noise + trend))
      });
    }
    
    return data;
  }

  private performLinearRegression(data: Array<{ timestamp: Date; usage: number }>, daysAhead: number): { predictedUsage: number } {
    if (data.length < 2) {
      return { predictedUsage: 50 }; // 默认值
    }

    // 简单的线性回归
    const n = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    data.forEach((point, index) => {
      const x = index;
      const y = point.usage;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 预测未来值
    const futureX = n + daysAhead;
    const predictedUsage = slope * futureX + intercept;

    return { predictedUsage: Math.max(0, Math.min(100, predictedUsage)) };
  }

  private calculateConfidence(data: Array<any>, prediction: any): number {
    // 简化的置信度计算
    if (data.length < 3) return 0.5;
    
    const recentTrend = data.slice(-7); // 最近7天的数据
    const variance = this.calculateVariance(recentTrend.map(d => d.usage));
    
    // 方差越小，置信度越高
    return Math.max(0.1, Math.min(0.95, 1 - variance / 1000));
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    return squaredDifferences.reduce((a, b) => a + b, 0) / values.length;
  }

  private determineTrend(data: Array<{ usage: number }>): 'increasing' | 'decreasing' | 'stable' {
    if (data.length < 3) return 'stable';
    
    const recent = data.slice(-5); // 最近5个数据点
    const early = data.slice(0, 5); // 早期5个数据点
    
    const recentAvg = recent.reduce((sum, d) => sum + d.usage, 0) / recent.length;
    const earlyAvg = early.reduce((sum, d) => sum + d.usage, 0) / early.length;
    
    const difference = recentAvg - earlyAvg;
    
    if (difference > 5) return 'increasing';
    if (difference < -5) return 'decreasing';
    return 'stable';
  }

  private assessRiskLevel(predictedUsage: number, trend: string): 'low' | 'medium' | 'high' | 'critical' {
    if (predictedUsage > 90) return 'critical';
    if (predictedUsage > 80) return 'high';
    if (predictedUsage > 60 && trend === 'increasing') return 'medium';
    return 'low';
  }

  private generatePredictionRecommendations(prediction: any, riskLevel: string, trend: string): string[] {
    const recommendations = [];
    
    if (riskLevel === 'critical') {
      recommendations.push('立即采取行动：端口使用率预计将达到危险水平');
      recommendations.push('考虑负载均衡或端口迁移');
    } else if (riskLevel === 'high') {
      recommendations.push('密切监控端口使用情况');
      recommendations.push('准备扩容计划');
    }
    
    if (trend === 'increasing') {
      recommendations.push('使用率呈上升趋势，建议优化资源配置');
    }
    
    return recommendations.length > 0 ? recommendations : ['当前状态良好，继续监控'];
  }

  private async detectPortAnomalies(port: number): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];
    // getPortUsageInfo 方法不存在，使用默认值
    const usageInfo = { usage: 0, responseTime: 0, errorRate: 0 };
    
    // 检测使用率异常
    if (usageInfo.usage > 95) {
      anomalies.push({
        id: `usage_spike_${port}_${Date.now()}`,
        port,
        anomalyType: 'usage_spike',
        severity: 'critical',
        description: `端口 ${port} 使用率异常高 (${usageInfo.usage}%)`,
        detectedAt: new Date(),
        metrics: {
          currentValue: usageInfo.usage,
          expectedValue: 60,
          deviation: usageInfo.usage - 60
        },
        recommendations: [
          '立即检查端口负载',
          '考虑负载均衡',
          '检查是否有异常连接'
        ]
      });
    }
    
    return anomalies;
  }

  private analyzePerformanceBottlenecks(allocation: any, usageInfo: any): PerformanceBottleneck[] {
    const bottlenecks: PerformanceBottleneck[] = [];
    
    // 分析内存瓶颈
    if (usageInfo.usage > 80) {
      bottlenecks.push({
        id: `memory_${allocation.port}_${Date.now()}`,
        port: allocation.port,
        bottleneckType: 'memory',
        severity: usageInfo.usage > 90 ? 'critical' : 'moderate',
        description: `端口 ${allocation.port} 内存使用率过高`,
        impact: '可能导致响应时间延长和服务不稳定',
        affectedMetrics: ['response_time', 'throughput', 'error_rate'],
        optimizationSuggestions: [
          {
            action: '优化内存使用',
            priority: 'high',
            estimatedImpact: '提升30%性能',
            implementation: '清理无用对象，优化缓存策略'
          },
          {
            action: '增加内存限制',
            priority: 'medium',
            estimatedImpact: '提升20%稳定性',
            implementation: '调整应用配置，增加堆内存大小'
          }
        ]
      });
    }
    
    return bottlenecks;
  }

  private async getPredictionsForAllPorts(): Promise<PredictionResult[]> {
    const allocations = this.portManager.getAllPortAllocations();
    const predictions = [];
    
    for (const allocation of allocations) {
      const prediction = await this.predictPortUsage(allocation.port);
      predictions.push(prediction);
    }
    
    return predictions;
  }

  private generatePredictionOptimizations(predictions: PredictionResult[]) {
    return predictions
      .filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical')
      .map(p => ({
        category: '预测性维护',
        priority: p.riskLevel === 'critical' ? 'urgent' as const : 'high' as const,
        title: `端口 ${p.port} 使用率预警`,
        description: `预测 ${p.port} 端口使用率将达到 ${p.predictedUsage}%`,
        estimatedImpact: '防止服务中断，提升系统稳定性',
        implementationSteps: p.recommendations
      }));
  }

  private generateAnomalyOptimizations(anomalies: AnomalyDetection[]) {
    return anomalies.map(a => ({
      category: '异常处理',
      priority: a.severity === 'critical' ? 'urgent' as const : 'high' as const,
      title: `端口 ${a.port} 异常检测`,
      description: a.description,
      estimatedImpact: '恢复正常性能，防止服务degradation',
      implementationSteps: a.recommendations
    }));
  }

  private generateBottleneckOptimizations(bottlenecks: PerformanceBottleneck[]) {
    return bottlenecks.map(b => ({
      category: '性能优化',
      priority: b.severity === 'critical' ? 'urgent' as const : 'medium' as const,
      title: `端口 ${b.port} 性能瓶颈`,
      description: b.description,
      estimatedImpact: b.optimizationSuggestions[0]?.estimatedImpact || '提升系统性能',
      implementationSteps: b.optimizationSuggestions.map(s => s.action)
    }));
  }

  private getPriorityWeight(priority: string): number {
    const weights = { urgent: 4, high: 3, medium: 2, low: 1 };
    return weights[priority as keyof typeof weights] || 1;
  }

  private generateOptimizationSummary(criticalIssues: number, totalOptimizations: number): string {
    if (criticalIssues > 0) {
      return `检测到 ${criticalIssues} 个严重问题，需要立即处理。共生成 ${totalOptimizations} 项优化建议。`;
    } else if (totalOptimizations > 0) {
      return `系统运行正常，但发现 ${totalOptimizations} 项可优化的地方。`;
    } else {
      return '系统运行状态良好，暂无需要优化的项目。';
    }
  }
}
