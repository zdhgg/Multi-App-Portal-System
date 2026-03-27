// @ts-ignore - shim for environments where vue-router types aren't resolved
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { isVerboseRouteLoggingEnabled } from '@/utils/debugControl'
import '@/types/router' // 导入路由类型声明

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/portal'
    },
    {
      path: '/portal',
      name: 'portal',
      component: () => import('@/views/Portal.vue'),
      meta: {
        title: '应用门户',
        requiresAuth: false, // 公开访问
        allowGuests: true
      }
    },
    // 管理后台路由组 - 使用AdminLayout布局
    // Phase 1 RBAC: /admin 仅管理员可访问
    {
      path: '/admin',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true  // 仅admin
      },
      children: [
        {
          path: '',
          name: 'admin',
          component: () => import('@/views/SystemSettings.vue'),
          meta: {
            title: '系统设置',
            description: '统一管理用户、安全、日志与备份配置'
          }
        },
        {
          path: 'port-config',
          name: 'admin-port-config',
          redirect: '/ports'
        }
      ]
    },
    // Phase 1 RBAC: /detection operator可访问
    {
      path: '/detection',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresOperator: true  // operator+admin 可访问
      },
      children: [
        {
          path: '',
          name: 'detection',
          component: () => import('@/views/Detection.vue'),
          meta: {
            title: '应用检测',
            description: '智能检测Web应用项目'
          }
        }
      ]
    },
    // Phase 1 RBAC: /management operator可访问（操作类，配置类由后端控制）
    {
      path: '/management',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresOperator: true  // operator+admin 可访问
      },
      children: [
        {
          path: '',
          name: 'management',
          component: () => import('@/views/Management.vue'),
          meta: {
            title: '应用管理',
            description: '统一查看应用状态、运行控制与配置入口'
          }
        },
        {
          path: 'build-test',
          name: 'build-analysis-test',
          component: () => import('@/views/BuildAnalysisTest.vue'),
          meta: {
            title: '构建分析测试',
            description: '测试构建分析模态框显示效果'
          }
        }
      ]
    },
    // Phase 1 RBAC: /pm2 operator可只读访问
    {
      path: '/pm2',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresOperator: true  // operator+admin 可访问（operator只读，由后端控制）
      },
      children: [
        {
          path: '',
          name: 'pm2-management',
          component: () => import('@/views/PM2Management.vue'),
          meta: {
            title: 'PM2进程管理',
            description: '统一查看守护状态、进程运行与生命周期操作'
          }
        }
      ]
    },
    // Phase 1 RBAC: /ports operator可只读访问
    {
      path: '/ports',
      component: () => import('@/components/layout/AdminLayout.vue'),
      meta: {
        requiresAuth: true,
        requiresOperator: true  // operator+admin 可访问（operator只读，由后端控制）
      },
      children: [
        {
          path: '',
          name: 'ports-management',
          component: () => import('@/views/PortManagement.vue'),
          meta: {
            title: '端口管理',
            description: '统一查看端口占用、冲突风险与配置调整'
          }
        },
        {
          path: 'alerts',
          name: 'alert-management',
          component: () => import('@/components/alerts/AlertManager.vue'),
          meta: {
            title: '告警管理',
            description: '性能监控和安全告警管理中心'
          }
        },
        {
          path: 'charts-demo',
          name: 'charts-demo',
          component: () => import('@/views/ChartsDemo.vue'),
          meta: {
            title: '图表展示',
            description: 'ECharts图表库集成演示'
          }
        },
        {
          path: 'historical-analysis',
          name: 'historical-analysis',
          component: () => import('@/components/analysis/HistoricalAnalysis.vue'),
          meta: {
            title: '历史数据分析',
            description: '历史数据对比分析系统'
          }
        },
        {
          path: 'ai-anomaly-detection',
          name: 'ai-anomaly-detection',
          component: () => import('@/components/intelligence/AnomalyDetectionPanel.vue'),
          meta: {
            title: 'AI异常检测',
            description: 'AI驱动的智能异常检测系统'
          }
        },
        {
          path: 'smart-reports',
          name: 'smart-reports',
          component: () => import('@/components/reports/SmartReportPanel.vue'),
          meta: {
            title: '智能报表',
            description: '智能报表生成和管理系统'
          }
        }
      ]
    },
    // 兼容性路由 - 重定向到新的嵌套路由
    {
      path: '/config',
      redirect: '/admin/config'
    },
    {
      path: '/unauthorized',
      name: 'unauthorized',
      component: () => import('@/views/Unauthorized.vue'),
      meta: {
        title: '无权限访问',
        requiresAuth: false
      }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFound.vue'),
      meta: {
        title: '页面未找到',
        requiresAuth: false
      }
    }
  ]
})

// 路由守卫
router.beforeEach(async (to: any, from: any, next: any) => {
  // 设置页面标题
  if (to.meta?.title) {
    document.title = `${to.meta.title} - 智能多Web应用门户系统`
  }

  // 获取认证store
  const authStore = useAuthStore()
  
  // 调试：检查路由守卫中的store状态（仅开发环境）
  if (isVerboseRouteLoggingEnabled()) {
    console.log('路由守卫store状态:', {
      isInitialized: authStore.isInitialized,
      isAuthenticated: authStore.isAuthenticated,
      hasUser: !!authStore.user
    })
  }
  
  // 认证状态已在 main.ts 中应用挂载前处理完毕，
  // 此处不再需要重复执行初始化逻辑。
  // 确保在路由守卫执行时，认证状态是确定的。
  if (!authStore.isInitialized) {
    // 理论上不应进入此分支，因为 main.ts 中已等待初始化完成。
    // 如果进入，说明存在时序问题，此时应等待初始化完成。
    if (isVerboseRouteLoggingEnabled()) {
      console.warn('路由守卫发现认证状态尚未初始化，正在等待...')
    }
    await authStore.initializeAuth() // 作为安全兜底
    if (isVerboseRouteLoggingEnabled()) {
      console.log('认证状态初始化完成，继续导航。')
    }
  }

  // 使用路由守卫工具进行权限检查
  try {
    const { checkRoutePermissions, handlePermissionFailure, logRouteAccess } = await import('@/utils/routeGuards')
    
    const permissionResult = await checkRoutePermissions(to, authStore)
    
    // 记录访问日志
    logRouteAccess(to, from, authStore, permissionResult)

    if (permissionResult.allowed) {
      // 权限检查通过，允许访问
      next()
    } else {
      // 权限检查失败，处理失败情况
      handlePermissionFailure(permissionResult, next)
    }
  } catch (error) {
    console.error('路由权限检查失败:', error)
    ElMessage.error('权限检查失败，请稍后重试')
    next(false)
  }
})

// 路由错误处理
router.onError((error: any) => {
  console.error('路由错误:', error)
  ElMessage.error('页面加载失败，请稍后重试')
})

export default router
