<script setup lang="ts">
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import type { Nutrient } from '../types/grow'

defineProps<{
  nutrients: Nutrient[]
  busyId?: string | null
}>()

const emit = defineEmits<{
  edit: [nutrient: Nutrient]
  remove: [nutrient: Nutrient]
}>()

function onEdit(nutrient: Nutrient) {
  emit('edit', nutrient)
}

function onRemove(nutrient: Nutrient) {
  emit('remove', nutrient)
}
</script>

<template>
  <DataTable
    v-if="nutrients.length > 0"
    :value="nutrients"
    data-key="id"
    size="small"
    class="nutrient-table"
  >
    <Column field="name" header="Name" sortable style="font-weight: 600">
      <template #body="slotProps">
        <span>{{ slotProps.data.name }}</span>
      </template>
    </Column>
    <Column field="brand" header="Brand" sortable>
      <template #body="slotProps">
        <span v-if="slotProps.data.brand">{{ slotProps.data.brand }}</span>
        <span v-else class="muted">—</span>
      </template>
    </Column>
    <Column header="Notes">
      <template #body="slotProps">
        <span v-if="slotProps.data.notes" class="nutrient-notes">
          {{ slotProps.data.notes }}
        </span>
        <span v-else class="muted">—</span>
      </template>
    </Column>
    <Column header="Actions" style="width: 120px">
      <template #body="slotProps">
        <div class="row-actions">
          <Button
            icon="pi pi-pencil"
            severity="secondary"
            text
            rounded
            size="small"
            aria-label="Edit nutrient"
            :disabled="busyId === slotProps.data.id"
            @click="onEdit(slotProps.data)"
          />
          <Button
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            size="small"
            aria-label="Delete nutrient"
            :disabled="busyId === slotProps.data.id"
            @click="onRemove(slotProps.data)"
          />
        </div>
      </template>
    </Column>
  </DataTable>

  <div v-else class="empty-state">
    <span class="pi pi-flask empty-icon" />
    <p>
      No nutrients defined yet. Click <strong>New Nutrient</strong> to add one — nutrients are
      referenced by phase nutrient dosing records and cannot be deleted while in use.
    </p>
  </div>
</template>

<style scoped>
.nutrient-table {
  margin-bottom: var(--space-4);
}

.nutrient-notes {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.row-actions {
  display: flex;
  gap: var(--space-1);
}

.muted {
  color: var(--color-text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-bg-elevated);
}

.empty-icon {
  font-size: 2rem;
  margin-bottom: var(--space-3);
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}
</style>
