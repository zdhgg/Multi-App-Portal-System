import { describe, it, expect } from 'vitest'

type Role = 'admin' | 'operator' | 'guest'

interface AuthContext {
  role: Role
  isActive: boolean
  isAuthenticated: boolean
}

interface AppTypeInfo {
  isFrontend: boolean
}

function hasPermission(ctx: AuthContext, requiredRole: 'admin' | 'operator' | 'guest'): boolean {
  if (!ctx.isAuthenticated) return requiredRole === 'guest'
  if (requiredRole === 'admin') return ctx.role === 'admin' && ctx.isActive
  if (requiredRole === 'operator') return ctx.isActive && (ctx.role === 'operator' || ctx.role === 'admin')
  return true
}

// Mirrors main-portal/src/views/Management.vue hasOperationPermission logic.
function hasOperationPermission(ctx: AuthContext, operation: string): boolean {
  const dangerousOperations = ['delete', 'force-stop', 'reset-config']
  if (dangerousOperations.includes(operation)) {
    return hasPermission(ctx, 'admin')
  }

  if (['create', 'config', 'edit-appearance', 'pm2-management', 'deployment-config'].includes(operation)) {
    return hasPermission(ctx, 'operator')
  }

  if (['build-analyze', 'build-execute', 'folder'].includes(operation)) {
    return hasPermission(ctx, 'operator')
  }

  if (['start', 'stop', 'restart', 'reload'].includes(operation)) {
    return hasPermission(ctx, 'operator')
  }

  if (['logs', 'info', 'status'].includes(operation)) {
    return ctx.isAuthenticated
  }

  return true
}

function canShowMoreActions(ctx: AuthContext, typeInfo: AppTypeInfo): boolean {
  const canBuild = typeInfo.isFrontend && hasOperationPermission(ctx, 'build-analyze')
  return (
    hasOperationPermission(ctx, 'config') ||
    hasOperationPermission(ctx, 'edit-appearance') ||
    hasOperationPermission(ctx, 'folder') ||
    canBuild
  )
}

describe('Management Unified View Permissions', () => {
  const adminCtx: AuthContext = { role: 'admin', isActive: true, isAuthenticated: true }
  const operatorCtx: AuthContext = { role: 'operator', isActive: true, isAuthenticated: true }
  const guestCtx: AuthContext = { role: 'guest', isActive: true, isAuthenticated: false }
  const inactiveOperatorCtx: AuthContext = { role: 'operator', isActive: false, isAuthenticated: true }

  it('admin should have create/start/stop/delete permissions', () => {
    expect(hasOperationPermission(adminCtx, 'create')).toBe(true)
    expect(hasOperationPermission(adminCtx, 'start')).toBe(true)
    expect(hasOperationPermission(adminCtx, 'stop')).toBe(true)
    expect(hasOperationPermission(adminCtx, 'delete')).toBe(true)
  })

  it('operator should have create/start/stop but not delete permission', () => {
    expect(hasOperationPermission(operatorCtx, 'create')).toBe(true)
    expect(hasOperationPermission(operatorCtx, 'start')).toBe(true)
    expect(hasOperationPermission(operatorCtx, 'stop')).toBe(true)
    expect(hasOperationPermission(operatorCtx, 'delete')).toBe(false)
  })

  it('guest should not have create/start/stop/delete permissions', () => {
    expect(hasOperationPermission(guestCtx, 'create')).toBe(false)
    expect(hasOperationPermission(guestCtx, 'start')).toBe(false)
    expect(hasOperationPermission(guestCtx, 'stop')).toBe(false)
    expect(hasOperationPermission(guestCtx, 'delete')).toBe(false)
  })

  it('inactive operator should not have operator-level permissions', () => {
    expect(hasOperationPermission(inactiveOperatorCtx, 'create')).toBe(false)
    expect(hasOperationPermission(inactiveOperatorCtx, 'start')).toBe(false)
    expect(hasOperationPermission(inactiveOperatorCtx, 'folder')).toBe(false)
  })

  it('more-actions menu should be shown for operator/admin and hidden for guest', () => {
    expect(canShowMoreActions(adminCtx, { isFrontend: true })).toBe(true)
    expect(canShowMoreActions(operatorCtx, { isFrontend: false })).toBe(true)
    expect(canShowMoreActions(guestCtx, { isFrontend: true })).toBe(false)
  })

  it('build actions should require frontend app and operator-level permission', () => {
    expect(canShowMoreActions(operatorCtx, { isFrontend: true })).toBe(true)
    expect(hasOperationPermission(operatorCtx, 'build-analyze')).toBe(true)
    expect(hasOperationPermission(guestCtx, 'build-analyze')).toBe(false)
  })
})

