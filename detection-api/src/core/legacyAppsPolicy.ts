export type LegacyAppsMode = 'enabled' | 'readonly' | 'disabled'

export const LEGACY_APPS_MODE_ENV = 'LEGACY_APPS_MODE'
export const LEGACY_APPS_DEFAULT_MODE: LegacyAppsMode = 'enabled'
export const LEGACY_APPS_MIGRATION_TARGET = '/api/v2/applications'
export const LEGACY_APPS_DEPRECATION_WARNING =
  'Legacy /api/apps endpoints are deprecated. Please migrate to /api/v2/applications.'

const VALID_LEGACY_APPS_MODES: ReadonlySet<string> = new Set(['enabled', 'readonly', 'disabled'])
const LEGACY_APPS_WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const resolveLegacyAppsMode = (input?: string | null): LegacyAppsMode => {
  const normalized = (input || '').trim().toLowerCase()
  if (!normalized) return LEGACY_APPS_DEFAULT_MODE

  if (VALID_LEGACY_APPS_MODES.has(normalized)) {
    return normalized as LegacyAppsMode
  }

  return LEGACY_APPS_DEFAULT_MODE
}

export const isLegacyAppsWriteMethod = (method?: string): boolean => {
  return LEGACY_APPS_WRITE_METHODS.has((method || '').trim().toUpperCase())
}

export const shouldBlockLegacyAppsRequest = (
  mode: LegacyAppsMode,
  method?: string
): 'disabled' | 'readonly' | null => {
  if (mode === 'disabled') return 'disabled'
  if (mode === 'readonly' && isLegacyAppsWriteMethod(method)) return 'readonly'
  return null
}

export const buildLegacyAppsDeprecationHeaders = (): Record<string, string> => ({
  'X-API-Deprecation-Warning': LEGACY_APPS_DEPRECATION_WARNING,
  'X-API-Migration-Target': LEGACY_APPS_MIGRATION_TARGET
})
