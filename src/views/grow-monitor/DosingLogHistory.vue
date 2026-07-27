<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useApiStore } from '../../stores/apiStore'
import { useNutrientStore } from '../../stores/nutrientStore'
import { extractApiError } from '../../utils/errors'
import { dosingWarningLabel } from '../../utils/dosingWarnings'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import type { DosingLog, DosingWarningCode } from '../../types/grow'

const props = defineProps<{ growPhaseId: string }>()

const apiStore = useApiStore()
const nutrientStore = useNutrientStore()
const state = useProvidedGrowMonitorState()
const confirm = useConfirm()
const toast = useToast()

const logs = ref<DosingLog[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const nutrientById = computed(() => new Map(nutrientStore.nutrients.map((n) => [n.id, n.name])))

function nameFor(nutrientId: string): string {
  return nutrientById.value.get(nutrientId) ?? nutrientId
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString()
}

function fmtNullable(value: number | null, suffix = ''): string {
  if (value === null) {
    return '—'
  }
  return `${value}${suffix}`
}

async function load() {
  if (!props.growPhaseId) {
    logs.value = []
    return
  }
  loading.value = true
  error.value = null
  try {
    logs.value = await apiStore.dosingLogs.list(props.growPhaseId)
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to load dosing logs')
    error.value = message
    logs.value = []
  } finally {
    loading.value = false
  }
}

function prepend(log: DosingLog) {
  if (logs.value.some((entry) => entry.id === log.id)) {
    return
  }
  logs.value = [log, ...logs.value]
}

defineExpose({ prepend, load })

function onDelete(log: DosingLog) {
  confirm.require({
    header: 'Delete dosing log',
    message: `Delete the batch logged ${fmtTimestamp(log.createdAt)}? This cannot be undone.`,
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => void doDelete(log.id),
  })
}

async function doDelete(id: string) {
  deletingId.value = id
  try {
    await apiStore.dosingLogs.remove(props.growPhaseId, id)
    logs.value = logs.value.filter((entry) => entry.id !== id)
    toast.add({ detail: 'Dosing log deleted', life: 4000, severity: 'info', summary: 'Deleted' })
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to delete dosing log')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  } finally {
    deletingId.value = null
  }
}

// Socket.IO realtime: refresh the list when a dosing_log_created event lands
// for this phase. The event carries only { id, growPhaseId, createdAt }, so
// we refetch the full list rather than reconstruct the log.
let attachedSocket: { off: (event: string, handler: (payload: unknown) => void) => void } | null =
  null
const socketHandler = (payload: { id: string; growPhaseId: string; createdAt: string }) => {
  if (payload?.growPhaseId && payload.growPhaseId === props.growPhaseId) {
    void load()
  }
}

watch(
  () => state.liveTelemetry.socket.value,
  (sock) => {
    if (attachedSocket) {
      attachedSocket.off('dosing_log_created', socketHandler as (payload: unknown) => void)
      attachedSocket = null
    }
    if (sock) {
      sock.on('dosing_log_created', socketHandler as (payload: unknown) => void)
      attachedSocket = sock
    }
  },
  { immediate: true },
)

watch(
  () => props.growPhaseId,
  () => {
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (attachedSocket) {
    attachedSocket.off('dosing_log_created', socketHandler as (payload: unknown) => void)
    attachedSocket = null
  }
})
</script>

<template>
  <ConfirmDialog />
  <Card class="dosing-log-history">
    <template #title>Batch history</template>
    <template #content>
      <div v-if="loading && !logs.length" class="state-msg">
        <i class="pi pi-spin pi-spinner" /> Loading dosing logs…
      </div>
      <div v-else-if="error" class="state-msg error">
        <i class="pi pi-exclamation-triangle" /> {{ error }}
        <Button label="Retry" severity="secondary" size="small" text @click="load" />
      </div>
      <div v-else-if="!logs.length" class="empty-state">
        <span class="pi pi-flask empty-icon" />
        <p>No batches logged for this phase yet. Log one above.</p>
      </div>
      <div v-else class="log-list">
        <div
          v-for="log in logs"
          :key="log.id"
          class="log-item"
          :data-testid="`dosing-log-${log.id}`"
        >
          <div class="log-head">
            <span class="log-time" :title="log.createdAt">{{ fmtTimestamp(log.createdAt) }}</span>
            <span class="meta-code">{{ log.waterVolumeLiters }} L</span>
            <span class="meta-code">{{ log.totalMl.toFixed(2) }} ml total</span>
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              :data-testid="`dosing-log-delete-${log.id}`"
              aria-label="Delete dosing log"
              :loading="deletingId === log.id"
              @click="onDelete(log)"
            />
          </div>

          <div v-if="log.lines.length" class="log-lines">
            <div v-for="line in log.lines" :key="line.id" class="log-line">
              <span class="log-line-name">{{ nameFor(line.nutrientId) }}</span>
              <span class="log-line-dose meta-code">
                {{ line.doseMlPerL }} ml/L → {{ line.computedMl.toFixed(2) }} ml
              </span>
            </div>
          </div>
          <p v-else class="muted">Plain water batch — no nutrients configured.</p>

          <div v-if="log.warnings.length" class="log-warnings">
            <Tag
              v-for="code in log.warnings"
              :key="code"
              :value="dosingWarningLabel(code as DosingWarningCode)"
              severity="warn"
              :data-testid="`dosing-log-warning-${log.id}`"
            />
          </div>

          <div class="log-meta">
            <span class="log-meta-pair">
              pH <span class="meta-code">{{ fmtNullable(log.measuredPh) }}</span>
            </span>
            <span class="log-meta-pair">
              EC <span class="meta-code">{{ fmtNullable(log.measuredEc) }}</span>
            </span>
          </div>
          <p v-if="log.notes" class="log-notes">{{ log.notes }}</p>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.dosing-log-history {
  width: 100%;
}

.state-msg {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  padding: var(--space-3);
}

.state-msg.error {
  color: var(--color-danger);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-bg-elevated);
  gap: var(--space-2);
}

.empty-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.log-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.log-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.log-time {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-right: auto;
}

.log-lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.log-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
}

.log-line-name {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.log-line-dose {
  font-size: var(--text-xs);
}

.log-warnings {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.log-meta {
  display: flex;
  gap: var(--space-4);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.log-meta-pair {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.log-notes {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  padding: var(--space-2);
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--color-border-active);
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0;
}
</style>
