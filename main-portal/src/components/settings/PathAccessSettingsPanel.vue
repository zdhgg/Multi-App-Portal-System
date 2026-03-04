<template>
  <div class="path-access-panel">
    <el-alert
      title="PM2 启动、打开文件夹等操作会校验路径白名单"
      type="info"
      :closable="false"
      show-icon
    />

    <el-form :model="model" label-width="180px" class="form-content">
      <el-form-item label="允许工作区父目录">
        <el-switch v-model="model.allowWorkspaceParent" @change="emitChange" />
        <span class="inline-tip">开启后会允许访问当前系统目录的上一级目录</span>
      </el-form-item>

      <el-form-item label="额外允许访问路径">
        <div class="paths-editor">
          <div
            v-for="(item, index) in model.allowedBasePaths"
            :key="`path-${index}`"
            class="path-row"
          >
            <el-input
              v-model="model.allowedBasePaths[index]"
              placeholder="例如：D:\\My Programs"
              @input="emitChange"
            />
            <el-button plain :loading="pickingIndex === index" @click="pickFolder(index)">选择目录</el-button>
            <el-button type="danger" plain @click="removePath(index)">删除</el-button>
          </div>

          <div class="path-actions">
            <el-button type="primary" plain @click="addPath">添加路径</el-button>
            <el-button plain :loading="addingByPicker" @click="addPathByPicker">选择目录并添加</el-button>
          </div>
          <div class="help-text">
            建议填写父目录而不是单个项目目录，便于后续新增应用。示例：`D:\\My Programs`
          </div>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/services/api'
import { filesystemApiService } from '@/services/filesystemApi'

type PathAccessSettings = {
  allowWorkspaceParent: boolean
  allowedBasePaths: string[]
}

const props = defineProps<{ pathAccess: any }>()
const emit = defineEmits<{
  (e: 'update:path-access', value: PathAccessSettings): void
  (e: 'path-access-changed', value: PathAccessSettings): void
  (e: 'picker-selected', value: PathAccessSettings): void
}>()

const model = reactive<PathAccessSettings>({
  allowWorkspaceParent: false,
  allowedBasePaths: []
})
const pickingIndex = ref<number | null>(null)
const addingByPicker = ref(false)

const normalizePathAccessSettings = (value: any): PathAccessSettings => ({
  allowWorkspaceParent: Boolean(value?.allowWorkspaceParent),
  allowedBasePaths: Array.isArray(value?.allowedBasePaths)
    ? value.allowedBasePaths.map((item: unknown) => String(item).trim()).filter((item: string) => item.length > 0)
    : []
})

const arePathAccessSettingsEqual = (a: PathAccessSettings, b: PathAccessSettings): boolean => {
  if (a.allowWorkspaceParent !== b.allowWorkspaceParent) return false
  if (a.allowedBasePaths.length !== b.allowedBasePaths.length) return false
  return a.allowedBasePaths.every((item, index) => item === b.allowedBasePaths[index])
}

watch(
  () => props.pathAccess,
  (value) => {
    const normalized = normalizePathAccessSettings(value)
    const current = normalizePathAccessSettings(model)
    if (arePathAccessSettingsEqual(normalized, current)) return

    model.allowWorkspaceParent = normalized.allowWorkspaceParent
    model.allowedBasePaths = [...normalized.allowedBasePaths]
  },
  { immediate: true, deep: true }
)

const emitChange = (): PathAccessSettings => {
  const payload: PathAccessSettings = {
    allowWorkspaceParent: model.allowWorkspaceParent,
    allowedBasePaths: model.allowedBasePaths
      .map(item => item.trim())
      .filter(item => item.length > 0)
  }

  emit('update:path-access', payload)
  emit('path-access-changed', payload)
  return payload
}

const addPath = () => {
  model.allowedBasePaths.push('')
}

const pickFolder = async (index: number) => {
  if (pickingIndex.value !== null) return

  pickingIndex.value = index
  try {
    const currentPath = model.allowedBasePaths[index]?.trim()
    const response = await filesystemApiService.selectFolder(currentPath || undefined, true)

    if (!response.success || !response.data) {
      throw new Error(response.message || '目录选择失败')
    }
    if (response.data.cancelled) {
      ElMessage.info('已取消目录选择')
      return
    }

    const selectedPath = typeof response.data.path === 'string' ? response.data.path.trim() : ''
    if (!selectedPath) {
      throw new Error('未获取到有效目录路径')
    }

    model.allowedBasePaths[index] = selectedPath
    const payload = emitChange()
    emit('picker-selected', payload)
    ElMessage.success(`已选择目录: ${selectedPath}`)
  } catch (error: any) {
    const message = error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : '目录选择失败'
    ElMessage.error(message)
  } finally {
    pickingIndex.value = null
  }
}

const addPathByPicker = async () => {
  if (addingByPicker.value) return
  addingByPicker.value = true

  try {
    const fallbackStartPath = model.allowedBasePaths.find(item => item.trim().length > 0)?.trim()
    const response = await filesystemApiService.selectFolder(fallbackStartPath || undefined, true)

    if (!response.success || !response.data) {
      throw new Error(response.message || '目录选择失败')
    }
    if (response.data.cancelled) {
      ElMessage.info('已取消目录选择')
      return
    }

    const selectedPath = typeof response.data.path === 'string' ? response.data.path.trim() : ''
    if (!selectedPath) {
      throw new Error('未获取到有效目录路径')
    }

    const exists = model.allowedBasePaths.some(item => item.trim().toLowerCase() === selectedPath.toLowerCase())
    if (exists) {
      ElMessage.warning('该路径已存在')
      return
    }

    model.allowedBasePaths.push(selectedPath)
    const payload = emitChange()
    emit('picker-selected', payload)
    ElMessage.success(`已添加路径: ${selectedPath}`)
  } catch (error: any) {
    const message = error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : '目录选择失败'
    ElMessage.error(message)
  } finally {
    addingByPicker.value = false
  }
}

const removePath = (index: number) => {
  model.allowedBasePaths.splice(index, 1)
  emitChange()
}
</script>

<style scoped>
.path-access-panel {
  max-width: 900px;
}

.form-content {
  margin-top: 16px;
}

.paths-editor {
  width: 100%;
}

.path-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.path-actions {
  display: flex;
  gap: 8px;
}

.inline-tip {
  margin-left: 10px;
  color: #606266;
  font-size: 13px;
}

.help-text {
  margin-top: 8px;
  color: #909399;
  font-size: 13px;
}
</style>
