// @ts-ignore - vue-router types may vary between versions
import type { RouteLocationNormalized, NavigationGuardNext } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

// 权限检查结果类型
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  redirectTo?: string
  redirectQuery?: Record<string, any>
}

// 路由守卫工具类
export class RouteGuardUtils {
  
  /**
   * 检查基础认证权限
   */
  static checkAuthentication(
    to: RouteLocationNormalized, 
    authStore: ReturnType<typeof useAuthStore>
  ): PermissionCheckResult {
    const requiresAuth = to.meta?.requiresAuth === true
    const allowGuests = to.meta?.allowGuests === true

    // 如果路由允许访客或不需要认证，直接允许
    if (!requiresAuth || allowGuests) {
      return { allowed: true }
    }

    // 检查用户是否已认证
    if (!authStore.isAuthenticated) {
      return {
        allowed: false,
        reason: 'authentication_required',
        redirectTo: '/portal',
        redirectQuery: {
          redirect: to.fullPath,
          authRequired: 'true'
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查管理员权限
   */
  static checkAdminPermission(
    to: RouteLocationNormalized,
    authStore: ReturnType<typeof useAuthStore>
  ): PermissionCheckResult {
    const requiresAdmin = to.meta?.requiresAdmin === true

    if (!requiresAdmin) {
      return { allowed: true }
    }

    if (!authStore.isAdmin) {
      return {
        allowed: false,
        reason: 'admin_permission_required',
        redirectTo: '/unauthorized',
        redirectQuery: {
          from: to.fullPath
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查运维权限
   */
  static checkOperatorPermission(
    to: RouteLocationNormalized,
    authStore: ReturnType<typeof useAuthStore>
  ): PermissionCheckResult {
    const requiresOperator = to.meta?.requiresOperator === true

    if (!requiresOperator) {
      return { allowed: true }
    }

    // operator 或 admin 都可以访问
    if (!authStore.isOperator && !authStore.isAdmin) {
      return {
        allowed: false,
        reason: 'operator_permission_required',
        redirectTo: '/unauthorized',
        redirectQuery: {
          from: to.fullPath
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查用户账户状态
   */
  static checkAccountStatus(
    authStore: ReturnType<typeof useAuthStore>
  ): PermissionCheckResult {
    if (authStore.user && !authStore.user.is_active) {
      return {
        allowed: false,
        reason: 'account_disabled',
        redirectTo: '/portal',
        redirectQuery: {
          message: 'account_disabled'
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查特定权限
   */
  static checkSpecificPermissions(
    to: RouteLocationNormalized,
    authStore: ReturnType<typeof useAuthStore>
  ): PermissionCheckResult {
    const requiredPermissions = to.meta?.permissions as string[] || []
    const requiredRoles = to.meta?.roles as string[] || []

    // 检查权限
    if (requiredPermissions.length > 0) {
      // 这里可以扩展具体的权限检查逻辑
      // 目前基于角色进行简单检查
      if (!authStore.hasPermission('admin') && requiredPermissions.includes('admin')) {
        return {
          allowed: false,
          reason: 'insufficient_permissions',
          redirectTo: '/unauthorized',
          redirectQuery: {
            from: to.fullPath,
            required: requiredPermissions.join(',')
          }
        }
      }
    }

    // 检查角色
    if (requiredRoles.length > 0) {
      const userRole = authStore.user?.role || 'guest'
      if (!requiredRoles.includes(userRole)) {
        return {
          allowed: false,
          reason: 'insufficient_role',
          redirectTo: '/unauthorized',
          redirectQuery: {
            from: to.fullPath,
            requiredRole: requiredRoles.join(',')
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查token状态
   */
  static async checkTokenStatus(
    authStore: ReturnType<typeof useAuthStore>
  ): Promise<PermissionCheckResult> {
    // 如果token即将过期，尝试刷新
    if (authStore.isTokenExpiringSoon && authStore.refreshToken) {
      try {
        await authStore.refreshAccessToken()
      } catch (error) {
        console.error('Token刷新失败:', error)
        return {
          allowed: false,
          reason: 'token_refresh_failed',
          redirectTo: '/portal',
          redirectQuery: {
            message: 'token_expired'
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 综合权限检查
   */
  static async checkAllPermissions(
    to: RouteLocationNormalized,
    authStore: ReturnType<typeof useAuthStore>
  ): Promise<PermissionCheckResult> {
    // 优先检查：对于明确允许访客访问的路由，直接允许通过
    // 这样可以避免对匿名用户进行不必要的认证检查
    if (to.meta?.allowGuests === true && !to.meta?.requiresAuth) {
      return { allowed: true }
    }

    // 按顺序进行各项检查

    // 1. 检查基础认证
    const authCheck = this.checkAuthentication(to, authStore)
    if (!authCheck.allowed) return authCheck

    // 只有在用户已认证的情况下，才进行后续的认证相关检查
    if (authStore.isAuthenticated && authStore.user) {
      // 2. 检查账户状态（仅对已认证用户）
      const accountCheck = this.checkAccountStatus(authStore)
      if (!accountCheck.allowed) return accountCheck

      // 3. 检查token状态
      const tokenCheck = await this.checkTokenStatus(authStore)
      if (!tokenCheck.allowed) return tokenCheck

      // 4. 检查管理员权限
      const adminCheck = this.checkAdminPermission(to, authStore)
      if (!adminCheck.allowed) return adminCheck

      // 5. 检查运维权限
      const operatorCheck = this.checkOperatorPermission(to, authStore)
      if (!operatorCheck.allowed) return operatorCheck

      // 6. 检查特定权限
      const permissionCheck = this.checkSpecificPermissions(to, authStore)
      if (!permissionCheck.allowed) return permissionCheck
    }

    return { allowed: true }
  }

  /**
   * 处理权限检查失败
   */
  static handlePermissionFailure(
    result: PermissionCheckResult,
    next: NavigationGuardNext
  ): void {
    const messages: Record<string, string> = {
      authentication_required: '请先登录',
      admin_permission_required: '需要管理员权限才能访问此页面',
      account_disabled: '您的账户已被禁用',
      token_refresh_failed: '登录已过期，请重新登录',
      insufficient_permissions: '权限不足，无法访问此页面',
      insufficient_role: '您的角色权限不足，无法访问此页面'
    }

    const message = messages[result.reason || 'unknown'] || '访问被拒绝'
    
    if (result.reason === 'authentication_required') {
      ElMessage.warning(message)
    } else {
      ElMessage.error(message)
    }

    if (result.redirectTo) {
      next({
        path: result.redirectTo,
        query: result.redirectQuery
      })
    } else {
      next(false) // 阻止导航
    }
  }

  /**
   * 记录访问日志
   */
  static logAccess(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    authStore: ReturnType<typeof useAuthStore>,
    result: PermissionCheckResult
  ): void {
    // 调试：检查用户对象结构
    console.log('路由守卫用户对象检查:', {
      hasUser: !!authStore.user,
      userType: typeof authStore.user,
      userKeys: authStore.user ? Object.keys(authStore.user) : []
    })

    // 安全地获取用户信息，处理Proxy对象
    const getUserInfo = () => {
      if (!authStore.user) return { username: 'anonymous', role: 'guest' }
      
      // 处理Proxy对象，尝试多种方式获取属性
      try {
        // 方法1：直接访问
        if (authStore.user.username && authStore.user.role) {
          return { username: authStore.user.username, role: authStore.user.role }
        }
        
        // 方法2：使用JSON序列化再解析（避免Proxy）
        const userStr = JSON.stringify(authStore.user)
        const userObj = JSON.parse(userStr)
        if (userObj.username && userObj.role) {
          return { username: userObj.username, role: userObj.role }
        }
        
        // 方法3：遍历属性
        for (const key in authStore.user) {
          if (key === 'username' || key === 'role') {
            const value = authStore.user[key]
            if (value) {
              if (key === 'username') {
                return { username: value, role: authStore.user.role || 'guest' }
              } else if (key === 'role') {
                return { username: authStore.user.username || 'anonymous', role: value }
              }
            }
          }
        }
      } catch (error) {
        console.warn('获取用户信息失败:', error)
      }
      
      return { username: 'anonymous', role: 'guest' }
    }
    
    const userInfo = getUserInfo()
    
    const logData = {
      path: to.fullPath,
      from: from.fullPath,
      user: userInfo.username,
      role: userInfo.role,
      allowed: result.allowed,
      reason: result.reason,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ip: 'unknown', // 在实际应用中可以从后端获取
      // 添加更多调试信息
      routeMeta: {
        requiresAuth: to.meta?.requiresAuth,
        allowGuests: to.meta?.allowGuests,
        requiresAdmin: to.meta?.requiresAdmin
      },
      authState: {
        isAuthenticated: authStore.isAuthenticated,
        hasUser: !!authStore.user,
        userActive: authStore.user?.is_active,
        hasToken: !!localStorage.getItem('auth_token'),
        storeInitialized: authStore.isInitialized,
        storeUser: authStore.user,
        storeAuthState: authStore.isAuthenticated
      }
    }

    if (result.allowed) {
      console.log('Route access granted:', logData)
    } else {
      console.warn('Route access denied:', logData)

      // 对于匿名用户被拒绝访问允许访客的路由，记录特殊警告
      if (logData.user === 'anonymous' && to.meta?.allowGuests === true) {
        console.error('CRITICAL: Anonymous user denied access to guest-allowed route!', {
          ...logData,
          possibleCauses: [
            'Cached disabled user data in localStorage',
            'Authentication state initialization timing issue',
            'Permission check logic error'
          ]
        })
      }
    }

    // 可以发送到后端进行审计日志记录
    // this.sendAuditLog(logData)
  }

  /**
   * 发送审计日志到后端
   */
  static async sendAuditLog(logData: any): Promise<void> {
    try {
      // 这里可以调用API服务发送日志
      // await auditApiService.logAccess(logData)
    } catch (error) {
      console.error('Failed to send audit log:', error)
    }
  }
}

// 导出便捷函数
export const checkRoutePermissions = RouteGuardUtils.checkAllPermissions.bind(RouteGuardUtils)
export const handlePermissionFailure = RouteGuardUtils.handlePermissionFailure.bind(RouteGuardUtils)
export const logRouteAccess = RouteGuardUtils.logAccess.bind(RouteGuardUtils)