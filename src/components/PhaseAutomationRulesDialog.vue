<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputSwitch from 'primevue/inputswitch'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import ConfirmDialog from 'primevue/confirmdialog'
import { RuleCondition } from '../types/grow'
import type {
  AutomationRule,
  CreateAutomationRulePayload,
  Device,
  GrowPhase,
  UpdateAutomationRulePayload,
} from '../types/grow'
import { useAutomationRuleStore } from '../stores/automationRuleStore'
import { useGrowPhaseStore } from '../stores/growPhaseStore'
import type { PhaseEnvironmentResponse } from '../stores/growPhaseStore'
import { extractApiError } from '../utils/errors'
import { formatSensorType, isRuleBoundarySet } from '../utils/sensors'
import { formatIntervalRule, formatScheduleTime } from '../utils/automationRuleDisplay'
import PhaseRuleForm from './PhaseRuleForm.vue'

type FieldKey =
  | 'deviceId'
  | 'watchedSensorType'
  | 'condition'
  | 'action'
  | 'period'
  | 'intervalOnSeconds'
  | 'intervalCycleSeconds'
  | 'intervalAnchorMinutes'
  | 'scheduleTimeMinutes'

interface FieldError {
  field: FieldKey
  message: string
}

const props = defineProps<{
  visible: boolean
  phase: GrowPhase | null
  devices: Device[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  changed: []
}>()

const ruleStore = useAutomationRuleStore()
const phaseStore = useGrowPhaseStore()
const toast = useToast()
const confirm = useConfirm()

const rules = ref<AutomationRule[]>([])
const phaseEnv = ref<PhaseEnvironmentResponse | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const saving = ref(false)
const mode = ref<'list' | 'create' | 'edit'>('list')
const editingRule = ref<AutomationRule | null>(null)
const initialCondition = ref<RuleCondition | undefined>(undefined)
const fieldError = ref<FieldError | null>(null)

const deviceById = computed(() => {
  const m = new Map<string, Device>()
  for (const d of props.devices) {
    m.set(d.id, d)
  }
  return m
})

const formKey = computed(
  () =>
    `${props.phase?.localKey ?? 'none'}-${mode.value}-${editingRule.value?.id ?? 'new'}-${initialCondition.value ?? 'default'}`,
)

function deviceName(rule: AutomationRule): string {
  const d = rule.device ?? deviceById.value.get(rule.deviceId)
  return d?.name ?? rule.deviceId
}

function isPinned(rule: AutomationRule): boolean {
  return rule.condition === RuleCondition.ALWAYS_ON || rule.condition === RuleCondition.ALWAYS_OFF
}

function pinnedLabel(rule: AutomationRule): string {
  if (rule.condition === RuleCondition.ALWAYS_ON) {
    return 'Pinned ON'
  }
  if (rule.condition === RuleCondition.ALWAYS_OFF) {
    return 'Pinned OFF'
  }
  return rule.condition
}

function ruleBoundaryWarning(rule: AutomationRule): string | null {
  if (!phaseEnv.value) {
    return null
  }
  if (rule.watchedSensorType == null) {
    return null
  }
  const { day, night } = phaseEnv.value
  const periodsToCheck: ('DAY' | 'NIGHT')[] = []
  if (rule.period === null) {
    if (day) {
      periodsToCheck.push('DAY')
    }
    if (night) {
      periodsToCheck.push('NIGHT')
    }
    if (periodsToCheck.length === 0) {
      return 'No phase environment configured'
    }
  } else {
    periodsToCheck.push(rule.period)
  }
  const missing: string[] = []
  for (const p of periodsToCheck) {
    const env = p === 'DAY' ? day : night
    if (!isRuleBoundarySet(rule, env)) {
      missing.push(p)
    }
  }
  if (missing.length === 0) {
    return null
  }
  return `Boundary field unset for ${missing.join(' & ')}`
}

function matchServerError(message: string): FieldError | null {
  if (message.includes('LIGHT devices are not eligible for automation rules')) {
    return { field: 'deviceId', message }
  }
  if (message.includes('action must be ON for condition ALWAYS_ON')) {
    return { field: 'action', message }
  }
  if (message.includes('action must be OFF for condition ALWAYS_OFF')) {
    return { field: 'action', message }
  }
  if (message.includes('watchedSensorType must be null for ALWAYS_ON / ALWAYS_OFF rules')) {
    return { field: 'watchedSensorType', message }
  }
  if (message.includes('watchedSensorType is required for threshold conditions')) {
    return { field: 'watchedSensorType', message }
  }
  if (message.includes('action must be ON for condition INTERVAL')) {
    return { field: 'action', message }
  }
  if (message.includes('watchedSensorType must be null for INTERVAL rules')) {
    return { field: 'watchedSensorType', message }
  }
  if (message.includes('scheduleTimeMinutes is required')) {
    return { field: 'scheduleTimeMinutes', message }
  }
  if (message.includes('scheduleTimeMinutes must be between 0 and 1439')) {
    return { field: 'scheduleTimeMinutes', message }
  }
  if (message.includes('watchedSensorType must be null for SCHEDULE')) {
    return { field: 'watchedSensorType', message }
  }
  if (
    message.includes('action must be ON for condition SCHEDULE_ON') ||
    message.includes('action must be OFF for condition SCHEDULE_OFF')
  ) {
    return { field: 'action', message }
  }
  if (
    message.includes('intervalOnSeconds is required') ||
    message.includes('intervalCycleSeconds is required') ||
    message.includes('intervalCycleSeconds must be greater than') ||
    message.includes('must be null for non-INTERVAL') ||
    message.includes('intervalAnchorMinutes must be null for SCHEDULE_ON / SCHEDULE_OFF')
  ) {
    return { field: 'condition', message }
  }
  return null
}

async function loadRules() {
  const { phase } = props
  if (!phase?.id) {
    return
  }
  loading.value = true
  loadError.value = null
  try {
    const [fetchedRules, fetchedEnv] = await Promise.all([
      ruleStore.fetchRulesByPhase(phase.id),
      phaseStore.fetchPhaseEnvironment(phase.id).catch(() => null),
    ])
    rules.value = fetchedRules
    phaseEnv.value = fetchedEnv
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to load rules')
    loadError.value = message
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Load failed' })
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.visible, props.phase?.id],
  ([visible, phaseId]) => {
    if (visible && phaseId) {
      mode.value = 'list'
      editingRule.value = null
      initialCondition.value = undefined
      fieldError.value = null
      void loadRules()
    }
  },
  { immediate: true },
)

function showAddForm(condition?: RuleCondition) {
  editingRule.value = null
  initialCondition.value = condition
  fieldError.value = null
  mode.value = 'create'
}

function showEditForm(rule: AutomationRule) {
  editingRule.value = rule
  initialCondition.value = undefined
  fieldError.value = null
  mode.value = 'edit'
}

function cancelForm() {
  mode.value = 'list'
  editingRule.value = null
  initialCondition.value = undefined
  fieldError.value = null
}

async function handleSubmit(
  result:
    | { kind: 'create'; payload: CreateAutomationRulePayload }
    | { kind: 'update'; id: string; payload: UpdateAutomationRulePayload },
) {
  if (!props.phase?.id) {
    return
  }
  saving.value = true
  fieldError.value = null
  try {
    if (result.kind === 'create') {
      await ruleStore.createRule(result.payload)
      toast.add({ detail: 'Rule added', life: 3000, severity: 'success', summary: 'Created' })
    } else {
      await ruleStore.updateRule(result.id, result.payload)
      toast.add({ detail: 'Rule updated', life: 3000, severity: 'success', summary: 'Saved' })
    }
    await loadRules()
    mode.value = 'list'
    editingRule.value = null
    initialCondition.value = undefined
    emit('changed')
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to save rule')
    const matched = matchServerError(message)
    if (matched) {
      fieldError.value = matched
    } else {
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
    }
  } finally {
    saving.value = false
  }
}

async function onToggle(rule: AutomationRule) {
  try {
    const updated = await ruleStore.toggleRule(rule.id)
    const idx = rules.value.findIndex((r) => r.id === rule.id)
    if (idx !== -1) {
      rules.value[idx] = updated
    }
    emit('changed')
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to toggle rule')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Toggle failed' })
  }
}

function onDelete(rule: AutomationRule) {
  const phaseName = props.phase?.name ?? 'this phase'
  confirm.require({
    accept: async () => {
      try {
        await ruleStore.deleteRule(rule.id)
        rules.value = rules.value.filter((r) => r.id !== rule.id)
        emit('changed')
        toast.add({ detail: 'Rule deleted', life: 3000, severity: 'success', summary: 'Deleted' })
      } catch (error) {
        const { message } = extractApiError(error, 'Failed to delete rule')
        toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
      }
    },
    acceptLabel: 'Delete',
    acceptProps: { severity: 'danger' },
    header: 'Delete rule',
    icon: 'pi pi-exclamation-triangle',
    message: `Remove this automation rule for "${phaseName}"?`,
    rejectLabel: 'Cancel',
  })
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Automation Rules — ${phase?.name ?? ''}`"
    :style="{ width: '90vw', maxWidth: '960px' }"
    modal
    dismissable-mask
    class="rules-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <ConfirmDialog />

    <div v-if="!phase?.id" class="locked-hint">
      <i class="pi pi-lock" /> Save the grow first to configure automation rules.
    </div>

    <div v-else-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner" role="status" aria-label="Loading automation rules" />
      Loading rules…
    </div>

    <div v-else-if="loadError" class="load-error">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" /> {{ loadError }}
      <Button label="Retry" severity="secondary" size="small" text @click="loadRules" />
    </div>

    <template v-else>
      <div v-if="mode === 'list'">
        <DataTable
          v-if="rules.length > 0"
          :value="rules"
          size="small"
          class="rules-table"
          data-key="id"
        >
          <Column header="Device">
            <template #body="slot">
              <span class="device-name">{{ deviceName(slot.data) }}</span>
            </template>
          </Column>
          <Column header="Sensor">
            <template #body="slot">
              {{ formatSensorType(slot.data.watchedSensorType) }}
            </template>
          </Column>
          <Column header="Condition">
            <template #body="slot">
              <div class="condition-cell">
                <Tag
                  v-if="isPinned(slot.data)"
                  :value="pinnedLabel(slot.data)"
                  icon="pi pi-thumbtack"
                  severity="info"
                  rounded
                />
                <Tag
                  v-else-if="slot.data.condition === 'INTERVAL'"
                  :value="formatIntervalRule(slot.data)"
                  severity="info"
                  rounded
                />
                <Tag
                  v-else-if="
                    slot.data.condition === 'SCHEDULE_ON' || slot.data.condition === 'SCHEDULE_OFF'
                  "
                  :value="`${slot.data.condition === 'SCHEDULE_ON' ? '🕒 Schedule ON' : '🕒 Schedule OFF'} at ${formatScheduleTime(slot.data.scheduleTimeMinutes)}`"
                  severity="info"
                  rounded
                />
                <span v-else>{{ slot.data.condition }}</span>
                <Tag
                  v-if="ruleBoundaryWarning(slot.data)"
                  :value="ruleBoundaryWarning(slot.data) ?? ''"
                  severity="warn"
                  icon="pi pi-exclamation-triangle"
                  v-tooltip.top="
                    'The corresponding *Min/*Max/*Target field is not set on the phase environment for this period — this rule will never fire.'
                  "
                />
              </div>
            </template>
          </Column>
          <Column header="Action">
            <template #body="slot">
              <Tag
                :value="slot.data.action"
                :severity="slot.data.action === 'ON' ? 'success' : 'secondary'"
                rounded
              />
            </template>
          </Column>
          <Column header="Period">
            <template #body="slot">
              <span class="type-pill">{{ slot.data.period ?? 'Both' }}</span>
            </template>
          </Column>
          <Column header="Schedule">
            <template #body="slot">
              <span
                v-if="
                  slot.data.condition === 'SCHEDULE_ON' || slot.data.condition === 'SCHEDULE_OFF'
                "
                class="meta-code"
              >
                {{ formatScheduleTime(slot.data.scheduleTimeMinutes) }}
              </span>
              <span v-else class="muted">—</span>
            </template>
          </Column>
          <Column header="Cooldown" field="cooldownSeconds" />
          <Column header="Last triggered">
            <template #body="slot">
              <span v-if="slot.data.lastTriggeredAt" class="meta-code">
                {{ slot.data.lastTriggeredAt }}
              </span>
              <span v-else class="muted">Never</span>
            </template>
          </Column>
          <Column header="Enabled" style="width: 80px">
            <template #body="slot">
              <InputSwitch
                :model-value="slot.data.enabled"
                @update:model-value="onToggle(slot.data)"
              />
            </template>
          </Column>
          <Column header="" style="width: 110px">
            <template #body="slot">
              <div class="row-actions">
                <Button
                  icon="pi pi-pencil"
                  text
                  rounded
                  size="small"
                  severity="secondary"
                  v-tooltip.top="'Edit rule'"
                  :disabled="saving"
                  @click="showEditForm(slot.data)"
                />
                <Button
                  icon="pi pi-trash"
                  text
                  rounded
                  size="small"
                  severity="danger"
                  v-tooltip.top="'Delete rule'"
                  :disabled="saving"
                  @click="onDelete(slot.data)"
                />
              </div>
            </template>
          </Column>
        </DataTable>

        <div v-else class="empty-state">
          <span class="pi pi-bolt empty-icon" />
          <p>No rules configured for this phase yet.</p>
        </div>

        <div class="dialog-footer">
          <Button label="Close" severity="secondary" @click="close" />
          <div class="quick-add-group">
            <Button
              label="Add rule"
              icon="pi pi-plus"
              severity="success"
              :loading="saving"
              :disabled="saving"
              @click="showAddForm()"
            />
          </div>
        </div>
      </div>

      <div v-else>
        <PhaseRuleForm
          :key="formKey"
          :mode="mode"
          :grow-phase-id="phase.id"
          :devices="devices"
          :initial-rule="editingRule ?? undefined"
          :initial-condition="initialCondition"
          :field-error="fieldError"
          :saving="saving"
          @cancel="cancelForm"
          @submit="handleSubmit"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.rules-dialog :deep(.p-dialog-content) {
  padding: var(--space-4);
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

.load-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-danger);
  padding: var(--space-6);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-10) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-bg-elevated);
  gap: var(--space-2);
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
}

.device-name {
  font-weight: 500;
}

.type-pill {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
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

.row-actions {
  display: inline-flex;
  gap: var(--space-1);
}

.condition-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-4);
  flex-wrap: wrap;
}

.quick-add-group {
  display: inline-flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
