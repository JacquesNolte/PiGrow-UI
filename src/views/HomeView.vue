<script setup lang="ts">
import { onMounted } from 'vue'
import { useApiStore } from '../stores/apiStore'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'

const store = useApiStore()

onMounted(() => {
  store.fetchAll()
})

const statusSeverity = (status: string) => (status === 'ONLINE' ? 'success' : 'danger')
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">Real-time Facility Monitor</h1>
        <p class="page-subtitle">Live overview of active grow cycles and controller nodes</p>
      </div>
      <div class="active-badge">
        <span class="dot"></span>
        <span>{{ store.growCycles.filter((g) => g.isActive).length }} active</span>
      </div>
    </header>

    <div class="cycle-grid">
      <div
        v-for="cycle in store.growCycles"
        :key="cycle.id"
        class="cycle-card-wrapper"
        @click="$router.push(`/grow/${cycle.id}`)"
      >
        <Card class="cycle-card">
          <template #title>{{ cycle.name }}</template>
          <template #subtitle>
            <div class="cycle-subtitle">
              <Tag
                :value="cycle.isActive ? 'Running' : 'Paused'"
                :severity="cycle.isActive ? 'success' : 'secondary'"
                rounded
              />
              <span v-if="cycle.controller" class="controller-link">
                {{ cycle.controller.name }}
              </span>
            </div>
          </template>
          <template #content>
            <p class="field-label">Linked Node IP</p>
            <code class="ip-address">
              {{
                store.controllers.find((c) => c.id === cycle.controllerId)?.ipAddress ||
                'Unassigned'
              }}
            </code>
            <div class="open-link">Open monitoring panel →</div>
          </template>
        </Card>
      </div>
    </div>

    <Card>
      <template #title>Controller Nodes</template>
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
          <Column field="status" header="Status" sortable>
            <template #body="slotProps">
              <Tag
                :value="slotProps.data.status || 'OFFLINE'"
                :severity="statusSeverity(slotProps.data.status)"
                rounded
              />
            </template>
          </Column>
        </DataTable>

        <div v-else class="empty-state">
          <span class="pi pi-server empty-icon" aria-hidden="true"></span>
          <p>No controller nodes are reporting. Register a controller in Admin to get started.</p>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-2);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  letter-spacing: var(--tracking-tight);
}

.page-subtitle {
  font-size: var(--text-md);
  color: var(--color-text-secondary);
  margin: var(--space-1) 0 0 0;
}

.active-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--color-accent-bg);
  color: var(--color-accent);
  padding: 0.375rem 0.875rem;
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  font-weight: 500;
  border: 1px solid var(--color-accent-border);
}

.active-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-glow);
  animation: pulse-dot 2s var(--ease-default) infinite;
}

.cycle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}

.cycle-card-wrapper {
  cursor: pointer;
  transition:
    transform var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out);
}

.cycle-card-wrapper:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow-strong);
}

.cycle-card {
  height: 100%;
  border-top: 2px solid var(--color-accent);
  background: var(--color-bg-surface);
  transition: border-color var(--duration-normal) var(--ease-default);
}

.cycle-card-wrapper:hover .cycle-card {
  border-top-color: var(--color-accent-hover);
}

.cycle-subtitle {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  margin-top: var(--space-1);
}

.controller-link {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

.field-label {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  margin: 0 0 0.375rem 0;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: 500;
}

.ip-address {
  background: var(--color-code-bg);
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-base);
  border: 1px solid var(--color-border);
}

.open-link {
  margin-top: var(--space-4);
  font-size: var(--text-base);
  color: var(--color-accent);
  font-weight: 500;
  transition: color var(--duration-fast) var(--ease-default);
}

.cycle-card-wrapper:hover .open-link {
  color: var(--color-accent-hover);
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
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
</style>
