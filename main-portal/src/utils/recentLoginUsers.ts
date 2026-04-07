
export interface RecentLoginUserRecord {
  username: string
  updatedAt: number
}

export interface RecentLoginUserSuggestion {
  value: string
}

const SESSION_KEY = 'recent_login_usernames_session'
const PERSISTENT_KEY = 'recent_login_usernames_persistent'
export const MAX_RECENT_LOGIN_USERS = 5

const getStorage = (persistent: boolean): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return persistent ? window.localStorage : window.sessionStorage
}

const safeReadRaw = (storage: Storage | null, key: string): string | null => {
  if (!storage) {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

const safeWriteRaw = (storage: Storage | null, key: string, value: string): void => {
  if (!storage) {
    return
  }

  try {
    storage.setItem(key, value)
  } catch {
    // ignore storage write errors
  }
}

const safeRemoveRaw = (storage: Storage | null, key: string): void => {
  if (!storage) {
    return
  }

  try {
    storage.removeItem(key)
  } catch {
    // ignore storage remove errors
  }
}

const normalizeUsername = (value: unknown): string => String(value || '').trim()

const parseRecords = (rawValue: string | null): RecentLoginUserRecord[] => {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map(item => ({
        username: normalizeUsername(item?.username),
        updatedAt: Number(item?.updatedAt) || 0
      }))
      .filter(item => item.username.length > 0)
  } catch {
    return []
  }
}

const dedupeAndSortRecords = (records: RecentLoginUserRecord[]): RecentLoginUserRecord[] => {
  const latestByUsername = new Map<string, RecentLoginUserRecord>()

  for (const record of records) {
    const normalizedKey = record.username.toLowerCase()
    const existing = latestByUsername.get(normalizedKey)

    if (!existing || record.updatedAt >= existing.updatedAt) {
      latestByUsername.set(normalizedKey, record)
    }
  }

  return Array.from(latestByUsername.values())
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RECENT_LOGIN_USERS)
}

const readRecordsByStorage = (persistent: boolean): RecentLoginUserRecord[] => {
  const storage = getStorage(persistent)
  const storageKey = persistent ? PERSISTENT_KEY : SESSION_KEY
  return parseRecords(safeReadRaw(storage, storageKey))
}

const writeRecordsByStorage = (persistent: boolean, records: RecentLoginUserRecord[]): void => {
  const storage = getStorage(persistent)
  const storageKey = persistent ? PERSISTENT_KEY : SESSION_KEY

  if (records.length === 0) {
    safeRemoveRaw(storage, storageKey)
    return
  }

  safeWriteRaw(storage, storageKey, JSON.stringify(records.slice(0, MAX_RECENT_LOGIN_USERS)))
}

export const readRecentLoginUsernames = (): string[] => {
  const mergedRecords = dedupeAndSortRecords([
    ...readRecordsByStorage(false),
    ...readRecordsByStorage(true)
  ])

  return mergedRecords.map(record => record.username)
}

export const readRecentLoginUserSuggestions = (): RecentLoginUserSuggestion[] => {
  return readRecentLoginUsernames().map(username => ({ value: username }))
}

export const readMostRecentLoginUsername = (
  options: { persistentOnly?: boolean } = {}
): string | null => {
  const { persistentOnly = false } = options
  const records = persistentOnly
    ? readRecordsByStorage(true)
    : dedupeAndSortRecords([
        ...readRecordsByStorage(false),
        ...readRecordsByStorage(true)
      ])

  return records[0]?.username || null
}

export const saveRecentLoginUsername = (username: string, persistent: boolean): string[] => {
  const normalizedUsername = normalizeUsername(username)
  if (!normalizedUsername) {
    return readRecentLoginUsernames()
  }

  const currentRecords = readRecordsByStorage(persistent)
  const nextRecords = dedupeAndSortRecords([
    {
      username: normalizedUsername,
      updatedAt: Date.now()
    },
    ...currentRecords
  ])

  writeRecordsByStorage(persistent, nextRecords)
  return readRecentLoginUsernames()
}

export const clearRecentLoginUsernames = (): void => {
  safeRemoveRaw(getStorage(false), SESSION_KEY)
  safeRemoveRaw(getStorage(true), PERSISTENT_KEY)
}
