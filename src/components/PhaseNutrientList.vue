<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import type {
  CreatePhaseNutrientPayload,
  PhaseNutrient,
  UpdatePhaseNutrientPayload,
} from '../types/grow'
import { useApiStore } from '../stores/apiStore'
import { extractApiError } from '../utils/errors'

const props = defineProps<{
  growPhaseId: string
  readonly?: boolean
}>()

const store = useApiStore()
const toast = useToast()
const confirm = useConfirm()

const phaseNutrients = ref<PhaseNutrient[]>([])
const loading = ref(false)
const saving = ref(false)
const deletingId = ref<string | null>(null)

const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const draftNutrientId = ref<string | null>(null)
const draftDose = ref<number>(0)

const nutrientById = computed(() => {
  const m = new Map<string, (typeof store.nutrients)[number]>()
  for (const n of store.nutrients) {
    m.set(n.id, n)
  }
  return m
})

const rows = computed(() => phaseNutrients.value.slice().sort((a, b) => a.sortOrder - b.sortOrder))

const nutrientOptions = computed(() => {
  const usedIds = new Set(phaseNutrients.value.map((pn) => pn.nutrientId))
  return store.nutrients.filter((n) => !usedIds.has(n.id))
})

const hasNutrientsAvailable = computed(() => nutrientOptions.value.length > 0)

const isEdit = computed(() => editingId.value !== null)

const canSaveDialog = computed(
  () => draftNutrientId.value !== null && draftDose.value > 0 && !saving.value,
)

function resetDialog() {
  dialogOpen.value = false
  editingId.value = null
  draftNutrientId.value = null
  draftDose.value = 0
}

function openCreate() {
  resetDialog()
  dialogOpen.value = true
}

function openEdit(row: PhaseNutrient) {
  resetDialog()
  editingId.value = row.id
  draftNutrientId.value = row.nutrientId
  draftDose.value = row.doseMlPerL
  dialogOpen.value = true
}

function nameFor(nutrientId: string): string {
  return nutrientById.value.get(nutrientId)?.name ?? nutrientId
}

function nextSortOrder(): number {
  if (phaseNutrients.value.length === 0) {
    return 1
  }
  return Math.max(...phaseNutrients.value.map((pn) => pn.sortOrder)) + 1
}

async function loadForPhase() {
  if (!props.growPhaseId) {
    return
  }
  loading.value = true
  try {
    const list = await store.phaseNutrients.fetchForPhase(props.growPhaseId)
    phaseNutrients.value = list
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to load phase nutrients')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Load failed' })
  } finally {
    loading.value = false
  }
}

watch(
  () => props.growPhaseId,
  () => {
    void loadForPhase()
  },
)

onMounted(() => {
  void loadForPhase()
  if (store.nutrients.length === 0) {
    void store.fetchNutrients()
  }
})

async function saveDialog() {
  if (!canSaveDialog.value || !props.growPhaseId || draftNutrientId.value === null) {
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const updatePayload: UpdatePhaseNutrientPayload = {
        doseMlPerL: draftDose.value,
      }
      const updated = await store.phaseNutrients.updateOne(
        props.growPhaseId,
        editingId.value,
        updatePayload,
      )
      toast.add({
        detail: `${nameFor(updated.nutrientId)} updated.`,
        life: 3000,
        severity: 'success',
        summary: 'Saved',
      })
    } else {
      const createPayload: CreatePhaseNutrientPayload = {
        doseMlPerL: draftDose.value,
        nutrientId: draftNutrientId.value,
        sortOrder: nextSortOrder(),
      }
      const created = await store.phaseNutrients.addOne(props.growPhaseId, createPayload)
      toast.add({
        detail: `${nameFor(created.nutrientId)} added.`,
        life: 3000,
        severity: 'success',
        summary: 'Created',
      })
    }
    await loadForPhase()
    dialogOpen.value = false
  } catch (error) {
    const { status, message } = extractApiError(error, 'Failed to save phase nutrient')
    if (status === 409) {
      toast.add({
        detail: message,
        life: 6000,
        severity: 'warn',
        summary: 'Duplicate',
      })
      return
    }
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
  } finally {
    saving.value = false
  }
}

function onDelete(row: PhaseNutrient) {
  const label = nameFor(row.nutrientId)
  confirm.require({
    accept: () => deleteConfirmed(row),
    acceptLabel: 'Delete',
    acceptProps: { severity: 'danger' },
    header: `Delete ${label}`,
    icon: 'pi pi-exclamation-triangle',
    message: `Remove the entry for "${label}"?`,
    rejectLabel: 'Cancel',
  })
}

async function deleteConfirmed(row: PhaseNutrient) {
  if (!props.growPhaseId) {
    return
  }
  deletingId.value = row.id
  try {
    await store.phaseNutrients.removeOne(props.growPhaseId, row.id)
    phaseNutrients.value = phaseNutrients.value.filter((pn) => pn.id !== row.id)
    toast.add({
      detail: `${nameFor(row.nutrientId)} removed.`,
      life: 3000,
      severity: 'success',
      summary: 'Deleted',
    })
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to delete phase nutrient')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  } finally {
    deletingId.value = null
  }
}

defineExpose({
  deleteConfirmed,
  loadForPhase,
  nameFor,
  nutrientById,
  phaseNutrients,
  rows,
})
</script>

<template>
  <ConfirmDialog />
  <div v-if="!growPhaseId" class="locked-hint">
    <i class="pi pi-lock" /> Save the grow first to configure nutrient dosing.
  </div>
  <div v-else-if="loading" class="loading">
    <i class="pi pi-spin pi-spinner" /> Loading phase nutrients…
  </div>
  <div v-else class="phase-nutrient-list">
    <Card class="phase-card">
      <template #title>
        <div class="phase-header">
          <Tag value="PHASE-WIDE" severity="success" rounded />
          <span class="phase-title">Phase nutrient dosing</span>
          <Button
            v-if="!readonly"
            label="Add"
            icon="pi pi-plus"
            size="small"
            severity="success"
            data-testid="pn-add"
            :disabled="!hasNutrientsAvailable"
            @click="openCreate"
          />
        </div>
      </template>
      <template #content>
        <div v-if="rows.length > 0" class="rows">
          <div v-for="row in rows" :key="row.id" class="row">
            <span class="nutrient-name" :data-testid="`pn-name-${row.id}`">{{
              nameFor(row.nutrientId)
            }}</span>
            <span class="meta-code" :data-testid="`pn-dose-${row.id}`"
              >{{ row.doseMlPerL }} mL/L</span
            >
            <span class="muted order">#{{ row.sortOrder }}</span>
            <div v-if="!readonly" class="row-actions">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                size="small"
                :data-testid="`pn-edit-${row.id}`"
                aria-label="Edit nutrient"
                :disabled="deletingId === row.id"
                @click="openEdit(row)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :data-testid="`pn-delete-${row.id}`"
                aria-label="Delete nutrient"
                :disabled="deletingId === row.id"
                @click="onDelete(row)"
              />
            </div>
          </div>
        </div>
        <div v-else class="empty-state">
          <span class="pi pi-flask empty-icon" />
          <p v-if="!readonly">
            No nutrients configured for this phase. Click <strong>Add</strong> to start.
          </p>
          <p v-else>No nutrients configured for this phase.</p>
        </div>
      </template>
    </Card>

    <Dialog
      v-if="!readonly"
      v-model:visible="dialogOpen"
      :header="isEdit ? 'Edit phase nutrient' : 'Add phase nutrient'"
      :style="{ width: '90vw', maxWidth: '480px' }"
      modal
      dismissable-mask
      class="pn-dialog"
      @hide="resetDialog"
    >
      <div class="form-stack">
        <div class="field">
          <label for="pn-nutrient" class="field-label">Nutrient</label>
          <Select
            inputId="pn-nutrient"
            v-model="draftNutrientId"
            :options="nutrientOptions"
            option-label="name"
            option-value="id"
            placeholder="Select a nutrient"
            class="full-width"
            data-testid="pn-nutrient-select"
          />
        </div>
        <div class="field">
          <label for="pn-dose" class="field-label">Dose (mL per L)</label>
          <InputNumber
            inputId="pn-dose"
            v-model="draftDose"
            :min="0"
            :step="0.1"
            :max="100"
            show-buttons
            data-testid="pn-dose"
            class="full-width"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text :disabled="saving" @click="resetDialog" />
        <Button
          :label="isEdit ? 'Save changes' : 'Add nutrient'"
          :loading="saving"
          :disabled="!canSaveDialog"
          data-testid="pn-save"
          @click="saveDialog"
        />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.phase-nutrient-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.phase-card {
  width: 100%;
}

.phase-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
}

.phase-title {
  font-size: var(--text-md);
  font-weight: 500;
  flex: 1;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
}

.nutrient-name {
  font-weight: 500;
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
}

.muted {
  color: var(--color-text-muted);
}

.order {
  font-size: var(--text-xs);
}

.row-actions {
  display: inline-flex;
  gap: var(--space-1);
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
  gap: var(--space-2);
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-sm);
}

.loading,
.locked-hint {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  padding: var(--space-6);
  justify-content: center;
}

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
</style>
