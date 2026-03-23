<template>
  <el-dialog
    v-model="visible"
    title="关于系统"
    width="860px"
    :close-on-click-modal="true"
    class="about-dialog"
  >
    <!-- 系统信息 -->
    <div class="system-info">
      <div class="logo-section">
        <div class="logo-icon">🌐</div>
        <div class="logo-text">
          <h2>{{ versionInfo.name }}</h2>
          <div class="version-tag">v{{ versionInfo.version }}</div>
        </div>
      </div>
      <p class="description">{{ versionInfo.description }}</p>
      <div class="info-grid">
        <div class="info-item">
          <span class="label">构建日期</span>
          <span class="value">{{ versionInfo.buildDate }}</span>
        </div>
        <div class="info-item">
          <span class="label">运行环境</span>
          <span class="value">{{ browserInfo }}</span>
        </div>
      </div>
    </div>

    <div class="about-content">
      <el-tabs v-model="activeTab" class="about-tabs">
        <el-tab-pane name="changelog">
          <template #label>
            <span class="tab-label">
              <el-icon><Document /></el-icon>
              更新记录
            </span>
          </template>

          <div class="tab-panel">
            <div class="changelog-toolbar">
              <el-switch
                v-model="latestOnly"
                inline-prompt
                active-text="仅最新"
                inactive-text="全部版本"
              />
              <el-button
                link
                type="primary"
                size="small"
                @click="toggleExpandAll"
              >
                {{ allExpanded ? '收起全部' : '展开全部' }}
              </el-button>
            </div>

            <div class="changelog-scroll">
              <el-empty
                v-if="filteredChangelog.length === 0"
                description="暂无更新记录"
              />

              <el-timeline v-else>
                <el-timeline-item
                  v-for="entry in filteredChangelog"
                  :key="entry.version"
                  :timestamp="entry.date"
                  placement="top"
                  :type="entry.version === versionInfo.version ? 'primary' : 'info'"
                >
                  <div class="timeline-content">
                    <div class="version-header">
                      <span class="version-number">v{{ entry.version }}</span>
                      <span class="version-title">{{ entry.title }}</span>
                    </div>
                    <ul class="change-list">
                      <li
                        v-for="(item, index) in entry.items.slice(0, showAllChanges[entry.version] ? undefined : 3)"
                        :key="index"
                        :class="'change-' + item.type"
                      >
                        <el-tag :type="getTagType(item.type)" size="small" effect="plain">
                          {{ getTagLabel(item.type) }}
                        </el-tag>
                        {{ item.description }}
                      </li>
                    </ul>
                    <el-button
                      v-if="entry.items.length > 3"
                      link
                      type="primary"
                      size="small"
                      @click="toggleVersionExpand(entry.version)"
                    >
                      {{ showAllChanges[entry.version] ? '收起' : `查看更多 (${entry.items.length - 3} 项)` }}
                    </el-button>
                  </div>
                </el-timeline-item>
              </el-timeline>
            </div>
          </div>

        </el-tab-pane>

        <el-tab-pane name="help">
          <template #label>
            <span class="tab-label">
              <el-icon><QuestionFilled /></el-icon>
              操作帮助
            </span>
          </template>

          <div class="tab-panel">
            <el-collapse v-model="activeHelp" accordion>
              <el-collapse-item
                v-for="section in helpSections"
                :key="section.title"
                :name="section.title"
              >
                <template #title>
                  <span class="collapse-title">
                    <span class="help-icon">{{ section.icon }}</span>
                    {{ section.title }}
                  </span>
                </template>
                <ul class="help-list">
                  <li v-for="(item, index) in section.items" :key="index">
                    {{ item }}
                  </li>
                </ul>
              </el-collapse-item>
            </el-collapse>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <span class="copyright">© 2024-2025 Portal Team</span>
        <el-button type="primary" @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { QuestionFilled, Document } from '@element-plus/icons-vue'
import { VERSION_INFO } from '@/config/version'
import { CHANGELOG, HELP_SECTIONS } from '@/config/changelog'

// Props
const visible = defineModel<boolean>({ default: false })

// Data
const versionInfo = VERSION_INFO
const changelog = CHANGELOG
const helpSections = HELP_SECTIONS
const activeTab = ref('changelog')
const activeHelp = ref('')
const latestOnly = ref(true)
const showAllChanges = reactive<Record<string, boolean>>({})

// Computed
const browserInfo = computed(() => {
  const ua = navigator.userAgent
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return 'Unknown'
})

const filteredChangelog = computed(() => {
  if (latestOnly.value) {
    return changelog.slice(0, 1)
  }
  return changelog
})

const allExpanded = computed(() => {
  if (filteredChangelog.value.length === 0) {
    return false
  }
  return filteredChangelog.value.every(entry => showAllChanges[entry.version])
})

// Methods
function getTagType(type: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    feature: 'success',
    fix: 'danger',
    improvement: 'info',
    breaking: 'warning'
  }
  return map[type] || 'info'
}

function getTagLabel(type: string): string {
  const map: Record<string, string> = {
    feature: '新功能',
    fix: '修复',
    improvement: '优化',
    breaking: '重大'
  }
  return map[type] || type
}

function toggleVersionExpand(version: string): void {
  showAllChanges[version] = !showAllChanges[version]
}

function toggleExpandAll(): void {
  const nextValue = !allExpanded.value
  filteredChangelog.value.forEach(entry => {
    showAllChanges[entry.version] = nextValue
  })
}
</script>

<style scoped>
.about-dialog :deep(.el-dialog) {
  max-width: 92vw;
}

.about-dialog :deep(.el-dialog__body) {
  padding: 20px 24px;
  max-height: 75vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 系统信息 */
.system-info {
  text-align: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.logo-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 12px;
}

.logo-icon {
  font-size: 48px;
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-radius: 16px;
  color: white;
}

.logo-text h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.version-tag {
  display: inline-block;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  margin-top: 4px;
}

.description {
  color: #606266;
  margin: 12px 0;
}

.info-grid {
  display: flex;
  justify-content: center;
  gap: 32px;
  margin-top: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item .label {
  font-size: 12px;
  color: #909399;
}

.info-item .value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

/* 内容区域 */
.about-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.about-tabs {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.about-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.about-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tab-panel {
  height: 100%;
  max-height: 46vh;
  overflow-y: auto;
  padding-right: 8px;
}

.tab-panel::-webkit-scrollbar {
  width: 6px;
}

.tab-panel::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

/* 操作帮助 */
.collapse-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  font-size: 18px;
}

.help-list {
  margin: 0;
  padding-left: 20px;
  color: #606266;
}

.help-list li {
  margin: 8px 0;
  line-height: 1.6;
}

/* 更新记录 */
.changelog-toolbar {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.changelog-scroll {
  max-height: 100%;
}

.timeline-content {
  padding: 4px 0;
}

.version-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.version-number {
  font-weight: 600;
  color: #409eff;
  font-size: 15px;
}

.version-title {
  color: #303133;
  font-weight: 500;
}

.change-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.change-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}

.change-list li .el-tag {
  flex-shrink: 0;
  margin-top: 2px;
}

@media (max-width: 768px) {
  .info-grid {
    gap: 12px;
    flex-direction: column;
  }

  .tab-panel {
    max-height: 50vh;
    padding-right: 4px;
  }
}

/* 底部 */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.copyright {
  font-size: 12px;
  color: #909399;
}
</style>
