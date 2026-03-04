/**
 * SqlSecurity - SQL注入防护
 * 适配SQLite/Better-SQLite3，提供查询安全检查和参数化校验
 */

import { logger } from '../../utils/logger'

export interface QueryCheckResult {
  safe: boolean
  errors: string[]
  warnings: string[]
}

const DANGEROUS_TOKENS = [
  /;\s*--/i,        // 语句结束+注释
  /\/\*/i,          // 多行注释开始
  /\*\//i,          // 多行注释结束
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bTRUNCATE\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bPRAGMA\b/i,
]

const MUTATING_VERBS = [/^\s*INSERT/i, /^\s*UPDATE/i, /^\s*DELETE/i]

export class SqlSecurity {
  // 简单查询白名单（可扩展）
  private readonly allowedTables = new Set<string>(['applications', 'users', 'ports', 'config'])

  checkParameterized(query: string, params?: any[]): QueryCheckResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!query || typeof query !== 'string') {
      return { safe: false, errors: ['查询不能为空'], warnings }
    }

    // 禁止拼接明显危险的token
    for (const t of DANGEROUS_TOKENS) {
      if (t.test(query)) {
        errors.push(`检测到潜在危险语句: ${t}`)
      }
    }

    // 确保使用参数占位符
    if (MUTATING_VERBS.some(v => v.test(query))) {
      if (!/[?@$:]/.test(query)) {
        errors.push('变更语句必须使用参数化占位符')
      }
    }

    // 基础表名白名单检查（仅对简单 FROM/INTO/UPDATE 语句尝试检查）
    const tableMatch = query.match(/\bFROM\s+([\w_]+)/i) || query.match(/\bINTO\s+([\w_]+)/i) || query.match(/\bUPDATE\s+([\w_]+)/i)
    if (tableMatch) {
      const table = tableMatch[1]
      if (!this.allowedTables.has(table)) {
        warnings.push(`访问了未在白名单中的表: ${table}`)
      }
    }

    return { safe: errors.length === 0, errors, warnings }
  }

  // 执行前检查（供调用方集成）
  enforceSafety(query: string, params?: any[]): void {
    const r = this.checkParameterized(query, params)
    if (!r.safe) {
      logger.warn('SQL安全检查未通过', { query, errors: r.errors, warnings: r.warnings })
      const err = new Error('SQL安全检查未通过: ' + r.errors.join('; '))
      ;(err as any).code = 'SQL_INJECTION_PREVENTED'
      throw err
    }
  }
}

export const sqlSecurity = new SqlSecurity()

