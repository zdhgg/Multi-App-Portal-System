<template>
  <div class="week5-demo">
    <div class="demo-header">
      <h1>🚀 第5周功能演示 - 最终优化和完善</h1>
      <p class="demo-description">
        展示智能化前端构建功能的最终优化和完善阶段的5个核心功能
      </p>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="demo-tabs">
      <!-- 构建流水线可视化 -->
      <el-tab-pane label="🔄 构建流水线可视化" name="pipeline">
        <div class="feature-section">
          <div class="feature-header">
            <h2>构建流水线可视化</h2>
            <p>图形化的构建流程设计器，支持拖拽式构建步骤编排</p>
          </div>

          <div class="feature-content">
            <div class="pipeline-controls">
              <el-button type="primary" @click="loadPipelines">
                <el-icon><Refresh /></el-icon>
                刷新流水线
              </el-button>
              <el-button type="success" @click="createPipelineDialog = true">
                <el-icon><Plus /></el-icon>
                创建流水线
              </el-button>
            </div>

            <div class="pipeline-list">
              <el-card v-for="pipeline in pipelines" :key="pipeline.id" class="pipeline-card">
                <template #header>
                  <div class="pipeline-header">
                    <span>{{ pipeline.name }}</span>
                    <el-tag :type="pipeline.isActive ? 'success' : 'info'">
                      {{ pipeline.isActive ? '活跃' : '非活跃' }}
                    </el-tag>
                  </div>
                </template>
                <p>{{ pipeline.description }}</p>
                <div class="pipeline-meta">
                  <el-tag size="small">{{ pipeline.type }}</el-tag>
                  <span class="meta-item">节点: {{ pipeline.nodes?.length || 0 }}</span>
                  <span class="meta-item">边: {{ pipeline.edges?.length || 0 }}</span>
                </div>
                <div class="pipeline-actions">
                  <el-button size="small" @click="executePipeline(pipeline.id)">
                    <el-icon><VideoPlay /></el-icon>
                    执行
                  </el-button>
                  <el-button size="small" type="info" @click="viewPipeline(pipeline)">
                    <el-icon><View /></el-icon>
                    查看
                  </el-button>
                </div>
              </el-card>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 多环境部署管理 -->
      <el-tab-pane label="🌍 多环境部署管理" name="environment">
        <div class="feature-section">
          <div class="feature-header">
            <h2>多环境部署管理</h2>
            <p>统一管理开发/测试/生产环境，支持环境间配置差异化管理</p>
          </div>

          <div class="feature-content">
            <div class="environment-controls">
              <el-button type="primary" @click="loadEnvironments">
                <el-icon><Refresh /></el-icon>
                刷新环境
              </el-button>
              <el-select v-model="envFilter" placeholder="筛选环境类型" clearable>
                <el-option label="开发环境" value="development" />
                <el-option label="测试环境" value="testing" />
                <el-option label="生产环境" value="production" />
              </el-select>
            </div>

            <div class="environment-grid">
              <el-card v-for="env in filteredEnvironments" :key="env.id" class="environment-card">
                <template #header>
                  <div class="env-header">
                    <span>{{ env.name }}</span>
                    <el-tag :type="getEnvStatusType(env.status)">
                      {{ getEnvStatusText(env.status) }}
                    </el-tag>
                  </div>
                </template>
                <div class="env-info">
                  <p><strong>类型:</strong> {{ env.type }}</p>
                  <p><strong>描述:</strong> {{ env.description }}</p>
                  <p><strong>优先级:</strong> {{ env.metadata?.priority || 0 }}</p>
                </div>
                <div class="env-actions">
                  <el-button size="small" type="success" @click="deployToEnv(env.id)">
                    <el-icon><Upload /></el-icon>
                    部署
                  </el-button>
                  <el-button size="small" type="info" @click="checkEnvHealth(env.id)">
                    <el-icon><Monitor /></el-icon>
                    健康检查
                  </el-button>
                </div>
              </el-card>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 构建安全扫描 -->
      <el-tab-pane label="🔒 构建安全扫描" name="security">
        <div class="feature-section">
          <div class="feature-header">
            <h2>构建安全扫描</h2>
            <p>依赖漏洞检测、构建产物安全扫描、安全策略配置管理</p>
          </div>

          <div class="feature-content">
            <div class="security-controls">
              <el-select v-model="selectedApp" placeholder="选择应用" style="width: 200px">
                <el-option 
                  v-for="app in applications" 
                  :key="app.id" 
                  :label="app.name" 
                  :value="app.id" 
                />
              </el-select>
              <el-select v-model="scanType" placeholder="扫描类型" style="width: 150px">
                <el-option label="全面扫描" value="full" />
                <el-option label="依赖扫描" value="dependency" />
                <el-option label="代码扫描" value="code" />
                <el-option label="容器扫描" value="container" />
              </el-select>
              <el-button type="danger" @click="startSecurityScan" :disabled="!selectedApp">
                <el-icon><Shield /></el-icon>
                开始扫描
              </el-button>
            </div>

            <div class="security-results">
              <el-card v-if="securityScanResult" class="scan-result-card">
                <template #header>
                  <div class="scan-header">
                    <span>安全扫描结果</span>
                    <el-tag :type="getScanStatusType(securityScanResult.status)">
                      {{ securityScanResult.status }}
                    </el-tag>
                  </div>
                </template>
                <div class="scan-summary">
                  <div class="summary-item">
                    <span class="label">扫描类型:</span>
                    <span>{{ securityScanResult.type }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">开始时间:</span>
                    <span>{{ formatTime(securityScanResult.startTime) }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="label">持续时间:</span>
                    <span>{{ securityScanResult.duration || 0 }}ms</span>
                  </div>
                </div>
                <div class="scan-progress" v-if="securityScanResult.status === 'scanning'">
                  <el-progress :percentage="scanProgress" :status="scanProgress === 100 ? 'success' : 'active'" />
                </div>
              </el-card>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- AI驱动的优化建议 -->
      <el-tab-pane label="🤖 AI优化建议" name="ai">
        <div class="feature-section">
          <div class="feature-header">
            <h2>AI驱动的优化建议</h2>
            <p>基于历史构建数据的机器学习分析，智能识别性能瓶颈和优化机会</p>
          </div>

          <div class="feature-content">
            <div class="ai-controls">
              <el-select v-model="selectedApp" placeholder="选择应用" style="width: 200px">
                <el-option 
                  v-for="app in applications" 
                  :key="app.id" 
                  :label="app.name" 
                  :value="app.id" 
                />
              </el-select>
              <el-select v-model="analysisType" placeholder="分析类型" style="width: 150px">
                <el-option label="综合分析" value="comprehensive" />
                <el-option label="性能分析" value="performance" />
                <el-option label="资源分析" value="resource" />
                <el-option label="依赖分析" value="dependency" />
              </el-select>
              <el-button type="primary" @click="startAIAnalysis" :disabled="!selectedApp">
                <el-icon><MagicStick /></el-icon>
                开始分析
              </el-button>
            </div>

            <div class="ai-results">
              <el-card v-if="aiAnalysisResult" class="analysis-result-card">
                <template #header>
                  <div class="analysis-header">
                    <span>AI分析结果</span>
                    <el-tag :type="getAnalysisStatusType(aiAnalysisResult.status)">
                      {{ aiAnalysisResult.status }}
                    </el-tag>
                  </div>
                </template>
                <div class="analysis-content">
                  <div class="analysis-summary">
                    <div class="summary-item">
                      <span class="label">分析类型:</span>
                      <span>{{ aiAnalysisResult.type }}</span>
                    </div>
                    <div class="summary-item">
                      <span class="label">置信度:</span>
                      <span>{{ (aiAnalysisResult.metadata?.confidence * 100 || 0).toFixed(1) }}%</span>
                    </div>
                    <div class="summary-item">
                      <span class="label">洞察数量:</span>
                      <span>{{ aiAnalysisResult.insights?.length || 0 }}</span>
                    </div>
                    <div class="summary-item">
                      <span class="label">建议数量:</span>
                      <span>{{ aiAnalysisResult.recommendations?.length || 0 }}</span>
                    </div>
                  </div>
                  <div class="analysis-progress" v-if="aiAnalysisResult.status === 'analyzing'">
                    <el-progress :percentage="analysisProgress" :status="analysisProgress === 100 ? 'success' : 'active'" />
                  </div>
                </div>
              </el-card>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 性能基准测试 -->
      <el-tab-pane label="📊 性能基准测试" name="benchmark">
        <div class="feature-section">
          <div class="feature-header">
            <h2>性能基准测试</h2>
            <p>自动化的性能回归测试、构建性能基准建立和对比</p>
          </div>

          <div class="feature-content">
            <div class="benchmark-controls">
              <el-button type="primary" @click="loadBenchmarks">
                <el-icon><Refresh /></el-icon>
                刷新基准测试
              </el-button>
              <el-button type="success" @click="createBenchmarkDialog = true">
                <el-icon><Plus /></el-icon>
                创建基准测试
              </el-button>
            </div>

            <div class="benchmark-list">
              <el-card v-for="benchmark in benchmarks" :key="benchmark.id" class="benchmark-card">
                <template #header>
                  <div class="benchmark-header">
                    <span>{{ benchmark.name }}</span>
                    <el-tag :type="benchmark.status === 'active' ? 'success' : 'info'">
                      {{ benchmark.status }}
                    </el-tag>
                  </div>
                </template>
                <p>{{ benchmark.description }}</p>
                <div class="benchmark-meta">
                  <el-tag size="small">{{ benchmark.type }}</el-tag>
                  <span class="meta-item">迭代: {{ benchmark.configuration?.parameters?.iterations || 0 }}</span>
                  <span class="meta-item">指标: {{ benchmark.configuration?.metrics?.length || 0 }}</span>
                </div>
                <div class="benchmark-actions">
                  <el-button size="small" type="primary" @click="executeBenchmark(benchmark.id)">
                    <el-icon><Timer /></el-icon>
                    执行测试
                  </el-button>
                  <el-button size="small" type="info" @click="viewBenchmarkHistory(benchmark.id)">
                    <el-icon><TrendCharts /></el-icon>
                    查看历史
                  </el-button>
                </div>
              </el-card>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 创建流水线对话框 -->
    <el-dialog v-model="createPipelineDialog" title="创建构建流水线" width="50%">
      <el-form :model="pipelineForm" label-width="100px">
        <el-form-item label="流水线名称">
          <el-input v-model="pipelineForm.name" placeholder="请输入流水线名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="pipelineForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="pipelineForm.type" placeholder="选择流水线类型">
            <el-option label="构建流水线" value="build" />
            <el-option label="测试流水线" value="test" />
            <el-option label="部署流水线" value="deploy" />
            <el-option label="完整流水线" value="full-pipeline" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createPipelineDialog = false">取消</el-button>
        <el-button type="primary" @click="createPipeline">创建</el-button>
      </template>
    </el-dialog>

    <!-- 创建基准测试对话框 -->
    <el-dialog v-model="createBenchmarkDialog" title="创建性能基准测试" width="50%">
      <el-form :model="benchmarkForm" label-width="100px">
        <el-form-item label="测试名称">
          <el-input v-model="benchmarkForm.name" placeholder="请输入测试名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="benchmarkForm.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="测试类型">
          <el-select v-model="benchmarkForm.type" placeholder="选择测试类型">
            <el-option label="构建测试" value="build" />
            <el-option label="测试性能" value="test" />
            <el-option label="部署测试" value="deploy" />
            <el-option label="完整流水线" value="full-pipeline" />
          </el-select>
        </el-form-item>
        <el-form-item label="应用">
          <el-select v-model="benchmarkForm.appId" placeholder="选择应用">
            <el-option 
              v-for="app in applications" 
              :key="app.id" 
              :label="app.name" 
              :value="app.id" 
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createBenchmarkDialog = false">取消</el-button>
        <el-button type="primary" @click="createBenchmark">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Refresh, Plus, VideoPlay, View, Upload, Monitor, 
  MagicStick, Timer, TrendCharts 
} from '@element-plus/icons-vue'
// Note: buildApiService is not used as all API calls are mocked in this demo
// @ts-ignore - Demo file with mock API calls
const buildApiService: any = {}

// 响应式数据
const activeTab = ref('pipeline')
const applications = ref<any[]>([])
const pipelines = ref<any[]>([])
const environments = ref<any[]>([])
const benchmarks = ref<any[]>([])

// 筛选和选择
const envFilter = ref('')
const selectedApp = ref('')
const scanType = ref('full')
const analysisType = ref('comprehensive')

// 结果数据
const securityScanResult = ref<any>(null)
const aiAnalysisResult = ref<any>(null)
const scanProgress = ref(0)
const analysisProgress = ref(0)

// 对话框控制
const createPipelineDialog = ref(false)
const createBenchmarkDialog = ref(false)

// 表单数据
const pipelineForm = reactive({
  name: '',
  description: '',
  type: 'build'
})

const benchmarkForm = reactive({
  name: '',
  description: '',
  type: 'build',
  appId: ''
})

// 计算属性
const filteredEnvironments = computed(() => {
  if (!envFilter.value) return environments.value
  return environments.value.filter(env => env.type === envFilter.value)
})

// 方法
const loadApplications = async () => {
  try {
    // 模拟加载应用列表
    applications.value = [
      { id: 'app1', name: 'React应用' },
      { id: 'app2', name: 'Vue应用' },
      { id: 'app3', name: 'Angular应用' }
    ]
  } catch (error) {
    ElMessage.error('加载应用列表失败')
  }
}

const loadPipelines = async () => {
  try {
    const response = await buildApiService.get('/pipelines')
    pipelines.value = response.data || []
    ElMessage.success('流水线列表已刷新')
  } catch (error) {
    ElMessage.error('加载流水线失败')
    // 模拟数据
    pipelines.value = [
      {
        id: 'pipeline1',
        name: '前端CI/CD流水线',
        description: '完整的前端应用CI/CD流水线',
        type: 'full-pipeline',
        isActive: true,
        nodes: [1, 2, 3, 4, 5],
        edges: [1, 2, 3, 4]
      }
    ]
  }
}

const loadEnvironments = async () => {
  try {
    const response = await buildApiService.get('/environments')
    environments.value = response.data || []
    ElMessage.success('环境列表已刷新')
  } catch (error) {
    ElMessage.error('加载环境失败')
    // 模拟数据
    environments.value = [
      {
        id: 'env1',
        name: 'development',
        type: 'development',
        description: '开发环境',
        status: 'active',
        metadata: { priority: 1 }
      },
      {
        id: 'env2',
        name: 'production',
        type: 'production',
        description: '生产环境',
        status: 'active',
        metadata: { priority: 3 }
      }
    ]
  }
}

const loadBenchmarks = async () => {
  try {
    const response = await buildApiService.get('/benchmarks')
    benchmarks.value = response.data || []
    ElMessage.success('基准测试列表已刷新')
  } catch (error) {
    ElMessage.error('加载基准测试失败')
    // 模拟数据
    benchmarks.value = [
      {
        id: 'benchmark1',
        name: '构建性能基准测试',
        description: '测量应用构建过程的性能指标',
        type: 'build',
        status: 'active',
        configuration: {
          parameters: { iterations: 5 },
          metrics: [1, 2, 3, 4]
        }
      }
    ]
  }
}

const executePipeline = async (pipelineId: string) => {
  try {
    const response = await buildApiService.post(`/pipelines/${pipelineId}/execute`, {
      triggeredBy: 'manual'
    })
    ElMessage.success('流水线执行已启动')
  } catch (error) {
    ElMessage.error('执行流水线失败')
  }
}

const deployToEnv = async (envId: string) => {
  if (!selectedApp.value) {
    ElMessage.warning('请先选择要部署的应用')
    return
  }

  try {
    const response = await buildApiService.post(`/environments/${envId}/deploy/${selectedApp.value}`, {
      version: '1.0.0',
      deployedBy: 'manual'
    })
    ElMessage.success('部署已启动')
  } catch (error) {
    ElMessage.error('部署失败')
  }
}

const checkEnvHealth = async (envId: string) => {
  try {
    const response = await buildApiService.get(`/environments/${envId}/health`)
    const health = response.data
    ElMessage.success(`环境健康状态: ${health.status}`)
  } catch (error) {
    ElMessage.error('健康检查失败')
  }
}

const startSecurityScan = async () => {
  try {
    const response = await buildApiService.post(`/security/scan/${selectedApp.value}`, {
      type: scanType.value,
      triggeredBy: 'manual'
    })
    
    securityScanResult.value = {
      id: response.data.scanId,
      type: scanType.value,
      status: 'scanning',
      startTime: Date.now()
    }
    
    // 模拟扫描进度
    simulateScanProgress()
    ElMessage.success('安全扫描已启动')
  } catch (error) {
    ElMessage.error('启动安全扫描失败')
  }
}

const startAIAnalysis = async () => {
  try {
    const response = await buildApiService.post(`/ai/analyze/${selectedApp.value}`, {
      type: analysisType.value,
      triggeredBy: 'manual'
    })
    
    aiAnalysisResult.value = {
      id: response.data.analysisId,
      type: analysisType.value,
      status: 'analyzing',
      startTime: Date.now(),
      metadata: { confidence: 0 },
      insights: [],
      recommendations: []
    }
    
    // 模拟分析进度
    simulateAnalysisProgress()
    ElMessage.success('AI分析已启动')
  } catch (error) {
    ElMessage.error('启动AI分析失败')
  }
}

const executeBenchmark = async (benchmarkId: string) => {
  try {
    const response = await buildApiService.post(`/benchmarks/${benchmarkId}/execute`, {
      triggeredBy: 'manual'
    })
    ElMessage.success('基准测试执行已启动')
  } catch (error) {
    ElMessage.error('执行基准测试失败')
  }
}

const createPipeline = async () => {
  try {
    const response = await buildApiService.post('/pipelines', {
      ...pipelineForm,
      nodes: [],
      edges: [],
      variables: {},
      triggers: [],
      notifications: [],
      metadata: {
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        category: 'custom'
      },
      isActive: true
    })
    
    ElMessage.success('流水线创建成功')
    createPipelineDialog.value = false
    loadPipelines()
  } catch (error) {
    ElMessage.error('创建流水线失败')
  }
}

const createBenchmark = async () => {
  try {
    const response = await buildApiService.post('/benchmarks', {
      ...benchmarkForm,
      configuration: {
        environment: {
          nodeVersion: 'latest',
          platform: 'linux',
          cpu: '2 cores',
          memory: '4GB',
          disk: 'SSD'
        },
        parameters: {
          iterations: 5,
          warmupRuns: 2,
          timeout: 600000,
          parallel: false,
          cacheEnabled: true
        },
        metrics: [],
        thresholds: [],
        triggers: []
      },
      baseline: {
        summary: {
          totalTime: 0,
          successRate: 100,
          errorRate: 0,
          throughput: 0,
          score: 0,
          grade: 'A',
          regressions: 0,
          improvements: 0
        },
        metrics: [],
        iterations: [],
        resources: {
          peak: { timestamp: Date.now(), cpu: 0, memory: 0, disk: 0, network: { inbound: 0, outbound: 0 }, processes: 0 },
          average: { timestamp: Date.now(), cpu: 0, memory: 0, disk: 0, network: { inbound: 0, outbound: 0 }, processes: 0 },
          timeline: [],
          efficiency: { cpuEfficiency: 0, memoryEfficiency: 0, diskEfficiency: 0 }
        },
        logs: [],
        artifacts: []
      },
      status: 'active',
      metadata: {
        createdBy: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        tags: []
      }
    })
    
    ElMessage.success('基准测试创建成功')
    createBenchmarkDialog.value = false
    loadBenchmarks()
  } catch (error) {
    ElMessage.error('创建基准测试失败')
  }
}

// 辅助方法
const simulateScanProgress = () => {
  const interval = setInterval(() => {
    scanProgress.value += 10
    if (scanProgress.value >= 100) {
      clearInterval(interval)
      if (securityScanResult.value) {
        securityScanResult.value.status = 'completed'
        securityScanResult.value.duration = Date.now() - securityScanResult.value.startTime
      }
    }
  }, 500)
}

const simulateAnalysisProgress = () => {
  const interval = setInterval(() => {
    analysisProgress.value += 10
    if (analysisProgress.value >= 100) {
      clearInterval(interval)
      if (aiAnalysisResult.value) {
        aiAnalysisResult.value.status = 'completed'
        aiAnalysisResult.value.duration = Date.now() - aiAnalysisResult.value.startTime
        aiAnalysisResult.value.metadata.confidence = 0.85
        aiAnalysisResult.value.insights = [1, 2, 3]
        aiAnalysisResult.value.recommendations = [1, 2]
      }
    }
  }, 600)
}

const getEnvStatusType = (status: string) => {
  switch (status) {
    case 'active': return 'success'
    case 'inactive': return 'info'
    case 'maintenance': return 'warning'
    case 'error': return 'danger'
    default: return 'info'
  }
}

const getEnvStatusText = (status: string) => {
  switch (status) {
    case 'active': return '活跃'
    case 'inactive': return '非活跃'
    case 'maintenance': return '维护中'
    case 'error': return '错误'
    default: return status
  }
}

const getScanStatusType = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'scanning': return 'primary'
    case 'failed': return 'danger'
    default: return 'info'
  }
}

const getAnalysisStatusType = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'analyzing': return 'primary'
    case 'failed': return 'danger'
    default: return 'info'
  }
}

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString()
}

const viewPipeline = (pipeline: any) => {
  ElMessage.info(`查看流水线: ${pipeline.name}`)
}

const viewBenchmarkHistory = (benchmarkId: string) => {
  ElMessage.info(`查看基准测试历史: ${benchmarkId}`)
}

// 生命周期
onMounted(() => {
  loadApplications()
  loadPipelines()
  loadEnvironments()
  loadBenchmarks()
})
</script>

<style scoped>
.week5-demo {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.demo-header {
  text-align: center;
  margin-bottom: 30px;
}

.demo-header h1 {
  color: #409eff;
  margin-bottom: 10px;
}

.demo-description {
  color: #666;
  font-size: 16px;
}

.demo-tabs {
  min-height: 600px;
}

.feature-section {
  padding: 20px;
}

.feature-header {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e4e7ed;
}

.feature-header h2 {
  color: #303133;
  margin-bottom: 8px;
}

.feature-header p {
  color: #606266;
  margin: 0;
}

.feature-content {
  margin-top: 20px;
}

.pipeline-controls,
.environment-controls,
.security-controls,
.ai-controls,
.benchmark-controls {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  align-items: center;
}

.pipeline-list,
.environment-grid,
.benchmark-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.pipeline-card,
.environment-card,
.benchmark-card {
  transition: all 0.3s;
}

.pipeline-card:hover,
.environment-card:hover,
.benchmark-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.pipeline-header,
.env-header,
.benchmark-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pipeline-meta,
.benchmark-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}

.meta-item {
  font-size: 12px;
  color: #909399;
}

.pipeline-actions,
.env-actions,
.benchmark-actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}

.env-info {
  margin: 15px 0;
}

.env-info p {
  margin: 5px 0;
  font-size: 14px;
}

.security-results,
.ai-results {
  margin-top: 20px;
}

.scan-result-card,
.analysis-result-card {
  max-width: 600px;
}

.scan-header,
.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.scan-summary,
.analysis-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 15px;
}

.summary-item {
  display: flex;
  justify-content: space-between;
}

.summary-item .label {
  font-weight: 500;
  color: #606266;
}

.scan-progress,
.analysis-progress {
  margin-top: 15px;
}
</style>
