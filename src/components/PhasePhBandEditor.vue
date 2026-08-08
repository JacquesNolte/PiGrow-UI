<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import type { GrowPhase } from '../types/grow'
import { useApiStore } from '../stores/apiStore'
import { extractApiError } from '../utils/errors'
import { useToast } from 'primevue/usetoast'

const props = defineProps<{ phase: GrowPhase }>()
const emit = defineEmits<{ updated: [phase: GrowPhase] }>()

const store = useApiStore()
const toast = useToast()

const phMin = ref<number | null>(props.phase.phMin ?? null)
const phTarget = ref<number | null>(props.phase.phTarget ?? null)
const phMax = ref<number | null>(props.phase.phMax ?? null)
const saving = ref(false)

const DEBOUNCE_MS = 350
type PhField = 'phMin' | 'phTarget' | 'phMax'
const debounceTimers: Partial<Record<PhField, ReturnType<typeof setTimeout>>> = {}
const pendingFields: Partial<Record<PhField, number | null>> = {}

watch(
  () => [props.phase.id, props.phase.phMin, props.phase.phTarget, props.phase.phMax] as const,
  ([id, min, target, max]) => {
    void id
    phMin.value = min ?? null
    phTarget.value = target ?? null
    phMax.value = max ?? null
  },
)

async function persist(field: PhField, value: number | null) {
  if (!props.phase.id) {
    return
  }
  saving.value = true
  try {
    const updated = await store.updateGrowPhase(props.phase.id, { [field]: value })
    emit('updated', updated)
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to save pH band')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
  } finally {
    saving.value = false
  }
}

function schedulePersist(field: PhField, value: number | null) {
  pendingFields[field] = value
  const existing = debounceTimers[field]
  if (existing) {
    clearTimeout(existing)
  }
  debounceTimers[field] = setTimeout(() => {
    const next = pendingFields[field] ?? null
    delete pendingFields[field]
    delete debounceTimers[field]
    void persist(field, next)
  }, DEBOUNCE_MS)
}

onBeforeUnmount(() => {
  for (const timer of Object.values(debounceTimers)) {
    if (timer) {
      clearTimeout(timer)
    }
  }
})
</script>

<template>
  <div class="phase-ph-editor">
    <div v-if="!phase.id" class="locked-hint">
      <i class="pi pi-lock" /> Save the grow first to configure pH bands.
    </div>
    <div v-else class="ph-fields">
      <div class="ph-help">
        <i class="pi pi-info-circle" />
        <span>These pH bands apply to both DAY and NIGHT periods for this phase.</span>
      </div>
      <span v-if="saving" class="saving-hint"> <i class="pi pi-spin pi-spinner" /> Saving… </span>
      <div class="ph-row">
        <div class="field">
          <label class="field-label" for="phase-ph-min">Min</label>
          <InputNumber
            input-id="phase-ph-min"
            data-testid="phase-ph-min"
            v-model="phMin"
            :min="0"
            :max="14"
            :step="0.01"
            :min-fraction-digits="2"
            :max-fraction-digits="2"
            placeholder="e.g. 5.8"
            show-buttons
            class="full-width"
            @update:model-value="(v) => schedulePersist('phMin', v ?? null)"
          />
          <small class="field-micro-hint">Acceptable lower bound</small>
        </div>
        <div class="field">
          <label class="field-label" for="phase-ph-target">Target</label>
          <InputNumber
            input-id="phase-ph-target"
            data-testid="phase-ph-target"
            v-model="phTarget"
            :min="0"
            :max="14"
            :step="0.01"
            :min-fraction-digits="2"
            :max-fraction-digits="2"
            placeholder="e.g. 6.2"
            show-buttons
            class="full-width"
            @update:model-value="(v) => schedulePersist('phTarget', v ?? null)"
          />
          <small class="field-micro-hint">Stored; not used by automation</small>
        </div>
        <div class="field">
          <label class="field-label" for="phase-ph-max">Max</label>
          <InputNumber
            input-id="phase-ph-max"
            data-testid="phase-ph-max"
            v-model="phMax"
            :min="0"
            :max="14"
            :step="0.01"
            :min-fraction-digits="2"
            :max-fraction-digits="2"
            placeholder="e.g. 6.5"
            show-buttons
            class="full-width"
            @update:model-value="(v) => schedulePersist('phMax', v ?? null)"
          />
          <small class="field-micro-hint">Acceptable upper bound</small>
        </div>
      </div>
      <p class="field-hint">Leave blank to leave the band unconstrained.</p>
    </div>
  </div>
</template>

<style scoped>
.phase-ph-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ph-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ph-help {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.saving-hint {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.ph-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.ph-row .field {
  min-width: 0;
}

.ph-row :deep(.p-inputnumber) {
  width: 100%;
}

.ph-row :deep(.p-inputnumber-input) {
  flex: 1 1 auto;
  min-width: 0;
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
  line-height: 1.2;
}

.field-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
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

.full-width {
  width: 100%;
}

@media (max-width: 720px) {
  .ph-row {
    grid-template-columns: 1fr;
  }
}
</style>
