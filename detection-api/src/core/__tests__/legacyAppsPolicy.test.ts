import { describe, it, expect } from 'vitest'
import {
  buildLegacyAppsDeprecationHeaders,
  resolveLegacyAppsMode,
  shouldBlockLegacyAppsRequest
} from '../legacyAppsPolicy'

describe('legacyAppsPolicy', () => {
  it('resolves valid modes and falls back to enabled for invalid input', () => {
    expect(resolveLegacyAppsMode('enabled')).toBe('enabled')
    expect(resolveLegacyAppsMode('readonly')).toBe('readonly')
    expect(resolveLegacyAppsMode('disabled')).toBe('disabled')
    expect(resolveLegacyAppsMode('unknown')).toBe('enabled')
    expect(resolveLegacyAppsMode(undefined)).toBe('enabled')
  })

  it('blocks all methods when mode is disabled', () => {
    expect(shouldBlockLegacyAppsRequest('disabled', 'GET')).toBe('disabled')
    expect(shouldBlockLegacyAppsRequest('disabled', 'POST')).toBe('disabled')
  })

  it('blocks only write methods in readonly mode', () => {
    expect(shouldBlockLegacyAppsRequest('readonly', 'GET')).toBeNull()
    expect(shouldBlockLegacyAppsRequest('readonly', 'HEAD')).toBeNull()
    expect(shouldBlockLegacyAppsRequest('readonly', 'POST')).toBe('readonly')
    expect(shouldBlockLegacyAppsRequest('readonly', 'PUT')).toBe('readonly')
    expect(shouldBlockLegacyAppsRequest('readonly', 'PATCH')).toBe('readonly')
    expect(shouldBlockLegacyAppsRequest('readonly', 'DELETE')).toBe('readonly')
  })

  it('returns deprecation headers with migration target', () => {
    const headers = buildLegacyAppsDeprecationHeaders()
    expect(headers['X-API-Deprecation-Warning']).toContain('/api/apps')
    expect(headers['X-API-Migration-Target']).toBe('/api/v2/applications')
  })
})
