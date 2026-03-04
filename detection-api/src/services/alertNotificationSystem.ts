/**
 * 告警和通知系统
 * Alert and Notification System
 */

import { logger } from '../utils/logger';
import { IntelligentAnalysisEngine, AnomalyDetection, PerformanceBottleneck } from './intelligentAnalysisEngine';

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: {
    metric: 'usage' | 'response_time' | 'error_rate' | 'cpu' | 'memory';
    operator: '>' | '<' | '=' | '>=' | '<=';
    threshold: number;
    duration: number; // 持续时间(分钟)
  };
  severity: 'low' | 'medium' | 'high' | 'critical';
  notifications: {
    email: boolean;
    webhook: boolean;
    sms: boolean;
  };
  recipients: string[];
  createdAt: Date;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  port: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  triggeredAt: Date;
  resolvedAt?: Date;
  status: 'active' | 'acknowledged' | 'resolved';
  metadata: Record<string, any>;
}

export interface NotificationChannel {
  type: 'email' | 'webhook' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

export class AlertNotificationSystem {
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private analysisEngine: IntelligentAnalysisEngine;

  constructor(analysisEngine: IntelligentAnalysisEngine) {
    this.analysisEngine = analysisEngine;
    this.initializeDefaultRules();
    this.initializeNotificationChannels();
    this.startMonitoring();
  }

  /**
   * 创建告警规则
   */
  createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'triggerCount'>): AlertRule {
    const alertRule: AlertRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      triggerCount: 0,
      ...rule
    };

    this.alertRules.set(alertRule.id, alertRule);
    logger.info(`Alert rule created: ${alertRule.name}`, { ruleId: alertRule.id });
    
    return alertRule;
  }

  /**
   * 更新告警规则
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = this.alertRules.get(ruleId);
    if (!rule) {
      logger.warn(`Alert rule not found: ${ruleId}`);
      return null;
    }

    const updatedRule = { ...rule, ...updates };
    this.alertRules.set(ruleId, updatedRule);
    logger.info(`Alert rule updated: ${updatedRule.name}`, { ruleId });
    
    return updatedRule;
  }

  /**
   * 删除告警规则
   */
  deleteAlertRule(ruleId: string): boolean {
    const deleted = this.alertRules.delete(ruleId);
    if (deleted) {
      logger.info(`Alert rule deleted`, { ruleId });
    }
    return deleted;
  }

  /**
   * 获取所有告警规则
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'active')
      .sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'acknowledged';
    logger.info(`Alert acknowledged`, { alertId, port: alert.port });
    return true;
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    logger.info(`Alert resolved`, { alertId, port: alert.port });
    return true;
  }

  /**
   * 配置通知渠道
   */
  configureNotificationChannel(type: 'email' | 'webhook' | 'sms', config: Record<string, any>): void {
    this.notificationChannels.set(type, {
      type,
      config,
      enabled: true
    });
    logger.info(`Notification channel configured: ${type}`);
  }

  /**
   * 发送测试通知
   */
  async sendTestNotification(type: 'email' | 'webhook' | 'sms', recipient: string): Promise<boolean> {
    try {
      const testAlert: Alert = {
        id: 'test_alert',
        ruleId: 'test_rule',
        port: 3000,
        severity: 'low',
        title: '测试告警',
        message: '这是一个测试告警消息',
        triggeredAt: new Date(),
        status: 'active',
        metadata: { test: true }
      };

      await this.sendNotification(testAlert, type, [recipient]);
      return true;
    } catch (error) {
      logger.error(`Failed to send test notification`, { type, recipient, error });
      return false;
    }
  }

  /**
   * 获取告警统计
   */
  getAlertStatistics(): {
    total: number;
    active: number;
    acknowledged: number;
    resolved: number;
    bySeverity: Record<string, number>;
    last24Hours: number;
  } {
    const alerts = Array.from(this.activeAlerts.values());
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      total: alerts.length,
      active: alerts.filter(a => a.status === 'active').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      resolved: alerts.filter(a => a.status === 'resolved').length,
      bySeverity: {
        low: alerts.filter(a => a.severity === 'low').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        high: alerts.filter(a => a.severity === 'high').length,
        critical: alerts.filter(a => a.severity === 'critical').length
      },
      last24Hours: alerts.filter(a => a.triggeredAt >= last24Hours).length
    };
  }

  // 私有方法

  private initializeDefaultRules(): void {
    // 高CPU使用率告警
    this.createAlertRule({
      name: '高CPU使用率告警',
      enabled: true,
      conditions: {
        metric: 'cpu',
        operator: '>',
        threshold: 80,
        duration: 5
      },
      severity: 'medium',
      notifications: {
        email: true,
        webhook: false,
        sms: false
      },
      recipients: ['admin@system.local']
    });

    // 端口使用率过高告警
    this.createAlertRule({
      name: '端口使用率过高',
      enabled: true,
      conditions: {
        metric: 'usage',
        operator: '>',
        threshold: 90,
        duration: 3
      },
      severity: 'high',
      notifications: {
        email: true,
        webhook: true,
        sms: false
      },
      recipients: ['admin@system.local']
    });

    // 响应时间异常告警
    this.createAlertRule({
      name: '响应时间异常',
      enabled: true,
      conditions: {
        metric: 'response_time',
        operator: '>',
        threshold: 1000,
        duration: 2
      },
      severity: 'critical',
      notifications: {
        email: true,
        webhook: true,
        sms: true
      },
      recipients: ['admin@system.local', 'ops@system.local']
    });

    logger.info(`Initialized ${this.alertRules.size} default alert rules`);
  }

  private initializeNotificationChannels(): void {
    // 邮件通知配置
    this.configureNotificationChannel('email', {
      smtp: {
        host: 'localhost',
        port: 587,
        secure: false,
        auth: {
          user: 'noreply@system.local',
          pass: 'password'
        }
      },
      from: 'Port Monitor <noreply@system.local>',
      template: 'default'
    });

    // Webhook通知配置
    this.configureNotificationChannel('webhook', {
      url: 'http://localhost:3000/api/webhooks/alerts',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token'
      },
      retries: 3
    });

    // SMS通知配置（模拟）
    this.configureNotificationChannel('sms', {
      provider: 'twilio',
      accountSid: 'demo',
      authToken: 'demo',
      fromNumber: '+1234567890'
    });
  }

  private startMonitoring(): void {
    // 每30秒检查一次告警条件
    setInterval(async () => {
      await this.checkAlertConditions();
    }, 30000);

    // 每5分钟检查异常和瓶颈
    setInterval(async () => {
      await this.checkAnomaliesAndBottlenecks();
    }, 5 * 60 * 1000);

    logger.info('Alert monitoring started');
  }

  private async checkAlertConditions(): Promise<void> {
    try {
      // 这里应该检查每个告警规则的条件
      // 由于我们是演示，这里只是记录监控状态
      logger.debug('Checking alert conditions...');
    } catch (error) {
      logger.error('Failed to check alert conditions', { error });
    }
  }

  private async checkAnomaliesAndBottlenecks(): Promise<void> {
    try {
      // 检查异常
      const anomalies = await this.analysisEngine.detectAnomalies();
      for (const anomaly of anomalies) {
        await this.createAlertFromAnomaly(anomaly);
      }

      // 检查性能瓶颈
      const bottlenecks = await this.analysisEngine.diagnosePerformanceBottlenecks();
      for (const bottleneck of bottlenecks) {
        await this.createAlertFromBottleneck(bottleneck);
      }
    } catch (error) {
      logger.error('Failed to check anomalies and bottlenecks', { error });
    }
  }

  private async createAlertFromAnomaly(anomaly: AnomalyDetection): Promise<void> {
    // 检查是否已存在相同的告警
    const existingAlert = Array.from(this.activeAlerts.values())
      .find(alert => 
        alert.port === anomaly.port && 
        alert.status === 'active' &&
        alert.metadata.anomalyType === anomaly.anomalyType
      );

    if (existingAlert) return; // 避免重复告警

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: 'anomaly_detection',
      port: anomaly.port,
      severity: anomaly.severity,
      title: `异常检测: ${anomaly.description}`,
      message: `在端口 ${anomaly.port} 检测到 ${anomaly.anomalyType} 类型异常`,
      triggeredAt: new Date(),
      status: 'active',
      metadata: {
        anomalyType: anomaly.anomalyType,
        anomalyId: anomaly.id,
        currentValue: anomaly.metrics.currentValue,
        expectedValue: anomaly.metrics.expectedValue
      }
    };

    this.activeAlerts.set(alert.id, alert);
    await this.sendNotificationForAlert(alert);
    
    logger.warn(`Anomaly alert created`, { 
      alertId: alert.id, 
      port: anomaly.port, 
      type: anomaly.anomalyType 
    });
  }

  private async createAlertFromBottleneck(bottleneck: PerformanceBottleneck): Promise<void> {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: 'performance_bottleneck',
      port: bottleneck.port,
      severity: bottleneck.severity === 'critical' ? 'critical' : 'medium',
      title: `性能瓶颈: ${bottleneck.description}`,
      message: `端口 ${bottleneck.port} 检测到 ${bottleneck.bottleneckType} 性能瓶颈`,
      triggeredAt: new Date(),
      status: 'active',
      metadata: {
        bottleneckType: bottleneck.bottleneckType,
        bottleneckId: bottleneck.id,
        impact: bottleneck.impact
      }
    };

    this.activeAlerts.set(alert.id, alert);
    await this.sendNotificationForAlert(alert);
    
    logger.warn(`Bottleneck alert created`, { 
      alertId: alert.id, 
      port: bottleneck.port, 
      type: bottleneck.bottleneckType 
    });
  }

  private async sendNotificationForAlert(alert: Alert): Promise<void> {
    // 找到匹配的告警规则
    const rule = this.alertRules.get(alert.ruleId);
    if (!rule || !rule.enabled) return;

    const notifications = [];

    if (rule.notifications.email) {
      notifications.push(this.sendNotification(alert, 'email', rule.recipients));
    }

    if (rule.notifications.webhook) {
      notifications.push(this.sendNotification(alert, 'webhook', rule.recipients));
    }

    if (rule.notifications.sms) {
      notifications.push(this.sendNotification(alert, 'sms', rule.recipients));
    }

    await Promise.all(notifications);
  }

  private async sendNotification(alert: Alert, type: 'email' | 'webhook' | 'sms', recipients: string[]): Promise<void> {
    const channel = this.notificationChannels.get(type);
    if (!channel || !channel.enabled) return;

    try {
      switch (type) {
        case 'email':
          await this.sendEmailNotification(alert, recipients, channel.config);
          break;
        case 'webhook':
          await this.sendWebhookNotification(alert, channel.config);
          break;
        case 'sms':
          await this.sendSMSNotification(alert, recipients, channel.config);
          break;
      }
      
      logger.info(`Notification sent`, { type, alertId: alert.id, recipients: recipients.length });
    } catch (error) {
      logger.error(`Failed to send ${type} notification`, { alertId: alert.id, error });
    }
  }

  private async sendEmailNotification(alert: Alert, recipients: string[], config: any): Promise<void> {
    // 模拟邮件发送
    logger.info('Email notification sent (simulated)', {
      to: recipients,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      alert: alert.id
    });
  }

  private async sendWebhookNotification(alert: Alert, config: any): Promise<void> {
    // 模拟Webhook发送
    logger.info('Webhook notification sent (simulated)', {
      url: config.url,
      payload: {
        alert_id: alert.id,
        port: alert.port,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        triggered_at: alert.triggeredAt
      }
    });
  }

  private async sendSMSNotification(alert: Alert, recipients: string[], config: any): Promise<void> {
    // 模拟SMS发送
    logger.info('SMS notification sent (simulated)', {
      to: recipients,
      message: `[${alert.severity}] Port ${alert.port}: ${alert.title}`,
      alert: alert.id
    });
  }
}
