<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApiStore } from '../stores/apiStore'
import { useToast } from 'primevue/usetoast'
import { extractApiError } from '../utils/errors'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import type { GrowCycleListItem } from '../types/grow'

const store = useApiStore()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

onMounted(() => {
  store.fetchAll()
})

function growSetupSummary(cycle: GrowCycleListItem): string {
  const parts: string[] = []
  if (cycle.plantStrain) parts.push(cycle.plantStrain)
  if (cycle.numberOfPlants) parts.push(`${cycle.numberOfPlants}×`)
  if (cycle.growMedium) parts.push(cycle.growMedium)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function confirmDeleteController(id: string, name: string) {
  confirm.require({
    accept: () => deleteController(id, name),
    acceptLabel: 'Delete controller',
    acceptProps: { severity: 'danger' },
    header: `Delete "${name}"`,
    icon: 'pi pi-exclamation-triangle',
    message:
      'This will permanently delete the controller and all its registered devices, sensors, and grow-cycle history. This cannot be undone.',
    rejectLabel: 'Cancel',
  })
}

async function deleteController(id: string, name: string) {
  try {
    await store.deleteController(id)
    toast.add({
      detail: `Controller "${name}" deleted`,
      life: 3000,
      severity: 'success',
      summary: 'Deleted',
    })
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to delete controller')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  }
}

function confirmDeleteGrowCycle(id: string, name: string) {
  confirm.require({
    accept: () => deleteGrowCycle(id, name),
    acceptLabel: 'Delete grow cycle',
    acceptProps: { severity: 'danger' },
    header: `Delete "${name}"`,
    icon: 'pi pi-exclamation-triangle',
    message:
      'This will permanently delete the grow cycle, all its phases, environment targets, automation rules, and telemetry history. This cannot be undone.',
    rejectLabel: 'Cancel',
  })
}

async function deleteGrowCycle(id: string, name: string) {
  try {
    await store.deleteGrowCycle(id)
    toast.add({
      detail: `Grow cycle "${name}" deleted`,
      life: 3000,
      severity: 'success',
      summary: 'Deleted',
    })
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to delete grow cycle')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  }
}
</script>

<template>
  <ConfirmDialog />
  <div class="admin-page">
    <Card>
      <template #title>
        <div class="section-header">
          <span>Controllers</span>
          <div class="header-actions">
            <Button
              label="Scan for Controllers"
              icon="pi pi-wifi"
              size="small"
              severity="info"
              outlined
              @click="router.push('/admin/controllers/scan')"
            />
            <Button
              label="New Controller"
              icon="pi pi-plus"
              size="small"
              severity="success"
              @click="router.push('/admin/controllers/new')"
            />
          </div>
        </div>
      </template>
      <template #content>
        <DataTable v-if="store.controllers.length > 0" :value="store.controllers" size="small">
          <Column field="name" header="Name" sortable style="font-weight: 600"></Column>
          <Column field="ipAddress" header="IP Address" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.ipAddress }}</code>
            </template>
          </Column>
          <Column field="macAddress" header="MAC Address" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.macAddress }}</code>
            </template>
          </Column>
          <Column header="Actions" style="width: 140px">
            <template #body="slotProps">
              <div class="row-actions">
                <Button
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  size="small"
                  aria-label="Edit"
                  @click="router.push(`/admin/controllers/edit/${slotProps.data.id}`)"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  aria-label="Delete"
                  @click="confirmDeleteController(slotProps.data.id, slotProps.data.name)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

        <div v-else class="empty-state">
          <span class="pi pi-server empty-icon" aria-hidden="true"></span>
          <p>
            No controllers registered yet. Click <strong>Scan for Controllers</strong> to claim a
            new Pi over the LAN, or <strong>New Controller</strong> to add one by hand.
          </p>
        </div>
      </template>
    </Card>

    <Card>
      <template #title>
        <div class="section-header">
          <span>Grow Cycles</span>
          <Button
            label="New Grow Cycle"
            icon="pi pi-plus"
            size="small"
            severity="success"
            @click="router.push('/admin/grows/new')"
          />
        </div>
      </template>
      <template #content>
        <DataTable v-if="store.growCycles.length > 0" :value="store.growCycles" size="small">
          <Column field="name" header="Name" sortable style="font-weight: 600"></Column>
          <Column field="isActive" header="Status" sortable>
            <template #body="slotProps">
              <Tag
                :value="slotProps.data.isActive ? 'Running' : 'Idle'"
                :severity="slotProps.data.isActive ? 'success' : 'secondary'"
                rounded
              />
            </template>
          </Column>
          <Column field="startAt" header="Start Date" sortable>
            <template #body="slotProps">
              <code v-if="slotProps.data.startAt" class="meta-code">
                {{ slotProps.data.startAt }}
              </code>
              <span v-else class="muted">—</span>
            </template>
          </Column>
          <Column header="Grow Setup">
            <template #body="slotProps">
              <span v-if="growSetupSummary(slotProps.data) === '—'" class="muted">—</span>
              <span v-else class="grow-setup-summary">{{ growSetupSummary(slotProps.data) }}</span>
            </template>
          </Column>
          <Column header="Actions" style="width: 140px">
            <template #body="slotProps">
              <div class="row-actions">
                <Button
                  icon="pi pi-pencil"
                  severity="secondary"
                  text
                  rounded
                  size="small"
                  aria-label="Edit"
                  @click="router.push(`/admin/grows/edit/${slotProps.data.id}`)"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  aria-label="Delete"
                  @click="confirmDeleteGrowCycle(slotProps.data.id, slotProps.data.name)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

        <div v-else class="empty-state">
          <span class="pi pi-calendar empty-icon"></span>
          <p>
            No grow cycles defined yet. Click <strong>New Grow Cycle</strong> to plan your first
            one.
          </p>
        </div>
      </template>
    </Card>

    <Card>
      <template #title>
        <div class="section-header">
          <span>Nutrients</span>
          <Button
            label="Manage Nutrients"
            icon="pi pi-plus"
            size="small"
            severity="success"
            @click="router.push('/admin/nutrients')"
          />
        </div>
      </template>
      <template #content>
        <p class="nutrient-description">
          Maintain your nutrient library (FloraMicro, CalMag, etc.) for use across grow phases.
        </p>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.row-actions {
  display: flex;
  gap: var(--space-1);
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
  font-size: var(--text-sm);
}

.grow-setup-summary {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
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
}

.nutrient-description {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-md);
}
</style>
