/**
 * 高级报告生成器
 * Advanced Report Generator
 */

import { logger } from '../utils/logger';
import { EnhancedPortManager } from './enhancedPortManager';
import { IntelligentAnalysisEngine } from './intelligentAnalysisEngine';
import { AlertNotificationSystem } from './alertNotificationSystem';

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  sections: Array<{
    id: string;
    title: string;
    type: 'overview' | 'charts' | 'tables' | 'analysis' | 'recommendations';
    config: Record<string, any>;
  }>;
  styling: {
    theme: 'professional' | 'modern' | 'minimal';
    colors: string[];
    fonts: string[];
  };
  createdAt: Date;
}

export interface ReportConfig {
  templateId: string;
  timeRange: '7d' | '30d' | '90d' | 'custom';
  customStartDate?: Date;
  customEndDate?: Date;
  includeSections: string[];
  format: 'pdf' | 'html' | 'excel';
  recipients?: string[];
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
}

export interface GeneratedReport {
  id: string;
  templateId: string;
  config: ReportConfig;
  generatedAt: Date;
  fileSize: number;
  filePath: string;
  status: 'generating' | 'completed' | 'failed';
  error?: string;
}

export class AdvancedReportGenerator {
  private portManager: EnhancedPortManager;
  private analysisEngine: IntelligentAnalysisEngine;
  private alertSystem: AlertNotificationSystem;
  private templates: Map<string, ReportTemplate> = new Map();
  private generatedReports: Map<string, GeneratedReport> = new Map();

  constructor(
    portManager: EnhancedPortManager,
    analysisEngine: IntelligentAnalysisEngine,
    alertSystem: AlertNotificationSystem
  ) {
    this.portManager = portManager;
    this.analysisEngine = analysisEngine;
    this.alertSystem = alertSystem;
    this.initializeDefaultTemplates();
  }

  /**
   * 创建报告模板
   */
  createTemplate(template: Omit<ReportTemplate, 'id' | 'createdAt'>): ReportTemplate {
    const reportTemplate: ReportTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      ...template
    };

    this.templates.set(reportTemplate.id, reportTemplate);
    logger.info(`Report template created: ${reportTemplate.name}`, { templateId: reportTemplate.id });
    
    return reportTemplate;
  }

  /**
   * 获取所有模板
   */
  getTemplates(): ReportTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 生成报告
   */
  async generateReport(config: ReportConfig): Promise<GeneratedReport> {
    const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const report: GeneratedReport = {
      id: reportId,
      templateId: config.templateId,
      config,
      generatedAt: new Date(),
      fileSize: 0,
      filePath: '',
      status: 'generating'
    };

    this.generatedReports.set(reportId, report);

    try {
      logger.info(`Starting report generation`, { reportId, templateId: config.templateId });

      // 获取模板
      const template = this.templates.get(config.templateId);
      if (!template) {
        throw new Error(`Template not found: ${config.templateId}`);
      }

      // 收集数据
      const reportData = await this.collectReportData(config);

      // 生成报告内容
      const content = await this.generateReportContent(template, reportData, config);

      // 根据格式生成文件
      let filePath: string;
      switch (config.format) {
        case 'pdf':
          filePath = await this.generatePDFReport(content, reportId);
          break;
        case 'html':
          filePath = await this.generateHTMLReport(content, reportId);
          break;
        case 'excel':
          filePath = await this.generateExcelReport(reportData, reportId);
          break;
        default:
          throw new Error(`Unsupported format: ${config.format}`);
      }

      // 更新报告状态
      report.status = 'completed';
      report.filePath = filePath;
      report.fileSize = await this.getFileSize(filePath);

      logger.info(`Report generation completed`, { reportId, filePath });

      // 如果配置了收件人，发送报告
      if (config.recipients && config.recipients.length > 0) {
        await this.sendReportToRecipients(report, config.recipients);
      }

      return report;
    } catch (error) {
      report.status = 'failed';
      report.error = error.message;
      logger.error(`Report generation failed`, { reportId, error });
      return report;
    }
  }

  /**
   * 获取生成的报告列表
   */
  getGeneratedReports(): GeneratedReport[] {
    return Array.from(this.generatedReports.values())
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }

  /**
   * 下载报告文件
   */
  async downloadReport(reportId: string): Promise<{ filePath: string; contentType: string } | null> {
    const report = this.generatedReports.get(reportId);
    if (!report || report.status !== 'completed') {
      return null;
    }

    const contentTypes = {
      pdf: 'application/pdf',
      html: 'text/html',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return {
      filePath: report.filePath,
      contentType: contentTypes[report.config.format] || 'application/octet-stream'
    };
  }

  /**
   * 配置定时报告
   */
  scheduleReport(config: ReportConfig): string {
    if (!config.schedule?.enabled) {
      throw new Error('Schedule configuration is required');
    }

    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 这里应该使用 cron 或类似的调度器
    logger.info(`Scheduled report configured`, { 
      scheduleId, 
      frequency: config.schedule.frequency,
      templateId: config.templateId 
    });

    return scheduleId;
  }

  // 私有方法

  private initializeDefaultTemplates(): void {
    // 执行摘要模板
    this.createTemplate({
      name: '执行摘要报告',
      description: '面向管理层的高级摘要报告',
      sections: [
        {
          id: 'executive_summary',
          title: '执行摘要',
          type: 'overview',
          config: { includeKPIs: true, includeTrends: true }
        },
        {
          id: 'key_metrics',
          title: '关键指标',
          type: 'charts',
          config: { chartTypes: ['overview', 'trends'] }
        },
        {
          id: 'recommendations',
          title: '战略建议',
          type: 'recommendations',
          config: { priorityLevel: 'high' }
        }
      ],
      styling: {
        theme: 'professional',
        colors: ['#2c3e50', '#3498db', '#e74c3c', '#f39c12'],
        fonts: ['Arial', 'Helvetica']
      }
    });

    // 技术详细报告模板
    this.createTemplate({
      name: '技术详细报告',
      description: '面向技术团队的详细分析报告',
      sections: [
        {
          id: 'system_overview',
          title: '系统概览',
          type: 'overview',
          config: { detailed: true }
        },
        {
          id: 'performance_analysis',
          title: '性能分析',
          type: 'analysis',
          config: { includeBottlenecks: true, includeAnomalies: true }
        },
        {
          id: 'port_details',
          title: '端口详情',
          type: 'tables',
          config: { includeMetrics: true, includeRecommendations: true }
        },
        {
          id: 'trends_charts',
          title: '趋势图表',
          type: 'charts',
          config: { chartTypes: ['usage', 'performance', 'distribution'] }
        },
        {
          id: 'technical_recommendations',
          title: '技术建议',
          type: 'recommendations',
          config: { priorityLevel: 'all', includeImplementation: true }
        }
      ],
      styling: {
        theme: 'modern',
        colors: ['#1e3d59', '#17a2b8', '#28a745', '#ffc107', '#dc3545'],
        fonts: ['Roboto', 'Open Sans']
      }
    });

    // 安全审计报告模板
    this.createTemplate({
      name: '安全审计报告',
      description: '专注于安全方面的审计报告',
      sections: [
        {
          id: 'security_overview',
          title: '安全概览',
          type: 'overview',
          config: { focusArea: 'security' }
        },
        {
          id: 'vulnerability_analysis',
          title: '漏洞分析',
          type: 'analysis',
          config: { includeVulnerabilities: true, includeExposures: true }
        },
        {
          id: 'security_recommendations',
          title: '安全建议',
          type: 'recommendations',
          config: { priorityLevel: 'security', includeCompliance: true }
        }
      ],
      styling: {
        theme: 'minimal',
        colors: ['#6c757d', '#007bff', '#28a745', '#ffc107', '#dc3545'],
        fonts: ['Source Sans Pro', 'Lato']
      }
    });

    logger.info(`Initialized ${this.templates.size} default report templates`);
  }

  private async collectReportData(config: ReportConfig): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    try {
      // 收集基础端口数据
      data.statistics = this.portManager.getEnhancedPortStatistics();
      data.allocations = this.portManager.getAllPortAllocations();
      
      // 收集趋势数据
      const rangeInDays = config.timeRange === '7d' ? 7 : config.timeRange === '90d' ? 90 : 30;
      data.trends = this.portManager.getPortPerformanceTrends(rangeInDays);

      // 收集智能分析数据
      data.predictions = await this.analysisEngine.generateOptimizationPlan();
      data.anomalies = await this.analysisEngine.detectAnomalies();
      data.bottlenecks = await this.analysisEngine.diagnosePerformanceBottlenecks();

      // 收集告警数据
      data.alerts = {
        statistics: this.alertSystem.getAlertStatistics(),
        active: this.alertSystem.getActiveAlerts(),
        rules: this.alertSystem.getAlertRules()
      };

      // 添加报告元数据
      data.metadata = {
        generatedAt: new Date(),
        timeRange: config.timeRange,
        customDateRange: config.customStartDate && config.customEndDate ? {
          start: config.customStartDate,
          end: config.customEndDate
        } : null,
        version: '1.0.0'
      };

      return data;
    } catch (error) {
      logger.error('Failed to collect report data', { error });
      throw error;
    }
  }

  private async generateReportContent(
    template: ReportTemplate,
    data: Record<string, any>,
    config: ReportConfig
  ): Promise<string> {
    let content = this.generateReportHeader(template, data);

    for (const section of template.sections) {
      if (config.includeSections.includes(section.id)) {
        content += await this.generateSection(section, data, template.styling);
      }
    }

    content += this.generateReportFooter(template, data);
    return content;
  }

  private generateReportHeader(template: ReportTemplate, data: Record<string, any>): string {
    return `
      <div class="report-header" style="text-align: center; margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
        <h1 style="color: #2c3e50; margin-bottom: 10px;">${template.name}</h1>
        <p style="color: #6c757d; margin: 0;">${template.description}</p>
        <p style="color: #6c757d; font-size: 14px; margin-top: 10px;">
          生成时间: ${data.metadata.generatedAt.toLocaleString('zh-CN')} | 
          分析周期: ${this.formatTimeRange(data.metadata.timeRange)}
        </p>
      </div>
    `;
  }

  private async generateSection(
    section: any,
    data: Record<string, any>,
    styling: any
  ): Promise<string> {
    switch (section.type) {
      case 'overview':
        return this.generateOverviewSection(section, data, styling);
      case 'charts':
        return this.generateChartsSection(section, data, styling);
      case 'tables':
        return this.generateTablesSection(section, data, styling);
      case 'analysis':
        return this.generateAnalysisSection(section, data, styling);
      case 'recommendations':
        return this.generateRecommendationsSection(section, data, styling);
      default:
        return `<div class="section"><h2>${section.title}</h2><p>未支持的section类型: ${section.type}</p></div>`;
    }
  }

  private generateOverviewSection(section: any, data: Record<string, any>, styling: any): string {
    const stats = data.statistics;
    
    return `
      <div class="section overview-section" style="margin-bottom: 30px;">
        <h2 style="color: ${styling.colors[0]}; border-bottom: 2px solid ${styling.colors[1]}; padding-bottom: 8px;">
          ${section.title}
        </h2>
        <div class="overview-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0;">
          <div class="metric-card" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${styling.colors[1]};">${stats.totalAllocated || 0}</div>
            <div style="color: #6c757d; margin-top: 8px;">监控端口数</div>
          </div>
          <div class="metric-card" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${styling.colors[2]};">${data.alerts.statistics.active}</div>
            <div style="color: #6c757d; margin-top: 8px;">活跃告警</div>
          </div>
          <div class="metric-card" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${styling.colors[3]};">${data.anomalies.length}</div>
            <div style="color: #6c757d; margin-top: 8px;">检测异常</div>
          </div>
          <div class="metric-card" style="text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <div style="font-size: 28px; font-weight: bold; color: ${styling.colors[0]};">${data.bottlenecks.length}</div>
            <div style="color: #6c757d; margin-top: 8px;">性能瓶颈</div>
          </div>
        </div>
      </div>
    `;
  }

  private generateChartsSection(section: any, data: Record<string, any>, styling: any): string {
    return `
      <div class="section charts-section" style="margin-bottom: 30px;">
        <h2 style="color: ${styling.colors[0]}; border-bottom: 2px solid ${styling.colors[1]}; padding-bottom: 8px;">
          ${section.title}
        </h2>
        <div class="charts-container" style="margin: 20px 0;">
          <p style="text-align: center; color: #6c757d; padding: 40px; background: #f8f9fa; border-radius: 8px;">
            📊 图表功能正在开发中<br>
            将包括：端口使用趋势图、性能指标图表、分布饼图等
          </p>
        </div>
      </div>
    `;
  }

  private generateTablesSection(section: any, data: Record<string, any>, styling: any): string {
    const allocations = data.allocations || [];
    
    let tableRows = '';
    allocations.forEach((allocation: any) => {
      tableRows += `
        <tr>
          <td style="padding: 12px; border: 1px solid #dee2e6;">${allocation.port}</td>
          <td style="padding: 12px; border: 1px solid #dee2e6;">${allocation.appName || 'N/A'}</td>
          <td style="padding: 12px; border: 1px solid #dee2e6;">${allocation.type}</td>
          <td style="padding: 12px; border: 1px solid #dee2e6;">${allocation.status}</td>
          <td style="padding: 12px; border: 1px solid #dee2e6;">${allocation.lastChecked || 'N/A'}</td>
        </tr>
      `;
    });

    return `
      <div class="section tables-section" style="margin-bottom: 30px;">
        <h2 style="color: ${styling.colors[0]}; border-bottom: 2px solid ${styling.colors[1]}; padding-bottom: 8px;">
          ${section.title}
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: white;">
          <thead>
            <tr style="background: ${styling.colors[1]};">
              <th style="padding: 12px; color: white; border: 1px solid #dee2e6;">端口</th>
              <th style="padding: 12px; color: white; border: 1px solid #dee2e6;">应用程序</th>
              <th style="padding: 12px; color: white; border: 1px solid #dee2e6;">类型</th>
              <th style="padding: 12px; color: white; border: 1px solid #dee2e6;">状态</th>
              <th style="padding: 12px; color: white; border: 1px solid #dee2e6;">最后检查</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #6c757d;">暂无数据</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  }

  private generateAnalysisSection(section: any, data: Record<string, any>, styling: any): string {
    const optimizationPlan = data.predictions;
    
    return `
      <div class="section analysis-section" style="margin-bottom: 30px;">
        <h2 style="color: ${styling.colors[0]}; border-bottom: 2px solid ${styling.colors[1]}; padding-bottom: 8px;">
          ${section.title}
        </h2>
        <div class="analysis-content" style="margin: 20px 0;">
          <div style="padding: 20px; background: #f8f9fa; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: ${styling.colors[0]}; margin-top: 0;">智能分析总结</h3>
            <p style="color: #6c757d; line-height: 1.6;">${optimizationPlan.summary}</p>
          </div>
          
          ${data.anomalies.length > 0 ? `
          <div style="padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; margin-bottom: 20px;">
            <h4 style="color: #856404; margin-top: 0;">检测到的异常 (${data.anomalies.length})</h4>
            ${data.anomalies.slice(0, 3).map((anomaly: any) => `
              <p style="color: #856404; margin: 8px 0;">• ${anomaly.description}</p>
            `).join('')}
          </div>
          ` : ''}
          
          ${data.bottlenecks.length > 0 ? `
          <div style="padding: 20px; background: #f8d7da; border-left: 4px solid #dc3545; margin-bottom: 20px;">
            <h4 style="color: #721c24; margin-top: 0;">性能瓶颈 (${data.bottlenecks.length})</h4>
            ${data.bottlenecks.slice(0, 3).map((bottleneck: any) => `
              <p style="color: #721c24; margin: 8px 0;">• ${bottleneck.description}</p>
            `).join('')}
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private generateRecommendationsSection(section: any, data: Record<string, any>, styling: any): string {
    const optimizations = data.predictions.optimizations || [];
    
    let recommendationsList = '';
    optimizations.slice(0, 5).forEach((opt: any, index: number) => {
      const priorityColor = {
        urgent: '#dc3545',
        high: '#fd7e14',
        medium: '#ffc107',
        low: '#28a745'
      }[opt.priority] || '#6c757d';

      recommendationsList += `
        <div style="padding: 15px; margin-bottom: 15px; border: 1px solid #dee2e6; border-radius: 8px; background: white;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0; color: ${styling.colors[0]};">${opt.title}</h4>
            <span style="background: ${priorityColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
              ${opt.priority.toUpperCase()}
            </span>
          </div>
          <p style="color: #6c757d; margin-bottom: 10px; line-height: 1.5;">${opt.description}</p>
          <p style="color: #495057; margin: 0; font-weight: 500;">预期影响: ${opt.estimatedImpact}</p>
        </div>
      `;
    });

    return `
      <div class="section recommendations-section" style="margin-bottom: 30px;">
        <h2 style="color: ${styling.colors[0]}; border-bottom: 2px solid ${styling.colors[1]}; padding-bottom: 8px;">
          ${section.title}
        </h2>
        <div class="recommendations-content" style="margin: 20px 0;">
          ${recommendationsList || '<p style="text-align: center; color: #6c757d; padding: 20px;">暂无优化建议</p>'}
        </div>
      </div>
    `;
  }

  private generateReportFooter(template: ReportTemplate, data: Record<string, any>): string {
    return `
      <div class="report-footer" style="margin-top: 40px; padding: 20px; text-align: center; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 12px;">
        <p>报告生成时间: ${data.metadata.generatedAt.toLocaleString('zh-CN')}</p>
        <p>智能多应用门户系统 - 端口分析报告 v${data.metadata.version}</p>
      </div>
    `;
  }

  private async generatePDFReport(content: string, reportId: string): Promise<string> {
    // 模拟PDF生成（实际应用中应使用 puppeteer 或类似工具）
    const filePath = `reports/pdf/${reportId}.pdf`;
    
    // 这里应该将HTML内容转换为PDF
    logger.info('PDF report generated (simulated)', { reportId, filePath });
    
    return filePath;
  }

  private async generateHTMLReport(content: string, reportId: string): Promise<string> {
    const filePath = `reports/html/${reportId}.html`;
    
    const fullHTML = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>端口分析报告</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; line-height: 1.6; }
          .section { margin-bottom: 40px; }
          h1, h2, h3, h4 { margin-top: 0; }
          table { border-collapse: collapse; width: 100%; }
          th, td { padding: 12px; text-align: left; border: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;
    
    // 这里应该保存HTML文件
    logger.info('HTML report generated (simulated)', { reportId, filePath });
    
    return filePath;
  }

  private async generateExcelReport(data: Record<string, any>, reportId: string): Promise<string> {
    // 模拟Excel生成
    const filePath = `reports/excel/${reportId}.xlsx`;
    
    logger.info('Excel report generated (simulated)', { reportId, filePath });
    
    return filePath;
  }

  private async getFileSize(filePath: string): Promise<number> {
    // 模拟文件大小
    return Math.floor(Math.random() * 1000000) + 500000; // 0.5-1.5MB
  }

  private async sendReportToRecipients(report: GeneratedReport, recipients: string[]): Promise<void> {
    // 模拟发送报告
    logger.info('Report sent to recipients (simulated)', { 
      reportId: report.id, 
      recipients: recipients.length,
      format: report.config.format 
    });
  }

  private formatTimeRange(timeRange: string): string {
    const ranges = {
      '7d': '最近7天',
      '30d': '最近30天',
      '90d': '最近90天',
      'custom': '自定义时间范围'
    };
    return ranges[timeRange as keyof typeof ranges] || timeRange;
  }
}
