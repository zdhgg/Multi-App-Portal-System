
const REMEMBER_ME_PREFERENCE_KEY = 'remember_me_preference'
const DEFAULT_REMEMBER_ME = true

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

export const readRememberMePreference = (): boolean => {
  const storage = getStorage()
  if (!storage) {
    return DEFAULT_REMEMBER_ME
  }

  try {
    const rawValue = storage.getItem(REMEMBER_ME_PREFERENCE_KEY)
    if (rawValue === null) {
      return DEFAULT_REMEMBER_ME
    }

    return rawValue === 'true'
  } catch {
    return DEFAULT_REMEMBER_ME
  }
}

export const saveRememberMePreference = (rememberMe: boolean): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(REMEMBER_ME_PREFERENCE_KEY, String(rememberMe))
  } catch {
    // ignore storage write errors
  }
}

export const clearRememberMePreference = (): void => {
  const storage = getStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(REMEMBER_ME_PREFERENCE_KEY)
  } catch {
    // ignore storage remove errors
  }
}
