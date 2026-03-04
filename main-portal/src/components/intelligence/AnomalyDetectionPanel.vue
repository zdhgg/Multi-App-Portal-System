<template>
  <div class="anomaly-detection-panel">
    <el-card>
      <template #header>
        <div class="panel-header">
          <h3>AI智能异常检测</h3>
          <div class="header-actions">
            <el-badge :value="realTimeAnomalies.length" :hidden="realTimeAnomalies.length === 0">
              <el-button 
                type="danger" 
                :icon="Warning"
                @click="showRealTimeAnomalies"
                size="small"
                :disabled="!detectionEnabled"
              >
                实时异常
              </el-button>
            </el-badge>
            <el-button 
              :type="detectionEnabled ? 'danger' : 'success'"
              :icon="detectionEnabled ? VideoPause : VideoPlay"
              @click="toggleDetection"
              size="small"
            >
              {{ detectionEnabled ? '停止检测' : '启动检测' }}
            </el-button>
            <el-button 
              type="primary" 
              :icon="Document"
              @click="generateReport"
              :loading="generatingReport"
              size="small"
            >
              生成报告
            </el-button>
          </div>
        </div>
      </template>

      <!-- 检测状态概览 -->
      <div class="status-overview">
        <el-row :gutter="16">
          <el-col :span="6">
            <div class="status-card">
              <div class="status-icon detection" :class="{ active: detectionEnabled }">
                <el-icon size="24"><Cpu /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-title">检测状态</div>
                <div class="status-value" :class="{ active: detectionEnabled }">
                  {{ detectionEnabled ? '运行中' : '已停止' }}
                </div>
                <div class="status-meta">
                  运行时长: {{ formatRunTime(runTime) }}
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="status-card">
              <div class="status-icon health">
                <el-icon size="24"><Monitor /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-title">系统健康度</div>
                <div class="status-value">
                  {{ systemHealth.currentScore }}/100
                </div>
                <div class="status-meta">
                  <el-tag :type="getTrendType(systemHealth.trend)" size="small">
                    {{ getTrendText(systemHealth.trend) }}
                  </el-tag>
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="status-card">
              <div class="status-icon anomalies">
                <el-icon size="24"><Warning /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-title">今日异常</div>
                <div class="status-value anomaly-count">
                  {{ todayAnomalies.length }}
                </div>
                <div class="status-meta">
                  <span class="critical">{{ criticalCount }}</span> 严重 / 
                  <span class="high">{{ highCount }}</span> 高级
                </div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="status-card">
              <div class="status-icon accuracy">
                <el-icon size="24"><TrendCharts /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-title">检测精度</div>
                <div class="status-value">
                  {{ (detectionAccuracy * 100).toFixed(1) }}%
                </div>
                <div class="status-meta">
                  误报率: {{ (falsePositiveRate * 100).toFixed(1) }}%
                </div>
              </div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 配置面板 -->
      <el-collapse v-model="activeConfigPanels" style="margin: 20px 0;">
        <el-collapse-item title="检测配置" name="config">
          <div class="config-panel">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-card shadow="never">
                  <template #header>
                    <span>检测方法</span>
                  </template>
                  <el-form :model="config.methods" size="small">
                    <el-form-item>
                      <el-checkbox v-model="config.methods.statistical">
                        统计异常检测
                      </el-checkbox>
                      <div class="method-desc">基于Z-Score和IQR的统计方法</div>
                    </el-form-item>
                    <el-form-item>
                      <el-checkbox v-model="config.methods.isolation">
                        孤立森林检测
                      </el-checkbox>
                      <div class="method-desc">机器学习异常检测算法</div>
                    </el-form-item>
                    <el-form-item>
                      <el-checkbox v-model="config.methods.clustering">
                        聚类分析检测
                      </el-checkbox>
                      <div class="method-desc">基于DBSCAN的聚类异常检测</div>
                    </el-form-item>
                    <el-form-item>
                      <el-checkbox v-model="config.methods.timeSeries">
                        时间序列检测
                      </el-checkbox>
                      <div class="method-desc">时间序列模式异常检测</div>
                    </el-form-item>
                  </el-form>
                </el-card>
              </el-col>

              <el-col :span="8">
                <el-card shadow="never">
                  <template #header>
                    <span>统计参数</span>
                  </template>
                  <el-form :model="config.statistical" label-width="100px" size="small">
                    <el-form-item label="Z-Score阈值">
                      <el-slider 
                        v-model="config.statistical.zScoreThreshold"
                        :min="1.5"
                        :max="4"
                        :step="0.1"
                        show-input
                      />
                    </el-form-item>
                    <el-form-item label="IQR倍数">
                      <el-slider 
                        v-model="config.statistical.iqrMultiplier"
                        :min="1"
                        :max="3"
                        :step="0.1"
                        show-input
                      />
                    </el-form-item>
                    <el-form-item label="窗口大小">
                      <el-slider 
                        v-model="config.statistical.windowSize"
                        :min="20"
                        :max="200"
                        :step="10"
                        show-input
                      />
                    </el-form-item>
                  </el-form>
                </el-card>
              </el-col>

              <el-col :span="8">
                <el-card shadow="never">
                  <template #header>
                    <span>高级设置</span>
                  </template>
                  <el-form label-width="100px" size="small">
                    <el-form-item label="实时检测">
                      <el-switch v-model="config.realtime" />
                      <div class="config-help">启用实时异常检测</div>
                    </el-form-item>
                    <el-form-item label="自动告警">
                      <el-switch v-model="config.autoAlert" />
                      <div class="config-help">异常时自动发送告警</div>
                    </el-form-item>
                    <el-form-item label="学习模式">
                      <el-switch v-model="config.learningMode" />
                      <div class="config-help">自动优化检测模型</div>
                    </el-form-item>
                    <el-form-item label="检测间隔">
                      <el-select v-model="config.detectionInterval">
                        <el-option label="30秒" :value="30" />
                        <el-option label="1分钟" :value="60" />
                        <el-option label="5分钟" :value="300" />
                        <el-option label="10分钟" :value="600" />
                      </el-select>
                    </el-form-item>
                  </el-form>
                </el-card>
              </el-col>
            </el-row>

            <div class="config-actions">
              <el-button @click="resetConfig">重置默认</el-button>
              <el-button @click="saveConfig">保存配置</el-button>
              <el-button type="primary" @click="applyConfig">应用配置</el-button>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <!-- 异常检测结果 -->
      <div class="detection-results">
        <el-tabs v-model="activeResultTab">
          <el-tab-pane label="实时监控" name="realtime">
            <div class="realtime-monitoring">
              <!-- 实时异常流 -->
              <div class="anomaly-stream" v-if="detectionEnabled">
                <div class="stream-header">
                  <span>异常事件流</span>
                  <div class="stream-controls">
                    <el-switch v-model="streamPaused" inactive-text="暂停" active-text="继续" />
                    <el-button @click="clearStream" size="small" type="text">清空</el-button>
                  </div>
                </div>
                
                <div class="stream-content" ref="streamContainer">
                  <div 
                    v-for="anomaly in realtimeAnomalyStream" 
                    :key="anomaly.id"
                    class="anomaly-item"
                    :class="[`severity-${anomaly.severity}`, { new: isNewAnomaly(anomaly) }]"
                  >
                    <div class="anomaly-header">
                      <div class="anomaly-time">{{ anomaly.timestamp.toLocaleTimeString() }}</div>
                      <el-tag :type="getSeverityType(anomaly.severity)" size="small">
                        {{ getSeverityText(anomaly.severity) }}
                      </el-tag>
                    </div>
                    <div class="anomaly-content">
                      <div class="anomaly-title">
                        端口 {{ anomaly.port }} - {{ getMetricName(anomaly.metric) }}异常
                      </div>
                      <div class="anomaly-details">
                        <span>当前值: {{ anomaly.value.toFixed(2) }}</span>
                        <span>期望值: {{ anomaly.expectedValue.toFixed(2) }}</span>
                        <span>异常分数: {{ (anomaly.anomalyScore * 100).toFixed(1) }}%</span>
                      </div>
                      <div class="anomaly-method">
                        检测方法: {{ anomaly.detectionMethod }}
                      </div>
                    </div>
                    <div class="anomaly-actions">
                      <el-button size="small" @click="viewAnomalyDetail(anomaly)">详情</el-button>
                      <el-button size="small" @click="suppressAnomaly(anomaly.id)">忽略</el-button>
                    </div>
                  </div>
                  
                  <div v-if="realtimeAnomalyStream.length === 0" class="empty-stream">
                    <el-empty description="暂无异常检测到">
                      <el-icon size="64" color="#ccc"><CircleCheck /></el-icon>
                    </el-empty>
                  </div>
                </div>
              </div>
              
              <!-- 停止状态提示 -->
              <div v-else class="detection-stopped">
                <el-empty description="异常检测已停止">
                  <el-button type="primary" @click="toggleDetection">启动检测</el-button>
                </el-empty>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="历史异常" name="history">
            <div class="history-anomalies">
              <!-- 筛选器 -->
              <div class="history-filters">
                <el-row :gutter="16">
                  <el-col :span="6">
                    <el-date-picker
                      v-model="historyFilter.dateRange"
                      type="datetimerange"
                      range-separator="-"
                      start-placeholder="开始时间"
                      end-placeholder="结束时间"
                      style="width: 100%"
                    />
                  </el-col>
                  <el-col :span="4">
                    <el-select v-model="historyFilter.severity" placeholder="严重程度" clearable>
                      <el-option label="全部" value="" />
                      <el-option label="严重" value="critical" />
                      <el-option label="高级" value="high" />
                      <el-option label="中级" value="medium" />
                      <el-option label="低级" value="low" />
                    </el-select>
                  </el-col>
                  <el-col :span="4">
                    <el-select v-model="historyFilter.port" placeholder="端口" clearable>
                      <el-option 
                        v-for="port in monitoredPorts" 
                        :key="port" 
                        :label="`端口 ${port}`" 
                        :value="port" 
                      />
                    </el-select>
                  </el-col>
                  <el-col :span="4">
                    <el-select v-model="historyFilter.method" placeholder="检测方法" clearable>
                      <el-option label="全部" value="" />
                      <el-option label="统计分析" value="Statistical Analysis" />
                      <el-option label="孤立森林" value="Isolation Forest" />
                      <el-option label="时间序列" value="Time Series Analysis" />
                    </el-select>
                  </el-col>
                  <el-col :span="6">
                    <el-button @click="loadHistoryAnomalies" :loading="loadingHistory">查询</el-button>
                    <el-button @click="exportAnomalies">导出</el-button>
                  </el-col>
                </el-row>
              </div>

              <!-- 异常列表 -->
              <el-table :data="filteredHistoryAnomalies" style="width: 100%; margin-top: 16px;">
                <el-table-column prop="timestamp" label="时间" width="160">
                  <template #default="{ row }">
                    {{ row.timestamp.toLocaleString() }}
                  </template>
                </el-table-column>
                <el-table-column prop="severity" label="严重程度" width="100">
                  <template #default="{ row }">
                    <el-tag :type="getSeverityType(row.severity)" size="small">
                      {{ getSeverityText(row.severity) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="port" label="端口" width="80" />
                <el-table-column prop="metric" label="指标" width="100">
                  <template #default="{ row }">
                    {{ getMetricName(row.metric) }}
                  </template>
                </el-table-column>
                <el-table-column prop="value" label="异常值" width="100">
                  <template #default="{ row }">
                    {{ row.value.toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="anomalyScore" label="异常分数" width="100">
                  <template #default="{ row }">
                    <el-progress 
                      :percentage="row.anomalyScore * 100" 
                      :stroke-width="6"
                      :color="getScoreColor(row.anomalyScore)"
                      :show-text="false"
                    />
                    <span class="score-text">{{ (row.anomalyScore * 100).toFixed(1) }}%</span>
                  </template>
                </el-table-column>
                <el-table-column prop="detectionMethod" label="检测方法" width="140" />
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button size="small" @click="viewAnomalyDetail(row)">详情</el-button>
                  </template>
                </el-table-column>
              </el-table>

              <!-- 分页 -->
              <div class="pagination-wrapper">
                <el-pagination
                  v-model:current-page="historyPagination.currentPage"
                  v-model:page-size="historyPagination.pageSize"
                  :page-sizes="[10, 20, 50, 100]"
                  :total="historyAnomalies.length"
                  layout="total, sizes, prev, pager, next, jumper"
                />
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="模式分析" name="patterns">
            <div class="pattern-analysis">
              <!-- 时间模式 -->
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-card shadow="never">
                    <template #header>
                      <span>时间分布模式</span>
                    </template>
                    <PerformanceChart
                      title="异常时间分布"
                      type="bar"
                      :data="temporalPatternData"
                      height="300px"
                      :show-controls="false"
                      :colors="['#F56C6C', '#E6A23C', '#409EFF']"
                    />
                  </el-card>
                </el-col>
                
                <el-col :span="12">
                  <el-card shadow="never">
                    <template #header>
                      <span>异常严重程度分布</span>
                    </template>
                    <PerformanceChart
                      title="严重程度分布"
                      type="pie"
                      :data="severityDistributionData"
                      height="300px"
                      :show-controls="false"
                      :colors="['#F56C6C', '#E6A23C', '#409EFF', '#67C23A']"
                    />
                  </el-card>
                </el-col>
              </el-row>

              <!-- 指标和端口模式 -->
              <el-row :gutter="16" style="margin-top: 16px;">
                <el-col :span="12">
                  <el-card shadow="never">
                    <template #header>
                      <span>指标异常频率</span>
                    </template>
                    <div class="metric-frequency">
                      <div v-for="(freq, metric) in metricFrequency" :key="metric" class="frequency-item">
                        <div class="metric-label">{{ getMetricName(metric) }}</div>
                        <div class="frequency-bar">
                          <el-progress 
                            :percentage="freq" 
                            :color="getMetricColor(metric)"
                            :stroke-width="20"
                          />
                        </div>
                        <div class="frequency-count">{{ getMetricCount(metric) }} 次</div>
                      </div>
                    </div>
                  </el-card>
                </el-col>
                
                <el-col :span="12">
                  <el-card shadow="never">
                    <template #header>
                      <span>端口风险评分</span>
                    </template>
                    <div class="port-risk-scores">
                      <div v-for="(score, port) in portRiskScores" :key="port" class="risk-item">
                        <div class="port-label">端口 {{ port }}</div>
                        <div class="risk-score">
                          <el-progress 
                            :percentage="score" 
                            :color="getRiskColor(score)"
                            :stroke-width="12"
                          />
                          <span class="score-value">{{ score }}/100</span>
                        </div>
                        <div class="risk-level">
                          <el-tag :type="getRiskType(score)" size="small">
                            {{ getRiskText(score) }}
                          </el-tag>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </el-col>
              </el-row>
            </div>
          </el-tab-pane>

          <el-tab-pane label="模型性能" name="performance">
            <div class="model-performance">
              <el-row :gutter="16">
                <el-col :span="8">
                  <el-card shadow="never">
                    <template #header>
                      <span>检测精度指标</span>
                    </template>
                    <div class="performance-metrics">
                      <div class="metric-item">
                        <div class="metric-label">检测精度</div>
                        <div class="metric-value">
                          <el-progress 
                            :percentage="detectionAccuracy * 100" 
                            color="#67C23A"
                            :stroke-width="8"
                          />
                          <span>{{ (detectionAccuracy * 100).toFixed(1) }}%</span>
                        </div>
                      </div>
                      <div class="metric-item">
                        <div class="metric-label">召回率</div>
                        <div class="metric-value">
                          <el-progress 
                            :percentage="recallRate * 100" 
                            color="#409EFF"
                            :stroke-width="8"
                          />
                          <span>{{ (recallRate * 100).toFixed(1) }}%</span>
                        </div>
                      </div>
                      <div class="metric-item">
                        <div class="metric-label">F1分数</div>
                        <div class="metric-value">
                          <el-progress 
                            :percentage="f1Score * 100" 
                            color="#E6A23C"
                            :stroke-width="8"
                          />
                          <span>{{ (f1Score * 100).toFixed(1) }}%</span>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </el-col>
                
                <el-col :span="8">
                  <el-card shadow="never">
                    <template #header>
                      <span>误报分析</span>
                    </template>
                    <div class="false-positive-analysis">
                      <div class="fp-summary">
                        <div class="fp-rate">
                          <span class="fp-label">误报率</span>
                          <span class="fp-value">{{ (falsePositiveRate * 100).toFixed(1) }}%</span>
                        </div>
                        <div class="fp-trend">
                          <el-tag :type="getFpTrendType(fpTrend)">
                            {{ getFpTrendText(fpTrend) }}
                          </el-tag>
                        </div>
                      </div>
                      <div class="fp-by-method">
                        <div v-for="(rate, method) in fpByMethod" :key="method" class="method-fp">
                          <span class="method-name">{{ method }}</span>
                          <el-progress 
                            :percentage="rate * 100" 
                            color="#F56C6C"
                            :stroke-width="6"
                            :show-text="false"
                          />
                          <span class="method-rate">{{ (rate * 100).toFixed(1) }}%</span>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </el-col>
                
                <el-col :span="8">
                  <el-card shadow="never">
                    <template #header>
                      <span>模型优化建议</span>
                    </template>
                    <div class="optimization-suggestions">
                      <div v-for="suggestion in modelOptimizations" :key="suggestion.id" class="suggestion-item">
                        <div class="suggestion-icon">
                          <el-icon><InfoFilled /></el-icon>
                        </div>
                        <div class="suggestion-content">
                          <div class="suggestion-title">{{ suggestion.title }}</div>
                          <div class="suggestion-desc">{{ suggestion.description }}</div>
                          <div class="suggestion-impact">
                            预期改善: {{ suggestion.expectedImprovement }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </el-col>
              </el-row>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-card>

    <!-- 异常详情弹窗 -->
    <el-dialog
      v-model="showDetailDialog"
      title="异常详情分析"
      width="800px"
      :before-close="handleDetailClose"
    >
      <div v-if="selectedAnomaly" class="anomaly-detail">
        <!-- 基本信息 -->
        <el-descriptions :column="2" border style="margin-bottom: 20px;">
          <el-descriptions-item label="检测时间">
            {{ selectedAnomaly.timestamp.toLocaleString() }}
          </el-descriptions-item>
          <el-descriptions-item label="端口">
            {{ selectedAnomaly.port }}
          </el-descriptions-item>
          <el-descriptions-item label="指标">
            {{ getMetricName(selectedAnomaly.metric) }}
          </el-descriptions-item>
          <el-descriptions-item label="严重程度">
            <el-tag :type="getSeverityType(selectedAnomaly.severity)">
              {{ getSeverityText(selectedAnomaly.severity) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="异常分数">
            {{ (selectedAnomaly.anomalyScore * 100).toFixed(1) }}%
          </el-descriptions-item>
          <el-descriptions-item label="置信度">
            {{ (selectedAnomaly.confidence * 100).toFixed(1) }}%
          </el-descriptions-item>
          <el-descriptions-item label="检测方法">
            {{ selectedAnomaly.detectionMethod }}
          </el-descriptions-item>
          <el-descriptions-item label="当前值">
            {{ selectedAnomaly.value.toFixed(2) }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 影响分析 -->
        <el-card shadow="never" style="margin-bottom: 20px;">
          <template #header>
            <span>影响分析</span>
          </template>
          <el-row :gutter="16">
            <el-col :span="12">
              <div class="impact-item">
                <label>业务影响:</label>
                <el-tag :type="getBusinessImpactType(selectedAnomaly.impact.businessImpact)">
                  {{ getBusinessImpactText(selectedAnomaly.impact.businessImpact) }}
                </el-tag>
              </div>
              <div class="impact-item">
                <label>预估持续:</label>
                <span>{{ selectedAnomaly.impact.estimatedDuration }} 分钟</span>
              </div>
            </el-col>
            <el-col :span="12">
              <div class="impact-item">
                <label>受影响指标:</label>
                <el-tag 
                  v-for="metric in selectedAnomaly.impact.affectedMetrics" 
                  :key="metric"
                  size="small"
                  style="margin-right: 4px;"
                >
                  {{ getMetricName(metric) }}
                </el-tag>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <!-- 根因假设 -->
        <el-card shadow="never" style="margin-bottom: 20px;">
          <template #header>
            <span>可能根因</span>
          </template>
          <ul class="root-cause-list">
            <li v-for="cause in selectedAnomaly.impact.rootCauseHypotheses" :key="cause">
              {{ cause }}
            </li>
          </ul>
        </el-card>

        <!-- 处理建议 -->
        <el-card shadow="never">
          <template #header>
            <span>处理建议</span>
          </template>
          <el-tabs>
            <el-tab-pane label="立即操作" name="immediate">
              <ul class="recommendation-list">
                <li v-for="rec in selectedAnomaly.recommendations.immediate" :key="rec">
                  {{ rec }}
                </li>
              </ul>
            </el-tab-pane>
            <el-tab-pane label="短期措施" name="shortTerm">
              <ul class="recommendation-list">
                <li v-for="rec in selectedAnomaly.recommendations.shortTerm" :key="rec">
                  {{ rec }}
                </li>
              </ul>
            </el-tab-pane>
            <el-tab-pane label="长期改进" name="longTerm">
              <ul class="recommendation-list">
                <li v-for="rec in selectedAnomaly.recommendations.longTerm" :key="rec">
                  {{ rec }}
                </li>
              </ul>
            </el-tab-pane>
            <el-tab-pane label="监控建议" name="monitoring">
              <ul class="recommendation-list">
                <li v-for="rec in selectedAnomaly.recommendations.monitoring" :key="rec">
                  {{ rec }}
                </li>
              </ul>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Warning, 
  VideoPause, 
  VideoPlay, 
  Document, 
  Cpu, 
  Monitor, 
  TrendCharts, 
  CircleCheck,
  InfoFilled
} from '@element-plus/icons-vue'
import PerformanceChart from '../charts/PerformanceChart.vue'
import { AnomalyDetectionService } from '@/services/AnomalyDetectionService'
import type { 
  AnomalyDetectionConfig, 
  AnomalyResult, 
  AnomalyDetectionReport 
} from '@/services/AnomalyDetectionService'
import type { PerformanceMetric } from '@/services/portPerformanceApi'

type ExtendedAnomalyConfig = AnomalyDetectionConfig & {
  realtime: boolean
  autoAlert: boolean
  learningMode: boolean
  detectionInterval: number
}

// 异常检测服务实例
const detectionService = new AnomalyDetectionService()

// 响应式数据
const detectionEnabled = ref(false)
const runTime = ref(0)
const generatingReport = ref(false)
const streamPaused = ref(false)
const loadingHistory = ref(false)
const showDetailDialog = ref(false)
const selectedAnomaly = ref<AnomalyResult | null>(null)

// 配置面板
const activeConfigPanels = ref(['config'])
const activeResultTab = ref('realtime')

// 异常检测配置
const config = reactive<ExtendedAnomalyConfig>({
  methods: {
    statistical: true,
    isolation: true,
    clustering: false,
    timeSeries: true
  },
  statistical: {
    zScoreThreshold: 2.5,
    iqrMultiplier: 1.5,
    windowSize: 50,
    minSamples: 20
  },
  ml: {
    isolationForest: {
      contamination: 0.1,
      maxFeatures: 4,
      nEstimators: 100
    },
    clustering: {
      eps: 0.5,
      minPoints: 5
    }
  },
  timeSeries: {
    seasonality: 24,
    trend: true,
    changePointDetection: true
  },
  correlation: {
    enabled: true,
    threshold: 0.7,
    lagWindow: 10
  },
  // 扩展配置
  realtime: true,
  autoAlert: true,
  learningMode: false,
  detectionInterval: 60
})

// 系统状态
const systemHealth = reactive({
  currentScore: 85,
  trend: 'stable' as 'improving' | 'stable' | 'degrading'
})

// 性能指标
const detectionAccuracy = ref(0.89)
const falsePositiveRate = ref(0.05)
const recallRate = ref(0.92)
const f1Score = ref(0.90)
const fpTrend = ref('improving' as 'improving' | 'stable' | 'degrading')

// 异常数据
const realTimeAnomalies = ref<AnomalyResult[]>([])
const realtimeAnomalyStream = ref<AnomalyResult[]>([])
const historyAnomalies = ref<AnomalyResult[]>([])
const todayAnomalies = ref<AnomalyResult[]>([])

// 监控的端口
const monitoredPorts = ref([3000, 8001, 8080, 9000])

// 历史查询筛选
const historyFilter = reactive({
  dateRange: null as [Date, Date] | null,
  severity: '',
  port: null as number | null,
  method: ''
})

// 分页
const historyPagination = reactive({
  currentPage: 1,
  pageSize: 20
})

// 模型优化建议
const modelOptimizations = ref([
  {
    id: '1',
    title: '调整统计阈值',
    description: '当前Z-Score阈值可能过于敏感',
    expectedImprovement: '减少15%误报'
  },
  {
    id: '2',
    title: '增加历史样本',
    description: '扩大历史数据窗口提高基线准确性',
    expectedImprovement: '提高5%检测精度'
  }
])

// 定时器
let detectionTimer: NodeJS.Timeout | null = null
let runtimeTimer: NodeJS.Timeout | null = null

// 计算属性
const criticalCount = computed(() => 
  todayAnomalies.value.filter(a => a.severity === 'critical').length
)

const highCount = computed(() => 
  todayAnomalies.value.filter(a => a.severity === 'high').length
)

const filteredHistoryAnomalies = computed(() => {
  let filtered = historyAnomalies.value

  if (historyFilter.dateRange) {
    const [start, end] = historyFilter.dateRange
    filtered = filtered.filter(a => 
      a.timestamp >= start && a.timestamp <= end
    )
  }

  if (historyFilter.severity) {
    filtered = filtered.filter(a => a.severity === historyFilter.severity)
  }

  if (historyFilter.port) {
    filtered = filtered.filter(a => a.port === historyFilter.port)
  }

  if (historyFilter.method) {
    filtered = filtered.filter(a => a.detectionMethod === historyFilter.method)
  }

  return filtered
})

// 模式分析数据
const temporalPatternData = computed(() => {
  // 生成时间分布数据
  return []
})

const severityDistributionData = computed(() => {
  // 生成严重程度分布数据
  return []
})

const metricFrequency = computed(() => {
  const frequency: Record<string, number> = {}
  const total = historyAnomalies.value.length

  if (total === 0) return frequency

  const counts = historyAnomalies.value.reduce((acc, anomaly) => {
    acc[anomaly.metric] = (acc[anomaly.metric] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  Object.keys(counts).forEach(metric => {
    frequency[metric] = (counts[metric] / total) * 100
  })

  return frequency
})

const portRiskScores = computed(() => {
  // 计算端口风险评分
  const scores: Record<number, number> = {}
  
  monitoredPorts.value.forEach(port => {
    const portAnomalies = historyAnomalies.value.filter(a => a.port === port)
    const riskScore = Math.min(portAnomalies.length * 5, 100)
    scores[port] = riskScore
  })

  return scores
})

const fpByMethod = computed(() => ({
  'Statistical Analysis': 0.03,
  'Isolation Forest': 0.07,
  'Time Series Analysis': 0.02
}))

// 方法
const toggleDetection = async () => {
  if (detectionEnabled.value) {
    await stopDetection()
  } else {
    await startDetection()
  }
}

const startDetection = async () => {
  try {
    detectionEnabled.value = true
    runTime.value = 0
    
    // 应用当前配置
    await applyConfig()
    
    // 开始实时检测
    startRealTimeDetection()
    
    // 开始运行时间计时
    runtimeTimer = setInterval(() => {
      runTime.value++
    }, 1000)
    
    ElMessage.success('异常检测已启动')
  } catch (error) {
    console.error('Failed to start detection:', error)
    ElMessage.error('启动异常检测失败')
    detectionEnabled.value = false
  }
}

const stopDetection = async () => {
  try {
    detectionEnabled.value = false
    
    if (detectionTimer) {
      clearInterval(detectionTimer)
      detectionTimer = null
    }
    
    if (runtimeTimer) {
      clearInterval(runtimeTimer)
      runtimeTimer = null
    }
    
    ElMessage.info('异常检测已停止')
  } catch (error) {
    console.error('Failed to stop detection:', error)
    ElMessage.error('停止异常检测失败')
  }
}

const startRealTimeDetection = () => {
  if (detectionTimer) {
    clearInterval(detectionTimer)
  }
  
  detectionTimer = setInterval(async () => {
    if (!detectionEnabled.value || streamPaused.value) return
    
    // 模拟生成新的异常检测数据
    const mockData = generateMockPerformanceData()
    const anomalies = await detectionService.detectAnomalies(mockData, monitoredPorts.value)
    
    if (anomalies.length > 0) {
      realTimeAnomalies.value.push(...anomalies)
      realtimeAnomalyStream.value.unshift(...anomalies)
      todayAnomalies.value.push(...anomalies)
      
      // 限制流中的异常数量
      if (realtimeAnomalyStream.value.length > 100) {
        realtimeAnomalyStream.value = realtimeAnomalyStream.value.slice(0, 100)
      }
      
      // 自动告警
      if (config.autoAlert) {
        for (const anomaly of anomalies) {
          if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
            showNotification(anomaly)
          }
        }
      }
    }
  }, config.detectionInterval * 1000)
}

const generateMockPerformanceData = (): PerformanceMetric[] => {
  const data: PerformanceMetric[] = []
  
  for (const port of monitoredPorts.value) {
    // 偶尔生成异常数据
    const hasAnomaly = Math.random() > 0.95 // 5%概率
    
    const baseResponseTime = 300
    const baseAvailability = 99.5
    const baseErrorRate = 0.5
    
    data.push({
      port,
      timestamp: new Date(),
      responseTime: hasAnomaly ? 
        baseResponseTime + Math.random() * 2000 : // 异常：高响应时间
        baseResponseTime + Math.random() * 200,   // 正常
      connectionTime: hasAnomaly ? 120 + Math.random() * 200 : 30 + Math.random() * 60,
      availability: hasAnomaly ? 
        Math.max(80, baseAvailability - Math.random() * 15) : // 异常：低可用性
        baseAvailability + Math.random() * 0.5,             // 正常
      errorRate: hasAnomaly ? 
        baseErrorRate + Math.random() * 10 : // 异常：高错误率
        baseErrorRate + Math.random() * 1,   // 正常
      throughput: 50 + Math.random() * 100,
      networkLatency: hasAnomaly ? 50 + Math.random() * 150 : 10 + Math.random() * 30,
      successfulConnections: Math.floor(400 + Math.random() * 800),
      failedConnections: Math.floor(hasAnomaly ? 20 + Math.random() * 80 : Math.random() * 10),
      totalRequests: Math.floor(600 + Math.random() * 1200)
    })
  }
  
  return data
}

const showNotification = (anomaly: AnomalyResult) => {
  // 浏览器通知
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`异常检测告警`, {
      body: `端口${anomaly.port}的${getMetricName(anomaly.metric)}出现${getSeverityText(anomaly.severity)}异常`,
      icon: '/favicon.ico'
    })
  }
  
  // Element Plus 通知
  ElMessage({
    type: getSeverityType(anomaly.severity) as any,
    message: `端口${anomaly.port}检测到${getSeverityText(anomaly.severity)}异常`,
    duration: 5000
  })
}

const generateReport = async () => {
  generatingReport.value = true
  
  try {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000) // 24小时前
    
    const report = await detectionService.generateReport(
      startTime, 
      endTime, 
      monitoredPorts.value
    )
    
    // 下载报告
    const dataStr = JSON.stringify(report, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = `anomaly-detection-report-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    ElMessage.success('异常检测报告已生成并下载')
  } catch (error) {
    console.error('Failed to generate report:', error)
    ElMessage.error('生成报告失败')
  } finally {
    generatingReport.value = false
  }
}

const resetConfig = () => {
  // 重置配置到默认值
  Object.assign(config, {
    methods: {
      statistical: true,
      isolation: true,
      clustering: false,
      timeSeries: true
    },
    statistical: {
      zScoreThreshold: 2.5,
      iqrMultiplier: 1.5,
      windowSize: 50,
      minSamples: 20
    }
  })
  ElMessage.success('配置已重置为默认值')
}

const saveConfig = () => {
  // 保存配置到本地存储
  localStorage.setItem('anomalyDetectionConfig', JSON.stringify(config))
  ElMessage.success('配置已保存')
}

const applyConfig = async () => {
  // 应用配置到检测服务
  try {
    // 这里应该将配置传递给检测服务
    ElMessage.success('配置已应用')
  } catch (error) {
    console.error('Failed to apply config:', error)
    ElMessage.error('应用配置失败')
  }
}

const viewAnomalyDetail = (anomaly: AnomalyResult) => {
  selectedAnomaly.value = anomaly
  showDetailDialog.value = true
}

const handleDetailClose = () => {
  showDetailDialog.value = false
  selectedAnomaly.value = null
}

const isNewAnomaly = (anomaly: AnomalyResult) => {
  const now = new Date().getTime()
  const anomalyTime = anomaly.timestamp.getTime()
  return now - anomalyTime < 30000 // 30秒内算新异常
}

// 工具方法
const formatRunTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

const getMetricName = (metric: string) => {
  const names: Record<string, string> = {
    responseTime: '响应时间',
    availability: '可用性',
    errorRate: '错误率',
    throughput: '吞吐量'
  }
  return names[metric] || metric
}

const getSeverityType = (severity: string) => {
  const types: Record<string, string> = {
    critical: 'danger',
    high: 'danger',
    medium: 'warning',
    low: 'info'
  }
  return types[severity] || 'info'
}

const getSeverityText = (severity: string) => {
  const texts: Record<string, string> = {
    critical: '严重',
    high: '高级',
    medium: '中级',
    low: '低级'
  }
  return texts[severity] || severity
}

const getTrendType = (trend: string) => {
  const types: Record<string, string> = {
    improving: 'success',
    stable: 'info',
    degrading: 'warning'
  }
  return types[trend] || 'info'
}

const getTrendText = (trend: string) => {
  const texts: Record<string, string> = {
    improving: '改善',
    stable: '稳定',
    degrading: '下降'
  }
  return texts[trend] || trend
}

// 更多工具方法...（省略部分工具方法以节省空间）

// 生命周期
onMounted(async () => {
  // 加载保存的配置
  const savedConfig = localStorage.getItem('anomalyDetectionConfig')
  if (savedConfig) {
    Object.assign(config, JSON.parse(savedConfig))
  }
  
  // 请求通知权限
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
  
  // 加载历史数据
  await loadHistoryAnomalies()
  
  // 生成一些今日异常数据用于演示
  generateTodayAnomaliesDemo()
})

onUnmounted(() => {
  if (detectionTimer) {
    clearInterval(detectionTimer)
  }
  if (runtimeTimer) {
    clearInterval(runtimeTimer)
  }
})

// 演示数据生成
const generateTodayAnomaliesDemo = () => {
  const demoAnomalies: AnomalyResult[] = []
  const now = new Date()
  
  for (let i = 0; i < 15; i++) {
    const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000)
    const port = monitoredPorts.value[Math.floor(Math.random() * monitoredPorts.value.length)]
    const metrics = ['responseTime', 'availability', 'errorRate']
    const metric = metrics[Math.floor(Math.random() * metrics.length)]
    const severities = ['critical', 'high', 'medium', 'low']
    const severity = severities[Math.floor(Math.random() * severities.length)] as any
    
    demoAnomalies.push({
      id: `demo-${i}`,
      timestamp,
      port,
      metric,
      value: Math.random() * 1000,
      expectedValue: Math.random() * 500,
      anomalyScore: Math.random(),
      severity,
      confidence: 0.8 + Math.random() * 0.2,
      detectionMethod: ['Statistical Analysis', 'Isolation Forest', 'Time Series Analysis'][Math.floor(Math.random() * 3)],
      methodDetails: {},
      context: {
        recentTrend: 'stable',
        historicalComparison: 'unusual',
        correlatedMetrics: []
      },
      impact: {
        estimatedDuration: Math.floor(Math.random() * 60),
        affectedMetrics: [metric],
        businessImpact: severity,
        rootCauseHypotheses: ['网络延迟', '服务器负载过高', '数据库查询慢']
      },
      recommendations: {
        immediate: ['检查服务状态', '查看系统日志'],
        shortTerm: ['优化查询', '增加监控'],
        longTerm: ['容量规划', '架构优化'],
        monitoring: ['设置告警', '增强监控']
      }
    })
  }
  
  todayAnomalies.value = demoAnomalies
  historyAnomalies.value = demoAnomalies
}

// 省略其他方法的实现...
const showRealTimeAnomalies = () => {}
const clearStream = () => {}
const suppressAnomaly = (_anomalyId: string) => {}
const loadHistoryAnomalies = async () => {}
const exportAnomalies = () => {}
const getScoreColor = (_score: number) => '#409EFF'
const getMetricColor = (_metric: string) => '#409EFF'
const getMetricCount = (_metric: string) => 0
const getRiskColor = (_score: number) => '#409EFF'
const getRiskType = (_score: number) => 'info'
const getRiskText = (_score: number) => '低'
const getFpTrendType = (_trend: string) => 'success'
const getFpTrendText = (_trend: string) => '改善'
const getBusinessImpactType = (_impact: string) => 'info'
const getBusinessImpactText = (_impact: string) => '低'

defineExpose({
  // 可以暴露一些方法供父组件调用
  startDetection,
  stopDetection,
  generateReport
})
</script>

<style scoped>
.anomaly-detection-panel {
  padding: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 状态概览 */
.status-overview {
  margin-bottom: 20px;
}

.status-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.status-icon {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  color: white;
}

.status-icon.detection {
  background: #909399;
}

.status-icon.detection.active {
  background: #67c23a;
  animation: pulse 2s infinite;
}

.status-icon.health {
  background: #409eff;
}

.status-icon.anomalies {
  background: #e6a23c;
}

.status-icon.accuracy {
  background: #67c23a;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.8; }
  100% { transform: scale(1); opacity: 1; }
}

.status-info {
  flex: 1;
}

.status-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.status-value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.status-value.active {
  color: #67c23a;
}

.status-value.anomaly-count {
  color: #e6a23c;
}

.status-meta {
  font-size: 12px;
  color: #999;
}

.status-meta .critical {
  color: #f56c6c;
  font-weight: 600;
}

.status-meta .high {
  color: #e6a23c;
  font-weight: 600;
}

/* 配置面板 */
.config-panel {
  padding: 16px 0;
}

.method-desc {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.config-help {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.config-actions {
  text-align: center;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
  margin-top: 20px;
}

/* 异常流 */
.anomaly-stream {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
}

.stream-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e4e7ed;
  background: #f8f9fa;
  font-weight: 600;
}

.stream-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.stream-content {
  max-height: 500px;
  overflow-y: auto;
}

.anomaly-item {
  display: flex;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  transition: all 0.3s;
}

.anomaly-item:hover {
  background: #f8f9fa;
}

.anomaly-item.new {
  background: linear-gradient(90deg, #e6f7ff 0%, #fff 100%);
  border-left: 4px solid #409eff;
}

.anomaly-item.severity-critical {
  border-left: 4px solid #f56c6c;
}

.anomaly-item.severity-high {
  border-left: 4px solid #e6a23c;
}

.anomaly-item.severity-medium {
  border-left: 4px solid #409eff;
}

.anomaly-item.severity-low {
  border-left: 4px solid #67c23a;
}

.anomaly-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.anomaly-time {
  font-size: 12px;
  color: #999;
}

.anomaly-content {
  flex: 1;
}

.anomaly-title {
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.anomaly-details {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.anomaly-method {
  font-size: 12px;
  color: #999;
}

.anomaly-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.empty-stream {
  padding: 60px 20px;
  text-align: center;
}

.detection-stopped {
  padding: 60px 20px;
  text-align: center;
}

/* 历史查询 */
.history-filters {
  margin-bottom: 20px;
}

.pagination-wrapper {
  margin-top: 20px;
  text-align: center;
}

/* 模式分析 */
.frequency-item {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.metric-label {
  width: 80px;
  font-size: 14px;
  color: #333;
}

.frequency-bar {
  flex: 1;
}

.frequency-count {
  width: 60px;
  text-align: right;
  font-size: 12px;
  color: #666;
}

.risk-item {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.port-label {
  width: 80px;
  font-size: 14px;
  color: #333;
}

.risk-score {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.score-value {
  font-size: 12px;
  color: #666;
}

.risk-level {
  width: 60px;
}

/* 模型性能 */
.performance-metrics {
  padding: 16px 0;
}

.metric-item {
  margin-bottom: 20px;
}

.metric-label {
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
}

.metric-value {
  display: flex;
  align-items: center;
  gap: 12px;
}

.metric-value span {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

/* 异常详情 */
.anomaly-detail {
  padding: 16px 0;
}

.impact-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.impact-item label {
  font-weight: 600;
  color: #333;
  min-width: 80px;
}

.root-cause-list {
  margin: 0;
  padding-left: 20px;
}

.root-cause-list li {
  margin-bottom: 8px;
  line-height: 1.5;
  color: #666;
}

.recommendation-list {
  margin: 0;
  padding-left: 20px;
}

.recommendation-list li {
  margin-bottom: 8px;
  line-height: 1.5;
  color: #666;
}

/* 响应式优化 */
@media (max-width: 768px) {
  .panel-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  
  .status-card {
    flex-direction: column;
    text-align: center;
    padding: 16px;
  }
  
  .status-icon {
    margin-right: 0;
    margin-bottom: 12px;
  }
  
  .anomaly-item {
    flex-direction: column;
    gap: 12px;
  }
  
  .anomaly-details {
    flex-direction: column;
    gap: 4px;
  }
  
  .anomaly-actions {
    flex-direction: row;
  }
}
</style>









