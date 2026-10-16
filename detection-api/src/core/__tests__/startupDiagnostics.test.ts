import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STARTUP_TIMEOUT_MS, resolveStartupTimeoutMs, StartupDiagnostics } from '../startupDiagnostics'
import { logger } from '../../utils/logger'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('startup diagnostics', () => {
  it('uses bounded per-app overrides before the portal default', () => {
    vi.stubEnv('PORTAL_STARTUP_TIMEOUT_MS', '200000')
    expect(resolveStartupTimeoutMs()).toBe(200000)
    expect(resolveStartupTimeoutMs({ PORTAL_STARTUP_TIMEOUT_MS: '240000' })).toBe(240000)
    for (const value of ['0', '-1', 'NaN', 'Infinity', '999999', '']) {
      expect(resolveStartupTimeoutMs({ PORTAL_STARTUP_TIMEOUT_MS: value })).toBe(DEFAULT_STARTUP_TIMEOUT_MS)
    }
  })

  it('samples only slow starts without overlapping and stops when ready', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(logger, 'info').mockImplementation(() => logger)
    let resolveSample!: (value: Record<string, unknown>) => void
    const sample = vi.fn(() => new Promise<Record<string, unknown>>(resolve => { resolveSample = resolve }))
    const diagnostics = new StartupDiagnostics('app-backend', 123, sample)
    await vi.advanceTimersByTimeAsync(29_000)
    expect(sample).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(31_000)
    expect(sample).toHaveBeenCalledTimes(1)
    diagnostics.finish('port_ready')
    resolveSample({ freeMemoryBytes: 100 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sample).toHaveBeenCalledTimes(1)
    expect((log.mock.calls as unknown[][]).some(([event]) => event === 'startup_resources')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('records each observed phase once and tolerates unavailable resource samples', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(logger, 'info').mockImplementation(() => logger)
    const diagnostics = new StartupDiagnostics('app-backend', 123, async () => { throw new Error('unavailable') })
    diagnostics.output('Starting Nest application')
    diagnostics.output('Starting Nest application')
    await vi.advanceTimersByTimeAsync(30_000)
    diagnostics.finish('exited')
    const calls = log.mock.calls as unknown as [string, { phase: string }][]
    expect(calls.filter(([, entry]) => entry.phase === 'first_output')).toHaveLength(1)
    expect(calls.some(([, entry]) => entry.phase === 'resource_sample_unavailable')).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
