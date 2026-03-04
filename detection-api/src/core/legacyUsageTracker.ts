export interface LegacyUsagePathStat {
  path: string
  totalHits: number
  methods: Record<string, number>
  lastSeenAt: string
}

export interface LegacyUsageSnapshot {
  since: string
  totalHits: number
  byMethod: Record<string, number>
  byPath: LegacyUsagePathStat[]
}

interface MutableLegacyUsagePathStat {
  path: string
  totalHits: number
  methods: Map<string, number>
  lastSeenAt: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i
const INTEGER_PATTERN = /^\d+$/

export class LegacyUsageTracker {
  private readonly startedAt: string
  private totalHits = 0
  private readonly byMethod = new Map<string, number>()
  private readonly byPath = new Map<string, MutableLegacyUsagePathStat>()

  constructor(startedAt: string = new Date().toISOString()) {
    this.startedAt = startedAt
  }

  record(rawPath: string, method: string): void {
    const normalizedPath = this.normalizePath(rawPath)
    const normalizedMethod = (method || 'UNKNOWN').toUpperCase()
    const now = new Date().toISOString()

    this.totalHits += 1
    this.byMethod.set(normalizedMethod, (this.byMethod.get(normalizedMethod) || 0) + 1)

    const existing = this.byPath.get(normalizedPath)
    if (!existing) {
      this.byPath.set(normalizedPath, {
        path: normalizedPath,
        totalHits: 1,
        methods: new Map([[normalizedMethod, 1]]),
        lastSeenAt: now
      })
      return
    }

    existing.totalHits += 1
    existing.lastSeenAt = now
    existing.methods.set(normalizedMethod, (existing.methods.get(normalizedMethod) || 0) + 1)
  }

  snapshot(): LegacyUsageSnapshot {
    const byMethod: Record<string, number> = {}
    for (const [method, count] of this.byMethod.entries()) {
      byMethod[method] = count
    }

    const byPath = Array.from(this.byPath.values())
      .sort((a, b) => b.totalHits - a.totalHits)
      .map((item): LegacyUsagePathStat => {
        const methods: Record<string, number> = {}
        for (const [method, count] of item.methods.entries()) {
          methods[method] = count
        }

        return {
          path: item.path,
          totalHits: item.totalHits,
          methods,
          lastSeenAt: item.lastSeenAt
        }
      })

    return {
      since: this.startedAt,
      totalHits: this.totalHits,
      byMethod,
      byPath
    }
  }

  private normalizePath(rawPath: string): string {
    const safePath = (rawPath || '/apps').trim()
    const segments = safePath
      .split('/')
      .filter(Boolean)
      .map(segment => this.normalizeSegment(segment))

    if (segments.length === 0) return '/apps'
    return `/${segments.join('/')}`
  }

  private normalizeSegment(segment: string): string {
    if (INTEGER_PATTERN.test(segment)) return ':id'
    if (UUID_PATTERN.test(segment)) return ':id'
    if (OBJECT_ID_PATTERN.test(segment)) return ':id'

    return segment
  }
}
