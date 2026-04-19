import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'
import router from './router'
import App from './App.vue'
import './style.css'
import { initializeApiServices } from '@/services'
import { useAuthStore } from '@/stores/auth'
import { exposeAuthDebugTools, fixAuthIssues } from '@/utils/authDebug'
import { exposeAuthTestTools } from '@/utils/authTestScenarios'
import { exposeAuthFixTools } from '@/utils/authFix'
import { isDebugToolsEnabled } from '@/utils/debugControl'
import { registerAuthInvalidationHandler } from '@/utils/authInvalidation'

async function initializeAndMountApp() {
  const app = createApp(App)

  // 注册Element Plus图标
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  // 注册VueJsonPretty组件
  app.component('VueJsonPretty', VueJsonPretty)

  const pinia = createPinia()
  app.use(pinia)

  // 必须在 Pinia 安装后才能使用 store
  const authStore = useAuthStore()

  // 初始化API服务，并传入认证store实例
  initializeApiServices(authStore)

  // 在开发环境中暴露调试工具
  if (isDebugToolsEnabled()) {
    await import('@/utils/networkDebug')

    exposeAuthDebugTools()
    exposeAuthTestTools()
    exposeAuthFixTools()
  }

  try {
    // **关键：等待认证状态初始化完成**
    await authStore.initializeAuth()

    // 初始化成功后，再启动token刷新定时器
    if (authStore.isAuthenticated) {
      authStore.startTokenRefreshTimer()
    }
  } catch (error) {
    console.error('关键：应用启动时认证状态初始化失败:', error)
    // 可选：尝试自动修复或显示全局错误
    fixAuthIssues()
  }

  // 配置Element Plus全局选项
  app.use(ElementPlus, {
    zIndex: 3000
  })

  registerAuthInvalidationHandler({ authStore, router })

  // **在认证完成后再挂载路由**
  app.use(router)

  // **最后挂载应用**
  app.mount('#app')
}

initializeAndMountApp()
