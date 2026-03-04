<template>
  <div class="stats-bar">
    <div class="stat-item">
      <span class="stat-label">总进程</span>
      <span class="stat-value">{{ stats.total }}</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item online">
      <span class="stat-dot online"></span>
      <span class="stat-label">运行中</span>
      <span class="stat-value">{{ stats.online }}</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item stopped">
      <span class="stat-dot stopped"></span>
      <span class="stat-label">已停止</span>
      <span class="stat-value">{{ stats.stopped }}</span>
    </div>
    <div class="stat-divider"></div>
    <div class="stat-item error">
      <span class="stat-dot error"></span>
      <span class="stat-label">错误</span>
      <span class="stat-value">{{ stats.error }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface PM2Stats {
  total: number
  online: number
  stopped: number
  error: number
}

defineProps<{
  stats: PM2Stats
}>()
</script>

<style scoped>
.stats-bar {
  display: flex;
  align-items: center;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 12px 20px;
  margin-bottom: 16px;
  gap: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stat-dot.online {
  background: #67c23a;
}

.stat-dot.stopped {
  background: #909399;
}

.stat-dot.error {
  background: #f56c6c;
}

.stat-label {
  font-size: 14px;
  color: #606266;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.stat-divider {
  width: 1px;
  height: 20px;
  background: #dcdfe6;
}
</style>
