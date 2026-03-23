<template>
  <div class="stats-grid">
    <article class="stat-card">
      <span class="stat-label">总进程</span>
      <strong class="stat-value">{{ stats.total }}</strong>
      <span class="stat-help">当前由 PM2 托管的全部进程数量</span>
    </article>

    <article class="stat-card stat-card-success">
      <span class="stat-label">运行中</span>
      <div class="stat-inline">
        <span class="stat-dot online"></span>
        <strong class="stat-value">{{ stats.online }}</strong>
      </div>
      <span class="stat-help">处于在线并可提供服务的进程</span>
    </article>

    <article class="stat-card">
      <span class="stat-label">已停止</span>
      <div class="stat-inline">
        <span class="stat-dot stopped"></span>
        <strong class="stat-value">{{ stats.stopped }}</strong>
      </div>
      <span class="stat-help">可重新拉起或等待手动处理</span>
    </article>

    <article class="stat-card stat-card-danger">
      <span class="stat-label">错误</span>
      <div class="stat-inline">
        <span class="stat-dot error"></span>
        <strong class="stat-value">{{ stats.error }}</strong>
      </div>
      <span class="stat-help">建议优先查看日志和诊断结果</span>
    </article>
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
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px;
  border-radius: 22px;
  background: rgba(248, 250, 252, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.stat-card-success {
  background: linear-gradient(180deg, rgba(236, 253, 245, 0.92), rgba(255, 255, 255, 0.88));
}

.stat-card-danger {
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.92), rgba(255, 255, 255, 0.88));
}

.stat-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.stat-inline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.stat-dot.online {
  background: var(--success-500);
}

.stat-dot.stopped {
  background: var(--info-500);
}

.stat-dot.error {
  background: var(--danger-500);
}

.stat-value {
  color: var(--text-strong);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.stat-help {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
