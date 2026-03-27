<template>
  <div class="management-page">
    <div class="management-content">
      <div class="management-toolbar">
        <div class="management-toolbar-stats">
          <article
            v-for="snapshot in headerSnapshots"
            :key="snapshot.label"
            class="management-toolbar-stat"
            :class="[`management-toolbar-stat-${snapshot.tone || 'default'}`]"
          >
            <div v-if="snapshot.icon" class="management-toolbar-stat-icon">
              <component :is="snapshot.icon" />
            </div>
            <span class="management-toolbar-stat-label">{{ snapshot.label }}</span>
            <strong class="management-toolbar-stat-value">
              {{ formatHeaderMetricValue(snapshot.value) }}
            </strong>
          </article>
        </div>

        <div class="management-toolbar-actions">
          <el-button
            @click="refreshApps"
            :loading="loading"
            class="management-action-secondary"
          >
            刷新状态
          </el-button>
          <el-button
            v-if="canCreateApp"
            type="primary"
            @click="addApp"
          >
            添加应用
          </el-button>
        </div>
      </div>

      <el-card class="management-card">
        <div class="management-area">
          <!-- 搜索和筛选区域 -->
          <div class="filter-section" v-if="apps.length > 0">
            <div class="filter-row">
              <el-input
                v-model="searchQuery"
                placeholder="搜索应用名称、技术栈或描述..."
                :prefix-icon="Search"
                clearable
                @input="handleSearch"
                class="search-input"
              />
              <el-select
                v-model="statusFilter"
                placeholder="状态筛选"
                clearable
                @change="handleFilter"
                class="filter-select"
              >
                <el-option label="全部状态" value="" />
                <el-option label="在线" value="online" />
                <el-option label="离线" value="offline" />
                <el-option label="错误" value="error" />
                <el-option label="维护中" value="maintenance" />
              </el-select>
              <el-select
                v-model="techStackFilter"
                placeholder="技术栈筛选"
                clearable
                @change="handleFilter"
                class="filter-select"
                :loading="loadingTechStacks"
              >
                <el-option label="全部技术栈" value="" />
                <el-option 
                  v-for="techStack in availableTechStacks" 
                  :key="techStack.value" 
                  :label="techStack.label" 
                  :value="techStack.value" 
                />
              </el-select>
            </div>
          </div>

          <!-- 批量操作工具栏 -->
          <transition name="batch-toolbar">
            <div class="batch-toolbar" v-if="canBatchManage && selectedApps.length > 0">
              <div class="batch-info">
                <el-icon><Check /></el-icon>
                <span>已选择 <strong>{{ selectedApps.length }}</strong> 项</span>
              </div>
              <div class="batch-actions">
                <el-button
                  type="success"
                  size="small"
                  :disabled="batchOperationStats.offline === 0"
                  @click="batchStart"
                  :title="batchOperationInfo.start.tooltip"
                >
                  批量启动
                  <span v-if="batchOperationStats.offline > 0" class="batch-count">
                    ({{ batchOperationStats.offline }})
                  </span>
                </el-button>
                <el-button
                  type="warning"
                  size="small"
                  :disabled="batchOperationStats.online === 0"
                  @click="batchStop"
                  :title="batchOperationInfo.stop.tooltip"
                >
                  批量停止
                  <span v-if="batchOperationStats.online > 0" class="batch-count">
                    ({{ batchOperationStats.online }})
                  </span>
                </el-button>
                <el-button
                  type="danger"
                  size="small"
                  v-if="canDeleteApp"
                  @click="batchDelete"
                  :title="batchOperationInfo.delete.tooltip"
                >
                  删除选中
                </el-button>
                <el-button
                  size="small"
                  @click="clearSelection"
                >
                  取消选择
                </el-button>
              </div>
            </div>
          </transition>

          <el-empty
            v-if="filteredApps.length === 0 && apps.length > 0"
            description="没有找到匹配的应用"
          />

          <el-empty
            v-else-if="apps.length === 0"
            description="暂无应用数据"
          />

          <el-table
            v-else
            ref="tableRef"
            :data="filteredApps"
            style="width: 100%"
            @selection-change="handleSelectionChange"
            v-loading="loading"
            element-loading-text="加载应用列表中..."
          >
            <el-table-column v-if="canBatchManage" type="selection" width="55" />
            <el-table-column prop="name" label="应用名称" width="220">
              <template #default="{ row }">
                <div class="app-name-cell">
                  <div class="app-icon">
                    {{ getAppIcon(getTechStackValue(row)) }}
                  </div>
                  <div class="app-info">
                    <div class="app-name">{{ row.name }}</div>
                    <div class="app-description" v-if="row.description">
                      {{ row.description }}
                    </div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="techStack" label="技术栈" width="180">
              <template #default="{ row }">
                <div class="tech-stack-cell-simple">
                  <el-tag
                    :type="getTechStackType(getTechStackValue(row))"
                    size="small"
                    effect="light"
                    class="tech-stack-tag"
                  >
                    <span class="tech-stack-icon">{{ getTechStackIcon(getTechStackValue(row)) }}</span>
                    {{ getTechStackDisplayName(getTechStackValue(row)) }}
                  </el-tag>
                  <!-- 构建工具 - 简化为小字显示 -->
                  <div v-if="isFrontendApp(row) && getBuildToolInfo(row)" class="build-tool-hint">
                    {{ getBuildToolIcon(getBuildToolInfo(row)) }} {{ getBuildToolInfo(row) }}
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="端口" width="140">
              <template #default="{ row }">
                <el-tooltip
                  v-if="getAllPorts(row).length > 1"
                  placement="top"
                  :content="getPortsTooltip(row)"
                >
                  <span class="port-display-simple">
                    {{ getSimplePortDisplay(row) }}
                  </span>
                </el-tooltip>
                <span v-else class="port-display-simple">
                  {{ formatPortsDisplay(row) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag
                  :type="getStatusType(row.status)"
                  size="small"
                  effect="light"
                  class="status-tag-simple"
                >
                  {{ getStatusIcon(row.status) }} {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" :min-width="actionColumnMinWidth">
              <template #default="{ row }">
                <div class="action-buttons-optimized">
                  <!-- 运行时操作组 -->
                  <div class="runtime-actions" v-if="canManageRuntime">
                    <!-- 停止按钮 -->
                    <el-tooltip
                      v-if="row.status === 'online' && hasOperationPermission('stop')"
                      :content="getSmartDisplayInfo(row).tooltips.stop"
                      placement="top"
                    >
                      <el-button
                        size="small"
                        type="warning"
                        @click="toggleApp(row)"
                        :loading="row._loading"
                        icon="VideoPause"
                        :class="[
                          'action-btn',
                          getActionButtonClass(getSmartDisplayInfo(row).priority.runtime.stop)
                        ]"
                      >
                        停止
                      </el-button>
                    </el-tooltip>

                    <!-- 启动方式选择下拉菜单 -->
                    <el-tooltip
                      v-else-if="row.status !== 'online' && hasOperationPermission('start')"
                      :content="getSmartDisplayInfo(row).tooltips.start"
                      placement="top"
                    >
                      <el-dropdown
                        @command="(command: StartCommand) => handleStartApp(row, command as any)"
                        trigger="click"
                      >
                        <el-button
                          size="small"
                          type="success"
                          :loading="row._loading"
                          icon="VideoPlay"
                          :class="[
                            'action-btn',
                            getActionButtonClass(getSmartDisplayInfo(row).priority.runtime.start)
                          ]"
                        >
                          启动
                          <el-icon class="el-icon--right">
                            <ArrowDown />
                          </el-icon>
                        </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <!-- 开发模式 - 直接启动 -->
                          <el-dropdown-item command="native" :disabled="isExternalExeApp(row)">
                            <el-icon><Cpu /></el-icon>
                            开发模式
                            <div class="dropdown-desc">
                              {{ isExternalExeApp(row) ? 'External EXE 类型仅支持 PM2 启动' : '直接启动，支持热重载，适合开发调试' }}
                            </div>
                          </el-dropdown-item>

                          <!-- PM2生产环境 -->
                          <el-dropdown-item
                            command="pm2-prod"
                            :disabled="!supportsPM2(row)"
                            divided
                          >
                            <el-icon><Setting /></el-icon>
                            生产模式（PM2）
                            <div class="dropdown-desc">
                              {{ supportsPM2(row) ? '进程守护 + 集群模式 + 性能优化，生产环境专用' : '该应用不支持PM2启动' }}
                            </div>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                    </el-tooltip>
                  </div>

                  <!-- 更多操作（合并开发+管理） -->
                  <div class="more-actions">
                    <el-dropdown
                      v-if="canShowMoreActions(row)"
                      @command="(command: string) => handleMoreAction(row, command)"
                      trigger="click"
                      class="more-dropdown"
                    >
                      <el-button
                        size="small"
                        type="info"
                        :class="['action-btn', 'more-btn']"
                      >
                        更多
                        <el-icon class="el-icon--right">
                          <ArrowDown />
                        </el-icon>
                      </el-button>
                      <template #dropdown>
                        <el-dropdown-menu>
                          <!-- 应用配置 - 高频操作放最前 -->
                          <el-dropdown-item
                            v-if="hasOperationPermission('config')"
                            command="config"
                          >
                            <el-icon><Setting /></el-icon>
                            应用配置
                            <div class="dropdown-desc">修改应用配置参数</div>
                          </el-dropdown-item>

                          <!-- 编辑外观 -->
                          <el-dropdown-item
                            v-if="hasOperationPermission('edit-appearance')"
                            command="edit-appearance"
                            :divided="hasOperationPermission('config')"
                          >
                            <el-icon><Edit /></el-icon>
                            编辑外观
                            <div class="dropdown-desc">修改名称、图标和颜色</div>
                          </el-dropdown-item>

                          <!-- 文件夹操作 -->
                          <el-dropdown-item
                            v-if="hasOperationPermission('folder')"
                            command="open-folder"
                          >
                            <el-icon><FolderOpened /></el-icon>
                            打开文件夹
                            <div class="dropdown-desc">在文件管理器中打开</div>
                          </el-dropdown-item>

                          <!-- 运行输出 -->
                          <el-dropdown-item
                            v-if="hasOperationPermission('logs')"
                            command="view-backend-logs"
                          >
                            <el-icon><Monitor /></el-icon>
                            查看运行输出
                            <div class="dropdown-desc">读取应用运行日志（支持前端/后端拆分）</div>
                          </el-dropdown-item>

                          <!-- 构建功能 - 仅前端项目显示 -->
                          <template v-if="getSmartDisplayInfo(row).type.isFrontend && hasOperationPermission('build-analyze')">
                            <el-dropdown-item command="build-analyze" divided>
                              <el-icon><Search /></el-icon>
                              分析构建配置
                              <div class="dropdown-desc">检测构建工具</div>
                            </el-dropdown-item>
                            <el-dropdown-item command="build-view-analysis" :disabled="!hasBuildAnalysis(row)">
                              <el-icon><Document /></el-icon>
                              查看分析结果
                            </el-dropdown-item>
                            <el-dropdown-item
                              command="build-execute"
                              :disabled="!hasBuildAnalysis(row) || !hasOperationPermission('build-execute')"
                            >
                              <el-icon><VideoPlay /></el-icon>
                              执行构建
                            </el-dropdown-item>
                          </template>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </div>

                  <!-- 危险操作 - 根据权限和状态显示 -->
                  <div class="danger-actions" v-if="canDeleteApp">
                    <el-button
                      size="small"
                      type="danger"
                      @click="removeApp(row)"
                      :loading="row._deleting"
                      :disabled="getSmartDisplayInfo(row).priority.danger.delete === 'disabled'"
                      :icon="'Delete'"
                      :class="[
                        'action-btn',
                        getActionButtonClass(getSmartDisplayInfo(row).priority.danger.delete)
                      ]"
                    >
                      删除
                    </el-button>
                  </div>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-card>
    </div>

    <!-- 应用配置对话框 -->
    <el-dialog
      v-model="configDialogVisible"
      :title="`配置应用 - ${currentConfigApp?.name || ''}`"
      width="90%"
      top="5vh"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      class="config-dialog"
      destroy-on-close
    >
      <AppConfiguration
        v-if="currentConfigApp && configDialogVisible"
        :app-id="currentConfigApp.id"
        :app-name="currentConfigApp.name"
        :tech-stack="currentConfigApp.tech_stack"
        :working-directory="currentConfigApp.directory"
        :initial-access-path="currentConfigApp.access_path || ''"
        :visible="configDialogVisible"
        @update:visible="configDialogVisible = $event"
        @saved="handleConfigSaved"
        @close="handleConfigClose"
      />
    </el-dialog>

    <!-- 错误处理对话框 -->
    <el-dialog
      v-model="errorDialogVisible"
      title="错误详情"
      width="70%"
      :close-on-click-modal="false"
      class="error-dialog"
      destroy-on-close
    >
      <ErrorHandler
        v-if="currentError && errorDialogVisible"
        :error="currentError"
        :show-common-issues="true"
        :auto-suggest="true"
        @retry="handleErrorRetry"
        @dismiss="handleErrorDismiss"
        @action-executed="handleErrorAction"
      />
    </el-dialog>


    <!-- 手动添加应用对话框 -->
    <ManualAddApp
      v-model="showAddDialog"
      @success="handleAddSuccess"
    />

    <!-- 构建分析结果对话框 -->
    <BuildAnalysisDialog
      v-model="buildAnalysisDialogVisible"
      :analysis="currentBuildAnalysis"
      :loading="buildAnalysisLoading"
      @execute-build="handleExecuteBuild"
    />

    <!-- 构建进度对话框 -->
    <BuildProgressDialog
      v-model="buildExecutionDialogVisible"
      :progress="currentBuildProgress"
      @cancel="handleCancelBuild"
      @view-result="handleViewBuildResult"
    />

    <!-- PM2 修复对话框 -->
    <PM2FixDialog
      v-model="pm2FixDialogVisible"
      :error-message="pm2ErrorMessage"
      :app-id="currentPM2ErrorApp?.id"
      @retry="handleRetryAfterFix"
      @directStart="handleDirectStartAfterFix"
    />

    <!-- 外观编辑对话框 -->
    <AppAppearanceEditor
      v-model="appearanceEditorVisible"
      :app="currentAppearanceApp"
      @save="handleAppearanceSave"
    />

    <!-- 运行输出对话框 -->
    <el-dialog
      v-model="runtimeLogDialogVisible"
      :title="`运行输出 - ${currentLogApp?.name || ''}`"
      width="82%"
      top="6vh"
      class="runtime-log-dialog"
      destroy-on-close
    >
      <div class="runtime-log-toolbar">
        <div class="runtime-log-toolbar-left">
          <el-tag size="small" :type="runtimeLogSourceTagType">{{ runtimeLogSourceText }}</el-tag>
          <span class="runtime-log-updated">最近更新：{{ runtimeLogUpdatedAt || '--' }}</span>
        </div>

        <div class="runtime-log-toolbar-right">
          <el-select
            v-model="runtimeLogMode"
            size="small"
            style="width: 130px"
            popper-class="runtime-log-select-popper"
            :teleported="false"
          >
            <el-option label="自动选择" value="auto" />
            <el-option label="PM2 日志" value="pm2" />
            <el-option label="进程输出" value="native" />
          </el-select>

          <el-select
            v-model="runtimeLogTarget"
            size="small"
            style="width: 120px"
            :disabled="runtimeLogMode === 'pm2'"
            popper-class="runtime-log-select-popper"
            :teleported="false"
          >
            <el-option label="全部输出" value="all" />
            <el-option label="前端输出" value="frontend" />
            <el-option label="后端输出" value="backend" />
          </el-select>

          <el-select
            v-model="runtimeLogType"
            size="small"
            style="width: 120px"
            :disabled="runtimeLogMode === 'native'"
            popper-class="runtime-log-select-popper"
            :teleported="false"
          >
            <el-option label="综合日志" value="combined" />
            <el-option label="标准输出" value="out" />
            <el-option label="错误输出" value="error" />
          </el-select>

          <el-select
            v-model="runtimeLogLineCount"
            size="small"
            style="width: 100px"
            popper-class="runtime-log-select-popper"
            :teleported="false"
          >
            <el-option :value="100" label="100 行" />
            <el-option :value="200" label="200 行" />
            <el-option :value="500" label="500 行" />
            <el-option :value="1000" label="1000 行" />
          </el-select>

          <el-switch v-model="runtimeLogAutoRefresh" active-text="自动刷新" />
        </div>
      </div>

      <el-alert
        v-if="runtimeLogError"
        :title="runtimeLogError"
        type="warning"
        :closable="false"
        show-icon
        class="runtime-log-alert"
      />

      <div class="runtime-log-panel" v-loading="runtimeLogLoading">
        <pre class="runtime-log-pre">{{ runtimeLogContent || '暂无运行输出' }}</pre>
      </div>

      <template #footer>
        <div class="runtime-log-footer">
          <el-button @click="copyRuntimeLogs" :disabled="!runtimeLogContent">复制</el-button>
          <el-button @click="downloadRuntimeLogs" :disabled="!runtimeLogContent">导出</el-button>
          <el-button @click="runtimeLogDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="refreshRuntimeLogs" :loading="runtimeLogLoading">
            刷新输出
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Connection, VideoPlay, VideoPause, Setting, Delete, Monitor, Document, ArrowDown, Cpu, Search, Upload, FolderOpened, Edit } from '@element-plus/icons-vue'
import { appsApiService } from '@/services'
import { pm2ApiService } from '@/services/pm2Api'
import { buildApiService, buildExecutionApiService } from '@/services/buildApi'
import { filesystemApiService } from '@/services/filesystemApi'
import { appConfigurationApiService } from '@/services/appConfigurationApi'
import type { App } from '@/services'
import type { BuildAnalysis, BuildOptimization, DeploymentStrategy, BuildProgress, BuildExecutionOptions } from '@/services/buildApi'
import AppConfiguration from '@/components/AppConfiguration.vue'
import ManualAddApp from '@/components/ManualAddApp.vue'
import ErrorHandler from '@/components/ErrorHandler.vue'
import BuildAnalysisDialog from '@/components/BuildAnalysisDialog.vue'
import BuildProgressDialog from '@/components/BuildProgressDialog.vue'
import PM2FixDialog from '@/components/PM2FixDialog.vue'
import AppAppearanceEditor from '@/components/AppAppearanceEditor.vue'
import {
  getTechStackIcon,
  getTechStackDisplayName,
  getTechStackTagType,
  extractTechStackOptions
} from '@/utils/techStackUtils'
import { formatPortsDisplay, getAllPorts } from '@/types/app'
import { useAuthStore } from '@/stores/auth'
import { usePortalStore } from '@/stores/portal'
import { usePortMonitoringStore } from '@/stores/portMonitoring'
import { useWebSocket } from '@/composables/useWebSocket'
import { debugInfo, debugLog } from '@/utils/debugControl'
import {
  findBestMatchedPM2Process,
  isLikelyPM2ManagedApp
} from '@/utils/pm2ProcessMatching'

// 命令类型定义
type StartCommand = 'native' | 'pm2-prod' | string
type DevCommand = 'build-analyze' | 'build-optimize' | 'build-deploy' | 'build-config' | 'folder' | 'console' | string
type ManagementCommand = 'config' | 'validate-config' | 'validate-health' | 'pm2-fix' | 'network' | string
type RuntimeLogMode = 'auto' | 'pm2' | 'native'
type RuntimeLogType = 'combined' | 'out' | 'error'
type RuntimeLogTarget = 'all' | 'frontend' | 'backend'

// 扩展App类型以支持UI状态和字段兼容性
interface AppWithUIState extends Omit<App, 'status'> {
  _loading?: boolean
  _deleting?: boolean
  _buildLoading?: boolean
  pm2ProcessName?: string | null
  // 兼容后端API返回的字段命名（向后兼容）
  techStack?: string  // camelCase alternative
  last_start_time?: any
  last_stop_time?: any
  lastStartTime?: any
  lastStopTime?: any
  // 确保包含必需的属性
  status: string  // Relax status type for compatibility
  isRunning: boolean
  // 构建相关字段
  build_tool?: string
  build_script?: string
  build_output_dir?: string
  build_config_file?: string
  build_features?: string
  build_last_analysis?: number
  build_confidence?: number
  // 添加缺失的属性
  deploymentMode?: 'production' | 'development' | 'unknown'
  fullStack?: {
    isFullStack: boolean
    [key: string]: any
  }
  network?: {
    primaryPort?: number
    secondaryPorts?: number[]
    [key: string]: any
  }
  path?: string
  ports?: Array<{
    port: number
    type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database'
    protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp'
    description?: string
    isMain?: boolean
  }>
}

interface RemoveAppOptions {
  skipConfirm?: boolean
  silent?: boolean
}

interface RemoveAppResult {
  success: boolean
  error?: string
}

// 响应式数据
const apps = ref<AppWithUIState[]>([])
const selectedApps = ref<AppWithUIState[]>([])
const loading = ref(false)
const tableRef = ref() // Table引用，用于控制全选

// 权限管理
const authStore = useAuthStore()
const portalStore = usePortalStore()
const portMonitoringStore = usePortMonitoringStore()
const pendingPortRefreshTimers = new Set<ReturnType<typeof setTimeout>>()

// 搜索和过滤相关
const searchQuery = ref('')
const statusFilter = ref('')
const techStackFilter = ref('')
const filteredApps = ref<AppWithUIState[]>([])
const selectAll = ref(false)

const onlineAppsCount = computed(() =>
  apps.value.filter(app => app.isRunning || app.status === 'online').length
)

const headerSnapshots = computed<Array<{
  label: string
  value: string | number
  icon: any
  tone?: 'default' | 'highlight' | 'success' | 'warning' | 'danger'
}>>(() => {
  return [
    {
      label: '应用总数',
      value: apps.value.length,
      icon: Connection
    },
    {
      label: '在线应用',
      value: onlineAppsCount.value,
      icon: VideoPlay,
      tone: 'success'
    }
  ]
})

const formatHeaderMetricValue = (value: string | number) => (
  typeof value === 'number' ? value.toLocaleString('zh-CN') : value
)

const queuePortMonitoringRefresh = (delays: number[], reason: string) => {
  delays.forEach((delay) => {
    const timer = setTimeout(() => {
      pendingPortRefreshTimers.delete(timer)
      portMonitoringStore.refreshAll(true).catch((error) => {
        console.warn(`刷新端口监控失败 (${reason}, ${delay}ms):`, error)
      })
    }, delay)

    pendingPortRefreshTimers.add(timer)
  })
}

const isPortConflictError = (error: any): boolean => {
  const code = String(error?.code || '').trim().toUpperCase()
  if (code === 'PORT_CONFLICTS' || code === 'PORT_CONFLICT') {
    return true
  }

  const message = [
    error?.message,
    error?.details?.message,
    error?.response?.data?.message,
    error?.response?.data?.error?.message
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')

  return error?.status === 409 && /端口冲突|已被占用|port conflict|already in use/i.test(message)
}

// 技术栈动态加载
const availableTechStacks = ref<Array<{ label: string; value: string }>>([])
const loadingTechStacks = ref(false)

// 应用配置相关
const configDialogVisible = ref(false)
const showAddDialog = ref(false)
const currentConfigApp = ref<AppWithUIState | null>(null)

// 错误处理对话框
const errorDialogVisible = ref(false)
const currentError = ref<any>(null)

// PM2 修复对话框
const pm2FixDialogVisible = ref(false)
const pm2ErrorMessage = ref('')
const currentPM2ErrorApp = ref<AppWithUIState | null>(null)

// 外观编辑对话框
const appearanceEditorVisible = ref(false)
const currentAppearanceApp = ref<AppWithUIState | null>(null)

// 运行输出查看
const runtimeLogDialogVisible = ref(false)
const currentLogApp = ref<AppWithUIState | null>(null)
const runtimeLogLoading = ref(false)
const runtimeLogContent = ref('')
const runtimeLogError = ref('')
const runtimeLogUpdatedAt = ref('')
const runtimeLogMode = ref<RuntimeLogMode>('auto')
const runtimeLogType = ref<RuntimeLogType>('combined')
const runtimeLogTarget = ref<RuntimeLogTarget>('all')
const runtimeLogLineCount = ref(200)
const runtimeLogAutoRefresh = ref(false)
const runtimeLogSource = ref<'pm2' | 'native' | 'none'>('none')
let runtimeLogRefreshTimer: ReturnType<typeof setInterval> | null = null

// 工具函数：将应用名称转换为 slug 格式
const toSlugName = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

const runtimeLogSourceText = computed(() => {
  if (runtimeLogSource.value === 'pm2') return 'PM2 进程日志'
  if (runtimeLogSource.value === 'native') return '直接启动日志'
  return '未检测到日志来源'
})

const runtimeLogSourceTagType = computed(() => {
  if (runtimeLogSource.value === 'pm2') return 'success'
  if (runtimeLogSource.value === 'native') return 'primary'
  return 'info'
})

const getRuntimeLogTargetLabel = (target: RuntimeLogTarget): string => {
  if (target === 'frontend') return '前端'
  if (target === 'backend') return '后端'
  return '全部'
}

// 构建分析相关
const buildAnalysisDialogVisible = ref(false)
const currentBuildAnalysis = ref<BuildAnalysis | null>(null)
const buildAnalysisLoading = ref(false)
const supportedBuildTools = ref<string[]>([])

// 构建执行相关
const buildExecutionDialogVisible = ref(false)
const currentBuildProgress = ref<BuildProgress | null>(null)
const buildExecutionLoading = ref(false)
const buildProgressPolling = ref<NodeJS.Timeout | null>(null)

// 构建状态缓存
const buildStatusCache = ref<Map<string, any>>(new Map())
const buildProgressCache = ref<Map<string, BuildProgress>>(new Map())

// 构建分析结果缓存
const buildAnalysisCache = ref<Map<string, { analysis: BuildAnalysis; timestamp: number }>>(new Map())
const ANALYSIS_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

// WebSocket 连接
const { connect, disconnect, isConnected } = useWebSocket()

// 生命周期
onMounted(() => {
  loadApps()
  loadTechStacks()
  loadSupportedBuildTools()

  // 建立 WebSocket 连接以接收实时状态更新
  connect({
    onConnect: () => {
      debugLog('管理页面WebSocket连接成功')
    },
    onMessage: (message) => {
      // 处理应用状态更新消息
      if (message.type === 'portal_app_status') {
        updateAppStatus(message.payload)
      } else if (message.type === 'apps_status') {
        updateAppsStatus(message.payload.apps)
      }
    },
    onError: (error) => {
      console.error('管理页面WebSocket错误:', error)
    }
  })
})

// 组件卸载时断开 WebSocket 连接
onUnmounted(() => {
  disconnect()
  stopRuntimeLogAutoRefresh()
  pendingPortRefreshTimers.forEach(timer => clearTimeout(timer))
  pendingPortRefreshTimers.clear()
})

watch(runtimeLogDialogVisible, (visible) => {
  if (!visible) {
    stopRuntimeLogAutoRefresh()
    return
  }
  startRuntimeLogAutoRefresh()
})

watch(runtimeLogAutoRefresh, () => {
  startRuntimeLogAutoRefresh()
})

watch(runtimeLogMode, mode => {
  if (mode === 'pm2' && runtimeLogTarget.value !== 'all') {
    runtimeLogTarget.value = 'all'
  }
})

watch([runtimeLogMode, runtimeLogType, runtimeLogTarget, runtimeLogLineCount], () => {
  if (!runtimeLogDialogVisible.value) return
  void loadRuntimeLogs({ silent: true })
})

// 加载应用列表
const loadApps = async () => {
  loading.value = true
  try {
    const response = await appsApiService.getApps({ limit: 100 })
    if (response.success) {
      // 确保每个 app 都有 isRunning 属性
      apps.value = (response.data || []).map(app => ({
        ...app,
        isRunning: app.status === 'online'
      })) as AppWithUIState[]
      debugLog('加载应用列表成功:', apps.value)
      applyFilters()
    } else {
      throw new Error(response.message || '获取应用列表失败')
    }
  } catch (error) {
    console.error('加载应用列表失败:', error)
    ElMessage.error(`加载应用列表失败: ${error instanceof Error ? error.message : '未知错误'}`)
    apps.value = []
    filteredApps.value = []
  } finally {
    loading.value = false
  }
}


// 更新单个应用状态（WebSocket 消息处理）
const updateAppStatus = (appData: any) => {
  const index = apps.value.findIndex(app => app.id === appData.appId || app.id === appData.id)
  if (index !== -1) {
    // 合并更新应用数据
    apps.value[index] = { ...apps.value[index], ...appData }
    debugLog('应用状态已更新:', apps.value[index].name, appData)
    // 重新应用过滤
    applyFilters()
  }
}

// 批量更新应用状态（WebSocket 消息处理）
const updateAppsStatus = (appsData: any[]) => {
  appsData.forEach(appData => {
    const index = apps.value.findIndex(app => app.id === appData.id)
    if (index !== -1) {
      // 确保更新的数据包含 isRunning 属性
      apps.value[index] = { 
        ...apps.value[index], 
        ...appData,
        isRunning: appData.status === 'online' || appData.isRunning || false
      }
    }
  })
  debugLog('批量应用状态已更新，共', appsData.length, '个应用')
  // 重新应用过滤
  applyFilters()
}

// 加载技术栈选项
const loadTechStacks = async () => {
  loadingTechStacks.value = true
  try {
    // 直接使用本地分析方式获取技术栈选项（避免API调用失败）
    let appsToAnalyze = apps.value
    
    // 如果当前没有应用数据，先获取应用列表
    if (appsToAnalyze.length === 0) {
      const appsResponse = await appsApiService.getApps({ limit: 1000 })
      if (appsResponse.success && appsResponse.data) {
        appsToAnalyze = appsResponse.data.map(app => ({
          ...app,
          isRunning: app.status === 'online'
        })) as AppWithUIState[]
      }
    }
    
    // 使用工具函数提取技术栈选项
    availableTechStacks.value = extractTechStackOptions(appsToAnalyze)
    debugLog('技术栈选项加载成功:', availableTechStacks.value)
      
  } catch (error) {
    console.error('加载技术栈选项失败:', error)
    availableTechStacks.value = []
  } finally {
    loadingTechStacks.value = false
  }
}


// 应用搜索和过滤
const applyFilters = () => {
  let filtered = [...apps.value]

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    filtered = filtered.filter(app =>
      app.name.toLowerCase().includes(query) ||
      (app.description && app.description.toLowerCase().includes(query)) ||
      (app.tech_stack && app.tech_stack.toLowerCase().includes(query))
    )
  }

  // 状态过滤
  if (statusFilter.value) {
    filtered = filtered.filter(app => app.status === statusFilter.value)
  }

  // 技术栈过滤
  if (techStackFilter.value) {
    filtered = filtered.filter(app =>
      app.tech_stack && app.tech_stack.toLowerCase() === techStackFilter.value.toLowerCase()
    )
  }

  filteredApps.value = filtered
  
  // 过滤后清空选择状态
  if (tableRef.value) {
    tableRef.value.clearSelection()
  }
  selectAll.value = false
}

// 搜索处理
const handleSearch = () => {
  applyFilters()
}

// 过滤处理
const handleFilter = () => {
  applyFilters()
}

// 刷新应用
const refreshApps = async () => {
  let syncResult: Awaited<ReturnType<typeof pm2ApiService.syncState>> | null = null

  if (hasOperationPermission('start') || hasOperationPermission('stop') || hasOperationPermission('status')) {
    try {
      syncResult = await pm2ApiService.syncState()
      debugLog('应用状态已执行即时同步:', syncResult)
    } catch (error) {
      console.warn('即时同步应用状态失败，回退到普通列表刷新:', error)
    }
  }

  await loadApps()

  if (syncResult && syncResult.updated > 0) {
    ElMessage.success(`应用列表已刷新，已同步 ${syncResult.updated} 项状态`)
    return
  }

  ElMessage.success('应用列表已刷新')
}

// 批量操作相关
const handleSelectionChange = (selection: AppWithUIState[]) => {
  selectedApps.value = selection
  selectAll.value = selection.length === filteredApps.value.length && filteredApps.value.length > 0
}

const handleSelectAll = (value: boolean) => {
  if (!tableRef.value) return
  
  if (value) {
    // 全选：选中所有过滤后的应用
    filteredApps.value.forEach(app => {
      tableRef.value.toggleRowSelection(app, true)
    })
  } else {
    // 取消全选
    tableRef.value.clearSelection()
  }
}

// 清除选择
const clearSelection = () => {
  if (tableRef.value) {
    tableRef.value.clearSelection()
  }
  selectAll.value = false
}

// 批量启动
const batchStart = async () => {
  if (!hasOperationPermission('start')) {
    ElMessage.warning('当前账号没有批量启动权限')
    return
  }
  if (selectedApps.value.length === 0) return

  try {
    const promises = selectedApps.value
      .filter(app => app.status !== 'online')
      .map(app => toggleApp(app))

    await Promise.all(promises)
    ElMessage.success(`批量启动完成，共启动 ${promises.length} 个应用`)
  } catch (error) {
    ElMessage.error('批量启动失败')
  }
}

// 批量停止
const batchStop = async () => {
  if (!hasOperationPermission('stop')) {
    ElMessage.warning('当前账号没有批量停止权限')
    return
  }
  if (selectedApps.value.length === 0) return

  try {
    const promises = selectedApps.value
      .filter(app => app.status === 'online')
      .map(app => toggleApp(app))

    await Promise.all(promises)
    ElMessage.success(`批量停止完成，共停止 ${promises.length} 个应用`)
  } catch (error) {
    ElMessage.error('批量停止失败')
  }
}

// 批量删除
const batchDelete = async () => {
  if (!hasOperationPermission('delete')) {
    ElMessage.warning('当前账号没有批量删除权限')
    return
  }
  if (selectedApps.value.length === 0) return

  const appsToDelete = [...selectedApps.value]

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${appsToDelete.length} 个应用吗？此操作不可恢复！`,
      '批量删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )

    const results = await Promise.all(
      appsToDelete.map(app => removeApp(app, { skipConfirm: true, silent: true }))
    )
    const successCount = results.filter(result => result.success).length
    const failedCount = results.length - successCount

    clearSelection()

    if (failedCount === 0) {
      ElMessage.success(`批量删除完成，共删除 ${successCount} 个应用`)
      return
    }

    if (successCount > 0) {
      ElMessage.warning(`批量删除部分完成，成功 ${successCount} 个，失败 ${failedCount} 个`)
      return
    }

    ElMessage.error('批量删除失败')
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('批量删除失败')
    }
  }
}

// 添加应用
const addApp = () => {
  if (!hasOperationPermission('create')) {
    ElMessage.warning('当前账号没有添加应用权限')
    return
  }
  showAddDialog.value = true
}

// 处理手动添加成功
const handleAddSuccess = () => {
  loadApps() // 重新加载应用列表
}

// 状态处理函数
const getStatusType = (status: string) => {
  switch (status) {
    case 'online': return 'success'
    case 'offline': return 'info'
    case 'error': return 'danger'
    case 'maintenance': return 'warning'
    default: return 'info'
  }
}

const getStatusText = (status: string) => {
  switch (status) {
    case 'online': return '在线'
    case 'offline': return '离线'
    case 'error': return '错误'
    case 'maintenance': return '维护中'
    default: return '未知'
  }
}

// 获取状态指示器样式
const getStatusClass = (status: string) => {
  switch (status) {
    case 'online': return 'status-online'
    case 'offline': return 'status-offline'
    case 'error': return 'status-error'
    case 'maintenance': return 'status-maintenance'
    default: return 'status-unknown'
  }
}

// 获取状态图标（简化显示）
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'online': return '🟢'
    case 'offline': return '⚪'
    case 'error': return '🔴'
    case 'maintenance': return '🟡'
    default: return '⚪'
  }
}

// 获取简化的端口显示
const getSimplePortDisplay = (app: any) => {
  const ports = getAllPorts(app as any)
  if (ports.length === 0) return '-'
  if (ports.length === 1) return String(ports[0].port)
  return ports.map(p => p.port).join(' / ')
}

// 获取端口提示信息
const getPortsTooltip = (app: any) => {
  const ports = getAllPorts(app as any)
  return ports.map(p => `${getPortTypeLabel(p.type)}: ${p.port}`).join(', ')
}

// 获取应用图标（使用统一配置）
const getAppIcon = (techStack: string) => {
  return getTechStackIcon(techStack)
}

// 获取技术栈标签类型（使用统一配置）
const getTechStackType = (techStack: string) => {
  return getTechStackTagType(techStack)
}

// 获取技术栈值（处理字段兼容性）
const getTechStackValue = (app: AppWithUIState): string => {
  // 优先使用 techStack（驼峰命名），后备使用 tech_stack（下划线命名）
  return app.techStack || app.tech_stack || '未知'
}
// 🎯 检测应用是否通过PM2运行
const checkIfPM2Process = async (app: AppWithUIState): Promise<boolean> => {
  try {
    const processes = await pm2ApiService.getProcessList()
    const matchedProcess = findBestMatchedPM2Process(app, processes)
    const isPM2Managed = isLikelyPM2ManagedApp(app, processes)

    if (isPM2Managed) {
      debugLog('检测到PM2托管应用', {
        appName: app.name,
        appId: app.id,
        processName: matchedProcess?.name || app.pm2ProcessName || null,
        status: matchedProcess?.status || null
      })
    }

    return isPM2Managed
  } catch (error) {
    console.error('检查PM2进程失败:', error)
    return app.deploymentMode === 'production' || Boolean(String(app.pm2ProcessName || '').trim())
  }
}

const findMatchedPM2Process = async (app: AppWithUIState) => {
  const processes = await pm2ApiService.getProcessList()
  return findBestMatchedPM2Process(app, processes)
}

const loadRuntimeLogs = async (opts: { silent?: boolean } = {}) => {
  const app = currentLogApp.value
  if (!app) return

  const silent = Boolean(opts.silent)
  runtimeLogLoading.value = true
  runtimeLogError.value = ''
  const targetLabel = getRuntimeLogTargetLabel(runtimeLogTarget.value)

  const parseNativeLogs = (data: any): string => {
    const lines = Array.isArray(data?.lines) ? data.lines : []
    if (lines.length === 0) {
      return `当前暂无${targetLabel}进程输出。\n\n可能原因：\n1. 应用刚启动，尚未产生日志\n2. 对应进程当前未运行\n3. 应用没有输出到 stdout / stderr`
    }
    return lines.join('\n')
  }

  const tryLoadPM2Logs = async (): Promise<boolean> => {
    if (runtimeLogTarget.value !== 'all') {
      if (runtimeLogMode.value === 'pm2') {
        throw new Error('PM2 模式暂不支持按前端/后端拆分，请切换到“进程输出”或“自动选择”。')
      }
      return false
    }

    try {
      const matchedProcess = await findMatchedPM2Process(app)
      if (!matchedProcess) {
        throw new Error('未在 PM2 进程列表中找到该应用')
      }

      const pm2Response = await pm2ApiService.getProcessLogs(
        matchedProcess.name,
        runtimeLogType.value,
        runtimeLogLineCount.value
      )

      runtimeLogContent.value = pm2Response.logs?.trim()
        ? pm2Response.logs
        : 'PM2 返回为空日志，请稍后重试或切换到“进程输出”查看。'
      runtimeLogSource.value = 'pm2'
      return true
    } catch (error) {
      if (runtimeLogMode.value === 'pm2') {
        throw error
      }
      return false
    }
  }

  const tryLoadNativeLogs = async (): Promise<boolean> => {
    try {
      const nativeResponse = await appsApiService.getRuntimeLogs(
        app.id,
        runtimeLogLineCount.value,
        runtimeLogTarget.value
      )
      runtimeLogContent.value = parseNativeLogs(nativeResponse?.data)
      runtimeLogSource.value = 'native'
      return true
    } catch (error) {
      if (runtimeLogMode.value === 'native') {
        throw error
      }
      return false
    }
  }

  try {
    const mode = runtimeLogMode.value
    const preferNative = runtimeLogTarget.value !== 'all'
    const loaded =
      preferNative
        ? await tryLoadNativeLogs()
        : mode === 'pm2'
        ? await tryLoadPM2Logs()
        : mode === 'native'
          ? await tryLoadNativeLogs()
          : (await tryLoadPM2Logs()) || (await tryLoadNativeLogs())

    if (!loaded) {
      runtimeLogSource.value = 'none'
      runtimeLogContent.value = `未能读取到${targetLabel}输出，请检查应用运行状态。`
      runtimeLogError.value =
        runtimeLogTarget.value === 'all'
          ? '未找到可用日志来源（PM2 与进程输出均不可用）'
          : `未找到可用日志来源（当前目标：${targetLabel}，仅支持进程输出）`
    }
  } catch (error) {
    runtimeLogSource.value = 'none'
    runtimeLogContent.value = ''
    runtimeLogError.value = error instanceof Error ? error.message : '读取运行输出失败'
    if (!silent) {
      ElMessage.error(`读取运行输出失败: ${runtimeLogError.value}`)
    }
  } finally {
    runtimeLogUpdatedAt.value = new Date().toLocaleString()
    runtimeLogLoading.value = false
  }
}

const stopRuntimeLogAutoRefresh = () => {
  if (runtimeLogRefreshTimer) {
    clearInterval(runtimeLogRefreshTimer)
    runtimeLogRefreshTimer = null
  }
}

const startRuntimeLogAutoRefresh = () => {
  stopRuntimeLogAutoRefresh()
  if (!runtimeLogDialogVisible.value || !runtimeLogAutoRefresh.value) return
  runtimeLogRefreshTimer = setInterval(() => {
    void loadRuntimeLogs({ silent: true })
  }, 5000)
}

const showBackendLogs = async (app: AppWithUIState) => {
  if (!hasOperationPermission('logs')) {
    ElMessage.warning('当前账号没有查看日志权限')
    return
  }

  currentLogApp.value = app
  runtimeLogDialogVisible.value = true
  runtimeLogContent.value = ''
  runtimeLogError.value = ''
  runtimeLogSource.value = 'none'
  await loadRuntimeLogs()
  startRuntimeLogAutoRefresh()
}

const refreshRuntimeLogs = async () => {
  await loadRuntimeLogs()
}

const copyRuntimeLogs = async () => {
  if (!runtimeLogContent.value) return
  try {
    await navigator.clipboard.writeText(runtimeLogContent.value)
    ElMessage.success('运行输出已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请检查浏览器剪贴板权限')
  }
}

const downloadRuntimeLogs = () => {
  if (!runtimeLogContent.value || !currentLogApp.value) return
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = currentLogApp.value.name.replace(/[\\/:*?"<>|]/g, '-')
  const targetSuffix = runtimeLogTarget.value === 'all' ? 'all' : runtimeLogTarget.value
  const fileName = `${safeName}-runtime-output-${targetSuffix}-${timestamp}.log`
  const blob = new Blob([runtimeLogContent.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// 停止应用（智能停止：自动检测PM2/普通进程）
const toggleApp = async (app: AppWithUIState) => {
  const requiredOperation = app.status === 'online' ? 'stop' : 'start'
  if (!hasOperationPermission(requiredOperation)) {
    ElMessage.warning('当前账号没有此运行操作权限')
    return
  }

  // 设置加载状态
  app._loading = true

  try {
    // 🎯 智能检测：是否为PM2进程
    const isPM2Process = await checkIfPM2Process(app)
    
    if (isPM2Process) {
      // ✅ 使用PM2停止API
      const matchedProcess = await findMatchedPM2Process(app)
      debugLog('使用PM2停止进程', {
        appName: app.name,
        appId: app.id,
        matchedProcessName: matchedProcess?.name || app.pm2ProcessName || null
      })
      
      await pm2ApiService.stopProcessByAppId(app.id)
      
      app.status = 'offline'
      applyFilters()
      ElMessage.success(`应用 ${app.name} 已停止（PM2模式）`)
      queuePortMonitoringRefresh([0, 1200], `pm2-stop:${app.id}`)
      
      // ✅ 刷新门户应用列表
      portalStore.loadApps().catch(err => {
        console.warn('刷新门户应用列表失败:', err)
      })
    } else {
      // ✅ 使用普通停止API
      debugLog('使用普通模式停止应用', { appName: app.name })
      
      const response = await appsApiService.stopApp(app.id)
      if (response.success) {
        app.status = 'offline'
        applyFilters()
        ElMessage.success(`应用 ${app.name} 已停止`)
        queuePortMonitoringRefresh([0, 1200], `native-stop:${app.id}`)
        
        // ✅ 刷新门户应用列表
        portalStore.loadApps().catch(err => {
          console.warn('刷新门户应用列表失败:', err)
        })
      } else {
        throw new Error(response.message || '停止应用失败')
      }
    }

    // 主动刷新应用列表以确保状态同步（作为 WebSocket 的备用）
    setTimeout(() => {
      loadApps()
    }, 1000)
  } catch (error) {
    console.error('停止应用失败:', error)
    ElMessage.error(`停止应用失败: ${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    app._loading = false
  }
}

// 配置应用
const configApp = (app: AppWithUIState) => {
  if (!hasOperationPermission('config')) {
    ElMessage.warning('当前账号没有配置应用权限')
    return
  }
  currentConfigApp.value = app
  configDialogVisible.value = true
}

// 打开应用文件夹
const openAppFolder = async (app: AppWithUIState) => {
  if (!hasOperationPermission('folder')) {
    ElMessage.warning('当前账号没有打开目录权限')
    return
  }

  try {
    // 检查应用是否有目录信息
    if (!app.directory) {
      ElMessage.warning('应用目录信息不可用')
      return
    }

    // 调用后端API打开文件夹
    const response = await filesystemApiService.openFolder(app.directory)

    if (response.success) {
      ElMessage.success(`已在文件管理器中打开 ${app.name} 的文件夹`)
    } else {
      throw new Error(response.message || '打开文件夹失败')
    }
  } catch (error) {
    console.error('打开应用文件夹失败:', error)
    ElMessage.error(`打开文件夹失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 配置保存成功处理
const handleConfigSaved = async (config: any) => {
  ElMessage.success(`应用 ${currentConfigApp.value?.name} 配置保存成功`)
  configDialogVisible.value = false
  currentConfigApp.value = null
  await loadApps()
}

// 关闭配置对话框
const handleConfigClose = () => {
  configDialogVisible.value = false
  currentConfigApp.value = null
}

// 🔧 启动前配置应用端口
const configureAppPortsBeforeStart = async (app: AppWithUIState) => {
  try {
    debugLog('🔧 开始配置应用端口', { appId: app.id, name: app.name })

    // 准备端口配置
    const ports: any = {}

    // 解析端口信息
    if (app.ports && app.ports.length > 0) {
      const primaryPort = app.ports.find(p => p.isMain)
      if (primaryPort) {
        // 根据应用类型确定端口用途
        if (app.fullStack?.isFullStack) {
          // 全栈项目
          ports.frontend = primaryPort.port
          const secondaryPort = app.ports.find(p => !p.isMain)
          if (secondaryPort) {
            ports.backend = secondaryPort.port
          }
        } else {
          // 单一应用，根据技术栈判断
          const techStack = getTechStackValue(app).toLowerCase()
          if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
            ports.frontend = primaryPort.port
          } else {
            ports.backend = primaryPort.port
          }
        }
      }
    }

    // 如果没有端口信息，尝试从网络配置获取
    if (Object.keys(ports).length === 0 && app.network) {
      if (app.network.primaryPort) {
        if (app.fullStack?.isFullStack) {
          ports.frontend = app.network.primaryPort
          if (app.network.secondaryPorts && app.network.secondaryPorts.length > 0) {
            ports.backend = app.network.secondaryPorts[0]
          }
        } else {
          const techStack = getTechStackValue(app).toLowerCase()
          if (techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')) {
            ports.frontend = app.network.primaryPort
          } else {
            ports.backend = app.network.primaryPort
          }
        }
      }
    }

    // 配置端口
    if (Object.keys(ports).length > 0) {
      debugLog('🔧 配置端口', { appId: app.id, ports })

      const response = await appConfigurationApiService.configureAppPorts(app.id, ports)
      if (response.success) {
        debugLog('✅ 端口配置成功', response.data)
        ElMessage.success(`应用 ${app.name} 端口配置成功`)
      } else {
        console.warn('⚠️ 端口配置失败，继续使用默认配置', response)
      }
    } else {
      debugLog('ℹ️ 未找到端口信息，跳过端口配置', { appId: app.id })
    }

  } catch (error) {
    console.error('❌ 配置应用端口时发生错误', { error, appId: app.id })
    // 不阻塞启动流程，继续使用默认配置
  }
}

// 获取端口类型图标
const getPortTypeIcon = (type: string): string => {
  const iconMap: Record<string, string> = {
    frontend: '🌐',
    backend: '⚙️',
    api: '🔌',
    websocket: '🔗',
    database: '🗄️'
  }
  return iconMap[type] || '🔌'
}

// 获取端口标签类型
const getPortTagType = (type: string): 'primary' | 'success' | 'info' | 'warning' | 'danger' => {
  const typeMap: Record<string, 'primary' | 'success' | 'info' | 'warning' | 'danger'> = {
    frontend: 'primary',
    backend: 'success',
    api: 'info',
    websocket: 'warning',
    database: 'danger'
  }
  return typeMap[type] || 'info'
}

// 获取端口类型标签文本
const getPortTypeLabel = (type: string): string => {
  const labelMap: Record<string, string> = {
    frontend: '前端',
    backend: '后端',
    api: 'API',
    websocket: 'WS',
    database: '数据库'
  }
  return labelMap[type] || type
}

// 检查应用是否支持PM2启动
const isExternalExeApp = (app: AppWithUIState): boolean => {
  const techStack = getTechStackValue(app).toLowerCase().trim()
  if (techStack === 'external-exe') return true

  const script = String(app.build_script || '').toLowerCase()
  return script.endsWith('.exe') || script.includes('.exe ')
}

const supportsPM2 = (app: AppWithUIState): boolean => {
  if (isExternalExeApp(app)) {
    return Boolean(String(app.build_script || '').trim())
  }

  const techStack = getTechStackValue(app).toLowerCase()
  
  // PM2支持所有Node.js相关的应用
  // 包括：前端框架（Vue、React、Angular）、后端框架（Express、Koa、Nest.js）、全栈框架
  const nodeRelatedKeywords = [
    'node', 'npm', 'yarn', 'pnpm',  // Node.js生态
    'vue', 'react', 'angular', 'next', 'nuxt', 'svelte',  // 前端框架
    'express', 'koa', 'nest', 'fastify', 'hapi',  // 后端框架
    'vite', 'webpack', 'typescript', 'javascript', 'ts', 'js'  // 构建工具和语言
  ]
  
  // 只要技术栈中包含任何Node.js相关的关键词，就支持PM2
  const isNodeBased = nodeRelatedKeywords.some(keyword => 
    techStack.includes(keyword)
  )
  
  // 或者是全栈项目（通常都是Node.js based）
  const isFullStack = techStack.includes('full') || techStack.includes('全栈') || 
                      isFullStackProject(app)
  
  return isNodeBased || isFullStack
}

// 处理应用启动（支持启动方式选择）
const handleStartApp = async (app: AppWithUIState, startMode: 'native' | 'pm2-prod' = 'native') => {
  if (!hasOperationPermission('start')) {
    ElMessage.warning('当前账号没有启动应用权限')
    return
  }

  const action = '启动'

  if (isExternalExeApp(app) && startMode === 'native') {
    ElMessage.warning('External EXE 应用仅支持 PM2 启动，已自动切换到生产模式')
    startMode = 'pm2-prod'
  }

  // 设置加载状态
  app._loading = true

  try {
    // 🔧 新增：启动前动态配置端口
    await configureAppPortsBeforeStart(app)

    if (startMode === 'pm2-prod') {
      // 使用PM2启动（仅生产环境）
      if (!supportsPM2(app)) {
        if (isExternalExeApp(app)) {
          ElMessage.error('External EXE 应用缺少可执行文件脚本路径，无法启动')
          return
        }
        ElMessage.warning('该应用不支持PM2启动，将使用开发模式启动')
        startMode = 'native'
      } else {
        // 生成生产环境PM2配置
        const pm2Config = generatePM2Config(app, true)

        const response = await pm2ApiService.startProcessByAppId(app.id, pm2Config)
        if (response) {
          ElMessage.success(`应用 ${app.name} PM2启动请求已发送（生产模式）`)
          const expectedName = response.pm2ProcessName || toSlugName(app.name)
          queuePortMonitoringRefresh([800, 2500], `pm2-start:${app.id}`)
          
          // ✨ 立即刷新一次门户数据（快速更新UI）
          portalStore.loadApps().catch(err => {
            console.warn('立即刷新门户应用列表失败:', err)
          })
          
          // ⚡ 优化：缩短延迟到500ms（PM2启动通常很快）
          setTimeout(async () => {
            try {
              const processes = await pm2ApiService.getProcessList()
              const pm2Process = processes.find((p: any) => 
                p.name === expectedName || 
                p.name === app.name || 
                p.name === app.id || 
                p.name === toSlugName(app.name)
              )
              
              if (pm2Process) {
                // 根据PM2真实状态更新应用状态
                const pm2Status = pm2Process.status as string
                if (pm2Process.status === 'online') {
                  app.status = 'online'
                  ElMessage.success(`✅ 应用 ${app.name} 已成功启动`)
                  queuePortMonitoringRefresh([0, 1200], `pm2-online:${app.id}`)
                  // ✅ 再次刷新门户应用列表，确保首页显示正确的端口和模式
                  portalStore.loadApps().catch(err => {
                    console.warn('刷新门户应用列表失败:', err)
                  })
                } else if (pm2Status === 'error' || pm2Status === 'errored') {
                  app.status = 'error'
                  ElMessage.error(`❌ 应用 ${app.name} 启动失败，请前往PM2管理页面查看详情`)
                } else {
                  app.status = 'offline'
                  ElMessage.warning(`⚠️ 应用 ${app.name} PM2状态异常: ${pm2Process.status}`)
                }
              } else {
                app.status = 'offline'
                ElMessage.warning(`⚠️ 应用 ${app.name} 未在PM2进程列表中找到`)
              }
              applyFilters()
            } catch (error) {
              console.error('获取PM2状态失败:', error)
              // 如果获取状态失败，刷新整个应用列表
              loadApps()
              // ✅ 同时刷新门户应用列表
              portalStore.loadApps().catch(err => {
                console.warn('刷新门户应用列表失败:', err)
              })
            }
          }, 500)
          
          return
        } else {
          throw new Error('PM2启动失败')
        }
      }
    }

    // 使用传统方式启动（开发模式）
    const response = await appsApiService.startApp(app.id)
    if (response.success) {
      app.status = 'online'
      applyFilters() // 刷新过滤列表
      ElMessage.success(`应用 ${app.name} 已启动（开发模式）`)
      queuePortMonitoringRefresh([400, 1800], `native-start:${app.id}`)

      // 主动刷新应用列表以确保状态同步（作为 WebSocket 的备用）
      setTimeout(() => {
        loadApps()
      }, 1000)
    } else {
      throw new Error(response.message || '启动应用失败')
    }
  } catch (error: any) {
    console.error(`${action}应用失败:`, error)

    if (isPortConflictError(error)) {
      queuePortMonitoringRefresh([0, 1200], `start-conflict:${app.id}`)
    }

    // 🔍 调试：打印完整的错误对象
    debugLog('🔍 Error object:', {
      error,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStatus: error?.status,
      errorCode: error?.code,
      errorDetails: error?.details,
      errorDetailsType: error?.details?.errorType,
      response: error?.response,
      responseData: error?.response?.data,
      responseStatus: error?.response?.status,
      errorType: error?.response?.data?.errorType
    })

    // 🎯 优先检测 PM2 权限错误（在其他错误处理之前）
    if (error?.status === 503 && error?.details?.errorType === 'PM2_PERMISSION_ERROR') {
      debugLog('🎯 检测到 PM2 权限错误，显示修复对话框')
      pm2ErrorMessage.value = error.details.message || error.message || 'PM2 在 Windows 上遇到权限问题'
      currentPM2ErrorApp.value = app
      pm2FixDialogVisible.value = true
      return // 直接返回，不再执行后续的错误处理
    }

    // 🎯 检测环境变量验证错误
    if (error?.code === 'ENV_VALIDATION_FAILED' || error?.details?.errorType === 'ENV_VALIDATION_ERROR') {
      debugLog('🎯 检测到环境配置验证错误')
      const issues = error?.details?.issues || []
      const suggestions = error?.details?.suggestions || []
      const autoFixable = error?.details?.autoFixable !== false

      const issuesHtml = issues.length > 0 
        ? `<ul style="margin: 5px 0; padding-left: 20px;">${issues.map((i: string) => `<li>${i}</li>`).join('')}</ul>`
        : '环境配置不完整或不安全'

      const suggestionsHtml = suggestions.length > 0
        ? `<ul style="margin: 5px 0; padding-left: 20px;">${suggestions.map((s: string) => `<li>${s}</li>`).join('')}</ul>`
        : '<p>建议检查应用的环境变量配置</p>'

      if (autoFixable) {
        // 可以自动修复，提供修复选项
        ElMessageBox.confirm(
          `
            <div style="margin-bottom: 15px;">
              <strong>环境配置验证失败</strong>
            </div>
            <div style="margin-bottom: 15px;">
              <strong>发现的问题：</strong>
              ${issuesHtml}
            </div>
            <div style="margin-bottom: 15px;">
              <strong>建议：</strong>
              ${suggestionsHtml}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #e6f7ff; border-radius: 4px; border-left: 4px solid #1890ff;">
              <strong>💡 好消息：</strong>系统可以自动生成安全的环境配置（如JWT密钥等），并启动应用。
            </div>
          `,
          `环境配置问题 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '自动修复并启动',
            cancelButtonText: '取消',
            type: 'warning',
            distinguishCancelAndClose: true
          }
        ).then(async () => {
          try {
            app._loading = true
            ElMessage.info('正在自动修复环境配置...')
            
            // 调用自动修复API（暂时使用重试启动）
            await handleStartApp(app, startMode)
            
            ElMessage.success('环境配置已自动修复，应用启动成功！')
          } catch (retryError: any) {
            ElMessage.error('自动修复失败：' + (retryError.message || '未知错误'))
          } finally {
            app._loading = false
          }
        }).catch(() => {
          ElMessage.info('已取消自动修复')
        })
      } else {
        // 无法自动修复，只显示错误信息
        ElMessageBox.alert(
          `
            <div style="margin-bottom: 15px;">
              <strong>环境配置验证失败</strong>
            </div>
            <div style="margin-bottom: 15px;">
              <strong>发现的问题：</strong>
              ${issuesHtml}
            </div>
            <div style="margin-bottom: 15px;">
              <strong>建议：</strong>
              ${suggestionsHtml}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #fff7e6; border-radius: 4px; border-left: 4px solid #faad14;">
              <strong>⚠️ 需要手动配置：</strong>这些问题需要手动修复，请检查应用的.env文件。
            </div>
          `,
          `环境配置问题 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '知道了',
            type: 'error'
          }
        )
      }
      return // 直接返回，不再执行后续的错误处理
    }

    // 🎯 检测全栈应用部署警告
    if (error?.code === 'FULLSTACK_DEPLOYMENT_WARNING') {
      debugLog('🎯 检测到全栈应用部署警告')
      debugLog('🔍 调试信息:', error?.details?._debug)
      const details = error?.details || {}
      const warnings = details.warnings || []
      const recommendations = details.recommendations || []
      const adviceDetails = details.adviceDetails || []
      
      const warningsHtml = warnings.length > 0 
        ? `<ul style="margin: 5px 0; padding-left: 20px;">${warnings.map((w: string) => `<li>${w}</li>`).join('')}</ul>`
        : ''
      
      const recommendationsHtml = recommendations.length > 0
        ? `<ul style="margin: 5px 0; padding-left: 20px;">${recommendations.map((r: string) => `<li>${r}</li>`).join('')}</ul>`
        : ''
      
      const adviceHtml = adviceDetails.length > 0
        ? `<ul style="margin: 5px 0; padding-left: 20px;">${adviceDetails.map((a: string) => `<li>${a}</li>`).join('')}</ul>`
        : ''
      
      ElMessageBox.alert(
        `
          <div style="margin-bottom: 15px;">
            <strong>⚠️ 全栈应用部署提醒</strong>
          </div>
          <div style="margin-bottom: 15px;">
            <strong>应用信息：</strong>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>部署模式：${details.deploymentMode === 'integrated' ? '一体化部署' : '分离部署'}</li>
              <li>前端构建状态：${details.frontendBuilt ? '✅ 已构建' : '❌ 未构建'}</li>
              <li>后端配置：${details.hasBackend ? '✅ 已配置' : '❌ 未配置'}</li>
            </ul>
          </div>
          ${warningsHtml ? `
          <div style="margin-bottom: 15px;">
            <strong>⚠️ 警告：</strong>
            ${warningsHtml}
          </div>
          ` : ''}
          <div style="margin-bottom: 15px;">
            <strong>💡 建议：</strong>
            ${recommendationsHtml}
          </div>
          ${adviceHtml ? `
          <div style="margin-bottom: 15px;">
            <strong>详细说明：</strong>
            ${adviceHtml}
          </div>
          ` : ''}
          <div style="margin-top: 15px; padding: 10px; background: #fff7e6; border-radius: 4px; border-left: 4px solid #faad14;">
            <strong>🔧 如何解决：</strong>
            ${details.deploymentMode === 'integrated' && !details.frontendBuilt ? `
              <p>请先构建前端：</p>
              <code style="display: block; padding: 8px; background: #f4f4f5; border-radius: 4px; margin: 5px 0;">
                cd ${app.path}/frontend<br>
                npm run build
              </code>
              <p>然后重新启动Backend即可。</p>
            ` : `
              <p>建议使用<strong>开发模式</strong>启动，或修改Backend配置以支持一体化部署。</p>
            `}
          </div>
          ${details._debug ? `
          <div style="margin-top: 15px; padding: 10px; background: #f0f2f5; border-radius: 4px; font-family: monospace; font-size: 12px;">
            <strong>🔍 调试信息：</strong><br>
            应用目录: ${details._debug.appDirectory || '未知'}<br>
            Frontend路径: ${details._debug.frontendPath || '未找到'}<br>
            Dist路径: ${details._debug.frontendDistPath || '未找到'}<br>
            Backend路径: ${details._debug.backendPath || '未找到'}
          </div>
          ` : ''}
        `,
        `全栈应用启动提醒 - ${app.name}`,
        {
          dangerouslyUseHTMLString: true,
          confirmButtonText: '知道了',
          type: 'warning'
        }
      )
      return // 直接返回，不再执行后续的错误处理
    }

    // 提取详细的错误信息
    let errorMessage = `${action}应用失败`
    let errorDetails = ''
    let errorSuggestion = ''
    let errorCode = ''

    // ApiError 对象直接包含了所有错误信息
    if (error?.code) {
      errorCode = error.code
      errorMessage = error.message || errorMessage

      if (error.details) {
        errorDetails = error.details.message || ''
        errorSuggestion = error.details.suggestion || ''
      }
      
      // 根据错误类型显示不同的提示
      if (errorCode === 'DIRECTORY_NOT_FOUND') {
        ElMessageBox.alert(
          `
            <div style="margin-bottom: 15px;">
              <strong>错误：</strong>${errorMessage}
            </div>
            <div style="margin-bottom: 15px;">
              <strong>详情：</strong>${errorDetails}
            </div>
            <div style="margin-bottom: 15px;">
              <strong>建议：</strong>${errorSuggestion}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #f4f4f5; border-radius: 4px;">
              <strong>可能的解决方案：</strong>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>检查应用目录是否存在</li>
                <li>重新扫描工作区以更新应用列表</li>
                <li>删除此应用并重新添加</li>
              </ul>
            </div>
          `,
          `启动失败 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '知道了',
            type: 'error'
          }
        )
      } else if (errorCode === 'PORT_CONFLICT') {
        ElMessageBox.alert(
          `
            <div style="margin-bottom: 15px;">
              <strong>错误：</strong>${errorMessage}
            </div>
            <div style="margin-bottom: 15px;">
              <strong>详情：</strong>${errorDetails}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #f4f4f5; border-radius: 4px;">
              <strong>可能的解决方案：</strong>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>停止占用该端口的其他应用</li>
                <li>修改应用配置使用其他端口</li>
                <li>使用端口扫描功能查找空闲端口</li>
              </ul>
            </div>
          `,
          `端口冲突 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '知道了',
            type: 'warning'
          }
        )
      } else if (errorCode === 'PROCESS_START_FAILED') {
        ElMessageBox.alert(
          `
            <div style="margin-bottom: 15px;">
              <strong>错误：</strong>${errorMessage}
            </div>
            <div style="margin-bottom: 15px; white-space: pre-line;">
              <strong>可能原因：</strong>${errorSuggestion}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #f4f4f5; border-radius: 4px;">
              <strong>建议操作：</strong>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>在应用目录中运行 <code>npm install</code></li>
                <li>检查应用的启动脚本是否正确</li>
                <li>查看应用日志获取更多错误信息</li>
              </ul>
            </div>
          `,
          `进程启动失败 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '知道了',
            type: 'error'
          }
        )
      } else if (errorCode === 'PORT_NOT_LISTENING') {
        ElMessageBox.alert(
          `
            <div style="margin-bottom: 15px;">
              <strong>错误：</strong>${errorMessage}
            </div>
            <div style="margin-bottom: 15px; white-space: pre-line;">
              <strong>详情：</strong>${errorSuggestion}
            </div>
            <div style="margin-top: 15px; padding: 10px; background: #f4f4f5; border-radius: 4px;">
              <strong>建议操作：</strong>
              <ul style="margin: 5px 0; padding-left: 20px;">
                <li>查看应用日志检查内部错误</li>
                <li>确认应用配置的端口与实际使用的端口一致</li>
                <li>尝试增加启动超时时间</li>
              </ul>
            </div>
          `,
          `端口监听失败 - ${app.name}`,
          {
            dangerouslyUseHTMLString: true,
            confirmButtonText: '知道了',
            type: 'error'
          }
        )
      } else if (errorMessage.includes('PM2') || errorMessage.includes('pm2')) {
        // 其他 PM2 相关错误 - 也显示修复对话框
        debugLog('🎯 检测到其他 PM2 错误，显示修复对话框')
        pm2ErrorMessage.value = errorMessage
        currentPM2ErrorApp.value = app
        pm2FixDialogVisible.value = true
      } else {
        // 其他错误显示简单提示
        ElMessage.error({
          message: `${action}应用 ${app.name} 失败: ${errorMessage}`,
          duration: 5000
        })
      }
    } else {
      // 没有详细错误信息，显示基本提示
      errorMessage = error instanceof Error ? error.message : errorMessage

      // 检查是否是 PM2 相关错误
      const detailsMessage = error?.details?.message || ''
      const fullErrorMessage = errorMessage + ' ' + detailsMessage

      if (fullErrorMessage.includes('PM2') || fullErrorMessage.includes('pm2')) {
        // PM2 相关错误 - 显示修复对话框
        debugLog('🎯 检测到 PM2 错误（无 code 字段），显示修复对话框')
        pm2ErrorMessage.value = detailsMessage || errorMessage
        currentPM2ErrorApp.value = app
        pm2FixDialogVisible.value = true
      } else {
        ElMessage.error(`${action}应用 ${app.name} 失败: ${errorMessage}`)
      }
    }
  } finally {
    // 清除加载状态
    app._loading = false
  }
}

// 生成PM2配置
const generatePM2Config = (app: AppWithUIState, isProduction: boolean) => {
  if (isExternalExeApp(app)) {
    const script = String(app.build_script || '').trim()
    const preferredPort = app.frontend_port || app.backend_port

    return {
      script,
      cwd: app.directory,
      watch: false,
      instances: 1,
      exec_mode: 'fork' as const,
      max_memory_restart: '500M',
      autorestart: true,
      env: {
        NODE_ENV: isProduction ? 'production' : 'development',
        ...(preferredPort ? { PORT: String(preferredPort) } : {})
      },
      env_production: isProduction ? {
        NODE_ENV: 'production',
        ...(preferredPort ? { PORT: String(preferredPort) } : {})
      } : undefined
    }
  }

  const baseConfig: Partial<any> = {
    watch: !isProduction,
    instances: isProduction ? 'max' : 1,
    exec_mode: (isProduction ? 'cluster' : 'fork') as 'cluster' | 'fork',
    max_memory_restart: isProduction ? '1G' : '500M',
    autorestart: true,
    env: {
      NODE_ENV: isProduction ? 'production' : 'development',
      ...(isFullStackProject(app) && isProduction ? {
        FRONTEND_BUILD_PATH: './dist',
        SERVE_STATIC: 'true'
      } : {})
    },
    env_production: isProduction ? { NODE_ENV: 'production' } : undefined,
    // 添加脚本提示，帮助后端选择正确的启动脚本
    script_preference: isProduction ? 'production' : 'development'
  }

  return baseConfig
}

// 检查是否是全栈项目
const isFullStackProject = (app: AppWithUIState): boolean => {
  const directory = app.directory || ''
  return directory.includes('frontend') && directory.includes('backend')
}


// 处理应用停止
const handleStopApp = async (appId: string) => {
  const app = apps.value.find(a => a.id === appId)
  if (app) {
    await toggleApp(app)
  }
}

// PM2 修复后重试启动
const handleRetryAfterFix = async () => {
  if (currentPM2ErrorApp.value) {
    ElMessage.info('正在重试启动应用（生产模式）...')
    await handleStartApp(currentPM2ErrorApp.value, 'pm2-prod')
  }
}

// PM2 修复失败后使用直接启动
const handleDirectStartAfterFix = async () => {
  if (currentPM2ErrorApp.value) {
    ElMessage.info('使用直接启动模式...')
    await handleStartApp(currentPM2ErrorApp.value, 'native')
  }
}

// 处理错误重试
const handleErrorRetry = (errorId: string) => {
  debugLog('重试错误:', errorId)
  errorDialogVisible.value = false
}

// 处理错误忽略
const handleErrorDismiss = (errorId: string) => {
  debugLog('忽略错误:', errorId)
  errorDialogVisible.value = false
}

// 处理错误操作
const handleErrorAction = (action: string, params?: any) => {
  debugLog('执行错误操作:', action, params)
}

// 删除应用
const executeAppRemoval = async (
  app: AppWithUIState,
  options: RemoveAppOptions = {}
): Promise<RemoveAppResult> => {
  app._deleting = true

  try {
    // 调用删除API - 后端返回204 No Content，无响应体
    await appsApiService.deleteApp(app.id)

    // 如果没有抛出异常，说明删除成功
    // 从列表中移除
    const index = apps.value.findIndex(item => item.id === app.id)
    if (index > -1) {
      apps.value.splice(index, 1)
    }

    // 刷新过滤列表
    applyFilters()

    if (!options.silent) {
      ElMessage.success('应用已删除')
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'

    console.error('删除应用失败:', error)

    if (!options.silent) {
      ElMessage.error(`删除应用失败: ${errorMessage}`)
    }

    return {
      success: false,
      error: errorMessage
    }
  } finally {
    app._deleting = false
  }
}

const removeApp = async (
  app: AppWithUIState,
  options: RemoveAppOptions = {}
): Promise<RemoveAppResult> => {
  if (!hasOperationPermission('delete')) {
    ElMessage.warning('当前账号没有删除应用权限')
    return {
      success: false,
      error: '当前账号没有删除应用权限'
    }
  }

  try {
    if (!options.skipConfirm) {
      await ElMessageBox.confirm(
        `确定要删除应用 "${app.name}" 吗？此操作不可恢复！`,
        '确认删除',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    }

    return await executeAppRemoval(app, options)
  } catch {
    if (!options.silent) {
      ElMessage.info('已取消删除')
    }

    return {
      success: false,
      error: 'cancelled'
    }
  }
}

// ==================== 构建功能相关方法 ====================

// 加载支持的构建工具列表
const loadSupportedBuildTools = async () => {
  try {
    const response = await buildApiService.getSupportedTools()
    if (response.success && response.data) {
      supportedBuildTools.value = response.data.tools
    }
  } catch (error) {
    console.error('加载构建工具列表失败:', error)
  }
}

// 判断是否为全栈技术栈（tech_stack=fullstack/full-stack 等）
const isFullStackTechStack = (app: AppWithUIState): boolean => {
  const techStack = getTechStackValue(app).toLowerCase()
  const fullStackKeywords = ['fullstack', 'full-stack', 'full stack', '全栈']
  return fullStackKeywords.some(keyword => techStack.includes(keyword))
}

// 判断是否为前端应用
const isFrontendApp = (app: AppWithUIState): boolean => {
  const techStack = getTechStackValue(app).toLowerCase()
  const frontendStacks = ['react', 'vue', 'angular', 'next.js', 'nuxt.js', 'vite', 'svelte', 'create react app', 'vue cli', 'angular cli']
  return frontendStacks.some(stack => techStack.includes(stack)) || isFullStackTechStack(app)
}

// 获取构建工具信息
const getBuildToolInfo = (app: AppWithUIState): string | null => {
  return app.build_tool || null
}

// 获取构建置信度
const getBuildConfidence = (app: AppWithUIState): number | null => {
  return app.build_confidence || null
}

// 判断是否有构建分析结果
const hasBuildAnalysis = (app: AppWithUIState): boolean => {
  return !!(app.build_tool && app.build_last_analysis)
}

// 获取构建工具图标
const getBuildToolIcon = (tool: string | null): string => {
  if (!tool) return '🔧'
  const icons: Record<string, string> = {
    'Next.js': '⚡',
    'Nuxt.js': '💚',
    'Vite': '⚡',
    'Create React App': '⚛️',
    'Vue CLI': '💚',
    'Angular CLI': '🅰️',
    'Webpack': '📦',
    'Rollup': '📦',
    'Parcel': '📦'
  }
  return icons[tool] || '🔧'
}

// 获取构建置信度类型
const getBuildConfidenceType = (confidence: number | null): string => {
  if (confidence === null) return 'info'
  if (confidence >= 0.9) return 'success'
  if (confidence >= 0.75) return 'primary'
  if (confidence >= 0.6) return 'warning'
  return 'danger'
}

// 格式化构建置信度
const formatBuildConfidence = (confidence: number | null): string => {
  if (confidence === null) return 'N/A'
  const percentage = Math.round(confidence * 100)
  return `${percentage}%`
}

// 处理构建操作
const handleBuildAction = async (app: AppWithUIState, command: string) => {
  switch (command) {
    case 'analyze':
      await analyzeBuildConfiguration(app)
      break
    case 'view-analysis':
      await viewBuildAnalysis(app)
      break
    case 'execute-build':
      await executeBuild(app)
      break
    case 'view-progress':
      await viewBuildProgress(app)
      break
    default:
      console.warn('未知的构建操作:', command)
  }
}

// ==================== 新的操作栏事件处理方法 ====================

// 处理开发工具操作
const handleDevAction = async (app: AppWithUIState, command: string) => {
  // 构建相关操作
  if (command.startsWith('build-')) {
    const buildCommand = command.replace('build-', '')
    await handleBuildAction(app, buildCommand)
    return
  }

  // 其他开发操作
  switch (command) {
    case 'open-folder':
      openAppFolder(app)
      break
    default:
      console.warn('未知的开发操作:', command)
  }
}

// 处理管理操作
const handleManagementAction = async (app: AppWithUIState, command: string) => {
  switch (command) {
    case 'config':
      configApp(app)
      break
    default:
      console.warn('未知的管理操作:', command)
  }
}

// 处理"更多"菜单操作（合并开发+管理）
const handleMoreAction = async (app: AppWithUIState, command: string) => {
  // 构建相关操作
  if (command.startsWith('build-')) {
    const buildCommand = command.replace('build-', '')
    await handleBuildAction(app, buildCommand)
    return
  }

  // 其他操作
  switch (command) {
    case 'config':
      configApp(app)
      break
    case 'open-folder':
      openAppFolder(app)
      break
    case 'view-backend-logs':
      await showBackendLogs(app)
      break
    case 'edit-appearance':
      editAppAppearance(app)
      break
    default:
      console.warn('未知的操作:', command)
  }
}

// ==================== 外观编辑方法 ====================

// 打开外观编辑对话框
const editAppAppearance = (app: AppWithUIState) => {
  if (!hasOperationPermission('edit-appearance')) {
    ElMessage.warning('当前账号没有编辑外观权限')
    return
  }

  currentAppearanceApp.value = app
  appearanceEditorVisible.value = true
}

// 保存外观修改
const handleAppearanceSave = async (data: { id: string; name: string; icon: string; color: string }) => {
  try {
    const response = await appsApiService.updateApp(data.id, {
      name: data.name,
      icon: data.icon,
      color: data.color
    })
    
    if (response.success) {
      ElMessage.success('外观修改已保存')
      appearanceEditorVisible.value = false
      currentAppearanceApp.value = null
      
      // 刷新应用列表
      await loadApps()
      
      // 同步更新 Portal Store
      portalStore.loadApps()
    } else {
      ElMessage.error(response.message || '保存失败')
    }
  } catch (error) {
    console.error('保存外观失败:', error)
    ElMessage.error('保存外观失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// ==================== 智能显示逻辑方法（优化版） ====================

// 应用类型缓存
const appTypeCache = ref<Map<string, {
  isFrontend: boolean
  isBackend: boolean
  isFullStack: boolean
  timestamp: number
}>>(new Map())

const APP_TYPE_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

// 判断是否为后端应用
const isBackendApp = (app: AppWithUIState): boolean => {
  const techStack = getTechStackValue(app).toLowerCase()
  const backendStacks = ['node.js', 'express', 'koa', 'nest.js', 'fastify', 'spring', 'django', 'flask', 'laravel', 'asp.net', 'go', 'rust', 'python', 'java', 'c#', 'php']
  return backendStacks.some(stack => techStack.includes(stack)) || isFullStackTechStack(app)
}

// 获取缓存的应用类型信息
const getAppTypeInfo = (app: AppWithUIState) => {
  const cacheKey = `${app.id}-${getTechStackValue(app)}`
  const cached = appTypeCache.value.get(cacheKey)
  const now = Date.now()

  // 检查缓存是否有效
  if (cached && (now - cached.timestamp) < APP_TYPE_CACHE_TTL) {
    return cached
  }

  // 重新计算并缓存
  const isFrontend = isFrontendApp(app)
  const isBackend = isBackendApp(app)
  const isFullStack = Boolean(app.fullStack?.isFullStack) || isFullStackTechStack(app) || (isFrontend && isBackend)
  const typeInfo = {
    isFrontend: isFrontend || isFullStack,
    isBackend: isBackend || isFullStack,
    isFullStack,
    timestamp: now
  }

  appTypeCache.value.set(cacheKey, typeInfo)
  return typeInfo
}

// 权限缓存
const permissionCache = ref<Map<string, { hasPermission: boolean; timestamp: number }>>(new Map())
const PERMISSION_CACHE_TTL = 2 * 60 * 1000 // 2分钟缓存

// 检查用户对特定操作的权限（缓存版）
const hasOperationPermission = (operation: string): boolean => {
  const roleKey = authStore.currentUser?.role || 'guest'
  const activeKey = authStore.currentUser?.is_active ? 'active' : 'inactive'
  const cacheKey = `${roleKey}:${activeKey}:${operation}`
  const cached = permissionCache.value.get(cacheKey)
  const now = Date.now()

  // 检查缓存是否有效
  if (cached && (now - cached.timestamp) < PERMISSION_CACHE_TTL) {
    return cached.hasPermission
  }

  // 重新计算权限
  let hasPermission = true

  // 危险操作需要管理员权限
  const dangerousOperations = ['delete', 'force-stop', 'reset-config']
  if (dangerousOperations.includes(operation)) {
    hasPermission = authStore.hasPermission('admin')
  }
  // 管理操作需要 operator 或 admin 权限
  else if (['create', 'config', 'edit-appearance', 'pm2-management', 'deployment-config'].includes(operation)) {
    hasPermission = authStore.hasPermission('operator')
  }
  // 开发操作需要 operator 或 admin 权限
  else if (['build-analyze', 'build-execute', 'folder'].includes(operation)) {
    hasPermission = authStore.hasPermission('operator')
  }
  // 启动/停止/重启操作需要 operator 或 admin 权限
  else if (['start', 'stop', 'restart', 'reload'].includes(operation)) {
    hasPermission = authStore.hasPermission('operator')
  }
  // 查看操作需要认证用户
  else if (['logs', 'info', 'status'].includes(operation)) {
    hasPermission = authStore.isAuthenticated
  }

  // 缓存结果
  permissionCache.value.set(cacheKey, { hasPermission, timestamp: now })
  return hasPermission
}

const canCreateApp = computed(() => hasOperationPermission('create'))
const canDeleteApp = computed(() => hasOperationPermission('delete'))
const canManageRuntime = computed(() => hasOperationPermission('start') || hasOperationPermission('stop'))
const canBatchManage = computed(() => hasOperationPermission('start') || hasOperationPermission('stop') || hasOperationPermission('delete'))
const actionColumnMinWidth = computed(() => (canManageRuntime.value || canDeleteApp.value ? 280 : 180))

const canShowMoreActions = (app: AppWithUIState): boolean => {
  const canBuild = getSmartDisplayInfo.value(app).type.isFrontend && hasOperationPermission('build-analyze')
  return (
    hasOperationPermission('config') ||
    hasOperationPermission('edit-appearance') ||
    hasOperationPermission('folder') ||
    hasOperationPermission('logs') ||
    canBuild
  )
}

// 智能显示逻辑的computed属性
const getSmartDisplayInfo = computed(() => {
  return (app: AppWithUIState) => {
    const typeInfo = getAppTypeInfo(app)
    const isOnline = app.status === 'online'
    const isOffline = app.status === 'offline'

    return {
      // 应用类型信息
      type: typeInfo,

      // 操作优先级
      priority: {
        runtime: {
          start: isOffline ? 'high' : 'disabled',
          stop: isOnline ? 'high' : 'disabled'
        },
        development: {
          build: typeInfo.isFrontend ? 'medium' : 'hidden',
          folder: 'medium'
        },
        management: {
          config: 'medium'
        },
        danger: {
          delete: isOffline ? 'low' : 'disabled'
        }
      },

      // 可用功能
      features: {
        basic: ['start', 'stop', 'config', 'folder', 'delete'],
        frontend: typeInfo.isFrontend ? ['build-analyze', 'build-execute', 'build-history'] : [],
        backend: typeInfo.isBackend ? ['pm2-management', 'service-monitor'] : [],
        fullstack: typeInfo.isFullStack ? ['deployment-config', 'environment-switch'] : []
      },

      // 操作提示信息
      tooltips: {
        start: isOffline ? '启动应用' : '应用已在运行',
        stop: isOnline ? '停止应用' : '应用未运行',
        build: typeInfo.isFrontend ? '构建前端应用' : '该应用不支持构建',
        delete: isOffline ? '删除应用' : '请先停止应用'
      }
    }
  }
})

// 获取操作按钮的样式类
const getActionButtonClass = (priority: string): string => {
  switch (priority) {
    case 'high': return 'action-btn-high'
    case 'medium': return 'action-btn-medium'
    case 'low': return 'action-btn-low'
    case 'disabled': return 'action-btn-disabled'
    case 'hidden': return 'action-btn-hidden'
    default: return 'action-btn'
  }
}

// ==================== 批量操作智能显示逻辑 ====================

// 批量操作智能显示信息
const batchOperationInfo = computed(() => {
  const selected = selectedApps.value
  if (selected.length === 0) {
    return {
      start: { priority: 'disabled', tooltip: '请先选择应用' },
      stop: { priority: 'disabled', tooltip: '请先选择应用' },
      delete: { priority: 'disabled', tooltip: '请先选择应用' }
    }
  }

  const onlineCount = selected.filter(app => app.status === 'online').length
  const offlineCount = selected.filter(app => app.status === 'offline').length
  const totalCount = selected.length

  // 启动操作优先级
  let startPriority = 'disabled'
  let startTooltip = '没有可启动的应用'
  if (offlineCount > 0) {
    startPriority = offlineCount === totalCount ? 'high' : 'medium'
    startTooltip = offlineCount === totalCount
      ? `启动全部 ${totalCount} 个应用`
      : `启动 ${offlineCount} 个离线应用（共选中 ${totalCount} 个）`
  }

  // 停止操作优先级
  let stopPriority = 'disabled'
  let stopTooltip = '没有可停止的应用'
  if (onlineCount > 0) {
    stopPriority = onlineCount === totalCount ? 'high' : 'medium'
    stopTooltip = onlineCount === totalCount
      ? `停止全部 ${totalCount} 个应用`
      : `停止 ${onlineCount} 个在线应用（共选中 ${totalCount} 个）`
  }

  // 删除操作优先级
  let deletePriority = 'low'
  let deleteTooltip = `删除选中的 ${totalCount} 个应用`
  if (onlineCount > 0) {
    deletePriority = 'disabled'
    deleteTooltip = '请先停止所有在线应用'
  }

  return {
    start: { priority: startPriority, tooltip: startTooltip },
    stop: { priority: stopPriority, tooltip: stopTooltip },
    delete: { priority: deletePriority, tooltip: deleteTooltip }
  }
})

// 批量操作状态统计
const batchOperationStats = computed(() => {
  const selected = selectedApps.value
  return {
    total: selected.length,
    online: selected.filter(app => app.status === 'online').length,
    offline: selected.filter(app => app.status === 'offline').length,
    error: selected.filter(app => app.status === 'error').length
  }
})

// 分析构建配置（带重试机制）
const analyzeBuildConfiguration = async (app: AppWithUIState, retryCount = 0) => {
  const MAX_RETRIES = 2
  app._buildLoading = true
  
  try {
    const response = await buildApiService.analyzeBuild(app.id)
    if (response.success && response.data) {
      currentBuildAnalysis.value = response.data
      buildAnalysisDialogVisible.value = true

      // 缓存分析结果
      buildAnalysisCache.value.set(app.id, {
        analysis: response.data,
        timestamp: Date.now()
      })

      // 更新应用的构建信息
      app.build_tool = response.data.buildTool
      app.build_script = response.data.buildScript
      app.build_output_dir = response.data.outputDir
      app.build_confidence = response.data.confidence
      app.build_last_analysis = response.data.analysisTime

      ElMessage.success('构建配置分析完成')
    } else {
      throw new Error(response.message || '构建分析失败')
    }
  } catch (error: any) {
    console.error('构建分析失败:', error)

    // 根据错误类型显示不同的提示
    const errorData = error.response?.data || error
    const errorType = errorData.errorType
    const errorMessage = errorData.error || errorData.message || error.message
    const suggestion = errorData.suggestion

    // 判断是否应该重试
    const shouldRetry = !errorType || errorType === 'UNKNOWN'
    const canRetry = shouldRetry && retryCount < MAX_RETRIES

    if (canRetry) {
      // 显示重试提示
      debugLog(`构建分析失败，${1000 * (retryCount + 1)}ms 后进行第 ${retryCount + 1} 次重试...`)
      ElMessage.warning(`分析失败，正在重试 (${retryCount + 1}/${MAX_RETRIES})...`)
      
      // 指数退避重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)))
      
      // 重试（不重置loading状态）
      app._buildLoading = false
      return analyzeBuildConfiguration(app, retryCount + 1)
    }

    // 显示友好的错误提示
    let displayMessage = errorMessage
    if (suggestion) {
      displayMessage += `\n💡 ${suggestion}`
    }

    // 根据错误类型使用不同的消息类型
    if (errorType === 'NOT_FRONTEND' || errorType === 'NO_BUILD_TOOL') {
      ElMessage.warning({
        message: displayMessage,
        duration: 5000,
        showClose: true
      })
    } else {
      ElMessage.error({
        message: displayMessage,
        duration: 5000,
        showClose: true
      })
    }
  } finally {
    app._buildLoading = false
  }
}

// 查看构建分析结果
const viewBuildAnalysis = async (app: AppWithUIState) => {
  if (!hasBuildAnalysis(app)) {
    ElMessage.warning('请先进行构建分析')
    return
  }

  buildAnalysisLoading.value = true
  try {
    // 先检查本地缓存
    const cached = buildAnalysisCache.value.get(app.id)
    if (cached) {
      const now = Date.now()
      if (now - cached.timestamp < ANALYSIS_CACHE_TTL) {
        currentBuildAnalysis.value = cached.analysis
        buildAnalysisDialogVisible.value = true
        buildAnalysisLoading.value = false
        return
      } else {
        // 清除过期缓存
        buildAnalysisCache.value.delete(app.id)
      }
    }

    // 尝试从后端获取最近的分析结果
    const response = await buildApiService.getLatestBuildAnalysis(app.id)
    if (response.success && response.data) {
      currentBuildAnalysis.value = response.data
      buildAnalysisDialogVisible.value = true

      // 更新本地缓存
      buildAnalysisCache.value.set(app.id, {
        analysis: response.data,
        timestamp: Date.now()
      })
    } else {
      // 如果没有缓存结果，提示用户重新分析
      ElMessage.warning('未找到最近的分析结果，请重新进行构建分析')
    }
  } catch (error: any) {
    console.error('获取构建分析结果失败:', error)
    
    // 根据错误类型显示不同的提示
    const errorData = error.response?.data || error
    const errorMessage = errorData.error || errorData.message || error.message
    const suggestion = errorData.suggestion

    let displayMessage = errorMessage || '获取构建分析结果失败'
    if (suggestion) {
      displayMessage += `\n💡 ${suggestion}`
    }

    ElMessage.error({
      message: displayMessage,
      duration: 5000,
      showClose: true
    })
  } finally {
    buildAnalysisLoading.value = false
  }
}

// ==================== 构建执行相关方法 ====================

// 处理从构建分析对话框触发的构建
const handleExecuteBuild = async (analysis: BuildAnalysis) => {
  if (!analysis?.appId) {
    ElMessage.warning('无效的构建分析数据')
    return
  }

  try {
    buildAnalysisDialogVisible.value = false
    buildExecutionDialogVisible.value = true
    buildExecutionLoading.value = true

    // 初始化进度状态
    currentBuildProgress.value = {
      appId: analysis.appId,
      executionId: '',
      status: 'queued',
      progress: 0,
      currentStep: '正在启动构建...',
      startTime: Date.now(),
      logs: []
    }

    // 调用构建 API
    const response = await buildApiService.executeBuild(analysis.appId, {
      buildScript: analysis.buildScript,
      cleanBuild: true,
      environment: 'production'
    })

    if (response.success && response.data) {
      const { executionId } = response.data
      
      // 更新执行 ID
      if (currentBuildProgress.value) {
        currentBuildProgress.value.executionId = executionId
        currentBuildProgress.value.status = 'running'
        currentBuildProgress.value.currentStep = '构建进行中...'
      }

      ElMessage.success('构建任务已启动')

      // 开始轮询构建进度
      startBuildProgressPolling(executionId)
    } else {
      throw new Error(response.message || '启动构建失败')
    }
  } catch (error: any) {
    console.error('执行构建失败:', error)
    
    if (currentBuildProgress.value) {
      currentBuildProgress.value.status = 'failed'
      currentBuildProgress.value.currentStep = '构建失败'
      currentBuildProgress.value.error = error.message || '未知错误'
    }

    ElMessage.error(`执行构建失败: ${error.message || '未知错误'}`)
  } finally {
    buildExecutionLoading.value = false
  }
}

// 轮询构建进度
const startBuildProgressPolling = (executionId: string) => {
  // 清除之前的轮询
  if (buildProgressPolling.value) {
    clearInterval(buildProgressPolling.value)
  }

  // 开始轮询
  buildProgressPolling.value = setInterval(async () => {
    try {
      const response = await buildApiService.getBuildProgress(executionId)
      if (response.success && response.data) {
        currentBuildProgress.value = response.data

        // 如果构建完成或失败，停止轮询
        const status = response.data.status
        if (status === 'success' || status === 'failed' || status === 'cancelled') {
          if (buildProgressPolling.value) {
            clearInterval(buildProgressPolling.value)
            buildProgressPolling.value = null
          }

          // 显示结果消息
          if (status === 'success') {
            ElMessage.success('构建完成！')
          } else if (status === 'failed') {
            ElMessage.error('构建失败：' + (response.data.error || '未知错误'))
          } else {
            ElMessage.warning('构建已取消')
          }
        }
      }
    } catch (error) {
      console.error('获取构建进度失败:', error)
    }
  }, 1500) // 每1.5秒轮询一次
}

// 执行构建
const executeBuild = async (app: AppWithUIState) => {
  if (!hasBuildAnalysis(app)) {
    ElMessage.warning('请先进行构建分析')
    return
  }

  try {
    // 显示构建选项对话框
    const options = await showBuildOptionsDialog()
    if (!options) return

    app._buildLoading = true

    const response = await buildExecutionApiService.executeBuild(app.id, options)
    if (response.success && response.data) {
      const { buildId } = response.data
      ElMessage.success('构建任务已启动')

      // 开始监控构建进度
      startBuildProgressMonitoring(buildId, app)
    } else {
      throw new Error(response.message || '启动构建失败')
    }
  } catch (error) {
    console.error('执行构建失败:', error)
    ElMessage.error(`执行构建失败: ${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    app._buildLoading = false
  }
}

// 显示构建选项对话框
const showBuildOptionsDialog = (): Promise<BuildExecutionOptions | null> => {
  return new Promise((resolve) => {
    ElMessageBox.prompt('请选择构建环境和选项', '构建配置', {
      confirmButtonText: '开始构建',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '可选：输入自定义构建参数（JSON格式）',
      beforeClose: (action, instance, done) => {
        if (action === 'confirm') {
          try {
            const options: BuildExecutionOptions = {
              environment: 'production',
              cleanBuild: true,
              enableOptimizations: true,
              priority: 'normal'
            }

            // 如果有自定义参数，尝试解析
            if (instance.inputValue) {
              const customOptions = JSON.parse(instance.inputValue)
              Object.assign(options, customOptions)
            }

            resolve(options)
          } catch (error) {
            ElMessage.error('构建参数格式错误，请输入有效的JSON')
            return
          }
        } else {
          resolve(null)
        }
        done()
      }
    }).catch(() => {
      resolve(null)
    })
  })
}

// 开始构建进度监控
const startBuildProgressMonitoring = (buildId: string, app: AppWithUIState) => {
  // 清除之前的轮询
  if (buildProgressPolling.value) {
    clearInterval(buildProgressPolling.value)
  }

  // 开始轮询构建进度
  buildProgressPolling.value = setInterval(async () => {
    try {
      const response = await buildExecutionApiService.getBuildProgress(buildId)
      if (response.success && response.data) {
        const progress = response.data
        buildProgressCache.value.set(buildId, progress)

        // 更新应用的构建状态
        app.build_last_analysis = Date.now()

        // 如果构建完成或失败，停止轮询
        if (progress && (progress.status === 'success' || progress.status === 'failed' || progress.status === 'cancelled')) {
          if (buildProgressPolling.value) {
            clearInterval(buildProgressPolling.value)
            buildProgressPolling.value = null
          }

          if (progress.status === 'success') {
            ElMessage.success('构建完成')
          } else if (progress.status === 'failed') {
            ElMessage.error('构建失败')
          } else {
            ElMessage.warning('构建已取消')
          }
        }
      }
    } catch (error) {
      console.error('获取构建进度失败:', error)
    }
  }, 2000) // 每2秒轮询一次
}

// 查看构建进度
const viewBuildProgress = async (app: AppWithUIState) => {
  try {
    buildExecutionLoading.value = true

    // 获取最新的构建进度
    const response = await buildExecutionApiService.getBuildHistory(app.id, 1)
    if (response.success && response.data && response.data.length > 0) {
      const latestBuild = response.data[0]
      if (latestBuild.status === 'running' || latestBuild.status === 'queued') {
        const progressResponse = await buildExecutionApiService.getBuildProgress(latestBuild.id)
        if (progressResponse.success && progressResponse.data) {
          currentBuildProgress.value = progressResponse.data
          buildExecutionDialogVisible.value = true

          // 如果是运行中的任务，开始监控进度
          if (latestBuild.status === 'running') {
            startBuildProgressMonitoring(latestBuild.id, app)
          }
        }
      } else {
        ElMessage.info('当前没有正在进行的构建任务')
      }
    } else {
      ElMessage.info('没有找到构建记录')
    }
  } catch (error) {
    console.error('查看构建进度失败:', error)
    ElMessage.error('查看构建进度失败')
  } finally {
    buildExecutionLoading.value = false
  }
}

// 处理取消构建
const handleCancelBuild = async (executionId: string) => {
  try {
    const response = await buildExecutionApiService.cancelBuild(executionId)
    if (response.success) {
      ElMessage.success('构建任务已取消')
      buildExecutionDialogVisible.value = false

      // 停止进度轮询
      if (buildProgressPolling.value) {
        clearInterval(buildProgressPolling.value)
        buildProgressPolling.value = null
      }
    } else {
      throw new Error(response.message || '取消构建失败')
    }
  } catch (error) {
    console.error('取消构建失败:', error)
    ElMessage.error('取消构建失败')
  }
}

// 处理查看构建结果
const handleViewBuildResult = (progress: BuildProgress) => {
  buildExecutionDialogVisible.value = false
  // 这里可以显示构建结果详情
  ElMessage.success('构建完成，可以查看构建产物')
}

// 获取问题分类的标签
const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    'proxy': '代理配置',
    'port': '端口配置',
    'path': '路径配置',
    'dependency': '依赖配置',
    'cors': 'CORS配置',
    'env': '环境变量',
    'build': '构建配置',
    'security': '安全配置',
    'other': '其他'
  }
  return labels[category] || category
}
</script>

<style scoped>
.management-page {
  padding: 24px;
  background: #f0f2f5;
  min-height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.management-area {
  min-height: 400px;
}

.view-meta-alert {
  margin-bottom: 12px;
}

/* 搜索和筛选区域样式 */
.filter-section {
  margin-bottom: 12px;
  padding: 12px 16px;
  background: #fafbfc;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  max-width: 350px;
  min-width: 200px;
}

.filter-select {
  width: 140px;
}

/* 批量操作工具栏样式 */
.batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #e8f4fd 0%, #d4edfc 100%);
  border-radius: 8px;
  border: 1px solid #b3d8f5;
}

.batch-info {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409EFF;
  font-size: 14px;
}

.batch-info .el-icon {
  font-size: 16px;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 批量工具栏过渡动画 */
.batch-toolbar-enter-active,
.batch-toolbar-leave-active {
  transition: all 0.3s ease;
}

.batch-toolbar-enter-from,
.batch-toolbar-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    max-width: 100%;
  }

  .filter-select {
    width: 100%;
  }

  .batch-toolbar {
    flex-direction: column;
    gap: 12px;
  }

  .batch-actions {
    flex-wrap: wrap;
    justify-content: center;
  }
}

/* 应用名称单元格样式 */
.app-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-icon {
  font-size: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
  flex-shrink: 0;
}

.app-info {
  flex: 1;
  min-width: 0;
}

.app-name {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
  line-height: 1.4;
}

.app-description {
  font-size: 12px;
  color: #909399;
  line-height: 1.3;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 端口单元格样式 */
.port-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
  font-size: 13px;
}

.port-display {
  flex: 1;
}

.single-port {
  font-weight: 500;
  color: #409eff;
}

.multiple-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.port-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.port-type-icon {
  font-size: 10px;
}

/* 状态单元格样式 */
.status-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-online {
  background: #67c23a;
  box-shadow: 0 0 0 2px rgba(103, 194, 58, 0.2);
}

.status-offline {
  background: #909399;
  box-shadow: 0 0 0 2px rgba(144, 147, 153, 0.2);
}

.status-error {
  background: #f56c6c;
  box-shadow: 0 0 0 2px rgba(245, 108, 108, 0.2);
}

.status-maintenance {
  background: #e6a23c;
  box-shadow: 0 0 0 2px rgba(230, 162, 60, 0.2);
}

.status-unknown {
  background: #c0c4cc;
  box-shadow: 0 0 0 2px rgba(192, 196, 204, 0.2);
}

/* 操作按钮样式 */
.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 优化后的操作按钮样式 */
.action-buttons-optimized {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.runtime-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.dev-management-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.danger-actions {
  display: flex;
  align-items: center;
}

.action-btn {
  transition: all 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* 新的下拉菜单按钮样式 */
.dev-btn {
  background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
  border: none;
  color: white;

  &:hover {
    background: linear-gradient(135deg, #49aa17 0%, #6cb82f 100%);
  }

  &:focus {
    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
  }
}

.management-btn {
  background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  border: none;
  color: white;

  &:hover {
    background: linear-gradient(135deg, #177ddc 0%, #3c9ae8 100%);
  }

  &:focus {
    background: linear-gradient(135deg, #1890ff 0%, #40a9ff 100%);
  }
}

/* 智能显示优先级样式（带过渡动画） */
.action-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-btn-high {
  opacity: 1;
  transform: scale(1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: scale(1.05) translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}

.action-btn-medium {
  opacity: 0.85;
  transform: scale(0.95);
  transition: all 0.3s ease;

  &:hover {
    transform: scale(1) translateY(-1px);
    opacity: 1;
  }
}

.action-btn-low {
  opacity: 0.7;
  transform: scale(0.9);
  filter: grayscale(20%);
  transition: all 0.3s ease;

  &:hover {
    transform: scale(0.95) translateY(-1px);
    opacity: 0.85;
    filter: grayscale(0%);
  }
}

.action-btn-disabled {
  opacity: 0.5;
  transform: scale(0.85);
  filter: grayscale(50%);
  cursor: not-allowed;
  transition: all 0.3s ease;
}

.action-btn-hidden {
  opacity: 0;
  transform: scale(0.8);
  pointer-events: none;
  transition: all 0.3s ease;
}

/* 批量操作按钮样式 */
.batch-btn {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
}

.batch-count {
  font-size: 0.8em;
  opacity: 0.8;
  margin-left: 4px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.batch-btn.action-btn-high .batch-count {
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 4px;
  border-radius: 8px;
  font-size: 0.75em;
}

.action-btn-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(50%);

  &:hover {
    transform: none;
    opacity: 0.5;
  }
}

.action-btn-hidden {
  display: none;
}

.dev-dropdown,
.management-dropdown {
  .el-dropdown {
    .el-button {
      min-width: 60px;
      font-size: 12px;
    }
  }
}

/* 表格行悬停效果 */
:deep(.el-table__row:hover) {
  background-color: #f8f9fa !important;
}

/* 表格头部样式 */
:deep(.el-table th) {
  background-color: #fafbfc !important;
  color: #606266;
  font-weight: 600;
}

/* 表格边框样式 */
:deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 卡片样式优化 */
:deep(.el-card) {
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border: none;
}

:deep(.el-card__header) {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom: none;
  padding: 20px 24px;
}

.card-title {
  color: white;
  font-weight: 600;
  font-size: 16px;
}

/* 配置对话框样式 */
:deep(.config-dialog) {
  .el-dialog {
    max-height: 90vh;
    margin: 5vh auto;
    display: flex;
    flex-direction: column;
  }

  .el-dialog__header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    margin: 0;
    padding: 20px 24px;
    flex-shrink: 0;
  }

  .el-dialog__title {
    color: white;
    font-weight: 600;
  }

  .el-dialog__close {
    color: white;
  }

  .el-dialog__close:hover {
    color: #f0f0f0;
  }

  .el-dialog__body {
    padding: 0;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

/* 错误处理对话框样式 */
:deep(.error-dialog) {
  .el-dialog__header {
    background: linear-gradient(135deg, #ff4d4f 0%, #ff7875 100%);
    color: white;
    margin: 0;
    padding: 20px 24px;
  }

  .el-dialog__title {
    color: white;
    font-weight: 600;
  }

  .el-dialog__close {
    color: white;
  }

  .el-dialog__close:hover {
    color: #f0f0f0;
  }

  .el-dialog__body {
    padding: 20px;
  }
}

/* 运行输出对话框样式 */
:deep(.runtime-log-dialog) {
  .el-dialog {
    border-radius: 14px;
    overflow: hidden;
  }

  .el-dialog__header {
    background: linear-gradient(135deg, #0f766e 0%, #0284c7 100%);
    color: #fff;
    margin: 0;
    padding: 18px 22px;
  }

  .el-dialog__title {
    color: #fff;
    font-weight: 600;
  }

  .el-dialog__close {
    color: #fff;
  }

  .el-dialog__close:hover {
    color: #e5e7eb;
  }

  .el-dialog__body {
    padding: 16px 18px 12px;
  }
}

.runtime-log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px;
  border: 1px solid #dbeafe;
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
  border-radius: 10px;
  margin-bottom: 12px;
}

.runtime-log-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.runtime-log-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.runtime-log-updated {
  color: #64748b;
  font-size: 12px;
}

.runtime-log-alert {
  margin-bottom: 12px;
}

.runtime-log-panel {
  border: 1px solid #0f172a;
  border-radius: 10px;
  background: #0f172a;
  min-height: 360px;
  max-height: 56vh;
  overflow: auto;
}

.runtime-log-pre {
  margin: 0;
  padding: 14px 16px;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.55;
  font-family: 'Consolas', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.runtime-log-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

:deep(.runtime-log-select-popper) {
  z-index: 100010 !important;
}

/* 技术栈显示样式 */
.tech-stack-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.tech-stack-icon {
  font-size: 14px;
  line-height: 1;
}

/* 端口显示样式优化 */
.port-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.single-port-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}

.multiple-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.port-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  min-width: fit-content;
}

.port-type-icon {
  font-size: 12px;
  line-height: 1;
}

.port-type-label {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
}

.port-number {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-weight: 600;
  font-size: 12px;
}

/* 启动方式下拉菜单样式 */
.dropdown-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  line-height: 1.2;
}

.el-dropdown-menu__item {
  padding: 8px 16px;
  line-height: 1.4;
}

.el-dropdown-menu__item .el-icon {
  margin-right: 6px;
  font-size: 14px;
}

/* 配置预览对话框样式 */
.config-preview-dialog {
  .config-preview-content {
    max-height: 70vh;
    overflow-y: auto;
  }

  .app-info-card {
    margin-bottom: 20px;
    border: 1px solid #e4e7ed;
  }

  .app-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .info-item {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      font-weight: 600;
      color: #606266;
      min-width: 80px;
    }

    span {
      color: #303133;
    }
  }

  .config-comparison {
    margin-bottom: 20px;
  }

  .env-config-card {
    height: 100%;
    border: 1px solid #e4e7ed;

    &.dev-config {
      border-left: 4px solid #409eff;
    }

    &.prod-config {
      border-left: 4px solid #e6a23c;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;

      .el-tag {
        margin-left: auto;
      }
    }

    .config-content {
      margin-bottom: 16px;
    }

    .config-json {
      background: #f5f7fa;
      border: 1px solid #e4e7ed;
      border-radius: 4px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.4;
      color: #606266;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
    }

    .config-features {
      h4 {
        margin: 0 0 8px 0;
        font-size: 13px;
        color: #303133;
      }

      ul {
        margin: 0;
        padding-left: 16px;
        font-size: 12px;
        color: #606266;
        line-height: 1.6;

        li {
          margin-bottom: 4px;
        }
      }
    }
  }

  .deployment-tips {
    border: 1px solid #e4e7ed;

    .tips-content {
      h4 {
        margin: 0 0 12px 0;
        color: #303133;
        font-size: 14px;
      }

      ol {
        margin: 0;
        padding-left: 20px;
        color: #606266;
        line-height: 1.6;

        li {
          margin-bottom: 8px;
          font-size: 13px;

          strong {
            color: #303133;
          }
        }
      }
    }
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
}


@media (max-width: 768px) {
  .config-preview-dialog {
    .app-info-grid {
      grid-template-columns: 1fr;
    }

    .config-comparison .el-row {
      flex-direction: column;
    }

    .config-comparison .el-col {
      width: 100% !important;
      margin-bottom: 16px;
    }
  }
}

/* 构建功能相关样式 */
.tech-stack-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 简化的技术栈单元格 */
.tech-stack-cell-simple {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.build-tool-hint {
  font-size: 11px;
  color: #909399;
  padding-left: 2px;
}

/* 简化的端口显示 */
.port-display-simple {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 13px;
  color: #606266;
  cursor: default;
}

/* 简化的状态标签 */
.status-tag-simple {
  font-size: 12px;
}

.build-status-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.build-tool-tag,
.build-confidence-tag {
  font-size: 11px !important;
  height: 18px !important;
  line-height: 16px !important;
  padding: 0 4px !important;
}

.build-dropdown {
  .el-dropdown {
    .build-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      color: white;

      &:hover {
        background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
      }
    }
  }
}

.action-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;

  .action-btn {
    min-width: 60px;
    font-size: 12px;
  }

  .build-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    color: white;

    &:hover {
      background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
    }

    &:focus {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
  }
}

/* 构建分析对话框样式增强 */
.build-analysis-dialog {
  .el-dialog__body {
    padding: 20px;
  }

  .analysis-content {
    max-height: 70vh;
    overflow-y: auto;
  }

  .overview-card,
  .optimizations-card,
  .deployment-card,
  .issues-card {
    margin-bottom: 16px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .card-header {
    font-weight: 500;
    color: #303133;
  }
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .action-buttons {
    .action-btn {
      min-width: 50px;
      font-size: 11px;
      padding: 4px 8px;
    }
  }

  .action-buttons-optimized {
    gap: 8px;

    .runtime-actions,
    .dev-management-actions {
      gap: 4px;
    }

    .action-btn {
      min-width: 50px;
      font-size: 11px;
      padding: 4px 8px;
    }
  }

  .build-status-tags {
    .build-tool-tag,
    .build-confidence-tag {
      font-size: 10px !important;
      height: 16px !important;
      line-height: 14px !important;
      padding: 0 3px !important;
    }
  }
}

@media (max-width: 768px) {
  .runtime-log-toolbar {
    align-items: stretch;
  }

  .runtime-log-toolbar-left,
  .runtime-log-toolbar-right {
    width: 100%;
  }

  .runtime-log-toolbar-right {
    .el-select {
      width: 100% !important;
    }
  }

  .runtime-log-footer {
    width: 100%;
    justify-content: space-between;
    gap: 8px;

    .el-button {
      flex: 1;
      min-width: 0;
      padding-left: 8px;
      padding-right: 8px;
    }
  }

  .tech-stack-cell {
    .build-status-tags {
      margin-top: 2px;
    }
  }

  .action-buttons {
    flex-direction: column;
    gap: 2px;

    .action-btn {
      width: 100%;
      min-width: auto;
    }
  }

  .action-buttons-optimized {
    flex-direction: column;
    gap: 6px;
    align-items: stretch;

    .runtime-actions,
    .dev-management-actions,
    .danger-actions {
      display: flex;
      gap: 4px;
      width: 100%;
    }

    .runtime-actions {
      .action-btn {
        flex: 1;
        min-width: auto;
      }
    }

    .dev-management-actions {
      .dev-dropdown,
      .management-dropdown {
        flex: 1;

        .el-dropdown {
          width: 100%;

          .el-button {
            width: 100%;
          }
        }
      }
    }

    .danger-actions {
      .action-btn {
        width: 100%;
      }
    }
  }

  .build-dropdown {
    width: 100%;

    .el-dropdown {
      width: 100%;

      .build-btn {
        width: 100%;
      }
    }
  }

  .dev-dropdown,
  .management-dropdown {
    .el-dropdown {
      .el-button {
        font-size: 11px;
        padding: 4px 8px;
      }
    }
  }
}

/* 配置检测对话框样式 */
.config-validation-dialog {
  :deep(.el-dialog__header) {
    background: linear-gradient(135deg, #fa8c16 0%, #faad14 100%);
    color: white;
    margin: 0;
    padding: 20px 24px;
  }

  :deep(.el-dialog__title) {
    color: white;
    font-weight: 600;
  }

  :deep(.el-dialog__close) {
    color: white;
  }

  :deep(.el-dialog__close:hover) {
    color: #f0f0f0;
  }

  :deep(.el-dialog__body) {
    padding: 20px;
  }
}

.config-validation-content {
  min-height: 200px;
}

.validation-summary {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f5f5f5;
  border-radius: 6px;
  font-size: 14px;

  .label {
    color: #666;
    font-weight: 500;
  }

  .value {
    color: #333;
    font-weight: 600;
    font-size: 16px;
  }

  &.error {
    background: #fff1f0;
    border: 1px solid #ffccc7;

    .value {
      color: #cf1322;
    }
  }

  &.warning {
    background: #fffbe6;
    border: 1px solid #ffe58f;

    .value {
      color: #d48806;
    }
  }

  &.info {
    background: #e6f7ff;
    border: 1px solid #91d5ff;

    .value {
      color: #0958d9;
    }
  }

  &.success {
    background: #f6ffed;
    border: 1px solid #b7eb8f;

    .value {
      color: #389e0d;
    }
  }
}

.config-files {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: #fafafa;
  border-radius: 4px;
  font-size: 13px;
  color: #666;
  font-family: 'Consolas', 'Monaco', monospace;

  .el-icon {
    color: #1890ff;
    font-size: 16px;
  }
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.issue-item {
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #d9d9d9;
  background: #fafafa;

  &.issue-error {
    border-color: #ffccc7;
    background: #fff1f0;
  }

  &.issue-warning {
    border-color: #ffe58f;
    background: #fffbe6;
  }

  &.issue-info {
    border-color: #91d5ff;
    background: #e6f7ff;
  }
}

.issue-header {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.issue-message {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  margin-bottom: 12px;
  line-height: 1.6;
}

.issue-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: white;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
}

.detail-item {
  display: flex;
  gap: 12px;
  font-size: 13px;

  .label {
    color: #666;
    font-weight: 500;
    min-width: 60px;
  }

  .value {
    color: #333;
    flex: 1;
    word-break: break-all;
    font-family: 'Consolas', 'Monaco', monospace;

    &.expected {
      color: #52c41a;
      font-weight: 500;
    }
  }

  code {
    padding: 2px 6px;
    background: #f5f5f5;
    border-radius: 3px;
    font-size: 12px;
  }

  &.suggestion {
    background: #f6ffed;
    border: 1px solid #b7eb8f;
    border-radius: 4px;
    padding: 8px 12px;
    margin-top: 8px;

    .label {
      color: #52c41a;
      font-weight: 600;
    }

    .value {
      color: #389e0d;
      font-weight: 500;
    }
  }
}

/* Management refresh */
.management-page {
  padding: 24px;
  min-height: 100%;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.12), transparent 24%),
    linear-gradient(180deg, #eef4ff 0%, #f7f9fc 48%, #eef2f8 100%);
}

.management-content {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 1440px;
  margin: 0 auto;
}

.management-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 28px 30px;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.82));
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
}

.management-hero-copy {
  flex: 1;
  min-width: 0;
}

.management-eyebrow,
.card-eyebrow,
.view-summary-title {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary-600);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.management-title {
  margin-top: 14px;
  color: var(--text-strong);
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.management-subtitle {
  max-width: 760px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
}

.management-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.management-chip,
.summary-pill,
.header-indicator {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.management-chip-muted,
.summary-pill-muted {
  color: var(--text-tertiary);
}

.summary-pill-active {
  color: var(--primary-600);
  background: rgba(37, 99, 235, 0.1);
}

.management-hero-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.management-action {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-weight: 700;
}

.management-action-secondary {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.8);
}

.management-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 20px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.management-toolbar-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.management-toolbar-stat {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 10px 14px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
}

.management-toolbar-stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 14px;
  background: rgba(37, 99, 235, 0.12);
  color: var(--primary-600);
  font-size: 22px;
}

.management-toolbar-stat-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.management-toolbar-stat-value {
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.management-toolbar-stat-success .management-toolbar-stat-icon {
  background: rgba(34, 197, 94, 0.12);
  color: var(--success-600, #16a34a);
}

.management-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.management-toolbar-actions .el-button {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-weight: 700;
}

.management-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 18px 0;
}

.management-metric {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
}

.management-metric-highlight {
  background: linear-gradient(180deg, rgba(219, 234, 254, 0.92), rgba(255, 255, 255, 0.88));
}

.management-metric-success {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.92), rgba(255, 255, 255, 0.88));
}

.management-metric .metric-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.management-metric .metric-value {
  color: var(--text-strong);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.management-metric .metric-help {
  color: var(--text-secondary);
  font-size: 13px;
}

.management-card {
  border-radius: 28px;
  box-shadow: 0 24px 54px rgba(15, 23, 42, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.9);
}

.management-card :deep(.el-card__header) {
  padding: 22px 26px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.82));
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  color: inherit;
}

.management-card :deep(.el-card__body) {
  padding: 22px 26px 26px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.card-heading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-title {
  color: var(--text-strong);
  font-weight: 700;
  font-size: 24px;
  letter-spacing: -0.03em;
}

.card-subtitle,
.view-summary-description {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.management-area {
  min-height: 400px;
}

.view-summary-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  margin-bottom: 14px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.view-summary-copy {
  min-width: 0;
}

.view-summary-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.filter-section {
  margin-bottom: 14px;
  padding: 16px 18px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.search-input {
  flex: 1;
  min-width: 220px;
  max-width: 400px;
}

.filter-select {
  width: 160px;
}

.search-input :deep(.el-input__wrapper),
.filter-select :deep(.el-select__wrapper) {
  min-height: 44px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16);
}

.search-input :deep(.el-input__wrapper.is-focus),
.filter-select :deep(.el-select__wrapper.is-focused) {
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.34),
    0 0 0 4px rgba(37, 99, 235, 0.08);
}

.batch-toolbar {
  padding: 12px 16px;
  margin-bottom: 14px;
  border-radius: 20px;
  border: 1px solid rgba(37, 99, 235, 0.14);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.92), rgba(248, 250, 252, 0.88));
}

.batch-info {
  color: var(--primary-600);
  font-weight: 600;
}

.batch-actions {
  gap: 10px;
}

.management-card :deep(.el-empty) {
  padding: 42px 0;
}

.management-card :deep(.el-table) {
  --el-table-header-bg-color: rgba(248, 250, 252, 0.92);
  --el-table-row-hover-bg-color: rgba(37, 99, 235, 0.04);
  border-radius: 18px;
  overflow: hidden;
}

.management-card :deep(.el-table th.el-table__cell) {
  color: var(--text-secondary);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.management-card :deep(.el-table td.el-table__cell) {
  padding-top: 16px;
  padding-bottom: 16px;
}

@media (max-width: 980px) {
  .management-hero,
  .card-header,
  .view-summary-panel {
    flex-direction: column;
  }

  .management-hero-actions,
  .view-summary-meta {
    width: 100%;
    justify-content: flex-start;
  }

  .management-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .management-page {
    padding: 18px 14px;
  }

  .management-content {
    gap: 18px;
  }

  .management-hero,
  .management-card :deep(.el-card__header),
  .management-card :deep(.el-card__body) {
    padding-left: 18px;
    padding-right: 18px;
  }

  .management-stats {
    grid-template-columns: 1fr;
  }

  .management-toolbar {
    padding: 18px;
  }

  .management-toolbar-stats {
    width: 100%;
  }

  .management-toolbar-stat {
    width: 100%;
  }

  .management-toolbar-actions,
  .management-toolbar-actions .el-button {
    width: 100%;
  }

  .management-hero-actions,
  .management-action,
  .header-indicator {
    width: 100%;
  }

  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input,
  .filter-select {
    max-width: 100%;
    width: 100%;
  }
}
</style>


