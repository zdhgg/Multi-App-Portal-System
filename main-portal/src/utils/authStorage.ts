export type AuthStorageMode = 'persistent' | 'session'

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'user_info'
const STORAGE_MODE_KEY = 'auth_storage_mode'

interface StorageRecord {
  mode: AuthStorageMode
  storage: Storage
}

export interface StoredAuthData<TUser = unknown> {
  storageMode: AuthStorageMode | null
  rememberMe: boolean
  accessToken: string | null
  refreshToken: string | null
  userData: TUser | null
  userDataRaw: string | null
}

const getStorages = (): StorageRecord[] => {
  if (typeof window === 'undefined') {
    return []
  }

  return [
    { mode: 'session', storage: window.sessionStorage },
    { mode: 'persistent', storage: window.localStorage }
  ]
}

const safeGetItem = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const safeSetItem = (storage: Storage, key: string, value: string): void => {
  try {
    storage.setItem(key, value)
  } catch {
    // ignore storage write errors
  }
}

const safeRemoveItem = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key)
  } catch {
    // ignore storage remove errors
  }
}

const getStorageRecordByMode = (mode: AuthStorageMode): StorageRecord | null => {
  return getStorages().find(record => record.mode === mode) || null
}

const resolveActiveStorageRecord = (): StorageRecord | null => {
  const storages = getStorages()

  for (const record of storages) {
    if (safeGetItem(record.storage, STORAGE_MODE_KEY) === record.mode && safeGetItem(record.storage, TOKEN_KEY)) {
      return record
    }
  }

  for (const record of storages) {
    if (safeGetItem(record.storage, TOKEN_KEY)) {
      return record
    }
  }

  return null
}

export const clearStoredAuthData = (): void => {
  for (const { storage } of getStorages()) {
    safeRemoveItem(storage, TOKEN_KEY)
    safeRemoveItem(storage, REFRESH_TOKEN_KEY)
    safeRemoveItem(storage, USER_KEY)
    safeRemoveItem(storage, STORAGE_MODE_KEY)
  }
}

export const saveStoredAuthData = <TUser = unknown>(
  tokens: { accessToken: string; refreshToken: string },
  userData: TUser,
  rememberMe: boolean
): void => {
  clearStoredAuthData()

  const record = getStorageRecordByMode(rememberMe ? 'persistent' : 'session')
  if (!record) {
    return
  }

  safeSetItem(record.storage, TOKEN_KEY, tokens.accessToken)
  safeSetItem(record.storage, REFRESH_TOKEN_KEY, tokens.refreshToken)
  safeSetItem(record.storage, USER_KEY, JSON.stringify(userData))
  safeSetItem(record.storage, STORAGE_MODE_KEY, record.mode)
}

export const updateStoredTokens = (tokens: { accessToken?: string | null; refreshToken?: string | null }): void => {
  const record = resolveActiveStorageRecord()
  if (!record) {
    return
  }

  safeSetItem(record.storage, STORAGE_MODE_KEY, record.mode)

  if (tokens.accessToken !== undefined) {
    if (tokens.accessToken === null) {
      safeRemoveItem(record.storage, TOKEN_KEY)
    } else {
      safeSetItem(record.storage, TOKEN_KEY, tokens.accessToken)
    }
  }

  if (tokens.refreshToken !== undefined) {
    if (tokens.refreshToken === null) {
      safeRemoveItem(record.storage, REFRESH_TOKEN_KEY)
    } else {
      safeSetItem(record.storage, REFRESH_TOKEN_KEY, tokens.refreshToken)
    }
  }
}

export const updateStoredUserData = <TUser = unknown>(userData: TUser | null): void => {
  const record = resolveActiveStorageRecord()
  if (!record) {
    return
  }

  safeSetItem(record.storage, STORAGE_MODE_KEY, record.mode)

  if (userData === null) {
    safeRemoveItem(record.storage, USER_KEY)
    return
  }

  safeSetItem(record.storage, USER_KEY, JSON.stringify(userData))
}

export const readStoredAuthData = <TUser = unknown>(): StoredAuthData<TUser> => {
  const record = resolveActiveStorageRecord()
  if (!record) {
    return {
      storageMode: null,
      rememberMe: false,
      accessToken: null,
      refreshToken: null,
      userData: null,
      userDataRaw: null
    }
  }

  const accessToken = safeGetItem(record.storage, TOKEN_KEY)
  const refreshToken = safeGetItem(record.storage, REFRESH_TOKEN_KEY)
  const userDataRaw = safeGetItem(record.storage, USER_KEY)

  let userData: TUser | null = null
  if (userDataRaw) {
    try {
      userData = JSON.parse(userDataRaw) as TUser
    } catch {
      userData = null
    }
  }

  return {
    storageMode: record.mode,
    rememberMe: record.mode === 'persistent',
    accessToken,
    refreshToken,
    userData,
    userDataRaw
  }
}

export const getStoredAccessToken = (): string | null => readStoredAuthData().accessToken
export const getStoredRefreshToken = (): string | null => readStoredAuthData().refreshToken
export const getStoredUserData = <TUser = unknown>(): TUser | null => readStoredAuthData<TUser>().userData
export const hasStoredAccessToken = (): boolean => !!getStoredAccessToken()
export const getStoredAuthMode = (): AuthStorageMode | null => readStoredAuthData().storageMode
