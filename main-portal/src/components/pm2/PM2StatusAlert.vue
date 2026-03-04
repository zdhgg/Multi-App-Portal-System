<template>
  <!-- PM2未启用状态提示 -->
  <el-alert
    v-if="statusLoaded && !status.enabled"
    type="warning"
    :closable="false"
    class="pm2-status-alert"
  >
    <template #default>
      <div class="alert-content">
        <p class="alert-title">⚠️ PM2应用管理功能未启用</p>
        
        <!-- 未配置状态 -->
        <div v-if="status.needsConfig" class="status-section">
          <p class="status-desc">启用PM2功能以管理和监控部署的应用进程</p>
          <div class="action-buttons">
            <el-button type="primary" size="small" @click="$emit('enable')" :loading="enableLoading">
              ⚡ 快速启用
            </el-button>
            <el-button size="small" @click="$emit('showGuide')">
              📖 手动配置指南
            </el-button>
            <el-button text type="primary" @click="$emit('refresh')" size="small">
              <el-icon><Refresh /></el-icon>
            </el-button>
          </div>
        </div>
        
        <!-- 已配置但未重启状态 -->
        <div v-else class="status-section">
          <p class="status-desc">✅ 配置已完成，现在需要手动重启后端服务以生效</p>
          <ol class="restart-steps">
            <li>找到运行后端的终端窗口</li>
            <li>按 <code>Ctrl+C</code> 停止服务</li>
            <li>运行 <code>npm run dev</code> 重启</li>
            <li>刷新此页面验证</li>
          </ol>
          <div class="action-buttons">
            <el-button size="small" @click="$emit('showGuide')">
              📖 查看详细步骤
            </el-button>
            <el-button text type="primary" @click="$emit('refresh')" size="small">
              <el-icon><Refresh /></el-icon> 刷新状态
            </el-button>
          </div>
        </div>
      </div>
    </template>
  </el-alert>

  <!-- PM2已启用：显示简洁的状态标签 -->
  <div v-if="statusLoaded && status.enabled" class="enabled-badge">
    <el-tag type="success" effect="plain" size="small">
      <el-icon style="vertical-align: middle; margin-right: 4px;"><Check /></el-icon>
      PM2已启用
    </el-tag>
  </div>
</template>

<script setup lang="ts">
import { Refresh, Check } from '@element-plus/icons-vue'
import type { PM2StatusResponse } from '@/services/pm2Api'

defineProps<{
  status: PM2StatusResponse
  statusLoaded: boolean
  enableLoading?: boolean
}>()

defineEmits<{
  (e: 'enable'): void
  (e: 'refresh'): void
  (e: 'showGuide'): void
}>()
</script>

<style scoped>
.pm2-status-alert {
  margin-bottom: 20px;
}

.alert-content {
  line-height: 1.8;
}

.alert-title {
  margin: 0 0 12px 0;
  font-weight: 500;
  font-size: 14px;
}

.status-section {
  margin-top: 8px;
}

.status-desc {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: #606266;
}

.enabled-badge {
  /* 在页面标题右侧显示 */
}

.restart-steps {
  margin: 0 0 12px 0;
  padding-left: 24px;
  font-size: 13px;
  color: #606266;
}

.restart-steps li {
  margin-bottom: 6px;
}

.restart-steps code {
  background: #f4f4f5;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
