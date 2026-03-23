<template>
  <div class="detection-page">
    <!-- 主要内容区域 -->
    <div class="detection-content">
      <!-- 配置阶段 -->
      <div v-if="currentStep === 'config'" class="config-stage">
        <!-- 步骤导航 -->
        <el-card class="steps-card" shadow="never">
          <el-steps :active="configStep" align-center>
            <el-step 
              title="选择路径" 
              description="配置扫描目录和范围"
              icon="FolderOpened"
            />
            <el-step 
              title="检测策略" 
              description="设置检测模式和技术栈优先级"
              icon="Setting"
            />
            <el-step 
              title="确认开始" 
              description="预览配置并启动检测"
              icon="Search"
            />
          </el-steps>
        </el-card>

        <!-- 第1步：路径选择 -->
        <div v-if="configStep === 0" class="config-step">
          <!-- 快速开始区域 -->
          <el-card class="quick-start-card" shadow="hover">
            <div class="quick-start-content">
              <div class="quick-start-left">
                <div class="quick-start-icon">⚡</div>
                <div class="quick-start-info">
                  <h3>快速开始</h3>
                  <p>使用推荐配置立即开始检测，适合大多数场景</p>
                </div>
              </div>
              <div class="quick-start-right">
                <div class="quick-start-path">
                  <el-input
                    v-model="quickStartPath"
                    placeholder="输入扫描路径，如 D:\Projects"
                    clearable
                    style="width: 300px;"
                  >
                    <template #prefix>
                      <el-icon><FolderOpened /></el-icon>
                    </template>
                  </el-input>
                  <el-button type="primary" @click="selectQuickStartFolder">
                    选择文件夹
                  </el-button>
                </div>
                <el-button 
                  type="success" 
                  size="large"
                  @click="quickStart"
                  :disabled="!quickStartPath"
                  :loading="isStarting"
                >
                  <el-icon><Search /></el-icon>
                  使用推荐配置开始
                </el-button>
              </div>
            </div>
            <div class="quick-start-hint">
              <el-tag v-if="hasLastConfig" size="small" type="success">已加载上次配置</el-tag>
              <el-tag v-else size="small" type="info">当前配置</el-tag>
              <span>扫描深度 {{ currentModeConfig.depth }} 层 | 自动排除 node_modules 等 | 智能端口分配</span>
            </div>
          </el-card>

          <el-divider>
            <span class="divider-text">或者自定义配置</span>
          </el-divider>

          <el-row :gutter="24">
            <el-col :span="16">
              <el-card shadow="hover" class="main-config-card">
                <template #header>
                  <div class="config-header">
                    <span>
                      <el-icon><FolderOpened /></el-icon>
                      扫描路径配置
                    </span>
                    <el-tag type="primary" size="small">第 1 步</el-tag>
                  </div>
                </template>
                
                <PathSelector
                  ref="pathSelectorRef"
                  @validate="onPathValidate"
                  @update:paths="updateSelectedPaths"
                />
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <!-- 扫描模式选择 -->
              <el-card shadow="hover" class="scan-mode-card">
                <template #header>
                  <span>
                    <el-icon><Setting /></el-icon>
                    扫描模式
                  </span>
                </template>
                
                <div class="scan-mode-options">
                  <div 
                    v-for="mode in scanModeOptions" 
                    :key="mode.value"
                    class="scan-mode-item"
                    :class="{ active: selectedScanMode === mode.value }"
                    @click="selectScanMode(mode.value)"
                  >
                    <div class="mode-icon">{{ mode.icon }}</div>
                    <div class="mode-info">
                      <div class="mode-title">{{ mode.title }}</div>
                      <div class="mode-desc">{{ mode.desc }}</div>
                    </div>
                    <div class="mode-check" v-if="selectedScanMode === mode.value">
                      <el-icon><Check /></el-icon>
                    </div>
                  </div>
                </div>
                
                <el-divider />
                
                <div class="mode-details">
                  <h4>当前模式配置</h4>
                  <el-descriptions :column="1" size="small">
                    <el-descriptions-item label="扫描深度">
                      {{ currentModeConfig.depth }} 层
                    </el-descriptions-item>
                    <el-descriptions-item label="排除规则">
                      {{ currentModeConfig.excludeCount }} 项
                    </el-descriptions-item>
                    <el-descriptions-item label="预计速度">
                      {{ currentModeConfig.speed }}
                    </el-descriptions-item>
                  </el-descriptions>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <!-- 第2步：检测策略 -->
        <div v-if="configStep === 1" class="config-step">
          <el-row :gutter="24">
            <el-col :span="14">
              <el-card shadow="hover" class="main-config-card">
                <template #header>
                  <div class="config-header">
                    <span>
                      <el-icon><Setting /></el-icon>
                      检测策略配置
                    </span>
                    <el-tag type="primary" size="small">第 2 步</el-tag>
                  </div>
                </template>
                
                <!-- 当前扫描配置概览 -->
                <div class="config-section">
                  <div class="current-config-summary">
                    <el-alert type="info" :closable="false" show-icon>
                      <template #title>
                        <span>当前扫描模式：<strong>{{ scanModeOptions.find(m => m.value === selectedScanMode)?.title }}</strong></span>
                      </template>
                      <template #default>
                        扫描深度 {{ currentModeConfig.depth }} 层 | 
                        排除 {{ currentModeConfig.excludeCount }} 项 | 
                        预计速度 {{ currentModeConfig.speed }}
                        <el-button type="primary" link size="small" @click="configStep = 0" style="margin-left: 12px;">
                          修改模式
                        </el-button>
                      </template>
                    </el-alert>
                  </div>
                </div>
                
                <!-- 技术栈优先级 -->
                <div class="config-section">
                  <h4>🎯 技术栈检测优先级</h4>
                  <div class="tech-priority-grid">
                    <div 
                      v-for="tech in techStackPriorities" 
                      :key="tech.name"
                      class="tech-item"
                      :class="{ active: tech.enabled }"
                      @click="toggleTechStack(tech.name)"
                    >
                      <div class="tech-icon">{{ tech.icon }}</div>
                      <div class="tech-name">{{ tech.name }}</div>
                      <div class="tech-priority">{{ tech.priority }}</div>
                    </div>
                  </div>
                </div>
                
                <!-- 端口分配策略 -->
                <div class="config-section">
                  <h4>🔗 端口分配策略</h4>
                  <div class="port-strategy-container">
                    <div 
                      v-for="strategy in portStrategies" 
                      :key="strategy.value"
                      class="port-strategy-item"
                      :class="{ active: portAllocationStrategy === strategy.value }"
                      @click="portAllocationStrategy = strategy.value"
                    >
                      <div class="strategy-radio">
                        <div class="radio-dot" :class="{ checked: portAllocationStrategy === strategy.value }"></div>
                      </div>
                      <div class="strategy-content">
                        <div class="strategy-title">{{ strategy.icon }} {{ strategy.title }}</div>
                        <div class="strategy-desc">{{ strategy.desc }}</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- 性能和资源配置 -->
                <div class="config-section" v-if="selectedPreset === 'custom'">
                  <h4>⚡ 性能配置</h4>
                  <el-row :gutter="16">
                    <el-col :span="12">
                      <el-form-item label="并发检测数">
                        <el-input-number 
                          v-model="performanceConfig.concurrency" 
                          :min="1" 
                          :max="10"
                        />
                        <span class="form-help">同时检测的应用数量</span>
                      </el-form-item>
                    </el-col>
                    <el-col :span="12">
                      <el-form-item label="内存限制">
                        <el-select v-model="performanceConfig.memoryLimit">
                          <el-option label="512MB" value="512MB" />
                          <el-option label="1GB" value="1GB" />
                          <el-option label="2GB" value="2GB" />
                          <el-option label="4GB" value="4GB" />
                        </el-select>
                        <span class="form-help">检测过程内存使用上限</span>
                      </el-form-item>
                    </el-col>
                  </el-row>
                </div>
                
                <!-- 高级配置入口 -->
                <div class="config-section">
                  <el-button 
                    type="primary" 
                    @click="showAdvancedConfig"
                    :icon="Tools"
                  >
                    打开高级配置
                  </el-button>
                  <span class="form-help">配置过滤规则、输出格式等高级选项</span>
                </div>
              </el-card>
            </el-col>
            
            <el-col :span="10">
              <el-card shadow="hover" class="preview-card">
                <template #header>
                  <span>
                    <el-icon><View /></el-icon>
                    策略预览
                  </span>
                </template>
                
                <div class="strategy-preview">
                  <div class="preview-section">
                    <h4>📁 扫描范围</h4>
                    <div class="preview-item">
                      <el-tag size="small">{{ selectedPaths.length }} 个路径</el-tag>
                      <div class="path-list">
                        <div v-for="path in selectedPaths.slice(0, 2)" :key="path" class="path-item">
                          {{ path }}
                        </div>
                        <div v-if="selectedPaths.length > 2" class="path-more">
                          还有 {{ selectedPaths.length - 2 }} 个路径...
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div class="preview-section">
                    <h4>🎯 检测策略</h4>
                    <el-descriptions :column="1" size="small">
                      <el-descriptions-item label="预设模式">
                        {{ presetLabels[selectedPreset] }}
                      </el-descriptions-item>
                      <el-descriptions-item label="端口策略">
                        {{ portStrategyLabels[portAllocationStrategy] }}
                      </el-descriptions-item>
                      <el-descriptions-item label="技术栈">
                        {{ enabledTechStacks.length }} 个已启用
                      </el-descriptions-item>
                      <el-descriptions-item label="并发数" v-if="selectedPreset === 'custom'">
                        {{ performanceConfig.concurrency }} 个
                      </el-descriptions-item>
                    </el-descriptions>
                  </div>
                  
                  <div class="preview-section">
                    <h4>📊 预估效果</h4>
                    <div class="estimation-grid">
                      <div class="estimation-item">
                        <span class="estimation-value">{{ estimatedFiles }}</span>
                        <span class="estimation-label">预计文件</span>
                      </div>
                      <div class="estimation-item">
                        <span class="estimation-value">{{ estimatedTime }}</span>
                        <span class="estimation-label">预计耗时</span>
                      </div>
                      <div class="estimation-item">
                        <span class="estimation-value">{{ estimatedApps }}</span>
                        <span class="estimation-label">可能应用</span>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 快速开始区域 -->
                  <div class="preview-section quick-start-section">
                    <h4>🚀 准备就绪</h4>
                    <el-button 
                      type="success" 
                      size="large"
                      @click="skipToStartDetection"
                      :disabled="!isPathValid"
                      :loading="isStarting"
                      style="width: 100%;"
                    >
                      <el-icon><Search /></el-icon>
                      跳过确认，直接开始检测
                    </el-button>
                    <div class="form-help" style="text-align: center; margin-top: 8px;">
                      或点击"下一步"查看完整配置预览
                    </div>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <!-- 第3步：确认开始（可选） -->
        <div v-if="configStep === 2" class="config-step">
          <el-row :gutter="24" justify="center">
            <el-col :span="16">
              <el-card shadow="hover" class="confirm-card">
                <template #header>
                  <div class="config-header">
                    <span>
                      <el-icon><Search /></el-icon>
                      确认配置并开始检测
                    </span>
                    <el-tag type="primary" size="small">第 3 步</el-tag>
                  </div>
                </template>
                
                <div class="confirm-content">
                  <!-- 配置总览 -->
                  <div class="config-summary">
                    <h3>🎯 本次扫描配置总览</h3>
                    
                    <el-row :gutter="16">
                      <el-col :span="8">
                        <div class="summary-card">
                          <div class="summary-icon">📁</div>
                          <div class="summary-content">
                            <div class="summary-title">扫描路径</div>
                            <div class="summary-value">{{ selectedPaths.length }} 个目录</div>
                            <div class="summary-detail">{{ getTotalPathSize() }}</div>
                          </div>
                        </div>
                      </el-col>
                      
                      <el-col :span="8">
                        <div class="summary-card">
                          <div class="summary-icon">⚙️</div>
                          <div class="summary-content">
                            <div class="summary-title">检测模式</div>
                            <div class="summary-value">{{ presetLabels[selectedPreset] }}</div>
                            <div class="summary-detail">{{ performanceConfig.concurrency || 3 }} 并发检测</div>
                          </div>
                        </div>
                      </el-col>
                      
                      <el-col :span="8">
                        <div class="summary-card">
                          <div class="summary-icon">🚀</div>
                          <div class="summary-content">
                            <div class="summary-title">性能配置</div>
                            <div class="summary-value">{{ performanceConfig.concurrency || 3 }} 并发</div>
                            <div class="summary-detail">{{ portStrategyLabels[portAllocationStrategy] }}</div>
                          </div>
                        </div>
                      </el-col>
                    </el-row>
                  </div>
                  
                  <!-- 预期结果 -->
                  <div class="expected-results">
                    <h4>📊 预期检测结果</h4>
                    <div class="result-preview">
                      <div class="result-item">
                        <el-statistic 
                          title="预计扫描文件" 
                          :value="estimatedFiles"
                          :value-style="{ color: '#409EFF' }"
                        >
                          <template #suffix>个</template>
                        </el-statistic>
                      </div>
                      <div class="result-item">
                        <el-statistic 
                          title="预计检测时间" 
                          :value="estimatedTimeSeconds"
                          :value-style="{ color: '#67C23A' }"
                        >
                          <template #suffix>秒</template>
                        </el-statistic>
                      </div>
                      <div class="result-item">
                        <el-statistic 
                          title="可能发现应用" 
                          :value="estimatedApps"
                          :value-style="{ color: '#E6A23C' }"
                        >
                          <template #suffix>个</template>
                        </el-statistic>
                      </div>
                    </div>
                  </div>
                  
                  <!-- 提醒信息 -->
                  <div class="detection-alerts">
                    <el-alert
                      v-if="!isPathValid"
                      title="⚠️ 路径配置问题"
                      description="请返回第1步检查路径配置，确保所有路径都可访问"
                      type="warning"
                      show-icon
                      :closable="false"
                    />
                    
                    <el-alert
                      v-else-if="estimatedTimeSeconds > 300"
                      title="⏰ 检测时间较长"
                      description="本次检测预计需要较长时间，建议在空闲时进行或调整并发数"
                      type="info"
                      show-icon
                      :closable="false"
                    />
                    
                    <el-alert
                      v-else
                      title="✅ 配置检查通过"
                      description="所有配置项均正常，可以开始智能检测"
                      type="success"
                      show-icon
                      :closable="false"
                    />
                  </div>
                  
                  <!-- 开始按钮 -->
                  <div class="start-action">
                    <el-button 
                      type="primary" 
                      size="large"
                      @click="startDetection"
                      :disabled="!isPathValid"
                      :loading="isStarting"
                    >
                      <el-icon><Search /></el-icon>
                      开始智能检测
                    </el-button>
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>

        <!-- 步骤导航按钮 -->
        <div class="step-navigation">
          <el-button 
            v-if="configStep > 0"
            @click="prevStep"
            :icon="ArrowLeft"
          >
            上一步
          </el-button>
          
          <el-button 
            v-if="configStep < 2"
            type="primary"
            @click="nextStep"
            :disabled="!canProceedToNextStep"
            :icon="ArrowRight"
          >
            下一步
          </el-button>
        </div>
      </div>

      <!-- 扫描阶段 -->
      <div v-if="currentStep === 'scanning'" class="scanning-stage">
        <ProgressMonitor
          ref="progressMonitorRef"
          :is-scanning="isDetecting"
          :scan-id="currentScanId"
          :show-logs="true"
          @pause="pauseDetection"
          @cancel="cancelDetection"
          @export-results="exportResults"
          @export-logs="exportLogs"
          @preview-apps="previewApps"
        />
      </div>

      <!-- 结果阶段 -->
      <div v-if="currentStep === 'results'" class="results-stage">
        <el-card shadow="hover">
          <template #header>
            <div class="results-header">
              <span>
                <el-icon><SuccessFilled /></el-icon>
                检测结果 ({{ detectedApps.length }} 个应用)
              </span>
              <div class="results-actions">
                <el-button @click="refreshAddedStatus">
                  <el-icon><Refresh /></el-icon>
                  刷新状态
                </el-button>
                <el-button @click="exportResults">
                  <el-icon><Download /></el-icon>
                  导出结果
                </el-button>
                <el-button @click="startNewScan">
                  <el-icon><RefreshRight /></el-icon>
                  新扫描
                </el-button>
              </div>
            </div>
          </template>

          
          <!-- 检测统计 -->
          <div class="detection-stats">
            <el-row :gutter="16">
              <el-col :span="4">
                <el-statistic
                  title="发现应用"
                  :value="detectionResults.totalApps"
                  :value-style="{ color: '#67C23A' }"
                />
              </el-col>
              <el-col :span="4">
                <el-statistic
                  title="有效应用"
                  :value="detectionResults.validApps"
                  :value-style="{ color: '#409EFF' }"
                />
              </el-col>
              <el-col :span="4">
                <el-statistic
                  title="已添加"
                  :value="detectionResults.addedApps || 0"
                  :value-style="{ color: '#67C23A' }"
                />
              </el-col>
              <el-col :span="4">
                <el-statistic
                  title="未添加"
                  :value="detectionResults.notAddedApps || 0"
                  :value-style="{ color: '#909399' }"
                />
              </el-col>
              <el-col :span="4">
                <el-statistic
                  title="需要检查"
                  :value="detectionResults.warningApps"
                  :value-style="{ color: '#E6A23C' }"
                />
              </el-col>
              <el-col :span="4">
                <el-statistic
                  title="检测错误"
                  :value="detectionResults.errorApps"
                  :value-style="{ color: '#F56C6C' }"
                />
              </el-col>
            </el-row>
          </div>

          <!-- 应用表格 -->
          <div class="apps-table">
            <div class="table-controls">
              <el-input
                v-model="searchQuery"
                placeholder="搜索应用..."
                style="width: 200px; margin-right: 12px;"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>

              <el-select
                v-model="statusFilter"
                placeholder="状态筛选"
                style="width: 120px; margin-right: 12px;"
              >
                <el-option label="全部" value="all" />
                <el-option label="未添加" value="not_added" />
                <el-option label="已添加" value="added" />
              </el-select>

              <el-button
                type="primary"
                @click="batchAddApps"
                :disabled="availableForBatchAdd.length === 0"
              >
                批量添加 ({{ availableForBatchAdd.length }})
              </el-button>

              <el-button
                v-if="detectionResults.addedApps && detectionResults.addedApps > 0"
                type="info"
                plain
                @click="statusFilter = 'added'"
              >
                查看已添加 ({{ detectionResults.addedApps }})
              </el-button>

              <el-tooltip content="快捷键：Ctrl+R 刷新状态，Ctrl+A 全选未添加，Esc 清空选择" placement="top">
                <el-button type="text" size="small" style="color: #909399;">
                  <el-icon><QuestionFilled /></el-icon>
                  快捷键
                </el-button>
              </el-tooltip>
            </div>

            <el-table
              :data="filteredApps"
              @selection-change="handleSelectionChange"
              :row-class-name="getRowClassName"
              style="width: 100%"
            >
              <el-table-column type="selection" width="55" />
              <el-table-column prop="name" label="应用名称" width="180" />
              <el-table-column prop="techStack" label="技术栈" width="120">
                <template #default="{ row }">
                  <el-tag>{{ row.techStack }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="addedStatus" label="状态" width="100">
                <template #default="{ row }">
                  <el-tag
                    v-if="row.isAdded"
                    type="success"
                    size="small"
                    effect="light"
                  >
                    <el-icon><Check /></el-icon>
                    已添加
                  </el-tag>
                  <el-tag
                    v-else
                    type="info"
                    size="small"
                    effect="plain"
                  >
                    未添加
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="directory" label="路径" min-width="200" />
              <el-table-column prop="suggestedPort" label="建议端口" width="180">
                <template #default="{ row }">
                  <div class="ports-display">
                    <template v-if="!row.ports || row.ports.length <= 1">
                      <el-tag size="small" type="info">{{ row.suggestedPort || 'N/A' }}</el-tag>
                    </template>
                    <template v-else>
                      <div class="multiple-ports">
                        <el-tag
                          v-for="port in row.ports"
                          :key="port.port"
                          size="small"
                          :color="getPortTypeColor(port.type)"
                          effect="light"
                          class="port-tag"
                        >
                          <span class="port-icon">{{ getPortTypeIcon(port.type) }}</span>
                          {{ port.port }}
                        </el-tag>
                      </div>
                      <div class="ports-summary">
                        {{ formatPortsForDisplay(row) }}
                      </div>
                    </template>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="confidence" label="置信度" width="100">
                <template #default="{ row }">
                  <el-progress 
                    :percentage="row.confidence" 
                    :stroke-width="6"
                    :show-text="false"
                  />
                  <span class="confidence-text">{{ row.confidence }}%</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200">
                <template #default="{ row }">
                  <el-button
                    size="small"
                    @click="previewApp(row)"
                  >
                    预览
                  </el-button>

                  <el-button
                    v-if="!row.isAdded"
                    size="small"
                    type="primary"
                    @click="addSingleApp(row)"
                  >
                    添加
                  </el-button>

                  <el-dropdown v-else>
                    <el-button size="small" type="success">
                      已添加 <el-icon><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item @click="updateExistingApp(row.addedAppId, row)">
                          <el-icon><Refresh /></el-icon>
                          更新应用
                        </el-dropdown-item>
                        <el-dropdown-item @click="viewInManagement(row.addedAppId)">
                          <el-icon><View /></el-icon>
                          查看详情
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 高级配置对话框 -->
    <el-dialog 
      v-model="advancedConfigVisible"
      title="高级配置"
      width="80%"
      :close-on-click-modal="false"
    >
      <AdvancedConfig
        ref="advancedConfigRef"
        @config-change="onAdvancedConfigChange"
        @apply-config="applyAdvancedConfig"
      />
      
      <template #footer>
        <el-button @click="advancedConfigVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAdvancedConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- 应用预览对话框 -->
    <el-dialog
      v-model="appPreviewVisible"
      :title="previewAppData?.name || '应用预览'"
      width="60%"
    >
      <div v-if="previewAppData" class="app-preview-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="应用名称">{{ previewAppData.name }}</el-descriptions-item>
          <el-descriptions-item label="技术栈">{{ previewAppData.techStack }}</el-descriptions-item>
          <el-descriptions-item label="目录路径" :span="2">{{ previewAppData.directory }}</el-descriptions-item>
          <el-descriptions-item label="建议端口">{{ previewAppData.suggestedPort }}</el-descriptions-item>
          <el-descriptions-item label="置信度">{{ previewAppData.confidence }}%</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <!-- 端口选择对话框 -->
    <el-dialog
      v-model="portSelectionVisible"
      :title="`配置应用端口 - ${portSelectionApp?.name || ''}`"
      width="600px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <div v-if="portSelectionApp" class="port-selection-content">
        <el-alert
          title="端口配置"
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 20px;"
        >
          <template #default>
            <p>系统已为您的应用自动分配端口，您可以查看并修改这些端口配置。</p>
            <p>
              <strong>端口范围：</strong>
              前端 {{ frontendPortRange.start }}-{{ frontendPortRange.end }}，
              后端 {{ backendPortRange.start }}-{{ backendPortRange.end }}
            </p>
          </template>
        </el-alert>

        <el-form :model="portSelectionForm" label-width="100px">
          <el-form-item label="前端端口">
            <div class="port-input-group">
              <el-input-number
                v-model="portSelectionForm.frontend_port"
                :min="frontendPortRange.start"
                :max="frontendPortRange.end"
                :step="1"
                placeholder="前端端口"
                style="width: 200px;"
                @change="onPortChange"
              />
              <el-button
                size="small"
                @click="autoAllocatePort('frontend')"
                :loading="checkingPorts"
                style="margin-left: 10px;"
              >
                自动分配
              </el-button>
            </div>
            <div v-if="portConflicts.frontend" class="port-conflict-warning">
              <el-alert
                :title="portConflicts.frontend"
                type="warning"
                :closable="false"
                show-icon
                size="small"
                style="margin-top: 8px;"
              />
            </div>
          </el-form-item>

          <el-form-item label="后端端口">
            <div class="port-input-group">
              <el-input-number
                v-model="portSelectionForm.backend_port"
                :min="backendPortRange.start"
                :max="backendPortRange.end"
                :step="1"
                placeholder="后端端口"
                style="width: 200px;"
                @change="onPortChange"
              />
              <el-button
                size="small"
                @click="autoAllocatePort('backend')"
                :loading="checkingPorts"
                style="margin-left: 10px;"
              >
                自动分配
              </el-button>
            </div>
            <div v-if="portConflicts.backend" class="port-conflict-warning">
              <el-alert
                :title="portConflicts.backend"
                type="warning"
                :closable="false"
                show-icon
                size="small"
                style="margin-top: 8px;"
              />
            </div>
          </el-form-item>
        </el-form>

        <div class="port-info-section">
          <h4>应用信息</h4>
          <el-descriptions :column="1" size="small" border>
            <el-descriptions-item label="应用名称">{{ portSelectionApp.name }}</el-descriptions-item>
            <el-descriptions-item label="技术栈">{{ portSelectionApp.techStack }}</el-descriptions-item>
            <el-descriptions-item label="目录">{{ portSelectionApp.directory }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="cancelPortSelection">取消</el-button>
          <el-button
            type="primary"
            @click="confirmPortSelection"
            :loading="checkingPorts"
          >
            确认添加
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
// @ts-ignore - TypeScript 缓存问题，useRouter 在其他文件中可正常导入
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search,
  Clock,
  QuestionFilled,
  FolderOpened,
  Setting,
  Tools,
  SuccessFilled,
  Download,
  RefreshRight,
  View,
  ArrowLeft,
  ArrowRight,
  Check,
  ArrowDown,
  Refresh
} from '@element-plus/icons-vue'

// 导入组件
import PathSelector from '@/components/detection/PathSelector.vue'
// 导入 store
import { usePortConfigStore } from '@/stores/portConfig'
import ProgressMonitor from '@/components/detection/ProgressMonitor.vue'
import AdvancedConfig from '@/components/detection/AdvancedConfig.vue'

// 导入服务
import { smartPortAllocator } from '@/services/smartPortAllocator'
import { appsApiService } from '@/services/appsApi'
import type { ImportCandidate, BatchImportResult } from '@/services/appsApi'
import { filesystemApiService } from '@/services'
import { getPortTypeColor, getPortTypeIcon } from '@/types/app'
import { getStoredAccessToken } from '@/utils/authStorage'
import { getNativeDirectoryPickerFailureMessage } from '@/utils/directoryPicker'

// 路由相关
const router = useRouter()

// 键盘快捷键支持
onMounted(() => {
  const handleKeydown = (event: KeyboardEvent) => {
    // Ctrl/Cmd + R: 刷新状态
    if ((event.ctrlKey || event.metaKey) && event.key === 'r' && currentStep.value === 'results') {
      event.preventDefault()
      refreshAddedStatus()
    }
    // Ctrl/Cmd + A: 全选未添加的应用
    if ((event.ctrlKey || event.metaKey) && event.key === 'a' && currentStep.value === 'results') {
      event.preventDefault()
      const notAddedApps = filteredApps.value.filter(app => !app.isAdded)
      selectedApps.value = notAddedApps
    }
    // Escape: 清空选择
    if (event.key === 'Escape' && currentStep.value === 'results') {
      selectedApps.value = []
    }
  }

  document.addEventListener('keydown', handleKeydown)

  // 清理事件监听器
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
})

// 端口配置 store
const portConfigStore = usePortConfigStore()
const DEFAULT_FRONTEND_PORT_RANGE = { start: 3001, end: 3100 }
const DEFAULT_BACKEND_PORT_RANGE = { start: 8001, end: 8100 }

const frontendPortRange = computed(() => {
  const config = portConfigStore.portConfig
  const start = Number(config?.frontendRange?.start)
  const end = Number(config?.frontendRange?.end)

  if (Number.isInteger(start) && Number.isInteger(end) && start < end) {
    return { start, end }
  }

  return DEFAULT_FRONTEND_PORT_RANGE
})

const backendPortRange = computed(() => {
  const config = portConfigStore.portConfig
  const start = Number(config?.backendRange?.start)
  const end = Number(config?.backendRange?.end)

  if (Number.isInteger(start) && Number.isInteger(end) && start < end) {
    return { start, end }
  }

  return DEFAULT_BACKEND_PORT_RANGE
})

const getPortRangeByType = (type: 'frontend' | 'backend') => {
  return type === 'frontend' ? frontendPortRange.value : backendPortRange.value
}

const isPortInRange = (port: number, type: 'frontend' | 'backend') => {
  const range = getPortRangeByType(type)
  return port >= range.start && port <= range.end
}

const resolveInitialPort = (
  port: number | undefined,
  type: 'frontend' | 'backend'
): number => {
  if (typeof port !== 'number' || port <= 0) {
    return 0
  }

  if (isPortInRange(port, type)) {
    return port
  }

  return allocatePortForComponent(type, 0, true)
}

// 端口分配工具函数
const allocatedPorts = new Set<number>() // 跟踪已分配的端口

const allocatePortForComponent = (
  componentType: 'frontend' | 'backend' | 'api' | 'websocket' | 'database',
  baseIndex: number = 0,
  avoidConflicts: boolean = true
): number => {
  // 从配置中获取端口范围
  const getPortRanges = () => {
    return {
      frontend: { ...frontendPortRange.value },
      backend: { ...backendPortRange.value },
      api: {
        start: backendPortRange.value.start + 1000,
        end: backendPortRange.value.end + 1000
      },
      websocket: {
        start: backendPortRange.value.start + 2000,
        end: backendPortRange.value.end + 2000
      },
      database: {
        start: backendPortRange.value.start + 3000,
        end: backendPortRange.value.end + 3000
      }
    }
  }

  const portRanges = getPortRanges()
  
  const range = portRanges[componentType]
  let port = range.start + (baseIndex % (range.end - range.start))
  
  // 如果启用冲突避免，寻找未使用的端口
  if (avoidConflicts) {
    let attempts = 0
    while (allocatedPorts.has(port) && attempts < 100) {
      port = range.start + ((baseIndex + attempts + 1) % (range.end - range.start))
      attempts++
    }
  }
  
  allocatedPorts.add(port)
  return port
}

// 重置端口分配器（在新的扫描开始时调用）
const resetPortAllocator = () => {
  allocatedPorts.clear()
}

// 预分配常用端口，避免冲突
const preAllocateCommonPorts = () => {
  // 预分配一些常用的开发端口，避免分配时冲突
  const commonPorts = [3000, 3001, 4000, 4001, 5000, 8000, 8080, 9000]
  const reservedPorts = [22, 80, 443, 993, 995] // 系统保留端口

  // 使用concat方法替代扩展运算符，避免编译问题
  commonPorts.concat(reservedPorts).forEach(port => {
    allocatedPorts.add(port)
  })
}

// 获取本地端口分配摘要信息
const getLocalPortAllocationSummary = () => {
  const summary = {
    frontend: [] as number[],
    backend: [] as number[],
    api: [] as number[],
    websocket: [] as number[],
    database: [] as number[],
    total: allocatedPorts.size
  }
  
  Array.from(allocatedPorts).forEach(port => {
    if (port >= 3000 && port <= 3999) summary.frontend.push(port)
    else if (port >= 4000 && port <= 4999) summary.backend.push(port)
    else if (port >= 5000 && port <= 5999) summary.api.push(port)
    else if (port >= 6000 && port <= 6999) summary.websocket.push(port)
    else if (port >= 7000 && port <= 7999) summary.database.push(port)
  })
  
  return summary
}

// 格式化端口显示
const formatPortsForDisplay = (app: DetectedAppResult): string => {
  if (!app.ports || app.ports.length === 0) {
    return app.suggestedPort?.toString() || 'N/A'
  }
  
  if (app.ports.length === 1) {
    return app.ports[0].port.toString()
  }
  
  // 优化的多端口显示格式
  const portStrings = app.ports
    .sort((a, b) => {
      // 按类型排序：frontend -> backend -> api -> websocket -> database
      const typeOrder = { frontend: 0, backend: 1, api: 2, websocket: 3, database: 4 }
      const aOrder = typeOrder[a.type] ?? 5
      const bOrder = typeOrder[b.type] ?? 5
      return aOrder - bOrder
    })
    .map(p => {
      const typeMap: Record<string, string> = {
        frontend: '前端',
        backend: '后端',
        api: 'API',
        websocket: 'WS',
        database: '数据库'
      }
      const typeName = typeMap[p.type] || p.type
      const portWithProtocol = p.protocol === 'https' ? `${p.port}(HTTPS)` : p.port.toString()
      return `${typeName}:${portWithProtocol}`
    })
  
  return portStrings.join(', ')
}

// 从API获取端口分配摘要信息
const fetchPortAllocationSummary = async (scanId: string) => {
  try {
    const response = await fetch(`/api/v2/detection/sessions/${scanId}/port-allocation`, {
      headers: {
        'Authorization': `Bearer ${getStoredAccessToken() || ''}`
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      return data.portAllocation
    }
  } catch (error) {
    console.warn('获取端口分配摘要失败:', error)
  }
  return null
}

// 接口定义
interface DetectedAppResult {
  id: string
  name: string
  techStack: string
  directory: string
  suggestedPort: number  // 主端口（向后兼容）
  ports?: Array<{        // 完整端口信息
    port: number
    type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database'
    protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp'
    description?: string
    isMain?: boolean
  }>
  confidence: number
  status: 'valid' | 'warning' | 'error'
  description?: string
  // 新增字段：已添加状态标识
  isAdded?: boolean           // 是否已添加到门户系统
  addedAppId?: string        // 已添加应用的ID
  addedAppName?: string      // 已添加应用的名称
  // 全栈项目相关字段
  isFullStack?: boolean      // 是否为全栈项目
  fullstackInfo?: {          // 全栈项目详细信息
    originalPorts?: {
      frontend?: number[]
      backend?: number[]
    }
    portAllocation?: {
      ports?: {
        frontend?: number
        backend?: number
      }
    }
    [key: string]: any
  }
}

interface DetectionResults {
  totalApps: number
  validApps: number
  warningApps: number
  errorApps: number
  // 新增字段：已添加状态统计
  addedApps?: number      // 已添加的应用数量
  notAddedApps?: number   // 未添加的应用数量
}

// 响应式数据
const currentStep = ref<'config' | 'scanning' | 'results'>('config')
const configStep = ref(0) // 配置阶段的步骤：0-路径选择, 1-检测配置, 2-确认开始
const isDetecting = ref(false)
const isStarting = ref(false)
const isPathValid = ref(false)
const currentScanId = ref('')
const mode = ref<'single' | 'multiple' | 'workspace'>('multiple') // 扫描模式

// 快速开始相关
const quickStartPath = ref('D:\\My Programs') // 快速开始路径，默认值
const hasLastConfig = ref(false) // 是否有保存的配置

// ========== 扫描模式相关 ==========
const selectedScanMode = ref<'shallow' | 'fast' | 'standard' | 'full'>('standard')

const scanModeOptions = [
  {
    value: 'shallow',
    title: '浅层扫描',
    desc: '仅扫描直接子目录，适合整理好的项目文件夹',
    icon: '📁',
    depth: 1,
    excludeCount: 6,
    speed: '最快'
  },
  {
    value: 'fast',
    title: '快速扫描',
    desc: '检测两层目录，速度快',
    icon: '⚡',
    depth: 2,
    excludeCount: 6,
    speed: '极快'
  },
  {
    value: 'standard',
    title: '标准扫描',
    desc: '推荐模式，平衡速度与准确性',
    icon: '📊',
    depth: 3,
    excludeCount: 4,
    speed: '适中'
  },
  {
    value: 'full',
    title: '完整扫描',
    desc: '深度检测所有子目录',
    icon: '🔍',
    depth: 5,
    excludeCount: 2,
    speed: '较慢'
  }
]

// 当前模式配置（计算属性）
const currentModeConfig = computed(() => {
  const mode = scanModeOptions.find(m => m.value === selectedScanMode.value)
  return {
    depth: mode?.depth || 3,
    excludeCount: mode?.excludeCount || 4,
    speed: mode?.speed || '适中'
  }
})

// 选择扫描模式
const selectScanMode = (mode: string) => {
  selectedScanMode.value = mode as 'shallow' | 'fast' | 'standard' | 'full'
  // 根据模式更新基础配置
  const modeConfig = scanModeOptions.find(m => m.value === mode)
  if (modeConfig) {
    basicConfig.value.defaultMaxDepth = modeConfig.depth
  }
  ElMessage.success(`已切换到${modeConfig?.title || '标准扫描'}模式`)
}

// 配置数据
const selectedPreset = ref('balanced')
const selectedPaths = ref<string[]>([])
const basicConfig = ref({
  portStrategy: 'smart',
  concurrency: 3,
  defaultMaxDepth: 4 // 默认扫描深度，用于估算计算
})

// 新增配置数据
const portAllocationStrategy = ref('smart')
const performanceConfig = ref({
  concurrency: 3,
  memoryLimit: '1GB'
})

const presetOptions = ref([
  {
    value: 'performance',
    title: '性能优先',
    desc: '高并发快速检测，适合大型项目扫描',
    icon: '🚀',
    specs: ['并发数: 5个', '智能端口分配', '实时预览结果']
  },
  {
    value: 'accuracy',
    title: '精确检测',
    desc: '详细分析每个应用，确保检测准确性',
    icon: '🎯',
    specs: ['并发数: 2个', '深度技术栈分析', '完整依赖检查']
  },
  {
    value: 'balanced',
    title: '平衡模式',
    desc: '兼顾速度和准确性的最佳选择',
    icon: '⚖️',
    specs: ['并发数: 3个', '智能优先级', '适中检测时间']
  },
  {
    value: 'custom',
    title: '自定义配置',
    desc: '完全自定义检测策略和参数',
    icon: '🛠️',
    specs: ['所有参数可调', '高级选项开放', '专业用户推荐']
  }
])

const techStackPriorities = ref([
  { name: 'React', icon: '⚛️', priority: '高', enabled: true },
  { name: 'Vue', icon: '🟢', priority: '高', enabled: true },
  { name: 'Angular', icon: '🔺', priority: '中', enabled: true },
  { name: 'Node.js', icon: '📗', priority: '高', enabled: true },
  { name: 'Express', icon: '⚡', priority: '中', enabled: true },
  { name: 'Next.js', icon: '▲', priority: '中', enabled: true },
  { name: 'Nuxt.js', icon: '💚', priority: '中', enabled: true },
  { name: 'Svelte', icon: '🧡', priority: '低', enabled: false },
  { name: 'Django', icon: '🐍', priority: '中', enabled: true },
  { name: 'Spring', icon: '🌱', priority: '低', enabled: false }
])

const portStrategies = ref([
  {
    value: 'smart',
    icon: '🧠',
    title: '智能分配 (推荐)',
    desc: '根据技术栈自动选择最佳端口'
  },
  {
    value: 'sequential',
    icon: '📋',
    title: '顺序分配',
    desc: '按顺序分配可用端口'
  },
  {
    value: 'range',
    icon: '📊',
    title: '范围分配',
    desc: '在指定端口范围内分配'
  }
])

// 标签映射
const presetLabels: Record<string, string> = {
  performance: '性能优先',
  accuracy: '精确检测',
  balanced: '平衡模式',
  custom: '自定义配置'
}

const portStrategyLabels: Record<string, string> = {
  smart: '🧠 智能分配',
  sequential: '📋 顺序分配',
  range: '📊 范围分配'
}

// 高级配置
const advancedConfigVisible = ref(false)
const advancedConfigRef = ref()

// 检测结果
const detectedApps = ref<DetectedAppResult[]>([])
const detectionResults = ref<DetectionResults>({
  totalApps: 0,
  validApps: 0,
  warningApps: 0,
  errorApps: 0
})

// 应用列表控制
const searchQuery = ref('')
const selectedApps = ref<DetectedAppResult[]>([])
const statusFilter = ref('all') // 状态过滤：all, added, not_added

// 对话框
const appPreviewVisible = ref(false)
const previewAppData = ref<DetectedAppResult | null>(null)

// 计算属性
const estimatedFiles = computed(() => {
  // 根据路径数量和深度估算文件数
  if (selectedPaths.value.length === 0) return 0
  
  // 获取平均扫描深度（从第一步路径配置中获取，如果没有则使用默认值）
  const avgDepth = basicConfig.value.defaultMaxDepth || 4
  const baseFiles = selectedPaths.value.length * 500
  const depthMultiplier = Math.pow(avgDepth, 1.2)
  return Math.round(baseFiles * depthMultiplier)
})

const estimatedTime = computed(() => {
  const timeInSeconds = estimatedTimeSeconds.value
  if (timeInSeconds < 60) return `${timeInSeconds}s`
  const minutes = Math.floor(timeInSeconds / 60)
  const seconds = timeInSeconds % 60
  return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`
})

const estimatedTimeSeconds = computed(() => {
  // 根据文件数量和并发数估算时间
  const files = estimatedFiles.value
  if (files === 0) return 5
  
  const concurrency = performanceConfig.value.concurrency || 3
  const filesPerSecond = concurrency * 50
  return Math.max(Math.ceil(files / filesPerSecond), 5)
})

const estimatedApps = computed(() => {
  // 估算可能发现的应用数量
  const files = estimatedFiles.value
  if (files === 0) return 0
  
  // 基于路径数量和启用的技术栈数量估算
  const pathCount = selectedPaths.value.length || 1
  const enabledTechCount = enabledTechStacks.value.length || 1
  
  // 每个路径预计1-3个应用，取决于启用的技术栈数量
  const appsPerPath = Math.min(Math.ceil(enabledTechCount / 2), 3)
  return Math.max(pathCount * appsPerPath, 1)
})

const canProceedToNextStep = computed(() => {
  switch (configStep.value) {
    case 0: // 路径选择步骤
      return isPathValid.value && selectedPaths.value.length > 0
    case 1: // 检测配置步骤
      return true // 配置步骤总是可以继续
    case 2: // 确认开始步骤
      return isPathValid.value
    default:
      return false
  }
})

const enabledTechStacks = computed(() => {
  return techStackPriorities.value.filter(tech => tech.enabled)
})

const filteredApps = computed(() => {
  let apps = detectedApps.value

  // 搜索过滤
  if (searchQuery.value) {
    apps = apps.filter(app =>
      app.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      app.techStack.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      app.directory.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  }

  // 状态过滤
  if (statusFilter.value === 'added') {
    apps = apps.filter(app => app.isAdded)
  } else if (statusFilter.value === 'not_added') {
    apps = apps.filter(app => !app.isAdded)
  }

  return apps
})

// 可用于批量添加的应用（排除已添加的）
const availableForBatchAdd = computed(() => {
  return selectedApps.value.filter(app => !app.isAdded)
})

// 方法
const onPathValidate = (isValid: boolean) => {
  isPathValid.value = isValid
}

const updateSelectedPaths = (paths: any[]) => {
  // 提取路径并过滤空值
  const extractedPaths = paths.map(p => p.path).filter(Boolean)

  // 防止重复更新相同的路径
  if (JSON.stringify(selectedPaths.value) === JSON.stringify(extractedPaths)) {
    return
  }

  selectedPaths.value = extractedPaths

  console.log('PathSelector更新路径:', extractedPaths)
}

const selectPreset = (preset: string) => {
  selectedPreset.value = preset
  applyPreset(preset)
}

const applyPreset = (preset: string) => {
  switch (preset) {
    case 'performance':
      // 性能优先：高并发，智能端口分配
      basicConfig.value.portStrategy = 'smart'
      basicConfig.value.concurrency = 5
      performanceConfig.value.concurrency = 5
      performanceConfig.value.memoryLimit = '2GB'
      // 启用主流高优先级技术栈
      techStackPriorities.value.forEach(tech => {
        tech.enabled = ['React', 'Vue', 'Node.js', 'Next.js'].includes(tech.name)
      })
      break
    case 'accuracy':
      // 精确检测：低并发，深度分析
      basicConfig.value.portStrategy = 'smart'
      basicConfig.value.concurrency = 2
      performanceConfig.value.concurrency = 2
      performanceConfig.value.memoryLimit = '4GB'
      // 启用所有技术栈
      techStackPriorities.value.forEach(tech => {
        tech.enabled = true
      })
      break
    case 'balanced':
      // 平衡模式：中等并发，智能优先级
      basicConfig.value.portStrategy = 'smart'
      basicConfig.value.concurrency = 3
      performanceConfig.value.concurrency = 3
      performanceConfig.value.memoryLimit = '1GB'
      // 启用高和中优先级技术栈
      techStackPriorities.value.forEach(tech => {
        tech.enabled = tech.priority !== '低'
      })
      break
    case 'custom':
      // 自定义配置：不做任何修改
      break
  }
}

const toggleTechStack = (techName: string) => {
  const tech = techStackPriorities.value.find(t => t.name === techName)
  if (tech) {
    tech.enabled = !tech.enabled
  }
}

const applyPresetToPaths = () => {
  if (selectedPreset.value === 'custom') return
  
  // 这里应该调用PathSelector组件的方法来批量更新路径配置
  // 由于我们需要与PathSelector组件通信，这里只是演示逻辑
  ElMessage.success(`已将${presetLabels[selectedPreset.value]}应用到所有路径`)
}

const showAdvancedConfig = () => {
  advancedConfigVisible.value = true
}

const onAdvancedConfigChange = (config: any) => {
  console.log('Advanced config changed:', config)
}

const applyAdvancedConfig = (config: any) => {
  console.log('Applied advanced config:', config)
}

const saveAdvancedConfig = () => {
  advancedConfigVisible.value = false
  ElMessage.success('高级配置已保存')
}

const isAbsolutePathFormat = (path: string): boolean => {
  if (!path || path.trim() === '') return false
  const windowsPathRegex = /^[A-Za-z]:[\\\/].*$/
  const unixPathRegex = /^\/.*$/
  return windowsPathRegex.test(path) || unixPathRegex.test(path)
}

// 快速开始 - 选择文件夹
const selectQuickStartFolder = async () => {
  try {
    // 优先使用后端原生目录选择（可直接返回绝对路径）
    try {
      const startPath = isAbsolutePathFormat(quickStartPath.value) ? quickStartPath.value.trim() : undefined
      const nativeResponse = await filesystemApiService.selectFolder(startPath, true)

      if (nativeResponse.success && nativeResponse.data) {
        if (nativeResponse.data.cancelled) {
          ElMessage.info('用户取消了文件夹选择')
          return
        }

        const nativePath = String(nativeResponse.data.path || '').trim()
        if (isAbsolutePathFormat(nativePath)) {
          quickStartPath.value = nativePath
          ElMessage.success(`已选择文件夹: ${nativePath}`)
          return
        }
      }
    } catch (nativeError) {
      console.warn('后端原生文件夹选择失败:', nativeError)
      ElMessage.warning(getNativeDirectoryPickerFailureMessage(nativeError))
      return
    }
    ElMessage.warning('当前环境无法自动获取绝对路径，请手动输入完整路径')
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      ElMessage.error('文件夹选择失败')
    }
  }
}

// 跳过第3步确认，直接开始检测
const skipToStartDetection = async () => {
  if (!isPathValid.value && selectedPaths.value.length === 0) {
    ElMessage.warning('请先配置有效的扫描路径')
    return
  }
  
  // 保存配置
  saveLastConfig()
  
  ElMessage.info('跳过确认步骤，直接开始检测...')
  
  // 直接开始检测
  await startDetection()
}

// 快速开始 - 使用当前扫描模式配置立即开始检测
const quickStart = async () => {
  if (!quickStartPath.value) {
    ElMessage.warning('请先输入或选择扫描路径')
    return
  }
  
  // 使用当前选择的扫描模式配置
  selectedPaths.value = [quickStartPath.value]
  selectedPreset.value = 'balanced'
  portAllocationStrategy.value = 'smart'
  performanceConfig.value = {
    concurrency: 3,
    memoryLimit: '1GB'
  }
  // 使用当前扫描模式的深度配置
  basicConfig.value.defaultMaxDepth = currentModeConfig.value.depth
  isPathValid.value = true
  
  // 保存到本地存储（配置记忆）
  saveLastConfig()
  
  const modeName = scanModeOptions.find(m => m.value === selectedScanMode.value)?.title || '标准扫描'
  ElMessage.info(`使用${modeName}模式开始检测（深度${currentModeConfig.value.depth}层）...`)
  
  // 直接开始检测
  await startDetection()
}

const startDetection = async () => {
  if (!isPathValid.value && selectedPaths.value.length === 0) {
    ElMessage.warning('请先配置有效的扫描路径')
    return
  }
  
  isStarting.value = true
  
  try {
    currentStep.value = 'scanning'
    currentScanId.value = Date.now().toString()
    resetPortAllocator() // 重置端口分配器
    isDetecting.value = true
    
    // 执行真实检测
    await performRealDetection()
    
    currentStep.value = 'results'
    ElMessage.success('应用检测完成！')
    
  } catch (error) {
    ElMessage.error('检测过程中出现错误')
    currentStep.value = 'config'
  } finally {
    isDetecting.value = false
    isStarting.value = false
  }
}

const performRealDetection = async (): Promise<void> => {
  try {
    // 使用绝对路径，确保后端能正确识别
    const pathsToScan = selectedPaths.value.length > 0 ? selectedPaths.value : ['D:\\My Programs']
    
    console.log('将要扫描的路径列表:', pathsToScan)

    const detectedAppsAll: DetectedAppResult[] = []

    // 使用批量扫描API（优化后）
    if (pathsToScan.length > 1) {
      console.log('使用批量扫描API')
      
      // 调用批量扫描API
      const batchResponse = await fetch('/api/v2/detection/batch-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getStoredAccessToken() || ''}`
        },
        body: JSON.stringify({
          paths: pathsToScan.map(p => p.replace(/\\/g, '/')),
          mode: mode.value,
          maxConcurrency: performanceConfig.value.concurrency || 3,
          commonConfig: {
            maxDepth: currentModeConfig.value.depth,  // 使用当前扫描模式的深度
            excludePatterns: ['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'],
            timeoutMs: 60000
          }
        })
      })

      if (!batchResponse.ok) {
        throw new Error(`批量扫描启动失败: ${batchResponse.status}`)
      }

      const batchResult = await batchResponse.json()
      const { batchId, sessionIds } = batchResult.data

      console.log(`批量扫描已启动，批次ID: ${batchId}，会话数: ${sessionIds.length}`)

      // 轮询批次状态
      let batchComplete = false
      let attempts = 0
      const maxAttempts = 60 // 最多等待5分钟

      while (!batchComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)) // 等待5秒
        attempts++

        const statusResponse = await fetch(`/api/v2/detection/batch/${batchId}`, {
          headers: {
            'Authorization': `Bearer ${getStoredAccessToken() || ''}`
          }
        })

        if (!statusResponse.ok) {
          throw new Error(`获取批次状态失败: ${statusResponse.status}`)
        }

        const statusResult = await statusResponse.json()
        const batch = statusResult.data

        console.log(`批次状态: ${batch.status}`, batch.summary)

        if (batch.status === 'completed' || batch.status === 'failed') {
          batchComplete = true

          // 获取所有会话的结果
          for (const sessionId of sessionIds) {
            try {
              const projectsResponse = await fetch(`/api/v2/detection/sessions/${sessionId}/enhanced-projects`, {
                headers: {
                  'Authorization': `Bearer ${getStoredAccessToken() || ''}`
                }
              })

              if (projectsResponse.ok) {
                const projectsData = await projectsResponse.json()
                const aggregatedProjects = projectsData.projects || []

                // 转换项目格式
                aggregatedProjects.forEach((project: any, index: number) => {
                  detectedAppsAll.push(convertProjectToDetectedApp(project, index))
                })
              }
            } catch (error) {
              console.error(`获取会话 ${sessionId} 结果失败:`, error)
            }
          }
        }
      }

      if (!batchComplete) {
        throw new Error('批量扫描超时')
      }

    } else {
      // 单个路径使用原有逻辑
      console.log('使用单个路径扫描')
      const workspacePath = pathsToScan[0]
      
      try {
        // 调用后端真实扫描API
        console.log(`开始扫描路径: ${workspacePath}`)
        
        // 获取当前扫描模式的深度配置
        const scanDepth = currentModeConfig.value.depth
        
        const requestBody = {
          workspacePath: workspacePath.replace(/\\/g, '/'),  // 将反斜杠转换为正斜杠
          config: {
            maxDepth: scanDepth  // 传递扫描深度配置
          }
        }
        
        console.log('发送扫描请求', { workspacePath, requestBody, scanDepth })
        
        const startResponse = await fetch('/api/v2/detection/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getStoredAccessToken() || ''}`
          },
          body: JSON.stringify(requestBody)
        })

        if (!startResponse.ok) {
          throw new Error(`扫描启动失败: ${startResponse.status}`)
        }

        const startResult = await startResponse.json()
        const scanId = startResult.sessionId

        // 轮询扫描状态直到完成
        console.log(`扫描ID: ${scanId}，等待扫描完成...`)
        
        let scanComplete = false
        let attempts = 0
        const maxAttempts = 30 // 最多等待30次（约1分钟）

        while (!scanComplete && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // 等待2秒
          attempts++

          const statusResponse = await fetch(`/api/v2/detection/sessions/${scanId}`, {
            headers: {
              'Authorization': `Bearer ${getStoredAccessToken() || ''}`
            }
          })

          if (!statusResponse.ok) {
            throw new Error(`获取扫描状态失败: ${statusResponse.status}`)
          }

          const statusResult = await statusResponse.json()
          const session = statusResult.session

          console.log(`扫描状态: ${session.state}`)

          if (session.state === 'completed') {
            scanComplete = true
            
            // 获取增强聚合项目（支持全栈检测）
            const projectsResponse = await fetch(`/api/v2/detection/sessions/${scanId}/enhanced-projects`, {
              headers: {
                'Authorization': `Bearer ${getStoredAccessToken() || ''}`
              }
            })

            if (projectsResponse.ok) {
              const projectsData = await projectsResponse.json()
              const aggregatedProjects = projectsData.projects || []

              console.log(`路径 ${workspacePath} 扫描完成，聚合后发现 ${aggregatedProjects.length} 个项目`)

              // 转换聚合项目格式到前端格式
              aggregatedProjects.forEach((project: any, index: number) => {
                console.log('处理项目:', project.name, project.type)
                console.log('项目端口信息:', {
                  portAllocation: project.fullstackInfo?.portAllocation,
                  originalPorts: project.fullstackInfo?.originalPorts,
                  frontendOriginalPort: project.components?.frontend?.originalPort,
                  backendOriginalPort: project.components?.backend?.originalPort
                })

                // 从项目组件中提取所有端口信息
                const ports: Array<{
                  port: number
                  type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database'
                  protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp'
                  description?: string
                  isMain?: boolean
                }> = []

                let suggestedPort = 3000 // 默认主端口
                
                // 处理全栈项目的端口分配
                if (project.type === 'fullstack' && project.fullstackInfo?.portAllocation?.ports) {
                  const { frontend: frontendPort, backend: backendPort } = project.fullstackInfo.portAllocation.ports

                  console.log('全栈项目端口分配:', { frontendPort, backendPort })

                  // 添加前端端口 - 修复：前端端口应该是主端口（用于浏览器访问）
                  if (frontendPort) {
                    ports.push({
                      port: frontendPort,
                      type: 'frontend',
                      protocol: 'http',
                      description: '前端服务',
                      isMain: true  // ✅ 修复：前端端口为主端口
                    })
                    suggestedPort = frontendPort  // ✅ 修复：建议使用前端端口
                  }

                  // 添加后端端口 - 修复：后端端口应该是辅助端口（用于API调用）
                  if (backendPort) {
                    ports.push({
                      port: backendPort,
                      type: 'backend',
                      protocol: 'http',
                      description: '后端API',
                      isMain: false  // ✅ 修复：后端端口为辅助端口
                    })
                  }
                } else {
                  // 处理非全栈项目或没有端口分配信息的情况
                  // 处理前端组件
                  if (project.components?.frontend) {
                    const frontendPort = project.components.frontend.originalPort ||
                                       allocatePortForComponent('frontend', index)
                    ports.push({
                      port: frontendPort,
                      type: 'frontend',
                      protocol: 'http',
                      description: '前端服务',
                      isMain: !project.components?.backend
                    })
                    if (!project.components?.backend) {
                      suggestedPort = frontendPort
                    }
                  }

                  // 处理后端组件
                  if (project.components?.backend) {
                    const backendPort = project.components.backend.originalPort ||
                                      allocatePortForComponent('backend', index)
                    ports.push({
                      port: backendPort,
                      type: 'backend',
                      protocol: 'http',
                      description: '后端API',
                      isMain: true
                    })
                    suggestedPort = backendPort
                  }
                }
                
                // 处理移动端组件（通常是API服务）
                if (project.components?.mobile) {
                  const mobileApiPort = allocatePortForComponent('api', index)
                  ports.push({
                    port: mobileApiPort,
                    type: 'api',
                    protocol: 'http',
                    description: '移动端API',
                    isMain: ports.length === 0
                  })
                  if (ports.length === 1) {
                    suggestedPort = mobileApiPort
                  }
                }
                
                // 如果没有识别到具体组件，但项目存在，创建一个默认端口
                if (ports.length === 0) {
                  const defaultPort = allocatePortForComponent('api', index)
                  ports.push({
                    port: defaultPort,
                    type: 'api',
                    protocol: 'http', 
                    description: '应用服务',
                    isMain: true
                  })
                  suggestedPort = defaultPort
                }

                // 确定项目状态
                let status: 'valid' | 'warning' | 'error' = 'valid'
                if (project.confidence < 0.5) {
                  status = 'warning'
                } else if (project.confidence < 0.3) {
                  status = 'error'
                }

                // 生成项目显示名称
                let displayName = project.name
                if (project.type === 'fullstack') {
                  displayName += ' [全栈项目]'
                } else if (project.type === 'backend') {
                  displayName += ' [后端]'
                } else if (project.type === 'static') {
                  displayName += ' [静态站点]'
                } else if (project.type === 'mobile') {
                  displayName += ' [移动应用]'
                }

                if (project.isBackup) {
                  displayName += ' [备份]'
                }

                detectedAppsAll.push({
                  id: `project_single_${index}`,
                  name: displayName,
                  techStack: project.primaryTechStack || 'Unknown',
                  directory: project.directory,
                  suggestedPort: suggestedPort,
                  ports: ports, // 包含完整端口信息
                  confidence: Math.round(project.confidence * 100) || 85,
                  status: status,
                  description: project.description || `${project.type}项目 (${project.componentCount}个组件)`
                })
              })
            }
          } else if (session.status === 'failed') {
            throw new Error(session.error || '扫描失败')
          }
        }

        if (!scanComplete) {
          throw new Error('扫描超时')
        }

      } catch (error) {
        console.error(`路径 ${workspacePath} 扫描失败:`, error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        ElMessage.warning(`路径 ${workspacePath} 扫描失败: ${errorMessage}`)
        // 单路径扫描失败，直接抛出错误
        throw error
      }
    }

    // 如果没有扫描到任何结果，提供一个说明
    if (detectedAppsAll.length === 0) {
      ElMessage.info('未在指定路径中检测到Web应用项目，请检查路径是否包含前端/后端项目')
    }

    // 检查已添加状态并更新扫描结果
    detectedApps.value = await checkAddedStatus(detectedAppsAll)
    
    // 更新统计信息（基于最终的detectedApps.value，包含已添加状态）
    const finalApps = detectedApps.value
    detectionResults.value = {
      totalApps: finalApps.length,
      validApps: finalApps.filter(app => app.status === 'valid').length,
      warningApps: finalApps.filter(app => app.status === 'warning').length,
      errorApps: finalApps.filter(app => app.status === 'error').length,
      // 新增统计：已添加和未添加的应用数量
      addedApps: finalApps.filter(app => app.isAdded).length,
      notAddedApps: finalApps.filter(app => !app.isAdded).length
    }

    // 获取端口分配摘要（如果有检测结果）
    if (detectedAppsAll.length > 0 && currentScanId.value) {
      try {
        const portSummary = await fetchPortAllocationSummary(currentScanId.value)
        if (portSummary) {
          console.log('端口分配摘要:', portSummary)
          // 可以将端口摘要信息存储到响应式数据中，供UI显示使用
          // portAllocationSummary.value = portSummary
        }
      } catch (error) {
        console.warn('获取端口分配摘要失败，继续显示结果', error)
      }
    }

  } catch (error) {
    console.error('检测过程出错:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    ElMessage.error(`检测失败: ${errorMessage}`)
    throw error
  }
}

const pauseDetection = () => {
  ElMessage.info('扫描已暂停')
}

const cancelDetection = async () => {
  const result = await ElMessageBox.confirm(
    '确定要取消当前扫描吗？',
    '取消扫描',
    {
      type: 'warning'
    }
  )
  
  if (result === 'confirm') {
    isDetecting.value = false
    currentStep.value = 'config'
    ElMessage.warning('扫描已取消')
  }
}

const exportResults = () => {
  ElMessage.success('结果导出功能开发中')
}

const exportLogs = () => {
  ElMessage.success('日志导出功能开发中')
}

const previewApps = (apps: any[]) => {
  ElMessage.info(`预览 ${apps.length} 个应用`)
}

const startNewScan = () => {
  currentStep.value = 'config'
  detectedApps.value = []
  selectedApps.value = []
  statusFilter.value = 'all' // 重置状态过滤
}

// 刷新已添加状态
const refreshAddedStatus = async () => {
  if (detectedApps.value.length === 0) {
    ElMessage.warning('没有扫描结果需要刷新')
    return
  }

  try {
    ElMessage.info('正在刷新应用状态...')

    // 重新检查所有应用的添加状态
    const refreshedApps = await checkAddedStatus(detectedApps.value.map(app => ({
      ...app,
      isAdded: false, // 重置状态
      addedAppId: undefined,
      addedAppName: undefined
    })))

    detectedApps.value = refreshedApps

    // 更新统计信息
    const finalApps = detectedApps.value
    detectionResults.value = {
      ...detectionResults.value,
      addedApps: finalApps.filter(app => app.isAdded).length,
      notAddedApps: finalApps.filter(app => !app.isAdded).length
    }

    ElMessage.success('应用状态刷新完成')

  } catch (error) {
    console.error('刷新状态失败:', error)
    ElMessage.error('刷新状态失败，请重试')
  }
}

// 标准化路径：统一分隔符、移除尾部斜杠、转小写（Windows不区分大小写）
const normalizePath = (path: string): string => {
  if (!path) return ''
  return path
    .replace(/\\/g, '/')      // 反斜杠转正斜杠
    .replace(/\/+$/, '')      // 移除尾部斜杠
    .toLowerCase()            // 统一小写（Windows路径不区分大小写）
}

// 检查扫描结果中的应用是否已添加到门户系统
const checkAddedStatus = async (detectedApps: DetectedAppResult[]): Promise<DetectedAppResult[]> => {
  try {
    console.log('开始检查已添加状态...')

    // 获取所有已添加的应用
    const existingApps = await appsApiService.getApps({ limit: 1000 })

    if (!existingApps.success) {
      console.warn('获取已有应用列表失败，跳过状态检查')
      return detectedApps.map(app => ({ ...app, isAdded: false }))
    }

    // 为每个扫描结果检查是否已添加（使用标准化路径匹配）
    const appsWithStatus = detectedApps.map(app => {
      const normalizedAppDir = normalizePath(app.directory)
      const existingApp = existingApps.data.find(existing =>
        normalizePath(existing.directory) === normalizedAppDir
      )

      if (existingApp) {
        console.log(`发现已添加应用: ${app.name} -> ${existingApp.name}`, {
          detectedDir: app.directory,
          existingDir: existingApp.directory,
          normalizedDetected: normalizedAppDir,
          normalizedExisting: normalizePath(existingApp.directory)
        })
        return {
          ...app,
          isAdded: true,
          addedAppId: existingApp.id,
          addedAppName: existingApp.name
        }
      }

      return { ...app, isAdded: false }
    })

    const addedCount = appsWithStatus.filter(app => app.isAdded).length
    console.log(`状态检查完成: ${addedCount}/${detectedApps.length} 个应用已添加`)

    return appsWithStatus

  } catch (error) {
    console.error('检查已添加状态失败:', error)
    ElMessage.warning('检查已添加状态失败，将显示所有应用为未添加状态')

    // 出错时返回所有应用为未添加状态
    return detectedApps.map(app => ({ ...app, isAdded: false }))
  }
}

const handleSelectionChange = (selection: DetectedAppResult[]) => {
  selectedApps.value = selection
}

const syncAddedStats = () => {
  const finalApps = detectedApps.value
  detectionResults.value = {
    ...detectionResults.value,
    addedApps: finalApps.filter(app => app.isAdded).length,
    notAddedApps: finalApps.filter(app => !app.isAdded).length
  }
}

const buildImportCandidate = (
  app: DetectedAppResult,
  overridePorts?: { frontend_port?: number; backend_port?: number }
): ImportCandidate => {
  const autoPorts = extractPortsFromApp(app)
  const mergedPorts = {
    ...autoPorts,
    ...(overridePorts || {})
  }

  return {
    name: app.name.replace(/\[.*?\]/g, '').trim(),
    description: app.description || `基于 ${app.techStack} 的应用`,
    directory: app.directory,
    tech_stack: typeof app.techStack === 'string' ? app.techStack : String(app.techStack || 'Unknown'),
    icon: getAppIcon(app.techStack),
    color: getAppColor(app.techStack),
    ...mergedPorts
  }
}

const applyBatchImportResultToLocalState = (result: BatchImportResult) => {
  if (!result || result.rolledBack) {
    return
  }

  const directoryToCreatedApp = new Map<string, { id: string; name: string }>()
  for (const createdItem of result.created || []) {
    const directory = createdItem?.candidate?.directory
    const appInfo = createdItem?.app
    if (directory && appInfo?.id) {
      directoryToCreatedApp.set(directory, { id: appInfo.id, name: appInfo.name })
    }
  }

  detectedApps.value = detectedApps.value.map(item => {
    const created = directoryToCreatedApp.get(item.directory)
    if (!created) {
      return item
    }
    return {
      ...item,
      isAdded: true,
      addedAppId: created.id,
      addedAppName: created.name
    }
  })

  syncAddedStats()
}

const batchAddApps = async () => {
  if (selectedApps.value.length === 0) {
    ElMessage.warning('请先选择要添加的应用')
    return
  }

  // 过滤出未添加的应用
  const appsToAdd = availableForBatchAdd.value

  if (appsToAdd.length === 0) {
    ElMessage.info('所选应用都已添加，无需重复添加')
    return
  }

  if (appsToAdd.length < selectedApps.value.length) {
    const addedCount = selectedApps.value.length - appsToAdd.length
    const result = await ElMessageBox.confirm(
      `所选的 ${selectedApps.value.length} 个应用中，有 ${addedCount} 个已添加。\n\n是否继续添加剩余的 ${appsToAdd.length} 个应用？`,
      '部分应用已添加',
      {
        confirmButtonText: '继续添加',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).catch(() => 'cancel')

    if (result === 'cancel') {
      ElMessage.info('已取消批量添加')
      return
    }
  }
  
  try {
    console.log('准备批量导入应用:', appsToAdd)

    const importCandidates = appsToAdd.map(app => buildImportCandidate(app))
    const precheckResponse = await appsApiService.precheckImport(importCandidates)
    if (!precheckResponse.success || !precheckResponse.data) {
      throw new Error(precheckResponse.message || '导入预检查失败')
    }

    const precheckData = precheckResponse.data
    const importableItems = precheckData.items.filter(item => item.canImport)
    const blockedItems = precheckData.items.filter(item => !item.canImport)

    if (importableItems.length === 0) {
      const firstBlocked = blockedItems[0]
      const reason = firstBlocked?.errors?.[0] || '存在未通过预检查的应用'
      ElMessage.error(`导入已阻止：${reason}`)
      return
    }

    if (blockedItems.length > 0) {
      const result = await ElMessageBox.confirm(
        `预检查结果：可导入 ${importableItems.length} 个，阻止 ${blockedItems.length} 个。\n\n是否继续导入可通过项？`,
        '导入预检查',
        {
          confirmButtonText: '继续导入',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).catch(() => 'cancel')

      if (result === 'cancel') {
        ElMessage.info('已取消批量导入')
        return
      }
    }

    const batchResponse = await appsApiService.batchImportFromDetection(
      importableItems.map(item => ({
        name: item.candidate.name,
        description: item.candidate.description,
        directory: item.candidate.directory,
        tech_stack: item.candidate.techStack,
        icon: item.candidate.icon,
        color: item.candidate.color,
        frontend_port: item.candidate.frontendPort,
        backend_port: item.candidate.backendPort
      })),
      { rollbackOnError: true }
    )

    if (!batchResponse.success || !batchResponse.data) {
      throw new Error(batchResponse.message || '批量导入失败')
    }

    const batchResult = batchResponse.data
    applyBatchImportResultToLocalState(batchResult)

    if (batchResult.rolledBack) {
      ElMessage.error(`导入失败，已回滚 ${batchResult.precheck.summary.importable} 个已创建应用`)
    } else if (batchResult.failed.length > 0) {
      ElMessage.warning(`导入完成：成功 ${batchResult.created.length} 个，失败 ${batchResult.failed.length} 个`)
    } else {
      ElMessage.success(`成功导入 ${batchResult.created.length} 个应用`)
    }

    // 清空选择
    selectedApps.value = []
    
  } catch (error) {
    console.error('批量导入失败:', error)
    ElMessage.error(`批量导入失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

const previewApp = (app: DetectedAppResult) => {
  previewAppData.value = app
  appPreviewVisible.value = true
}

const addSingleApp = async (app: DetectedAppResult) => {
  try {
    console.log('准备添加应用:', app)

    // 1. 首先检查是否已存在相同目录的应用
    const existingApps = await appsApiService.getApps({ limit: 1000 }) // 获取所有应用进行检查
    const duplicateApp = existingApps.data.find(existingApp =>
      existingApp.directory === app.directory
    )

    if (duplicateApp) {
      // 显示友好的重复提示，询问用户是否要更新
      const action = await ElMessageBox.confirm(
        `目录 "${app.directory}" 已存在应用 "${duplicateApp.name}"。\n\n您希望如何处理？`,
        '应用已存在',
        {
          confirmButtonText: '更新现有应用',
          cancelButtonText: '取消添加',
          type: 'warning',
          distinguishCancelAndClose: true,
          showClose: false
        }
      ).catch(() => 'cancel')

      if (action === 'confirm') {
        // 用户选择更新现有应用
        return await updateExistingApp(duplicateApp.id, app)
      } else {
        // 用户取消操作
        ElMessage.info('已取消添加应用')
        return
      }
    }

    // 2. 显示端口选择对话框
    const portConfig = await showPortSelectionDialog(app)
    if (!portConfig) {
      ElMessage.info('已取消添加应用')
      return
    }

    // 3. 构造导入草案，包含用户选择的端口信息
    const appData = buildImportCandidate(app, portConfig)

    console.log('应用数据:', appData)
    console.log('应用数据 JSON:', JSON.stringify(appData, null, 2))
    console.log('tech_stack 类型:', typeof appData.tech_stack, '值:', appData.tech_stack)

    // 4. 导入前预检查
    const precheckResponse = await appsApiService.precheckImport([appData])
    if (!precheckResponse.success || !precheckResponse.data) {
      throw new Error(precheckResponse.message || '导入预检查失败')
    }

    const precheckItem = precheckResponse.data.items[0]
    if (!precheckItem?.canImport) {
      throw new Error(precheckItem?.errors?.[0] || '预检查未通过')
    }

    // 5. 一键导入（单应用也走批量导入管道，统一回滚逻辑）
    const importResponse = await appsApiService.batchImportFromDetection([appData], {
      rollbackOnError: true
    })

    if (!importResponse.success || !importResponse.data) {
      throw new Error(importResponse.message || '导入失败')
    }

    const importResult = importResponse.data
    if (importResult.rolledBack) {
      throw new Error('导入失败且已自动回滚')
    }
    if (importResult.created.length === 0) {
      const reason = importResult.failed[0]?.error || '导入失败'
      throw new Error(reason)
    }

    applyBatchImportResultToLocalState(importResult)

    ElMessage.success(`应用 "${app.name}" 添加成功！`)
    console.log('应用导入成功:', importResult.created[0]?.app)
  } catch (error) {
    console.error('添加应用失败:', error)

    // 改善错误提示
    if (error instanceof Error) {
      if (error.message.includes('Application already exists')) {
        ElMessage.error('该目录已存在应用，请检查后重试')
      } else if (error.message.includes('DIRECTORY_ALREADY_EXISTS')) {
        ElMessage.error('目录冲突：该路径已被其他应用使用')
      } else {
        ElMessage.error(`添加失败: ${error.message}`)
      }
    } else {
      ElMessage.error('添加失败: 未知错误')
    }
  }
}

// 表格行样式函数
const getRowClassName = ({ row }: { row: DetectedAppResult }) => {
  return row.isAdded ? 'added-app-row' : ''
}

// 查看应用详情（跳转到管理页面）
const viewInManagement = (appId: string) => {
  // 跳转到应用管理页面并高亮指定应用
  router.push({
    path: '/management',
    query: { highlight: appId }
  })
}

// 辅助函数：更新现有应用
const updateExistingApp = async (appId: string, detectedApp: DetectedAppResult) => {
  try {
    const updateData = {
      name: detectedApp.name.replace(/\[.*?\]/g, '').trim(),
      description: detectedApp.description || `基于 ${detectedApp.techStack} 的应用`,
      // 确保 tech_stack 总是字符串类型，匹配 AppUpdateRequest 接口
      tech_stack: typeof detectedApp.techStack === 'string' ? detectedApp.techStack : String(detectedApp.techStack || 'Unknown'),
      icon: getAppIcon(detectedApp.techStack),
      color: getAppColor(detectedApp.techStack)
    }

    const response = await appsApiService.updateApp(appId, updateData)

    if (response.success) {
      ElMessage.success(`应用 "${detectedApp.name}" 更新成功！`)
      console.log('应用更新成功:', response.data)

      // 更新本地状态，刷新扫描结果中的应用信息
      const updatedApps = detectedApps.value.map(app => {
        if (app.directory === detectedApp.directory) {
          return {
            ...app,
            addedAppName: updateData.name
          }
        }
        return app
      })
      detectedApps.value = updatedApps

    } else {
      throw new Error(response.message || '更新应用失败')
    }
  } catch (error) {
    console.error('更新应用失败:', error)
    ElMessage.error(`更新失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 辅助函数：从应用中提取端口信息
const extractPortsFromApp = (app: DetectedAppResult): { frontend_port?: number, backend_port?: number } => {
  console.log('=== extractPortsFromApp 开始 ===')
  console.log('应用名称:', app.name)
  console.log('app.ports:', JSON.stringify(app.ports))
  console.log('app.suggestedPort:', app.suggestedPort)
  console.log('app.fullstackInfo:', JSON.stringify(app.fullstackInfo))

  // 方法1：从 ports 数组中提取（最优先，这是检测结果的真实端口）
  if (app.ports && app.ports.length > 0) {
    const frontendPortObj = app.ports.find(p => p.type === 'frontend')
    const backendPortObj = app.ports.find(p => p.type === 'backend')
    const apiPortObj = app.ports.find(p => p.type === 'api')
    
    const frontendPort = frontendPortObj?.port
    const backendPort = backendPortObj?.port || apiPortObj?.port

    console.log('方法1 - 从 ports 数组提取:', { frontendPort, backendPort, frontendPortObj, backendPortObj })

    if (frontendPort || backendPort) {
      console.log('✅ 使用方法1提取的端口:', { frontend_port: frontendPort, backend_port: backendPort })
      return {
        frontend_port: frontendPort,
        backend_port: backendPort
      }
    }
  }

  // 方法2：从 fullstackInfo 中提取（如果是全栈项目）
  if (app.isFullStack && app.fullstackInfo?.originalPorts) {
    const originalPorts = app.fullstackInfo.originalPorts
    const frontendPort = originalPorts.frontend?.[0]
    const backendPort = originalPorts.backend?.[0]

    if (frontendPort || backendPort) {
      console.log('从 fullstackInfo 提取端口:', { frontendPort, backendPort })
      return {
        frontend_port: frontendPort,
        backend_port: backendPort
      }
    }
  }

  // 方法3：从 portAllocation 中提取（如果存在）
  if (app.fullstackInfo?.portAllocation?.ports) {
    const ports = app.fullstackInfo.portAllocation.ports
    console.log('从 portAllocation 提取端口:', ports)
    return {
      frontend_port: ports.frontend,
      backend_port: ports.backend
    }
  }

  // 方法3.5：使用 suggestedPort 或 ports 数组的第一个端口（兜底方案）
  if (app.suggestedPort) {
    console.log('方法3.5 - 使用 suggestedPort:', app.suggestedPort)
    // 根据技术栈判断是前端还是后端端口
    const techStack = app.techStack?.toLowerCase() || ''
    const isFrontend = techStack.includes('vue') || techStack.includes('react') || techStack.includes('angular')
    
    if (isFrontend) {
      return { frontend_port: app.suggestedPort }
    } else {
      return { backend_port: app.suggestedPort }
    }
  }

  // 方法3.6：直接使用 ports 数组的第一个端口
  if (app.ports && app.ports.length > 0) {
    const firstPort = app.ports[0]
    console.log('方法3.6 - 使用 ports 数组第一个端口:', firstPort)
    
    if (firstPort.type === 'frontend' || firstPort.isMain) {
      return { frontend_port: firstPort.port }
    } else {
      return { backend_port: firstPort.port }
    }
  }

  // 方法4：智能推断端口（基于技术栈）- 这是最后的兜底
  console.warn('⚠️ 使用方法4智能推断端口 - 可能导致端口不一致！')
  const techStackLower = app.techStack?.toLowerCase() || ''
  const descriptionLower = app.description?.toLowerCase() || ''
  const nameLower = app.name?.toLowerCase() || ''

  // 改进的全栈项目识别逻辑
  const isFullStackProject = app.isFullStack ||
    // 从描述中识别全栈项目
    descriptionLower.includes('全栈') ||
    descriptionLower.includes('fullstack') ||
    descriptionLower.includes('full-stack') ||
    // 从名称中识别
    nameLower.includes('全栈') ||
    nameLower.includes('fullstack') ||
    // 从技术栈组合识别
    (techStackLower.includes('vue') && (descriptionLower.includes('express') || descriptionLower.includes('node'))) ||
    (techStackLower.includes('react') && (descriptionLower.includes('express') || descriptionLower.includes('node'))) ||
    (techStackLower.includes('angular') && (descriptionLower.includes('spring') || descriptionLower.includes('java')))

  if (isFullStackProject) {
    // 为全栈项目分配配置范围内的端口对
    // 使用技术栈信息作为索引基数，确保相同技术栈的项目倾向于使用相似的端口
    const techStackIndex = techStackLower.includes('vue') ? 0 :
                           techStackLower.includes('react') ? 10 :
                           techStackLower.includes('angular') ? 20 :
                           techStackLower.includes('express') ? 30 :
                           techStackLower.includes('spring') ? 40 :
                           techStackLower.includes('django') ? 50 : 60

    const frontendPort = allocatePortForComponent('frontend', techStackIndex)
    const backendPort = allocatePortForComponent('backend', techStackIndex)

    console.log('智能推断全栈端口(配置范围内):', { frontendPort, backendPort, techStackLower })
    return {
      frontend_port: frontendPort,
      backend_port: backendPort
    }
  } else {
    // 单一技术栈项目
    const techStackIndex = techStackLower.includes('vue') ? 0 :
                           techStackLower.includes('react') ? 10 :
                           techStackLower.includes('angular') ? 20 :
                           techStackLower.includes('express') ? 30 :
                           techStackLower.includes('spring') ? 40 :
                           techStackLower.includes('django') ? 50 : 60

    const isFrontendStack = techStackLower.includes('vue') || techStackLower.includes('react') || techStackLower.includes('angular')
    const type = isFrontendStack ? 'frontend' : 'backend'
    const port = allocatePortForComponent(type, techStackIndex)

    console.log('智能推断单栈端口(配置范围内):', { port, type, techStackLower })
    return type === 'frontend' ? { frontend_port: port } : { backend_port: port }
  }
}

// 辅助函数：根据技术栈获取图标
const getAppIcon = (techStack: string): string => {
  const iconMap: Record<string, string> = {
    'vue': '🟢',
    'react': '⚛️',
    'angular': '🔴',
    'express': '🚀',
    'fastify': '⚡',
    'nest': '🦅',
    'static-html': '📄',
    'nodejs-web': '🌐',
    'express-typescript': '🟦'
  }
  
  for (const [key, icon] of Object.entries(iconMap)) {
    if (techStack.toLowerCase().includes(key)) {
      return icon
    }
  }
  
  return '📱' // 默认图标
}

// 辅助函数：根据技术栈获取颜色
const getAppColor = (techStack: string): string => {
  const colorMap: Record<string, string> = {
    'vue': '#4FC08D',
    'react': '#61DAFB', 
    'angular': '#DD0031',
    'express': '#000000',
    'fastify': '#000000',
    'nest': '#E0234E',
    'static-html': '#E34F26',
    'nodejs-web': '#339933',
    'express-typescript': '#3178C6'
  }
  
  for (const [key, color] of Object.entries(colorMap)) {
    if (techStack.toLowerCase().includes(key)) {
      return color
    }
  }
  
  return '#667eea' // 默认颜色
}

const showHistory = () => {
  ElMessage.info('历史记录功能开发中')
}

const showHelp = () => {
  ElMessage.info('帮助功能开发中')
}

// 端口选择对话框相关状态
const portSelectionVisible = ref(false)
const portSelectionApp = ref<DetectedAppResult | null>(null)
const portSelectionForm = ref({
  frontend_port: 0,
  backend_port: 0
})
const portConflicts = ref<{
  frontend?: string
  backend?: string
}>({})
const checkingPorts = ref(false)

// 显示端口选择对话框
const showPortSelectionDialog = async (app: DetectedAppResult): Promise<{ frontend_port?: number, backend_port?: number } | null> => {
  return new Promise((resolve) => {
    portSelectionApp.value = app

    // 提取默认端口
    const defaultPorts = extractPortsFromApp(app)
    portSelectionForm.value = {
      frontend_port: resolveInitialPort(defaultPorts.frontend_port, 'frontend'),
      backend_port: resolveInitialPort(defaultPorts.backend_port, 'backend')
    }

    // 清空冲突信息
    portConflicts.value = {}

    // 显示对话框
    portSelectionVisible.value = true

    // 检查默认端口冲突
    if (defaultPorts.frontend_port || defaultPorts.backend_port) {
      checkPortConflicts()
    }

    // 设置解析函数
    const originalResolve = resolve
    ;(window as any).__portSelectionResolve = (result: any) => {
      portSelectionVisible.value = false
      portSelectionApp.value = null
      originalResolve(result)
    }
  })
}

// 检查端口冲突
const checkPortConflicts = async () => {
  if (checkingPorts.value) return

  checkingPorts.value = true
  portConflicts.value = {}

  try {
    const portsToCheck: number[] = []
    if (portSelectionForm.value.frontend_port > 0) {
      portsToCheck.push(portSelectionForm.value.frontend_port)
    }
    if (portSelectionForm.value.backend_port > 0) {
      portsToCheck.push(portSelectionForm.value.backend_port)
    }

    if (portsToCheck.length === 0) return

    const response = await appsApiService.checkPortConflicts(portsToCheck)

    if (response.success && response.data && response.data.hasConflicts) {
      response.data.conflicts.forEach(conflict => {
        if (conflict.port === portSelectionForm.value.frontend_port) {
          portConflicts.value.frontend = conflict.reason
        }
        if (conflict.port === portSelectionForm.value.backend_port) {
          portConflicts.value.backend = conflict.reason
        }
      })
    }
  } catch (error) {
    console.error('检查端口冲突失败:', error)
  } finally {
    checkingPorts.value = false
  }
}

// 确认端口选择
const confirmPortSelection = () => {
  const frontendPort = portSelectionForm.value.frontend_port
  const backendPort = portSelectionForm.value.backend_port

  if (frontendPort > 0 && !isPortInRange(frontendPort, 'frontend')) {
    ElMessage.error(
      `前端端口必须在 ${frontendPortRange.value.start}-${frontendPortRange.value.end} 范围内`
    )
    return
  }

  if (backendPort > 0 && !isPortInRange(backendPort, 'backend')) {
    ElMessage.error(
      `后端端口必须在 ${backendPortRange.value.start}-${backendPortRange.value.end} 范围内`
    )
    return
  }

  const result: { frontend_port?: number, backend_port?: number } = {}

  if (frontendPort > 0) {
    result.frontend_port = frontendPort
  }
  if (backendPort > 0) {
    result.backend_port = backendPort
  }

  ;(window as any).__portSelectionResolve?.(result)
}

// 取消端口选择
const cancelPortSelection = () => {
  ;(window as any).__portSelectionResolve?.(null)
}

// 自动分配端口
const autoAllocatePort = (type: 'frontend' | 'backend') => {
  if (!portSelectionApp.value) return

  const port = allocatePortForComponent(type, 0, true)
  if (type === 'frontend') {
    portSelectionForm.value.frontend_port = port
  } else {
    portSelectionForm.value.backend_port = port
  }

  // 检查新分配的端口冲突
  checkPortConflicts()
}

// 端口输入变化处理
const onPortChange = () => {
  // 延迟检查端口冲突，避免频繁请求
  setTimeout(() => {
    checkPortConflicts()
  }, 500)
}



// 步骤导航方法
const nextStep = () => {
  if (configStep.value < 2 && canProceedToNextStep.value) {
    configStep.value++
  }
}

const prevStep = () => {
  if (configStep.value > 0) {
    configStep.value--
  }
}

// 辅助方法
const getTotalPathSize = () => {
  // 基于选择的路径数量和类型估算大小
  if (selectedPaths.value.length === 0) {
    return '未知'
  }

  // 简单估算：每个路径平均500MB-2GB
  const avgSizePerPath = 1.2 // GB
  const estimatedSize = selectedPaths.value.length * avgSizePerPath

  if (estimatedSize < 1) {
    return `~${Math.round(estimatedSize * 1000)}MB`
  } else {
    return `~${estimatedSize.toFixed(1)}GB`
  }
}

// 辅助函数：将项目转换为DetectedAppResult格式
const convertProjectToDetectedApp = (project: any, index: number): DetectedAppResult => {
  const ports: Array<{
    port: number
    type: 'frontend' | 'backend' | 'api' | 'websocket' | 'database'
    protocol: 'http' | 'https' | 'ws' | 'wss' | 'tcp'
    description?: string
    isMain?: boolean
  }> = []

  let suggestedPort = 3000

  // 处理全栈项目的端口分配
  if (project.type === 'fullstack' && project.fullstackInfo?.portAllocation?.ports) {
    const { frontend: frontendPort, backend: backendPort } = project.fullstackInfo.portAllocation.ports

    if (frontendPort) {
      ports.push({
        port: frontendPort,
        type: 'frontend',
        protocol: 'http',
        description: '前端服务',
        isMain: true
      })
      suggestedPort = frontendPort
    }

    if (backendPort) {
      ports.push({
        port: backendPort,
        type: 'backend',
        protocol: 'http',
        description: '后端API',
        isMain: false
      })
    }
  } else {
    // 处理其他项目类型
    if (project.components?.frontend) {
      const frontendPort = project.components.frontend.originalPort || allocatePortForComponent('frontend', index)
      ports.push({
        port: frontendPort,
        type: 'frontend',
        protocol: 'http',
        description: '前端服务',
        isMain: !project.components?.backend
      })
      if (!project.components?.backend) {
        suggestedPort = frontendPort
      }
    }

    if (project.components?.backend) {
      const backendPort = project.components.backend.originalPort || allocatePortForComponent('backend', index)
      ports.push({
        port: backendPort,
        type: 'backend',
        protocol: 'http',
        description: '后端API',
        isMain: true
      })
      suggestedPort = backendPort
    }
  }

  if (ports.length === 0) {
    const defaultPort = allocatePortForComponent('api', index)
    ports.push({
      port: defaultPort,
      type: 'api',
      protocol: 'http',
      description: '应用服务',
      isMain: true
    })
    suggestedPort = defaultPort
  }

  // 确定项目状态
  let status: 'valid' | 'warning' | 'error' = 'valid'
  if (project.confidence < 0.5) {
    status = 'warning'
  } else if (project.confidence < 0.3) {
    status = 'error'
  }

  // 生成显示名称
  let displayName = project.name
  if (project.type === 'fullstack') {
    displayName += ' [全栈项目]'
  } else if (project.type === 'backend') {
    displayName += ' [后端]'
  } else if (project.type === 'static') {
    displayName += ' [静态站点]'
  } else if (project.type === 'mobile') {
    displayName += ' [移动应用]'
  }

  if (project.isBackup) {
    displayName += ' [备份]'
  }

  return {
    id: `project_${index}`,
    name: displayName,
    techStack: project.primaryTechStack || 'Unknown',
    directory: project.directory,
    suggestedPort: suggestedPort,
    ports: ports,
    confidence: Math.round(project.confidence * 100) || 85,
    status: status,
    description: project.description || `${project.type}项目 (${project.componentCount}个组件)`
  }
}

// ========== 配置记忆功能 ==========
const DETECTION_CONFIG_KEY = 'detection_last_config'

interface SavedConfig {
  quickStartPath: string
  selectedPaths: string[]
  selectedPreset: string
  portAllocationStrategy: string
  timestamp: number
}

// 保存配置到本地存储
const saveLastConfig = () => {
  try {
    const config: SavedConfig = {
      quickStartPath: quickStartPath.value,
      selectedPaths: selectedPaths.value,
      selectedPreset: selectedPreset.value,
      portAllocationStrategy: portAllocationStrategy.value,
      timestamp: Date.now()
    }
    localStorage.setItem(DETECTION_CONFIG_KEY, JSON.stringify(config))
    console.log('配置已保存:', config)
  } catch (error) {
    console.warn('保存配置失败:', error)
  }
}

// 加载上次配置
const loadLastConfig = () => {
  try {
    const saved = localStorage.getItem(DETECTION_CONFIG_KEY)
    if (saved) {
      const config: SavedConfig = JSON.parse(saved)
      // 检查配置是否过期（7天）
      const isExpired = Date.now() - config.timestamp > 7 * 24 * 60 * 60 * 1000
      if (!isExpired) {
        quickStartPath.value = config.quickStartPath || quickStartPath.value
        if (config.selectedPaths?.length) {
          selectedPaths.value = config.selectedPaths
        }
        selectedPreset.value = config.selectedPreset || 'balanced'
        portAllocationStrategy.value = config.portAllocationStrategy || 'smart'
        hasLastConfig.value = true
        console.log('已加载上次配置:', config)
        return true
      }
    }
  } catch (error) {
    console.warn('加载配置失败:', error)
  }
  hasLastConfig.value = false
  return false
}

// 生命周期
onMounted(async () => {
  // 加载上次保存的配置
  const hasLastConfig = loadLastConfig()
  if (hasLastConfig) {
    console.log('Detection page mounted with saved config')
  } else {
    console.log('Detection page mounted, using default config')
  }

  // 加载端口配置
  try {
    await portConfigStore.loadConfig()
    console.log('Port configuration loaded successfully')
  } catch (error) {
    console.warn('Failed to load port configuration, using defaults:', error)
  }
})
</script>

<style scoped>
/* 快速开始区域样式 */
.quick-start-card {
  margin-bottom: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
}

.quick-start-card :deep(.el-card__body) {
  padding: 20px 24px;
}

.quick-start-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}

.quick-start-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.quick-start-icon {
  font-size: 40px;
  line-height: 1;
}

.quick-start-info h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: white;
}

.quick-start-info p {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.quick-start-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quick-start-path {
  display: flex;
  gap: 8px;
}

.quick-start-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.divider-text {
  font-size: 13px;
  color: #909399;
}

/* 扫描模式选择样式 */
.scan-mode-card {
  height: fit-content;
}

.scan-mode-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scan-mode-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
}

.scan-mode-item:hover {
  border-color: #409EFF;
  background: #f8f9fa;
}

.scan-mode-item.active {
  border-color: #67C23A;
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f5e8 100%);
}

.mode-icon {
  font-size: 24px;
  margin-right: 12px;
  min-width: 32px;
  text-align: center;
}

.mode-info {
  flex: 1;
}

.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
}

.mode-desc {
  font-size: 12px;
  color: #909399;
}

.mode-check {
  color: #67C23A;
  font-size: 18px;
}

.mode-details {
  padding-top: 8px;
}

.mode-details h4 {
  margin: 0 0 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

/* 第2步快速开始区域 */
.quick-start-section {
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f5e8 100%);
  padding: 16px;
  border-radius: 8px;
  margin-top: 16px;
}

.quick-start-section h4 {
  margin-bottom: 12px !important;
  color: #67C23A;
}

.current-config-summary {
  margin-bottom: 8px;
}

.detection-page {
  padding: 24px;
  background: #f0f2f5;
  min-height: 100%;
}

.main-config-card {
  margin-bottom: 16px;
}

.main-config-card :deep(.el-card__body) {
  padding: 24px;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-header span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.side-config-card {
  margin-bottom: 16px;
}

.quick-presets {
  margin-bottom: 24px;
}

.quick-presets h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.basic-config {
  margin-bottom: 20px;
}

.basic-config h4 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.advanced-toggle {
  text-align: center;
}

.action-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.action-card :deep(.el-card__body) {
  padding: 24px;
}

.scan-action {
  text-align: center;
}

.scan-info {
  margin-bottom: 20px;
}

.scan-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-bottom: 16px;
}

.stat-item {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  opacity: 0.8;
}

.scanning-stage {
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.results-header span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.results-actions {
  display: flex;
  gap: 8px;
}

.detection-stats {
  margin-bottom: 24px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 6px;
}

.table-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 6px;
}

.confidence-text {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

/* 新增样式 */
.steps-card {
  margin-bottom: 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.steps-card :deep(.el-steps) {
  color: white;
}

.steps-card :deep(.el-step__title) {
  color: white;
}

.steps-card :deep(.el-step__description) {
  color: rgba(255, 255, 255, 0.8);
}

.config-step {
  margin-bottom: 24px;
}

.guide-card {
  height: fit-content;
}

.guide-content {
  padding: 0;
}

.guide-item {
  margin-bottom: 16px;
}

.guide-item h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.guide-item p {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.guide-tips h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.guide-tips ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: #606266;
}

.guide-tips li {
  margin-bottom: 4px;
}

.config-section {
  margin-bottom: 32px;
  padding-bottom: 20px;
}

.config-section:not(:last-child) {
  border-bottom: 1px solid #f0f0f0;
}

.config-section h4 {
  margin: 0 0 20px 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  padding-bottom: 8px;
  border-bottom: 2px solid #409EFF;
  display: inline-block;
}

.preset-option {
  text-align: center;
  padding: 8px;
}

.preset-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.preset-desc {
  font-size: 12px;
  color: #909399;
}

.form-help {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}

.preview-card {
  height: fit-content;
}

.config-preview {
  padding: 0;
}

.preview-section {
  margin-bottom: 20px;
}

.preview-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.path-list {
  margin-top: 8px;
}

.path-item {
  font-size: 12px;
  color: #606266;
  margin-bottom: 4px;
  padding: 4px 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.path-more {
  font-size: 12px;
  color: #909399;
  font-style: italic;
}

.estimation-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.estimation-item {
  text-align: center;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.estimation-value {
  display: block;
  font-size: 18px;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 4px;
}

.estimation-label {
  font-size: 12px;
  color: #909399;
}

.confirm-card {
  min-height: 600px;
}

.confirm-content {
  padding: 8px 0;
}

.config-summary {
  margin-bottom: 32px;
}

.config-summary h3 {
  margin: 0 0 20px 0;
  color: #303133;
  font-size: 18px;
  text-align: center;
}

.summary-card {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: white;
  margin-bottom: 16px;
}

.summary-icon {
  font-size: 24px;
  margin-right: 12px;
}

.summary-content {
  flex: 1;
}

.summary-title {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 4px;
}

.summary-value {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 2px;
}

.summary-detail {
  font-size: 11px;
  opacity: 0.7;
}

.expected-results {
  margin-bottom: 24px;
}

.expected-results h4 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.result-preview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.result-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.detection-alerts {
  margin-bottom: 32px;
}

.start-action {
  text-align: center;
}

.step-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-top: 24px;
}

/* 第2步新增样式 */
.preset-description {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.preset-description p {
  margin: 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

.preset-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-card-wrapper {
  width: 100%;
  cursor: pointer;
}

.preset-card-wrapper.active .preset-card {
  border-color: #409EFF;
  background: linear-gradient(135deg, #e7f3ff 0%, #f0f8ff 100%);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.preset-card {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  transition: all 0.2s ease;
  background: white;
  min-height: 80px;
  width: 100%;
  box-sizing: border-box;
}

.preset-card:hover {
  border-color: #409EFF;
  background: #f0f8ff;
}

.preset-icon {
  font-size: 24px;
  margin-right: 12px;
  min-width: 30px;
}

.preset-content {
  flex: 1;
}

.preset-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.preset-desc {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
  line-height: 1.4;
}

.preset-specs {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
}

.preset-specs span {
  font-size: 11px;
  color: #909399;
  line-height: 1.3;
}

/* 选中状态的额外视觉反馈 */
.preset-card-wrapper.active .preset-card .preset-title {
  color: #409EFF;
  font-weight: 700;
}

.preset-card-wrapper.active .preset-card .preset-icon {
  transform: scale(1.1);
}

.tech-priority-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.tech-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px 8px;
  border: 2px solid #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
  min-height: 80px;
  box-sizing: border-box;
  position: relative;
}

.tech-item:hover {
  border-color: #409EFF;
  background: #f0f8ff;
}

.tech-item.active {
  border-color: #67C23A;
  background: linear-gradient(135deg, #f0f9ff 0%, #e8f5e8 100%);
}

.tech-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.tech-name {
  font-size: 11px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 2px;
  text-align: center;
  line-height: 1.2;
}

.tech-priority {
  font-size: 10px;
  color: #909399;
  text-align: center;
}

.port-strategy-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.port-strategy-item {
  display: flex;
  align-items: flex-start;
  padding: 16px;
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: white;
  position: relative;
}

.port-strategy-item:hover {
  border-color: #409EFF;
  background: #f8f9fa;
}

.port-strategy-item.active {
  border-color: #409EFF;
  background: #f0f8ff;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
}

.strategy-radio {
  margin-right: 12px;
  margin-top: 2px;
  flex-shrink: 0;
}

.radio-dot {
  width: 16px;
  height: 16px;
  border: 2px solid #dcdfe6;
  border-radius: 50%;
  background: white;
  position: relative;
  transition: all 0.2s ease;
}

.radio-dot.checked {
  border-color: #409EFF;
  background: #409EFF;
}

.radio-dot.checked::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: white;
}

.strategy-content {
  flex: 1;
}

.strategy-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.strategy-desc {
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
}

.strategy-preview {
  padding: 0;
}

/* 端口显示样式 */
.ports-display {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.multiple-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 2px;
}

.port-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: white !important;
  border: none;
}

.port-icon {
  font-size: 12px;
}

.ports-summary {
  font-size: 11px;
  color: #909399;
  line-height: 1.2;
  text-align: center;
}

/* 响应式设计 */
@media (max-width: 1400px) {
  .tech-priority-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 1200px) {
  .config-stage .el-col:first-child {
    margin-bottom: 16px;
  }
  
  .estimation-grid {
    grid-template-columns: 1fr;
  }
  
  .result-preview {
    grid-template-columns: 1fr;
  }
  
  .preset-options {
    flex-direction: column;
    gap: 10px;
  }
  
  .tech-priority-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  
  .tech-item {
    min-height: 70px;
    padding: 10px 6px;
  }
}

@media (max-width: 900px) {
  .tech-priority-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .detection-page {
    padding: 16px;
  }
  
  .header-content {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .scan-stats {
    flex-direction: column;
    gap: 16px;
  }
  
  .preset-option {
    padding: 12px 8px;
  }
  
  .summary-card {
    flex-direction: column;
    text-align: center;
  }
  
  .summary-icon {
    margin-right: 0;
    margin-bottom: 8px;
  }
  
  .preset-options {
    flex-direction: column;
    gap: 8px;
  }
  
  .tech-priority-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  
  .tech-item {
    min-height: 60px;
    padding: 8px 4px;
  }
  
  .tech-name {
    font-size: 10px;
  }
  
  .tech-priority {
    font-size: 9px;
  }
  
  .config-section {
    margin-bottom: 24px;
    padding-bottom: 16px;
  }
  
  .preset-card {
    min-height: 70px;
    padding: 12px;
  }
  
  .preset-icon {
    font-size: 20px;
    margin-right: 10px;
  }
  
  .preset-title {
    font-size: 13px;
  }
  
  .preset-desc {
    font-size: 11px;
  }
}

/* 端口选择对话框样式 */
.port-selection-content {
  padding: 0;
}

.port-input-group {
  display: flex;
  align-items: center;
}

.port-conflict-warning {
  margin-top: 8px;
}

.port-info-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
}

.port-info-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 已添加应用的行样式 */
:deep(.added-app-row) {
  background-color: #f5f7fa;
  opacity: 0.85;
}

:deep(.added-app-row:hover) {
  background-color: #ebeef5 !important;
}

/* 表格控制区域样式优化 */
.table-controls {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

.table-controls .el-button {
  white-space: nowrap;
}
</style>
