<template>
  <div class="charts-demo">
    <el-page-header @back="$router.go(-1)">
      <template #content>
        <div class="page-header">
          <h1>ECharts 图表展示</h1>
          <p>第三阶段新增功能演示 - 数据可视化图表库集成</p>
        </div>
      </template>
    </el-page-header>

    <div class="demo-content">
      <!-- 图表类型选择 -->
      <el-card style="margin-bottom: 20px;">
        <template #header>
          <div class="card-header">
            <span>图表类型演示</span>
            <div>
              <el-button @click="generateMockData" type="primary" :icon="Refresh" size="small">
                生成模拟数据
              </el-button>
            </div>
          </div>
        </template>
        
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
          <el-tab-pane label="折线图" name="line">
            <PerformanceChart
              title="响应时间趋势分析"
              type="line"
              metric-type="responseTime"
              :data="mockData"
              :loading="loading"
              :show-legend="true"
              height="400px"
              :thresholds="{ responseTime: 1000 }"
              :colors="['#409EFF', '#67C23A', '#E6A23C']"
            />
          </el-tab-pane>
          
          <el-tab-pane label="柱状图" name="bar">
            <PerformanceChart
              title="错误率统计分析"
              type="bar"
              metric-type="errorRate"
              :data="mockData"
              :loading="loading"
              :show-legend="true"
              height="400px"
              :thresholds="{ errorRate: 5 }"
              :colors="['#F56C6C', '#E6A23C', '#409EFF']"
            />
          </el-tab-pane>
          
          <el-tab-pane label="饼图" name="pie">
            <PerformanceChart
              title="服务响应分布"
              type="pie"
              metric-type="errorRate"
              :data="mockData.slice(-1)"
              :loading="loading"
              height="400px"
              :show-controls="false"
            />
          </el-tab-pane>
          
          <el-tab-pane label="散点图" name="scatter">
            <PerformanceChart
              title="性能相关性分析"
              type="scatter"
              metric-type="responseTime"
              :data="mockData"
              :loading="loading"
              height="400px"
              :show-controls="false"
              :colors="['#9C27B0', '#FF9800', '#4CAF50']"
            />
          </el-tab-pane>
          
          <el-tab-pane label="雷达图" name="radar">
            <PerformanceChart
              title="综合性能评估"
              type="radar"
              metric-type="responseTime"
              :data="mockData.slice(-5)"
              :loading="loading"
              height="500px"
              :show-controls="false"
              :colors="['#673AB7', '#3F51B5', '#2196F3']"
            />
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <!-- 多图表对比展示 -->
      <el-card style="margin-bottom: 20px;">
        <template #header>
          <span>多维度性能监控面板</span>
        </template>
        
        <el-row :gutter="16">
          <el-col :span="12">
            <PerformanceChart
              title="响应时间"
              type="line"
              metric-type="responseTime"
              :data="mockData"
              :loading="loading"
              height="280px"
              :show-header="true"
              :show-controls="false"
              :colors="['#409EFF']"
            />
          </el-col>
          <el-col :span="12">
            <PerformanceChart
              title="可用性"
              type="line"
              metric-type="availability"
              :data="mockData"
              :loading="loading"
              height="280px"
              :show-header="true"
              :show-controls="false"
              :colors="['#67C23A']"
            />
          </el-col>
        </el-row>
        
        <el-row :gutter="16" style="margin-top: 16px;">
          <el-col :span="12">
            <PerformanceChart
              title="错误率"
              type="bar"
              metric-type="errorRate"
              :data="mockData"
              :loading="loading"
              height="280px"
              :show-header="true"
              :show-controls="false"
              :colors="['#F56C6C']"
            />
          </el-col>
          <el-col :span="12">
            <PerformanceChart
              title="综合评估"
              type="radar"
              metric-type="responseTime"
              :data="mockData.slice(-3)"
              :loading="loading"
              height="280px"
              :show-header="true"
              :show-controls="false"
            />
          </el-col>
        </el-row>
      </el-card>

      <!-- 图表交互演示 -->
      <el-card>
        <template #header>
          <span>图表交互功能演示</span>
        </template>
        
        <div class="interaction-demo">
          <el-alert 
            title="交互功能说明" 
            type="info" 
            show-icon 
            :closable="false"
            style="margin-bottom: 16px;"
          >
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>使用鼠标滚轮或右侧时间选择器可以缩放时间范围</li>
              <li>点击工具栏可以缩放、还原、保存图片</li>
              <li>悬停查看详细数据提示</li>
              <li>红色虚线表示告警阈值</li>
              <li>标记点显示最大值和最小值</li>
            </ul>
          </el-alert>
          
          <PerformanceChart
            title="交互式性能监控图表"
            type="line"
            metric-type="responseTime"
            :data="mockData"
            :loading="loading"
            height="400px"
            :show-legend="true"
            :thresholds="{ responseTime: 800 }"
            :animation-enabled="true"
            @chart-click="handleChartClick"
            @time-range-change="handleTimeRangeChange"
            @refresh="handleRefresh"
          />
          
          <!-- 点击事件显示 -->
          <el-card v-if="clickedData" style="margin-top: 16px;" shadow="never">
            <template #header>
              <span>图表点击事件</span>
            </template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="点击时间">{{ clickedData.time }}</el-descriptions-item>
              <el-descriptions-item label="数据值">{{ clickedData.value }}</el-descriptions-item>
              <el-descriptions-item label="系列名称">{{ clickedData.seriesName }}</el-descriptions-item>
              <el-descriptions-item label="数据索引">{{ clickedData.dataIndex }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import PerformanceChart from '@/components/charts/PerformanceChart.vue'
import type { PerformanceMetric } from '@/services/portPerformanceApi'

// 响应式数据
const activeTab = ref('line')
const loading = ref(false)
const mockData = ref<PerformanceMetric[]>([])
const clickedData = ref<any>(null)

// 生成模拟数据
const generateMockData = () => {
  loading.value = true
  
  setTimeout(() => {
    const data: PerformanceMetric[] = []
    const now = new Date()
    
    // 生成24小时的数据，每15分钟一个数据点
    for (let i = 95; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 15 * 60 * 1000)
      
      // 模拟一些变化趋势
      const timeOfDay = timestamp.getHours()
      const isBusinessHour = timeOfDay >= 9 && timeOfDay <= 18
      const isBusyTime = timeOfDay >= 14 && timeOfDay <= 16 // 下午繁忙时段
      
      // 基础响应时间，繁忙时段更高
      let baseResponseTime = isBusinessHour ? (isBusyTime ? 600 : 400) : 200
      const responseTime = baseResponseTime + Math.random() * 400
      
      // 可用性，偶尔会有小波动
      let availability = 99.5 + Math.random() * 0.5
      if (Math.random() > 0.95) { // 5%的概率出现可用性下降
        availability = 95 + Math.random() * 3
      }
      
      // 错误率，与响应时间相关
      let errorRate = responseTime > 800 ? 2 + Math.random() * 3 : Math.random() * 1.5
      if (availability < 98) {
        errorRate += Math.random() * 2
      }
      
      data.push({
        port: 3000,
        timestamp,
        responseTime: Math.round(responseTime),
        connectionTime: Math.round(20 + Math.random() * 50), // 连接时间 20-70ms
        availability: Math.round(availability * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        throughput: 50 + Math.random() * 100,
        cpuUsage: 20 + Math.random() * 60,
        memoryUsage: 100 + Math.random() * 200,
        networkLatency: Math.round(10 + Math.random() * 30), // 网络延迟 10-40ms
        successfulConnections: Math.round(80 + Math.random() * 20), // 成功连接数
        failedConnections: Math.round(Math.random() * 5), // 失败连接数
        totalRequests: Math.round(100 + Math.random() * 50) // 总请求数
      })
    }
    
    mockData.value = data
    loading.value = false
    ElMessage.success('模拟数据生成完成')
  }, 1000)
}

// 事件处理
const handleTabChange = (tabName: string) => {
  console.log('Tab changed to:', tabName)
}

const handleChartClick = (params: any) => {
  console.log('Chart clicked:', params)
  if (params && params.data !== undefined) {
    clickedData.value = {
      time: params.name || '未知时间',
      value: params.value || params.data,
      seriesName: params.seriesName || '未知系列',
      dataIndex: params.dataIndex || 0
    }
    ElMessage.info(`点击了数据点: ${params.name}`)
  }
}

const handleTimeRangeChange = (timeRange: string) => {
  console.log('Time range changed:', timeRange)
  ElMessage.info(`时间范围已改变为: ${timeRange}`)
}

const handleRefresh = () => {
  ElMessage.info('刷新数据中...')
  generateMockData()
}

// 生命周期
onMounted(() => {
  // 初始生成一些数据
  generateMockData()
})
</script>

<style scoped>
.charts-demo {
  padding: 20px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #303133;
}

.page-header p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}

.demo-content {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.interaction-demo ul {
  line-height: 1.6;
}

.interaction-demo li {
  margin-bottom: 4px;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .charts-demo {
    padding: 12px;
  }
  
  .page-header h1 {
    font-size: 20px;
  }
  
  .card-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
}
</style>









