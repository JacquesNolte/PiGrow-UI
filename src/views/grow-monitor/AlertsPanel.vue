<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { useApiStore } from '../../stores/apiStore'
import { extractApiError } from '../../utils/errors'
import type { GrowAlert } from '../../types/grow'

const props = defineProps<{ visible: boolean; cycleId: string }>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: []
}>()

const store = useApiStore()

const alerts = ref<GrowAlert[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const resolvingIds = ref<Set<string>>(new Set())

function severityTag(sev: string): 'danger' | 'warn' | 'info' | 'secondary' {
  if (sev === 'critical') return 'danger'
  if (sev === 'warning') return 'warn'
  if (sev === 'info') return 'info'
  return 'secondary'
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const [open, resolved] = await Promise.all([
      store.alerts.list(props.cycleId, false),
      store.alerts.list(props.cycleId, true),
    ])
    alerts.value = [...open, ...resolved].toSorted(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    )
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to load alerts')
    error.value = message
    alerts.value = []
  } finally {
    loading.value = false
  }
}

async function toggleResolve(alert: GrowAlert) {
  const nextResolved = alert.resolvedAt === null
  const next = new Set(resolvingIds.value)
  next.add(alert.id)
  resolvingIds.value = next
  try {
    const updated = await store.alerts.setResolved(alert.id, nextResolved)
    alerts.value = alerts.value.map((entry) => (entry.id === updated.id ? updated : entry))
    emit('changed')
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to update alert')
    error.value = message
  } finally {
    const cleaned = new Set(resolvingIds.value)
    cleaned.delete(alert.id)
    resolvingIds.value = cleaned
  }
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      void load()
    }
  },
  { immediate: true },
)
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: 'min(640px, 96vw)' }"
    header="Grow alerts"
    data-testid="alerts-panel"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="loading" class="alerts-loading" data-testid="alerts-loading">
      <ProgressSpinner />
      <p>Loading alerts…</p>
    </div>
    <div v-else-if="error" class="alerts-error" data-testid="alerts-error">
      <Message severity="error" :closable="false">{{ error }}</Message>
      <Button
        label="Retry"
        icon="pi pi-refresh"
        severity="secondary"
        size="small"
        data-testid="alerts-retry"
        @click="load"
      />
    </div>
    <div v-else-if="alerts.length === 0" class="alerts-empty" data-testid="alerts-empty">
      <i class="pi pi-check-circle" />
      <p>No alerts for this grow cycle.</p>
    </div>
    <div v-else class="alerts-list" data-testid="alerts-list">
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="alert-row"
        :class="{ resolved: alert.resolvedAt != null }"
        :data-testid="`alert-row-${alert.id}`"
      >
        <div class="alert-row-main">
          <div class="alert-row-tags">
            <Tag :value="alert.severity" :severity="severityTag(alert.severity)" />
            <Tag :value="alert.category" severity="secondary" />
            <Tag v-if="alert.resolvedAt" value="resolved" severity="success" />
          </div>
          <p class="alert-message">{{ alert.message }}</p>
          <span class="alert-detected">{{ new Date(alert.detectedAt).toLocaleString() }}</span>
        </div>
        <Button
          :label="alert.resolvedAt ? 'Unresolve' : 'Resolve'"
          :icon="alert.resolvedAt ? 'pi pi-undo' : 'pi pi-check'"
          :loading="resolvingIds.has(alert.id)"
          :disabled="resolvingIds.has(alert.id)"
          size="small"
          :severity="alert.resolvedAt ? 'secondary' : 'success'"
          :data-testid="`alert-toggle-${alert.id}`"
          @click="toggleResolve(alert)"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.alerts-loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  color: var(--color-text-secondary);
}

.alerts-loading p {
  margin: 0;
  font-size: var(--text-md);
}

.alerts-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-bg);
}

.alerts-empty {
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

.alerts-empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.alerts-empty p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.alert-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.alert-row.resolved {
  opacity: 0.65;
}

.alert-row.resolved .alert-message {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.alert-row-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  flex: 1;
}

.alert-row-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.alert-message {
  margin: 0;
  font-size: var(--text-md);
  color: var(--color-text-primary);
  word-break: break-word;
}

.alert-detected {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
