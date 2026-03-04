/**
 * 智能分析API路由
 * Intelligent Analysis API Routes
 */

import { Router, Request, Response } from 'express';
import { IntelligentAnalysisEngine } from '../services/intelligentAnalysisEngine';
import { AlertNotificationSystem } from '../services/alertNotificationSystem';
import { AdvancedReportGenerator } from '../services/advancedReportGenerator';
import { EnhancedPortManager } from '../services/enhancedPortManager';
import { logger } from '../utils/logger';

const router = Router();

// 服务实例
let analysisEngine: IntelligentAnalysisEngine | null = null;
let alertSystem: AlertNotificationSystem | null = null;
let reportGenerator: AdvancedReportGenerator | null = null;

// 初始化智能分析服务
export function initIntelligentAnalysis(portManager: EnhancedPortManager): void {
  analysisEngine = new IntelligentAnalysisEngine(portManager);
  alertSystem = new AlertNotificationSystem(analysisEngine);
  reportGenerator = new AdvancedReportGenerator(portManager, analysisEngine, alertSystem);
  
  logger.info('Intelligent analysis services initialized');
}

function getAnalysisEngine(): IntelligentAnalysisEngine {
  if (!analysisEngine) {
    throw new Error('Analysis engine not initialized');
  }
  return analysisEngine;
}

function getAlertSystem(): AlertNotificationSystem {
  if (!alertSystem) {
    throw new Error('Alert system not initialized');
  }
  return alertSystem;
}

function getReportGenerator(): AdvancedReportGenerator {
  if (!reportGenerator) {
    throw new Error('Report generator not initialized');
  }
  return reportGenerator;
}

// ==================== 智能分析端点 ====================

/**
 * 获取端口使用预测
 */
router.get('/predictions/:port', async (req: Request, res: Response) => {
  try {
    const port = parseInt(req.params.port);
    const daysAhead = parseInt(req.query.days as string) || 7;
    
    if (isNaN(port) || port < 1 || port > 65535) {
      return res.status(400).json({
        success: false,
        error: 'Invalid port number'
      });
    }

    const engine = getAnalysisEngine();
    const prediction = await engine.predictPortUsage(port, daysAhead);

    res.json({
      success: true,
      data: prediction
    });
  } catch (error) {
    logger.error('Failed to get port prediction', { error, port: req.params.port });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get port prediction'
    });
  }
});

/**
 * 检测所有异常
 */
router.get('/anomalies', async (req: Request, res: Response) => {
  try {
    const engine = getAnalysisEngine();
    const anomalies = await engine.detectAnomalies();

    res.json({
      success: true,
      data: anomalies
    });
  } catch (error) {
    logger.error('Failed to detect anomalies', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to detect anomalies'
    });
  }
});

/**
 * 诊断性能瓶颈
 */
router.get('/bottlenecks', async (req: Request, res: Response) => {
  try {
    const engine = getAnalysisEngine();
    const bottlenecks = await engine.diagnosePerformanceBottlenecks();

    res.json({
      success: true,
      data: bottlenecks
    });
  } catch (error) {
    logger.error('Failed to diagnose bottlenecks', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to diagnose bottlenecks'
    });
  }
});

/**
 * 生成智能优化计划
 */
router.get('/optimization-plan', async (req: Request, res: Response) => {
  try {
    const engine = getAnalysisEngine();
    const optimizationPlan = await engine.generateOptimizationPlan();

    res.json({
      success: true,
      data: optimizationPlan
    });
  } catch (error) {
    logger.error('Failed to generate optimization plan', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate optimization plan'
    });
  }
});

// ==================== 告警系统端点 ====================

/**
 * 获取所有告警规则
 */
router.get('/alerts/rules', async (req: Request, res: Response) => {
  try {
    const alertSys = getAlertSystem();
    const rules = alertSys.getAlertRules();

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    logger.error('Failed to get alert rules', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get alert rules'
    });
  }
});

/**
 * 创建告警规则
 */
router.post('/alerts/rules', async (req: Request, res: Response) => {
  try {
    const alertSys = getAlertSystem();
    const rule = alertSys.createAlertRule(req.body);

    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    logger.error('Failed to create alert rule', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create alert rule'
    });
  }
});

/**
 * 更新告警规则
 */
router.put('/alerts/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const alertSys = getAlertSystem();
    const rule = alertSys.updateAlertRule(ruleId, req.body);

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Alert rule not found'
      });
    }

    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    logger.error('Failed to update alert rule', { error, ruleId: req.params.ruleId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update alert rule'
    });
  }
});

/**
 * 删除告警规则
 */
router.delete('/alerts/rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const { ruleId } = req.params;
    const alertSys = getAlertSystem();
    const deleted = alertSys.deleteAlertRule(ruleId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Alert rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert rule deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete alert rule', { error, ruleId: req.params.ruleId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete alert rule'
    });
  }
});

/**
 * 获取活跃告警
 */
router.get('/alerts/active', async (req: Request, res: Response) => {
  try {
    const alertSys = getAlertSystem();
    const alerts = alertSys.getActiveAlerts();

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    logger.error('Failed to get active alerts', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get active alerts'
    });
  }
});

/**
 * 确认告警
 */
router.post('/alerts/:alertId/acknowledge', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const alertSys = getAlertSystem();
    const acknowledged = alertSys.acknowledgeAlert(alertId);

    if (!acknowledged) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert acknowledged successfully'
    });
  } catch (error) {
    logger.error('Failed to acknowledge alert', { error, alertId: req.params.alertId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to acknowledge alert'
    });
  }
});

/**
 * 解决告警
 */
router.post('/alerts/:alertId/resolve', async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const alertSys = getAlertSystem();
    const resolved = alertSys.resolveAlert(alertId);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    logger.error('Failed to resolve alert', { error, alertId: req.params.alertId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resolve alert'
    });
  }
});

/**
 * 获取告警统计
 */
router.get('/alerts/statistics', async (req: Request, res: Response) => {
  try {
    const alertSys = getAlertSystem();
    const statistics = alertSys.getAlertStatistics();

    res.json({
      success: true,
      data: statistics
    });
  } catch (error) {
    logger.error('Failed to get alert statistics', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get alert statistics'
    });
  }
});

/**
 * 发送测试通知
 */
router.post('/alerts/test-notification', async (req: Request, res: Response) => {
  try {
    const { type, recipient } = req.body;
    
    if (!type || !recipient) {
      return res.status(400).json({
        success: false,
        error: 'Type and recipient are required'
      });
    }

    const alertSys = getAlertSystem();
    const sent = await alertSys.sendTestNotification(type, recipient);

    res.json({
      success: sent,
      message: sent ? 'Test notification sent successfully' : 'Failed to send test notification'
    });
  } catch (error) {
    logger.error('Failed to send test notification', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send test notification'
    });
  }
});

// ==================== 高级报告端点 ====================

/**
 * 获取报告模板
 */
router.get('/reports/templates', async (req: Request, res: Response) => {
  try {
    const generator = getReportGenerator();
    const templates = generator.getTemplates();

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error('Failed to get report templates', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get report templates'
    });
  }
});

/**
 * 生成报告
 */
router.post('/reports/generate', async (req: Request, res: Response) => {
  try {
    const generator = getReportGenerator();
    const report = await generator.generateReport(req.body);

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Failed to generate report', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate report'
    });
  }
});

/**
 * 获取生成的报告列表
 */
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const generator = getReportGenerator();
    const reports = generator.getGeneratedReports();

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    logger.error('Failed to get generated reports', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get generated reports'
    });
  }
});

/**
 * 下载报告
 */
router.get('/reports/:reportId/download', async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const generator = getReportGenerator();
    const downloadInfo = await generator.downloadReport(reportId);

    if (!downloadInfo) {
      return res.status(404).json({
        success: false,
        error: 'Report not found or not ready'
      });
    }

    // 模拟文件下载
    res.json({
      success: true,
      data: {
        message: 'Report download ready (simulated)',
        filePath: downloadInfo.filePath,
        contentType: downloadInfo.contentType
      }
    });
  } catch (error) {
    logger.error('Failed to download report', { error, reportId: req.params.reportId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download report'
    });
  }
});

/**
 * 配置定时报告
 */
router.post('/reports/schedule', async (req: Request, res: Response) => {
  try {
    const generator = getReportGenerator();
    const scheduleId = generator.scheduleReport(req.body);

    res.json({
      success: true,
      data: { scheduleId }
    });
  } catch (error) {
    logger.error('Failed to schedule report', { error, body: req.body });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to schedule report'
    });
  }
});

export default router;
