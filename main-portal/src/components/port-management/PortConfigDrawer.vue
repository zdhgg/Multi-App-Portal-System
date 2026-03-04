<template>
  <el-drawer
    v-model="visible"
    title="端口配置"
    direction="rtl"
    size="480px"
    :before-close="handleClose"
  >
    <div class="port-config-drawer">
      <!-- 端口范围配置 -->
      <div class="config-section">
        <h4>端口范围配置</h4>
        <p class="section-desc">设置前端和后端应用的端口分配范围</p>
        
        <el-form label-position="top">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="前端起始端口">
                <el-input-number
                  v-model="frontendRange.start"
                  :min="1024"
                  :max="65535"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="前端结束端口">
                <el-input-number
                  v-model="frontendRange.end"
                  :min="1024"
                  :max="65535"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="后端起始端口">
                <el-input-number
                  v-model="backendRange.start"
                  :min="1024"
                  :max="65535"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="后端结束端口">
                <el-input-number
                  v-model="backendRange.end"
                  :min="1024"
                  :max="65535"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
        
        <div class="range-info">
          <el-tag type="primary">前端: {{ frontendRange.end - frontendRange.start + 1 }} 个端口</el-tag>
          <el-tag type="success">后端: {{ backendRange.end - backendRange.start + 1 }} 个端口</el-tag>
        </div>
      </div>
      
      <el-divider />
      
      <!-- 保留端口 -->
      <div class="config-section">
        <div class="section-header">
          <h4>保留端口</h4>
          <el-button type="primary" size="small" @click="showAddPort = true">
            添加
          </el-button>
        </div>
        <p class="section-desc">这些端口不会被自动分配</p>
        
        <el-table :data="reservedPorts" size="small" max-height="200">
          <el-table-column prop="port" label="端口" width="80" />
          <el-table-column prop="description" label="描述" />
          <el-table-column label="操作" width="60">
            <template #default="{ row }">
              <el-button 
                type="danger" 
                size="small" 
                link
                @click="removeReservedPort(row.port)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button @click="resetToDefault">重置</el-button>
      <el-button type="primary" :loading="saving" @click="saveConfig">
        保存配置
      </el-button>
    </template>
    
    <!-- 添加保留端口对话框 -->
    <el-dialog v-model="showAddPort" title="添加保留端口" width="360px" append-to-body>
      <el-form>
        <el-form-item label="端口号">
          <el-input-number v-model="newPort.port" :min="1" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="newPort.description" placeholder="端口用途描述" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddPort = false">取消</el-button>
        <el-button type="primary" @click="addReservedPort">添加</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { portManagementApiService } from '@/services/portManagementApi'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = ref(props.modelValue)
const saving = ref(false)
const loading = ref(false)
const showAddPort = ref(false)

watch(() => props.modelValue, (val) => {
  visible.value = val
  // 打开抽屉时加载配置
  if (val) {
    loadConfig()
  }
})

watch(visible, (val) => {
  emit('update:modelValue', val)
})

// 端口范围配置
const frontendRange = reactive({ start: 3001, end: 3100 })
const backendRange = reactive({ start: 8001, end: 8100 })

// 保留端口
const reservedPorts = ref<Array<{ port: number; description: string }>>([])

// 新增端口表单
const newPort = reactive({ port: null as number | null, description: '' })

// 加载配置
const loadConfig = async () => {
  loading.value = true
  try {
    const response = await portManagementApiService.getPortConfig()
    if (response.success && response.data) {
      frontendRange.start = response.data.frontendRange.start
      frontendRange.end = response.data.frontendRange.end
      backendRange.start = response.data.backendRange.start
      backendRange.end = response.data.backendRange.end
      reservedPorts.value = response.data.reservedPorts.map(p => ({
        port: p.port,
        description: p.description
      }))
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    ElMessage.warning('加载配置失败，使用默认值')
  } finally {
    loading.value = false
  }
}

const handleClose = () => {
  visible.value = false
}

const saveConfig = async () => {
  saving.value = true
  try {
    // 验证范围
    if (frontendRange.start >= frontendRange.end) {
      ElMessage.warning('前端端口范围无效')
      return
    }
    if (backendRange.start >= backendRange.end) {
      ElMessage.warning('后端端口范围无效')
      return
    }
    
    // 保存端口范围配置
    const rangeResponse = await portManagementApiService.updatePortRanges({
      frontendRange: { start: frontendRange.start, end: frontendRange.end },
      backendRange: { start: backendRange.start, end: backendRange.end },
      reason: '用户手动更新配置'
    })
    
    if (!rangeResponse.success) {
      ElMessage.error(rangeResponse.error || '保存端口范围失败')
      return
    }
    
    // 同步保留端口列表
    const portsResponse = await portManagementApiService.syncReservedPorts(reservedPorts.value)
    if (!portsResponse.success) {
      ElMessage.warning('端口范围已保存，但保留端口同步失败')
    }
    
    ElMessage.success('配置已保存')
    emit('saved')
    handleClose()
  } catch (error) {
    console.error('保存配置失败:', error)
    ElMessage.error('保存配置失败')
  } finally {
    saving.value = false
  }
}

const resetToDefault = () => {
  frontendRange.start = 3001
  frontendRange.end = 3100
  backendRange.start = 8001
  backendRange.end = 8100
  ElMessage.success('已重置为默认值')
}

const addReservedPort = () => {
  if (!newPort.port) {
    ElMessage.warning('请输入端口号')
    return
  }
  if (reservedPorts.value.some(p => p.port === newPort.port)) {
    ElMessage.warning('该端口已存在')
    return
  }
  
  reservedPorts.value.push({
    port: newPort.port,
    description: newPort.description || `端口 ${newPort.port}`
  })
  
  newPort.port = null
  newPort.description = ''
  showAddPort.value = false
  ElMessage.success('已添加')
}

const removeReservedPort = (port: number) => {
  const index = reservedPorts.value.findIndex(p => p.port === port)
  if (index > -1) {
    reservedPorts.value.splice(index, 1)
    ElMessage.success('已删除')
  }
}
</script>

<style scoped>
.port-config-drawer {
  padding: 0 8px;
}

.config-section {
  margin-bottom: 16px;
}

.config-section h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-desc {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: #909399;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.range-info {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
