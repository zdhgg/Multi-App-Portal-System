<template>
  <div class="advanced-build-demo">
    <!-- 页面标题 -->
    <div class="demo-header">
      <h1>🚀 高级构建功能演示</h1>
      <p class="demo-subtitle">第4周新功能：WebSocket实时通信、构建缓存、模板管理、性能监控、批量操作</p>
    </div>

    <!-- 功能导航 -->
    <el-tabs v-model="activeTab" type="card" class="demo-tabs">
      <!-- WebSocket实时通信 -->
      <el-tab-pane label="🔄 实时通信" name="websocket">
        <div class="feature-section">
          <h3>WebSocket实时构建进度</h3>
          <el-card>
            <div class="websocket-demo">
              <el-button 
                type="primary" 
                @click="connectWebSocket"
                :disabled="wsConnected"
              >
                {{ wsConnected ? '已连接' : '连接WebSocket' }}
              </el-button>
              
              <el-button 
                type="success" 
                @click="simulateBuildProgress"
                :disabled="!wsConnected"
              >
                模拟构建进度
              </el-button>

              <div class="ws-status">
                <el-tag :type="wsConnected ? 'success' : 'danger'">
                  {{ wsConnected ? '🟢 WebSocket已连接' : '🔴 WebSocket未连接' }}
                </el-tag>
              </div>

              <div class="real-time-logs" v-if="realtimeLogs.length > 0">
                <h4>实时日志：</h4>
                <div class="log-container">
                  <div 
                    v-for="log in realtimeLogs" 
                    :key="log.id"
                    :class="['log-entry', `log-${log.level}`]"
                  >
                    <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                    <span class="log-message">{{ log.message }}</span>
                  </div>
                </div>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <!-- 构建缓存管理 -->
      <el-tab-pane label="💾 构建缓存" name="cache">
        <div class="feature-section">
          <h3>构建缓存管理</h3>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-card title="缓存统计">
                <div class="cache-stats" v-if="cacheStats">
                  <div class="stat-item">
                    <span class="stat-label">缓存条目：</span>
                    <span class="stat-value">{{ cacheStats.totalEntries }}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">缓存大小：</span>
                    <span class="stat-value">{{ formatSize(cacheStats.totalSize) }}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">命中率：</span>
                    <span class="stat-value">{{ (cacheStats.hitRate * 100).toFixed(1) }}%</span>
                  </div>
                </div>
                <el-button type="primary" @click="loadCacheStats">刷新统计</el-button>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card title="缓存操作">
                <el-button type="warning" @click="cleanupCache">清理过期缓存</el-button>
                <el-button type="danger" @click="clearAllCache">清空所有缓存</el-button>
                <div class="cache-result" v-if="cacheCleanupResult">
                  <p>清理结果：删除 {{ cacheCleanupResult.deletedEntries }} 个条目，释放 {{ formatSize(cacheCleanupResult.freedSpace) }}</p>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-tab-pane>

      <!-- 构建模板 -->
      <el-tab-pane label="📋 构建模板" name="templates">
        <div class="feature-section">
          <h3>构建模板管理</h3>
          <div class="template-filters">
            <el-select v-model="templateFilters.framework" placeholder="选择框架" clearable>
              <el-option label="React" value="react" />
              <el-option label="Vue" value="vue" />
              <el-option label="Angular" value="angular" />
              <el-option label="Next.js" value="nextjs" />
            </el-select>
            <el-select v-model="templateFilters.buildTool" placeholder="选择构建工具" clearable>
              <el-option label="Vite" value="vite" />
              <el-option label="Webpack" value="webpack" />
              <el-option label="Next.js" value="nextjs" />
              <el-option label="Angular CLI" value="angular" />
            </el-select>
            <el-button type="primary" @click="loadTemplates">加载模板</el-button>
          </div>

          <div class="templates-grid">
            <el-card 
              v-for="template in buildTemplates" 
              :key="template.id"
              class="template-card"
            >
              <template #header>
                <div class="template-header">
                  <span>{{ template.name }}</span>
                  <el-tag :type="template.category === 'official' ? 'success' : 'info'">
                    {{ template.category }}
                  </el-tag>
                </div>
              </template>
              <p>{{ template.description }}</p>
              <div class="template-tags">
                <el-tag v-for="tag in template.tags" :key="tag" size="small">{{ tag }}</el-tag>
              </div>
              <div class="template-actions">
                <el-button size="small" @click="applyTemplate(template.id)">应用模板</el-button>
                <el-button size="small" type="info" @click="viewTemplate(template)">查看详情</el-button>
              </div>
            </el-card>
          </div>
        </div>
      </el-tab-pane>

      <!-- 性能监控 -->
      <el-tab-pane label="📊 性能监控" name="performance">
        <div class="feature-section">
          <h3>构建性能分析</h3>
          <el-row :gutter="20">
            <el-col :span="16">
              <el-card title="性能趋势图">
                <div class="performance-chart">
                  <div v-if="performanceTrend" class="trend-summary">
                    <div class="trend-item">
                      <span>平均构建时间：</span>
                      <span>{{ formatDuration(performanceTrend.metrics.averageDuration) }}</span>
                    </div>
                    <div class="trend-item">
                      <span>成功率：</span>
                      <span>{{ (performanceTrend.metrics.successRate * 100).toFixed(1) }}%</span>
                    </div>
                    <div class="trend-item">
                      <span>总构建次数：</span>
                      <span>{{ performanceTrend.metrics.buildCount }}</span>
                    </div>
                  </div>
                  <!-- 这里可以集成图表库如ECharts -->
                  <div class="chart-placeholder">
                    📈 性能趋势图表（可集成ECharts）
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card title="性能报告">
                <el-button type="primary" @click="generatePerformanceReport">生成报告</el-button>
                <div v-if="performanceReport" class="report-summary">
                  <h4>报告摘要</h4>
                  <p>总构建数：{{ performanceReport.summary.totalBuilds }}</p>
                  <p>成功构建：{{ performanceReport.summary.successfulBuilds }}</p>
                  <p>失败构建：{{ performanceReport.summary.failedBuilds }}</p>
                  <p>平均耗时：{{ formatDuration(performanceReport.summary.averageDuration) }}</p>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-tab-pane>

      <!-- 批量操作 -->
      <el-tab-pane label="🔄 批量构建" name="batch">
        <div class="feature-section">
          <h3>批量构建管理</h3>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-card title="创建批量构建">
                <el-form :model="batchBuildForm" label-width="120px">
                  <el-form-item label="构建名称">
                    <el-input v-model="batchBuildForm.name" placeholder="输入批量构建名称" />
                  </el-form-item>
                  <el-form-item label="选择应用">
                    <el-select v-model="batchBuildForm.appIds" multiple placeholder="选择要构建的应用">
                      <el-option label="应用1" value="app1" />
                      <el-option label="应用2" value="app2" />
                      <el-option label="应用3" value="app3" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="构建环境">
                    <el-radio-group v-model="batchBuildForm.environment">
                      <el-radio label="development">开发环境</el-radio>
                      <el-radio label="production">生产环境</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item label="并行构建">
                    <el-switch v-model="batchBuildForm.parallel" />
                  </el-form-item>
                  <el-form-item>
                    <el-button type="primary" @click="createBatchBuild">创建批量构建</el-button>
                  </el-form-item>
                </el-form>
              </el-card>
            </el-col>
            <el-col :span="12">
              <el-card title="批量构建状态">
                <div v-if="batchBuildStatus" class="batch-status">
                  <div class="status-item">
                    <span>状态：</span>
                    <el-tag :type="getBatchStatusType(batchBuildStatus.status)">
                      {{ batchBuildStatus.status }}
                    </el-tag>
                  </div>
                  <div class="status-item">
                    <span>总应用数：</span>
                    <span>{{ batchBuildStatus.totalApps }}</span>
                  </div>
                  <div class="status-item">
                    <span>成功：</span>
                    <span class="success-count">{{ batchBuildStatus.successfulApps }}</span>
                  </div>
                  <div class="status-item">
                    <span>失败：</span>
                    <span class="failed-count">{{ batchBuildStatus.failedApps }}</span>
                  </div>
                  <div class="status-item">
                    <span>进度：</span>
                    <el-progress 
                      :percentage="getBatchProgress(batchBuildStatus)" 
                      :status="batchBuildStatus.status === 'failed' ? 'exception' : undefined"
                    />
                  </div>
                </div>
                <el-button 
                  v-if="currentBatchId" 
                  type="primary" 
                  @click="executeBatchBuild"
                  :disabled="batchBuildStatus?.status === 'running'"
                >
                  {{ batchBuildStatus?.status === 'running' ? '构建中...' : '执行批量构建' }}
                </el-button>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 模板详情对话框 -->
    <el-dialog v-model="templateDialogVisible" title="模板详情" width="60%">
      <div v-if="selectedTemplate" class="template-details">
        <h4>{{ selectedTemplate.name }}</h4>
        <p>{{ selectedTemplate.description }}</p>
        <div class="template-config">
          <h5>构建配置：</h5>
          <pre>{{ JSON.stringify(selectedTemplate.config, null, 2) }}</pre>
        </div>
        <div class="template-scripts">
          <h5>构建脚本：</h5>
          <pre>{{ JSON.stringify(selectedTemplate.buildScripts, null, 2) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { advancedBuildApiService } from '@/services/buildApi'

// 响应式数据
const activeTab = ref('websocket')
const wsConnected = ref(false)
const realtimeLogs = ref<any[]>([])
const cacheStats = ref<any>(null)
const cacheCleanupResult = ref<any>(null)
const buildTemplates = ref<any[]>([])
const performanceTrend = ref<any>(null)
const performanceReport = ref<any>(null)
const batchBuildStatus = ref<any>(null)
const currentBatchId = ref<string>('')
const currentExecutionId = ref<string>('')
const templateDialogVisible = ref(false)
const selectedTemplate = ref<any>(null)

// 表单数据
const templateFilters = reactive({
  framework: '',
  buildTool: ''
})

const batchBuildForm = reactive({
  name: '',
  appIds: [],
  environment: 'production',
  parallel: true
})

// WebSocket相关
let ws: WebSocket | null = null

const connectWebSocket = () => {
  try {
    ws = new WebSocket('ws://localhost:3001')
    
    ws.onopen = () => {
      wsConnected.value = true
      ElMessage.success('WebSocket连接成功')
    }
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'build_progress' || data.type === 'build_log') {
        realtimeLogs.value.unshift({
          id: Date.now(),
          timestamp: Date.now(),
          level: 'info',
          message: `收到实时消息: ${data.type} - ${JSON.stringify(data.payload)}`
        })
      }
    }
    
    ws.onclose = () => {
      wsConnected.value = false
      ElMessage.warning('WebSocket连接已断开')
    }
    
    ws.onerror = () => {
      ElMessage.error('WebSocket连接错误')
    }
  } catch (error) {
    ElMessage.error('WebSocket连接失败')
  }
}

const simulateBuildProgress = () => {
  if (!wsConnected.value) return
  
  const steps = ['准备构建环境', '安装依赖', '编译代码', '优化资源', '生成产物']
  let currentStep = 0
  
  const interval = setInterval(() => {
    if (currentStep < steps.length) {
      realtimeLogs.value.unshift({
        id: Date.now(),
        timestamp: Date.now(),
        level: 'info',
        message: `构建步骤 ${currentStep + 1}/5: ${steps[currentStep]}`
      })
      currentStep++
    } else {
      clearInterval(interval)
      realtimeLogs.value.unshift({
        id: Date.now(),
        timestamp: Date.now(),
        level: 'success',
        message: '🎉 构建完成！'
      })
    }
  }, 1000)
}

// 缓存管理
const loadCacheStats = async () => {
  try {
    const response = await advancedBuildApiService.getCacheStats()
    if (response.success) {
      cacheStats.value = response.data
    }
  } catch (error) {
    ElMessage.error('加载缓存统计失败')
  }
}

const cleanupCache = async () => {
  try {
    const response = await advancedBuildApiService.cleanupCache()
    if (response.success) {
      cacheCleanupResult.value = response.data
      ElMessage.success('缓存清理完成')
      await loadCacheStats()
    }
  } catch (error) {
    ElMessage.error('缓存清理失败')
  }
}

const clearAllCache = () => {
  ElMessage.info('清空所有缓存功能演示')
}

// 模板管理
const loadTemplates = async () => {
  try {
    const response = await advancedBuildApiService.getBuildTemplates(templateFilters)
    if (response.success && response.data) {
      buildTemplates.value = response.data
    }
  } catch (error) {
    ElMessage.error('加载模板失败')
  }
}

const applyTemplate = async (templateId: string) => {
  try {
    const response = await advancedBuildApiService.applyBuildTemplate(templateId, 'demo-app')
    if (response.success) {
      ElMessage.success('模板应用成功')
    }
  } catch (error) {
    ElMessage.error('模板应用失败')
  }
}

const viewTemplate = (template: any) => {
  selectedTemplate.value = template
  templateDialogVisible.value = true
}

// 性能监控
const loadPerformanceTrend = async () => {
  try {
    const response = await advancedBuildApiService.getPerformanceTrend('demo-app')
    if (response.success) {
      performanceTrend.value = response.data
    }
  } catch (error) {
    ElMessage.error('加载性能趋势失败')
  }
}

const generatePerformanceReport = async () => {
  try {
    const response = await advancedBuildApiService.generatePerformanceReport('demo-app')
    if (response.success) {
      performanceReport.value = response.data
      ElMessage.success('性能报告生成成功')
    }
  } catch (error) {
    ElMessage.error('生成性能报告失败')
  }
}

// 批量构建
const createBatchBuild = async () => {
  try {
    const batchRequest = {
      name: batchBuildForm.name,
      appIds: batchBuildForm.appIds,
      buildOptions: {
        environment: batchBuildForm.environment,
        parallel: batchBuildForm.parallel,
        maxConcurrency: 3
      },
      notifications: {
        onSuccess: [],
        onFailure: [],
        onComplete: []
      },
      createdBy: 'demo-user',
      isActive: true
    }
    
    const response = await advancedBuildApiService.createBatchBuild(batchRequest)
    if (response.success && response.data) {
      currentBatchId.value = response.data.batchId
      ElMessage.success('批量构建创建成功')
    }
  } catch (error) {
    ElMessage.error('创建批量构建失败')
  }
}

const executeBatchBuild = async () => {
  if (!currentBatchId.value) return
  
  try {
    const response = await advancedBuildApiService.executeBatchBuild(currentBatchId.value)
    if (response.success && response.data) {
      currentExecutionId.value = response.data.executionId
      ElMessage.success('批量构建已开始执行')
      // 开始轮询状态
      pollBatchStatus()
    }
  } catch (error) {
    ElMessage.error('执行批量构建失败')
  }
}

const pollBatchStatus = () => {
  if (!currentExecutionId.value) return
  
  const interval = setInterval(async () => {
    try {
      const response = await advancedBuildApiService.getBatchBuildStatus(currentExecutionId.value)
      if (response.success) {
        batchBuildStatus.value = response.data
        
        if (response.data.status === 'completed' || response.data.status === 'failed') {
          clearInterval(interval)
        }
      }
    } catch (error) {
      clearInterval(interval)
    }
  }, 2000)
}

// 工具函数
const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString()
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDuration = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  }
  return `${seconds}秒`
}

const getBatchStatusType = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'running': return 'primary'
    case 'failed': return 'danger'
    default: return 'info'
  }
}

const getBatchProgress = (status: any) => {
  if (!status) return 0
  const completed = status.successfulApps + status.failedApps
  return Math.round((completed / status.totalApps) * 100)
}

// 生命周期
onMounted(() => {
  // 初始化演示数据
  cacheStats.value = {
    totalEntries: 42,
    totalSize: 1024 * 1024 * 150, // 150MB
    hitRate: 0.85
  }
  
  buildTemplates.value = [
    {
      id: 'react-vite-ts',
      name: 'React + Vite + TypeScript',
      description: 'Modern React application with Vite and TypeScript',
      category: 'official',
      tags: ['react', 'vite', 'typescript'],
      config: { buildCommand: 'npm run build', outputDir: 'dist' },
      buildScripts: { dev: 'vite', build: 'vite build' }
    }
  ]
})
</script>

<style scoped>
.advanced-build-demo {
  padding: 20px;
}

.demo-header {
  text-align: center;
  margin-bottom: 30px;
}

.demo-subtitle {
  color: #666;
  font-size: 16px;
}

.demo-tabs {
  margin-top: 20px;
}

.feature-section {
  padding: 20px 0;
}

.websocket-demo {
  text-align: center;
}

.ws-status {
  margin: 20px 0;
}

.real-time-logs {
  margin-top: 20px;
  text-align: left;
}

.log-container {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  padding: 10px;
  background: #f9f9f9;
}

.log-entry {
  margin-bottom: 5px;
  font-family: monospace;
}

.log-time {
  color: #666;
  margin-right: 10px;
}

.cache-stats .stat-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.template-filters {
  margin-bottom: 20px;
}

.template-filters .el-select {
  margin-right: 10px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.template-card {
  height: 100%;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-tags {
  margin: 10px 0;
}

.template-tags .el-tag {
  margin-right: 5px;
}

.template-actions {
  margin-top: 15px;
}

.performance-chart {
  text-align: center;
}

.trend-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.trend-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chart-placeholder {
  height: 200px;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #ddd;
}

.batch-status .status-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}

.success-count {
  color: #67c23a;
}

.failed-count {
  color: #f56c6c;
}

.template-details pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}
</style>
