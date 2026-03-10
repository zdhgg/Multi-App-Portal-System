const TRUTHY_VALUES = ['1', 'true', 'on', 'yes']
const FALSY_VALUES = ['0', 'false', 'off', 'no']

const parseBooleanFlag = (value: unknown): boolean | null => {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const normalizedValue = String(value).trim().toLowerCase()
  if (TRUTHY_VALUES.includes(normalizedValue)) {
    return true
  }

  if (FALSY_VALUES.includes(normalizedValue)) {
    return false
  }

  return null
}

const resolveRuntimeFlag = (queryKey: string, storageKey: string): boolean | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const queryParams = new URLSearchParams(window.location.search)
    const queryFlag = parseBooleanFlag(queryParams.get(queryKey))
    if (queryFlag !== null) {
      return queryFlag
    }

    const storageFlag = parseBooleanFlag(window.localStorage.getItem(storageKey))
    if (storageFlag !== null) {
      return storageFlag
    }
  } catch {
    return null
  }

  return null
}

export const isDebugToolsEnabled = (): boolean => {
  if (!import.meta.env.DEV) {
    return false
  }

  const envFlag = parseBooleanFlag((import.meta as any).env?.VITE_ENABLE_DEBUG_TOOLS)
  if (envFlag !== null) {
    return envFlag
  }

  const runtimeFlag = resolveRuntimeFlag('debugTools', 'portal:debug-tools')
  if (runtimeFlag !== null) {
    return runtimeFlag
  }

  return false
}

export const isVerboseRouteLoggingEnabled = (): boolean => {
  if (!import.meta.env.DEV) {
    return false
  }

  const envFlag = parseBooleanFlag((import.meta as any).env?.VITE_VERBOSE_ROUTE_LOGS)
  if (envFlag !== null) {
    return envFlag
  }

  const runtimeFlag = resolveRuntimeFlag('routeDebug', 'portal:route-debug')
  if (runtimeFlag !== null) {
    return runtimeFlag
  }

  return isDebugToolsEnabled()
}

export const isVerboseAppLoggingEnabled = (): boolean => {
  if (!import.meta.env.DEV) {
    return false
  }

  const envFlag = parseBooleanFlag((import.meta as any).env?.VITE_VERBOSE_APP_LOGS)
  if (envFlag !== null) {
    return envFlag
  }

  const runtimeFlag = resolveRuntimeFlag('appDebug', 'portal:app-debug')
  if (runtimeFlag !== null) {
    return runtimeFlag
  }

  return isDebugToolsEnabled()
}

export const debugLog = (...args: unknown[]): void => {
  if (isVerboseAppLoggingEnabled()) {
    console.log(...args)
  }
}

export const debugInfo = (...args: unknown[]): void => {
  if (isVerboseAppLoggingEnabled()) {
    console.info(...args)
  }
}

export const debugWarn = (...args: unknown[]): void => {
  if (isVerboseAppLoggingEnabled()) {
    console.warn(...args)
  }
}
