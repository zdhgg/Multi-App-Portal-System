export type PathAccessSettingsModel = {
  allowWorkspaceParent: boolean
  allowedBasePaths: string[]
}

type BuildSystemSettingsPayloadInput = {
  serverSettings: any
  accountsUsers: any[]
  securitySettings: any
  pathAccessSettings: any
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

export const buildSystemSettingsPayload = ({
  serverSettings,
  accountsUsers,
  securitySettings,
  pathAccessSettings
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
    security: nextSecurity
  }
}
