/**
 * SecurityAuditor - 安全审计与监控
 */

import { logger } from '../../utils/logger'

export interface SecurityEvent {
  timestamp: number
  type: 'auth' | 'filesystem' | 'sql' | 'config' | 'app'
  action: string
  success: boolean
  details?: Record<string, any>
  userId?: string
  sourceIp?: string
}

export class SecurityAuditor {
  private events: SecurityEvent[] = []

  record(event: SecurityEvent): void {
    this.events.push(event)
    // 控制内存
    if (this.events.length > 5000) this.events.splice(0, 500)
    // 同步到日志
    logger.info('SECURITY_EVENT', event)
  }

  query(filter?: Partial<SecurityEvent>): SecurityEvent[] {
    return this.events.filter(e => {
      if (!filter) return true
      return Object.entries(filter).every(([k, v]) => (e as any)[k] === v)
    })
  }

  stats(): {
    total: number
    byType: Record<string, number>
    successRate: number
  } {
    const total = this.events.length
    const byType: Record<string, number> = {}
    let success = 0
    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1
      if (e.success) success += 1
    }
    return { total, byType, successRate: total ? success / total : 0 }
  }
}

export const securityAuditor = new SecurityAuditor()

