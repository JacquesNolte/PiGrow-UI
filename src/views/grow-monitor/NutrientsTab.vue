<script setup lang="ts">
import { computed, defineAsyncComponent, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import type { GrowPhase } from '../../types/grow'
import type { DosingLog } from '../../types/grow'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import Button from 'primevue/button'

const PhaseNutrientList = defineAsyncComponent(
  () => import('../../components/PhaseNutrientList.vue'),
)
const DosingLogForm = defineAsyncComponent(() => import('../../components/DosingLogForm.vue'))
const DosingLogHistory = defineAsyncComponent(() => import('./DosingLogHistory.vue'))

const state = useProvidedGrowMonitorState()
const router = useRouter()

const historyRef = useTemplateRef<InstanceType<typeof DosingLogHistory>>('historyRef')

const activePhase = computed<GrowPhase | null>(() => {
  const idx = state.activePhaseIndex.value
  if (idx < 0) {
    return null
  }
  return state.sortedPhases.value[idx] ?? null
})

const cycleId = computed(() => state.currentCycle.value?.id ?? null)

function openEditor() {
  if (cycleId.value) {
    router.push(`/admin/grows/edit/${cycleId.value}`)
  }
}

function onLogged(log: DosingLog) {
  historyRef.value?.prepend(log)
}

function fmtPh(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  return value.toFixed(2)
}
</script>

<template>
  <div class="nutrients-tab">
    <div class="section-toolbar">
      <h3 class="section-title">Nutrient Dosing — {{ state.activePhaseName.value }}</h3>
      <Button
        v-if="cycleId"
        label="Edit"
        icon="pi pi-pencil"
        text
        size="small"
        severity="secondary"
        class="nutrients-edit-btn"
        @click="openEditor"
      />
    </div>

    <div v-if="!activePhase" class="empty-state">
      <span class="pi pi-flask empty-icon" />
      <p>No active phase. Nutrient dosing shows for the phase currently in progress.</p>
    </div>

    <div v-else class="nutrients-body">
      <PhaseNutrientList :grow-phase-id="activePhase.id ?? ''" readonly />

      <div class="ph-band">
        <div class="ph-band-header">
          <span class="ph-band-title">pH Band</span>
          <span class="ph-band-hint">Applies to both DAY and NIGHT for this phase.</span>
        </div>
        <div class="ph-band-row">
          <div class="ph-band-cell">
            <span class="ph-band-label">Min</span>
            <span class="meta-code" data-testid="nutrients-ph-min">{{
              fmtPh(activePhase.phMin)
            }}</span>
            <small class="field-micro-hint">Acceptable lower bound</small>
          </div>
          <div class="ph-band-cell">
            <span class="ph-band-label">Target</span>
            <span class="meta-code" data-testid="nutrients-ph-target">{{
              fmtPh(activePhase.phTarget)
            }}</span>
            <small class="field-micro-hint">Stored; not used by automation</small>
          </div>
          <div class="ph-band-cell">
            <span class="ph-band-label">Max</span>
            <span class="meta-code" data-testid="nutrients-ph-max">{{
              fmtPh(activePhase.phMax)
            }}</span>
            <small class="field-micro-hint">Acceptable upper bound</small>
          </div>
        </div>
        <p class="ph-band-foot">Leave blank to leave the band unconstrained.</p>
      </div>

      <DosingLogForm :grow-phase-id="activePhase.id ?? ''" @created="onLogged" />
      <DosingLogHistory ref="historyRef" :grow-phase-id="activePhase.id ?? ''" />
    </div>
  </div>
</template>

<style scoped>
.nutrients-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.section-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.section-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
}

.nutrients-edit-btn {
  margin-left: auto;
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
  background: var(--color-bg-elevated);
  gap: var(--space-2);
}

.empty-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.nutrients-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ph-band {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}

.ph-band-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.ph-band-title {
  font-weight: 600;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-size: var(--text-sm);
}

.ph-band-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.ph-band-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.ph-band-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.ph-band-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
  width: fit-content;
}

.field-micro-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  line-height: 1.2;
}

.ph-band-foot {
  margin: var(--space-3) 0 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .ph-band-row {
    grid-template-columns: 1fr;
  }
}
</style>
