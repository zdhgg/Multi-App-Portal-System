<template>
  <div class="smart-report-panel">
    <el-card>
      <template #header>
        <div class="panel-header">
          <h3>智能报表生成系统</h3>
          <div class="header-actions">
            <el-button 
              type="primary" 
              :icon="Plus"
              @click="showTemplateDialog"
              size="small"
            >
              新建模板
            </el-button>
            <el-button 
              type="success" 
              :icon="Document"
              @click="showGenerateDialog"
              size="small"
            >
              生成报表
            </el-button>
            <el-button 
              type="info" 
              :icon="Clock"
              @click="showScheduleDialog"
              size="small"
            >
              定时任务
            </el-button>
          </div>
        </div>
      </template>

      <!-- 报表概览统计 -->
      <div class="report-overview">
        <el-row :gutter="16">
          <el-col :span="6">
            <div class="stat-card">
              <div class="stat-icon templates">
                <el-icon size="24"><Folder /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">报表模板</div>
                <div class="stat-value">{{ templates.length }}</div>
                <div class="stat-meta">{{ publicTemplates.length }} 个公共模板</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card reports">
              <div class="stat-icon">
                <el-icon size="24"><Document /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">生成报表</div>
                <div class="stat-value">{{ generatedReports.length }}</div>
                <div class="stat-meta">本月 {{ monthlyReports.length }} 个</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card schedules">
              <div class="stat-icon">
                <el-icon size="24"><Clock /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">定时任务</div>
                <div class="stat-value">{{ schedules.length }}</div>
                <div class="stat-meta">{{ activeSchedules.length }} 个活跃</div>
              </div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat-card downloads">
              <div class="stat-icon">
                <el-icon size="24"><Download /></el-icon>
              </div>
              <div class="stat-info">
                <div class="stat-title">总下载量</div>
                <div class="stat-value">{{ totalDownloads }}</div>
                <div class="stat-meta">今日 {{ todayDownloads }} 次</div>
              </div>
            </div>
          </el-col>
        </el-row>
      </div>

      <!-- 主要功能区域 -->
      <el-tabs v-model="activeTab" class="report-tabs">
        <!-- 模板管理 -->
        <el-tab-pane label="报表模板" name="templates">
          <div class="templates-section">
            <!-- 模板筛选 -->
            <div class="template-filters">
              <el-row :gutter="16">
                <el-col :span="6">
                  <el-select v-model="templateFilter.category" placeholder="分类" clearable>
                    <el-option label="全部" value="" />
                    <el-option label="性能报表" value="performance" />
                    <el-option label="安全报表" value="security" />
                    <el-option label="异常报表" value="anomaly" />
                    <el-option label="综合报表" value="comprehensive" />
                  </el-select>
                </el-col>
                <el-col :span="6">
                  <el-select v-model="templateFilter.scope" placeholder="范围" clearable>
                    <el-option label="全部" value="" />
                    <el-option label="我的模板" value="private" />
                    <el-option label="公共模板" value="public" />
                  </el-select>
                </el-col>
                <el-col :span="6">
                  <el-input 
                    v-model="templateFilter.search" 
                    placeholder="搜索模板" 
                    :prefix-icon="Search"
                    clearable
                  />
                </el-col>
                <el-col :span="6">
                  <el-button @click="loadTemplates">查询</el-button>
                </el-col>
              </el-row>
            </div>

            <!-- 模板网格 -->
            <div class="template-grid">
              <div 
                v-for="template in filteredTemplates" 
                :key="template.id"
                class="template-card"
                @click="selectTemplate(template)"
                :class="{ selected: selectedTemplate?.id === template.id }"
              >
                <div class="template-header">
                  <div class="template-category">
                    <el-tag :type="getCategoryType(template.category)" size="small">
                      {{ getCategoryText(template.category) }}
                    </el-tag>
                  </div>
                  <div class="template-actions">
                    <el-dropdown trigger="click">
                      <el-button type="text" :icon="MoreFilled" size="small" />
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="editTemplate(template)">编辑</el-dropdown-item>
                          <el-dropdown-item @click="cloneTemplate(template)">克隆</el-dropdown-item>
                          <el-dropdown-item @click="generateFromTemplate(template)">生成报表</el-dropdown-item>
                          <el-dropdown-item 
                            @click="deleteTemplate(template)" 
                            divided
                            class="danger"
                          >
                            删除
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>
                </div>
                
                <div class="template-content">
                  <h4>{{ template.name }}</h4>
                  <p>{{ template.description }}</p>
                  
                  <div class="template-meta">
                    <div class="template-info">
                      <el-icon><User /></el-icon>
                      <span>{{ template.metadata.createdBy }}</span>
                    </div>
                    <div class="template-info">
                      <el-icon><Calendar /></el-icon>
                      <span>{{ formatDate(template.metadata.createdAt) }}</span>
                    </div>
                    <div class="template-info">
                      <el-icon><View /></el-icon>
                      <span>v{{ template.version }}</span>
                    </div>
                  </div>
                  
                  <div class="template-tags">
                    <el-tag 
                      v-for="tag in template.metadata.tags" 
                      :key="tag"
                      size="small"
                      effect="plain"
                    >
                      {{ tag }}
                    </el-tag>
                  </div>
                </div>
                
                <div class="template-footer">
                  <div class="template-stats">
                    <span>{{ template.structure.sections.length }} 章节</span>
                    <span>{{ getComponentCount(template) }} 组件</span>
                  </div>
                  <div class="template-privacy">
                    <el-icon v-if="template.metadata.isPublic"><Unlock /></el-icon>
                    <el-icon v-else><Lock /></el-icon>
                  </div>
                </div>
              </div>
              
              <!-- 新建模板卡片 -->
              <div class="template-card new-template" @click="showTemplateDialog">
                <div class="new-template-content">
                  <el-icon size="48"><Plus /></el-icon>
                  <h4>新建模板</h4>
                  <p>创建自定义报表模板</p>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 生成的报表 -->
        <el-tab-pane label="生成报表" name="reports">
          <div class="reports-section">
            <!-- 报表筛选 -->
            <div class="report-filters">
              <el-row :gutter="16">
                <el-col :span="6">
                  <el-date-picker
                    v-model="reportFilter.dateRange"
                    type="datetimerange"
                    range-separator="-"
                    start-placeholder="开始时间"
                    end-placeholder="结束时间"
                    style="width: 100%"
                  />
                </el-col>
                <el-col :span="4">
                  <el-select v-model="reportFilter.template" placeholder="模板" clearable>
                    <el-option 
                      v-for="template in templates" 
                      :key="template.id"
                      :label="template.name" 
                      :value="template.id" 
                    />
                  </el-select>
                </el-col>
                <el-col :span="4">
                  <el-select v-model="reportFilter.creator" placeholder="创建者" clearable>
                    <el-option label="全部" value="" />
                    <el-option label="我的" value="mine" />
                  </el-select>
                </el-col>
                <el-col :span="6">
                  <el-input 
                    v-model="reportFilter.search" 
                    placeholder="搜索报表" 
                    :prefix-icon="Search"
                    clearable
                  />
                </el-col>
                <el-col :span="4">
                  <el-button @click="loadReports" :loading="loadingReports">查询</el-button>
                </el-col>
              </el-row>
            </div>

            <!-- 报表列表 -->
            <el-table :data="filteredReports" style="width: 100%; margin-top: 16px;">
              <el-table-column prop="title" label="报表标题" min-width="200" />
              <el-table-column prop="templateName" label="模板" width="150" />
              <el-table-column prop="generatedBy" label="创建者" width="100" />
              <el-table-column prop="generatedAt" label="生成时间" width="160">
                <template #default="{ row }">
                  {{ formatDateTime(row.generatedAt) }}
                </template>
              </el-table-column>
              <el-table-column prop="dataRange" label="数据范围" width="120">
                <template #default="{ row }">
                  <el-tooltip :content="`${formatDate(row.dataRange.start)} 至 ${formatDate(row.dataRange.end)}`">
                    <span>{{ getDurationText(row.dataRange) }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="statistics" label="统计" width="120">
                <template #default="{ row }">
                  <div class="report-stats">
                    <div>{{ row.statistics.chartCount }}图</div>
                    <div>{{ row.statistics.kpiCount }}KPI</div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="sharing" label="下载" width="80">
                <template #default="{ row }">
                  <span class="download-count">{{ row.sharing.downloadCount }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                  <el-button-group size="small">
                    <el-button @click="viewReport(row)">查看</el-button>
                    <el-dropdown trigger="click">
                      <el-button :icon="Download">导出</el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <el-dropdown-item @click="exportReport(row, 'json')">JSON</el-dropdown-item>
                          <el-dropdown-item @click="exportReport(row, 'csv')">CSV</el-dropdown-item>
                          <el-dropdown-item @click="exportReport(row, 'excel')">Excel</el-dropdown-item>
                          <el-dropdown-item @click="exportReport(row, 'pdf')">PDF</el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    <el-button @click="shareReport(row)" :icon="Share">分享</el-button>
                    <el-button @click="deleteReport(row)" type="danger" :icon="Delete">删除</el-button>
                  </el-button-group>
                </template>
              </el-table-column>
            </el-table>

            <!-- 分页 -->
            <div class="pagination-wrapper">
              <el-pagination
                v-model:current-page="reportPagination.currentPage"
                v-model:page-size="reportPagination.pageSize"
                :page-sizes="[10, 20, 50, 100]"
                :total="generatedReports.length"
                layout="total, sizes, prev, pager, next, jumper"
              />
            </div>
          </div>
        </el-tab-pane>

        <!-- 定时任务 -->
        <el-tab-pane label="定时任务" name="schedules">
          <div class="schedules-section">
            <div class="schedules-header">
              <h4>报表定时生成任务</h4>
              <el-button type="primary" @click="showScheduleDialog" size="small">
                <el-icon><Plus /></el-icon>
                新建任务
              </el-button>
            </div>

            <el-table :data="schedules" style="width: 100%; margin-top: 16px;">
              <el-table-column prop="name" label="任务名称" min-width="200" />
              <el-table-column prop="templateName" label="报表模板" width="150">
                <template #default="{ row }">
                  {{ getTemplateName(row.templateId) }}
                </template>
              </el-table-column>
              <el-table-column prop="schedule.frequency" label="频率" width="100">
                <template #default="{ row }">
                  {{ getFrequencyText(row.schedule.frequency) }}
                </template>
              </el-table-column>
              <el-table-column prop="schedule.time" label="执行时间" width="100" />
              <el-table-column prop="metadata.lastRun" label="上次执行" width="160">
                <template #default="{ row }">
                  {{ row.metadata.lastRun ? formatDateTime(row.metadata.lastRun) : '未执行' }}
                </template>
              </el-table-column>
              <el-table-column prop="metadata.nextRun" label="下次执行" width="160">
                <template #default="{ row }">
                  {{ row.metadata.nextRun ? formatDateTime(row.metadata.nextRun) : '未计划' }}
                </template>
              </el-table-column>
              <el-table-column prop="metadata.status" label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="getStatusType(row.metadata.status)" size="small">
                    {{ getStatusText(row.metadata.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="180" fixed="right">
                <template #default="{ row }">
                  <el-button 
                    size="small" 
                    :type="row.metadata.status === 'active' ? 'warning' : 'success'"
                    @click="toggleSchedule(row)"
                  >
                    {{ row.metadata.status === 'active' ? '暂停' : '启用' }}
                  </el-button>
                  <el-button size="small" @click="editSchedule(row)">编辑</el-button>
                  <el-button size="small" type="danger" @click="deleteSchedule(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 模板市场 -->
        <el-tab-pane label="模板市场" name="marketplace">
          <div class="marketplace-section">
            <div class="marketplace-banner">
              <h3>发现更多报表模板</h3>
              <p>浏览社区分享的专业报表模板，快速构建您的报告系统</p>
            </div>

            <div class="marketplace-categories">
              <el-button-group>
                <el-button 
                  v-for="category in marketCategories"
                  :key="category.key"
                  :type="marketFilter === category.key ? 'primary' : 'default'"
                  @click="marketFilter = category.key"
                >
                  {{ category.label }}
                </el-button>
              </el-button-group>
            </div>

            <div class="marketplace-templates">
              <div 
                v-for="template in marketplaceTemplates"
                :key="template.id"
                class="marketplace-card"
              >
                <div class="market-card-image">
                  <img :src="template.preview" :alt="template.name" />
                </div>
                <div class="market-card-content">
                  <h4>{{ template.name }}</h4>
                  <p>{{ template.description }}</p>
                  <div class="market-card-meta">
                    <div class="template-rating">
                      <el-rate :model-value="template.rating" disabled size="small" />
                      <span>({{ template.downloads }})</span>
                    </div>
                    <div class="template-price">
                      {{ template.price === 0 ? '免费' : `¥${template.price}` }}
                    </div>
                  </div>
                </div>
                <div class="market-card-actions">
                  <el-button size="small" @click="previewTemplate(template)">预览</el-button>
                  <el-button 
                    type="primary" 
                    size="small" 
                    @click="installTemplate(template)"
                    :loading="installingTemplates.includes(template.id)"
                  >
                    {{ template.price === 0 ? '安装' : '购买' }}
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 模板编辑弹窗 -->
    <el-dialog
      v-model="showTemplateEditor"
      title="编辑报表模板"
      width="80%"
      :before-close="handleTemplateEditorClose"
    >
      <div class="template-editor">
        <el-form :model="editingTemplate" label-width="120px">
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="模板名称">
                <el-input v-model="editingTemplate.name" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="模板分类">
                <el-select v-model="editingTemplate.category" style="width: 100%">
                  <el-option label="性能报表" value="performance" />
                  <el-option label="安全报表" value="security" />
                  <el-option label="异常报表" value="anomaly" />
                  <el-option label="综合报表" value="comprehensive" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-form-item label="模板描述">
            <el-input 
              type="textarea" 
              v-model="editingTemplate.description"
              :rows="3"
            />
          </el-form-item>
          
          <el-form-item label="数据配置">
            <el-card shadow="never">
              <el-row :gutter="16">
                <el-col :span="8">
                  <el-form-item label="时间范围">
                    <el-select v-model="editingTemplate.dataConfig.timeRange.value" style="width: 100%">
                      <el-option label="最近1小时" value="1h" />
                      <el-option label="最近24小时" value="24h" />
                      <el-option label="最近7天" value="7d" />
                      <el-option label="最近30天" value="30d" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="监控端口">
                    <el-select 
                      v-model="editingTemplate.dataConfig.ports" 
                      multiple 
                      style="width: 100%"
                    >
                      <el-option :value="3000" label="3000" />
                      <el-option :value="8001" label="8001" />
                      <el-option :value="8080" label="8080" />
                    </el-select>
                  </el-form-item>
                </el-col>
                <el-col :span="8">
                  <el-form-item label="聚合粒度">
                    <el-select v-model="editingTemplate.dataConfig.aggregation" style="width: 100%">
                      <el-option label="小时" value="hourly" />
                      <el-option label="天" value="daily" />
                      <el-option label="周" value="weekly" />
                    </el-select>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-card>
          </el-form-item>
          
          <el-form-item label="智能分析">
            <el-checkbox-group v-model="editingTemplate.intelligence.insightTypes">
              <el-checkbox label="trend">趋势分析</el-checkbox>
              <el-checkbox label="anomaly">异常检测</el-checkbox>
              <el-checkbox label="pattern">模式识别</el-checkbox>
              <el-checkbox label="prediction">预测分析</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <el-button @click="showTemplateEditor = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate" :loading="savingTemplate">
          保存模板
        </el-button>
      </template>
    </el-dialog>

    <!-- 报表生成弹窗 -->
    <el-dialog
      v-model="showReportGenerator"
      title="生成报表"
      width="60%"
    >
      <div class="report-generator">
        <el-steps :active="generateStep" finish-status="success">
          <el-step title="选择模板" />
          <el-step title="配置参数" />
          <el-step title="生成报表" />
        </el-steps>
        
        <div class="generator-content">
          <!-- 步骤1: 选择模板 -->
          <div v-if="generateStep === 0" class="step-content">
            <h4>选择报表模板</h4>
            <div class="template-selector">
              <div 
                v-for="template in templates"
                :key="template.id"
                class="template-option"
                :class="{ selected: generateConfig.templateId === template.id }"
                @click="generateConfig.templateId = template.id"
              >
                <div class="option-header">
                  <el-radio :label="template.id" v-model="generateConfig.templateId">
                    {{ template.name }}
                  </el-radio>
                </div>
                <div class="option-desc">{{ template.description }}</div>
              </div>
            </div>
          </div>
          
          <!-- 步骤2: 配置参数 -->
          <div v-if="generateStep === 1" class="step-content">
            <h4>配置报表参数</h4>
            <el-form :model="generateConfig" label-width="120px">
              <el-form-item label="报表标题">
                <el-input v-model="generateConfig.title" />
              </el-form-item>
              <el-form-item label="时间范围">
                <el-date-picker
                  v-model="generateConfig.dateRange"
                  type="datetimerange"
                  range-separator="-"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item label="监控端口">
                <el-select v-model="generateConfig.ports" multiple style="width: 100%">
                  <el-option :value="3000" label="端口 3000" />
                  <el-option :value="8001" label="端口 8001" />
                  <el-option :value="8080" label="端口 8080" />
                </el-select>
              </el-form-item>
              <el-form-item label="包含内容">
                <el-checkbox-group v-model="generateConfig.includes">
                  <el-checkbox label="summary">执行摘要</el-checkbox>
                  <el-checkbox label="charts">性能图表</el-checkbox>
                  <el-checkbox label="tables">数据表格</el-checkbox>
                  <el-checkbox label="insights">智能洞察</el-checkbox>
                  <el-checkbox label="recommendations">改进建议</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
            </el-form>
          </div>
          
          <!-- 步骤3: 生成中 -->
          <div v-if="generateStep === 2" class="step-content">
            <div class="generating-status">
              <el-progress 
                :percentage="generateProgress" 
                :status="generateStatus"
                :stroke-width="8"
              />
              <div class="progress-text">{{ generateProgressText }}</div>
              
              <div v-if="generateStep === 2 && generateProgress === 100" class="generation-complete">
                <el-result icon="success" title="报表生成完成" :sub-title="generatedReport?.title">
                  <template #extra>
                    <el-button type="primary" @click="viewGeneratedReport">查看报表</el-button>
                    <el-button @click="downloadGeneratedReport">下载报表</el-button>
                  </template>
                </el-result>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <template #footer>
        <el-button 
          v-if="generateStep > 0 && generateStep < 2" 
          @click="generateStep--"
        >
          上一步
        </el-button>
        <el-button @click="showReportGenerator = false">
          {{ generateStep === 2 ? '关闭' : '取消' }}
        </el-button>
        <el-button 
          v-if="generateStep < 2"
          type="primary" 
          @click="nextGenerateStep"
          :disabled="!canProceedGenerate"
        >
          {{ generateStep === 1 ? '生成报表' : '下一步' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 其他弹窗... -->
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  Plus, 
  Document, 
  Clock, 
  Folder,
  Download,
  Search,
  MoreFilled,
  User,
  Calendar,
  View,
  Lock,
  Unlock,
  Share,
  Delete
} from '@element-plus/icons-vue'
import { ReportGenerationService } from '@/services/ReportGenerationService'
import type { 
  ReportTemplate, 
  GeneratedReport, 
  ReportSchedule 
} from '@/services/ReportGenerationService'

// 服务实例
const reportService = new ReportGenerationService()

// 响应式数据
const activeTab = ref('templates')
const showTemplateEditor = ref(false)
const showReportGenerator = ref(false)
const showScheduleDialog = ref(false)
const savingTemplate = ref(false)
const loadingReports = ref(false)

// 数据状态
const templates = ref<ReportTemplate[]>([])
const generatedReports = ref<GeneratedReport[]>([])
const schedules = ref<ReportSchedule[]>([])
const selectedTemplate = ref<ReportTemplate | null>(null)
const editingTemplate = ref<any>({
  name: '',
  description: '',
  category: 'performance',
  dataConfig: {
    timeRange: { type: 'relative', value: '7d' },
    ports: [],
    metrics: [],
    filters: {},
    aggregation: 'hourly'
  },
  intelligence: {
    enableInsights: true,
    enableRecommendations: true,
    enablePredictions: false,
    enableComparisons: true,
    insightTypes: []
  }
})

// 筛选器
const templateFilter = reactive({
  category: '',
  scope: '',
  search: ''
})

const reportFilter = reactive({
  dateRange: null as [Date, Date] | null,
  template: '',
  creator: '',
  search: ''
})

// 分页
const reportPagination = reactive({
  currentPage: 1,
  pageSize: 20
})

// 报表生成配置
const generateStep = ref(0)
const generateProgress = ref(0)
const generateStatus = ref<'success' | 'warning' | 'exception'>('success')
const generateProgressText = ref('')
const generatedReport = ref<GeneratedReport | null>(null)

const generateConfig = reactive({
  templateId: '',
  title: '',
  dateRange: null as [Date, Date] | null,
  ports: [] as number[],
  includes: ['summary', 'charts', 'insights'] as string[]
})

// 市场相关
const marketFilter = ref('all')
const marketCategories = [
  { key: 'all', label: '全部' },
  { key: 'popular', label: '热门' },
  { key: 'new', label: '最新' },
  { key: 'free', label: '免费' }
]

const marketplaceTemplates = ref([
  {
    id: 'market-1',
    name: '企业级性能报告',
    description: '专业的企业级性能监控报告模板',
    preview: '/api/placeholder/300/200',
    rating: 4.8,
    downloads: 1234,
    price: 0,
    category: 'performance'
  },
  {
    id: 'market-2',
    name: '安全态势分析报告',
    description: '全面的系统安全态势分析模板',
    preview: '/api/placeholder/300/200',
    rating: 4.6,
    downloads: 856,
    price: 29.9,
    category: 'security'
  }
])

const installingTemplates = ref<string[]>([])

// 计算属性
const publicTemplates = computed(() => 
  templates.value.filter(t => t.metadata.isPublic)
)

const monthlyReports = computed(() => {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  return generatedReports.value.filter(r => r.generatedAt >= monthStart)
})

const activeSchedules = computed(() => 
  schedules.value.filter(s => s.metadata.status === 'active')
)

const totalDownloads = computed(() => 
  generatedReports.value.reduce((sum, r) => sum + r.sharing.downloadCount, 0)
)

const todayDownloads = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return generatedReports.value
    .filter(r => r.generatedAt >= today)
    .reduce((sum, r) => sum + r.sharing.downloadCount, 0)
})

const filteredTemplates = computed(() => {
  let filtered = templates.value
  
  if (templateFilter.category) {
    filtered = filtered.filter(t => t.category === templateFilter.category)
  }
  
  if (templateFilter.scope === 'public') {
    filtered = filtered.filter(t => t.metadata.isPublic)
  } else if (templateFilter.scope === 'private') {
    filtered = filtered.filter(t => !t.metadata.isPublic)
  }
  
  if (templateFilter.search) {
    const search = templateFilter.search.toLowerCase()
    filtered = filtered.filter(t => 
      t.name.toLowerCase().includes(search) ||
      t.description.toLowerCase().includes(search)
    )
  }
  
  return filtered
})

const filteredReports = computed(() => {
  let filtered = generatedReports.value
  
  if (reportFilter.dateRange) {
    const [start, end] = reportFilter.dateRange
    filtered = filtered.filter(r => 
      r.generatedAt >= start && r.generatedAt <= end
    )
  }
  
  if (reportFilter.template) {
    filtered = filtered.filter(r => r.templateId === reportFilter.template)
  }
  
  if (reportFilter.search) {
    const search = reportFilter.search.toLowerCase()
    filtered = filtered.filter(r => 
      r.title.toLowerCase().includes(search) ||
      r.description.toLowerCase().includes(search)
    )
  }
  
  return filtered
})

const canProceedGenerate = computed(() => {
  if (generateStep.value === 0) {
    return !!generateConfig.templateId
  }
  if (generateStep.value === 1) {
    return !!(generateConfig.title && generateConfig.dateRange && generateConfig.ports.length > 0)
  }
  return false
})

// 方法
const loadTemplates = async () => {
  try {
    templates.value = await reportService.getTemplates()
  } catch (error) {
    console.error('Failed to load templates:', error)
    ElMessage.error('加载模板失败')
  }
}

const loadReports = async () => {
  loadingReports.value = true
  try {
    // 模拟加载生成的报表
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // 生成一些示例报表
    const sampleReports: GeneratedReport[] = []
    for (let i = 0; i < 10; i++) {
      const template = templates.value[Math.floor(Math.random() * templates.value.length)]
      if (template) {
        const report = await reportService.generateReport(template.id, {
          timeRange: { type: 'relative', value: '7d' }
        })
        sampleReports.push(report)
      }
    }
    
    generatedReports.value = sampleReports
  } catch (error) {
    console.error('Failed to load reports:', error)
    ElMessage.error('加载报表失败')
  } finally {
    loadingReports.value = false
  }
}

const showTemplateDialog = () => {
  editingTemplate.value = {
    name: '',
    description: '',
    category: 'performance',
    dataConfig: {
      timeRange: { type: 'relative', value: '7d' },
      ports: [3000],
      metrics: ['responseTime', 'availability', 'errorRate'],
      filters: {},
      aggregation: 'hourly'
    },
    intelligence: {
      enableInsights: true,
      enableRecommendations: true,
      enablePredictions: false,
      enableComparisons: true,
      insightTypes: ['trend', 'anomaly']
    }
  }
  showTemplateEditor.value = true
}

const showGenerateDialog = () => {
  generateStep.value = 0
  generateProgress.value = 0
  generateConfig.templateId = ''
  generateConfig.title = `报表 - ${new Date().toLocaleDateString()}`
  generateConfig.dateRange = [
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    new Date()
  ]
  generateConfig.ports = [3000]
  showReportGenerator.value = true
}

const selectTemplate = (template: ReportTemplate) => {
  selectedTemplate.value = template
}

const editTemplate = (template: ReportTemplate) => {
  editingTemplate.value = { ...template }
  showTemplateEditor.value = true
}

const cloneTemplate = async (template: ReportTemplate) => {
  try {
    const cloned = {
      ...template,
      name: `${template.name} (副本)`,
      metadata: undefined
    }
    await reportService.createTemplate(cloned)
    await loadTemplates()
    ElMessage.success('模板已克隆')
  } catch (error) {
    ElMessage.error('克隆模板失败')
  }
}

const generateFromTemplate = (template: ReportTemplate) => {
  generateConfig.templateId = template.id
  showGenerateDialog()
}

const deleteTemplate = async (template: ReportTemplate) => {
  try {
    await ElMessageBox.confirm(`确定要删除模板"${template.name}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await reportService.deleteTemplate(template.id)
    await loadTemplates()
    ElMessage.success('模板已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除模板失败')
    }
  }
}

const saveTemplate = async () => {
  if (!editingTemplate.value.name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  
  savingTemplate.value = true
  try {
    if (editingTemplate.value.id) {
      await reportService.updateTemplate(editingTemplate.value.id, editingTemplate.value)
      ElMessage.success('模板已更新')
    } else {
      await reportService.createTemplate(editingTemplate.value as any)
      ElMessage.success('模板已创建')
    }
    
    showTemplateEditor.value = false
    await loadTemplates()
  } catch (error) {
    ElMessage.error('保存模板失败')
  } finally {
    savingTemplate.value = false
  }
}

const nextGenerateStep = async () => {
  if (generateStep.value === 1) {
    // 开始生成报表
    generateStep.value = 2
    await generateReport()
  } else {
    generateStep.value++
  }
}

const generateReport = async () => {
  try {
    const steps = [
      '准备数据源...',
      '收集性能数据...',
      '生成图表和表格...',
      '执行智能分析...',
      '生成报告内容...',
      '完成报表生成'
    ]
    
    for (let i = 0; i < steps.length; i++) {
      generateProgressText.value = steps[i]
      generateProgress.value = Math.round((i + 1) / steps.length * 100)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // 生成实际报表
    const config = generateConfig.dateRange ? {
      timeRange: {
        type: 'custom' as const,
        value: {
          start: generateConfig.dateRange[0],
          end: generateConfig.dateRange[1]
        }
      },
      ports: generateConfig.ports
    } : undefined
    
    generatedReport.value = await reportService.generateReport(
      generateConfig.templateId,
      config
    )
    
    generatedReports.value.unshift(generatedReport.value)
    ElMessage.success('报表生成完成')
    
  } catch (error) {
    console.error('Failed to generate report:', error)
    generateStatus.value = 'exception'
    generateProgressText.value = '报表生成失败'
    ElMessage.error('报表生成失败')
  }
}

const viewReport = (report: GeneratedReport) => {
  // 实现报表查看逻辑
  ElMessage.info('正在打开报表查看器...')
}

const exportReport = async (report: GeneratedReport, format: string) => {
  try {
    const result = await reportService.exportReport(report.id, format as any)
    
    const link = document.createElement('a')
    link.href = result.url
    link.download = result.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    ElMessage.success(`报表已导出为 ${format.toUpperCase()} 格式`)
  } catch (error) {
    ElMessage.error('导出报表失败')
  }
}

const shareReport = (report: GeneratedReport) => {
  // 实现报表分享逻辑
  ElMessage.info('分享功能开发中...')
}

const deleteReport = async (report: GeneratedReport) => {
  try {
    await ElMessageBox.confirm(`确定要删除报表"${report.title}"吗？`, '确认删除', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const index = generatedReports.value.findIndex(r => r.id === report.id)
    if (index > -1) {
      generatedReports.value.splice(index, 1)
    }
    
    ElMessage.success('报表已删除')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除报表失败')
    }
  }
}

const viewGeneratedReport = () => {
  if (generatedReport.value) {
    viewReport(generatedReport.value)
  }
}

const downloadGeneratedReport = () => {
  if (generatedReport.value) {
    exportReport(generatedReport.value, 'json')
  }
}

const handleTemplateEditorClose = () => {
  showTemplateEditor.value = false
  editingTemplate.value = {}
}

// 工具方法
const getCategoryType = (category: string) => {
  const types: Record<string, string> = {
    performance: 'success',
    security: 'warning',
    anomaly: 'danger',
    comprehensive: 'info'
  }
  return types[category] || 'info'
}

const getCategoryText = (category: string) => {
  const texts: Record<string, string> = {
    performance: '性能',
    security: '安全',
    anomaly: '异常',
    comprehensive: '综合'
  }
  return texts[category] || category
}

const getComponentCount = (template: ReportTemplate) => {
  return template.structure.sections.reduce((count, section) => 
    count + section.content.components.length, 0
  )
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString()
}

const formatDateTime = (date: Date) => {
  return date.toLocaleString()
}

const getDurationText = (range: { start: Date; end: Date }) => {
  const days = Math.ceil((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24))
  if (days === 1) return '1天'
  if (days === 7) return '7天'
  if (days === 30) return '30天'
  return `${days}天`
}

const getTemplateName = (templateId: string) => {
  const template = templates.value.find(t => t.id === templateId)
  return template?.name || '未知模板'
}

const getFrequencyText = (frequency: string) => {
  const texts: Record<string, string> = {
    daily: '每日',
    weekly: '每周',
    monthly: '每月',
    quarterly: '每季度'
  }
  return texts[frequency] || frequency
}

const getStatusType = (status: string) => {
  const types: Record<string, string> = {
    active: 'success',
    paused: 'warning',
    error: 'danger'
  }
  return types[status] || 'info'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    active: '活跃',
    paused: '暂停',
    error: '错误'
  }
  return texts[status] || status
}

// 省略其他方法实现...
const toggleSchedule = (row: ReportSchedule) => {
  // 占位：切换状态（仅本地）
  const status = row.metadata?.status
  if (status === 'active') {
    row.metadata.status = 'paused'
  } else {
    row.metadata.status = 'active'
  }
}
const editSchedule = (_row: ReportSchedule) => { /* 暂不实现 */ }
const deleteSchedule = (_row: ReportSchedule) => { /* 暂不实现 */ }
const previewTemplate = (_template: any) => { /* 暂不实现 */ }
const installTemplate = (_template: any) => { /* 暂不实现 */ }

// 生命周期
onMounted(async () => {
  await loadTemplates()
  await loadReports()
})
</script>

<style scoped>
.smart-report-panel {
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

/* 统计概览 */
.report-overview {
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
  transition: all 0.3s;
}

.stat-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
  color: white;
}

.stat-icon.templates {
  background: #409eff;
}

.stat-card .reports .stat-icon {
  background: #67c23a;
}

.stat-card .schedules .stat-icon {
  background: #e6a23c;
}

.stat-card .downloads .stat-icon {
  background: #909399;
}

.stat-info {
  flex: 1;
}

.stat-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #333;
  margin-bottom: 4px;
}

.stat-meta {
  font-size: 12px;
  color: #999;
}

/* 报表标签页 */
.report-tabs {
  margin-top: 20px;
}

/* 模板网格 */
.template-filters {
  margin-bottom: 20px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.template-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  transition: all 0.3s;
  cursor: pointer;
}

.template-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.template-card.selected {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.template-card.new-template {
  border: 2px dashed #dcdfe6;
  background: #fafbfc;
}

.new-template-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #909399;
}

.new-template-content h4 {
  margin: 16px 0 8px 0;
  color: #409eff;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 16px 0 16px;
}

.template-content {
  padding: 16px;
}

.template-content h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.template-content p {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.template-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #999;
}

.template-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.template-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.template-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px 16px 16px;
  font-size: 12px;
  color: #999;
}

.template-stats {
  display: flex;
  gap: 12px;
}

/* 报表列表 */
.report-filters {
  margin-bottom: 20px;
}

.report-stats {
  font-size: 12px;
  color: #666;
}

.download-count {
  font-weight: 600;
  color: #409eff;
}

.pagination-wrapper {
  margin-top: 20px;
  text-align: center;
}

/* 定时任务 */
.schedules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.schedules-header h4 {
  margin: 0;
  color: #333;
}

/* 模板市场 */
.marketplace-banner {
  text-align: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  margin-bottom: 20px;
}

.marketplace-banner h3 {
  margin: 0 0 8px 0;
  font-size: 24px;
}

.marketplace-banner p {
  margin: 0;
  opacity: 0.9;
}

.marketplace-categories {
  margin-bottom: 20px;
  text-align: center;
}

.marketplace-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.marketplace-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
  transition: all 0.3s;
}

.marketplace-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.market-card-image {
  height: 160px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.market-card-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
}

.market-card-content {
  padding: 16px;
}

.market-card-content h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.market-card-content p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #666;
  line-height: 1.4;
}

.market-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-rating {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #999;
}

.template-price {
  font-size: 16px;
  font-weight: 600;
  color: #f56c6c;
}

.market-card-actions {
  padding: 16px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  gap: 8px;
}

/* 弹窗样式 */
.template-editor {
  padding: 20px 0;
}

.step-content {
  margin: 20px 0;
  min-height: 300px;
}

.template-selector {
  display: grid;
  gap: 12px;
}

.template-option {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.template-option:hover {
  border-color: #409eff;
}

.template-option.selected {
  border-color: #409eff;
  background: #f0f8ff;
}

.option-desc {
  margin-top: 8px;
  font-size: 14px;
  color: #666;
}

.generating-status {
  text-align: center;
  padding: 40px 20px;
}

.progress-text {
  margin-top: 16px;
  color: #666;
}

.generation-complete {
  margin-top: 40px;
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
  
  .stat-card {
    flex-direction: column;
    text-align: center;
    padding: 16px;
  }
  
  .stat-icon {
    margin-right: 0;
    margin-bottom: 12px;
  }
  
  .template-grid {
    grid-template-columns: 1fr;
  }
  
  .marketplace-templates {
    grid-template-columns: 1fr;
  }
}
</style>







