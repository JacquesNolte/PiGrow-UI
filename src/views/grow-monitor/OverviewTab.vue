<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import { useApiStore } from '../../stores/apiStore'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Rating from 'primevue/rating'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import HarvestLogDialog from '../../components/HarvestLogDialog.vue'
import type { HarvestLog } from '../../types/grow'

const state = useProvidedGrowMonitorState()
const router = useRouter()
const toast = useToast()
const apiStore = useApiStore()

const harvestLog = ref<HarvestLog | null>(null)
const harvestVisible = ref(false)

async function fetchHarvestLog() {
  const id = state.cycleId.value
  if (!id) {
    harvestLog.value = null
    return
  }
  try {
    harvestLog.value = await apiStore.harvestLogs.get(id)
  } catch {}
}

onMounted(() => {
  void fetchHarvestLog()
})

function onHarvestSaved(log: HarvestLog) {
  harvestLog.value = log
  harvestVisible.value = false
}

async function onDeviceToggle(deviceId: string, val: boolean, pin: number) {
  const result = await state.onDeviceToggle(deviceId, val, pin)
  if (!result.ok) {
    toast.add({
      detail: result.reason,
      life: 5000,
      severity: 'error',
      summary: 'Command failed',
    })
  }
}

function openEnvEditor() {
  if (state.currentCycle.value?.id) {
    router.push(`/admin/grows/edit/${state.currentCycle.value.id}`)
  }
}

const setupRows = computed(() => {
  const c = state.currentCycle.value
  return [
    { label: 'Strain', value: c?.plantStrain ?? null },
    {
      label: 'Plants',
      value: c?.numberOfPlants != null ? String(c.numberOfPlants) : null,
    },
    { label: 'Type', value: c?.plantType ?? null },
    { label: 'Medium', value: c?.growMedium ?? null },
    { label: 'Medium Brand', value: c?.growMediumBrand ?? null },
    { label: 'Seed Brand', value: c?.seedBrand ?? null },
  ]
})
</script>

<template>
  <div class="overview-tab">
    <HarvestLogDialog
      v-model:visible="harvestVisible"
      :cycle-id="state.cycleId.value"
      @saved="onHarvestSaved"
    />

    <Card v-if="harvestLog">
      <template #title>
        <div class="section-title-row">
          <span>Harvest</span>
          <Button
            label="Edit"
            icon="pi pi-pencil"
            text
            size="small"
            severity="secondary"
            data-testid="overview-edit-harvest"
            @click="harvestVisible = true"
          />
        </div>
      </template>
      <template #content>
        <div class="harvest-grid">
          <div class="harvest-metric">
            <span class="harvest-label">Yield</span>
            <span class="harvest-value">
              {{ harvestLog.yieldGrams != null ? `${harvestLog.yieldGrams} g` : '—' }}
            </span>
          </div>
          <div class="harvest-metric">
            <span class="harvest-label">Quality</span>
            <Rating
              :modelValue="harvestLog.qualityRating ?? 0"
              readonly
              data-testid="overview-harvest-rating"
            />
          </div>
          <div v-if="harvestLog.pestOrDiseaseNotes" class="harvest-note">
            <span class="harvest-label">Pest / disease</span>
            <span class="harvest-text">{{ harvestLog.pestOrDiseaseNotes }}</span>
          </div>
          <div v-if="harvestLog.whatWorked" class="harvest-note">
            <span class="harvest-label">What worked</span>
            <span class="harvest-text">{{ harvestLog.whatWorked }}</span>
          </div>
          <div v-if="harvestLog.whatToImprove" class="harvest-note">
            <span class="harvest-label">What to improve</span>
            <span class="harvest-text">{{ harvestLog.whatToImprove }}</span>
          </div>
        </div>
      </template>
    </Card>

    <Card v-else-if="state.isGrowComplete.value" class="harvest-prompt-card">
      <template #content>
        <div class="harvest-prompt">
          <div class="harvest-prompt-text">
            <i class="pi pi-trophy" />
            <span>Grow complete — record the harvest.</span>
          </div>
          <Button
            label="Log harvest"
            icon="pi pi-trophy"
            severity="success"
            data-testid="overview-log-harvest"
            @click="harvestVisible = true"
          />
        </div>
      </template>
    </Card>

    <Card>
      <template #title>Grow Setup</template>
      <template #content>
        <div class="setup-grid">
          <div v-for="row in setupRows" :key="row.label" class="setup-row">
            <span class="setup-label">{{ row.label }}</span>
            <span :class="row.value ? 'setup-value' : 'setup-value setup-value--muted'">
              {{ row.value ?? 'Not set' }}
            </span>
          </div>
        </div>
      </template>
    </Card>

    <Card>
      <template #title>
        <div class="section-title-row">
          <span>Climate</span>
          <span
            v-if="state.liveTelemetry.connected.value"
            class="socket-badge socket-badge--live"
            v-tooltip.top="'Receiving live telemetry'"
          >
            <i class="pi pi-circle-on"></i> Live
          </span>
          <span
            v-else
            class="socket-badge socket-badge--offline"
            v-tooltip.top="'No telemetry connection'"
          >
            <i class="pi pi-circle-off"></i> Offline
          </span>
        </div>
      </template>
      <template #content>
        <div class="climate-grid">
          <div class="hero-metric" v-tooltip.top="'Temperature sensor'">
            <i class="pi pi-sun hero-metric-icon"></i>
            <div class="hero-metric-info">
              <span v-if="state.liveTelemetry.connected.value" class="hero-metric-value">
                {{ state.temperatureC.value.toFixed(1) }}<span class="hero-metric-unit">°C</span>
              </span>
              <span v-else class="hero-metric-value hero-metric-value--offline">—</span>
              <span class="hero-metric-label">Temperature</span>
            </div>
          </div>
          <div class="hero-metric" v-tooltip.top="'Humidity sensor'">
            <i class="pi pi-cloud hero-metric-icon"></i>
            <div class="hero-metric-info">
              <span v-if="state.liveTelemetry.connected.value" class="hero-metric-value">
                {{ state.humidityPercent.value.toFixed(0) }}<span class="hero-metric-unit">%</span>
              </span>
              <span v-else class="hero-metric-value hero-metric-value--offline">—</span>
              <span class="hero-metric-label">Humidity</span>
            </div>
          </div>
          <div class="hero-metric" v-tooltip.top="'CO₂ sensor'">
            <i class="pi pi-globe hero-metric-icon"></i>
            <div class="hero-metric-info">
              <span v-if="state.liveTelemetry.connected.value" class="hero-metric-value">
                {{ state.co2Ppm.value.toFixed(0) }}<span class="hero-metric-unit">ppm</span>
              </span>
              <span v-else class="hero-metric-value hero-metric-value--offline">—</span>
              <span class="hero-metric-label">CO₂</span>
            </div>
          </div>
          <div class="hero-metric" v-tooltip.top="'EC sensor'">
            <i class="pi pi-bolt hero-metric-icon"></i>
            <div class="hero-metric-info">
              <span v-if="state.liveTelemetry.connected.value" class="hero-metric-value">
                {{ state.ecMs.value.toFixed(0) }}<span class="hero-metric-unit">µS/cm</span>
              </span>
              <span v-else class="hero-metric-value hero-metric-value--offline">—</span>
              <span class="hero-metric-label">Water EC</span>
            </div>
          </div>
          <div class="hero-metric" v-tooltip.top="'pH sensor'">
            <i class="pi pi-chart-line hero-metric-icon"></i>
            <div class="hero-metric-info">
              <span v-if="state.liveTelemetry.connected.value" class="hero-metric-value">
                {{ state.phValue.value.toFixed(1) }}<span class="hero-metric-unit">pH</span>
              </span>
              <span v-else class="hero-metric-value hero-metric-value--offline">—</span>
              <span class="hero-metric-label">Water pH</span>
            </div>
          </div>
        </div>
      </template>
    </Card>

    <Card>
      <template #title>Devices</template>
      <template #content>
        <div v-if="state.growDevices.value.length" class="device-grid">
          <div
            v-for="device in state.growDevices.value"
            :key="device.id"
            class="device-tile"
            :class="{ active: state.deviceToggles[device.id!] }"
          >
            <span class="device-name">{{ device.name }}</span>
            <ToggleSwitch
              :modelValue="state.deviceToggles[device.id!]"
              @update:modelValue="
                (val: boolean) => onDeviceToggle(device.id!, val, device.pinNumber)
              "
            />
          </div>
        </div>
        <div v-else class="empty-state">No devices configured for this grow cycle.</div>
      </template>
    </Card>

    <Card>
      <template #title>
        <div class="env-card-title">
          <span>Environment — {{ state.activePhaseName.value }}</span>
          <Tag
            v-if="state.activePhaseIndex.value >= 0 && state.activeEnvConfigured.value"
            :value="state.activePeriod.value"
            severity="success"
            rounded
            v-tooltip.top="'Currently active day/night period'"
          />
          <span
            v-if="state.activePhaseIndex.value >= 0"
            class="light-schedule"
            v-tooltip.top="'Light cycle for this phase'"
          >
            <i class="pi pi-sun light-schedule-icon"></i>
            {{ state.lightScheduleText.value }}
          </span>
          <span v-if="state.lightCountdownText.value" class="light-countdown">
            {{ state.lightCountdownText.value }}
          </span>
          <Button
            v-if="state.currentCycle.value?.id"
            label="Edit"
            icon="pi pi-pencil"
            text
            size="small"
            severity="secondary"
            class="env-edit-btn"
            @click="openEnvEditor"
          />
        </div>
      </template>
      <template #content>
        <div v-if="state.activeEnv.value.loading" class="env-loading">
          <i class="pi pi-spin pi-spinner" /> Loading environment…
        </div>
        <div v-else-if="!state.activeEnvConfigured.value" class="empty-state">
          No environment configured for this phase.
          <Button
            v-if="state.currentCycle.value?.id"
            label="Configure now"
            severity="success"
            size="small"
            @click="openEnvEditor"
          />
        </div>
        <div v-else class="env-stack">
          <div
            v-for="period in ['DAY', 'NIGHT'] as const"
            :key="period"
            class="env-block"
            :class="{ 'env-block--active': period === state.activePeriod.value }"
          >
            <div class="env-block-header">
              <span class="env-block-title">{{ period }}</span>
              <Tag
                v-if="period === state.activePeriod.value"
                value="Active now"
                severity="success"
                rounded
              />
            </div>
            <div class="env-block-rows">
              <div class="env-row">
                <span class="env-row-label">Temperature</span>
                <span class="env-row-target">
                  {{ state.fmtTarget(state.envFor(period)?.tempTarget ?? null) }} °C
                </span>
                <span class="env-row-range">
                  {{
                    state.fmtRange(
                      state.envFor(period)?.tempMin ?? null,
                      state.envFor(period)?.tempMax ?? null,
                    )
                  }}
                  °C
                </span>
              </div>
              <div class="env-row">
                <span class="env-row-label">Humidity</span>
                <span class="env-row-target">
                  {{ state.fmtTarget(state.envFor(period)?.humidityTarget ?? null) }} %
                </span>
                <span class="env-row-range">
                  {{
                    state.fmtRange(
                      state.envFor(period)?.humidityMin ?? null,
                      state.envFor(period)?.humidityMax ?? null,
                    )
                  }}
                  %
                </span>
              </div>
              <div class="env-row">
                <span class="env-row-label">CO₂</span>
                <span class="env-row-target">
                  {{ state.fmtTarget(state.envFor(period)?.co2Target ?? null) }} ppm
                </span>
                <span class="env-row-range">
                  {{
                    state.fmtRange(
                      state.envFor(period)?.co2Min ?? null,
                      state.envFor(period)?.co2Max ?? null,
                    )
                  }}
                  ppm
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.overview-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.setup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3) var(--space-5);
}

.setup-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.setup-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.setup-value {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-primary);
}

.setup-value--muted {
  color: var(--color-text-muted);
  font-weight: 400;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.section-meta {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* Climate */

.climate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-4);
}

.hero-metric {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) var(--ease-default);
}

.hero-metric:hover {
  border-color: var(--color-border-active);
}

.hero-metric-icon {
  font-size: 1.5rem;
  color: var(--color-accent);
  flex-shrink: 0;
}

.hero-metric-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hero-metric-value {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--tracking-tight);
}

.hero-metric-value--offline {
  color: var(--color-text-muted);
  font-weight: 400;
}

.hero-metric-unit {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
  font-weight: 400;
  margin-left: 2px;
}

.hero-metric-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.socket-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
}

.socket-badge--live {
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid var(--color-success-border);
}

.socket-badge--offline {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
}

/* Devices */

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.device-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition:
    border-color var(--duration-fast) var(--ease-default),
    background var(--duration-fast) var(--ease-default);
}

.device-tile.active {
  border-color: var(--color-device-active-border);
  background: var(--color-device-active-bg);
}

.device-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

/* Environment */

.env-card-title {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  width: 100%;
}

.light-schedule {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

.light-schedule-icon {
  color: var(--color-accent);
}

.light-countdown {
  font-size: var(--text-sm);
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-weight: 500;
}

.env-edit-btn {
  margin-left: auto;
}

.env-loading,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
  gap: var(--space-3);
}

.env-stack {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
}

.env-block {
  padding: var(--space-4);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--duration-fast) var(--ease-default);
}

.env-block--active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent-bg);
}

.env-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-3);
}

.env-block-title {
  font-weight: 600;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-size: var(--text-sm);
}

.env-block-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.env-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-1) 0;
}

.env-row-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.env-row-target {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.env-row-range {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

/* Harvest */

.harvest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-4);
}

.harvest-metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.harvest-note {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}

.harvest-label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.harvest-value {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}

.harvest-text {
  font-size: var(--text-base);
  color: var(--color-text-primary);
  white-space: pre-wrap;
}

.harvest-prompt-card {
  border-color: var(--color-success-border);
  background: var(--color-success-bg);
}

.harvest-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.harvest-prompt-text {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-primary);
  font-weight: 500;
}

.harvest-prompt-text .pi {
  color: var(--color-success);
  font-size: 1.25rem;
}
</style>
