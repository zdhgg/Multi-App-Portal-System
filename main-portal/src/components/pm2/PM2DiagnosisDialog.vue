<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :title="`${processName} - 诊断结果`"
    width="700px"
    :close-on-click-modal="false"
  >
    <div v-if="result" class="diagnosis-result">
      <!-- 状态概览 -->
      <el-alert
        :type="result.issues.length === 0 ? 'success' : 'error'"
        :title="result.issues.length === 0 ? '✅ 未发现明显问题' : `❌ 发现 ${result.issues.length} 个问题`"
        :closable="false"
        class="status-alert"
      />

      <!-- 问题列表 -->
      <div v-if="result.issues.length > 0" class="issues-section">
        <h4>检测到的问题：</h4>
        <div class="issue-list">
          <el-card 
            v-for="(issue, index) in result.issues" 
            :key="index"
            class="issue-card"
            :class="`severity-${issue.severity}`"
          >
            <div class="issue-header">
              <div class="issue-title">
                <el-tag :type="getSeverityType(issue.severity)" size="small">
                  {{ getSeverityText(issue.severity) }}
                </el-tag>
                <span class="issue-type">{{ getIssueTypeText(issue.type) }}</span>
                <strong>{{ issue.title }}</strong>
              </div>
              <el-tag v-if="issue.autoFixable" type="success" size="small">
                可自动修复
              </el-tag>
            </div>
            <div class="issue-description">{{ issue.description }}</div>
            <div class="issue-solution">
              <strong>解决方案：</strong>
              <p>{{ issue.solution }}</p>
              <pre v-if="issue.fixCommand" class="fix-command">{{ issue.fixCommand }}</pre>
            </div>
          </el-card>
        </div>
      </div>

      <!-- 修复建议 -->
      <div v-if="result.recommendations?.length" class="recommendations-section">
        <h4>💡 建议操作：</h4>
        <ul class="recommendations-list">
          <li v-for="(rec, index) in result.recommendations" :key="index">
            {{ rec }}
          </li>
        </ul>
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
      <el-button 
        v-if="hasAutoFixable"
        type="primary"
        @click="$emit('autoFix')"
        :loading="fixing"
      >
        <el-icon><Checked /></el-icon>
        自动修复
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Checked } from '@element-plus/icons-vue'
import type { PM2DiagnosticResult } from '@/services/pm2Api'

const props = defineProps<{
  modelValue: boolean
  result: PM2DiagnosticResult | null
  processName: string
  fixing?: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'autoFix'): void
}>()

const hasAutoFixable = computed(() => {
  return props.result?.issues.some(issue => issue.autoFixable) ?? false
})

const getSeverityType = (severity: string) => {
  const map: Record<string, string> = {
    critical: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'success'
  }
  return map[severity] || 'info'
}

const getSeverityText = (severity: string) => {
  const map: Record<string, string> = {
    critical: '严重',
    high: '高',
    medium: '中',
    low: '低'
  }
  return map[severity] || severity
}

const getIssueTypeText = (type: string) => {
  const map: Record<string, string> = {
    port_conflict: '端口冲突',
    missing_dependencies: '依赖缺失',
    config_error: '配置错误',
    path_error: '路径错误',
    startup_script_error: '启动脚本错误',
    permission_error: '权限错误'
  }
  return map[type] || type
}
</script>

<style scoped>
.diagnosis-result {
  max-height: 500px;
  overflow-y: auto;
}

.status-alert {
  margin-bottom: 20px;
}

.issues-section h4,
.recommendations-section h4 {
  margin: 16px 0 12px 0;
  color: #303133;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.issue-card {
  border-radius: 8px;
}

.issue-card.severity-critical {
  border-left: 4px solid #f56c6c;
}

.issue-card.severity-high {
  border-left: 4px solid #e6a23c;
}

.issue-card.severity-medium {
  border-left: 4px solid #409eff;
}

.issue-card.severity-low {
  border-left: 4px solid #67c23a;
}

.issue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.issue-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.issue-type {
  color: #909399;
  font-size: 13px;
}

.issue-description {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  color: #606266;
  margin-bottom: 12px;
}

.issue-solution {
  padding: 12px;
  background: #f0f9ff;
  border-radius: 4px;
  border-left: 3px solid #409eff;
}

.issue-solution strong {
  color: #303133;
}

.issue-solution p {
  margin: 8px 0;
  color: #606266;
}

.fix-command {
  margin: 8px 0 0 0;
  padding: 12px;
  background: #2c3e50;
  color: #67c23a;
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  overflow-x: auto;
}

.recommendations-list {
  margin: 0;
  padding-left: 24px;
  color: #606266;
  line-height: 1.8;
}
</style>
