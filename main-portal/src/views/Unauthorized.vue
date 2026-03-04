<template>
  <div class="unauthorized-page">
    <div class="container">
      <div class="error-content">
        <!-- 错误图标 -->
        <div class="error-icon">
          <el-icon :size="120" color="#f56c6c">
            <Lock />
          </el-icon>
        </div>

        <!-- 错误信息 -->
        <div class="error-info">
          <h1 class="error-code">403</h1>
          <h2 class="error-title">无权限访问</h2>
          <p class="error-description">
            抱歉，您没有权限访问此页面。此页面需要管理员权限才能访问。
          </p>
          
          <!-- 请求的页面信息 -->
          <div v-if="requestedPage" class="requested-page">
            <el-alert
              :title="`尝试访问: ${requestedPage}`"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="error-actions">
          <el-space :size="16" wrap>
            <el-button
              type="primary"
              size="large"
              @click="goHome"
            >
              <el-icon><House /></el-icon>
              返回首页
            </el-button>

            <el-button
              v-if="!authStore.isAuthenticated"
              type="success"
              size="large"
              @click="showLogin"
            >
              <el-icon><User /></el-icon>
              管理员登录
            </el-button>

            <el-button
              v-else-if="!authStore.isAdmin"
              type="warning"
              size="large"
              @click="contactAdmin"
            >
              <el-icon><ChatRound /></el-icon>
              联系管理员
            </el-button>

            <el-button
              size="large"
              @click="goBack"
            >
              <el-icon><ArrowLeft /></el-icon>
              返回上一页
            </el-button>
          </el-space>
        </div>

        <!-- 用户状态信息 -->
        <div class="user-status">
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="当前用户">
              {{ authStore.userDisplayName }}
            </el-descriptions-item>
            <el-descriptions-item label="用户角色">
              <el-tag :type="authStore.isAdmin ? 'danger' : 'info'">
                {{ authStore.isAdmin ? '管理员' : '访客' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="认证状态">
              <el-tag :type="authStore.isAuthenticated ? 'success' : 'warning'">
                {{ authStore.isAuthenticated ? '已登录' : '未登录' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </div>

    <!-- 登录对话框 -->
    <LoginDialog 
      v-model="loginDialogVisible" 
      @login-success="handleLoginSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRouter/useRoute 在其他文件中可正常导入
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Lock,
  House,
  User,
  ChatRound,
  ArrowLeft
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import LoginDialog from '@/components/auth/LoginDialog.vue'

// 响应式数据
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const loginDialogVisible = ref(false)

// 计算属性
const requestedPage = computed(() => {
  return route.query.from as string || null
})

// 方法
const goHome = () => {
  router.push('/portal')
}

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    goHome()
  }
}

const showLogin = () => {
  loginDialogVisible.value = true
}

const handleLoginSuccess = () => {
  ElMessage.success('登录成功！')
  
  // 如果用户现在有权限访问原始页面，则跳转
  if (authStore.isAdmin && requestedPage.value) {
    router.push(requestedPage.value)
  } else {
    // 否则跳转到门户页面
    goHome()
  }
}

const contactAdmin = () => {
  ElMessage.info('请联系系统管理员获取相应权限')
}

// 生命周期
onMounted(() => {
  // 记录访问日志
  console.warn('Unauthorized access attempt:', {
    user: authStore.user?.username || 'anonymous',
    role: authStore.user?.role || 'guest',
    requestedPage: requestedPage.value,
    timestamp: new Date().toISOString()
  })
})
</script>

<style scoped>
.unauthorized-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.container {
  max-width: 600px;
  width: 100%;
}

.error-content {
  background: white;
  border-radius: 16px;
  padding: 3rem;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
}

.error-icon {
  margin-bottom: 2rem;
}

.error-info {
  margin-bottom: 3rem;
}

.error-code {
  font-size: 4rem;
  font-weight: 700;
  color: #f56c6c;
  margin: 0 0 1rem 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.error-title {
  font-size: 2rem;
  font-weight: 600;
  color: #303133;
  margin: 0 0 1rem 0;
}

.error-description {
  font-size: 1.1rem;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
}

.requested-page {
  margin-top: 1.5rem;
}

.error-actions {
  margin-bottom: 3rem;
}

.user-status {
  max-width: 400px;
  margin: 0 auto;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .unauthorized-page {
    padding: 1rem;
  }

  .error-content {
    padding: 2rem 1.5rem;
  }

  .error-code {
    font-size: 3rem;
  }

  .error-title {
    font-size: 1.5rem;
  }

  .error-description {
    font-size: 1rem;
  }
}

/* 动画效果 */
.error-content {
  animation: fadeInUp 0.6s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.error-icon {
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-10px);
  }
  60% {
    transform: translateY(-5px);
  }
}

/* Element Plus 样式覆盖 */
:deep(.el-button--large) {
  padding: 12px 24px;
  font-size: 1rem;
}

:deep(.el-alert) {
  border-radius: 8px;
}

:deep(.el-descriptions) {
  border-radius: 8px;
}

:deep(.el-descriptions__label) {
  font-weight: 600;
}
</style>