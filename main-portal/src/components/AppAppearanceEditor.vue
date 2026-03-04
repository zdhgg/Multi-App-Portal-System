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
            {{ formData.icon || '🌐' }}
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
          <div class="icon-selector">
            <div class="current-icon" :style="{ backgroundColor: formData.color || '#3498db' }" @click="iconPickerVisible = !iconPickerVisible">
              {{ formData.icon || '🌐' }}
            </div>
            <span class="icon-hint">点击选择图标</span>
          </div>
          
          <!-- 图标选择面板 - 独立于 icon-selector -->
          <transition name="fade">
            <div v-if="iconPickerVisible" class="icon-picker-wrapper">
              <div class="icon-picker-overlay" @click="iconPickerVisible = false"></div>
              <div class="icon-picker-panel">
                <div class="icon-picker-header">
                  <span>选择图标</span>
                  <el-icon class="close-btn" @click="iconPickerVisible = false"><Close /></el-icon>
                </div>
                <div class="icon-picker">
                  <!-- 分类标签导航 -->
                  <div class="category-tabs">
                    <div 
                      v-for="(category, index) in iconCategories" 
                      :key="category.name"
                      class="category-tab"
                      :class="{ active: activeCategory === index }"
                      @click="activeCategory = index"
                    >
                      {{ category.name }}
                    </div>
                  </div>
                  
                  <!-- 图标网格 -->
                  <div class="icon-grid-container">
                    <div class="icon-grid">
                      <div
                        v-for="icon in iconCategories[activeCategory].icons"
                        :key="icon"
                        class="icon-option"
                        :class="{ active: formData.icon === icon }"
                        @click="selectIcon(icon)"
                      >
                        <span class="icon-emoji">{{ icon }}</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 自定义输入 -->
                  <div class="custom-icon-input">
                    <div class="custom-input-label">自定义 Emoji</div>
                    <div class="custom-input-row">
                      <el-input
                        v-model="customIcon"
                        placeholder="输入或粘贴 emoji"
                        size="default"
                        @keyup.enter="applyCustomIcon"
                        class="custom-emoji-input"
                      />
                      <el-button type="primary" @click="applyCustomIcon" :disabled="!customIcon.trim()">
                        应用
                      </el-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </transition>
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
import { Close, RefreshLeft } from '@element-plus/icons-vue'

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
const iconPickerVisible = ref(false)
const customIcon = ref('')
const activeCategory = ref(0)

const formData = reactive({
  name: '',
  icon: '',
  color: ''
})

// 预设图标分类 - 更丰富美观的图标选择
const iconCategories = [
  {
    name: '应用',
    icons: [
      '🌐', '💻', '🖥️', '📱', '📲', '⌨️', '🖱️', '💽', '💾', '💿',
      '📡', '🔌', '🔋', '📷', '🎥', '🎬', '📺', '📻', '🎧', '🎵'
    ]
  },
  {
    name: '工具',
    icons: [
      '⚙️', '🔧', '🛠️', '🔩', '⛓️', '🔨', '⚒️', '🧰', '🧪', '🔬',
      '🔭', '📡', '📟', '📞', '📠', '📢', '📣', '🔔', '🔕', '🎤'
    ]
  },
  {
    name: '数据',
    icons: [
      '📊', '📈', '📉', '💹', '📊', '📈', '🗒️', '🗓️', '📅', '📆',
      '📝', '📝', '📄', '📃', '📑', '📋', '📇', '📓', '📔', '📒'
    ]
  },
  {
    name: '安全',
    icons: [
      '🔒', '🔓', '🔐', '🔏', '🔑', '🗝️', '🛡️', '⛔', '🚫', '✅',
      '❌', '❓', '❗', '⚠️', '🚨', '🔆', '🔅', '📛', '👁️', '👁️‍🗨️'
    ]
  },
  {
    name: '文件',
    icons: [
      '📁', '📂', '🗂️', '🗃️', '🗄️', '📦', '📥', '📤', '📫', '📪',
      '📩', '📨', '📧', '✉️', '📮', '📧', '✂️', '📏', '📐', '📌'
    ]
  },
  {
    name: '符号',
    icons: [
      '🚀', '💡', '⭐', '🌟', '✨', '💫', '⚡', '🔥', '🌈', '❤️',
      '💚', '💙', '💜', '💯', '🎯', '🏆', '🎖️', '🎗️', '🎟️', '🎫'
    ]
  },
  {
    name: '开发',
    icons: [
      '⚛️', '💎', '🐍', '☕', '🦀', '🐘', '🐳', '🐧', '🐦', '🦊',
      '🐱', '🐶', '🐻', '🦄', '🐉', '🤖', '👾', '👽', '💻', '⌨️'
    ]
  },
  {
    name: '世界',
    icons: [
      '🌍', '🌎', '🌏', '🌐', '☁️', '🌤️', '⛅', '🌥️', '🌦️', '☀️',
      '🌙', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒'
    ]
  }
]

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
    formData.icon = newApp.icon || '🌐'
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
    formData.icon = props.app.icon || '🌐'
    formData.color = props.app.color || '#3498db'
  }
})

// 选择图标
const selectIcon = (icon: string) => {
  formData.icon = icon
  iconPickerVisible.value = false
}

// 应用自定义图标
const applyCustomIcon = () => {
  if (customIcon.value.trim()) {
    formData.icon = customIcon.value.trim()
    customIcon.value = ''
    iconPickerVisible.value = false
  }
}

// 默认值常量
const DEFAULT_ICON = '🌐'
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

.icon-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
}

.current-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.current-icon:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.icon-hint {
  font-size: 12px;
  color: #909399;
}

.icon-picker-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-picker-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
}

.icon-picker-panel {
  position: relative;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 1;
  width: 420px;
  max-width: 90vw;
}

.icon-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  color: #303133;
}

.icon-picker-header .close-btn {
  cursor: pointer;
  font-size: 18px;
  color: #909399;
  transition: color 0.2s;
}

.icon-picker-header .close-btn:hover {
  color: #303133;
}

.icon-picker {
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 分类标签导航 */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 16px;
}

.category-tab {
  padding: 6px 10px;
  text-align: center;
  font-size: 12px;
  color: #606266;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
  white-space: nowrap;
}

.category-tab:hover {
  color: #409eff;
  background: rgba(64, 158, 255, 0.1);
}

.category-tab.active {
  background: white;
  color: #409eff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 图标网格容器 */
.icon-grid-container {
  background: #fafbfc;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.icon-option {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.icon-option:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #e6e8eb;
}

.icon-option.active {
  border-color: #409eff;
  background: linear-gradient(135deg, #ecf5ff 0%, #f0f7ff 100%);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.2);
}

.icon-emoji {
  font-size: 24px;
  line-height: 1;
}

/* 自定义输入区域 */
.custom-icon-input {
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.custom-input-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.custom-input-row {
  display: flex;
  gap: 8px;
}

.custom-emoji-input {
  flex: 1;
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
