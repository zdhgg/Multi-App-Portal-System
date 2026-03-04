 <template>
  <div class="port-configuration-tab">
    <!-- 配置概览 -->
    <div class="config-overview">
      <el-row :gutter="20">
        <el-col :span="8">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Setting /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">配置版本</div>
                <el-tooltip :content="`当前系统配置版本: ${configStats?.version || '1.0.0'}`" placement="top">
                  <div class="card-value">{{ configStats?.version || '1.0.0' }}</div>
                </el-tooltip>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Connection /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">可用端口</div>
                <el-tooltip 
                  :content="`实际可用端口: ${configStats?.realStats?.available || 0} 个\n总端口数: ${configStats?.realStats?.total || 0} 个\n已分配: ${configStats?.realStats?.allocated || 0} 个\n冲突: ${configStats?.realStats?.conflicts || 0} 个`" 
                  placement="top"
                >
                  <div class="card-value">
                    {{ configStats?.realStats?.available || 0 }}
                  </div>
                </el-tooltip>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card class="overview-card">
            <div class="card-content">
              <div class="card-icon">
                <el-icon size="24"><Clock /></el-icon>
              </div>
              <div class="card-info">
                <div class="card-title">最后更新</div>
                <el-tooltip 
                  :content="`完整更新时间: ${getFullDateTime(configStats?.lastUpdated)}`" 
                  placement="top"
                >
                  <div class="card-value text-sm">
                    {{ formatDate(configStats?.lastUpdated) }}
                  </div>
                </el-tooltip>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 配置子选项卡 -->
    <el-tabs v-model="activeSubTab" class="config-sub-tabs">
      <!-- 端口范围配置 -->
      <el-tab-pane label="端口范围" name="port-ranges">
        <div class="config-section">
          <div class="section-header">
            <h3>端口范围配置</h3>
            <p>设置前端和后端应用的端口分配范围</p>
          </div>
          
          <el-row :gutter="24">
            <el-col :span="12">
              <el-card class="range-card">
                <template #header>
                  <div class="card-header">
                    <el-icon><Monitor /></el-icon>
                    <span>前端端口范围</span>
                  </div>
                </template>
                
                <div class="range-config">
                  <div class="range-display">
                    <span class="range-label">当前范围:</span>
                    <el-tag type="primary" size="large">
                      {{ frontendRange.start }} - {{ frontendRange.end }}
                    </el-tag>
                  </div>
                  
                  <div class="range-inputs">
                    <el-form-item label="起始端口">
                      <el-input-number
                        v-model="frontendRange.start"
                        :min="1024"
                        :max="65535"
                        :step="1"
                        @change="validateRange"
                      />
                    </el-form-item>
                    <el-form-item label="结束端口">
                      <el-input-number
                        v-model="frontendRange.end"
                        :min="1024"
                        :max="65535"
                        :step="1"
                        @change="validateRange"
                      />
                    </el-form-item>
                  </div>
                  
                  <div class="range-info">
                    <el-text type="info" size="small">
                      可用端口数: {{ frontendRange.end - frontendRange.start + 1 }}
                    </el-text>
                  </div>
                </div>
              </el-card>
            </el-col>
            
            <el-col :span="12">
              <el-card class="range-card">
                <template #header>
                  <div class="card-header">
                    <el-icon><Monitor /></el-icon>
                    <span>后端端口范围</span>
                  </div>
                </template>
                
                <div class="range-config">
                  <div class="range-display">
                    <span class="range-label">当前范围:</span>
                    <el-tag type="success" size="large">
                      {{ backendRange.start }} - {{ backendRange.end }}
                    </el-tag>
                  </div>
                  
                  <div class="range-inputs">
                    <el-form-item label="起始端口">
                      <el-input-number
                        v-model="backendRange.start"
                        :min="1024"
                        :max="65535"
                        :step="1"
                        @change="validateRange"
                      />
                    </el-form-item>
                    <el-form-item label="结束端口">
                      <el-input-number
                        v-model="backendRange.end"
                        :min="1024"
                        :max="65535"
                        :step="1"
                        @change="validateRange"
                      />
                    </el-form-item>
                  </div>
                  
                  <div class="range-info">
                    <el-text type="info" size="small">
                      可用端口数: {{ backendRange.end - backendRange.start + 1 }}
                    </el-text>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
          
          <div class="section-actions">
            <el-button 
              type="primary" 
              :loading="loading.saveRanges"
              @click="savePortRanges"
            >
              保存端口范围
            </el-button>
            <el-button @click="resetPortRanges">重置为默认</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 保留端口配置 -->
      <el-tab-pane label="保留端口" name="reserved-ports">
        <div class="config-section">
          <div class="section-header">
            <h3>保留端口管理</h3>
            <p>配置系统保留端口，这些端口不会被自动分配</p>
          </div>
          
          <div class="reserved-ports-actions">
            <el-button 
              type="primary" 
              :icon="Plus" 
              @click="showAddReservedPort = true"
            >
              添加保留端口
            </el-button>
          </div>
          
          <el-table :data="reservedPorts" style="width: 100%">
            <el-table-column prop="port" label="端口" width="100" />
            <el-table-column prop="description" label="描述" />
            <el-table-column prop="category" label="类别" width="120">
              <template #default="scope">
                <el-tag 
                  :type="getCategoryType(scope.row.category)" 
                  size="small"
                >
                  {{ getCategoryName(scope.row.category) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="180">
              <template #default="scope">
                {{ formatDate(scope.row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button 
                  type="danger" 
                  size="small" 
                  @click="removeReservedPort(scope.row.port)"
                  :loading="loading.removePort"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <!-- 分配策略 -->
      <el-tab-pane label="分配策略" name="allocation-policy">
        <div class="config-section">
          <div class="section-header">
            <h3>端口分配策略</h3>
            <p>配置自动端口分配的策略和优先级</p>
          </div>
          
          <el-form :model="allocationPolicy" label-width="120px">
            <el-form-item label="分配策略">
              <el-radio-group v-model="allocationPolicy.strategy">
                <el-radio-button label="sequential">顺序分配</el-radio-button>
                <el-radio-button label="random">随机分配</el-radio-button>
                <el-radio-button label="balanced">负载均衡</el-radio-button>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="冲突处理">
              <el-radio-group v-model="allocationPolicy.conflictResolution">
                <el-radio-button label="skip">跳过冲突端口</el-radio-button>
                <el-radio-button label="retry">自动重试</el-radio-button>
                <el-radio-button label="manual">手动解决</el-radio-button>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="重试次数">
              <el-input-number 
                v-model="allocationPolicy.maxRetries" 
                :min="1" 
                :max="10"
                :disabled="allocationPolicy.conflictResolution !== 'retry'"
              />
            </el-form-item>
            
            <el-form-item label="超时时间">
              <el-input-number 
                v-model="allocationPolicy.timeout" 
                :min="1000" 
                :max="30000"
                :step="1000"
              />
              <el-text type="info" size="small" style="margin-left: 8px">毫秒</el-text>
            </el-form-item>
          </el-form>
          
          <div class="section-actions">
            <el-button 
              type="primary" 
              :loading="loading.savePolicy"
              @click="saveAllocationPolicy"
            >
              保存分配策略
            </el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 添加保留端口对话框 -->
    <el-dialog
      v-model="showAddReservedPort"
      title="添加保留端口"
      width="500px"
    >
      <el-form :model="newReservedPort" label-width="80px">
        <el-form-item label="端口号" required>
          <el-input-number 
            v-model="newReservedPort.port" 
            :min="1" 
            :max="65535"
            placeholder="请输入端口号"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input 
            v-model="newReservedPort.description" 
            placeholder="请输入端口用途描述"
          />
        </el-form-item>
        <el-form-item label="类别">
          <el-select v-model="newReservedPort.category" placeholder="请选择类别">
            <el-option label="系统端口" value="system" />
            <el-option label="门户端口" value="portal" />
            <el-option label="自定义端口" value="custom" />
          </el-select>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddReservedPort = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="loading.addPort"
          @click="addReservedPort"
        >
          添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Setting, 
  Connection, 
  Clock, 
  Monitor, 
  Plus
} from '@element-plus/icons-vue'

// 导入端口管理API服务
import { portManagementApiService } from '@/services/portManagementApi'

// 响应式数据
const activeSubTab = ref('port-ranges')
const showAddReservedPort = ref(false)

// 加载状态
const loading = reactive({
  saveRanges: false,
  savePolicy: false,
  addPort: false,
  removePort: false
})

// 端口范围配置
const frontendRange = reactive({
  start: 3001,
  end: 3100
})

const backendRange = reactive({
  start: 8001,
  end: 8100
})

// 分配策略配置
const allocationPolicy = reactive({
  strategy: 'sequential',
  conflictResolution: 'skip',
  maxRetries: 3,
  timeout: 5000
})

// 保留端口列表
const reservedPorts = ref([
  {
    port: 22,
    description: 'SSH服务',
    category: 'system',
    createdAt: '2025-09-28T00:00:00Z'
  },
  {
    port: 80,
    description: 'HTTP服务',
    category: 'system',
    createdAt: '2025-09-28T00:00:00Z'
  },
  {
    port: 443,
    description: 'HTTPS服务',
    category: 'system',
    createdAt: '2025-09-28T00:00:00Z'
  },
  {
    port: 3000,
    description: '门户前端服务',
    category: 'portal',
    createdAt: '2025-09-28T00:00:00Z'
  },
  {
    port: 8001,
    description: '检测API服务',
    category: 'portal',
    createdAt: '2025-09-28T00:00:00Z'
  }
])

// 新增保留端口表单
const newReservedPort = reactive({
  port: null,
  description: '',
  category: 'custom'
})

// 配置统计
const configStats = ref({
  version: '1.0.0',
  lastUpdated: '2025-09-28T02:28:33.133Z',
  portRangeSize: {
    frontend: 100,
    backend: 100
  },
  // 新增：真实端口统计数据
  realStats: {
    total: 0,
    available: 0,
    allocated: 0,
    conflicts: 0
  }
})

// 更新真实端口统计数据
const updateRealPortStats = async () => {
  try {
    console.log('🔄 配置页面：获取真实端口统计数据...')
    
    const result = await portManagementApiService.getPortStatistics()
    
    if (result.success && result.data) {
      const data = result.data
      
      configStats.value.realStats = {
        total: Number(data.total) || 0,
        available: Number(data.available) || 0,
        allocated: Number(data.totalAllocated ?? data.allocated ?? 0),
        conflicts: Number(data.conflicts || 0)
      }
      
      // 更新最后更新时间
      configStats.value.lastUpdated = new Date().toISOString()
      
      console.log('📊 配置页面：端口统计数据已更新', configStats.value.realStats)
    } else {
      console.warn('⚠️ 配置页面：端口统计API返回失败或无数据')
    }
  } catch (error) {
    console.error('配置页面：更新端口统计失败:', error)
  }
}

// 格式化日期，优先显示相对时间
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  // 根据时间距离选择合适的格式
  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  
  // 超过7天显示紧凑格式的日期
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit', 
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取完整日期时间，用于工具提示
const getFullDateTime = (dateString: string) => {
  if (!dateString) return 'N/A'
  
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取类别类型
const getCategoryType = (category: string) => {
  const types: Record<string, string> = {
    system: 'danger',
    portal: 'warning', 
    custom: 'info'
  }
  return types[category] || 'info'
}

// 获取类别名称
const getCategoryName = (category: string) => {
  const names: Record<string, string> = {
    system: '系统',
    portal: '门户',
    custom: '自定义'
  }
  return names[category] || category
}

// 验证端口范围
const validateRange = () => {
  // 检查前端范围
  if (frontendRange.start >= frontendRange.end) {
    ElMessage.warning('前端端口范围起始值必须小于结束值')
    return false
  }
  
  // 检查后端范围
  if (backendRange.start >= backendRange.end) {
    ElMessage.warning('后端端口范围起始值必须小于结束值')
    return false
  }
  
  // 检查范围重叠
  if (
    (frontendRange.start <= backendRange.end && frontendRange.end >= backendRange.start) ||
    (backendRange.start <= frontendRange.end && backendRange.end >= frontendRange.start)
  ) {
    ElMessage.warning('前端和后端端口范围不能重叠')
    return false
  }
  
  return true
}

// 保存端口范围
const savePortRanges = async () => {
  if (!validateRange()) return
  
  loading.saveRanges = true
  try {
    // 模拟保存操作
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 更新配置统计
    configStats.value.lastUpdated = new Date().toISOString()
    configStats.value.portRangeSize = {
      frontend: frontendRange.end - frontendRange.start + 1,
      backend: backendRange.end - backendRange.start + 1
    }
    
    // 更新真实端口统计数据
    await updateRealPortStats()
    
    ElMessage.success('端口范围配置保存成功')
  } catch (error) {
    ElMessage.error('保存端口范围失败')
  } finally {
    loading.saveRanges = false
  }
}

// 重置端口范围
const resetPortRanges = () => {
  frontendRange.start = 3001
  frontendRange.end = 3100
  backendRange.start = 8001
  backendRange.end = 8100
  ElMessage.success('端口范围已重置为默认值')
}

// 保存分配策略
const saveAllocationPolicy = async () => {
  loading.savePolicy = true
  try {
    // 模拟保存操作
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.success('分配策略保存成功')
  } catch (error) {
    ElMessage.error('保存分配策略失败')
  } finally {
    loading.savePolicy = false
  }
}

// 添加保留端口
const addReservedPort = async () => {
  if (!newReservedPort.port) {
    ElMessage.warning('请输入端口号')
    return
  }
  
  // 检查端口是否已存在
  if (reservedPorts.value.some(p => p.port === newReservedPort.port)) {
    ElMessage.warning('该端口已经被保留')
    return
  }
  
  loading.addPort = true
  try {
    // 模拟添加操作
    await new Promise(resolve => setTimeout(resolve, 500))
    
    reservedPorts.value.push({
      port: newReservedPort.port,
      description: newReservedPort.description || `端口 ${newReservedPort.port}`,
      category: newReservedPort.category,
      createdAt: new Date().toISOString()
    })
    
    // 重置表单
    newReservedPort.port = null
    newReservedPort.description = ''
    newReservedPort.category = 'custom'
    
    showAddReservedPort.value = false
    ElMessage.success('保留端口添加成功')
  } catch (error) {
    ElMessage.error('添加保留端口失败')
  } finally {
    loading.addPort = false
  }
}

// 移除保留端口
const removeReservedPort = async (port: number) => {
  try {
    await ElMessageBox.confirm(
      `确定要移除保留端口 ${port} 吗？`,
      '确认操作',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    loading.removePort = true
    
    // 模拟删除操作
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const index = reservedPorts.value.findIndex(p => p.port === port)
    if (index > -1) {
      reservedPorts.value.splice(index, 1)
      ElMessage.success(`保留端口 ${port} 已移除`)
    }
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('移除保留端口失败')
    }
  } finally {
    loading.removePort = false
  }
}

// 组件挂载时初始化
onMounted(async () => {
  console.log('端口配置选项卡初始化完成')
  
  // 获取真实的端口统计数据
  await updateRealPortStats()
})
</script>

<style scoped>
.port-configuration-tab {
  padding: 0;
}

/* 配置概览样式 */
.config-overview {
  margin-bottom: 24px;
}

.overview-card {
  min-height: 80px; /* 改为最小高度，允许内容撑开 */
  height: auto;
  border-radius: 8px;
  transition: all 0.3s ease; /* 添加平滑过渡效果 */
}

.overview-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-content {
  display: flex;
  align-items: center;
  min-height: 80px; /* 保持最小高度 */
  padding: 16px;
}

.card-icon {
  margin-right: 12px;
  padding: 8px;
  background: #f0f9ff;
  border-radius: 8px;
  color: #0284c7;
  flex-shrink: 0; /* 防止图标被挤压 */
}

.card-info {
  flex: 1;
  min-width: 0; /* 允许内容收缩，避免撑破容器 */
  overflow: hidden;
}

.card-title {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-value {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  /* 添加溢出处理 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  display: block;
}

.card-value.text-sm {
  font-size: 12px;
  font-weight: 400;
  /* 特殊处理小文本，允许换行但限制行数 */
  white-space: normal;
  line-height: 1.4;
  max-height: 2.8em; /* 限制最多两行 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word; /* 允许长单词换行 */
}

/* 配置子选项卡样式 - 全面优化 */
.config-sub-tabs {
  background: transparent;
  width: 100%;
  overflow: visible;
}

/* 确保所有标签都可见 */
:deep(.el-tabs__header) {
  width: 100%;
  overflow: visible;
}

/* 子选项卡容器整体优化 */
:deep(.el-tabs__nav-wrap) {
  padding: 4px 0;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #f1f5f9;
  margin-bottom: 8px;
  width: 100%;
  overflow: visible; /* 移除滚动，确保所有标签可见 */
  position: relative;
}

/* 子选项卡导航条 */
:deep(.el-tabs__nav) {
  display: flex;
  gap: 1px; /* 最小间距 */
  padding: 0 2px; /* 最小容器内边距 */
  width: 100%; /* 使用全宽 */
  overflow: visible;
  justify-content: flex-start;
  flex-wrap: nowrap;
}

/* 子选项卡单个标签优化 */
:deep(.el-tabs__item) {
  padding: 4px 6px !important; /* 非常紧凑的内边距 */
  min-height: 28px; /* 更小的高度 */
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 !important;
  border-radius: 3px; /* 最小圆角 */
  transition: all 0.3s ease;
  font-size: 11px; /* 更小的字体 */
  font-weight: 500;
  color: #6b7280;
  text-align: center;
  line-height: 1;
  white-space: nowrap;
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  flex: 1 1 auto; /* 允许弹性伸缩，平均分配空间 */
  min-width: 0; /* 允许收缩 */
  max-width: 100px; /* 限制最大宽度 */
}

.config-section {
  padding: 20px 0;
}

.section-header {
  margin-bottom: 20px;
}

.section-header h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.section-header p {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.section-actions {
  margin-top: 24px;
  display: flex;
  gap: 12px;
}

/* 端口范围配置样式 */
.range-card {
  height: 100%;
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.range-config {
  padding: 8px 0;
}

.range-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.range-label {
  font-size: 14px;
  color: #6b7280;
  font-weight: 500;
}

.range-inputs {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.range-inputs .el-form-item {
  flex: 1;
  margin-bottom: 0;
}

.range-info {
  text-align: center;
}

/* 保留端口配置样式 */
.reserved-ports-actions {
  margin-bottom: 16px;
}

/* 增强的响应式设计 */
/* 中等屏幕适配 */
@media (max-width: 1200px) {
  .overview-card {
    min-height: 85px; /* 中等屏幕稍微增加高度 */
  }
  
  .card-content {
    padding: 14px;
  }
  
  .card-value {
    font-size: 16px; /* 稍小字体 */
  }
  
  .card-value.text-sm {
    font-size: 11px;
  }
  
  /* 子选项卡中等屏幕适配 */
  :deep(.el-tabs__item) {
    padding: 3px 5px !important;
    font-size: 10px !important;
    min-height: 26px !important;
    max-width: 80px !important;
  }
}

/* 小屏幕适配 */
@media (max-width: 992px) {
  .config-overview :deep(.el-col) {
    margin-bottom: 16px;
  }
  
  .overview-card {
    min-height: 75px;
  }
  
  .card-content {
    padding: 12px;
  }
  
  .card-icon {
    margin-right: 10px;
    padding: 6px;
  }
  
  .card-value {
    font-size: 15px;
  }
  
  /* 子选项卡中等屏幕适配 */
  :deep(.el-tabs__nav-wrap) {
    padding: 3px 0;
    border-radius: 6px;
  }
  
  :deep(.el-tabs__nav) {
    gap: 1px;
    padding: 0 2px;
  }
  
  :deep(.el-tabs__item) {
    padding: 3px 4px !important;
    font-size: 10px !important;
    min-height: 24px !important;
    max-width: 70px !important;
  }
}

/* 移动端适配 */
@media (max-width: 768px) {
  .config-overview :deep(.el-col) {
    margin-bottom: 12px;
  }

  .overview-card {
    min-height: 70px; /* 移动端降低高度 */
    transition: none; /* 移动端去除过渡效果，提升性能 */
  }
  
  .overview-card:hover {
    transform: none; /* 移动端去除悬停效果 */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  .card-content {
    padding: 10px; /* 减小内边距 */
    min-height: 70px;
  }
  
  .card-icon {
    margin-right: 8px;
    padding: 4px;
  }
  
  .card-icon .el-icon {
    font-size: 20px !important; /* 移动端略小的图标 */
  }
  
  .card-title {
    font-size: 11px;
    margin-bottom: 2px;
  }
  
  .card-value {
    font-size: 14px;
  }
  
  .card-value.text-sm {
    font-size: 10px; /* 移动端更小字体 */
    -webkit-line-clamp: 1; /* 移动端只显示一行 */
    max-height: 1.4em;
  }

  .range-inputs {
    flex-direction: column;
    gap: 12px;
  }

  .section-actions {
    flex-direction: column;
    align-items: stretch;
  }
  
  /* 子选项卡移动端适配 */
  :deep(.el-tabs__nav-wrap) {
    padding: 2px 0;
    margin-bottom: 6px;
    border-radius: 4px;
    overflow: visible; /* 移除滚动 */
  }
  
  :deep(.el-tabs__nav) {
    gap: 1px;
    padding: 0 1px;
    width: 100%; /* 使用全宽 */
  }
  
  :deep(.el-tabs__item) {
    padding: 2px 3px !important;
    font-size: 9px !important;
    min-height: 22px !important;
    border-radius: 2px !important;
    max-width: 60px !important;
    flex: 1 1 auto !important; /* 平均分配空间 */
  }
  
  :deep(.el-tabs__item:hover:not(.is-active)) {
    transform: none; /* 移动端去除悬停上提效果 */
  }
  
  :deep(.el-tabs__header) {
    margin-bottom: 16px;
  }
}

/* 超小屏幕适配 */
@media (max-width: 480px) {
  .overview-card {
    min-height: 65px;
  }
  
  .card-content {
    padding: 8px;
    min-height: 65px;
  }
  
  .card-icon {
    margin-right: 6px;
    padding: 3px;
  }
  
  .card-icon .el-icon {
    font-size: 18px !important;
  }
  
  .card-title {
    font-size: 10px;
    margin-bottom: 1px;
  }
  
  .card-value {
    font-size: 13px;
  }
  
  .card-value.text-sm {
    font-size: 9px;
    line-height: 1.2;
  }
}

/* 标签悬停效果 */
:deep(.el-tabs__item:hover:not(.is-active)) {
  background: #f8fafc;
  color: #374151;
  transform: translateY(-1px); /* 轻微上提效果 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border-color: #e5e7eb;
}

/* 激活标签样式 */
:deep(.el-tabs__item.is-active) {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%) !important;
  color: #0284c7 !important;
  font-weight: 600 !important;
  border: 1px solid #bae6fd !important;
  box-shadow: 0 2px 12px rgba(2, 132, 199, 0.15) !important;
  transform: translateY(0) !important; /* 激活状态不上提 */
}

/* 隐藏默认的活动条，使用自定义背景色 */
:deep(.el-tabs__active-bar) {
  display: none; /* 隐藏默认活动指示条 */
}

/* 子选项卡头部设置 */
:deep(.el-tabs__header) {
  margin-bottom: 24px; /* 增加与内容的距离 */
  position: relative;
}

/* 隐藏默认的底部线条 */
:deep(.el-tabs__nav-wrap::after) {
  display: none; /* 不显示默认底部线条 */
}

/* 工具提示样式优化 */
:deep(.el-tooltip__popper) {
  background: rgba(0, 0, 0, 0.85);
  color: white;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.4;
  max-width: 300px;
  word-wrap: break-word;
  white-space: pre-line; /* 支持换行符 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

:deep(.el-tooltip__popper .el-popper__arrow::before) {
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.85);
}

/* 卡片交互性优化 */
.card-value {
  cursor: help; /* 提示用户可以悬停查看更多信息 */
  transition: color 0.2s ease;
}

.card-value:hover {
  color: #0284c7; /* 悬停时显示主色 */
}
</style>
