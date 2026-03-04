import { describe, it, expect } from 'vitest'
import { LegacyUsageTracker } from '../legacyUsageTracker'

describe('LegacyUsageTracker', () => {
  it('aggregates usage by normalized path and method', () => {
    const tracker = new LegacyUsageTracker('2026-02-17T00:00:00.000Z')

    tracker.record('/apps/123/status', 'GET')
    tracker.record('/apps/456/status', 'GET')
    tracker.record('/apps/456/status', 'POST')

    const snapshot = tracker.snapshot()
    expect(snapshot.totalHits).toBe(3)
    expect(snapshot.byMethod.GET).toBe(2)
    expect(snapshot.byMethod.POST).toBe(1)
    expect(snapshot.byPath[0].path).toBe('/apps/:id/status')
    expect(snapshot.byPath[0].totalHits).toBe(3)
    expect(snapshot.byPath[0].methods.GET).toBe(2)
    expect(snapshot.byPath[0].methods.POST).toBe(1)
  })

  it('normalizes UUID-like segments and keeps static segments', () => {
    const tracker = new LegacyUsageTracker()

    tracker.record('/apps/550e8400-e29b-41d4-a716-446655440000/start', 'POST')
    tracker.record('/apps/stats/overview', 'GET')

    const snapshot = tracker.snapshot()
    const paths = snapshot.byPath.map(item => item.path)
    expect(paths).toContain('/apps/:id/start')
    expect(paths).toContain('/apps/stats/overview')
  })
})
