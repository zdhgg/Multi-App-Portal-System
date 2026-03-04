<template>
  <el-dialog
    v-model="visible"
    title="管理员登录"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    center
    :z-index="9999"
    :modal-style="{ zIndex: 9998 }"
    @closed="handleDialogClosed"
  >
    <div class="login-content">
      <!-- 登录表单 -->
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        label-width="0"
        size="large"
        @submit.prevent="handleLogin"
      >
        <div class="login-header">
          <div class="login-icon">
            <el-icon :size="48" color="#409eff">
              <User />
            </el-icon>
          </div>
          <h3>欢迎登录</h3>
          <p>请输入管理员账户信息</p>
        </div>

        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="用户名"
            :prefix-icon="User"
            clearable
            autocomplete="username"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
            clearable
            autocomplete="current-password"
          />
        </el-form-item>

        <el-form-item>
          <div class="login-options">
            <el-checkbox v-model="loginForm.rememberMe">
              记住我
            </el-checkbox>
          </div>
        </el-form-item>

        <!-- 登录按钮移到footer中，避免重复触发 -->
      </el-form>

      <!-- 提示信息 -->
      <div class="login-tips">
        <el-alert
          v-if="showDefaultTip"
          title="默认管理员账户"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>用户名: <code>admin</code></p>
            <p>密码: <code>admin123</code></p>
          </template>
        </el-alert>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="authStore.isLoading || isSubmitting"
          :disabled="!isFormValid || isSubmitting"
          @click="handleLogin"
        >
          <span v-if="authStore.isLoading || isSubmitting">登录中...</span>
          <span v-else>登录</span>
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { logLoginStart, logLoginSuccess, logLoginError } from '@/utils/loginDebug'

// Props
interface Props {
  modelValue: boolean
  showDefaultTip?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showDefaultTip: true
})

// Emits
interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'login-success'): void
  (e: 'login-cancel'): void
}

const emit = defineEmits<Emits>()

// Store
const authStore = useAuthStore()

// 响应式数据
const loginFormRef = ref<FormInstance>()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 登录表单
const loginForm = reactive({
  username: '',
  password: '',
  rememberMe: false
})

// 表单验证规则
const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 50, message: '用户名长度应为3-50个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6个字符', trigger: 'blur' }
  ]
}

// 计算属性
const isFormValid = computed(() => {
  return loginForm.username.trim().length >= 3 && 
         loginForm.password.length >= 6
})

// 防重复提交标志
const isSubmitting = ref(false)

// 方法
const handleLogin = async () => {
  if (!loginFormRef.value) return

  // 防重复提交检查
  if (isSubmitting.value || authStore.isLoading) {
    console.warn('登录请求正在处理中，忽略重复请求')
    return
  }

  try {
    isSubmitting.value = true

    // 验证表单
    const isValid = await loginFormRef.value.validate().catch(() => false)
    if (!isValid) return

    const credentials = {
      username: loginForm.username.trim(),
      password: loginForm.password,
      rememberMe: loginForm.rememberMe
    }

    // 记录登录开始（UI层）
    logLoginStart(credentials, 'LoginDialog')

    // 执行登录（不在authStore中重复记录）
    const success = await authStore.login(credentials, false) // 传递skipLogging参数

    if (success) {
      logLoginSuccess('LoginDialog')
      visible.value = false
      emit('login-success')

      // 清空表单
      resetForm()
    }
  } catch (error: any) {
    console.error('登录失败:', error)
    logLoginError(error.message || '登录失败', 'LoginDialog')
    ElMessage.error(error.message || '登录失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}

const handleCancel = () => {
  visible.value = false
  emit('login-cancel')
  resetForm()
}

const handleDialogClosed = () => {
  resetForm()
}

const resetForm = () => {
  if (loginFormRef.value) {
    loginFormRef.value.resetFields()
  }
  
  // 重置表单数据
  Object.assign(loginForm, {
    username: '',
    password: '',
    rememberMe: false
  })
}

// 监听弹窗显示状态
watch(visible, (newValue) => {
  if (newValue) {
    // 弹窗打开时，聚焦到用户名输入框
    setTimeout(() => {
      const usernameInput = document.querySelector('.el-input__inner[placeholder="用户名"]') as HTMLInputElement
      if (usernameInput) {
        usernameInput.focus()
      }
    }, 100)
  }
})
</script>

<style scoped>
.login-content {
  padding: 0;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-icon {
  margin-bottom: 1rem;
}

.login-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #303133;
}

.login-header p {
  margin: 0;
  color: #909399;
  font-size: 0.9rem;
}

.login-options {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.login-tips {
  margin-top: 1.5rem;
}

.login-tips :deep(.el-alert__content) {
  padding: 0;
}

.login-tips p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.login-tips code {
  background: #f5f7fa;
  color: #409eff;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .login-content {
    padding: 0 1rem;
  }
  
  .login-header h3 {
    font-size: 1.3rem;
  }
}

/* 自定义样式覆盖 - 修复居中和层级问题 */
/* 只对显示中的模态框应用样式，避免影响隐藏的元素 */
:deep(.el-overlay.el-modal-dialog:not([style*="display: none"])) {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 99999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

:deep(.el-overlay-dialog) {
  position: relative !important;
  margin: 0 !important;
}

:deep(.el-dialog) {
  border-radius: 12px;
  position: relative !important;
  top: auto !important;
  left: auto !important;
  transform: none !important;
  margin: 0 !important;
  width: 420px !important;
}

/* 确保隐藏的遮罩层真正隐藏 */
:deep(.el-overlay[style*="display: none"]) {
  display: none !important;
  visibility: hidden !important;
}

/* 备用选择器，确保兼容性 */
:deep(.el-overlay) {
  z-index: 99998 !important;
}

:deep(.el-dialog__wrapper) {
  z-index: 99999 !important;
}

:deep(.el-dialog__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1.5rem;
  border-radius: 12px 12px 0 0;
}

:deep(.el-dialog__title) {
  color: white;
  font-weight: 600;
  font-size: 1.2rem;
}

:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: white;
  font-size: 1.2rem;
}

:deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #f0f0f0;
}

:deep(.el-dialog__body) {
  padding: 2rem 2rem 1rem 2rem;
}

:deep(.el-dialog__footer) {
  padding: 1rem 2rem 2rem 2rem;
  border-top: 1px solid #ebeef5;
}

:deep(.el-form-item) {
  margin-bottom: 1.5rem;
}

:deep(.el-input--large .el-input__inner) {
  height: 48px;
  line-height: 48px;
}

:deep(.el-button--large) {
  height: 48px;
  font-size: 1rem;
}

/* 加载状态样式 */
:deep(.el-button.is-loading) {
  position: relative;
}

/* 焦点样式 */
:deep(.el-input.is-focus .el-input__inner) {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

/* 错误状态样式 */
:deep(.el-form-item.is-error .el-input__inner) {
  border-color: #f56c6c;
}

:deep(.el-form-item__error) {
  font-size: 0.8rem;
  margin-top: 0.5rem;
}
</style>