/**
 * Security Scan Service - 构建安全扫描服务
 * 
 * 提供依赖漏洞检测、构建产物安全扫描、安全策略配置管理、
 * 安全报告生成和告警等功能
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { Database } from 'better-sqlite3'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface SecurityScan {
  id: string
  appId: string
  buildId?: string
  type: 'dependency' | 'code' | 'container' | 'infrastructure' | 'full'
  status: 'pending' | 'scanning' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  duration?: number
  triggeredBy: string
  config: ScanConfig
  results: ScanResults
  metadata: {
    version: string
    scanner: string
    createdAt: number
    updatedAt: number
  }
}

export interface ScanConfig {
  scope: {
    includePaths: string[]
    excludePaths: string[]
    fileTypes: string[]
  }
  rules: {
    enabled: string[]
    disabled: string[]
    custom: CustomRule[]
  }
  thresholds: {
    critical: number
    high: number
    medium: number
    low: number
  }
  reporting: {
    format: 'json' | 'xml' | 'html' | 'pdf'
    includeDetails: boolean
    includeFixes: boolean
  }
  integrations: {
    cve: boolean
    npm: boolean
    snyk: boolean
    sonarqube: boolean
  }
}

export interface CustomRule {
  id: string
  name: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  pattern: string
  type: 'regex' | 'ast' | 'semantic'
  enabled: boolean
}

export interface ScanResults {
  summary: ScanSummary
  vulnerabilities: Vulnerability[]
  codeIssues: CodeIssue[]
  dependencies: DependencyIssue[]
  compliance: ComplianceResult[]
  recommendations: Recommendation[]
}

export interface ScanSummary {
  totalIssues: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  infoCount: number
  riskScore: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  passedChecks: number
  failedChecks: number
}

export interface Vulnerability {
  id: string
  cve?: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cvssScore?: number
  component: string
  version: string
  fixedVersion?: string
  publishedDate?: number
  discoveredDate: number
  references: string[]
  exploit: {
    available: boolean
    maturity: 'unproven' | 'proof-of-concept' | 'functional' | 'weaponized'
  }
  impact: {
    confidentiality: 'none' | 'partial' | 'complete'
    integrity: 'none' | 'partial' | 'complete'
    availability: 'none' | 'partial' | 'complete'
  }
}

export interface CodeIssue {
  id: string
  rule: string
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: 'security' | 'quality' | 'performance' | 'maintainability'
  file: string
  line: number
  column: number
  code: string
  suggestion?: string
  references: string[]
}

export interface DependencyIssue {
  id: string
  package: string
  version: string
  type: 'vulnerability' | 'license' | 'outdated' | 'deprecated'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  currentVersion: string
  latestVersion?: string
  recommendedVersion?: string
  license?: string
  licenseIssue?: string
  alternatives?: string[]
}

export interface ComplianceResult {
  standard: string
  version: string
  status: 'passed' | 'failed' | 'warning'
  score: number
  maxScore: number
  checks: ComplianceCheck[]
}

export interface ComplianceCheck {
  id: string
  name: string
  description: string
  status: 'passed' | 'failed' | 'warning' | 'not-applicable'
  severity: 'critical' | 'high' | 'medium' | 'low'
  evidence?: string
  remediation?: string
}

export interface Recommendation {
  id: string
  type: 'security' | 'performance' | 'quality' | 'compliance'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  description: string
  action: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  resources: string[]
}

export interface SecurityPolicy {
  id: string
  name: string
  description: string
  type: 'global' | 'project' | 'environment'
  scope: string[]
  rules: PolicyRule[]
  enforcement: 'advisory' | 'warning' | 'blocking'
  exceptions: PolicyException[]
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
    version: string
  }
  isActive: boolean
}

export interface PolicyRule {
  id: string
  name: string
  description: string
  condition: string
  action: 'allow' | 'warn' | 'block'
  severity: 'critical' | 'high' | 'medium' | 'low'
  parameters: Record<string, any>
}

export interface PolicyException {
  id: string
  rule: string
  reason: string
  approvedBy: string
  expiresAt?: number
  conditions: string[]
}

export interface SecurityReport {
  id: string
  scanId: string
  type: 'summary' | 'detailed' | 'executive' | 'compliance'
  format: 'json' | 'html' | 'pdf' | 'xml'
  content: string
  generatedAt: number
  generatedBy: string
  recipients: string[]
  metadata: {
    template: string
    version: string
    size: number
  }
}

export class SecurityScanService extends EventEmitter {
  private activeScanners = new Map<string, any>()
  private vulnerabilityDatabase = new Map<string, Vulnerability>()

  constructor(private db: Database) {
    super()
    this.initializeSecurityService()
  }

  /**
   * 初始化安全扫描服务
   */
  private async initializeSecurityService(): Promise<void> {
    try {
      // 创建安全扫描表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS security_scans (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          build_id TEXT,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          triggered_by TEXT NOT NULL,
          config TEXT NOT NULL,
          results TEXT NOT NULL DEFAULT '{}',
          version TEXT NOT NULL,
          scanner TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (app_id) REFERENCES applications (id)
        )
      `)

      // 创建安全策略表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS security_policies (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          scope TEXT NOT NULL,
          rules TEXT NOT NULL,
          enforcement TEXT NOT NULL,
          exceptions TEXT NOT NULL DEFAULT '[]',
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          version TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        )
      `)

      // 创建安全报告表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS security_reports (
          id TEXT PRIMARY KEY,
          scan_id TEXT NOT NULL,
          type TEXT NOT NULL,
          format TEXT NOT NULL,
          content TEXT NOT NULL,
          generated_at INTEGER NOT NULL,
          generated_by TEXT NOT NULL,
          recipients TEXT NOT NULL DEFAULT '[]',
          template TEXT NOT NULL,
          version TEXT NOT NULL,
          size INTEGER NOT NULL,
          FOREIGN KEY (scan_id) REFERENCES security_scans (id)
        )
      `)

      // 创建漏洞数据库表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS vulnerability_database (
          id TEXT PRIMARY KEY,
          cve TEXT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          severity TEXT NOT NULL,
          cvss_score REAL,
          component TEXT NOT NULL,
          version TEXT NOT NULL,
          fixed_version TEXT,
          published_date INTEGER,
          discovered_date INTEGER NOT NULL,
          "references" TEXT NOT NULL DEFAULT '[]',
          exploit TEXT NOT NULL DEFAULT '{}',
          impact TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)

      // 创建索引
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_security_scans_app_id ON security_scans (app_id);
        CREATE INDEX IF NOT EXISTS idx_security_scans_status ON security_scans (status);
        CREATE INDEX IF NOT EXISTS idx_security_scans_start_time ON security_scans (start_time);
        CREATE INDEX IF NOT EXISTS idx_security_policies_type ON security_policies (type);
        CREATE INDEX IF NOT EXISTS idx_security_policies_is_active ON security_policies (is_active);
        CREATE INDEX IF NOT EXISTS idx_security_reports_scan_id ON security_reports (scan_id);
        CREATE INDEX IF NOT EXISTS idx_vulnerability_database_cve ON vulnerability_database (cve);
        CREATE INDEX IF NOT EXISTS idx_vulnerability_database_component ON vulnerability_database (component);
        CREATE INDEX IF NOT EXISTS idx_vulnerability_database_severity ON vulnerability_database (severity);
      `)

      // 初始化漏洞数据库
      await this.initializeVulnerabilityDatabase()

      // 初始化默认安全策略
      await this.initializeDefaultPolicies()

      logger.debug('Security scan service initialized')
    } catch (error) {
      logger.error('Failed to initialize security scan service', { error })
      throw error
    }
  }

  /**
   * 初始化漏洞数据库
   */
  private async initializeVulnerabilityDatabase(): Promise<void> {
    // 模拟一些常见漏洞数据
    const vulnerabilities = [
      {
        id: 'CVE-2023-26136',
        cve: 'CVE-2023-26136',
        title: 'tough-cookie Prototype Pollution vulnerability',
        description: 'Versions of the package tough-cookie before 4.1.3 are vulnerable to Prototype Pollution',
        severity: 'medium' as const,
        cvssScore: 6.5,
        component: 'tough-cookie',
        version: '<4.1.3',
        fixedVersion: '4.1.3',
        publishedDate: 1679875200000,
        discoveredDate: Date.now(),
        references: [
          'https://nvd.nist.gov/vuln/detail/CVE-2023-26136',
          'https://github.com/salesforce/tough-cookie/issues/282'
        ],
        exploit: {
          available: false,
          maturity: 'unproven' as const
        },
        impact: {
          confidentiality: 'partial' as const,
          integrity: 'partial' as const,
          availability: 'none' as const
        }
      },
      {
        id: 'CVE-2023-45133',
        cve: 'CVE-2023-45133',
        title: 'Babel vulnerable to arbitrary code execution',
        description: 'Babel allows attackers to execute arbitrary code by exploiting unsafe evaluation',
        severity: 'critical' as const,
        cvssScore: 9.8,
        component: '@babel/traverse',
        version: '<7.23.2',
        fixedVersion: '7.23.2',
        publishedDate: 1697587200000,
        discoveredDate: Date.now(),
        references: [
          'https://nvd.nist.gov/vuln/detail/CVE-2023-45133',
          'https://github.com/babel/babel/security/advisories/GHSA-67hx-6x53-jw92'
        ],
        exploit: {
          available: true,
          maturity: 'functional' as const
        },
        impact: {
          confidentiality: 'complete' as const,
          integrity: 'complete' as const,
          availability: 'complete' as const
        }
      }
    ]

    for (const vuln of vulnerabilities) {
      try {
        const existing = await this.getVulnerabilityById(vuln.id)
        if (!existing) {
          await this.saveVulnerability(vuln)
          this.vulnerabilityDatabase.set(vuln.id, vuln)
          logger.debug('Vulnerability added to database', { id: vuln.id, cve: vuln.cve })
        }
      } catch (error) {
        logger.warn('Failed to add vulnerability to database', { id: vuln.id, error })
      }
    }
  }

  /**
   * 初始化默认安全策略
   */
  private async initializeDefaultPolicies(): Promise<void> {
    const defaultPolicies = [
      {
        name: '高危漏洞阻断策略',
        description: '阻断包含高危和严重漏洞的构建',
        type: 'global' as const,
        scope: ['*'],
        rules: [
          {
            id: 'block-critical-vulns',
            name: '阻断严重漏洞',
            description: '当发现严重漏洞时阻断构建',
            condition: 'vulnerability.severity == "critical"',
            action: 'block' as const,
            severity: 'critical' as const,
            parameters: { maxCount: 0 }
          },
          {
            id: 'warn-high-vulns',
            name: '警告高危漏洞',
            description: '当发现高危漏洞时发出警告',
            condition: 'vulnerability.severity == "high"',
            action: 'warn' as const,
            severity: 'high' as const,
            parameters: { maxCount: 3 }
          }
        ],
        enforcement: 'blocking' as const,
        exceptions: []
      },
      {
        name: '代码质量检查策略',
        description: '检查代码质量和安全问题',
        type: 'global' as const,
        scope: ['*'],
        rules: [
          {
            id: 'no-hardcoded-secrets',
            name: '禁止硬编码密钥',
            description: '检测代码中的硬编码密钥和敏感信息',
            condition: 'codeIssue.category == "security" && codeIssue.rule.includes("hardcoded")',
            action: 'block' as const,
            severity: 'high' as const,
            parameters: {}
          },
          {
            id: 'sql-injection-check',
            name: 'SQL注入检查',
            description: '检测潜在的SQL注入漏洞',
            condition: 'codeIssue.rule == "sql-injection"',
            action: 'warn' as const,
            severity: 'high' as const,
            parameters: {}
          }
        ],
        enforcement: 'warning' as const,
        exceptions: []
      }
    ]

    for (const policyData of defaultPolicies) {
      try {
        const existing = await this.getPolicyByName(policyData.name)
        if (!existing) {
          await this.createPolicy({
            ...policyData,
            metadata: {
              createdBy: 'system',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              version: '1.0.0'
            },
            isActive: true
          })
          logger.info('Default security policy created', { name: policyData.name })
        }
      } catch (error) {
        logger.warn('Failed to create default security policy', { name: policyData.name, error })
      }
    }
  }

  /**
   * 启动安全扫描
   */
  async startScan(
    appId: string, 
    type: SecurityScan['type'], 
    triggeredBy: string,
    config?: Partial<ScanConfig>,
    buildId?: string
  ): Promise<string> {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const defaultConfig: ScanConfig = {
      scope: {
        includePaths: ['src/**/*', 'package.json', 'package-lock.json'],
        excludePaths: ['node_modules/**/*', 'dist/**/*', 'build/**/*'],
        fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.json']
      },
      rules: {
        enabled: ['vulnerability-check', 'dependency-check', 'code-quality'],
        disabled: [],
        custom: []
      },
      thresholds: {
        critical: 0,
        high: 5,
        medium: 20,
        low: 50
      },
      reporting: {
        format: 'json',
        includeDetails: true,
        includeFixes: true
      },
      integrations: {
        cve: true,
        npm: true,
        snyk: false,
        sonarqube: false
      }
    }

    const scan: SecurityScan = {
      id: scanId,
      appId,
      buildId,
      type,
      status: 'pending',
      startTime: Date.now(),
      triggeredBy,
      config: { ...defaultConfig, ...config },
      results: {
        summary: {
          totalIssues: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0,
          riskScore: 0,
          grade: 'A',
          passedChecks: 0,
          failedChecks: 0
        },
        vulnerabilities: [],
        codeIssues: [],
        dependencies: [],
        compliance: [],
        recommendations: []
      },
      metadata: {
        version: '1.0.0',
        scanner: 'intelligent-security-scanner',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    }

    try {
      // 保存扫描记录
      await this.saveScan(scan)
      this.activeScanners.set(scanId, scan)

      // 开始扫描
      this.performScan(scan)

      logger.info('Security scan started', { scanId, appId, type })
      return scanId
    } catch (error) {
      logger.error('Failed to start security scan', { appId, type, error })
      throw error
    }
  }

  /**
   * 执行安全扫描
   */
  private async performScan(scan: SecurityScan): Promise<void> {
    scan.status = 'scanning'
    scan.metadata.updatedAt = Date.now()

    try {
      // 依赖漏洞扫描
      if (scan.type === 'dependency' || scan.type === 'full') {
        await this.scanDependencies(scan)
      }

      // 代码安全扫描
      if (scan.type === 'code' || scan.type === 'full') {
        await this.scanCode(scan)
      }

      // 容器安全扫描
      if (scan.type === 'container' || scan.type === 'full') {
        await this.scanContainer(scan)
      }

      // 基础设施扫描
      if (scan.type === 'infrastructure' || scan.type === 'full') {
        await this.scanInfrastructure(scan)
      }

      // 生成摘要和建议
      this.generateSummary(scan)
      this.generateRecommendations(scan)

      scan.status = 'completed'
      scan.endTime = Date.now()
      scan.duration = scan.endTime - scan.startTime

      logger.info('Security scan completed', { 
        scanId: scan.id, 
        duration: scan.duration,
        totalIssues: scan.results.summary.totalIssues 
      })

    } catch (error) {
      scan.status = 'failed'
      scan.endTime = Date.now()
      scan.duration = scan.endTime - scan.startTime

      logger.error('Security scan failed', { scanId: scan.id, error })
    } finally {
      // 保存最终结果
      await this.saveScan(scan)
      this.activeScanners.delete(scan.id)

      // 发送事件
      this.emit('scan_complete', scan)

      // 应用安全策略
      await this.applySecurityPolicies(scan)
    }
  }

  /**
   * 扫描依赖漏洞
   */
  private async scanDependencies(scan: SecurityScan): Promise<void> {
    // 模拟依赖扫描
    const mockVulnerabilities: Vulnerability[] = [
      {
        id: 'vuln_1',
        cve: 'CVE-2023-26136',
        title: 'tough-cookie Prototype Pollution vulnerability',
        description: 'Versions of the package tough-cookie before 4.1.3 are vulnerable to Prototype Pollution',
        severity: 'medium',
        cvssScore: 6.5,
        component: 'tough-cookie',
        version: '4.0.0',
        fixedVersion: '4.1.3',
        publishedDate: 1679875200000,
        discoveredDate: Date.now(),
        references: ['https://nvd.nist.gov/vuln/detail/CVE-2023-26136'],
        exploit: { available: false, maturity: 'unproven' },
        impact: { confidentiality: 'partial', integrity: 'partial', availability: 'none' }
      }
    ]

    const mockDependencyIssues: DependencyIssue[] = [
      {
        id: 'dep_1',
        package: 'lodash',
        version: '4.17.20',
        type: 'outdated',
        severity: 'low',
        description: 'Package is outdated',
        currentVersion: '4.17.20',
        latestVersion: '4.17.21',
        recommendedVersion: '4.17.21'
      }
    ]

    scan.results.vulnerabilities.push(...mockVulnerabilities)
    scan.results.dependencies.push(...mockDependencyIssues)

    // 模拟扫描时间
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  /**
   * 扫描代码安全问题
   */
  private async scanCode(scan: SecurityScan): Promise<void> {
    // 模拟代码扫描
    const mockCodeIssues: CodeIssue[] = [
      {
        id: 'code_1',
        rule: 'no-hardcoded-secrets',
        title: '硬编码密钥检测',
        description: '发现硬编码的API密钥',
        severity: 'high',
        category: 'security',
        file: 'src/config.js',
        line: 15,
        column: 20,
        code: 'const API_KEY = "sk-1234567890abcdef"',
        suggestion: '使用环境变量存储敏感信息',
        references: ['https://owasp.org/www-community/vulnerabilities/Use_of_hard-coded_password']
      }
    ]

    scan.results.codeIssues.push(...mockCodeIssues)

    // 模拟扫描时间
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  /**
   * 扫描容器安全
   */
  private async scanContainer(scan: SecurityScan): Promise<void> {
    // 模拟容器扫描
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * 扫描基础设施安全
   */
  private async scanInfrastructure(scan: SecurityScan): Promise<void> {
    // 模拟基础设施扫描
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  /**
   * 生成扫描摘要
   */
  private generateSummary(scan: SecurityScan): void {
    const { vulnerabilities, codeIssues, dependencies } = scan.results
    const allIssues = [...vulnerabilities, ...codeIssues, ...dependencies]

    const summary: ScanSummary = {
      totalIssues: allIssues.length,
      criticalCount: allIssues.filter(i => i.severity === 'critical').length,
      highCount: allIssues.filter(i => i.severity === 'high').length,
      mediumCount: allIssues.filter(i => i.severity === 'medium').length,
      lowCount: allIssues.filter(i => i.severity === 'low').length,
      infoCount: allIssues.filter(i => 'severity' in i && i.severity === 'info').length,
      riskScore: this.calculateRiskScore(allIssues),
      grade: this.calculateGrade(allIssues),
      passedChecks: 0,
      failedChecks: allIssues.length
    }

    scan.results.summary = summary
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(issues: any[]): number {
    const weights = { critical: 10, high: 7, medium: 4, low: 1, info: 0 }
    const totalScore = issues.reduce((score, issue) => {
      return score + (weights[issue.severity] || 0)
    }, 0)
    
    return Math.min(100, totalScore)
  }

  /**
   * 计算安全等级
   */
  private calculateGrade(issues: any[]): 'A' | 'B' | 'C' | 'D' | 'F' {
    const criticalCount = issues.filter(i => i.severity === 'critical').length
    const highCount = issues.filter(i => i.severity === 'high').length
    
    if (criticalCount > 0) return 'F'
    if (highCount > 5) return 'D'
    if (highCount > 2) return 'C'
    if (highCount > 0) return 'B'
    return 'A'
  }

  /**
   * 生成安全建议
   */
  private generateRecommendations(scan: SecurityScan): void {
    const recommendations: Recommendation[] = []

    // 基于漏洞生成建议
    if (scan.results.vulnerabilities.length > 0) {
      recommendations.push({
        id: 'update-dependencies',
        type: 'security',
        priority: 'high',
        title: '更新存在漏洞的依赖',
        description: '发现存在已知漏洞的依赖包，建议立即更新',
        action: '运行 npm audit fix 或手动更新到安全版本',
        effort: 'low',
        impact: 'high',
        resources: ['https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities']
      })
    }

    // 基于代码问题生成建议
    if (scan.results.codeIssues.length > 0) {
      recommendations.push({
        id: 'fix-code-issues',
        type: 'security',
        priority: 'medium',
        title: '修复代码安全问题',
        description: '发现代码中存在安全风险，建议及时修复',
        action: '根据扫描报告修复相应的代码问题',
        effort: 'medium',
        impact: 'medium',
        resources: ['https://owasp.org/www-project-top-ten/']
      })
    }

    scan.results.recommendations = recommendations
  }

  /**
   * 应用安全策略
   */
  private async applySecurityPolicies(scan: SecurityScan): Promise<void> {
    try {
      const policies = await this.getActivePolicies()
      
      for (const policy of policies) {
        const violations = this.checkPolicyViolations(scan, policy)
        
        if (violations.length > 0) {
          logger.warn('Security policy violations detected', {
            scanId: scan.id,
            policy: policy.name,
            violations: violations.length
          })

          // 根据策略执行相应动作
          if (policy.enforcement === 'blocking') {
            this.emit('policy_violation', {
              scanId: scan.id,
              policy: policy.name,
              action: 'block',
              violations
            })
          }
        }
      }
    } catch (error) {
      logger.error('Failed to apply security policies', { scanId: scan.id, error })
    }
  }

  /**
   * 检查策略违规
   */
  private checkPolicyViolations(scan: SecurityScan, policy: SecurityPolicy): any[] {
    const violations: any[] = []

    for (const rule of policy.rules) {
      // 简化的规则检查逻辑
      if (rule.condition.includes('critical') && scan.results.summary.criticalCount > 0) {
        violations.push({
          rule: rule.id,
          description: rule.description,
          count: scan.results.summary.criticalCount
        })
      }
    }

    return violations
  }

  /**
   * 获取活跃策略
   */
  private async getActivePolicies(): Promise<SecurityPolicy[]> {
    try {
      const stmt = this.db.prepare('SELECT * FROM security_policies WHERE is_active = 1')
      const rows = stmt.all() as any[]

      return rows.map(row => this.mapRowToPolicy(row))
    } catch (error) {
      logger.error('Failed to get active policies', { error })
      return []
    }
  }

  /**
   * 创建安全策略
   */
  async createPolicy(policy: Omit<SecurityPolicy, 'id'>): Promise<string> {
    const id = `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      const stmt = this.db.prepare(`
        INSERT INTO security_policies (
          id, name, description, type, scope, rules, enforcement,
          exceptions, created_by, created_at, updated_at, version, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        id,
        policy.name,
        policy.description,
        policy.type,
        JSON.stringify(policy.scope),
        JSON.stringify(policy.rules),
        policy.enforcement,
        JSON.stringify(policy.exceptions),
        policy.metadata.createdBy,
        policy.metadata.createdAt,
        policy.metadata.updatedAt,
        policy.metadata.version,
        policy.isActive ? 1 : 0
      )

      logger.info('Security policy created', { id, name: policy.name })
      return id
    } catch (error) {
      logger.error('Failed to create security policy', { error })
      throw error
    }
  }

  /**
   * 根据名称获取策略
   */
  async getPolicyByName(name: string): Promise<SecurityPolicy | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM security_policies WHERE name = ?')
      const row = stmt.get(name) as any

      if (!row) return null

      return this.mapRowToPolicy(row)
    } catch (error) {
      logger.error('Failed to get policy by name', { name, error })
      return null
    }
  }

  /**
   * 保存漏洞信息
   */
  private async saveVulnerability(vulnerability: Vulnerability): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO vulnerability_database (
          id, cve, title, description, severity, cvss_score, component,
          version, fixed_version, published_date, discovered_date,
          "references", exploit, impact, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const now = Date.now()
      stmt.run(
        vulnerability.id,
        vulnerability.cve,
        vulnerability.title,
        vulnerability.description,
        vulnerability.severity,
        vulnerability.cvssScore,
        vulnerability.component,
        vulnerability.version,
        vulnerability.fixedVersion,
        vulnerability.publishedDate,
        vulnerability.discoveredDate,
        JSON.stringify(vulnerability.references),
        JSON.stringify(vulnerability.exploit),
        JSON.stringify(vulnerability.impact),
        now,
        now
      )
    } catch (error) {
      logger.error('Failed to save vulnerability', { id: vulnerability.id, error })
    }
  }

  /**
   * 根据ID获取漏洞
   */
  private async getVulnerabilityById(id: string): Promise<Vulnerability | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM vulnerability_database WHERE id = ?')
      const row = stmt.get(id) as any

      if (!row) return null

      return {
        id: row.id,
        cve: row.cve,
        title: row.title,
        description: row.description,
        severity: row.severity,
        cvssScore: row.cvss_score,
        component: row.component,
        version: row.version,
        fixedVersion: row.fixed_version,
        publishedDate: row.published_date,
        discoveredDate: row.discovered_date,
        references: JSON.parse(row.references),
        exploit: JSON.parse(row.exploit),
        impact: JSON.parse(row.impact)
      }
    } catch (error) {
      logger.error('Failed to get vulnerability by id', { id, error })
      return null
    }
  }

  /**
   * 保存扫描结果
   */
  private async saveScan(scan: SecurityScan): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO security_scans (
          id, app_id, build_id, type, status, start_time, end_time, duration,
          triggered_by, config, results, version, scanner, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        scan.id,
        scan.appId,
        scan.buildId,
        scan.type,
        scan.status,
        scan.startTime,
        scan.endTime,
        scan.duration,
        scan.triggeredBy,
        JSON.stringify(scan.config),
        JSON.stringify(scan.results),
        scan.metadata.version,
        scan.metadata.scanner,
        scan.metadata.createdAt,
        scan.metadata.updatedAt
      )
    } catch (error) {
      logger.error('Failed to save security scan', { scanId: scan.id, error })
    }
  }

  /**
   * 映射数据库行到策略对象
   */
  private mapRowToPolicy(row: any): SecurityPolicy {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      type: row.type,
      scope: JSON.parse(row.scope),
      rules: JSON.parse(row.rules),
      enforcement: row.enforcement,
      exceptions: JSON.parse(row.exceptions),
      metadata: {
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        version: row.version
      },
      isActive: row.is_active === 1
    }
  }
}
