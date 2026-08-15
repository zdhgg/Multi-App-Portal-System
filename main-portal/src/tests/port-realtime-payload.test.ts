import { describe, expect, it } from 'vitest'
import { unwrapPortRealtimePayload } from '@/services/portManagementApi'

describe('port realtime payload compatibility', () => {
  it('uses the backend payload field', () => {
    expect(unwrapPortRealtimePayload({
      type: 'port_inventory_invalidated',
      payload: { reason: 'allocation' },
      timestamp: '2026-08-02T08:00:00.000Z'
    })).toEqual({ reason: 'allocation' })
  })

  it('keeps compatibility with legacy data messages', () => {
    expect(unwrapPortRealtimePayload({
      type: 'port_allocation',
      data: { port: 3001 },
      timestamp: Date.now()
    })).toEqual({ port: 3001 })
  })
})
