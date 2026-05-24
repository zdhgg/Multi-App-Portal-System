<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    title="编辑应用外观"
    width="500px"
    :close-on-click-modal="false"
    destroy-on-close
    class="appearance-editor-dialog"
  >
    <div class="appearance-editor" v-if="app">
      <!-- 实时预览 -->
      <div class="preview-section">
        <div class="preview-label">预览效果</div>
        <div class="preview-card">
          <div 
            class="preview-icon" 
            :style="{ backgroundColor: formData.color || '#3498db' }"
          >
            <el-icon v-if="getIconComponent(formData.icon)" :size="24"><component :is="getIconComponent(formData.icon)" /></el-icon>
            <span v-else>{{ formData.icon || 'Platform' }}</span>
          </div>
          <div class="preview-name">{{ formData.name || '应用名称' }}</div>
        </div>
      </div>

      <!-- 编辑表单 -->
      <el-form 
        ref="formRef"
        :model="formData" 
        :rules="formRules"
        label-width="80px"
        class="edit-form"
      >
        <el-form-item label="应用名称" prop="name">
          <el-input 
            v-model="formData.name" 
            placeholder="请输入应用显示名称"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="图标">
          <IconSelect v-model="formData.icon" :color="formData.color" />
        </el-form-item>

        <el-form-item label="背景颜色">
          <div class="color-selector">
            <el-color-picker 
              v-model="formData.color" 
              :predefine="presetColors"
              show-alpha
              :teleported="false"
            />
            <el-input 
              v-model="formData.color" 
              placeholder="#3498db"
              style="width: 120px; margin-left: 12px;"
            />
          </div>
        </el-form-item>
      </el-form>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button class="reset-btn" text @click="handleResetDefault">
          <el-icon><RefreshLeft /></el-icon>
          恢复默认
        </el-button>
        <div class="footer-actions">
          <el-button @click="handleCancel">取消</el-button>
          <el-button type="primary" @click="handleSave" :loading="saving">
            保存修改
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { RefreshLeft } from '@element-plus/icons-vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import IconSelect from '@/components/common/IconSelect.vue'

const getIconComponent = (iconName: string) => {
  return (ElementPlusIconsVue as any)[iconName] || null
}

// Props
interface AppData {
  id: string
  name: string
  icon?: string
  color?: string
  [key: string]: any
}

interface Props {
  modelValue: boolean
  app: AppData | null
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'save': [data: { id: string; name: string; icon: string; color: string }]
}>()

// 响应式数据
const formRef = ref<FormInstance>()
const saving = ref(false)

const formData = reactive({
  name: '',
  icon: '',
  color: ''
})

// 预设颜色
const presetColors = [
  '#3498db', // 蓝色
  '#67C23A', // 绿色
  '#E6A23C', // 橙色
  '#F56C6C', // 红色
  '#909399', // 灰色
  '#9b59b6', // 紫色
  '#1abc9c', // 青色
  '#e74c3c', // 深红
  '#2c3e50', // 深蓝
  '#f39c12'  // 金色
]

// 表单验证规则
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入应用名称', trigger: 'blur' },
    { min: 1, max: 50, message: '名称长度在 1 到 50 个字符', trigger: 'blur' }
  ]
}

// 监听 app 变化，初始化表单和原始数据
watch(() => props.app, (newApp) => {
  if (newApp) {
    // 保存原始数据
    originalData.name = newApp.name || ''
    originalData.icon = newApp.icon || ''
    originalData.color = newApp.color || ''
    
    // 初始化表单
    formData.name = newApp.name || ''
    formData.icon = newApp.icon || 'Platform'
    formData.color = newApp.color || '#3498db'
  }
}, { immediate: true })

// 监听对话框打开，重新初始化
watch(() => props.modelValue, (visible) => {
  if (visible && props.app) {
    // 保存原始数据
    originalData.name = props.app.name || ''
    originalData.icon = props.app.icon || ''
    originalData.color = props.app.color || ''
    
    // 初始化表单
    formData.name = props.app.name || ''
    formData.icon = props.app.icon || 'Platform'
    formData.color = props.app.color || '#3498db'
  }
})


// 默认值常量
const DEFAULT_ICON = 'Platform'
const DEFAULT_COLOR = '#3498db'

// 保存原始数据（用于恢复默认）
const originalData = reactive({
  name: '',
  icon: '',
  color: ''
})

// 恢复默认设置 - 恢复到原始数据
const handleResetDefault = () => {
  formData.name = originalData.name
  formData.icon = originalData.icon || DEFAULT_ICON
  formData.color = originalData.color || DEFAULT_COLOR
  ElMessage.success('已恢复默认设置')
}

// 取消
const handleCancel = () => {
  emit('update:modelValue', false)
}

// 保存
const handleSave = async () => {
  if (!formRef.value || !props.app) return
  
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  
  saving.value = true
  try {
    emit('save', {
      id: props.app.id,
      name: formData.name,
      icon: formData.icon,
      color: formData.color
    })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.appearance-editor {
  padding: 0 16px;
}

.preview-section {
  margin-bottom: 24px;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
}

.preview-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 12px;
}

.preview-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preview-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preview-name {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.edit-form {
  margin-top: 16px;
}



.color-selector {
  display: flex;
  align-items: center;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reset-btn {
  color: #909399;
  padding-left: 0;
}

.reset-btn:hover {
  color: #409eff;
}

.footer-actions {
  display: flex;
  gap: 12px;
}
</style>

<style>
/* 全局样式覆盖 */
.appearance-editor-dialog .el-dialog__header {
  border-bottom: 1px solid #ebeef5;
  margin-right: 0;
  padding: 16px 20px;
}

.appearance-editor-dialog .el-dialog__body {
  padding: 20px;
  overflow: visible;
}

.appearance-editor-dialog .el-dialog__footer {
  border-top: 1px solid #ebeef5;
  padding: 12px 20px;
}

/* 确保表单项允许溢出 */
.appearance-editor-dialog .el-form-item {
  overflow: visible;
}

/* 确保图标选择器和颜色选择器的弹出层正确显示 */
.appearance-editor-dialog .icon-selector,
.appearance-editor-dialog .color-selector {
  position: relative;
}

.appearance-editor-dialog .el-popover.el-popper,
.appearance-editor-dialog .el-color-picker__panel {
  z-index: 9999 !important;
}
</style>
