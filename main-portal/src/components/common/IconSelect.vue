<template>
  <div class="icon-selector">
    <div class="current-icon" :style="{ backgroundColor: color || '#3498db' }" @click="iconPickerVisible = !iconPickerVisible">
      <el-icon v-if="getIconComponent(modelValue)" :size="24"><component :is="getIconComponent(modelValue)" /></el-icon>
      <img v-else-if="isValidUrl(modelValue)" :src="modelValue" class="custom-image-icon" />
      <span v-else>{{ modelValue ? (modelValue.length > 2 ? modelValue.charAt(0).toUpperCase() : modelValue) : 'P' }}</span>
    </div>
    <span v-if="showHint" class="icon-hint">点击选择图标</span>
    
    <transition name="fade">
      <div v-if="iconPickerVisible" class="icon-picker-wrapper">
        <div class="icon-picker-overlay" @click="iconPickerVisible = false"></div>
        <div class="icon-picker-panel">
          <div class="icon-picker-header">
            <span>选择图标</span>
            <el-icon class="close-btn" @click="iconPickerVisible = false"><Close /></el-icon>
          </div>
          <div class="icon-picker">
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
            
            <div class="icon-grid-container">
              <div class="icon-grid">
                <div
                  v-for="(icon, index) in iconCategories[activeCategory].icons"
                  :key="icon"
                  class="icon-option"
                  :class="{ active: modelValue === icon }"
                  @click="selectIcon(icon)"
                >
                  <el-icon class="icon-svg" :size="24" :style="modelValue === icon ? {} : { color: presetColors[index % presetColors.length] }">
                    <component :is="getIconComponent(icon)" />
                  </el-icon>
                </div>
              </div>
            </div>
            
            <div class="custom-icon-input">
              <div class="custom-input-label">自定义内容 (输入 Emoji、首字母或图片链接)</div>
              <div class="custom-input-row">
                <el-input
                  v-model="customIcon"
                  placeholder="输入自定义内容"
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Close } from '@element-plus/icons-vue'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

interface Props {
  modelValue: string
  color?: string
  showHint?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 'Platform',
  color: '#3498db',
  showHint: true
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const iconPickerVisible = ref(false)
const customIcon = ref('')
const activeCategory = ref(0)

const getIconComponent = (iconName: string) => {
  if (!iconName) return null
  return (ElementPlusIconsVue as any)[iconName] || null
}

const isValidUrl = (url?: string) => {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:image')
}

const presetColors = [
  '#3498db', '#67C23A', '#E6A23C', '#F56C6C', '#909399', 
  '#9b59b6', '#1abc9c', '#e74c3c', '#2c3e50', '#f39c12'
]

const iconCategories = [
  {
    name: '通用',
    icons: [
      'Platform', 'Monitor', 'Box', 'DataBoard', 'Setting', 'Tools', 'Connection', 
      'Place', 'Guide', 'Magnet', 'House', 'Menu', 'Grid', 'List'
    ]
  },
  {
    name: '数据',
    icons: [
      'Database', 'PieChart', 'DataAnalysis', 'DataLine', 'Document', 'Folder', 
      'Files', 'Wallet', 'Coin', 'Ticket', 'TrendCharts', 'Histogram'
    ]
  },
  {
    name: '安全',
    icons: [
      'Lock', 'Unlock', 'Key', 'Shield', 'Warning', 'CircleCheck', 'CircleClose', 
      'Bell', 'User', 'Avatar', 'View', 'Hide'
    ]
  }
]

const selectIcon = (icon: string) => {
  emit('update:modelValue', icon)
  iconPickerVisible.value = false
}

const applyCustomIcon = () => {
  if (customIcon.value.trim()) {
    emit('update:modelValue', customIcon.value.trim())
    customIcon.value = ''
    iconPickerVisible.value = false
  }
}
</script>

<style scoped>
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
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.current-icon:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.custom-image-icon {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  object-fit: cover;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

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

.icon-svg {
  color: #606266;
  transition: color 0.2s;
}

.icon-option.active .icon-svg {
  color: #409eff;
}

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
</style>
