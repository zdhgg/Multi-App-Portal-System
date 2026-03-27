export type PathAccessSettingsModel = {
  allowWorkspaceParent: boolean
  allowedBasePaths: string[]
}

export type BackupSettingsModel = {
  enableAutoBackup: boolean
  backupInterval: 'hourly' | 'daily' | 'weekly' | 'monthly'
  backupTime: string
  retentionDays: number
  includeUserData: boolean
  includeLogs: boolean
  compressionEnabled: boolean
  backupPath: string
}

type BuildSystemSettingsPayloadInput = {
  serverSettings: any
  accountsUsers: any[]
  securitySettings: any
  pathAccessSettings: any
  backupSettings: any
}

const cloneJson = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value
  }

  return JSON.parse(JSON.stringify(value)) as T
}

export const normalizePathAccessSettings = (value: any): PathAccessSettingsModel => ({
  allowWorkspaceParent: Boolean(value?.allowWorkspaceParent),
  allowedBasePaths: Array.isArray(value?.allowedBasePaths)
    ? value.allowedBasePaths
        .map((item: unknown) => String(item).trim())
        .filter((item: string) => item.length > 0)
    : []
})

const allowedBackupIntervals = new Set(['hourly', 'daily', 'weekly', 'monthly'])

const normalizeBooleanWithDefault = (value: unknown, defaultValue: boolean): boolean => {
  if (value === undefined || value === null) {
    return defaultValue
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true
    if (['false', '0', 'no', 'off'].includes(normalized)) return false
  }

  return Boolean(value)
}

export const normalizeBackupSettings = (value: any): BackupSettingsModel => {
  const backupTime = typeof value?.backupTime === 'string' && /^\d{2}:\d{2}$/.test(value.backupTime.trim())
    ? value.backupTime.trim()
    : '02:00'

  const retentionDays = Number.isFinite(Number(value?.retentionDays))
    ? Math.max(1, Math.min(365, Math.round(Number(value.retentionDays))))
    : 30

  const backupInterval = typeof value?.backupInterval === 'string' && allowedBackupIntervals.has(value.backupInterval)
    ? value.backupInterval
    : 'daily'

  return {
    enableAutoBackup: normalizeBooleanWithDefault(value?.enableAutoBackup, true),
    backupInterval,
    backupTime,
    retentionDays,
    includeUserData: normalizeBooleanWithDefault(value?.includeUserData, true),
    includeLogs: normalizeBooleanWithDefault(value?.includeLogs, false),
    compressionEnabled: normalizeBooleanWithDefault(value?.compressionEnabled, true),
    backupPath: typeof value?.backupPath === 'string' && value.backupPath.trim().length > 0
      ? value.backupPath.trim()
      : './backups'
  }
}

export const buildSystemSettingsPayload = ({
  serverSettings,
  accountsUsers,
  securitySettings,
  pathAccessSettings,
  backupSettings
}: BuildSystemSettingsPayloadInput) => {
  const baseSettings = cloneJson(serverSettings) || {}
  const nextSecurity = {
    ...(baseSettings.security || {}),
    ...(cloneJson(securitySettings) || {}),
    pathAccess: normalizePathAccessSettings(pathAccessSettings)
  }

  return {
    ...baseSettings,
    accounts: {
      ...(baseSettings.accounts || {}),
      users: cloneJson(Array.isArray(accountsUsers) ? accountsUsers : [])
    },
    security: nextSecurity,
    backup: normalizeBackupSettings(backupSettings)
  }
}
