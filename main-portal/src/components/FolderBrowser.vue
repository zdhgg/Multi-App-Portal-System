<template>
  <div class="folder-browser-overlay" @click="closeModal">
    <div class="folder-browser" @click.stop>
      <div class="browser-header">
        <h3>选择文件夹</h3>
        <button @click="closeModal" class="close-btn">✕</button>
      </div>

      <div class="browser-toolbar">
        <div class="path-navigation">
          <button 
            @click="goToHome" 
            class="nav-btn"
            :disabled="loading"
            title="主目录"
          >
            🏠
          </button>
          <button 
            @click="goToParent" 
            class="nav-btn"
            :disabled="loading || !currentData?.parentPath"
            title="上级目录"
          >
            ⬆️
          </button>
          <div class="path-display">
            <input 
              v-model="currentPath" 
              @keyup.enter="navigateToPath"
              @blur="navigateToPath"
              class="path-input"
              placeholder="输入路径..."
              :disabled="loading"
            />
          </div>
          <button 
            @click="refreshCurrent" 
            class="nav-btn"
            :disabled="loading"
            title="刷新"
          >
            🔄
          </button>
        </div>
      </div>

      <div class="browser-content">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在加载...</p>
        </div>

        <div v-else-if="error" class="error-state">
          <div class="error-icon">❌</div>
          <p>{{ error }}</p>
          <button @click="refreshCurrent" class="retry-btn">重试</button>
        </div>

        <div v-else-if="currentData?.items" class="folder-list">
          <div 
            v-for="item in filteredItems" 
            :key="item.path"
            class="folder-item"
            :class="{ 
              'selected': selectedPath === item.path,
              'disabled': !item.hasPermission || item.type === 'file'
            }"
            @click="selectItem(item)"
            @dblclick="navigateToItem(item)"
          >
            <div class="item-icon">
              {{ item.type === 'directory' ? '📁' : '📄' }}
            </div>
            <div class="item-info">
              <div class="item-name">{{ item.name }}</div>
              <div class="item-meta">
                <span v-if="item.type === 'directory'">文件夹</span>
                <span v-else>文件 ({{ formatFileSize(item.size) }})</span>
                <span v-if="!item.hasPermission" class="no-permission">无权限</span>
              </div>
            </div>
          </div>

          <div v-if="filteredItems.length === 0" class="empty-folder">
            <div class="empty-icon">📂</div>
            <p>此文件夹为空或没有可访问的子文件夹</p>
          </div>
        </div>
      </div>

      <div class="browser-footer">
        <div class="selected-path">
          <strong>已选择:</strong> 
          <span>{{ effectiveSelectedPath || '未选择' }}</span>
        </div>
        <div class="footer-actions">
          <button
            @click="selectCurrentDirectory"
            class="btn btn-secondary"
            :disabled="loading || !currentData?.currentPath"
          >
            选择当前目录
          </button>
          <button @click="closeModal" class="btn btn-secondary">取消</button>
          <button 
            @click="confirmSelection" 
            class="btn btn-primary"
            :disabled="!effectiveSelectedPath || loading"
          >
            确认选择
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { filesystemApiService } from '@/services'

// Props
interface Props {
  initialPath?: string
  showHidden?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialPath: '',
  showHidden: false
})

// Emits
const emit = defineEmits<{
  select: [path: string]
  close: []
}>()

// 响应式数据
const loading = ref(false)
const error = ref('')
const currentPath = ref(props.initialPath)
const selectedPath = ref('')
const currentData = ref<any>(null)

// 计算属性
const filteredItems = computed(() => {
  if (!currentData.value?.items) return []
  
  return currentData.value.items.filter((item: any) => {
    // 只显示文件夹
    if (item.type !== 'directory') return false
    
    // 根据showHidden设置过滤隐藏文件夹
    if (!props.showHidden && item.isHidden) return false
    
    return true
  })
})

const effectiveSelectedPath = computed(() => {
  return selectedPath.value || currentData.value?.currentPath || ''
})

// 方法
const loadDirectory = async (path: string = '') => {
  loading.value = true
  error.value = ''
  
  try {
    const response = await filesystemApiService.browse({
      path: path,
      showHidden: props.showHidden
    })
    
    if (response.success && response.data) {
      currentData.value = response.data
      currentPath.value = response.data.currentPath
      
      // 如果当前选择的路径不在新目录中，清除选择
      if (selectedPath.value && !selectedPath.value.startsWith(response.data.currentPath)) {
        selectedPath.value = ''
      }
    } else {
      error.value = response.message || '加载目录失败'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载目录失败'
  } finally {
    loading.value = false
  }
}

const goToHome = async () => {
  try {
    const response = await filesystemApiService.getHomeDirectory()
    if (response.success && response.data) {
      await loadDirectory(response.data.path)
    }
  } catch (err) {
    error.value = '无法访问主目录'
  }
}

const goToParent = async () => {
  if (currentData.value?.parentPath) {
    await loadDirectory(currentData.value.parentPath)
  }
}

const refreshCurrent = async () => {
  await loadDirectory(currentPath.value)
}

const navigateToPath = async () => {
  if (currentPath.value !== currentData.value?.currentPath) {
    await loadDirectory(currentPath.value)
  }
}

const selectItem = (item: any) => {
  if (item.type === 'directory' && item.hasPermission) {
    selectedPath.value = item.path
  }
}

const selectCurrentDirectory = () => {
  if (currentData.value?.currentPath) {
    selectedPath.value = currentData.value.currentPath
  }
}

const navigateToItem = async (item: any) => {
  if (item.type === 'directory' && item.hasPermission) {
    await loadDirectory(item.path)
  }
}

const confirmSelection = async () => {
  const targetPath = effectiveSelectedPath.value

  if (targetPath) {
    // 在确认选择前再次验证路径
    try {
      const response = await filesystemApiService.validatePath(targetPath)
      if (response.success && response.data) {
        if (response.data.isValid) {
          emit('select', targetPath)
        } else {
          error.value = `所选路径无效: ${response.data.errorMessage}`
        }
      } else {
        error.value = '路径验证失败，请重新选择'
      }
    } catch (err) {
      error.value = '路径验证失败，请重新选择'
    }
  }
}

const closeModal = () => {
  emit('close')
}

const formatFileSize = (size?: number): string => {
  if (!size) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let fileSize = size
  
  while (fileSize >= 1024 && unitIndex < units.length - 1) {
    fileSize /= 1024
    unitIndex++
  }
  
  return `${fileSize.toFixed(1)} ${units[unitIndex]}`
}

// 生命周期
onMounted(() => {
  if (props.initialPath) {
    loadDirectory(props.initialPath)
    return
  }

  goToHome()
})

// 监听路径变化
watch(() => props.initialPath, (newPath) => {
  if (newPath !== currentPath.value) {
    loadDirectory(newPath)
  }
})
</script>

<style scoped>
.folder-browser-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
}

.folder-browser {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 800px;
  height: 80%;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e6e6e6;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
}

.browser-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  color: #666;
}

.close-btn:hover {
  background: #e9ecef;
  color: #333;
}

.browser-toolbar {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e6e6e6;
  background: white;
}

.path-navigation {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
  min-width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover:not(:disabled) {
  background: #e9ecef;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.path-display {
  flex: 1;
  margin: 0 0.5rem;
}

.path-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9rem;
}

.browser-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state,
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: #666;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.retry-btn {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.folder-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.folder-item:hover:not(.disabled) {
  background: #f8f9fa;
}

.folder-item.selected {
  background: #e3f2fd;
  border: 1px solid #2196f3;
}

.folder-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.item-icon {
  font-size: 1.2rem;
  min-width: 1.5rem;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  font-weight: 500;
  color: #333;
  word-break: break-all;
}

.item-meta {
  font-size: 0.8rem;
  color: #666;
  margin-top: 0.25rem;
}

.no-permission {
  color: #dc3545;
  font-weight: 500;
}

.empty-folder {
  text-align: center;
  padding: 3rem 1rem;
  color: #666;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.browser-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e6e6e6;
  background: #f8f9fa;
  border-radius: 0 0 8px 8px;
}

.selected-path {
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #666;
  word-break: break-all;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #5a6268;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .folder-browser {
    width: 95%;
    height: 90%;
  }
  
  .path-navigation {
    flex-wrap: wrap;
  }
  
  .path-display {
    order: 3;
    flex-basis: 100%;
    margin: 0.5rem 0 0;
  }
}
</style>
