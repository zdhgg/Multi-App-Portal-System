<template>
  <div class="reserved-ports-config">
    <div class="config-header">
      <h3>保留端口配置</h3>
      <el-button 
        type="primary" 
        @click="showAddDialog = true"
        :icon="Plus"
      >
        添加保留端口
      </el-button>
    </div>

    <!-- 端口统计概览 -->
    <div class="ports-overview">
      <el-row :gutter="16">
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon system">
                <el-icon><Lock /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ systemPorts.length }}</div>
                <div class="stat-label">系统端口</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon portal">
                <el-icon><Platform /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ portalPorts.length }}</div>
                <div class="stat-label">门户端口</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon custom">
                <el-icon><Setting /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ customPorts.length }}</div>
                <div class="stat-label">自定义端口</div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="6">
          <el-card class="stat-card">
            <div class="stat-content">
              <div class="stat-icon total">
                <el-icon><TrendCharts /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-value">{{ totalPorts }}</div>
                <div class="stat-label">总计</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 端口过滤和搜索 -->
    <div class="ports-filters">
      <el-row :gutter="16" align="middle">
        <el-col :span="8">
          <el-input
            v-model="searchText"
            placeholder="搜索端口号或描述"
            :prefix-icon="Search"
            clearable
          />
        </el-col>
        <el-col :span="8">
          <el-select
            v-model="selectedCategory"
            placeholder="选择类别"
            clearable
          >
            <el-option label="全部类别" value="" />
            <el-option label="系统端口" value="system" />
            <el-option label="门户端口" value="portal" />
            <el-option label="自定义端口" value="custom" />
          </el-select>
        </el-col>
        <el-col :span="8">
          <el-button @click="refreshPorts" :icon="Refresh">刷新</el-button>
          <el-button @click="checkPortsStatus" :loading="checkingStatus" :icon="Monitor">
            检查状态
          </el-button>
        </el-col>
      </el-row>
    </div>

    <!-- 保留端口列表 -->
    <div class="ports-table">
      <el-table
        :data="filteredPorts"
        stripe
        :loading="loading"
        @sort-change="handleSortChange"
      >
        <el-table-column
          prop="port"
          label="端口号"
          width="100"
          sortable="custom"
        >
          <template #default="{ row }">
            <span class="port-number">{{ row.port }}</span>
          </template>
        </el-table-column>
        
        <el-table-column prop="description" label="描述" min-width="200">
          <template #default="{ row }">
            <div class="port-description">
              <div class="description-text">{{ row.description }}</div>
              <div class="description-meta">
                <el-tag 
                  :type="getCategoryTagType(row.category)" 
                  size="small"
                >
                  {{ getCategoryLabel(row.category) }}
                </el-tag>
              </div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag
              :type="getStatusTagType(row.status)"
              size="small"
              :icon="getStatusIcon(row.status)"
            >
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        
        <el-table-column label="最后检查" width="160">
          <template #default="{ row }">
            <div class="last-check">
              <div class="check-time">{{ formatTime(row.lastChecked) }}</div>
              <div class="check-method">{{ row.checkMethod || '手动' }}</div>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button 
                size="small" 
                @click="editPort(row)"
                :disabled="row.category === 'system'"
                :icon="Edit"
              >
                编辑
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                @click="confirmRemovePort(row)"
                :disabled="row.category === 'system'"
                :icon="Delete"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加端口对话框 -->
    <el-dialog
      v-model="showAddDialog"
      title="添加保留端口"
      width="500px"
      :before-close="handleAddDialogClose"
    >
      <el-form
        :model="newPort"
        :rules="portRules"
        ref="portFormRef"
        label-width="100px"
      >
        <el-form-item label="端口号" prop="port">
          <el-input-number
            v-model="newPort.port"
            :min="1"
            :max="65535"
            :step="1"
            placeholder="输入端口号"
          />
          <div class="form-hint">
            端口号范围: 1-65535，建议避开系统保留端口(1-1023)
          </div>
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="newPort.description"
            placeholder="端口用途描述"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        
        <el-form-item label="类别" prop="category">
          <el-select v-model="newPort.category" placeholder="选择类别">
            <el-option label="门户端口" value="portal" />
            <el-option label="自定义端口" value="custom" />
          </el-select>
          <div class="form-hint">
            系统端口由系统管理，无法手动添加
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showAddDialog = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="addPort" 
            :loading="adding"
          >
            确定添加
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑端口对话框 -->
    <el-dialog
      v-model="showEditDialog"
      title="编辑保留端口"
      width="500px"
      :before-close="handleEditDialogClose"
    >
      <el-form
        :model="editingPort"
        :rules="portRules"
        ref="editPortFormRef"
        label-width="100px"
      >
        <el-form-item label="端口号">
          <el-input-number
            v-model="editingPort.port"
            disabled
          />
          <div class="form-hint">端口号无法修改</div>
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="editingPort.description"
            placeholder="端口用途描述"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
        
        <el-form-item label="类别">
          <el-select v-model="editingPort.category" disabled>
            <el-option label="系统端口" value="system" />
            <el-option label="门户端口" value="portal" />
            <el-option label="自定义端口" value="custom" />
          </el-select>
          <div class="form-hint">端口类别无法修改</div>
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showEditDialog = false">取消</el-button>
          <el-button 
            type="primary" 
            @click="updatePort" 
            :loading="updating"
          >
            确定修改
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, nextTick } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  Plus, Edit, Delete, Search, Refresh, Monitor,
  Lock, Platform, Setting, TrendCharts
} from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'

const portConfigStore = usePortConfigStore()

const emit = defineEmits<{
  addPort: [portInfo: { port: number; description: string; category: 'system' | 'portal' | 'custom' }]
  removePort: [port: number]
}>()

// 响应式数据
const loading = ref(false)
const adding = ref(false)
const updating = ref(false)
const checkingStatus = ref(false)
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const searchText = ref('')
const selectedCategory = ref('')

const newPort = reactive({
  port: null as number | null,
  description: '',
  category: 'custom' as 'system' | 'portal' | 'custom'
})

const editingPort = reactive({
  port: 0,
  description: '',
  category: 'custom' as 'system' | 'portal' | 'custom'
})

const portFormRef = ref<FormInstance>()
const editPortFormRef = ref<FormInstance>()

// 表单验证规则
const portRules: FormRules = {
  port: [
    { required: true, message: '请输入端口号', trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: '端口号必须在1-65535之间', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入端口描述', trigger: 'blur' },
    { min: 2, max: 100, message: '描述长度应为2-100个字符', trigger: 'blur' }
  ],
  category: [
    { required: true, message: '请选择端口类别', trigger: 'change' }
  ]
}

// 模拟端口数据
const ports = ref([
  { port: 22, description: 'SSH远程连接', category: 'system', status: 'occupied', lastChecked: new Date().toISOString(), checkMethod: '自动' },
  { port: 80, description: 'HTTP服务', category: 'system', status: 'occupied', lastChecked: new Date().toISOString(), checkMethod: '自动' },
  { port: 443, description: 'HTTPS服务', category: 'system', status: 'occupied', lastChecked: new Date().toISOString(), checkMethod: '自动' },
  { port: 3000, description: '门户系统主服务', category: 'portal', status: 'available', lastChecked: new Date().toISOString(), checkMethod: '自动' },
  { port: 8000, description: '门户系统API服务', category: 'portal', status: 'occupied', lastChecked: new Date().toISOString(), checkMethod: '自动' }
])

// 计算属性
const systemPorts = computed(() => 
  ports.value.filter(p => p.category === 'system')
)

const portalPorts = computed(() => 
  ports.value.filter(p => p.category === 'portal')
)

const customPorts = computed(() => 
  ports.value.filter(p => p.category === 'custom')
)

const totalPorts = computed(() => ports.value.length)

const filteredPorts = computed(() => {
  let filtered = ports.value

  if (searchText.value) {
    const search = searchText.value.toLowerCase()
    filtered = filtered.filter(port => 
      port.port.toString().includes(search) ||
      port.description.toLowerCase().includes(search)
    )
  }

  if (selectedCategory.value) {
    filtered = filtered.filter(port => port.category === selectedCategory.value)
  }

  return filtered
})

// 工具函数
const getCategoryTagType = (category: string) => {
  const types: Record<string, string> = {
    system: 'danger',
    portal: 'warning', 
    custom: 'success'
  }
  return types[category] || 'info'
}

const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    system: '系统',
    portal: '门户',
    custom: '自定义'
  }
  return labels[category] || category
}

const getStatusTagType = (status: string) => {
  const types: Record<string, string> = {
    occupied: 'danger',
    available: 'success',
    unknown: 'info'
  }
  return types[status] || 'info'
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    occupied: '占用中',
    available: '可用',
    unknown: '未知'
  }
  return labels[status] || status
}

const getStatusIcon = (status: string) => {
  const icons: Record<string, string> = {
    occupied: 'CircleCloseFilled',
    available: 'CircleCheckFilled',
    unknown: 'QuestionFilled'
  }
  return icons[status] || 'InfoFilled'
}

const formatTime = (timeString: string) => {
  if (!timeString) return 'N/A'
  
  const date = new Date(timeString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  
  return date.toLocaleString('zh-CN')
}

// 事件处理函数
const refreshPorts = async () => {
  loading.value = true
  try {
    await portConfigStore.loadConfig()
    ElMessage.success('端口列表刷新成功')
  } catch (error) {
    ElMessage.error('刷新端口列表失败')
  } finally {
    loading.value = false
  }
}

const checkPortsStatus = async () => {
  checkingStatus.value = true
  try {
    // 模拟端口状态检查
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // 更新端口状态
    ports.value.forEach(port => {
      port.lastChecked = new Date().toISOString()
      port.checkMethod = '自动'
      // 随机更新一些端口状态用于演示
      if (Math.random() > 0.7) {
        port.status = port.status === 'occupied' ? 'available' : 'occupied'
      }
    })
    
    ElMessage.success('端口状态检查完成')
  } catch (error) {
    ElMessage.error('端口状态检查失败')
  } finally {
    checkingStatus.value = false
  }
}

const handleSortChange = ({ prop, order }: any) => {
  if (prop === 'port') {
    if (order === 'ascending') {
      ports.value.sort((a, b) => a.port - b.port)
    } else if (order === 'descending') {
      ports.value.sort((a, b) => b.port - a.port)
    }
  }
}

const addPort = async () => {
  if (!portFormRef.value) return
  
  const valid = await portFormRef.value.validate().catch(() => false)
  if (!valid) return

  // 检查端口是否已存在
  if (ports.value.some(p => p.port === newPort.port)) {
    ElMessage.error('该端口已在保留端口列表中')
    return
  }

  adding.value = true
  try {
    const portInfo = {
      port: newPort.port!,
      description: newPort.description,
      category: newPort.category
    }

    emit('addPort', portInfo)
    
    // 本地添加到列表
    ports.value.push({
      ...portInfo,
      status: 'unknown',
      lastChecked: new Date().toISOString(),
      checkMethod: '手动'
    })
    
    showAddDialog.value = false
    resetNewPort()
    ElMessage.success(`端口 ${portInfo.port} 添加成功`)
  } catch (error) {
    ElMessage.error('添加端口失败')
  } finally {
    adding.value = false
  }
}

const editPort = (port: any) => {
  editingPort.port = port.port
  editingPort.description = port.description
  editingPort.category = port.category
  showEditDialog.value = true
}

const updatePort = async () => {
  if (!editPortFormRef.value) return
  
  const valid = await editPortFormRef.value.validate().catch(() => false)
  if (!valid) return

  updating.value = true
  try {
    // 更新本地数据
    const index = ports.value.findIndex(p => p.port === editingPort.port)
    if (index !== -1) {
      ports.value[index].description = editingPort.description
    }
    
    showEditDialog.value = false
    ElMessage.success('端口信息更新成功')
  } catch (error) {
    ElMessage.error('更新端口信息失败')
  } finally {
    updating.value = false
  }
}

const confirmRemovePort = async (port: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要移除保留端口 ${port.port} 吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    emit('removePort', port.port)
    
    // 本地移除
    const index = ports.value.findIndex(p => p.port === port.port)
    if (index !== -1) {
      ports.value.splice(index, 1)
    }
    
    ElMessage.success(`保留端口 ${port.port} 移除成功`)
  } catch {
    // 用户取消操作
  }
}

const resetNewPort = () => {
  newPort.port = null
  newPort.description = ''
  newPort.category = 'custom'
}

const handleAddDialogClose = () => {
  if (!adding.value) {
    showAddDialog.value = false
    resetNewPort()
    nextTick(() => {
      portFormRef.value?.resetFields()
    })
  }
}

const handleEditDialogClose = () => {
  if (!updating.value) {
    showEditDialog.value = false
    nextTick(() => {
      editPortFormRef.value?.resetFields()
    })
  }
}

// 组件挂载时加载数据
onMounted(() => {
  refreshPorts()
})
</script>

<style scoped>
.reserved-ports-config {
  padding: 20px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.config-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
  font-weight: 600;
}

.ports-overview {
  margin-bottom: 24px;
}

.stat-card {
  height: 100%;
}

.stat-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
}

.stat-icon.system {
  background: linear-gradient(45deg, #ef4444, #dc2626);
}

.stat-icon.portal {
  background: linear-gradient(45deg, #f59e0b, #d97706);
}

.stat-icon.custom {
  background: linear-gradient(45deg, #10b981, #059669);
}

.stat-icon.total {
  background: linear-gradient(45deg, #3b82f6, #1d4ed8);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: #6b7280;
}

.ports-filters {
  margin-bottom: 24px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.ports-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.port-number {
  font-weight: 600;
  color: #1f2937;
}

.port-description {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.description-text {
  font-weight: 500;
  color: #1f2937;
}

.description-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.last-check {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.check-time {
  font-size: 12px;
  color: #1f2937;
}

.check-method {
  font-size: 11px;
  color: #6b7280;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.form-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .stat-content {
    flex-direction: column;
    text-align: center;
    gap: 8px;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>