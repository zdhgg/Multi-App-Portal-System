<template>
  <div class="allocation-policy-config">
    <div class="config-header">
      <h3>端口分配策略</h3>
      <div class="header-actions">
        <el-button @click="resetToDefaults" :icon="Refresh">重置默认</el-button>
        <el-button type="primary" @click="savePolicy" :loading="saving">
          保存策略
        </el-button>
      </div>
    </div>

    <!-- 策略概览 -->
    <div class="policy-overview">
      <el-alert
        title="分配策略说明"
        description="端口分配策略决定了系统如何为新应用分配端口号。合理的策略可以提高端口利用率并减少冲突。"
        type="info"
        :closable="false"
        show-icon
      />
    </div>

    <div class="config-content">
      <el-row :gutter="24">
        <!-- 基本分配策略 -->
        <el-col :span="12">
          <el-card shadow="hover" class="policy-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Setting /></el-icon>
                <span>基本分配策略</span>
              </div>
            </template>

            <el-form :model="localPolicy" label-width="140px">
              <el-form-item label="随机起始端口">
                <el-switch
                  v-model="localPolicy.randomizeStartPort"
                  active-text="启用"
                  inactive-text="禁用"
                />
                <div class="field-hint">
                  启用后，系统会从范围内随机选择起始端口，避免总是从最小端口开始分配
                </div>
              </el-form-item>

              <el-form-item label="冲突解决方式">
                <el-select v-model="localPolicy.conflictResolution" placeholder="选择策略">
                  <el-option 
                    label="自动重新分配" 
                    value="auto_reassign"
                  >
                    <div class="option-content">
                      <div class="option-title">自动重新分配</div>
                      <div class="option-desc">发生冲突时自动尝试其他可用端口</div>
                    </div>
                  </el-option>
                  <el-option 
                    label="手动处理" 
                    value="manual"
                  >
                    <div class="option-content">
                      <div class="option-title">手动处理</div>
                      <div class="option-desc">发生冲突时提示用户手动选择端口</div>
                    </div>
                  </el-option>
                  <el-option 
                    label="分配失败" 
                    value="fail"
                  >
                    <div class="option-content">
                      <div class="option-title">分配失败</div>
                      <div class="option-desc">发生冲突时直接失败，不尝试解决</div>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <el-form-item label="策略描述">
                <el-input
                  v-model="localPolicy.description"
                  type="textarea"
                  :rows="3"
                  placeholder="描述当前分配策略的特点和适用场景"
                  maxlength="200"
                  show-word-limit
                />
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>

        <!-- 高级设置 -->
        <el-col :span="12">
          <el-card shadow="hover" class="policy-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><Tools /></el-icon>
                <span>高级设置</span>
              </div>
            </template>

            <el-form :model="localPolicy" label-width="140px">
              <el-form-item label="最大重试次数">
                <el-input-number
                  v-model="localPolicy.maxRetries"
                  :min="1"
                  :max="10"
                  :step="1"
                  placeholder="重试次数"
                />
                <div class="field-hint">
                  分配端口失败时的最大重试次数，建议设置为3-5次
                </div>
              </el-form-item>

              <el-form-item label="重试间隔(毫秒)">
                <el-input-number
                  v-model="localPolicy.retryDelayMs"
                  :min="50"
                  :max="5000"
                  :step="50"
                  placeholder="间隔时间"
                />
                <div class="field-hint">
                  每次重试之间的等待时间，防止频繁重试导致系统负载
                </div>
              </el-form-item>

              <el-form-item label="分配超时(秒)">
                <el-input-number
                  v-model="localPolicy.allocationTimeout"
                  :min="5"
                  :max="60"
                  :step="5"
                  placeholder="超时时间"
                />
                <div class="field-hint">
                  单次端口分配的最大等待时间
                </div>
              </el-form-item>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <!-- 智能分配策略 -->
      <el-row :gutter="24" style="margin-top: 24px;">
        <el-col :span="24">
          <el-card shadow="hover" class="policy-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><MagicStick /></el-icon>
                <span>智能分配策略</span>
              </div>
            </template>

            <div class="intelligent-policy">
              <el-row :gutter="24">
                <el-col :span="8">
                  <div class="strategy-option">
                    <el-checkbox v-model="localPolicy.enablePortClustering">
                      端口聚类分配
                    </el-checkbox>
                    <div class="strategy-desc">
                      将相关应用的端口分配在相邻区域，便于管理和监控
                    </div>
                  </div>
                </el-col>
                
                <el-col :span="8">
                  <div class="strategy-option">
                    <el-checkbox v-model="localPolicy.enableLoadBalancing">
                      负载均衡分配
                    </el-checkbox>
                    <div class="strategy-desc">
                      根据端口使用情况，智能分配到负载较低的端口范围
                    </div>
                  </div>
                </el-col>
                
                <el-col :span="8">
                  <div class="strategy-option">
                    <el-checkbox v-model="localPolicy.enableHistoryLearning">
                      历史学习优化
                    </el-checkbox>
                    <div class="strategy-desc">
                      基于历史分配数据，学习并优化分配策略
                    </div>
                  </div>
                </el-col>
              </el-row>

              <el-divider />

              <!-- 技术栈特定策略 -->
              <div class="tech-stack-policies">
                <h4>技术栈特定策略</h4>
                <el-table :data="techStackPolicies" stripe>
                  <el-table-column prop="techStack" label="技术栈" width="150" />
                  <el-table-column prop="preferredRange" label="优先范围">
                    <template #default="{ row }">
                      <el-tag size="small">{{ row.preferredRange }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="strategy" label="分配策略" />
                  <el-table-column label="操作" width="120">
                    <template #default="{ row, $index }">
                      <el-button size="small" @click="editTechStackPolicy(row, $index)">
                        配置
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 策略测试和预览 -->
      <el-row :gutter="24" style="margin-top: 24px;">
        <el-col :span="24">
          <el-card shadow="hover" class="policy-card">
            <template #header>
              <div class="card-header">
                <el-icon class="header-icon"><View /></el-icon>
                <span>策略预览和测试</span>
              </div>
            </template>

            <div class="policy-preview">
              <div class="preview-actions">
                <el-button @click="simulateAllocation" :loading="simulating" :icon="VideoPlay">
                  模拟分配
                </el-button>
                <el-button @click="exportPolicy" :icon="Download">
                  导出策略
                </el-button>
                <el-button @click="importPolicy" :icon="Upload">
                  导入策略
                </el-button>
              </div>

              <div v-if="simulationResult" class="simulation-result">
                <h4>模拟分配结果</h4>
                <el-table :data="simulationResult" stripe max-height="300">
                  <el-table-column prop="appName" label="应用名称" />
                  <el-table-column prop="techStack" label="技术栈" />
                  <el-table-column prop="allocatedPort" label="分配端口">
                    <template #default="{ row }">
                      <el-tag :type="row.success ? 'success' : 'danger'">
                        {{ row.allocatedPort || '分配失败' }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="allocationTime" label="分配耗时(ms)" />
                  <el-table-column prop="retryCount" label="重试次数" />
                </el-table>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 技术栈策略配置对话框 -->
    <el-dialog
      v-model="showTechStackDialog"
      title="技术栈分配策略配置"
      width="600px"
    >
      <el-form :model="editingTechStack" label-width="120px">
        <el-form-item label="技术栈">
          <el-input v-model="editingTechStack.techStack" disabled />
        </el-form-item>
        
        <el-form-item label="优先范围">
          <el-select v-model="editingTechStack.preferredRange">
            <el-option label="前端范围" value="frontend" />
            <el-option label="后端范围" value="backend" />
            <el-option label="自动选择" value="auto" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="分配策略">
          <el-input
            v-model="editingTechStack.strategy"
            placeholder="描述该技术栈的分配策略"
          />
        </el-form-item>
        
        <el-form-item label="端口偏移">
          <el-input-number
            v-model="editingTechStack.portOffset"
            :min="0"
            :max="100"
            placeholder="相对起始端口的偏移量"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showTechStackDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTechStackPolicy">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Setting, Tools, MagicStick, View, VideoPlay, Download, Upload, Refresh
} from '@element-plus/icons-vue'
import { usePortConfigStore } from '@/stores/portConfig'

const portConfigStore = usePortConfigStore()

const emit = defineEmits<{
  update: [policy: any]
}>()

// 响应式数据
const saving = ref(false)
const simulating = ref(false)
const showTechStackDialog = ref(false)
const simulationResult = ref<any[]>([])

const localPolicy = reactive({
  randomizeStartPort: true,
  description: '随机选择起始端口以避免总是从最小端口开始分配',
  maxRetries: 3,
  retryDelayMs: 100,
  allocationTimeout: 30,
  conflictResolution: 'auto_reassign',
  enablePortClustering: false,
  enableLoadBalancing: true,
  enableHistoryLearning: false
})

const techStackPolicies = ref([
  { techStack: 'Vue 3 + Vite', preferredRange: 'frontend', strategy: '优先分配前端范围端口', portOffset: 0 },
  { techStack: 'React + Vite', preferredRange: 'frontend', strategy: '优先分配前端范围端口', portOffset: 10 },
  { techStack: 'Node.js + Express', preferredRange: 'backend', strategy: '优先分配后端范围端口', portOffset: 0 },
  { techStack: 'Next.js', preferredRange: 'frontend', strategy: '全栈框架，优先前端范围', portOffset: 20 }
])

const editingTechStack = reactive({
  techStack: '',
  preferredRange: 'auto',
  strategy: '',
  portOffset: 0,
  index: -1
})

// 初始化
onMounted(() => {
  const config = portConfigStore.portConfig
  if (config?.allocationPolicy) {
    Object.assign(localPolicy, config.allocationPolicy)
  }
})

// 保存策略
const savePolicy = async () => {
  saving.value = true
  try {
    emit('update', { ...localPolicy })
    ElMessage.success('分配策略保存成功')
  } catch (error) {
    ElMessage.error('保存策略失败')
  } finally {
    saving.value = false
  }
}

// 重置为默认值
const resetToDefaults = () => {
  Object.assign(localPolicy, {
    randomizeStartPort: true,
    description: '随机选择起始端口以避免总是从最小端口开始分配',
    maxRetries: 3,
    retryDelayMs: 100,
    allocationTimeout: 30,
    conflictResolution: 'auto_reassign',
    enablePortClustering: false,
    enableLoadBalancing: true,
    enableHistoryLearning: false
  })
  ElMessage.success('策略已重置为默认值')
}

// 编辑技术栈策略
const editTechStackPolicy = (policy: any, index: number) => {
  Object.assign(editingTechStack, { ...policy, index })
  showTechStackDialog.value = true
}

// 保存技术栈策略
const saveTechStackPolicy = () => {
  if (editingTechStack.index >= 0) {
    techStackPolicies.value[editingTechStack.index] = {
      techStack: editingTechStack.techStack,
      preferredRange: editingTechStack.preferredRange,
      strategy: editingTechStack.strategy,
      portOffset: editingTechStack.portOffset
    }
  }
  showTechStackDialog.value = false
  ElMessage.success('技术栈策略保存成功')
}

// 模拟分配
const simulateAllocation = async () => {
  simulating.value = true
  try {
    // 模拟分配过程
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    simulationResult.value = [
      { appName: 'Vue App 1', techStack: 'Vue 3 + Vite', allocatedPort: 3001, allocationTime: 25, retryCount: 0, success: true },
      { appName: 'React App 1', techStack: 'React + Vite', allocatedPort: 3011, allocationTime: 45, retryCount: 1, success: true },
      { appName: 'API Server', techStack: 'Node.js + Express', allocatedPort: 4001, allocationTime: 15, retryCount: 0, success: true },
      { appName: 'Next.js App', techStack: 'Next.js', allocatedPort: 3021, allocationTime: 35, retryCount: 0, success: true },
      { appName: 'Conflict App', techStack: 'Vue 3 + Vite', allocatedPort: null, allocationTime: 150, retryCount: 3, success: false }
    ]
    
    ElMessage.success('分配模拟完成')
  } catch (error) {
    ElMessage.error('模拟分配失败')
  } finally {
    simulating.value = false
  }
}

// 导出策略
const exportPolicy = () => {
  const policyData = {
    ...localPolicy,
    techStackPolicies: techStackPolicies.value
  }
  
  const blob = new Blob([JSON.stringify(policyData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `port-allocation-policy-${new Date().toISOString().split('T')[0]}.json`
  link.click()
  
  URL.revokeObjectURL(url)
  ElMessage.success('策略导出成功')
}

// 导入策略
const importPolicy = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e: any) => {
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const policyData = JSON.parse(e.target?.result as string)
        Object.assign(localPolicy, policyData)
        if (policyData.techStackPolicies) {
          techStackPolicies.value = policyData.techStackPolicies
        }
        ElMessage.success('策略导入成功')
      } catch (error) {
        ElMessage.error('策略文件格式错误')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}
</script>

<style scoped>
.allocation-policy-config {
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

.header-actions {
  display: flex;
  gap: 12px;
}

.policy-overview {
  margin-bottom: 24px;
}

.policy-card {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1f2937;
}

.header-icon {
  color: #3b82f6;
  font-size: 18px;
}

.field-hint {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  line-height: 1.4;
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-title {
  font-weight: 600;
  color: #1f2937;
}

.option-desc {
  font-size: 12px;
  color: #6b7280;
}

.intelligent-policy {
  padding: 16px;
}

.strategy-option {
  margin-bottom: 16px;
}

.strategy-desc {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
  line-height: 1.4;
}

.tech-stack-policies {
  margin-top: 24px;
}

.tech-stack-policies h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

.policy-preview {
  padding: 16px;
}

.preview-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.simulation-result {
  margin-top: 24px;
}

.simulation-result h4 {
  margin: 0 0 16px 0;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .config-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .preview-actions {
    flex-direction: column;
  }
}
</style>