<template>
  <div class="advanced-config">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- Tab 1: 检测设置（合并技术栈+检测规则） -->
      <el-tab-pane label="检测设置" name="detection">
        <div class="config-section">
          <h4>🎯 技术栈优先级</h4>
          <p class="section-desc">优先级高的技术栈会优先匹配</p>
          
          <el-table :data="techStackPriorities" style="width: 100%" size="small">
            <el-table-column prop="name" label="技术栈" width="120" />
            <el-table-column prop="description" label="描述" />
            <el-table-column label="优先级" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.priority" :min="1" :max="10" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="启用" width="70">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" size="small" />
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-divider />

        <div class="config-section">
          <h4>📋 检测规则</h4>
          <el-form :model="detectionConfig" label-width="120px" size="small">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="置信度阈值">
                  <el-slider v-model="detectionConfig.confidenceThreshold" :min="0" :max="100" :step="5" show-tooltip />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="并发检测数">
                  <el-input-number v-model="detectionConfig.concurrency" :min="1" :max="10" style="width: 100%;" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="跳过隐藏文件">
              <el-switch v-model="detectionConfig.skipHidden" />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- Tab 2: 端口管理 -->
      <el-tab-pane label="端口管理" name="ports">
        <div class="config-section">
          <h4>端口分配策略</h4>
          
          <el-form :model="portConfig" label-width="140px">
            <el-form-item label="分配策略">
              <el-radio-group v-model="portConfig.strategy">
                <el-radio label="smart">智能分配</el-radio>
                <el-radio label="sequential">顺序分配</el-radio>
                <el-radio label="random">随机分配</el-radio>
                <el-radio label="manual">手动指定</el-radio>
              </el-radio-group>
            </el-form-item>
            
            <el-form-item label="端口范围">
              <el-col :span="11">
                <el-input-number 
                  v-model="portConfig.range.start" 
                  :min="1024" 
                  :max="65535"
                  placeholder="起始端口"
                />
              </el-col>
              <el-col :span="2" class="text-center">
                <span>-</span>
              </el-col>
              <el-col :span="11">
                <el-input-number 
                  v-model="portConfig.range.end" 
                  :min="1024" 
                  :max="65535"
                  placeholder="结束端口"
                />
              </el-col>
            </el-form-item>
            
            <el-form-item label="避免冲突">
              <el-switch 
                v-model="portConfig.avoidConflicts"
                active-text="启用"
                inactive-text="关闭"
              />
              <div class="form-hint">自动检测端口占用并避免冲突</div>
            </el-form-item>
            
            <el-form-item label="保留端口">
              <el-select 
                v-model="portConfig.reservedPorts" 
                multiple
                filterable
                allow-create
                placeholder="输入要保留的端口"
              >
                <el-option 
                  v-for="port in commonReservedPorts"
                  :key="port.value"
                  :label="port.label"
                  :value="port.value"
                />
              </el-select>
            </el-form-item>
          </el-form>
          
          <!-- 端口测试 -->
          <div class="port-test">
            <h4>端口可用性测试</h4>
            <el-input 
              v-model="testPort" 
              placeholder="输入端口号"
              style="width: 200px"
            >
              <template #append>
                <el-button @click="testPortAvailability" :loading="testing">
                  测试
                </el-button>
              </template>
            </el-input>
            
            <div v-if="testResult" class="test-result">
              <el-tag :type="testResult.available ? 'success' : 'danger'">
                {{ testResult.available ? '可用' : '占用' }}
              </el-tag>
              <span v-if="testResult.details">{{ testResult.details }}</span>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- Tab 3: 输出与性能（合并） -->
      <el-tab-pane label="输出与性能" name="output">
        <div class="config-section">
          <h4>📤 输出设置</h4>
          
          <el-form :model="outputConfig" label-width="120px" size="small">
            <el-form-item label="输出格式">
              <el-checkbox-group v-model="outputConfig.formats">
                <el-checkbox label="json">JSON</el-checkbox>
                <el-checkbox label="csv">CSV</el-checkbox>
                <el-checkbox label="excel">Excel</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="包含详情">
              <el-checkbox-group v-model="outputConfig.includeDetails">
                <el-checkbox label="dependencies">依赖信息</el-checkbox>
                <el-checkbox label="suggestions">优化建议</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            
            <el-form-item label="生成报告">
              <el-switch v-model="outputConfig.generateReport" />
            </el-form-item>
          </el-form>
        </div>

        <el-divider />

        <div class="config-section">
          <h4>⚡ 性能设置</h4>
          
          <el-form :model="performanceConfig" label-width="120px" size="small">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="内存限制">
                  <el-select v-model="performanceConfig.memoryLimit" style="width: 100%;">
                    <el-option label="512MB" value="512MB" />
                    <el-option label="1GB" value="1GB" />
                    <el-option label="2GB" value="2GB" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="超时时间">
                  <el-input-number v-model="performanceConfig.timeout" :min="30" :max="300" style="width: 100%;" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="智能优化">
              <el-switch v-model="performanceConfig.smartOptimization" />
              <span class="form-hint" style="margin-left: 8px;">自动调整参数</span>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 配置操作 -->
    <div class="config-actions">
      <el-button @click="resetToDefaults">重置为默认</el-button>
      <el-button @click="loadPreset">加载预设</el-button>
      <el-button @click="saveAsPreset">保存为预设</el-button>
      <el-button type="primary" @click="applyConfig">应用配置</el-button>
    </div>

    <!-- 配置预览 -->
    <el-card shadow="never" class="config-preview">
      <template #header>
        <span>配置预览</span>
      </template>
      <pre><code>{{ JSON.stringify(allConfig, null, 2) }}</code></pre>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, FolderOpened } from '@element-plus/icons-vue'

export interface AdvancedConfigData {
  techStack: {
    priorities: Array<{
      name: string
      description: string
      priority: number
      enabled: boolean
    }>
    customRules: Array<{
      name: string
      pattern: string
      techStack: string
    }>
  }
  ports: {
    strategy: 'smart' | 'sequential' | 'random' | 'manual'
    range: { start: number, end: number }
    avoidConflicts: boolean
    reservedPorts: string[]
  }
  detection: {
    confidenceThreshold: number
    maxDepth: number
    maxFileSize: string
    skipHidden: boolean
    concurrency: number
  }
  performance: {
    memoryLimit: string
    cacheStrategy: 'none' | 'memory' | 'disk' | 'hybrid'
    batchSize: number
    timeout: number
    smartOptimization: boolean
  }
  output: {
    formats: string[]
    includeDetails: string[]
    generateReport: boolean
    outputPath: string
  }
}

const emit = defineEmits<{
  'config-change': [config: AdvancedConfigData]
  'apply-config': [config: AdvancedConfigData]
}>()

// 响应式数据
const activeTab = ref('detection')
const testing = ref(false)
const testPort = ref('')
const testResult = ref<{ available: boolean, details?: string } | null>(null)

// 技术栈配置
const techStackPriorities = ref([
  { name: 'React', description: 'React 及相关生态', priority: 9, enabled: true },
  { name: 'Vue', description: 'Vue.js 框架', priority: 8, enabled: true },
  { name: 'Angular', description: 'Angular 框架', priority: 7, enabled: true },
  { name: 'Node.js', description: 'Node.js 后端', priority: 8, enabled: true },
  { name: 'Express', description: 'Express 框架', priority: 7, enabled: true },
  { name: 'Next.js', description: 'Next.js 全栈框架', priority: 9, enabled: true },
  { name: 'Nuxt.js', description: 'Nuxt.js 全栈框架', priority: 8, enabled: true },
  { name: 'Vite', description: 'Vite 构建工具', priority: 6, enabled: true },
  { name: 'Webpack', description: 'Webpack 构建工具', priority: 5, enabled: true }
])

const customRules = ref([
  {
    name: '自定义React规则',
    pattern: '**/*.jsx,**/*.tsx',
    techStack: 'React'
  }
])

// 端口配置
const portConfig = ref<AdvancedConfigData['ports']>({
  strategy: 'smart',
  range: { start: 3000, end: 9999 },
  avoidConflicts: true,
  reservedPorts: ['3000', '8000', '8080']
})

const commonReservedPorts = [
  { label: '3000 (React默认)', value: '3000' },
  { label: '8000 (Django默认)', value: '8000' },
  { label: '8080 (通用HTTP)', value: '8080' },
  { label: '5000 (Flask默认)', value: '5000' },
  { label: '4200 (Angular默认)', value: '4200' },
  { label: '5173 (Vite默认)', value: '5173' }
]

// 检测配置
const detectionConfig = ref({
  confidenceThreshold: 70,
  maxDepth: 5,
  maxFileSize: '10MB',
  skipHidden: true,
  concurrency: 5
})

// 性能配置
const performanceConfig = ref<AdvancedConfigData['performance']>({
  memoryLimit: '1GB',
  cacheStrategy: 'memory',
  batchSize: 100,
  timeout: 30,
  smartOptimization: true
})

// 输出配置
const outputConfig = ref({
  formats: ['json'],
  includeDetails: ['dependencies', 'files'],
  generateReport: true,
  outputPath: ''
})

// 计算属性
const allConfig = computed<AdvancedConfigData>(() => ({
  techStack: {
    priorities: techStackPriorities.value,
    customRules: customRules.value
  },
  ports: portConfig.value,
  detection: detectionConfig.value,
  performance: performanceConfig.value,
  output: outputConfig.value
}))

// 方法
const addCustomRule = () => {
  customRules.value.push({
    name: '新规则',
    pattern: '**/*.*',
    techStack: 'Unknown'
  })
}

const removeCustomRule = (index: number) => {
  customRules.value.splice(index, 1)
}

const addDetectionRule = () => {
  // 添加检测规则的逻辑
  ElMessage.info('添加检测规则功能开发中')
}

const testPortAvailability = async () => {
  if (!testPort.value) {
    ElMessage.warning('请输入端口号')
    return
  }
  
  testing.value = true
  
  try {
    // 模拟端口测试
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const isAvailable = Math.random() > 0.5
    testResult.value = {
      available: isAvailable,
      details: isAvailable ? '端口可用' : '端口被占用 (process: node.exe)'
    }
  } catch (error) {
    ElMessage.error('端口测试失败')
  } finally {
    testing.value = false
  }
}

const selectOutputPath = () => {
  // 模拟文件选择
  outputConfig.value.outputPath = 'D:\\Projects\\scan-results'
  ElMessage.success('已选择输出路径')
}

const resetToDefaults = () => {
  // 重置所有配置为默认值
  ElMessage.success('已重置为默认配置')
}

const loadPreset = () => {
  // 加载预设配置
  ElMessage.info('加载预设功能开发中')
}

const saveAsPreset = () => {
  // 保存为预设
  ElMessage.info('保存预设功能开发中')
}

const applyConfig = () => {
  emit('apply-config', allConfig.value)
  ElMessage.success('配置已应用')
}

// 监听配置变化
const emitConfigChange = () => {
  emit('config-change', allConfig.value)
}

// 暴露配置给父组件
defineExpose({
  getConfig: () => allConfig.value,
  setConfig: (config: AdvancedConfigData) => {
    techStackPriorities.value = config.techStack.priorities
    customRules.value = config.techStack.customRules
    portConfig.value = config.ports
    detectionConfig.value = config.detection
    performanceConfig.value = config.performance
    outputConfig.value = config.output
  }
})
</script>

<style scoped>
.advanced-config {
  max-width: 1000px;
}

.config-section {
  padding: 20px;
}

.config-section h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 16px 0;
  color: #606266;
  font-size: 14px;
}

.config-item {
  margin: 24px 0;
}

.form-hint {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.text-center {
  text-align: center;
}

.port-test {
  margin-top: 24px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.test-result {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-rules {
  margin-top: 24px;
}

.config-actions {
  margin: 24px 0;
  text-align: center;
  border-top: 1px solid #e4e7ed;
  padding-top: 24px;
}

.config-actions .el-button {
  margin: 0 8px;
}

.config-preview {
  margin-top: 20px;
}

.config-preview pre {
  background: #f5f5f5;
  padding: 16px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
  color: #606266;
  margin: 0;
}

:deep(.el-tabs__content) {
  padding: 0;
}

:deep(.el-table) {
  font-size: 14px;
}

:deep(.el-slider) {
  margin: 12px 0;
}
</style>
