/**
 * 智能端口分配服务
 * 
 * 提供技术栈感知的端口分配、冲突检测和智能优化
 */

import { ElMessage } from 'element-plus'

export interface PortSuggestion {
  port: number
  reason: string
  confidence: number
  techStack: string
}

export interface ConflictReport {
  conflictingPorts: number[]
  suggestions: PortSuggestion[]
  alternatives: number[]
}

export interface PortAllocation {
  allocations: Map<string, number>
  conflicts: ConflictReport[]
  optimization: {
    totalScore: number
    distribution: 'excellent' | 'good' | 'fair' | 'poor'
    recommendations: string[]
  }
}

export interface DetectedApp {
  id: string
  name: string
  techStack: string
  directory: string
  preferredPorts?: number[]
  dependencies?: string[]
  isProduction?: boolean
}

export interface PortPattern {
  techStack: string
  commonPorts: number[]
  usage: {
    port: number
    frequency: number
    successRate: number
  }[]
}

export class SmartPortAllocator {
  private readonly techStackPorts: Record<string, number[]> = {
    // 前端框架
    'React': [3000, 3001, 3002, 3003],
    'Vue': [8080, 8081, 5173, 5174],
    'Angular': [4200, 4201, 4202, 4203],
    'Svelte': [5000, 5001, 5002, 5173],
    'Next.js': [3000, 3001, 3002, 3003],
    'Nuxt.js': [3000, 3001, 8080, 8081],
    'Gatsby': [8000, 8001, 8002, 8003],
    
    // 后端框架
    'Node.js': [3000, 5000, 8000, 8080],
    'Express': [3000, 8000, 8080, 3001],
    'Koa': [3000, 3001, 3002, 3003],
    'Fastify': [3000, 3001, 3002, 3003],
    'NestJS': [3000, 3001, 3002, 3003],
    
    // 其他技术栈
    'Spring Boot': [8080, 8081, 8082, 8083],
    'Django': [8000, 8001, 8002, 8003],
    'Flask': [5000, 5001, 5002, 5003],
    'Ruby on Rails': [3000, 3001, 3002, 3003],
    'PHP': [8000, 8080, 80, 8888],
    'Laravel': [8000, 8001, 8002, 8003],
    
    // 开发工具
    'Vite': [5173, 5174, 5175, 5176],
    'Webpack Dev Server': [8080, 8081, 8082, 8083],
    'Create React App': [3000, 3001, 3002, 3003],
    'Vue CLI': [8080, 8081, 8082, 8083],
    
    // 数据库和服务
    'MongoDB': [27017, 27018, 27019, 27020],
    'Redis': [6379, 6380, 6381, 6382],
    'PostgreSQL': [5432, 5433, 5434, 5435],
    'MySQL': [3306, 3307, 3308, 3309]
  }

  private readonly portRanges = {
    development: { start: 3000, end: 9999 },
    production: { start: 8000, end: 8999 },
    testing: { start: 9000, end: 9999 },
    system: { start: 1, end: 1023 },
    userDefined: { start: 10000, end: 65535 }
  }

  private readonly reservedPorts = [
    22, 23, 25, 53, 80, 110, 143, 443, 993, 995, // 系统端口
    3000, 8000, 8001, 8080, // 常用开发端口
    5432, 3306, 27017, 6379 // 数据库端口
  ]

  private usageHistory: Map<number, {
    frequency: number
    successRate: number
    lastUsed: Date
    techStack: string
  }> = new Map()

  /**
   * 为检测到的应用分配最优端口
   */
  async allocateOptimalPorts(apps: DetectedApp[]): Promise<PortAllocation> {
    const startTime = Date.now()
    console.log(`🎯 开始为 ${apps.length} 个应用分配端口...`)
    
    const allocations = new Map<string, number>()
    const conflicts: ConflictReport[] = []
    const occupiedPorts = new Set<number>()
    
    // 获取当前占用的端口
    const currentlyOccupied = await this.getCurrentOccupiedPorts()
    currentlyOccupied.forEach(port => occupiedPorts.add(port))
    
    // 按优先级排序应用
    const sortedApps = this.sortAppsByPriority(apps)
    
    for (const app of sortedApps) {
      const allocation = await this.allocatePortForApp(app, occupiedPorts, allocations)
      
      if (allocation.port) {
        allocations.set(app.id, allocation.port)
        occupiedPorts.add(allocation.port)
        
        console.log(`✅ ${app.name} (${app.techStack}) -> 端口 ${allocation.port}`)
      } else {
        conflicts.push({
          conflictingPorts: allocation.conflicts || [],
          suggestions: allocation.suggestions || [],
          alternatives: allocation.alternatives || []
        })
        
        console.warn(`⚠️ ${app.name} 端口分配失败`)
      }
    }
    
    // 计算分配优化评分
    const optimization = this.calculateOptimization(allocations, apps)
    
    const duration = Date.now() - startTime
    console.log(`🏁 端口分配完成，耗时 ${duration}ms`)
    
    return {
      allocations,
      conflicts,
      optimization
    }
  }

  /**
   * 为单个应用分配端口
   */
  private async allocatePortForApp(
    app: DetectedApp, 
    occupiedPorts: Set<number>,
    existingAllocations: Map<string, number>
  ): Promise<{
    port?: number
    conflicts?: number[]
    suggestions?: PortSuggestion[]
    alternatives?: number[]
  }> {
    // 1. 获取技术栈建议端口
    const techStackPorts = this.getTechStackPorts(app.techStack)
    const suggestions: PortSuggestion[] = []
    
    // 2. 检查首选端口
    for (const port of techStackPorts) {
      if (!occupiedPorts.has(port) && !this.isPortReserved(port)) {
        const suggestion: PortSuggestion = {
          port,
          reason: `${app.techStack} 技术栈默认端口`,
          confidence: 0.9,
          techStack: app.techStack
        }
        
        // 检查端口可用性
        const isAvailable = await this.checkPortAvailability(port)
        if (isAvailable) {
          suggestions.push(suggestion)
          return { port, suggestions: [suggestion] }
        }
      }
    }
    
    // 3. 尝试相邻端口
    for (const basePort of techStackPorts) {
      for (let offset = 1; offset <= 10; offset++) {
        const port = basePort + offset
        
        if (!occupiedPorts.has(port) && 
            !this.isPortReserved(port) && 
            await this.checkPortAvailability(port)) {
          
          const suggestion: PortSuggestion = {
            port,
            reason: `${app.techStack} 相邻端口 (+${offset})`,
            confidence: Math.max(0.5, 0.9 - offset * 0.05),
            techStack: app.techStack
          }
          
          suggestions.push(suggestion)
          return { port, suggestions: [suggestion] }
        }
      }
    }
    
    // 4. 智能范围分配
    const rangePort = await this.findPortInRange(
      this.portRanges.development,
      occupiedPorts
    )
    
    if (rangePort) {
      const suggestion: PortSuggestion = {
        port: rangePort,
        reason: '开发端口范围内可用端口',
        confidence: 0.6,
        techStack: app.techStack
      }
      
      suggestions.push(suggestion)
      return { port: rangePort, suggestions: [suggestion] }
    }
    
    // 5. 分配失败，返回冲突信息
    const conflicts = techStackPorts.filter(port => 
      occupiedPorts.has(port) || this.isPortReserved(port)
    )
    
    const alternatives = await this.generateAlternativePorts(app, occupiedPorts)
    
    return {
      conflicts,
      suggestions,
      alternatives
    }
  }

  /**
   * 获取技术栈推荐端口
   */
  private getTechStackPorts(techStack: string): number[] {
    // 精确匹配
    if (this.techStackPorts[techStack]) {
      return [...this.techStackPorts[techStack]]
    }
    
    // 模糊匹配
    const lowerTechStack = techStack.toLowerCase()
    for (const [key, ports] of Object.entries(this.techStackPorts)) {
      if (lowerTechStack.includes(key.toLowerCase()) || 
          key.toLowerCase().includes(lowerTechStack)) {
        return [...ports]
      }
    }
    
    // 根据关键词推断
    if (lowerTechStack.includes('react') || lowerTechStack.includes('next')) {
      return [...this.techStackPorts['React']]
    }
    if (lowerTechStack.includes('vue') || lowerTechStack.includes('nuxt')) {
      return [...this.techStackPorts['Vue']]
    }
    if (lowerTechStack.includes('angular')) {
      return [...this.techStackPorts['Angular']]
    }
    if (lowerTechStack.includes('node') || lowerTechStack.includes('express')) {
      return [...this.techStackPorts['Node.js']]
    }
    
    // 默认端口
    return [3000, 3001, 8000, 8080]
  }

  /**
   * 检查端口可用性
   */
  private async checkPortAvailability(port: number): Promise<boolean> {
    try {
      // 简单的端口检查 - 实际应该调用系统API
      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        mode: 'no-cors'
      }).catch(() => null)
      
      // 如果无法连接，说明端口可用
      return !response
    } catch {
      return true
    }
  }

  /**
   * 获取当前占用的端口
   */
  private async getCurrentOccupiedPorts(): Promise<number[]> {
    // 模拟获取占用端口 - 实际应该调用系统API
    return [3000, 8000, 8001, 5432, 3306, 27017, 6379]
  }

  /**
   * 检查是否为保留端口
   */
  private isPortReserved(port: number): boolean {
    return this.reservedPorts.includes(port) || port < 1024
  }

  /**
   * 在指定范围内查找可用端口
   */
  private async findPortInRange(
    range: { start: number, end: number },
    occupiedPorts: Set<number>
  ): Promise<number | null> {
    for (let port = range.start; port <= range.end; port++) {
      if (!occupiedPorts.has(port) && 
          !this.isPortReserved(port) && 
          await this.checkPortAvailability(port)) {
        return port
      }
    }
    return null
  }

  /**
   * 生成替代端口建议
   */
  private async generateAlternativePorts(
    app: DetectedApp,
    occupiedPorts: Set<number>
  ): Promise<number[]> {
    const alternatives: number[] = []
    
    // 基于使用历史
    const historicalPorts = this.getHistoricalPorts(app.techStack)
    for (const port of historicalPorts) {
      if (!occupiedPorts.has(port) && 
          await this.checkPortAvailability(port)) {
        alternatives.push(port)
        if (alternatives.length >= 3) break
      }
    }
    
    // 智能生成
    if (alternatives.length < 3) {
      const basePort = 3000
      for (let i = 0; i < 20; i++) {
        const port = basePort + Math.floor(Math.random() * 1000)
        if (!occupiedPorts.has(port) && 
            !alternatives.includes(port) &&
            await this.checkPortAvailability(port)) {
          alternatives.push(port)
          if (alternatives.length >= 5) break
        }
      }
    }
    
    return alternatives
  }

  /**
   * 获取历史使用端口
   */
  private getHistoricalPorts(techStack: string): number[] {
    const ports: { port: number, score: number }[] = []
    
    for (const [port, usage] of this.usageHistory) {
      if (usage.techStack === techStack) {
        const score = usage.frequency * usage.successRate
        ports.push({ port, score })
      }
    }
    
    return ports
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => p.port)
  }

  /**
   * 按优先级排序应用
   */
  private sortAppsByPriority(apps: DetectedApp[]): DetectedApp[] {
    return [...apps].sort((a, b) => {
      // 生产环境优先
      if (a.isProduction && !b.isProduction) return -1
      if (!a.isProduction && b.isProduction) return 1
      
      // 技术栈优先级
      const aPriority = this.getTechStackPriority(a.techStack)
      const bPriority = this.getTechStackPriority(b.techStack)
      
      return bPriority - aPriority
    })
  }

  /**
   * 获取技术栈优先级
   */
  private getTechStackPriority(techStack: string): number {
    const priorities: Record<string, number> = {
      'React': 10,
      'Vue': 9,
      'Angular': 8,
      'Node.js': 7,
      'Express': 6,
      'Next.js': 9,
      'Nuxt.js': 8
    }
    
    return priorities[techStack] || 5
  }

  /**
   * 计算分配优化评分
   */
  private calculateOptimization(
    allocations: Map<string, number>,
    apps: DetectedApp[]
  ): PortAllocation['optimization'] {
    let totalScore = 0
    const recommendations: string[] = []
    
    // 技术栈匹配度评分
    let techStackMatches = 0
    for (const app of apps) {
      const allocatedPort = allocations.get(app.id)
      if (allocatedPort) {
        const techStackPorts = this.getTechStackPorts(app.techStack)
        if (techStackPorts.includes(allocatedPort)) {
          techStackMatches++
          totalScore += 20
        } else {
          totalScore += 10
          recommendations.push(`${app.name} 未使用推荐端口`)
        }
      }
    }
    
    // 端口分布评分
    const allocatedPorts = Array.from(allocations.values())
    const portSpread = this.calculatePortSpread(allocatedPorts)
    totalScore += portSpread * 10
    
    if (portSpread < 0.5) {
      recommendations.push('端口分配过于集中，建议分散使用')
    }
    
    // 冲突避免评分
    const conflicts = this.detectPortConflicts(allocatedPorts)
    totalScore -= conflicts * 5
    
    if (conflicts > 0) {
      recommendations.push(`发现 ${conflicts} 个潜在端口冲突`)
    }
    
    // 计算总体分布等级
    const maxScore = apps.length * 20 + 50
    const percentage = totalScore / maxScore
    
    let distribution: 'excellent' | 'good' | 'fair' | 'poor'
    if (percentage >= 0.9) distribution = 'excellent'
    else if (percentage >= 0.7) distribution = 'good'
    else if (percentage >= 0.5) distribution = 'fair'
    else distribution = 'poor'
    
    return {
      totalScore: Math.round(percentage * 100),
      distribution,
      recommendations
    }
  }

  /**
   * 计算端口分布度
   */
  private calculatePortSpread(ports: number[]): number {
    if (ports.length <= 1) return 1
    
    const sorted = [...ports].sort((a, b) => a - b)
    const totalRange = sorted[sorted.length - 1] - sorted[0]
    const averageGap = totalRange / (sorted.length - 1)
    
    // 理想的端口间隔应该在10-100之间
    const idealGap = 50
    return Math.min(1, averageGap / idealGap)
  }

  /**
   * 检测端口冲突
   */
  private detectPortConflicts(ports: number[]): number {
    let conflicts = 0
    
    for (let i = 0; i < ports.length; i++) {
      for (let j = i + 1; j < ports.length; j++) {
        // 端口过于接近视为潜在冲突
        if (Math.abs(ports[i] - ports[j]) < 5) {
          conflicts++
        }
      }
    }
    
    return conflicts
  }

  /**
   * 分析端口使用模式
   */
  analyzeUsagePatterns(): PortPattern[] {
    const patterns: Map<string, PortPattern> = new Map()
    
    for (const [port, usage] of this.usageHistory) {
      const techStack = usage.techStack
      
      if (!patterns.has(techStack)) {
        patterns.set(techStack, {
          techStack,
          commonPorts: [],
          usage: []
        })
      }
      
      const pattern = patterns.get(techStack)!
      pattern.usage.push({
        port,
        frequency: usage.frequency,
        successRate: usage.successRate
      })
    }
    
    // 排序和限制
    for (const pattern of patterns.values()) {
      pattern.usage.sort((a, b) => b.frequency - a.frequency)
      pattern.commonPorts = pattern.usage.slice(0, 5).map(u => u.port)
    }
    
    return Array.from(patterns.values())
  }

  /**
   * 记录端口使用情况
   */
  recordPortUsage(port: number, techStack: string, success: boolean): void {
    const key = port
    const existing = this.usageHistory.get(key)
    
    if (existing) {
      existing.frequency++
      existing.successRate = (existing.successRate + (success ? 1 : 0)) / 2
      existing.lastUsed = new Date()
    } else {
      this.usageHistory.set(key, {
        frequency: 1,
        successRate: success ? 1 : 0,
        lastUsed: new Date(),
        techStack
      })
    }
  }

  /**
   * 获取端口健康报告
   */
  async getPortHealthReport(): Promise<{
    totalChecked: number
    available: number
    occupied: number
    reserved: number
    recommendations: string[]
  }> {
    const testPorts = [
      ...Object.values(this.techStackPorts).flat(),
      ...Array.from({ length: 20 }, (_, i) => 3000 + i)
    ]
    
    const uniquePorts = [...new Set(testPorts)]
    let available = 0
    let occupied = 0
    let reserved = 0
    
    for (const port of uniquePorts) {
      if (this.isPortReserved(port)) {
        reserved++
      } else if (await this.checkPortAvailability(port)) {
        available++
      } else {
        occupied++
      }
    }
    
    const recommendations: string[] = []
    
    if (available < 10) {
      recommendations.push('可用端口不足，建议清理无用进程')
    }
    
    if (occupied > available) {
      recommendations.push('端口占用率过高，建议优化端口分配策略')
    }
    
    return {
      totalChecked: uniquePorts.length,
      available,
      occupied,
      reserved,
      recommendations
    }
  }
}

// 创建智能端口分配器实例
export const smartPortAllocator = new SmartPortAllocator()
