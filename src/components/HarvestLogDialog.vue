<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Rating from 'primevue/rating'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { useApiStore } from '../stores/apiStore'
import { extractApiError } from '../utils/errors'
import type { HarvestLog } from '../types/grow'

const props = defineProps<{ cycleId: string }>()
const emit = defineEmits<{ (e: 'saved', log: HarvestLog): void }>()

const apiStore = useApiStore()
const toast = useToast()

const visible = defineModel<boolean>('visible', { default: false })
const loading = ref(false)
const saving = ref(false)
const isEdit = ref(false)

const yieldGrams = ref<number | null>(null)
const qualityRating = ref<number | null>(null)
const qualityRatingModel = computed<number | undefined>({
  get: () => qualityRating.value ?? undefined,
  set: (next) => {
    qualityRating.value = next ?? null
  },
})
const pestOrDiseaseNotes = ref('')
const whatWorked = ref('')
const whatToImprove = ref('')

function resetForm() {
  yieldGrams.value = null
  qualityRating.value = null
  pestOrDiseaseNotes.value = ''
  whatWorked.value = ''
  whatToImprove.value = ''
  isEdit.value = false
}

async function loadHarvestLog() {
  loading.value = true
  resetForm()
  try {
    const log = await apiStore.harvestLogs.get(props.cycleId)
    if (log) {
      yieldGrams.value = log.yieldGrams
      qualityRating.value = log.qualityRating
      pestOrDiseaseNotes.value = log.pestOrDiseaseNotes ?? ''
      whatWorked.value = log.whatWorked ?? ''
      whatToImprove.value = log.whatToImprove ?? ''
      isEdit.value = true
    }
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to load harvest log')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Load failed' })
  } finally {
    loading.value = false
  }
}

watch(
  visible,
  (open) => {
    if (open) {
      void loadHarvestLog()
    }
  },
  { immediate: true },
)

const canSave = computed(
  () =>
    !saving.value &&
    !loading.value &&
    (yieldGrams.value != null ||
      qualityRating.value != null ||
      pestOrDiseaseNotes.value.trim() !== '' ||
      whatWorked.value.trim() !== '' ||
      whatToImprove.value.trim() !== ''),
)

async function save() {
  if (!canSave.value) {
    return
  }
  saving.value = true
  try {
    const saved = await apiStore.harvestLogs.upsert(props.cycleId, {
      yieldGrams: yieldGrams.value,
      qualityRating: qualityRating.value,
      pestOrDiseaseNotes: pestOrDiseaseNotes.value.trim() || null,
      whatWorked: whatWorked.value.trim() || null,
      whatToImprove: whatToImprove.value.trim() || null,
    })
    toast.add({ detail: 'Harvest log saved.', life: 3000, severity: 'success', summary: 'Saved' })
    emit('saved', saved)
    visible.value = false
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to save harvest log')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="isEdit ? 'Edit harvest log' : 'Log harvest'"
    :style="{ width: '90vw', maxWidth: '560px' }"
    modal
    dismissable-mask
    class="harvest-log-dialog"
  >
    <div v-if="loading" class="loading-state">
      <i class="pi pi-spin pi-spinner" /> Loading harvest log…
    </div>
    <div v-else class="form-stack">
      <div class="field">
        <label class="field-label" for="hld-yield">Yield (g)</label>
        <div class="yield-row">
          <InputNumber
            inputId="hld-yield"
            data-testid="hld-yield"
            v-model="yieldGrams"
            :min="0"
            :max="1000000"
            :step="1"
            :min-fraction-digits="0"
            :max-fraction-digits="0"
            allow-empty
            class="full-width"
          />
          <span class="yield-suffix">g</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label">Quality</label>
        <Rating v-model="qualityRatingModel" data-testid="hld-rating" />
      </div>

      <div class="field">
        <label class="field-label" for="hld-pest">Pest or disease notes</label>
        <Textarea
          inputId="hld-pest"
          data-testid="hld-pest"
          v-model="pestOrDiseaseNotes"
          :maxlength="2000"
          auto-resize
          rows="3"
          class="full-width"
        />
      </div>

      <div class="field">
        <label class="field-label" for="hld-worked">What worked</label>
        <Textarea
          inputId="hld-worked"
          data-testid="hld-worked"
          v-model="whatWorked"
          :maxlength="2000"
          auto-resize
          rows="3"
          class="full-width"
        />
      </div>

      <div class="field">
        <label class="field-label" for="hld-improve">What to improve</label>
        <Textarea
          inputId="hld-improve"
          data-testid="hld-improve"
          v-model="whatToImprove"
          :maxlength="2000"
          auto-resize
          rows="3"
          class="full-width"
        />
      </div>
    </div>
    <template #footer>
      <Button
        label="Cancel"
        severity="secondary"
        text
        :disabled="saving"
        @click="visible = false"
      />
      <Button
        :label="isEdit ? 'Save changes' : 'Log harvest'"
        :loading="saving"
        :disabled="!canSave"
        data-testid="hld-save"
        @click="save"
      />
    </template>
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

.full-width {
  width: 100%;
}

.yield-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.yield-suffix {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--color-text-muted);
}
</style>
