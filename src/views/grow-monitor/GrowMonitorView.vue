<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useApiStore } from '../../stores/apiStore'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import type { GrowPhase } from '../../types/grow'
import {
  useGrowMonitorState,
  provideGrowMonitorState,
  type GrowMonitorState,
} from './useGrowMonitorState'
import { extractApiError } from '../../utils/errors'
import {
  daysBetween,
  deriveActivePhaseIndex,
  deriveGrowActive,
  todayStr,
} from '../../utils/growDates'
import Button from 'primevue/button'
import Card from 'primevue/card'
import Tag from 'primevue/tag'
import Menu from 'primevue/menu'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import ConfirmDialog from 'primevue/confirmdialog'
import OverviewTab from './OverviewTab.vue'
import ExtendPhaseDialog from './ExtendPhaseDialog.vue'

const HistoryTab = defineAsyncComponent(() => import('./HistoryTab.vue'))
const PlanTab = defineAsyncComponent(() => import('./PlanTab.vue'))
const NutrientsTab = defineAsyncComponent(() => import('./NutrientsTab.vue'))
const LiveFeedTab = defineAsyncComponent(() => import('./LiveFeedTab.vue'))
const NotesTab = defineAsyncComponent(() => import('./NotesTab.vue'))

const router = useRouter()
const store = useApiStore()
const toast = useToast()
const confirm = useConfirm()

const state: GrowMonitorState = useGrowMonitorState()
provideGrowMonitorState(state)

// Destructure state values for use in the template (Vue auto-unwraps top-level
// refs in `<script setup>` templates, so we read `.value` once here and the
// template stays clean).
const {
  activePhaseIndex,
  activePhaseName,
  activePhaseSub,
  controllerStatusClass,
  currentCycle,
  cycleProgressPercent,
  cycleId,
  daysRemaining,
  elapsedDays,
  ending,
  estimatedHarvestDate,
  linkedController,
  skipping,
  totalDurationDays,
} = state

const activeTab = ref<'overview' | 'history' | 'plan' | 'nutrients' | 'live-feed' | 'notes'>(
  'overview',
)

const phaseMenu = useTemplateRef<InstanceType<typeof Menu>>('phaseMenu')
const showExtendDialog = ref(false)

function togglePhaseMenu(event: Event) {
  phaseMenu.value?.toggle(event)
}

function openExtendDialog() {
  showExtendDialog.value = true
}

const activePhase = computed<GrowPhase | null>(() => {
  const idx = state.activePhaseIndex.value
  if (idx < 0) {
    return null
  }
  return state.sortedPhases.value[idx] ?? null
})

const canExtendPhase = computed(
  () =>
    Boolean(state.currentCycle.value?.isActive) &&
    state.activePhaseIndex.value >= 0 &&
    !skipping.value &&
    !ending.value,
)

const phaseMenuItems = computed(() => {
  const items: {
    command: () => void
    disabled?: boolean
    icon: string
    label: string
  }[] = []

  if (canExtendPhase.value) {
    items.push({
      command: () => openExtendDialog(),
      disabled: skipping.value || ending.value,
      icon: 'pi pi-calendar-plus',
      label: 'Extend phase…',
    })
  }

  if (state.isOnLastPhase.value) {
    items.push({
      command: () => confirmEndGrow(),
      disabled: ending.value,
      icon: 'pi pi-trophy',
      label: 'End grow',
    })
  } else {
    items.push({
      command: () => confirmSkipPhase(),
      disabled: !state.canSkipPhase.value || skipping.value,
      icon: 'pi pi-forward',
      label: 'Skip to next phase',
    })
  }

  return items
})

function confirmSkipPhase() {
  if (!state.canSkipPhase.value) {
    return
  }
  const active = state.sortedPhases.value[activePhaseIndex.value]
  if (!active || !active.endAt) {
    return
  }
  const leftoverDays = daysBetween(todayStr(), active.endAt)
  const nextName = state.sortedPhases.value[activePhaseIndex.value + 1]?.name ?? 'next phase'
  confirm.require({
    accept: executeSkipPhase,
    acceptLabel: 'Skip phase',
    acceptProps: { severity: 'warn' },
    header: 'Skip to next phase',
    icon: 'pi pi-exclamation-triangle',
    message: `This will end "${active.name}" today and advance to "${nextName}". Approximately ${leftoverDays} day${leftoverDays === 1 ? '' : 's'} will be removed from the overall grow cycle. This cannot be undone.`,
    rejectLabel: 'Cancel',
  })
}

async function executeSkipPhase() {
  if (!cycleId.value) {
    return
  }
  skipping.value = true
  try {
    await store.skipGrowPhase(cycleId.value, todayStr())
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to skip grow phase')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Skip failed' })
    await store.fetchGrowCycle(cycleId.value)
  } finally {
    skipping.value = false
  }
}

function confirmEndGrow() {
  if (!state.isOnLastPhase.value) {
    return
  }
  const active = state.sortedPhases.value[activePhaseIndex.value]
  if (!active || !active.endAt) {
    return
  }
  const leftoverDays = daysBetween(todayStr(), active.endAt)
  confirm.require({
    accept: executeEndGrow,
    acceptLabel: 'End grow',
    acceptProps: { severity: 'danger' },
    header: 'End grow',
    icon: 'pi pi-exclamation-triangle',
    message: `This will end the grow cycle today. "${active.name}" will be trimmed to its elapsed days and the grow will be marked complete. Approximately ${leftoverDays} day${leftoverDays === 1 ? '' : 's'} will be removed from the overall cycle. This cannot be undone.`,
    rejectLabel: 'Cancel',
  })
}

async function executeEndGrow() {
  if (!cycleId.value) {
    return
  }
  ending.value = true
  try {
    await store.endGrow(cycleId.value, todayStr())
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to end grow')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'End failed' })
    await store.fetchGrowCycle(cycleId.value)
  } finally {
    ending.value = false
  }
}

// Lifecycle: shell owns sockets, polling, and phase reconciliation.
let envTickHandle: ReturnType<typeof setInterval> | null = null
let secondsTickHandle: ReturnType<typeof setInterval> | null = null
let staleCheckHandle: ReturnType<typeof setInterval> | null = null

async function reconcileGrowState(cycle: {
  id: string
  startAt: string | null
  isActive: boolean
  phases?: GrowPhase[]
}) {
  const phases = [...(cycle.phases ?? [])].toSorted((a, b) => a.order - b.order)

  function syncPhaseIntoCycle(updated: GrowPhase) {
    if (!updated.id) {
      return
    }
    const live: GrowPhase[] | undefined = currentCycle.value?.phases
    if (!live) {
      return
    }
    const liveIdx = live.findIndex((p: GrowPhase) => p.id === updated.id)
    if (liveIdx !== -1) {
      live[liveIdx] = { ...live[liveIdx], ...updated }
    }
  }

  const growActive = deriveGrowActive(cycle.startAt, phases)
  const storedActive = phases.find((p) => p.isActive)
  // Use the freshly-sorted local phases with a pure date calculation — NOT
  // the reactive `activePhaseIndex.value`, which would fall back to the
  // server-stored `isActive` flag when dates don't yet resolve.
  const idx = deriveActivePhaseIndex(phases)

  if (idx >= 0) {
    const target = phases[idx]
    if (target && target.id && (!storedActive || storedActive.id !== target.id)) {
      const updated = await store.activateGrowPhase(target.id)
      const localIdx = phases.findIndex((p) => p.id === updated.id)
      if (localIdx !== -1) {
        phases[localIdx] = { ...phases[localIdx], ...updated }
        syncPhaseIntoCycle(updated)
      }
    }
  } else if (storedActive && storedActive.id) {
    const updated = await store.updateGrowPhase(storedActive.id, { isActive: false })
    const localIdx = phases.findIndex((p) => p.id === updated.id)
    if (localIdx !== -1) {
      phases[localIdx] = { ...phases[localIdx], ...updated }
      syncPhaseIntoCycle(updated)
    }
  }

  if (cycle.isActive !== growActive) {
    try {
      await store.updateGrowCycle(cycle.id, { isActive: growActive })
    } catch (error) {
      const { message, status } = extractApiError(error, 'Failed to update grow cycle')
      if (status === 409) {
        toast.add({
          detail:
            'End the currently running grow on this controller before activating another one.',
          life: 8000,
          severity: 'error',
          summary: 'Controller busy',
        })
      } else {
        toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Update failed' })
      }
      return
    }
    const storeIdx = store.growCycles.findIndex((g) => g.id === cycle.id)
    if (storeIdx !== -1) {
      store.growCycles[storeIdx] = {
        ...store.growCycles[storeIdx],
        isActive: growActive,
      } as (typeof store.growCycles)[number]
    }
  }
}

onMounted(async () => {
  if (!cycleId.value) {
    return
  }
  envTickHandle = setInterval(() => {
    state.nowTick.value = Date.now()
  }, 60_000)
  secondsTickHandle = setInterval(() => {
    state.secondsTick.value = Date.now()
  }, 1000)

  const cycle = await store.fetchGrowCycle(cycleId.value)

  // The cycle detail response only carries `controller: { name, status }` — no
  // id, ipAddress, or macAddress. On a cold refresh `store.controllers` is
  // empty, so pushing that summary straight in leaves an id-less entry;
  // `fetchDevices()` then can't match it by id and silently drops every
  // device, and the device toggles vanish. Fetch the full controller record so
  // the store entry is matchable, then load + poll devices.
  if (cycle?.controllerId) {
    await store.fetchController(cycle.controllerId)
    await store.fetchDevices(cycle.controllerId)
    store.pollDevices(cycle.controllerId, 15_000)
  }

  // Start live telemetry + the realtime socket BEFORE phase reconciliation.
  // `reconcileGrowState()` can throw (e.g. activateGrowPhase/updateGrowPhase
  // network errors), and `start()` was previously called after it — so a throw
  // aborted onMounted with no socket and no `seedFromApi()`, leaving
  // temperature/humidity stuck at 0 until the next event. Seeding telemetry
  // and connecting the socket first decouples them from phase reconciliation.
  state.liveTelemetry.start()
  const sock = state.liveTelemetry.socket.value
  if (sock) {
    sock.on('device_state_update', state.handleDeviceStateUpdate)
    sock.on('connect', state.handleSocketReconnect)
  }

  try {
    await reconcileGrowState(cycle)
  } catch (error) {}
  await state.loadActivePhaseEnv()
  await state.automations.reload()

  // Stale device state detection — poll devices if a state update is missed.
  const STALE_STATE_MS = 30_000
  staleCheckHandle = setInterval(() => {
    const now = Date.now()
    const ctrlId = state.linkedController.value?.id
    if (!ctrlId) {
      return
    }
    for (const device of state.growDevices.value) {
      const last = state.lastDeviceStateUpdate[device.id!]
      if (last && now - last > STALE_STATE_MS) {
        store.fetchDevices(ctrlId)
        break
      }
    }
  }, 15_000)
})

onUnmounted(() => {
  if (envTickHandle) {
    clearInterval(envTickHandle)
    envTickHandle = null
  }
  if (secondsTickHandle) {
    clearInterval(secondsTickHandle)
    secondsTickHandle = null
  }
  if (staleCheckHandle) {
    clearInterval(staleCheckHandle)
    staleCheckHandle = null
  }
  store.stopDevicePolling()
  state.liveTelemetry.stop()
  const sock = state.liveTelemetry.socket.value
  if (sock) {
    sock.off('device_state_update', state.handleDeviceStateUpdate)
    sock.off('connect', state.handleSocketReconnect)
  }
})
</script>

<template>
  <ConfirmDialog />
  <div v-if="currentCycle" class="monitor-page">
    <div class="back-row">
      <Button
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        rounded
        size="small"
        aria-label="Back"
        @click="router.push('/')"
      />
      <div>
        <h1 class="page-title">{{ currentCycle.name }}</h1>
        <p class="page-subtitle">System run monitoring dashboard</p>
      </div>
    </div>

    <Card class="status-hero">
      <template #content>
        <div v-if="linkedController" class="hero-strip">
          <div class="hero-group hero-controller">
            <span class="status-dot" :class="controllerStatusClass"></span>
            <div class="hero-controller-info">
              <span
                class="hero-controller-name"
                v-tooltip.top="`MAC: ${linkedController.macAddress}`"
              >
                {{ linkedController.name }}
              </span>
              <span class="hero-controller-ip">{{ linkedController.ipAddress }}</span>
            </div>
          </div>

          <div class="hero-divider"></div>

          <div class="hero-group hero-cycle">
            <Tag
              :value="currentCycle.isActive ? 'Running' : 'Idle'"
              :severity="currentCycle.isActive ? 'success' : 'secondary'"
              rounded
            />
            <div class="hero-cycle-info">
              <span class="hero-phase-name">{{ activePhaseName }}</span>
              <span class="hero-phase-sub">{{ activePhaseSub }}</span>
            </div>
          </div>

          <div class="hero-divider"></div>

          <div class="hero-group hero-progress">
            <div class="hero-progress-text">
              <span class="hero-progress-percent">{{ cycleProgressPercent }}%</span>
              <span class="hero-progress-days">
                {{ daysRemaining }}
                {{ daysRemaining === 1 ? 'day' : 'days' }} to harvest
                <template v-if="daysRemaining === 0"> — Complete</template>
              </span>
            </div>
            <div class="hero-progress-bar">
              <div class="hero-progress-fill" :style="{ width: cycleProgressPercent + '%' }"></div>
            </div>
            <div v-if="estimatedHarvestDate" class="hero-progress-footer">
              <span>{{ elapsedDays }} / {{ totalDurationDays }} days</span>
              <span>est. {{ estimatedHarvestDate }}</span>
            </div>
          </div>
        </div>
        <div v-else class="empty-state error">Controller linkage not configured.</div>
      </template>
    </Card>

    <Tabs v-model:value="activeTab" lazy class="monitor-tabs">
      <div class="monitor-tabs-header">
        <TabList>
          <Tab value="overview">
            <i class="pi pi-th-large" />
            <span>Overview</span>
          </Tab>
          <Tab value="history">
            <i class="pi pi-chart-line" />
            <span>History</span>
          </Tab>
          <Tab value="plan">
            <i class="pi pi-sitemap" />
            <span>Plan</span>
          </Tab>
          <Tab value="nutrients">
            <i class="pi pi-flask" />
            <span>Nutrients</span>
          </Tab>
          <Tab value="live-feed">
            <i class="pi pi-video" />
            <span>Live Feed</span>
          </Tab>
          <Tab value="notes">
            <i class="pi pi-bookmark" />
            <span>Notes</span>
          </Tab>
        </TabList>
        <Button
          v-if="activePhaseIndex >= 0"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="phase-menu-trigger"
          aria-label="Phase options"
          :disabled="skipping || ending"
          @click.stop="togglePhaseMenu"
        />
      </div>
      <Menu ref="phaseMenu" :model="phaseMenuItems" popup />

      <TabPanels>
        <TabPanel value="overview">
          <OverviewTab />
        </TabPanel>
        <TabPanel value="history">
          <HistoryTab />
        </TabPanel>
        <TabPanel value="plan">
          <PlanTab />
        </TabPanel>
        <TabPanel value="nutrients">
          <NutrientsTab />
        </TabPanel>
        <TabPanel value="live-feed">
          <LiveFeedTab />
        </TabPanel>
        <TabPanel value="notes">
          <NotesTab />
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ExtendPhaseDialog
      v-model:visible="showExtendDialog"
      :cycle-id="cycleId"
      :active-phase="activePhase"
      :start-at="state.currentCycle.value?.startAt ?? null"
      :total-duration-days="state.totalDurationDays.value"
    />
  </div>
  <div v-else class="not-found">
    <Card>
      <template #content>
        <div class="not-found-content">
          <i class="pi pi-question-circle not-found-icon" aria-hidden="true" />
          <h2 class="not-found-title">Grow cycle not found</h2>
          <p class="not-found-sub">
            The grow cycle you tried to open doesn't exist (or no longer exists).
          </p>
          <Button
            label="Return to dashboard"
            icon="pi pi-home"
            severity="success"
            @click="router.push('/')"
          />
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.monitor-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.back-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
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

/* Hero */

.status-hero :deep(.p-card-body) {
  padding: var(--space-5);
}

.hero-strip {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto minmax(180px, 1fr) auto minmax(220px, 1.5fr);
  align-items: center;
  gap: var(--space-5);
}

@media (max-width: 900px) {
  .hero-strip {
    grid-template-columns: 1fr;
    gap: var(--space-4);
  }
  .hero-divider {
    display: none;
  }
}

.hero-group {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.hero-divider {
  width: 1px;
  height: 48px;
  background: var(--color-border);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-text-muted);
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.15);
}

.status-dot.online {
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-glow);
  animation: pulse-dot 2s var(--ease-default) infinite;
}

.status-dot.offline {
  background: var(--color-text-muted);
}

.status-dot.error {
  background: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.hero-controller-info,
.hero-cycle-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hero-controller-name,
.hero-phase-name {
  font-weight: 600;
  font-size: var(--text-md);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-controller-ip,
.hero-phase-sub {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

.hero-progress {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
}

.hero-progress-text {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.hero-progress-percent {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: var(--tracking-tight);
  font-variant-numeric: tabular-nums;
}

.hero-progress-days {
  font-size: var(--text-base);
  color: var(--color-text-secondary);
}

.hero-progress-bar {
  height: 6px;
  background: var(--color-track-bg);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.hero-progress-fill {
  height: 100%;
  background: var(--color-track-fill);
  transition: width var(--duration-slow) var(--ease-default);
}

.hero-progress-footer {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.empty-state.error {
  color: var(--color-danger);
  padding: var(--space-3);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-bg);
}

/* Tabs */

.monitor-tabs-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 0.5rem);
}

:deep(.monitor-tabs .p-tablist) {
  flex: 1;
  min-width: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-4);
  overflow-x: auto;
  scrollbar-width: thin;
}

:deep(.monitor-tabs .p-tab) {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  font-weight: 500;
  padding: var(--space-3) var(--space-4);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  transition:
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}

:deep(.monitor-tabs .p-tab:hover) {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

:deep(.monitor-tabs .p-tab.p-tab-active) {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}

:deep(.monitor-tabs .p-tab i) {
  font-size: var(--text-base);
}

.phase-menu-trigger {
  flex-shrink: 0;
  margin-left: auto;
}

.not-found {
  display: flex;
  justify-content: center;
  padding-top: var(--space-12);
}

.not-found-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.not-found-icon {
  font-size: 2.5rem;
  color: var(--color-accent);
  opacity: 0.85;
  margin-bottom: var(--space-2);
}

.not-found-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.not-found-sub {
  color: var(--color-text-secondary);
  margin: 0;
  max-width: 36ch;
}
</style>
