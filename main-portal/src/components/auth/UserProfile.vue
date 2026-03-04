<template>
  <div class="user-profile">
    <!-- 未登录状态 -->
    <div v-if="authStore.isGuest" class="guest-actions">
      <el-button
        type="primary"
        size="default"
        @click="showLoginDialog"
      >
        <el-icon><User /></el-icon>
        登录
      </el-button>
    </div>

    <!-- 已登录状态 -->
    <div v-else class="user-actions">
      <!-- 用户信息下拉菜单 -->
      <el-dropdown 
        trigger="click" 
        placement="bottom-end"
        @command="handleCommand"
      >
        <div class="user-info">
          <div class="user-avatar">
            <el-icon size="20"><Avatar /></el-icon>
          </div>
          <div class="user-details">
            <span class="username">{{ authStore.userDisplayName }}</span>
            <span class="role-badge" :class="roleClass">
              {{ roleName }}
            </span>
          </div>
          <el-icon class="dropdown-icon"><ArrowDown /></el-icon>
        </div>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile" :icon="User">
              <span>个人信息</span>
            </el-dropdown-item>
            
            <el-dropdown-item command="change-password" :icon="Lock">
              <span>修改密码</span>
            </el-dropdown-item>
            
            <el-dropdown-item divided command="logout" :icon="SwitchButton">
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 登录对话框 -->
    <LoginDialog 
      v-model="loginDialogVisible" 
      @login-success="handleLoginSuccess"
      @login-cancel="handleLoginCancel"
    />

    <!-- 个人信息对话框 -->
    <el-dialog
      v-model="profileDialogVisible"
      title="个人信息"
      width="500px"
      :close-on-click-modal="false"
    >
      <div class="profile-content">
        <el-descriptions :column="1" size="default" border>
          <el-descriptions-item label="用户名">
            <el-tag>{{ currentUser?.username }}</el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="角色">
            <el-tag :type="roleTagType">{{ roleName }}</el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="状态">
            <el-tag :type="currentUser?.is_active ? 'success' : 'danger'">
              {{ currentUser?.is_active ? '活跃' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          
          <el-descriptions-item label="最后登录">
            {{ formatDate(currentUser?.last_login) }}
          </el-descriptions-item>
          
          <el-descriptions-item label="创建时间">
            {{ formatDate(currentUser?.created_at) }}
          </el-descriptions-item>
          
          <el-descriptions-item label="更新时间">
            {{ formatDate(currentUser?.updated_at) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>

      <template #footer>
        <el-button @click="profileDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 修改密码对话框 -->
    <el-dialog
      v-model="passwordDialogVisible"
      title="修改密码"
      width="450px"
      :close-on-click-modal="false"
      @closed="resetPasswordForm"
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="100px"
        size="default"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
            clearable
          />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            clearable
            @keyup.enter="handleChangePassword"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="authStore.isLoading"
          :disabled="!isPasswordFormValid"
          @click="handleChangePassword"
        >
          确认修改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  User,
  Avatar,
  ArrowDown,
  Lock,
  SwitchButton
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import LoginDialog from './LoginDialog.vue'

// Store
const authStore = useAuthStore()

// 响应式数据
const loginDialogVisible = ref(false)
const profileDialogVisible = ref(false)
const passwordDialogVisible = ref(false)
const passwordFormRef = ref<FormInstance>()

// 计算属性
const currentUser = computed(() => authStore.currentUser)

const roleName = computed(() => {
  if (authStore.isAdmin) return '管理员'
  if (authStore.isAuthenticated) return '用户'
  return '访客'
})

const roleClass = computed(() => {
  if (authStore.isAdmin) return 'role-admin'
  if (authStore.isAuthenticated) return 'role-user'
  return 'role-guest'
})

const roleTagType = computed(() => {
  if (authStore.isAdmin) return 'danger'
  if (authStore.isAuthenticated) return 'success'
  return 'info'
})

// 密码修改表单
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 密码表单验证规则
const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码长度不能少于6个字符', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value === passwordForm.currentPassword) {
          callback(new Error('新密码不能与当前密码相同'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

// 计算密码表单是否有效
const isPasswordFormValid = computed(() => {
  return passwordForm.currentPassword.length >= 6 &&
         passwordForm.newPassword.length >= 6 &&
         passwordForm.confirmPassword === passwordForm.newPassword &&
         passwordForm.newPassword !== passwordForm.currentPassword
})

// 方法
const showLoginDialog = () => {
  loginDialogVisible.value = true
}

const handleLoginSuccess = () => {
  ElMessage.success('登录成功！')
}

const handleLoginCancel = () => {
  // 登录取消处理
}

const handleCommand = (command: string) => {
  switch (command) {
    case 'profile':
      profileDialogVisible.value = true
      break
    case 'change-password':
      passwordDialogVisible.value = true
      break
    case 'logout':
      handleLogout()
      break
  }
}

const handleLogout = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要退出登录吗？',
      '退出确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await authStore.logout()
  } catch {
    // 用户取消操作
  }
}

const handleChangePassword = async () => {
  if (!passwordFormRef.value) return

  try {
    // 验证表单
    const isValid = await passwordFormRef.value.validate().catch(() => false)
    if (!isValid) return

    // 修改密码
    const success = await authStore.changePassword(
      passwordForm.currentPassword,
      passwordForm.newPassword,
      passwordForm.confirmPassword
    )

    if (success) {
      passwordDialogVisible.value = false
      resetPasswordForm()
      
      // 提示用户重新登录
      ElMessage.success('密码修改成功，请重新登录')
    }
  } catch (error: any) {
    console.error('修改密码失败:', error)
    ElMessage.error(error.message || '修改密码失败')
  }
}

const resetPasswordForm = () => {
  if (passwordFormRef.value) {
    passwordFormRef.value.resetFields()
  }
  
  Object.assign(passwordForm, {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
}

const formatDate = (dateString?: string) => {
  if (!dateString) return '暂无'
  
  try {
    const date = new Date(dateString)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return '无效日期'
  }
}
</script>

<style scoped>
.user-profile {
  display: flex;
  align-items: center;
}

.guest-actions {
  display: flex;
  align-items: center;
}

.user-actions {
  position: relative;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.user-info:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.user-details {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.username {
  font-size: 0.9rem;
  font-weight: 600;
  color: #303133;
  line-height: 1.2;
}

.role-badge {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  line-height: 1;
  margin-top: 0.1rem;
}

.role-admin {
  background: #f56c6c;
  color: white;
}

.role-user {
  background: #67c23a;
  color: white;
}

.role-guest {
  background: #909399;
  color: white;
}

.dropdown-icon {
  color: #909399;
  transition: transform 0.2s ease;
}

.user-info:hover .dropdown-icon {
  transform: translateY(1px);
}

.profile-content {
  padding: 0.5rem 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .user-info {
    padding: 0.4rem 0.6rem;
    gap: 0.5rem;
  }

  .user-avatar {
    width: 28px;
    height: 28px;
  }

  .username {
    font-size: 0.8rem;
  }

  .role-badge {
    font-size: 0.7rem;
  }
}

/* 暗色主题支持 */
@media (prefers-color-scheme: dark) {
  .user-info {
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.1);
  }

  .user-info:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .username {
    color: #ffffff;
  }
}

/* Element Plus 样式覆盖 */
:deep(.el-dropdown-menu__item) {
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}

:deep(.el-dropdown-menu__item:hover) {
  background-color: #f5f7fa;
}

:deep(.el-dropdown-menu__item .el-icon) {
  margin-right: 0.5rem;
  font-size: 1rem;
}

:deep(.el-descriptions) {
  border-radius: 8px;
}

:deep(.el-descriptions__label) {
  font-weight: 600;
  color: #606266;
}

:deep(.el-descriptions__content) {
  color: #303133;
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