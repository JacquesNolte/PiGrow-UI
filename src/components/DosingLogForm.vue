<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import { useApiStore } from '../stores/apiStore'
import { useNutrientStore } from '../stores/nutrientStore'
import { useToast } from 'primevue/usetoast'
import { extractApiError } from '../utils/errors'
import { dosingWarningLabel } from '../utils/dosingWarnings'
import type { DosingLog, DosingWarningCode } from '../types/grow'

const props = defineProps<{ growPhaseId: string }>()
const emit = defineEmits<{ created: [log: DosingLog] }>()

const apiStore = useApiStore()
const nutrientStore = useNutrientStore()
const toast = useToast()

const NOTES_MAX = 500
const PREVIEW_DEBOUNCE_MS = 350

const waterVolumeLiters = ref<number | null>(1)
const measuredPh = ref<number | null>(null)
const measuredEc = ref<number | null>(null)
const notes = ref<string>('')

const previewLoading = ref(false)
const preview = ref<{
  mlByNutrientId: Record<string, number>
  totalMl: number
  warnings: DosingWarningCode[]
} | null>(null)
const previewError = ref<string | null>(null)

const submitting = ref(false)
let previewTimer: ReturnType<typeof setTimeout> | null = null

const nutrientById = computed(() => new Map(nutrientStore.nutrients.map((n) => [n.id, n.name])))
const previewRows = computed(() =>
  Object.entries(preview.value?.mlByNutrientId ?? {}).map(([nutrientId, ml]) => ({
    ml,
    name: nutrientById.value.get(nutrientId) ?? nutrientId,
    nutrientId,
  })),
)

const volumeMissing = computed(() => waterVolumeLiters.value === null)
const notesTooLong = computed(() => notes.value.length > NOTES_MAX)
const canSubmit = computed(
  () =>
    Boolean(props.growPhaseId) && !volumeMissing.value && !notesTooLong.value && !submitting.value,
)

async function refreshPreview() {
  if (!props.growPhaseId || waterVolumeLiters.value === null) {
    preview.value = null
    return
  }
  previewLoading.value = true
  previewError.value = null
  try {
    preview.value = await apiStore.dosing.preview(props.growPhaseId, {
      reservoirLiters: waterVolumeLiters.value,
    })
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to preview dosing')
    previewError.value = message
    preview.value = null
  } finally {
    previewLoading.value = false
  }
}

function schedulePreview() {
  if (previewTimer) {
    clearTimeout(previewTimer)
  }
  previewTimer = setTimeout(() => {
    previewTimer = null
    void refreshPreview()
  }, PREVIEW_DEBOUNCE_MS)
}

watch(waterVolumeLiters, schedulePreview)
watch(
  () => props.growPhaseId,
  () => {
    void refreshPreview()
  },
  { immediate: true },
)

async function submit() {
  if (!canSubmit.value || waterVolumeLiters.value === null) {
    return
  }
  submitting.value = true
  try {
    const payload = {
      waterVolumeLiters: waterVolumeLiters.value,
      measuredPh: measuredPh.value,
      measuredEc: measuredEc.value,
      notes: notes.value.trim() || null,
    }
    const created = await apiStore.dosingLogs.create(props.growPhaseId, payload)
    emit('created', created)
    toast.add({ detail: 'Dosing log saved', life: 4000, severity: 'success', summary: 'Logged' })
    measuredPh.value = null
    measuredEc.value = null
    notes.value = ''
    await refreshPreview()
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to save dosing log')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
  } finally {
    submitting.value = false
  }
}

onBeforeUnmount(() => {
  if (previewTimer) {
    clearTimeout(previewTimer)
  }
})
</script>

<template>
  <div v-if="!growPhaseId" class="locked-hint">
    <i class="pi pi-lock" /> No active phase to log a batch for.
  </div>
  <Card v-else class="dosing-log-form">
    <template #title>Log water batch</template>
    <template #content>
      <div class="form-grid">
        <div class="field">
          <label class="field-label" for="dlf-volume">Water volume (L)</label>
          <InputNumber
            inputId="dlf-volume"
            data-testid="dlf-volume"
            v-model="waterVolumeLiters"
            :min="0"
            :max="100000"
            :step="0.1"
            :min-fraction-digits="0"
            :max-fraction-digits="3"
            show-buttons
            class="full-width"
          />
        </div>
        <div class="field">
          <label class="field-label" for="dlf-ph">Measured pH</label>
          <InputNumber
            inputId="dlf-ph"
            data-testid="dlf-ph"
            v-model="measuredPh"
            :min="0"
            :max="14"
            :step="0.01"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
            placeholder="optional"
            class="full-width"
          />
        </div>
        <div class="field">
          <label class="field-label" for="dlf-ec">Measured EC</label>
          <InputNumber
            inputId="dlf-ec"
            data-testid="dlf-ec"
            v-model="measuredEc"
            :min="0"
            :step="0.01"
            :min-fraction-digits="0"
            :max-fraction-digits="2"
            placeholder="optional"
            class="full-width"
          />
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="dlf-notes">Notes</label>
        <Textarea
          inputId="dlf-notes"
          data-testid="dlf-notes"
          v-model="notes"
          :maxlength="NOTES_MAX"
          auto-resize
          rows="2"
          class="full-width"
        />
        <small class="field-micro-hint">{{ notes.length }} / {{ NOTES_MAX }}</small>
      </div>

      <section class="preview" data-testid="dlf-preview" :aria-busy="previewLoading">
        <div v-if="previewLoading" class="preview-loading">
          <i class="pi pi-spin pi-spinner" /> Calculating doses…
        </div>
        <div v-else-if="previewError" class="preview-error">
          <Message severity="error" :closable="false">{{ previewError }}</Message>
        </div>
        <template v-else-if="preview">
          <div v-if="previewRows.length" class="preview-rows">
            <div v-for="row in previewRows" :key="row.nutrientId" class="preview-row">
              <span class="preview-name">{{ row.name }}</span>
              <span class="meta-code">{{ row.ml.toFixed(2) }} ml</span>
            </div>
          </div>
          <p v-else class="muted">No nutrient dosing configured for this phase.</p>
          <span data-testid="dlf-total" class="preview-total">
            Total: {{ preview.totalMl.toFixed(2) }} ml
          </span>
          <Message
            v-for="warning in preview.warnings"
            :key="warning"
            data-testid="dlf-warning"
            severity="warn"
            :closable="false"
          >
            {{ dosingWarningLabel(warning) }}
          </Message>
        </template>
      </section>

      <div class="form-actions">
        <Message v-if="volumeMissing" severity="error" :closable="false"
          >Water volume is required.</Message
        >
        <Message v-else-if="notesTooLong" severity="error" :closable="false">
          Notes must be {{ NOTES_MAX }} characters or fewer.
        </Message>
        <Button
          label="Log batch"
          icon="pi pi-check"
          data-testid="dlf-submit"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.dosing-log-form {
  width: 100%;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.field-micro-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.full-width {
  width: 100%;
}

.preview {
  margin-top: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.preview-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.preview-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
}

.preview-name {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
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

.preview-total {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-accent);
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0;
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}

.locked-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  padding: var(--space-3) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
}
</style>
