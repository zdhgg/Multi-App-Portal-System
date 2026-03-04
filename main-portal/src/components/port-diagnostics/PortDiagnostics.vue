<template>
  <div class="port-diagnostics">
    <!-- 诊断工具栏 -->
    <div class="diagnostics-toolbar">
      <el-card>
        <div class="toolbar-content">
          <div class="tool-group">
            <h4>快速诊断</h4>
            <div class="tool-buttons">
              <el-button type="primary" :icon="Search" @click="runQuickScan">
                端口扫描
              </el-button>
              <el-button type="warning" :icon="Warning" @click="checkConflicts">
                冲突检测
              </el-button>
              <el-button type="success" :icon="CircleCheck" @click="healthCheck">
                健康检查
              </el-button>
            </div>
          </div>
          
          <div class="tool-group">
            <h4>高级工具</h4>
            <div class="tool-buttons">
              <el-button :icon="Connection" disabled>
                连通性测试
              </el-button>
              <el-button :icon="Monitor" disabled>
                性能分析
              </el-button>
              <el-button :icon="Document" disabled>
                生成报告
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 诊断结果 -->
    <div class="diagnostics-results">
      <el-row :gutter="20">
        <!-- 系统状态 -->
        <el-col :span="8">
          <el-card>
            <template #header>
              <div class="card-header">
                <el-icon><Monitor /></el-icon>
                <span>系统状态</span>
              </div>
            </template>
            <div class="status-list">
              <div class="status-item">
                <el-icon class="status-icon success"><CircleCheck /></el-icon>
                <span>端口管理服务</span>
                <el-tag type="success" size="small">正常</el-tag>
              </div>
              <div class="status-item">
                <el-icon class="status-icon success"><CircleCheck /></el-icon>
                <span>数据库连接</span>
                <el-tag type="success" size="small">正常</el-tag>
              </div>
              <div class="status-item">
                <el-icon class="status-icon warning"><Warning /></el-icon>
                <span>网络监控</span>
                <el-tag type="warning" size="small">警告</el-tag>
              </div>
              <div class="status-item">
                <el-icon class="status-icon success"><CircleCheck /></el-icon>
                <span>配置同步</span>
                <el-tag type="success" size="small">正常</el-tag>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 端口统计 -->
        <el-col :span="8">
          <el-card>
            <template #header>
              <div class="card-header">
                <el-icon><DataAnalysis /></el-icon>
                <span>端口统计</span>
              </div>
            </template>
            <div class="stats-list">
              <div class="stat-item">
                <span class="stat-label">总端口数</span>
                <span class="stat-value">{{ diagnosticStats.totalPorts }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">活跃端口</span>
                <span class="stat-value active">{{ diagnosticStats.activePorts }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">监听端口</span>
                <span class="stat-value">{{ diagnosticStats.listeningPorts }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">异常端口</span>
                <span class="stat-value error">{{ diagnosticStats.errorPorts }}</span>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 近期事件 -->
        <el-col :span="8">
          <el-card>
            <template #header>
              <div class="card-header">
                <el-icon><Bell /></el-icon>
                <span>近期事件</span>
              </div>
            </template>
            <div class="events-list">
              <div class="event-item">
                <el-icon class="event-icon info"><InfoFilled /></el-icon>
                <div class="event-content">
                  <div class="event-title">端口3001自动分配</div>
                  <div class="event-time">2分钟前</div>
                </div>
              </div>
              <div class="event-item">
                <el-icon class="event-icon warning"><WarningFilled /></el-icon>
                <div class="event-content">
                  <div class="event-title">检测到端口冲突</div>
                  <div class="event-time">15分钟前</div>
                </div>
              </div>
              <div class="event-item">
                <el-icon class="event-icon success"><SuccessFilled /></el-icon>
                <div class="event-content">
                  <div class="event-title">僵尸端口清理完成</div>
                  <div class="event-time">1小时前</div>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 诊断详情 -->
    <div class="diagnostics-details">
      <el-card>
        <template #header>
          <div class="card-header">
            <el-icon><Document /></el-icon>
            <span>诊断详情</span>
            <el-button type="text" @click="expandDetails = !expandDetails">
              {{ expandDetails ? '收起' : '展开' }}
            </el-button>
          </div>
        </template>
        
        <el-collapse v-model="activeCollapse">
          <el-collapse-item title="端口扫描结果" name="scan">
            <!-- 扫描配置 -->
            <div class="scan-config-section">
              <el-card>
                <template #header>
                  <div class="config-header">
                    <span>扫描配置</span>
                    <el-button 
                      type="primary" 
                      :icon="Search" 
                      @click="startPortScan"
                      :loading="scanning"
                      :disabled="scanning"
                    >
                      {{ scanning ? '扫描中...' : '开始扫描' }}
                    </el-button>
                    <el-tag v-if="scanning" type="warning" size="small">Scanning...</el-tag>
                    <el-tag v-else-if="scanResults.length && currentTaskId" type="success" size="small">Async task completed</el-tag>
                    <el-tag v-else-if="scanResults.length && !currentTaskId" type="success" size="small">Sync results</el-tag>
                  </div>
                </template>
                
                <!-- 端口范围快速预设 -->
                <el-row :gutter="16" style="margin-bottom: 16px;">
                  <el-col :span="24">
                    <el-form-item label="快速预设">
                      <el-button-group>
                        <el-button 
                          size="small" 
                          @click="setPortRange(3000, 3100)"
                          :disabled="scanning"
                        >
                          前端开发 (3000-3100)
                        </el-button>
                        <el-button 
                          size="small" 
                          @click="setPortRange(8000, 8100)"
                          :disabled="scanning"
                        >
                          后端服务 (8000-8100)
                        </el-button>
                        <el-button 
                          size="small" 
                          @click="setPortRange(3000, 3020)"
                          :disabled="scanning"
                        >
                          快速扫描 (3000-3020)
                        </el-button>
                        <el-button 
                          size="small" 
                          @click="setPortRange(1000, 2000)"
                          :disabled="scanning"
                        >
                          系统服务 (1000-2000)
                        </el-button>
                      </el-button-group>
                    </el-form-item>
                  </el-col>
                </el-row>

                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-form-item label="起始端口">
                      <el-input-number 
                        v-model="scanConfig.startPort" 
                        :min="1" 
                        :max="65535"
                        :disabled="scanning"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="结束端口">
                      <el-input-number 
                        v-model="scanConfig.endPort" 
                        :min="1" 
                        :max="65535"
                        :disabled="scanning"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="超时时间(ms)">
                      <el-input-number 
                        v-model="scanConfig.timeout" 
                        :min="100" 
                        :max="10000"
                        :disabled="scanning"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-checkbox v-model="scanConfig.includeClosed" :disabled="scanning">
                      包含关闭端口
                    </el-checkbox>
                  </el-col>
                  <el-col :span="8">
                    <el-checkbox v-model="scanConfig.detectProcesses" :disabled="scanning">
                      检测进程信息
                    </el-checkbox>
                  </el-col>
                  <el-col :span="8">
                    <el-checkbox v-model="scanConfig.securityCheck" :disabled="scanning">
                      安全检查
                    </el-checkbox>
                  </el-col>
                </el-row>
              </el-card>
            </div>

            <!-- 扫描进度 -->
            <div v-if="scanning || scanTask" class="scan-progress-section">
              <el-card>
                <template #header>
                  <div class="progress-header">
                    <span>扫描进度</span>
                    <el-button 
                      v-if="scanning" 
                      type="danger" 
                      size="small"
                      @click="cancelScan"
                    >
                      取消扫描
                    </el-button>
                  </div>
                </template>
                
                <div v-if="scanTask" class="progress-content">
                  <el-progress 
                    :percentage="scanTask.progress.percentage" 
                    :status="getScanProgressStatus()"
                  />
                  <div class="progress-details">
                    <span>进度: {{ scanTask.progress.current }} / {{ scanTask.progress.total }}</span>
                    <span>状态: {{ getScanStatusText(scanTask.status) }}</span>
                    <span v-if="scanTask.startTime">
                      开始时间: {{ formatTime(scanTask.startTime) }}
                    </span>
                  </div>
                </div>
              </el-card>
            </div>

            <!-- 扫描结果 -->
            <div v-if="scanResults.length > 0" class="scan-results-section">
              <el-card>
                <template #header>
                  <div class="results-header">
                    <span>扫描结果 ({{ filteredResults.length }}/{{ scanResults.length }})</span>
                    <div class="results-actions">
                      <el-select 
                        v-model="resultFilter" 
                        placeholder="筛选状态"
                        clearable
                        size="small"
                        style="width: 120px"
                      >
                        <el-option label="全部" value="" />
                        <el-option label="开放" value="open" />
                        <el-option label="监听中" value="listening" />
                        <el-option label="已分配" value="allocated" />
                        <el-option label="关闭" value="closed" />
                      </el-select>
                      
                      <el-input
                        v-model="searchKeyword"
                        placeholder="搜索端口或服务"
                        size="small"
                        style="width: 150px"
                        clearable
                      >
                        <template #prefix>
                          <el-icon><Search /></el-icon>
                        </template>
                      </el-input>
                      
                      <el-button size="small" @click="exportResults">
                        导出结果
                      </el-button>
                    </div>
                  </div>
                </template>
                
                <el-table 
                  :data="paginatedResults" 
                  stripe 
                  border
                  @row-click="showPortDetail"
                  style="cursor: pointer"
                >
                  <el-table-column prop="port" label="端口" width="80" sortable />
                  <el-table-column label="状态" width="100">
                    <template #default="{ row }">
                      <el-tag :type="getStatusTagType(row.status)">
                        {{ getStatusText(row.status) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="service" label="服务" width="120" />
                  <el-table-column label="进程" width="150">
                    <template #default="{ row }">
                      <span v-if="row.process">
                        {{ row.process.name }} ({{ row.process.pid }})
                      </span>
                      <span v-else class="text-muted">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="应用" width="150">
                    <template #default="{ row }">
                      <span v-if="row.application">
                        {{ row.application.name }}
                        <el-tag 
                          :color="getAppTypeColor(row.application.type)" 
                          size="small"
                        >
                          {{ getAppTypeText(row.application.type) }}
                        </el-tag>
                      </span>
                      <span v-else class="text-muted">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="安全" width="100">
                    <template #default="{ row }">
                      <el-tag 
                        v-if="row.security" 
                        :type="getRiskLevelType(row.security.riskLevel)"
                        size="small"
                      >
                        {{ getRiskLevelText(row.security.riskLevel) }}
                      </el-tag>
                      <span v-else class="text-muted">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="响应时间" width="100">
                    <template #default="{ row }">
                      <el-tag 
                        v-if="row.performance?.responseTime" 
                        :type="getResponseTimeType(row.performance.responseTime)"
                        size="small"
                      >
                        {{ row.performance.responseTime }}ms
                      </el-tag>
                      <span v-else class="text-muted">-</span>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="120" fixed="right">
                    <template #default="{ row }">
                      <el-button 
                        type="primary" 
                        size="small" 
                        @click.stop="showPortDetail(row)"
                      >
                        详情
                      </el-button>
                    </template>
                  </el-table-column>
                </el-table>
                
                <!-- 分页 -->
                <div class="pagination-container">
                  <el-pagination
                    v-model:current-page="currentPage"
                    v-model:page-size="pageSize"
                    :page-sizes="[10, 20, 50, 100]"
                    :total="filteredResults.length"
                    layout="total, sizes, prev, pager, next, jumper"
                    background
                  />
                </div>
              </el-card>
            </div>

            <!-- 空状态 -->
            <div v-else-if="!scanning && !scanTask" class="empty-state">
              <el-empty description="暂无扫描结果，点击上方按钮开始扫描" />
            </div>
          </el-collapse-item>
          
          <el-collapse-item title="性能监控" name="performance">
            <!-- 性能监控控制台 -->
            <div class="performance-console-section">
              <el-card>
                <template #header>
                  <div class="performance-header">
                    <span>监控控制台</span>
                    <div class="control-buttons">
                      <el-button 
                        type="success" 
                        :icon="Monitor" 
                        @click="startPerformanceMonitoring"
                        :loading="performanceMonitoring"
                        :disabled="performanceMonitoring"
                        size="small"
                      >
                        {{ performanceMonitoring ? '监控中...' : '开始监控' }}
                      </el-button>
                      <el-button 
                        type="warning" 
                        @click="stopPerformanceMonitoring"
                        :disabled="!performanceMonitoring"
                        size="small"
                      >
                        停止监控
                      </el-button>
                      <el-button 
              type="info"
                        :icon="Document" 
                        @click="showPerformanceSummary"
                        size="small"
                      >
                        查看摘要
                      </el-button>
                      <el-button 
                        type="warning" 
                        :icon="Bell" 
                        @click="goToAlertCenter"
                        size="small"
                      >
                        告警中心
                      </el-button>
                    </div>
                  </div>
                </template>
                
                <el-row :gutter="16">
                  <el-col :span="6">
                    <el-form-item label="监控端口">
                      <el-select 
                        v-model="performanceConfig.selectedPorts" 
                        multiple 
                        placeholder="选择要监控的端口"
                        style="width: 100%"
                      >
                        <el-option
                          v-for="result in scanResults"
                          :key="result.port"
                          :label="`${result.port} - ${result.service || '未知服务'}`"
                          :value="result.port"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="监控间隔">
                      <el-select v-model="performanceConfig.interval" placeholder="选择间隔">
                        <el-option label="10秒" :value="10000" />
                        <el-option label="30秒" :value="30000" />
                        <el-option label="1分钟" :value="60000" />
                        <el-option label="5分钟" :value="300000" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="时间范围">
                      <el-select v-model="performanceTimeRange" placeholder="选择时间范围">
                        <el-option label="最近1小时" value="1h" />
                        <el-option label="最近6小时" value="6h" />
                        <el-option label="最近24小时" value="24h" />
                        <el-option label="最近7天" value="7d" />
                        <el-option label="最近30天" value="30d" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="6">
                    <el-form-item label="告警阈值">
                      <el-input 
                        v-model.number="performanceConfig.responseTimeThreshold" 
                        placeholder="响应时间(ms)"
                        type="number"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-card>
            </div>

            <!-- 性能概览卡片 -->
            <div class="performance-overview-section" v-if="performanceOverview.length > 0">
              <el-row :gutter="16" style="margin-top: 16px;">
                <el-col :span="6" v-for="port in performanceOverview" :key="port.port">
                  <el-card class="performance-card">
                    <template #header>
                      <div class="card-header">
                        <span>端口 {{ port.port }}</span>
                        <el-tag 
                          :type="getPerformanceStatusType(port.status)"
                          size="small"
                        >
                          {{ getPerformanceStatusText(port.status) }}
                        </el-tag>
                      </div>
                    </template>
                    
                    <div v-if="port.metrics" class="metrics-grid">
                      <div class="metric-item">
                        <div class="metric-label">响应时间</div>
                        <div class="metric-value">{{ port.metrics.avgResponseTime.toFixed(0) }}ms</div>
                      </div>
                      <div class="metric-item">
                        <div class="metric-label">可用性</div>
                        <div class="metric-value">{{ port.metrics.availability.toFixed(1) }}%</div>
                      </div>
                      <div class="metric-item">
                        <div class="metric-label">错误率</div>
                        <div class="metric-value">{{ port.metrics.errorRate.toFixed(1) }}%</div>
                      </div>
                      <div class="metric-item">
                        <div class="metric-label">趋势</div>
                        <div class="metric-value">
                          <el-tag 
                            :type="getTrendType(port.metrics.trend)"
                            size="small"
                          >
                            {{ getTrendText(port.metrics.trend) }}
                          </el-tag>
                        </div>
                      </div>
                    </div>
                    
                    <div v-if="(port.alertCount ?? 0) > 0" class="alert-info">
                      <el-icon class="alert-icon"><Bell /></el-icon>
                      {{ port.alertCount }} 个活跃告警
                    </div>
                    
                    <div v-if="port.error" class="error-info">
                      <el-text type="danger">{{ port.error }}</el-text>
                    </div>
                    
                    <div class="card-actions">
                      <el-button 
                        type="text" 
                        size="small" 
                        @click="showPortPerformanceDetail(port.port)"
                      >
                        查看详情
                      </el-button>
                    </div>
                  </el-card>
                </el-col>
              </el-row>
            </div>

            <!-- 性能图表 -->
            <div class="performance-charts-section" v-if="selectedPerformancePort">
              <el-card style="margin-top: 16px;">
                <template #header>
                  <div class="chart-header">
                    <span>端口 {{ selectedPerformancePort }} 性能趋势</span>
                    <div class="chart-controls">
                      <el-radio-group v-model="performanceTimeRange" size="small">
                        <el-radio-button label="1h">1小时</el-radio-button>
                        <el-radio-button label="6h">6小时</el-radio-button>
                        <el-radio-button label="24h">24小时</el-radio-button>
                        <el-radio-button label="7d">7天</el-radio-button>
                      </el-radio-group>
                      <el-button 
                        type="text" 
                        size="small" 
                        @click="refreshPerformanceData"
                        :loading="loadingPerformanceData"
                      >
                        刷新
                      </el-button>
                    </div>
                  </div>
                </template>
                
                <!-- 响应时间图表 -->
                <PerformanceChart
                  title="响应时间趋势"
                  type="line"
                  metric-type="responseTime"
                  :data="performanceChartData"
                  :time-range="performanceTimeRange"
                  :loading="loadingPerformanceData"
                  :thresholds="{ responseTime: performanceConfig.responseTimeThreshold }"
                  :show-legend="true"
                  height="320px"
                  @time-range-change="handleChartTimeRangeChange"
                  @refresh="refreshPerformanceData"
                  @chart-click="handleChartClick"
                />
                
                <!-- 可用性图表 -->
                <PerformanceChart
                  title="可用性趋势"
                  type="line"
                  metric-type="availability"
                  :data="performanceChartData"
                  :time-range="performanceTimeRange"
                  :loading="loadingPerformanceData"
                  :thresholds="{ availability: performanceConfig.availabilityThreshold }"
                  :show-legend="true"
                  :colors="['#67C23A', '#E6A23C', '#F56C6C']"
                  height="320px"
                  @time-range-change="handleChartTimeRangeChange"
                  @refresh="refreshPerformanceData"
                />
                
                <!-- 错误率图表 -->
                <PerformanceChart
                  title="错误率趋势"
                  type="bar"
                  metric-type="errorRate"
                  :data="performanceChartData"
                  :time-range="performanceTimeRange"
                  :loading="loadingPerformanceData"
                  :thresholds="{ errorRate: performanceConfig.errorRateThreshold }"
                  :show-legend="true"
                  :colors="['#F56C6C', '#E6A23C', '#409EFF']"
                  height="320px"
                  @time-range-change="handleChartTimeRangeChange"
                  @refresh="refreshPerformanceData"
                />

                <!-- 性能综合分析图表 -->
                <div class="chart-container">
                  <PerformanceChart
                    title="性能综合分析"
                    type="radar"
                    metric-type="responseTime"
                    :data="performanceChartData"
                    :time-range="performanceTimeRange"
                    :loading="loadingPerformanceData"
                    :show-legend="true"
                    :show-controls="false"
                    height="400px"
                    empty-description="暂无数据，请先启动性能监控"
                  />
                </div>
              </el-card>
            </div>

            <!-- 性能告警列表 -->
            <div class="performance-alerts-section" v-if="performanceAlerts.length > 0">
              <el-card style="margin-top: 16px;">
                <template #header>
                  <div class="alerts-header">
                    <span>性能告警</span>
                    <el-badge :value="unacknowledgedAlertsCount" type="danger">
                      <el-button type="text" size="small" @click="showAllAlerts">
                        查看全部
                      </el-button>
                    </el-badge>
                  </div>
                </template>
                
                <el-table :data="performanceAlerts" style="width: 100%" size="small">
                  <el-table-column prop="port" label="端口" width="80" />
                  <el-table-column prop="alertType" label="告警类型" width="120">
                    <template #default="{ row }">
                      {{ getAlertTypeText(row.alertType) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="severity" label="严重程度" width="100">
                    <template #default="{ row }">
                      <el-tag :type="getSeverityType(row.severity)" size="small">
                        {{ getSeverityText(row.severity) }}
                      </el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="currentValue" label="当前值" width="100">
                    <template #default="{ row }">
                      {{ formatAlertValue(row.currentValue, row.alertType) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="threshold" label="阈值" width="100">
                    <template #default="{ row }">
                      {{ formatAlertValue(row.threshold, row.alertType) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="timestamp" label="时间" width="150">
                    <template #default="{ row }">
                      {{ formatTime(row.timestamp) }}
                    </template>
                  </el-table-column>
                  <el-table-column prop="message" label="消息" min-width="200" />
                  <el-table-column label="操作" width="120">
                    <template #default="{ row }">
                      <el-button 
                        v-if="!row.acknowledged"
                        type="text" 
                        size="small" 
                        @click="acknowledgeAlert(row.id)"
                      >
                        确认
                      </el-button>
                      <el-text v-else type="info" size="small">已确认</el-text>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </div>

            <!-- 空状态 -->
            <div v-if="!performanceMonitoring && performanceOverview.length === 0" class="empty-state">
              <el-empty description="暂无性能监控数据，点击上方按钮开始监控" />
            </div>
          </el-collapse-item>
          
          <el-collapse-item title="安全检查" name="security">
            <!-- 安全检查控制台 -->
            <div class="security-console-section">
              <el-card>
                <template #header>
                  <div class="security-header">
                    <span>安全检查控制台</span>
                    <div class="security-controls">
                      <el-button 
                        type="primary" 
                        :icon="Lock" 
                        @click="startSecurityScan"
                        :loading="securityScanning"
                        :disabled="securityScanning"
                        size="small"
                      >
                        {{ securityScanning ? '扫描中...' : '开始扫描' }}
                      </el-button>
                      <el-button 
                        type="success" 
                        :icon="Document" 
                        @click="generateSecurityReport"
                        :disabled="securityFindings.length === 0"
                        size="small"
                      >
                        生成报告
                      </el-button>
                      <el-button 
                        type="warning" 
                        :icon="Bell" 
                        @click="goToAlertCenter"
                        size="small"
                      >
                        告警中心
                      </el-button>
                    </div>
                  </div>
                </template>
                
                <el-row :gutter="16">
                  <el-col :span="8">
                    <el-form-item label="扫描端口">
                      <el-select 
                        v-model="securityConfig.selectedPorts" 
                        multiple 
                        placeholder="选择要检查的端口"
                        style="width: 100%"
                      >
                        <el-option
                          v-for="result in scanResults"
                          :key="result.port"
                          :label="`${result.port} - ${result.service || '未知服务'}`"
                          :value="result.port"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="检查类型">
                      <el-select v-model="securityConfig.scanType" placeholder="选择检查类型">
                        <el-option label="快速检查" value="quick" />
                        <el-option label="全面检查" value="comprehensive" />
                        <el-option label="深度检查" value="deep" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="风险阈值">
                      <el-select v-model="securityConfig.riskThreshold" placeholder="选择风险级别">
                        <el-option label="仅严重风险" value="critical" />
                        <el-option label="高级风险及以上" value="high" />
                        <el-option label="中级风险及以上" value="medium" />
                        <el-option label="所有风险" value="low" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-card>
            </div>

            <!-- 安全概览统计 -->
            <div class="security-overview-section" v-if="securitySummary">
              <el-card style="margin-top: 16px;">
                <template #header>
                  <div class="security-stats-header">
                    <span>安全概览</span>
                    <el-tag 
                      :type="getSecurityGradeType(securitySummary.overallGrade)"
                      size="large"
                    >
                      安全等级: {{ securitySummary.overallGrade }}
                    </el-tag>
                  </div>
                </template>
                
                <el-row :gutter="16">
                  <el-col :span="6">
                    <div class="stat-card critical">
                      <div class="stat-number">{{ securitySummary.criticalCount }}</div>
                      <div class="stat-label">严重风险</div>
                    </div>
                  </el-col>
                  <el-col :span="6">
                    <div class="stat-card high">
                      <div class="stat-number">{{ securitySummary.highCount }}</div>
                      <div class="stat-label">高级风险</div>
                    </div>
                  </el-col>
                  <el-col :span="6">
                    <div class="stat-card medium">
                      <div class="stat-number">{{ securitySummary.mediumCount }}</div>
                      <div class="stat-label">中级风险</div>
                    </div>
                  </el-col>
                  <el-col :span="6">
                    <div class="stat-card low">
                      <div class="stat-number">{{ securitySummary.lowCount }}</div>
                      <div class="stat-label">低级风险</div>
                    </div>
                  </el-col>
                </el-row>
                
                <div class="security-score-section" style="margin-top: 20px;">
                  <div class="score-header">
                    <span>安全评分</span>
                    <span class="score-value">{{ securitySummary.securityScore }}/100</span>
                  </div>
                  <el-progress 
                    :percentage="securitySummary.securityScore" 
                    :color="getScoreColor(securitySummary.securityScore)"
                    :stroke-width="8"
                  />
                </div>
              </el-card>
            </div>

            <!-- 安全检查结果 -->
            <div class="security-findings-section" v-if="securityFindings.length > 0">
              <el-card style="margin-top: 16px;">
                <template #header>
                  <div class="findings-header">
                    <span>安全检查结果</span>
                    <div class="findings-filters">
                      <el-select v-model="securityFilter" placeholder="筛选风险级别" size="small" style="width: 120px;">
                        <el-option label="全部" value="" />
                        <el-option label="严重" value="critical" />
                        <el-option label="高" value="high" />
                        <el-option label="中" value="medium" />
                        <el-option label="低" value="low" />
                      </el-select>
                      <el-input 
                        v-model="securitySearchKeyword" 
                        placeholder="搜索安全问题" 
                        size="small" 
                        style="width: 200px;"
                        :prefix-icon="Search"
                      />
                    </div>
                  </div>
                </template>
                
                <div class="findings-list">
                  <el-collapse>
                    <el-collapse-item 
                      v-for="finding in filteredSecurityFindings" 
                      :key="finding.id"
                      :name="finding.id"
                    >
                      <template #title>
                        <div class="finding-title">
                          <el-tag 
                            :type="getSecurityRiskType(finding.severity)"
                            size="small"
                          >
                            {{ getSecurityRiskText(finding.severity) }}
                          </el-tag>
                          <span class="finding-name">{{ finding.title }}</span>
                          <el-tag v-if="finding.category" type="info" size="small">
                            {{ finding.category }}
                          </el-tag>
                          <span class="finding-port">端口: {{ finding.port }}</span>
                        </div>
                      </template>
                      
                      <div class="finding-content">
                        <div class="finding-description">
                          <h4>问题描述</h4>
                          <p>{{ finding.description }}</p>
                        </div>
                        
                        <div class="finding-impact" v-if="finding.impact">
                          <h4>潜在影响</h4>
                          <p>{{ finding.impact }}</p>
                        </div>
                        
                        <div class="finding-evidence" v-if="finding.evidence && finding.evidence.length > 0">
                          <h4>检测证据</h4>
                          <ul>
                            <li v-for="evidence in finding.evidence" :key="evidence">
                              {{ evidence }}
                            </li>
                          </ul>
                        </div>
                        
                        <div class="finding-recommendations" v-if="finding.recommendations && finding.recommendations.length > 0">
                          <h4>修复建议</h4>
                          <ol>
                            <li v-for="recommendation in finding.recommendations" :key="recommendation">
                              {{ recommendation }}
                            </li>
                          </ol>
                        </div>
                        
                        <div class="finding-references" v-if="finding.references && finding.references.length > 0">
                          <h4>参考资料</h4>
                          <ul>
                            <li v-for="reference in finding.references" :key="reference.title">
                              <a :href="reference.url" target="_blank">{{ reference.title }}</a>
                            </li>
                          </ul>
                        </div>
                        
                        <div class="finding-actions">
                          <el-button 
                            type="success" 
                            size="small" 
                            @click="markAsFixed(finding.id)"
                            v-if="!finding.fixed"
                          >
                            标记为已修复
                          </el-button>
                          <el-button 
                            type="warning" 
                            size="small" 
                            @click="suppressFinding(finding.id)"
                            v-if="!finding.suppressed"
                          >
                            忽略此问题
                          </el-button>
                          <el-button 
                            type="info" 
                            size="small" 
                            @click="exportFinding(finding)"
                          >
                            导出详情
                          </el-button>
                        </div>
                      </div>
          </el-collapse-item>
        </el-collapse>
                </div>
      </el-card>
    </div>

            <!-- 安全建议 -->
            <div class="security-recommendations-section" v-if="securityRecommendations.length > 0">
              <el-card style="margin-top: 16px;">
                <template #header>
                  <div class="recommendations-header">
                    <span>安全建议</span>
                    <el-tag type="info" size="small">
                      {{ securityRecommendations.length }} 条建议
                    </el-tag>
                  </div>
                </template>
                
                <div class="recommendations-list">
                  <div 
                    v-for="(recommendation, index) in securityRecommendations" 
                    :key="index"
                    class="recommendation-item"
                  >
                    <div class="recommendation-priority">
                      <el-tag 
                        :type="getRecommendationPriorityType(recommendation.priority)"
                        size="small"
                      >
                        {{ getRecommendationPriorityText(recommendation.priority) }}
                      </el-tag>
                    </div>
                    <div class="recommendation-content">
                      <h4>{{ recommendation.title }}</h4>
                      <p>{{ recommendation.description }}</p>
                      <div v-if="recommendation.steps" class="recommendation-steps">
                        <strong>实施步骤：</strong>
                        <ol>
                          <li v-for="step in recommendation.steps" :key="step">
                            {{ step }}
                          </li>
                        </ol>
                      </div>
                    </div>
                    <div class="recommendation-actions">
                      <el-button 
                        type="text" 
                        size="small" 
                        @click="markRecommendationCompleted(index)"
                        v-if="!recommendation.completed"
                      >
                        标记完成
                      </el-button>
                    </div>
                  </div>
                </div>
              </el-card>
            </div>

            <!-- 空状态 -->
            <div v-if="!securityScanning && securityFindings.length === 0" class="empty-state">
              <el-empty description="暂无安全检查结果，点击上方按钮开始扫描" />
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </div>

    <!-- 端口详情弹窗 -->
    <PortDetailDialog 
      v-model="showPortDetailDialog"
      :port="selectedPort"
      @port-released="handlePortReleased"
      @process-terminated="handleProcessTerminated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Search,
  Warning,
  CircleCheck,
  Connection,
  Monitor,
  Document,
  DataAnalysis,
  Bell,
  InfoFilled,
  WarningFilled,
  SuccessFilled,
  Lock
} from '@element-plus/icons-vue'
import { 
  portManagementApiService, 
  type PortScanConfig, 
  type PortScanResult, 
  type ScanTask 
} from '@/services/portManagementApi'
import { 
  portPerformanceApiService,
  type PerformanceOverview, 
  type PerformanceAlert, 
  type PerformanceMetric,
  type MonitoringConfig 
} from '@/services/portPerformanceApi'
import PortDetailDialog from './PortDetailDialog.vue'
import PerformanceChart from '../charts/PerformanceChart.vue'

// 路由实例
const router = useRouter()

// 响应式数据
const expandDetails = ref(false)
const activeCollapse = ref(['scan'])

const diagnosticStats = reactive({
  totalPorts: 65535,
  activePorts: 24,
  listeningPorts: 18,
  errorPorts: 2
})

// 端口扫描相关数据
const scanning = ref(false)
const scanTask = ref<ScanTask | null>(null)
const scanResults = ref<PortScanResult[]>([])
const currentTaskId = ref<string>('')

// 扫描配置
const scanConfig = reactive<PortScanConfig>({
  startPort: 3000,
  endPort: 3100,  // 更合理的默认范围：100个端口
  timeout: 1000,
  includeClosed: false,
  detectProcesses: true,
  securityCheck: false
})

// 结果筛选和搜索
const resultFilter = ref('')
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

// 端口详情弹窗
const showPortDetailDialog = ref(false)
const selectedPort = ref<number>()

// 性能监控相关数据
const performanceMonitoring = ref(false)
const performanceOverview = ref<PerformanceOverview[]>([])
const performanceAlerts = ref<PerformanceAlert[]>([])
const selectedPerformancePort = ref<number>()
const performanceTimeRange = ref('24h')
const loadingPerformanceData = ref(false)
const performanceChartData = ref<PerformanceMetric[]>([])
const performanceMetrics = ref<Record<number, PerformanceMetric[]>>({})

// 性能监控配置
const performanceConfig = reactive({
  selectedPorts: [] as number[],
  interval: 30000, // 30秒
  responseTimeThreshold: 1000, // 1秒
  availabilityThreshold: 95, // 95%
  errorRateThreshold: 5 // 5%
})

// 图表引用已移除，现在使用PerformanceChart组件

// 安全检查相关数据
const securityScanning = ref(false)
const securityFindings = ref<SecurityFinding[]>([])
const securitySummary = ref<SecuritySummary | null>(null)
const securityRecommendations = ref<SecurityRecommendation[]>([])
const securityFilter = ref('')
const securitySearchKeyword = ref('')

// 安全检查配置
const securityConfig = reactive({
  selectedPorts: [] as number[],
  scanType: 'comprehensive' as 'quick' | 'comprehensive' | 'deep',
  riskThreshold: 'medium' as 'critical' | 'high' | 'medium' | 'low'
})

// 安全检查接口定义
interface SecurityFinding {
  id: string
  port: number
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  impact?: string
  evidence?: string[]
  recommendations?: string[]
  references?: { title: string; url: string }[]
  fixed?: boolean
  suppressed?: boolean
}

interface SecuritySummary {
  overallGrade: string
  securityScore: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  scannedPorts: number
  vulnerablePorts: number
}

interface SecurityRecommendation {
  title: string
  description: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  steps?: string[]
  completed?: boolean
}

// 轮询定时器
let statusTimer: NodeJS.Timeout | null = null

// 计算属性
const filteredResults = computed(() => {
  let results = scanResults.value

  // 按状态筛选
  if (resultFilter.value) {
    results = results.filter(result => result.status === resultFilter.value)
  }

  // 按关键词搜索
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    results = results.filter(result => 
      result.port.toString().includes(keyword) ||
      result.service?.toLowerCase().includes(keyword) ||
      result.process?.name?.toLowerCase().includes(keyword) ||
      result.application?.name?.toLowerCase().includes(keyword)
    )
  }

  return results
})

const paginatedResults = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredResults.value.slice(start, end)
})

// 性能监控计算属性
const unacknowledgedAlertsCount = computed(() => {
  return performanceAlerts.value.filter(alert => !alert.acknowledged).length
})

const healthyPortsCount = computed(() => {
  return performanceOverview.value.filter(port => port.status === 'healthy').length
})

const unhealthyPortsCount = computed(() => {
  return performanceOverview.value.filter(port => port.status === 'unhealthy').length
})

// 安全检查计算属性
const filteredSecurityFindings = computed(() => {
  let findings = securityFindings.value

  // 按严重程度筛选
  if (securityFilter.value) {
    findings = findings.filter(finding => finding.severity === securityFilter.value)
  }

  // 按关键词搜索
  if (securitySearchKeyword.value) {
    const keyword = securitySearchKeyword.value.toLowerCase()
    findings = findings.filter(finding => 
      finding.title.toLowerCase().includes(keyword) ||
      finding.description.toLowerCase().includes(keyword) ||
      finding.category.toLowerCase().includes(keyword)
    )
  }

  // 只显示未修复且未忽略的问题
  findings = findings.filter(finding => !finding.fixed && !finding.suppressed)

  return findings
})

const securityScore = computed(() => {
  if (!securitySummary.value) return 0
  return securitySummary.value.securityScore
})

const criticalFindingsCount = computed(() => {
  return securityFindings.value.filter(finding => 
    finding.severity === 'critical' && !finding.fixed && !finding.suppressed
  ).length
})

const highFindingsCount = computed(() => {
  return securityFindings.value.filter(finding => 
    finding.severity === 'high' && !finding.fixed && !finding.suppressed
  ).length
})

// 方法
const runQuickScan = async () => {
  // 使用预设的快速扫描配置
  const quickConfig = {
    startPort: 3000,
    endPort: 3010,
    timeout: 500,
    includeClosed: false,
    detectProcesses: true,
    securityCheck: false
  }
  
  // 更新配置并开始扫描
  Object.assign(scanConfig, quickConfig)
  await startPortScan()
}

const checkConflicts = async () => {
  try {
    const response = await portManagementApiService.detectPortConflicts()
    if (response.success && response.data) {
      const conflicts = response.data
      if (conflicts.length > 0) {
        ElMessage.warning(`发现 ${conflicts.length} 个端口冲突`)
        // 可以在这里显示冲突详情或更新UI
      } else {
        ElMessage.success('未发现端口冲突')
      }
    }
  } catch (error) {
    ElMessage.error('冲突检测失败')
  }
}

const healthCheck = async () => {
  try {
    const response = await portManagementApiService.quickHealthCheck()
    if (response.success && response.data) {
      const health = response.data
      if (health.status === 'healthy') {
  ElMessage.success('系统健康检查完成：整体状态良好')
      } else {
        ElMessage.warning(`健康检查发现问题：${health.issues.join(', ')}`)
      }
      
      // 更新统计数据
      diagnosticStats.totalPorts = 65535
      diagnosticStats.activePorts = health.activePorts
      diagnosticStats.errorPorts = health.conflicts
    }
  } catch (error) {
    ElMessage.error('健康检查失败')
  }
}

// 设置端口范围的方法
const setPortRange = (startPort: number, endPort: number) => {
  scanConfig.startPort = startPort
  scanConfig.endPort = endPort
  ElMessage.info(`已设置端口范围: ${startPort}-${endPort}`)
}

const startPortScan = async () => {
  try {
    // 验证配置
    if (scanConfig.startPort > scanConfig.endPort) {
      ElMessage.error('起始端口不能大于结束端口')
      return
    }
    
    // 验证端口范围大小
    const portRange = scanConfig.endPort - scanConfig.startPort + 1
    if (portRange > 2000) {
      ElMessage.error(`端口范围过大 (${portRange} 个端口)，最多支持 2000 个端口`)
      return
    }
    
    scanning.value = true
    scanResults.value = []
    
    // 启动异步扫描任务
    console.log('🔍 发起端口扫描请求:', scanConfig)
    const response = await portManagementApiService.startPortScan(scanConfig, { async: true })
    // 兼容同步返回：若直接返回结果数组，则视为同步扫描完成
    if (response && response.success && Array.isArray(response.data)) {
      scanResults.value = response.data as any
      scanning.value = false
      console.log('✅ 同步扫描完成，直接返回结果:', { count: scanResults.value.length })
      ElMessage.success(`ɨ����ɣ����� ${scanResults.value.length} ���˿�`)
      return
    }
    console.log('📡 端口扫描API响应:', response)
    
    if (response.success && response.data?.taskId) {
      currentTaskId.value = response.data.taskId
      ElMessage.success('扫描任务已启动')
      
      // 开始轮询任务状态
      startStatusPolling()
    } else {
      console.error('❌ 端口扫描失败 - 详细信息:', {
        success: response.success,
        data: response.data,
        error: response.error,
        message: response.message,
        fullResponse: response
      })
      throw new Error(response.error || response.message || '启动扫描失败')
    }
  } catch (error) {
    console.error('Failed to start port scan:', error)
    ElMessage.error('启动扫描失败')
    scanning.value = false
  }
}

const cancelScan = async () => {
  try {
    if (currentTaskId.value) {
      await portManagementApiService.cancelScanTask(currentTaskId.value)
      ElMessage.info('扫描已取消')
    }
    stopStatusPolling()
    scanning.value = false
    scanTask.value = null
  } catch (error) {
    ElMessage.error('取消扫描失败')
  }
}

const startStatusPolling = () => {
  if (statusTimer) {
    clearInterval(statusTimer)
  }
  
  statusTimer = setInterval(async () => {
    if (!currentTaskId.value) return
    
    try {
      const response = await portManagementApiService.getScanTaskStatus(currentTaskId.value)
      if (response.success && response.data) {
        scanTask.value = response.data
        
        // 如果扫描完成，获取结果
        if (response.data.status === 'completed') {
          await loadScanResults()
          stopStatusPolling()
          scanning.value = false
          ElMessage.success(`扫描完成，发现 ${scanResults.value.length} 个端口`)
        } else if (response.data.status === 'failed') {
          stopStatusPolling()
          scanning.value = false
          ElMessage.error(`扫描失败: ${response.data.error || '未知错误'}`)
        } else if (response.data.status === 'cancelled') {
          stopStatusPolling()
          scanning.value = false
          ElMessage.info('扫描任务已取消')
        }
        // 运行中的任务继续轮询，更新进度显示
      } else if (response.error) {
        console.warn('Failed to get task status:', response.error)
        // 任务可能不存在，停止轮询
        stopStatusPolling()
        scanning.value = false
        ElMessage.warning('无法获取扫描任务状态')
      }
    } catch (error) {
      console.error('Failed to get scan status:', error)
      // 网络错误等，继续轮询
    }
  }, 1000)
}

const stopStatusPolling = () => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
}

const loadScanResults = async () => {
  if (!currentTaskId.value) return
  
  try {
    const response = await portManagementApiService.getScanResults(currentTaskId.value)
    if (response.success && response.data) {
      scanResults.value = response.data
    }
  } catch (error) {
    console.error('Failed to load scan results:', error)
    ElMessage.error('获取扫描结果失败')
  }
}

const showPortDetail = (row: PortScanResult) => {
  selectedPort.value = row.port
  showPortDetailDialog.value = true
}

const exportResults = () => {
  if (scanResults.value.length === 0) {
    ElMessage.warning('暂无数据可导出')
    return
  }
  
  // 导出为CSV
  const csvContent = generateCSV(filteredResults.value)
  downloadFile(csvContent, `port-scan-results-${new Date().getTime()}.csv`, 'text/csv')
  ElMessage.success('结果已导出')
}

const generateCSV = (data: PortScanResult[]): string => {
  const headers = ['端口', '状态', '服务', '进程', '应用', '安全级别', '响应时间']
  const rows = data.map(item => [
    item.port,
    getStatusText(item.status),
    item.service || '',
    item.process ? `${item.process.name}(${item.process.pid})` : '',
    item.application?.name || '',
    item.security ? getRiskLevelText(item.security.riskLevel) : '',
    item.performance?.responseTime ? `${item.performance.responseTime}ms` : ''
  ])
  
  return [headers, ...rows].map(row => row.join(',')).join('\n')
}

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// 工具函数
const getScanProgressStatus = () => {
  if (!scanTask.value) return 'success'
  
  switch (scanTask.value.status) {
    case 'running': return 'success'
    case 'completed': return 'success'
    case 'failed': return 'exception'
    case 'cancelled': return 'warning'
    default: return 'success'
  }
}

const getScanStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: '等待中',
    running: '扫描中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  }
  return statusMap[status] || status
}

const getStatusTagType = (status: string) => {
  const typeMap: Record<string, string> = {
    open: 'success',
    listening: 'success',
    allocated: 'primary',
    closed: 'info',
    filtered: 'warning'
  }
  return typeMap[status] || 'info'
}

const getStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    open: '开放',
    listening: '监听中',
    allocated: '已分配',
    closed: '关闭',
    filtered: '被过滤'
  }
  return textMap[status] || status
}

const getAppTypeColor = (type: string) => {
  const colorMap: Record<string, string> = {
    frontend: '#67C23A',
    backend: '#409EFF',
    api: '#E6A23C',
    websocket: '#F56C6C',
    database: '#909399'
  }
  return colorMap[type] || '#909399'
}

const getAppTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WS',
    database: '数据库'
  }
  return textMap[type] || type
}

const getRiskLevelType = (level: string) => {
  const typeMap: Record<string, string> = {
    low: 'success',
    medium: 'warning',
    high: 'danger'
  }
  return typeMap[level] || 'info'
}

const getRiskLevelText = (level: string) => {
  const textMap: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高'
  }
  return textMap[level] || level
}

const getResponseTimeType = (responseTime: number) => {
  if (responseTime < 100) return 'success'
  if (responseTime < 500) return 'warning'
  return 'danger'
}

const formatTime = (time: Date | string | undefined) => {
  if (!time) return 'N/A'
  const date = typeof time === 'string' ? new Date(time) : time
  return date.toLocaleString('zh-CN')
}

// 事件处理函数
const handlePortReleased = (port: number) => {
  ElMessage.success(`端口 ${port} 已释放`)
  // 刷新扫描结果或更新相关数据
  if (currentTaskId.value) {
    loadScanResults()
  }
  // 更新统计数据
  healthCheck()
}

const handleProcessTerminated = (port: number, pid: number) => {
  ElMessage.success(`端口 ${port} 的进程 ${pid} 已终止`)
  // 刷新扫描结果或更新相关数据
  if (currentTaskId.value) {
    loadScanResults()
  }
  // 更新统计数据
  healthCheck()
}

// ==================== 安全检查方法 ====================

// 开始安全检查
const startSecurityScan = async () => {
  try {
    if (securityConfig.selectedPorts.length === 0) {
      ElMessage.warning('请先选择要检查的端口')
      return
    }

    securityScanning.value = true
    securityFindings.value = []
    securitySummary.value = null
    securityRecommendations.value = []

    ElMessage.info(`开始对 ${securityConfig.selectedPorts.length} 个端口进行${securityConfig.scanType === 'quick' ? '快速' : securityConfig.scanType === 'comprehensive' ? '全面' : '深度'}安全检查...`)

    // 模拟安全检查过程
    await performSecurityScan()

  } catch (error) {
    console.error('Failed to start security scan:', error)
    ElMessage.error('安全检查启动失败')
  } finally {
    securityScanning.value = false
  }
}

// 执行安全检查
const performSecurityScan = async () => {
  const findings: SecurityFinding[] = []
  const scannedPorts = securityConfig.selectedPorts

  for (const port of scannedPorts) {
    // 模拟扫描每个端口
    await new Promise(resolve => setTimeout(resolve, 500)) // 模拟扫描时间

    const portResult = scanResults.value.find(result => result.port === port)
    if (!portResult) continue

    // 生成模拟的安全检查结果
    const portFindings = generateSecurityFindings(port, portResult)
    findings.push(...portFindings)
  }

  // 过滤风险阈值
  const filteredFindings = filterFindingsByRiskThreshold(findings)
  securityFindings.value = filteredFindings

  // 生成安全摘要
  securitySummary.value = generateSecuritySummary(filteredFindings, scannedPorts.length)

  // 生成安全建议
  securityRecommendations.value = generateSecurityRecommendations(filteredFindings)

  ElMessage.success(`安全检查完成，发现 ${filteredFindings.length} 个安全问题`)
}

// 生成端口安全检查结果
const generateSecurityFindings = (port: number, portResult: PortScanResult): SecurityFinding[] => {
  const findings: SecurityFinding[] = []

  // 检查常见的安全问题
  
  // 1. 检查是否使用了不安全的协议
  if (portResult.service) {
    if (portResult.service.toLowerCase().includes('telnet')) {
      findings.push({
        id: `${port}-telnet-insecure`,
        port,
        title: '使用不安全的Telnet协议',
        description: 'Telnet协议以明文形式传输数据，包括用户名和密码，容易被网络窃听。',
        severity: 'high',
        category: '不安全协议',
        impact: '攻击者可能通过网络窃听获取敏感信息，包括登录凭据。',
        evidence: [`端口 ${port} 运行 Telnet 服务`],
        recommendations: [
          '禁用 Telnet 服务',
          '使用 SSH 替代 Telnet 进行远程访问',
          '如必须使用，请通过 VPN 进行访问'
        ],
        references: [
          { title: 'CWE-319: 明文传输敏感信息', url: 'https://cwe.mitre.org/data/definitions/319.html' }
        ]
      })
    }

    if (portResult.service.toLowerCase().includes('ftp')) {
      findings.push({
        id: `${port}-ftp-insecure`,
        port,
        title: '使用不安全的FTP协议',
        description: 'FTP协议以明文形式传输数据和认证信息，存在安全风险。',
        severity: 'medium',
        category: '不安全协议',
        impact: '攻击者可能截获传输的文件内容和登录凭据。',
        evidence: [`端口 ${port} 运行 FTP 服务`],
        recommendations: [
          '使用 SFTP 或 FTPS 替代 FTP',
          '启用 FTP over SSL/TLS',
          '限制 FTP 访问的 IP 地址'
        ],
        references: [
          { title: 'RFC 2228 - FTP安全扩展', url: 'https://tools.ietf.org/html/rfc2228' }
        ]
      })
    }

    if (portResult.service.toLowerCase().includes('http') && !portResult.service.toLowerCase().includes('https')) {
      findings.push({
        id: `${port}-http-no-ssl`,
        port,
        title: 'HTTP服务未启用SSL/TLS',
        description: 'HTTP协议不提供数据加密，敏感信息可能在传输过程中被截获。',
        severity: 'medium',
        category: '加密缺失',
        impact: '用户数据和会话信息可能被网络攻击者截获和篡改。',
        evidence: [`端口 ${port} 运行未加密的 HTTP 服务`],
        recommendations: [
          '配置 HTTPS 并重定向 HTTP 流量',
          '获取并安装 SSL/TLS 证书',
          '启用 HSTS（HTTP严格传输安全）'
        ],
        references: [
          { title: 'OWASP传输层保护', url: 'https://owasp.org/www-community/controls/SecureTransmission' }
        ]
      })
    }
  }

  // 2. 检查默认端口使用
  const commonPorts = {
    22: { name: 'SSH', risk: 'low' },
    23: { name: 'Telnet', risk: 'high' },
    25: { name: 'SMTP', risk: 'medium' },
    53: { name: 'DNS', risk: 'medium' },
    80: { name: 'HTTP', risk: 'medium' },
    110: { name: 'POP3', risk: 'medium' },
    143: { name: 'IMAP', risk: 'medium' },
    443: { name: 'HTTPS', risk: 'low' },
    993: { name: 'IMAPS', risk: 'low' },
    995: { name: 'POP3S', risk: 'low' },
    3389: { name: 'RDP', risk: 'high' }
  }

  const portInfo = commonPorts[port as keyof typeof commonPorts]
  if (portInfo && portInfo.risk === 'high') {
    findings.push({
      id: `${port}-default-port-high-risk`,
      port,
      title: `高风险默认端口 ${port}`,
      description: `端口 ${port} 是 ${portInfo.name} 服务的默认端口，容易成为攻击目标。`,
      severity: 'high',
      category: '默认配置',
      impact: '攻击者可能针对默认端口进行自动化攻击和端口扫描。',
      evidence: [`端口 ${port} 使用默认的 ${portInfo.name} 端口`],
      recommendations: [
        '考虑更改服务到非默认端口',
        '实施强访问控制和防火墙规则',
        '启用入侵检测系统监控'
      ]
    })
  }

  // 3. 检查端口暴露风险
  if (portResult.status === 'open' || portResult.status === 'listening') {
    // 检查是否是管理端口
    const adminPorts = [22, 23, 3389, 5900, 5901]
    if (adminPorts.includes(port)) {
      findings.push({
        id: `${port}-admin-port-exposed`,
        port,
        title: '管理端口对外暴露',
        description: '管理端口对外开放可能允许未授权的远程访问。',
        severity: 'critical',
        category: '访问控制',
        impact: '攻击者可能获得系统的远程访问权限，进行未授权操作。',
        evidence: [`管理端口 ${port} 处于开放状态`],
        recommendations: [
          '限制管理端口仅对信任的IP地址开放',
          '使用VPN进行远程管理',
          '启用多因素认证',
          '定期审计访问日志'
        ]
      })
    }
  }

  // 4. 检查进程相关安全问题
  if (portResult.process) {
    // 检查是否以root/管理员权限运行
    if (portResult.process.user === 'root' || portResult.process.user === 'administrator') {
      findings.push({
        id: `${port}-process-high-privilege`,
        port,
        title: '服务以高权限运行',
        description: '服务进程以管理员权限运行，增加了安全风险。',
        severity: 'medium',
        category: '权限管理',
        impact: '如果服务被攻破，攻击者将获得系统的高级权限。',
        evidence: [`端口 ${port} 的进程 ${portResult.process.name} 以 ${portResult.process.user} 权限运行`],
        recommendations: [
          '创建专用的低权限用户运行服务',
          '实施最小权限原则',
          '定期审查服务权限配置'
        ]
      })
    }
  }

  // 5. 添加随机的模拟安全问题（用于演示）
  if (Math.random() > 0.7) { // 30%的概率
    findings.push({
      id: `${port}-weak-ssl-config`,
      port,
      title: 'SSL/TLS配置较弱',
      description: '服务使用了过时或不安全的SSL/TLS配置。',
      severity: 'medium',
      category: 'SSL/TLS配置',
      impact: '可能导致中间人攻击或数据泄露。',
      evidence: [`检测到端口 ${port} 使用弱加密算法`],
      recommendations: [
        '禁用SSLv2、SSLv3和TLS 1.0/1.1',
        '使用强密码套件',
        '启用完美前向保密(PFS)'
      ]
    })
  }

  if (Math.random() > 0.8) { // 20%的概率
    findings.push({
      id: `${port}-banner-disclosure`,
      port,
      title: '服务版本信息泄露',
      description: '服务banner中包含详细的版本信息，可能帮助攻击者识别漏洞。',
      severity: 'low',
      category: '信息泄露',
      impact: '攻击者可能基于版本信息寻找已知漏洞进行攻击。',
      evidence: [`端口 ${port} 的服务banner包含版本信息`],
      recommendations: [
        '配置服务隐藏版本信息',
        '定期更新服务到最新版本',
        '实施网络分段隔离'
      ]
    })
  }

  return findings
}

// 根据风险阈值过滤结果
const filterFindingsByRiskThreshold = (findings: SecurityFinding[]): SecurityFinding[] => {
  const riskLevels = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  }

  const threshold = riskLevels[securityConfig.riskThreshold]
  return findings.filter(finding => riskLevels[finding.severity] >= threshold)
}

// 生成安全摘要
const generateSecuritySummary = (findings: SecurityFinding[], scannedPorts: number): SecuritySummary => {
  const criticalCount = findings.filter(f => f.severity === 'critical').length
  const highCount = findings.filter(f => f.severity === 'high').length
  const mediumCount = findings.filter(f => f.severity === 'medium').length
  const lowCount = findings.filter(f => f.severity === 'low').length

  // 计算安全评分
  let score = 100
  score -= criticalCount * 25
  score -= highCount * 15
  score -= mediumCount * 8
  score -= lowCount * 3
  score = Math.max(0, score)

  // 确定安全等级
  let grade = 'A'
  if (score < 60) grade = 'F'
  else if (score < 70) grade = 'D'
  else if (score < 80) grade = 'C'
  else if (score < 90) grade = 'B'

  return {
    overallGrade: grade,
    securityScore: score,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    scannedPorts,
    vulnerablePorts: new Set(findings.map(f => f.port)).size
  }
}

// 生成安全建议
const generateSecurityRecommendations = (findings: SecurityFinding[]): SecurityRecommendation[] => {
  const recommendations: SecurityRecommendation[] = []

  if (findings.some(f => f.severity === 'critical')) {
    recommendations.push({
      title: '立即处理严重安全风险',
      description: '检测到严重安全风险，需要立即采取措施修复。',
      priority: 'critical',
      steps: [
        '识别并记录所有严重风险项',
        '制定紧急修复计划',
        '优先处理面向公网的服务',
        '实施临时缓解措施'
      ]
    })
  }

  if (findings.some(f => f.category === '不安全协议')) {
    recommendations.push({
      title: '升级到安全协议',
      description: '替换不安全的通信协议，提高数据传输安全性。',
      priority: 'high',
      steps: [
        '清点所有使用不安全协议的服务',
        '制定协议升级计划',
        '配置SSL/TLS加密',
        '测试并验证加密连接'
      ]
    })
  }

  if (findings.some(f => f.category === '访问控制')) {
    recommendations.push({
      title: '加强访问控制',
      description: '实施严格的访问控制措施，限制未授权访问。',
      priority: 'high',
      steps: [
        '配置防火墙规则',
        '实施IP白名单',
        '启用多因素认证',
        '定期审计访问权限'
      ]
    })
  }

  // 通用建议
  recommendations.push({
    title: '建立持续安全监控',
    description: '建立持续的安全监控和威胁检测机制。',
    priority: 'medium',
    steps: [
      '部署入侵检测系统(IDS)',
      '配置安全日志收集',
      '建立安全事件响应流程',
      '定期进行安全评估'
    ]
  })

  recommendations.push({
    title: '定期安全更新',
    description: '保持系统和服务的安全补丁为最新状态。',
    priority: 'medium',
    steps: [
      '制定补丁管理策略',
      '建立测试和部署流程',
      '监控安全公告和漏洞信息',
      '定期进行漏洞扫描'
    ]
  })

  return recommendations
}

// 生成安全报告
const generateSecurityReport = async () => {
  try {
    const reportData = {
      scanTime: new Date(),
      scannedPorts: securityConfig.selectedPorts,
      summary: securitySummary.value,
      findings: securityFindings.value,
      recommendations: securityRecommendations.value
    }

    // 这里应该调用后端API生成报告
    // 为了演示，显示报告内容摘要
    ElMessageBox.alert(`
      <div style="text-align: left;">
        <h3>安全检查报告</h3>
        <p><strong>扫描时间:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>扫描端口数:</strong> ${reportData.scannedPorts.length}</p>
        <p><strong>安全评分:</strong> ${reportData.summary?.securityScore}/100</p>
        <p><strong>发现问题:</strong> ${reportData.findings.length} 个</p>
        <ul>
          <li>严重: ${reportData.summary?.criticalCount} 个</li>
          <li>高级: ${reportData.summary?.highCount} 个</li>
          <li>中级: ${reportData.summary?.mediumCount} 个</li>
          <li>低级: ${reportData.summary?.lowCount} 个</li>
        </ul>
        <p><strong>安全建议:</strong> ${reportData.recommendations.length} 条</p>
      </div>
    `, '安全报告生成完成', {
      dangerouslyUseHTMLString: true,
      confirmButtonText: '确定'
    })

  } catch (error) {
    console.error('Failed to generate security report:', error)
    ElMessage.error('生成安全报告失败')
  }
}

// 标记安全问题为已修复
const markAsFixed = async (findingId: string) => {
  const finding = securityFindings.value.find(f => f.id === findingId)
  if (finding) {
    finding.fixed = true
    ElMessage.success('已标记为修复状态')
    
    // 重新计算安全摘要
    if (securitySummary.value) {
      const remainingFindings = securityFindings.value.filter(f => !f.fixed && !f.suppressed)
      securitySummary.value = generateSecuritySummary(remainingFindings, securityConfig.selectedPorts.length)
    }
  }
}

// 忽略安全问题
const suppressFinding = async (findingId: string) => {
  try {
    await ElMessageBox.confirm('确定要忽略此安全问题吗？忽略后将不再显示此问题。', '确认忽略', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    const finding = securityFindings.value.find(f => f.id === findingId)
    if (finding) {
      finding.suppressed = true
      ElMessage.success('已忽略此安全问题')
      
      // 重新计算安全摘要
      if (securitySummary.value) {
        const remainingFindings = securityFindings.value.filter(f => !f.fixed && !f.suppressed)
        securitySummary.value = generateSecuritySummary(remainingFindings, securityConfig.selectedPorts.length)
      }
    }
  } catch {
    // 用户取消忽略操作
  }
}

// 导出安全问题详情
const exportFinding = (finding: SecurityFinding) => {
  const exportData = {
    id: finding.id,
    port: finding.port,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    category: finding.category,
    impact: finding.impact,
    evidence: finding.evidence,
    recommendations: finding.recommendations,
    references: finding.references,
    exportTime: new Date().toISOString()
  }

  // 创建下载链接
  const dataStr = JSON.stringify(exportData, null, 2)
  const blob = new Blob([dataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = url
  link.download = `security-finding-${finding.id}-${Date.now()}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('安全问题详情已导出')
}

// 标记建议为完成
const markRecommendationCompleted = (index: number) => {
  const recommendation = securityRecommendations.value[index]
  if (recommendation) {
    recommendation.completed = true
    ElMessage.success('已标记建议为完成状态')
  }
}

// 安全检查工具方法
const getSecurityGradeType = (grade: string) => {
  const typeMap: Record<string, string> = {
    A: 'success',
    B: 'success',
    C: 'warning',
    D: 'danger',
    F: 'danger'
  }
  return typeMap[grade] || 'info'
}

const getSecurityRiskType = (severity: string) => {
  const typeMap: Record<string, string> = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return typeMap[severity] || 'info'
}

const getSecurityRiskText = (severity: string) => {
  const textMap: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
  }
  return textMap[severity] || severity
}

const getRecommendationPriorityType = (priority: string) => {
  const typeMap: Record<string, string> = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return typeMap[priority] || 'info'
}

const getRecommendationPriorityText = (priority: string) => {
  const textMap: Record<string, string> = {
    critical: '紧急',
    high: '高优先级',
    medium: '中优先级',
    low: '低优先级'
  }
  return textMap[priority] || priority
}

const getScoreColor = (score: number) => {
  if (score >= 90) return '#67c23a'
  if (score >= 80) return '#e6a23c'
  if (score >= 60) return '#f56c6c'
  return '#f56c6c'
}

// 跳转到告警中心
const goToAlertCenter = () => {
  router.push('/ports/alerts')
}

// 图表事件处理
const handleChartTimeRangeChange = (timeRange: string) => {
  performanceTimeRange.value = timeRange
  refreshPerformanceData()
}

const handleChartClick = (params: any) => {
  console.log('Chart clicked:', params)
  // 可以在这里添加图表点击的处理逻辑
  // 例如显示详细信息或跳转到特定时间点
}

// 更新图表数据
const updatePerformanceChartData = (port: number) => {
  if (performanceMetrics.value[port]) {
    performanceChartData.value = performanceMetrics.value[port]
  } else {
    performanceChartData.value = []
  }
}

// ==================== 性能监控方法 ====================

// 开始性能监控
const startPerformanceMonitoring = async () => {
  try {
    if (performanceConfig.selectedPorts.length === 0) {
      ElMessage.warning('请先选择要监控的端口')
      return
    }

    performanceMonitoring.value = true
    
    const config: Partial<MonitoringConfig> = {
      interval: performanceConfig.interval,
      thresholds: {
        responseTime: performanceConfig.responseTimeThreshold,
        availability: performanceConfig.availabilityThreshold,
        errorRate: performanceConfig.errorRateThreshold
      },
      alerting: {
        enabled: true,
        channels: ['console']
      }
    }

    const response = await portPerformanceApiService.startMonitoring(performanceConfig.selectedPorts, config)
    
    if (response.success) {
      ElMessage.success('性能监控已启动')
      // 立即获取一次概览数据
      await loadPerformanceOverview()
      // 开始定期刷新数据
      startPerformanceDataRefresh()
    } else {
      throw new Error(response.error || '启动监控失败')
    }
  } catch (error) {
    console.error('Failed to start performance monitoring:', error)
    ElMessage.error('启动性能监控失败')
    performanceMonitoring.value = false
  }
}

// 停止性能监控
const stopPerformanceMonitoring = async () => {
  try {
    const response = await portPerformanceApiService.stopMonitoring()
    
    if (response.success) {
      performanceMonitoring.value = false
      performanceOverview.value = []
      performanceAlerts.value = []
      selectedPerformancePort.value = undefined
      stopPerformanceDataRefresh()
      ElMessage.success('性能监控已停止')
    } else {
      throw new Error(response.error || '停止监控失败')
    }
  } catch (error) {
    console.error('Failed to stop performance monitoring:', error)
    ElMessage.error('停止性能监控失败')
  }
}

// 加载性能概览数据
const loadPerformanceOverview = async () => {
  try {
    if (performanceConfig.selectedPorts.length === 0) return

    const response = await portPerformanceApiService.getPerformanceOverview(
      performanceConfig.selectedPorts,
      performanceTimeRange.value
    )
    
    if (response.success && response.data) {
      performanceOverview.value = response.data
    }
  } catch (error) {
    console.error('Failed to load performance overview:', error)
  }
}

// 加载性能告警
const loadPerformanceAlerts = async () => {
  try {
    const response = await portPerformanceApiService.getAllAlerts({
      acknowledged: false,
      limit: 20
    })
    
    if (response.success && response.data) {
      performanceAlerts.value = response.data
    }
  } catch (error) {
    console.error('Failed to load performance alerts:', error)
  }
}

// 显示端口性能详情
const showPortPerformanceDetail = async (port: number) => {
  selectedPerformancePort.value = port
  loadingPerformanceData.value = true
  
  try {
    await refreshPerformanceData()
    updatePerformanceChartData(port)
  } catch (error) {
    console.error('Failed to load port performance detail:', error)
    ElMessage.error('加载端口性能详情失败')
  } finally {
    loadingPerformanceData.value = false
  }
}

// 刷新性能数据
const refreshPerformanceData = async () => {
  if (!selectedPerformancePort.value) return

  try {
    loadingPerformanceData.value = true
    
    // 获取性能趋势数据
    const trendResponse = await portPerformanceApiService.getPerformanceTrend(
      selectedPerformancePort.value,
      performanceTimeRange.value
    )
    
    if (trendResponse.success && trendResponse.data) {
      // 存储图表数据
      performanceMetrics.value[selectedPerformancePort.value] = trendResponse.data.dataPoints
      performanceChartData.value = trendResponse.data.dataPoints
    }
    
    // 刷新告警数据
    await loadPerformanceAlerts()
    
  } catch (error) {
    console.error('Failed to refresh performance data:', error)
    ElMessage.error('刷新性能数据失败')
  } finally {
    loadingPerformanceData.value = false
  }
}

// 删除了renderPerformanceCharts方法，现在由PerformanceChart组件处理图表渲染

// 确认告警
const acknowledgeAlert = async (alertId: number) => {
  try {
    const response = await portPerformanceApiService.acknowledgeAlert(alertId)
    
    if (response.success) {
      // 更新本地告警状态
      const alert = performanceAlerts.value.find(a => a.id === alertId)
      if (alert) {
        alert.acknowledged = true
      }
      ElMessage.success('告警已确认')
    } else {
      throw new Error(response.error || '确认告警失败')
    }
  } catch (error) {
    console.error('Failed to acknowledge alert:', error)
    ElMessage.error('确认告警失败')
  }
}

// 显示性能摘要
const showPerformanceSummary = async () => {
  try {
    const response = await portPerformanceApiService.getPerformanceSummary(performanceTimeRange.value)
    
    if (response.success && response.data) {
      const summary = response.data
      
      ElMessageBox.alert(`
        <div style="text-align: left;">
          <h4>监控状态</h4>
          <p>启用状态: ${summary.monitoring.enabled ? '已启用' : '未启用'}</p>
          <p>监控端口数: ${summary.monitoring.totalPorts}</p>
          <p>活跃监控器: ${summary.monitoring.activeMonitors}</p>
          
          <h4>性能概况</h4>
          <p>健康端口: ${summary.performance.healthyPorts}</p>
          <p>警告端口: ${summary.performance.warningPorts}</p>
          <p>严重端口: ${summary.performance.criticalPorts}</p>
          <p>平均响应时间: ${summary.performance.avgResponseTime.toFixed(0)}ms</p>
          <p>平均可用性: ${summary.performance.avgAvailability.toFixed(1)}%</p>
          
          <h4>告警统计</h4>
          <p>总告警数: ${summary.alerts.total}</p>
          <p>未确认告警: ${summary.alerts.unacknowledged}</p>
          <p>严重告警: ${summary.alerts.critical + summary.alerts.high}</p>
        </div>
      `, '性能监控摘要', {
        dangerouslyUseHTMLString: true,
        confirmButtonText: '确定'
      })
    }
  } catch (error) {
    console.error('Failed to show performance summary:', error)
    ElMessage.error('获取性能摘要失败')
  }
}

// 显示所有告警
const showAllAlerts = () => {
  // 这里可以打开一个专门的告警管理弹窗
  ElMessage.info('告警管理功能开发中')
}

// 性能数据刷新定时器
let performanceRefreshTimer: NodeJS.Timeout | null = null

const startPerformanceDataRefresh = () => {
  stopPerformanceDataRefresh()
  
  performanceRefreshTimer = setInterval(async () => {
    await loadPerformanceOverview()
    await loadPerformanceAlerts()
  }, 30000) // 每30秒刷新一次
}

const stopPerformanceDataRefresh = () => {
  if (performanceRefreshTimer) {
    clearInterval(performanceRefreshTimer)
    performanceRefreshTimer = null
  }
}

// 工具方法
const getPerformanceStatusType = (status: string) => {
  const typeMap: Record<string, string> = {
    healthy: 'success',
    unhealthy: 'warning',
    error: 'danger'
  }
  return typeMap[status] || 'info'
}

const getPerformanceStatusText = (status: string) => {
  const textMap: Record<string, string> = {
    healthy: '健康',
    unhealthy: '异常',
    error: '错误'
  }
  return textMap[status] || '未知'
}

const getTrendType = (trend: string) => {
  const typeMap: Record<string, string> = {
    improving: 'success',
    degrading: 'danger',
    stable: 'info'
  }
  return typeMap[trend] || 'info'
}

const getTrendText = (trend: string) => {
  const textMap: Record<string, string> = {
    improving: '改善',
    degrading: '恶化',
    stable: '稳定'
  }
  return textMap[trend] || '未知'
}

const getAlertTypeText = (type: string) => {
  const textMap: Record<string, string> = {
    high_response_time: '响应时间过高',
    low_availability: '可用性过低',
    high_error_rate: '错误率过高',
    connection_failure: '连接失败',
    resource_exhaustion: '资源耗尽'
  }
  return textMap[type] || type
}

const getSeverityType = (severity: string) => {
  const typeMap: Record<string, string> = {
    low: 'info',
    medium: 'warning',
    high: 'danger',
    critical: 'danger'
  }
  return typeMap[severity] || 'info'
}

const getSeverityText = (severity: string) => {
  const textMap: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重'
  }
  return textMap[severity] || severity
}

const formatAlertValue = (value: number, type: string) => {
  if (type.includes('time')) {
    return `${value.toFixed(0)}ms`
  } else if (type.includes('rate') || type.includes('availability')) {
    return `${value.toFixed(1)}%`
  }
  return value.toString()
}

// 生命周期
onMounted(() => {
  // 初始化时执行健康检查
  healthCheck()
})

onUnmounted(() => {
  // 清理定时器
  stopStatusPolling()
  stopPerformanceDataRefresh()
})
</script>

<style scoped>
.port-diagnostics {
  padding: 0;
}

.diagnostics-toolbar {
  margin-bottom: 20px;
}

.toolbar-content {
  display: flex;
  gap: 40px;
}

.tool-group h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.tool-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.diagnostics-results {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.card-header .el-button {
  margin-left: auto;
}

/* 状态列表样式 */
.status-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background-color: #fafafa;
}

.status-icon {
  font-size: 16px;
}

.status-icon.success {
  color: #67c23a;
}

.status-icon.warning {
  color: #e6a23c;
}

.status-icon.error {
  color: #f56c6c;
}

.status-item span {
  flex: 1;
  font-size: 14px;
}

/* 统计列表样式 */
.stats-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 6px;
  background-color: #fafafa;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.stat-value.active {
  color: #409eff;
}

.stat-value.error {
  color: #f56c6c;
}

/* 事件列表样式 */
.events-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.event-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background-color: #fafafa;
}

.event-icon {
  font-size: 16px;
  margin-top: 2px;
}

.event-icon.info {
  color: #409eff;
}

.event-icon.warning {
  color: #e6a23c;
}

.event-icon.success {
  color: #67c23a;
}

.event-content {
  flex: 1;
}

.event-title {
  font-size: 14px;
  color: #303133;
  margin-bottom: 2px;
}

.event-time {
  font-size: 12px;
  color: #909399;
}

.diagnostics-details {
  margin-bottom: 20px;
}

/* 扫描配置样式 */
.scan-config-section {
  margin-bottom: 16px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

/* 扫描进度样式 */
.scan-progress-section {
  margin-bottom: 16px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.progress-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.progress-details {
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: #606266;
}

/* 扫描结果样式 */
.scan-results-section {
  margin-bottom: 16px;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.results-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

/* 空状态样式 */
.empty-state {
  padding: 40px 20px;
  text-align: center;
}

/* 工具类 */
.text-muted {
  color: #909399;
  font-style: italic;
}

/* 表格行悬停效果 */
.el-table__row {
  cursor: pointer;
}

.el-table__row:hover {
  background-color: #f5f7fa;
}

/* 标签样式优化 */
.el-tag {
  border: none;
  font-weight: 500;
}

/* 性能监控样式 */
.performance-console-section {
  margin-bottom: 16px;
}

.performance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.control-buttons {
  display: flex;
  gap: 8px;
}

.performance-card {
  height: 100%;
}

.performance-card .card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.metric-item {
  text-align: center;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.metric-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.alert-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  color: #e6a23c;
  font-size: 14px;
}

.alert-icon {
  font-size: 16px;
}

.error-info {
  margin-bottom: 12px;
  font-size: 14px;
}

.card-actions {
  text-align: center;
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.chart-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chart-container {
  margin-bottom: 24px;
}

.chart-container h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #333;
}

.chart {
  width: 100%;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  background: #fff;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.performance-overview-section .el-row {
  margin-top: 0 !important;
}

/* 安全检查样式 */
.security-console-section {
  margin-bottom: 16px;
}

.security-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.security-controls {
  display: flex;
  gap: 8px;
}

.security-stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.stat-card {
  text-align: center;
  padding: 20px;
  border-radius: 8px;
  border: 2px solid transparent;
  background: #f8f9fa;
}

.stat-card.critical {
  border-color: #f56c6c;
  background: #fef0f0;
}

.stat-card.high {
  border-color: #e6a23c;
  background: #fdf6ec;
}

.stat-card.medium {
  border-color: #409eff;
  background: #ecf5ff;
}

.stat-card.low {
  border-color: #67c23a;
  background: #f0f9ff;
}

.stat-number {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 8px;
  color: #333;
}

.stat-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.security-score-section {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.score-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: 600;
}

.score-value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
}

.findings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.findings-filters {
  display: flex;
  gap: 12px;
  align-items: center;
}

.findings-list {
  margin-top: 16px;
}

.finding-title {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
}

.finding-name {
  font-weight: 600;
  flex: 1;
}

.finding-port {
  color: #666;
  font-size: 12px;
}

.finding-content {
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 12px;
}

.finding-content h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #333;
}

.finding-content p {
  margin: 0 0 16px 0;
  line-height: 1.6;
  color: #666;
}

.finding-content ul,
.finding-content ol {
  margin: 0 0 16px 0;
  padding-left: 24px;
}

.finding-content li {
  margin-bottom: 8px;
  line-height: 1.5;
  color: #666;
}

.finding-content a {
  color: #409eff;
  text-decoration: none;
}

.finding-content a:hover {
  text-decoration: underline;
}

.finding-actions {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  gap: 8px;
}

.recommendations-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.recommendations-list {
  margin-top: 16px;
}

.recommendation-item {
  display: flex;
  gap: 16px;
  padding: 20px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 16px;
  background: #fff;
}

.recommendation-priority {
  flex-shrink: 0;
}

.recommendation-content {
  flex: 1;
}

.recommendation-content h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.recommendation-content p {
  margin: 0 0 12px 0;
  line-height: 1.6;
  color: #666;
}

.recommendation-steps {
  margin-top: 12px;
}

.recommendation-steps ol {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.recommendation-steps li {
  margin-bottom: 4px;
  line-height: 1.5;
  color: #666;
}

.recommendation-actions {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .toolbar-content {
    flex-direction: column;
    gap: 20px;
  }
  
  .tool-buttons {
    justify-content: center;
  }
  
  .results-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .results-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .progress-details {
    flex-direction: column;
    gap: 8px;
  }
  
  .config-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  /* 性能监控响应式样式 */
  .performance-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .control-buttons {
    width: 100%;
    justify-content: space-between;
  }
  
  .performance-overview-section .el-col {
    width: 100% !important;
    margin-bottom: 16px;
  }
  
  .metrics-grid {
    grid-template-columns: 1fr;
  }
  
  .chart-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .chart-controls {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  
  .alerts-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  
  /* 安全检查响应式样式 */
  .security-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .security-controls {
    width: 100%;
    justify-content: space-between;
  }
  
  .security-stats-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  
  .stat-card {
    padding: 16px;
  }
  
  .stat-number {
    font-size: 24px;
  }
  
  .findings-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .findings-filters {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .finding-title {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .finding-content {
    padding: 16px;
  }
  
  .finding-actions {
    flex-direction: column;
    gap: 8px;
  }
  
  .recommendation-item {
    flex-direction: column;
    gap: 12px;
  }
  
  .recommendations-header {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
}

/* 加载状态样式 */
.el-loading-mask {
  background-color: rgba(255, 255, 255, 0.8);
}

/* 表格列宽优化 */
.el-table .cell {
  padding-left: 8px;
  padding-right: 8px;
}

/* 进度条样式 */
.el-progress {
  margin-bottom: 8px;
}

.el-progress__text {
  font-weight: 600;
}

/* 卡片间距优化 */
.scan-config-section .el-card,
.scan-progress-section .el-card,
.scan-results-section .el-card {
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

/* 表单项样式优化 */
.el-form-item {
  margin-bottom: 16px;
}

.el-form-item__label {
  font-weight: 500;
  color: #606266;
}

/* 按钮组样式 */
.el-button-group {
  display: flex;
  gap: 8px;
}

/* 状态标签样式 */
.el-tag.is-success {
  background-color: #f0f9ff;
  border-color: #67c23a;
  color: #67c23a;
}

.el-tag.is-warning {
  background-color: #fdf6ec;
  border-color: #e6a23c;
  color: #e6a23c;
}

.el-tag.is-danger {
  background-color: #fef0f0;
  border-color: #f56c6c;
  color: #f56c6c;
}

.el-tag.is-info {
  background-color: #f4f4f5;
  border-color: #909399;
  color: #909399;
}
</style>
