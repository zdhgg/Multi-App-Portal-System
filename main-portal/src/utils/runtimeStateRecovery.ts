export interface RuntimeStateSnapshot {
  status?: string
  isRunning?: boolean
}

export interface RuntimeStateRecoveryResult<T extends RuntimeStateSnapshot> {
  app: T | null
  syncError?: unknown
  lookupError?: unknown
}

interface ApplicationResponse<T> {
  success?: boolean
  data?: T
}

export async function syncRunningApplicationState<T extends RuntimeStateSnapshot>(
  syncRuntimeState: () => Promise<unknown>,
  getApplication: () => Promise<ApplicationResponse<T>>
): Promise<RuntimeStateRecoveryResult<T>> {
  let syncError: unknown

  try {
    await syncRuntimeState()
  } catch (error) {
    syncError = error
  }

  try {
    const response = await getApplication()
    const app = response?.success !== false ? response?.data : undefined
    const isRunning =
      app?.isRunning === true || String(app?.status || '').toLowerCase() === 'online'

    return {
      app: app && isRunning ? app : null,
      ...(syncError ? { syncError } : {})
    }
  } catch (lookupError) {
    return {
      app: null,
      ...(syncError ? { syncError } : {}),
      lookupError
    }
  }
}
