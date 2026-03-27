<template>
  <div class="operation-header">
    <section class="operation-toolbar" :class="{ 'has-side-panel': hasSidePanel }">
      <div class="operation-toolbar-copy">
        <span v-if="statusLabel" class="operation-toolbar-label">{{ statusLabel }}</span>

        <div v-if="normalizedChips.length > 0" class="operation-meta">
          <span
            v-for="chip in normalizedChips"
            :key="chip.key ?? chip.text"
            class="operation-chip"
            :class="[`operation-chip-${chip.tone || 'default'}`]"
          >
            {{ chip.text }}
          </span>
        </div>
      </div>

      <div v-if="hasSidePanel || hasActions" class="operation-toolbar-side">
        <div v-if="hasSidePanel" class="operation-toolbar-panel">
          <slot name="side"></slot>
        </div>

        <div v-if="hasActions" class="operation-toolbar-actions">
          <slot name="actions"></slot>
        </div>
      </div>
    </section>

    <section v-if="normalizedSnapshots.length > 0" class="operation-snapshot-grid" aria-label="页面快照">
      <article
        v-for="snapshot in normalizedSnapshots"
        :key="snapshot.key ?? snapshot.label"
        class="operation-snapshot"
        :class="[`operation-snapshot-${snapshot.tone || 'default'}`]"
      >
        <div v-if="snapshot.icon" class="operation-snapshot-icon">
          <component :is="snapshot.icon" />
        </div>

        <span class="operation-snapshot-label">{{ snapshot.label }}</span>
        <strong
          class="operation-snapshot-value"
          :class="{ 'is-small': snapshot.valueSize === 'small' }"
        >
          {{ formatValue(snapshot.value) }}
        </strong>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots, type Component } from 'vue'

type ChipTone = 'default' | 'muted' | 'warning' | 'success'
type SnapshotTone = 'default' | 'highlight' | 'success' | 'warning' | 'danger'
type SnapshotValueSize = 'default' | 'small'

interface OperationHeaderChip {
  key?: string | number
  text: string
  tone?: ChipTone
}

interface OperationHeaderSnapshot {
  key?: string | number
  label: string
  value: string | number
  icon?: Component
  tone?: SnapshotTone
  valueSize?: SnapshotValueSize
}

const props = withDefaults(defineProps<{
  statusLabel?: string
  chips?: OperationHeaderChip[]
  snapshots?: OperationHeaderSnapshot[]
}>(), {
  statusLabel: '',
  chips: () => [],
  snapshots: () => []
})

const slots = useSlots()

const normalizedChips = computed(() => props.chips)
const normalizedSnapshots = computed(() => props.snapshots)
const hasActions = computed(() => Boolean(slots.actions))
const hasSidePanel = computed(() => Boolean(slots.side))

const formatValue = (value: string | number) => (
  typeof value === 'number' ? value.toLocaleString('zh-CN') : value
)
</script>

<style scoped>
.operation-header {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.operation-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.16);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.operation-toolbar.has-side-panel {
  align-items: flex-start;
}

.operation-toolbar-copy {
  flex: 1;
  min-width: 0;
}

.operation-toolbar-label {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.05);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.operation-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.operation-chip {
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

.operation-chip-muted {
  color: var(--text-tertiary);
}

.operation-chip-warning {
  color: var(--warning-600, #d97706);
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.18);
}

.operation-chip-success {
  color: var(--success-600, #16a34a);
  background: rgba(34, 197, 94, 0.08);
  border-color: rgba(34, 197, 94, 0.16);
}

.operation-toolbar-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.operation-toolbar-panel {
  min-width: min(360px, 100%);
}

.operation-toolbar-panel :deep(.pm2-status-alert) {
  margin-bottom: 0;
}

.operation-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.operation-toolbar-actions :deep(.el-button) {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-weight: 700;
}

.operation-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
}

.operation-snapshot {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(148, 163, 184, 0.14);
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.05);
}

.operation-snapshot-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(14, 165, 233, 0.16));
  border-radius: 10px;
  color: var(--primary-600);
  flex-shrink: 0;
}

.operation-snapshot-label {
  margin-right: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.operation-snapshot-value {
  margin-left: auto;
  color: var(--text-strong);
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.operation-snapshot-value.is-small {
  font-size: 15px;
  letter-spacing: 0;
}

.operation-snapshot-highlight .operation-snapshot-icon {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(59, 130, 246, 0.18));
}

.operation-snapshot-success .operation-snapshot-icon {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.14), rgba(16, 185, 129, 0.18));
  color: var(--success-600, #16a34a);
}

.operation-snapshot-warning {
  background: rgba(255, 251, 235, 0.92);
  border-color: rgba(245, 158, 11, 0.22);
}

.operation-snapshot-warning .operation-snapshot-icon,
.operation-snapshot-danger .operation-snapshot-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(251, 191, 36, 0.2));
  color: var(--warning-600, #d97706);
}

.operation-snapshot-danger {
  background: rgba(254, 242, 242, 0.92);
  border-color: rgba(239, 68, 68, 0.18);
}

.operation-snapshot-danger .operation-snapshot-icon {
  background: linear-gradient(135deg, rgba(248, 113, 113, 0.16), rgba(239, 68, 68, 0.22));
  color: var(--danger-500, #dc2626);
}

@media (max-width: 980px) {
  .operation-toolbar,
  .operation-toolbar-side {
    flex-direction: column;
    align-items: flex-start;
  }

  .operation-toolbar-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .operation-toolbar-panel {
    min-width: 100%;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .operation-header {
    gap: 16px;
  }

  .operation-toolbar {
    padding: 18px;
    border-radius: 24px;
  }

  .operation-snapshot-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .operation-toolbar-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
