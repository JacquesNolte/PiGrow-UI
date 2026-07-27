<script setup lang="ts">
import { computed, ref } from 'vue'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useApiStore } from '../stores/apiStore'
import { useNutrientStore } from '../stores/nutrientStore'
import { extractApiError } from '../utils/errors'
import { dosingWarningLabel } from '../utils/dosingWarnings'
import type { DosingWarningCode } from '../types/grow'

interface DosingPreviewResult {
  mlByNutrientId: Record<string, number>
  totalMl: number
  warnings: DosingWarningCode[]
}

const props = defineProps<{ growPhaseId: string; modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const apiStore = useApiStore()
const nutrientStore = useNutrientStore()
const reservoirLiters = ref(1)
const loading = ref(false)
const result = ref<DosingPreviewResult | null>(null)
const error = ref<string | null>(null)

const nutrientById = computed(() => new Map(nutrientStore.nutrients.map((n) => [n.id, n.name])))
const rows = computed(() =>
  Object.entries(result.value?.mlByNutrientId ?? {}).map(([nutrientId, ml]) => ({
    ml,
    name: nutrientById.value.get(nutrientId) ?? nutrientId,
    nutrientId,
  })),
)

async function calculate() {
  error.value = null
  loading.value = true
  try {
    result.value = await apiStore.dosing.preview(props.growPhaseId, {
      reservoirLiters: reservoirLiters.value,
    })
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to calculate dosing')
    error.value = message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="props.modelValue"
    header="Dosing Calculator"
    modal
    :style="{ width: '90vw', maxWidth: '480px' }"
    @update:visible="emit('update:modelValue', $event)"
  >
    <div class="form-stack">
      <div class="field">
        <label for="dosing-reservoir" class="field-label">Reservoir (liters)</label>
        <InputNumber
          inputId="dosing-reservoir"
          data-testid="reservoir-liters"
          v-model="reservoirLiters"
          :min="0"
          :max="100000"
          :step="0.1"
        />
      </div>
      <Button
        label="Calculate"
        icon="pi pi-calculator"
        data-testid="calculate-dosing"
        :loading="loading"
        @click="calculate"
      />
      <Message v-if="error" severity="error">{{ error }}</Message>

      <section v-if="result" data-testid="dosing-results" class="dosing-results">
        <div v-if="rows.length" class="dosing-rows">
          <div v-for="row in rows" :key="row.nutrientId" class="dosing-row">
            <span>{{ row.name }}</span>
            <strong>{{ row.ml.toFixed(2) }} ml</strong>
          </div>
        </div>
        <p v-else class="muted">No nutrient dosing configured for this phase.</p>
        <span data-testid="dosing-total" class="dosing-total">
          Total: {{ result.totalMl.toFixed(2) }} ml
        </span>
        <Message
          v-for="warning in result.warnings"
          :key="warning"
          data-testid="dosing-warning"
          severity="warn"
        >
          {{ dosingWarningLabel(warning) }}
        </Message>
      </section>
    </div>
  </Dialog>
</template>

<style scoped>
.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.dosing-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dosing-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.dosing-row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0;
}

.dosing-total {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-accent);
}
</style>
