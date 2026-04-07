<template>
  <div class="progress-monitor">
    <div class="progress-hero">
      <div class="progress-title">
        <el-icon class="rotating"><Loading /></el-icon>
        <div>
          <h3>{{ props.isScanning ? '正在批量发现应用' : '扫描已结束' }}</h3>
          <p>
            {{ props.isScanning
              ? '扫描任务正在后台执行，完成后会自动显示结果。当前版本不提供文件级实时进度。'
              : '后台扫描已停止，您可以返回配置页重新开始，或等待结果页展示已完成数据。'
            }}
          </p>
        </div>
      </div>

      <div class="progress-actions">
        <el-tag :type="props.isScanning ? 'primary' : 'info'" size="small">
          {{ props.isScanning ? '后台扫描中' : '等待结束' }}
        </el-tag>
        <el-button
          v-if="props.isScanning"
          size="small"
          type="danger"
          :loading="cancelling"
          @click="cancelScan"
        >
          取消等待
        </el-button>
      </div>
    </div>

    <el-alert
      class="progress-alert"
      type="info"
      :closable="false"
      show-icon
      :title="`扫描任务 ID：${props.scanId || '未提供'}`"
    >
      <template #default>
        <span>如果扫描目录较大，通常会需要几十秒到几分钟；页面会在任务结束后自动切换到结果列表。</span>
      </template>
    </el-alert>

    <div class="progress-checklist">
      <article class="check-item">
        <strong>1. 遍历目录</strong>
        <span>查找可能包含应用的项目目录。</span>
      </article>
      <article class="check-item">
        <strong>2. 聚合项目</strong>
        <span>识别前后端关系并整理成可导入项目。</span>
      </article>
      <article class="check-item">
        <strong>3. 准备导入</strong>
        <span>生成结果列表，供后续批量导入到应用管理。</span>
      </article>
    </div>

    <div class="progress-note">
      <span>更适合单个应用时，建议直接回到“应用管理 > 添加应用”。</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Loading } from '@element-plus/icons-vue'

const props = defineProps<{
  isScanning: boolean
  scanId?: string
}>()

const emit = defineEmits<{
  'cancel': []
}>()

const cancelling = ref(false)

const cancelScan = async () => {
  cancelling.value = true
  emit('cancel')
}
</script>

<style scoped>
.progress-monitor {
  padding: 24px;
  background: linear-gradient(180deg, #f8fbff 0%, #f4f6fb 100%);
  border: 1px solid #e4eaf3;
  border-radius: 16px;
}

.progress-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
}

.progress-title {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.progress-title h3 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #1f2d3d;
}

.progress-title p {
  margin: 0;
  color: #5f6b7a;
  line-height: 1.6;
}

.progress-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.progress-alert {
  margin-bottom: 20px;
}

.progress-checklist {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.check-item {
  padding: 16px;
  background: #fff;
  border: 1px solid #e8edf5;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item strong {
  color: #243447;
  font-size: 14px;
}

.check-item span {
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.progress-note {
  margin-top: 16px;
  color: #7a8699;
  font-size: 13px;
}

.rotating {
  color: #409eff;
  font-size: 22px;
  margin-top: 2px;
  animation: rotate 1.6s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .progress-hero {
    flex-direction: column;
  }

  .progress-checklist {
    grid-template-columns: 1fr;
  }
}
</style>
