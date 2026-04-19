export const AUTH_INVALIDATION_EVENT = 'auth:token-invalid'

export interface AuthInvalidationDetail {
  source?: string
  message?: string
  redirectTo?: string
  redirectQuery?: Record<string, string>
}

interface AuthInvalidationHandlerDeps {
  authStore: {
    logout: (showMessage?: boolean, revokeServerSession?: boolean) => Promise<void> | void
  }
  router: {
    currentRoute: {
      value: {
        path: string
        query?: Record<string, unknown>
      }
    }
    replace: (location: { path: string; query?: Record<string, string> }) => Promise<unknown> | unknown
  }
}

export const dispatchAuthInvalidation = (detail: AuthInvalidationDetail = {}): void => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<AuthInvalidationDetail>(AUTH_INVALIDATION_EVENT, { detail }))
}

export const registerAuthInvalidationHandler = ({
  authStore,
  router
}: AuthInvalidationHandlerDeps): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let isHandlingInvalidation = false
  let lastHandledAt = 0

  const handleInvalidation = async (event: Event) => {
    const detail = (event as CustomEvent<AuthInvalidationDetail>).detail || {}
    const now = Date.now()

    if (isHandlingInvalidation || now - lastHandledAt < 300) {
      return
    }

    isHandlingInvalidation = true
    lastHandledAt = now

    try {
      await authStore.logout(false, false)

      const targetPath = detail.redirectTo || '/portal'
      const targetQuery = detail.redirectQuery
      const currentRoute = router.currentRoute.value
      const currentQuery = currentRoute.query || {}
      const samePath = currentRoute.path === targetPath
      const sameQuery = JSON.stringify(currentQuery) === JSON.stringify(targetQuery || {})

      if (!samePath || !sameQuery) {
        await router.replace({
          path: targetPath,
          query: targetQuery
        })
      }
    } finally {
      queueMicrotask(() => {
        isHandlingInvalidation = false
      })
    }
  }

  window.addEventListener(AUTH_INVALIDATION_EVENT, handleInvalidation as EventListener)

  return () => {
    window.removeEventListener(AUTH_INVALIDATION_EVENT, handleInvalidation as EventListener)
  }
}
