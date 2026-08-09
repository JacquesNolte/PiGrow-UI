<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import InputSwitch from 'primevue/inputswitch'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { DayNightPeriod, DeviceAction, DeviceType, RuleCondition, SensorType } from '../types/grow'
import type {
  AutomationRule,
  CreateAutomationRulePayload,
  Device,
  UpdateAutomationRulePayload,
} from '../types/grow'
import { SENSOR_TYPE_OPTIONS, THRESHOLD_RELEVANT_SENSOR_TYPES } from '../utils/sensors'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateRuleDraft,
} from '../utils/automationRuleValidation'
import { fmtDuration, formatScheduleTime } from '../utils/automationRuleDisplay'

const props = defineProps<{
  mode: 'create' | 'edit'
  growPhaseId: string
  devices: Device[]
  initialRule?: AutomationRule
  initialCondition?: RuleCondition
  fieldError?: { field: FieldKey; message: string } | null
  saving?: boolean
}>()

const emit = defineEmits<{
  cancel: []
  submit: [
    payload:
      | { kind: 'create'; payload: CreateAutomationRulePayload }
      | { kind: 'update'; id: string; payload: UpdateAutomationRulePayload },
  ]
}>()

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
// FieldKey is also referenced (by string-literal contract) in
// PhaseAutomationRulesDialog.vue. Keep the union values in sync there.

interface Draft {
  deviceId: string | null
  watchedSensorType: SensorType | null
  condition: RuleCondition
  period: DayNightPeriod | null
  action: DeviceAction
  cooldownSeconds: number
  intervalOnSeconds: number | null
  intervalCycleSeconds: number | null
  intervalAnchorMinutes: number | null
  scheduleTimeMinutes: number | null
}

const BOTH = 'BOTH' as const
type PeriodChoice = DayNightPeriod | typeof BOTH

const deviceOptions = computed(() =>
  props.devices
    .filter((d) => d.isActive && d.type !== DeviceType.LIGHT)
    .map((d) => ({ label: d.name, type: d.type, value: d.id })),
)

const conditionGroups = [
  {
    items: [
      {
        description: 'Trigger when reading exceeds the max threshold',
        label: 'Above max',
        value: RuleCondition.ABOVE_MAX,
      },
      {
        description: 'Trigger when reading falls below the max threshold (hysteresis-off)',
        label: 'Below max',
        value: RuleCondition.BELOW_MAX,
      },
      {
        description: 'Trigger when reading rises above the min threshold (hysteresis-off)',
        label: 'Above min',
        value: RuleCondition.ABOVE_MIN,
      },
      {
        description: 'Trigger when reading falls below the min threshold',
        label: 'Below min',
        value: RuleCondition.BELOW_MIN,
      },
      {
        description: 'Trigger when reading exceeds the target',
        label: 'Above target',
        value: RuleCondition.ABOVE_TARGET,
      },
      {
        description: 'Trigger when reading falls below the target',
        label: 'Below target',
        value: RuleCondition.BELOW_TARGET,
      },
    ],
    label: 'Threshold',
  },
  {
    items: [
      {
        description: 'Pin device to ON within the rule scope',
        label: 'Pin ON (this phase)',
        value: RuleCondition.ALWAYS_ON,
      },
      {
        description: 'Pin device to OFF within the rule scope',
        label: 'Pin OFF (this phase)',
        value: RuleCondition.ALWAYS_OFF,
      },
    ],
    label: 'Pin',
  },
  {
    items: [
      {
        description: 'Pulse ON then OFF on a repeating cycle',
        label: 'Interval (duty cycle)',
        value: RuleCondition.INTERVAL,
      },
    ],
    label: 'Duty cycle',
  },
  {
    items: [
      {
        description: 'Fire action: ON daily at a wall-clock time',
        label: 'Schedule ON (wall-clock)',
        value: RuleCondition.SCHEDULE_ON,
      },
      {
        description: 'Fire action: OFF daily at a wall-clock time',
        label: 'Schedule OFF (wall-clock)',
        value: RuleCondition.SCHEDULE_OFF,
      },
    ],
    label: 'Schedule',
  },
]

const THRESHOLD_CONDITIONS = new Set<RuleCondition>([
  RuleCondition.ABOVE_MAX,
  RuleCondition.BELOW_MIN,
  RuleCondition.BELOW_MAX,
  RuleCondition.ABOVE_MIN,
  RuleCondition.ABOVE_TARGET,
  RuleCondition.BELOW_TARGET,
])

const periodOptions: { label: string; value: PeriodChoice }[] = [
  { label: 'Day', value: DayNightPeriod.DAY },
  { label: 'Night', value: DayNightPeriod.NIGHT },
  { label: 'Both (day & night)', value: BOTH },
]

const actionOptions = [
  { label: 'Turn ON', value: DeviceAction.ON },
  { label: 'Turn OFF', value: DeviceAction.OFF },
]

const isAlways = computed(
  () =>
    draft.value.condition === RuleCondition.ALWAYS_ON ||
    draft.value.condition === RuleCondition.ALWAYS_OFF,
)

const isInterval = computed(() => draft.value.condition === RuleCondition.INTERVAL)

const isSchedule = computed(
  () =>
    draft.value.condition === RuleCondition.SCHEDULE_ON ||
    draft.value.condition === RuleCondition.SCHEDULE_OFF,
)

const isThreshold = computed(() => THRESHOLD_CONDITIONS.has(draft.value.condition))

const isTargetCondition = computed(
  () =>
    draft.value.condition === RuleCondition.ABOVE_TARGET ||
    draft.value.condition === RuleCondition.BELOW_TARGET,
)

const sensorOptionsForCondition = computed(() => {
  if (!isThreshold.value) {
    return SENSOR_TYPE_OPTIONS
  }
  return SENSOR_TYPE_OPTIONS.filter((o) =>
    (THRESHOLD_RELEVANT_SENSOR_TYPES as readonly SensorType[]).includes(o.value),
  )
})

const targetFieldHint = computed(() => {
  if (!isTargetCondition.value || draft.value.watchedSensorType == null) {
    return null
  }
  const sensorLabel = SENSOR_TYPE_OPTIONS.find(
    (o) => o.value === draft.value.watchedSensorType,
  )?.label
  if (!sensorLabel) {
    return null
  }
  const targetKey = `${sensorLabel.toLowerCase()}Target`
  return `Ensure the relevant Target field (e.g. ${targetKey}) is set on this phase's DAY/NIGHT environment, or this rule will never fire.`
})

const intervalPreview = computed(() => {
  const on = draft.value.intervalOnSeconds
  const cyc = draft.value.intervalCycleSeconds
  if (on == null || cyc == null) {
    return null
  }
  const anchor = draft.value.intervalAnchorMinutes
  const anchorStr = anchor != null ? ` at ${formatScheduleTime(anchor % 1440)}` : ''
  return `ON ${fmtDuration(on)}, then OFF ${fmtDuration(cyc - on)}, repeating every ${fmtDuration(cyc)}${anchorStr}`
})

// Anchor (time-of-day) picker for INTERVAL rules. When enabled, pulses align
// to a wall-clock time instead of rule-creation time — e.g. a 2-day cycle
// anchored at 07:00 fires at 07:00 every other day.
const useAnchor = computed<boolean>({
  get: () => draft.value.intervalAnchorMinutes != null,
  set: (v) => {
    draft.value.intervalAnchorMinutes = v ? 420 : null
  },
})

const anchorHour = computed<number>({
  get: () =>
    draft.value.intervalAnchorMinutes == null
      ? 0
      : Math.floor((draft.value.intervalAnchorMinutes % 1440) / 60),
  set: (h) => {
    const cur = draft.value.intervalAnchorMinutes ?? 0
    draft.value.intervalAnchorMinutes = h * 60 + (cur % 60)
  },
})

const anchorMinute = computed<number>({
  get: () =>
    draft.value.intervalAnchorMinutes == null ? 0 : (draft.value.intervalAnchorMinutes % 1440) % 60,
  set: (m) => {
    const cur = draft.value.intervalAnchorMinutes ?? 0
    draft.value.intervalAnchorMinutes = Math.floor(cur / 60) * 60 + m
  },
})

const HOUR_OPTIONS: { label: string; value: number }[] = Array.from({ length: 24 }, (_, h) => ({
  label: String(h).padStart(2, '0'),
  value: h,
}))

const MINUTE_OPTIONS: { label: string; value: number }[] = Array.from({ length: 60 }, (_, m) => ({
  label: String(m).padStart(2, '0'),
  value: m,
}))

const scheduleHour = computed<number | null>({
  get: () =>
    draft.value.scheduleTimeMinutes == null
      ? null
      : Math.floor(draft.value.scheduleTimeMinutes / 60),
  set: (h) => {
    const cur = draft.value.scheduleTimeMinutes ?? 0
    const m = cur % 60
    draft.value.scheduleTimeMinutes = (h ?? 0) * 60 + m
  },
})

const scheduleMinute = computed<number | null>({
  get: () =>
    draft.value.scheduleTimeMinutes == null ? null : draft.value.scheduleTimeMinutes % 60,
  set: (m) => {
    const cur = draft.value.scheduleTimeMinutes ?? 0
    const h = Math.floor(cur / 60)
    draft.value.scheduleTimeMinutes = h * 60 + (m ?? 0)
  },
})

const schedulePreview = computed(() => {
  const v = draft.value.scheduleTimeMinutes
  if (v == null) {
    return null
  }
  const h = String(Math.floor(v / 60)).padStart(2, '0')
  const m = String(v % 60).padStart(2, '0')
  return `Fires daily at ${h}:${m}`
})

function emptyDraft(): Draft {
  const cond = props.initialCondition ?? RuleCondition.ABOVE_MAX
  return {
    action:
      cond === RuleCondition.SCHEDULE_OFF || cond === RuleCondition.ALWAYS_OFF
        ? DeviceAction.OFF
        : DeviceAction.ON,
    condition: cond,
    cooldownSeconds: 180,
    deviceId: props.devices.find((d) => d.isActive && d.type !== DeviceType.LIGHT)?.id ?? null,
    intervalAnchorMinutes: null,
    intervalCycleSeconds: props.initialCondition === RuleCondition.INTERVAL ? 300 : null,
    intervalOnSeconds: props.initialCondition === RuleCondition.INTERVAL ? 30 : null,
    period: null,
    scheduleTimeMinutes:
      cond === RuleCondition.SCHEDULE_ON || cond === RuleCondition.SCHEDULE_OFF ? 480 : null,
    watchedSensorType: SensorType.TEMPERATURE,
  }
}

const draft = ref<Draft>(emptyDraft())

const deviceSelect = ref<{ $el?: HTMLElement } | null>(null)

onMounted(() => {
  void nextTick(() => {
    deviceSelect.value?.$el?.querySelector<HTMLElement>('[role="combobox"], input')?.focus()
  })
})

function hydrate() {
  if (props.mode === 'edit' && props.initialRule) {
    draft.value = {
      action: props.initialRule.action,
      condition: props.initialRule.condition,
      cooldownSeconds: props.initialRule.cooldownSeconds,
      deviceId: props.initialRule.deviceId,
      intervalAnchorMinutes: props.initialRule.intervalAnchorMinutes ?? null,
      intervalCycleSeconds: props.initialRule.intervalCycleSeconds,
      intervalOnSeconds: props.initialRule.intervalOnSeconds,
      period: props.initialRule.period,
      scheduleTimeMinutes: props.initialRule.scheduleTimeMinutes,
      watchedSensorType: props.initialRule.watchedSensorType,
    }
  } else {
    draft.value = emptyDraft()
  }
}

watch(
  () => [props.mode, props.initialRule?.id, props.devices.length, props.initialCondition],
  () => hydrate(),
  { immediate: true },
)

watch(
  () => draft.value.condition,
  (next, prev) => {
    // Clear fields that are invalid for the previous condition.
    if (prev === RuleCondition.INTERVAL) {
      draft.value.intervalOnSeconds = null
      draft.value.intervalCycleSeconds = null
      draft.value.intervalAnchorMinutes = null
    }
    if (prev === RuleCondition.SCHEDULE_ON || prev === RuleCondition.SCHEDULE_OFF) {
      draft.value.scheduleTimeMinutes = null
    }

    if (next === RuleCondition.INTERVAL) {
      draft.value.action = DeviceAction.ON
      draft.value.watchedSensorType = null
      if (draft.value.intervalOnSeconds == null) {
        draft.value.intervalOnSeconds = 30
      }
      if (draft.value.intervalCycleSeconds == null) {
        draft.value.intervalCycleSeconds = 300
      }
    } else if (next === RuleCondition.SCHEDULE_ON) {
      draft.value.action = DeviceAction.ON
      draft.value.watchedSensorType = null
      if (draft.value.scheduleTimeMinutes == null) {
        draft.value.scheduleTimeMinutes = 480
      }
    } else if (next === RuleCondition.SCHEDULE_OFF) {
      draft.value.action = DeviceAction.OFF
      draft.value.watchedSensorType = null
      if (draft.value.scheduleTimeMinutes == null) {
        draft.value.scheduleTimeMinutes = 480
      }
    } else if (next === RuleCondition.ALWAYS_ON) {
      draft.value.action = DeviceAction.ON
      draft.value.watchedSensorType = null
    } else if (next === RuleCondition.ALWAYS_OFF) {
      draft.value.action = DeviceAction.OFF
      draft.value.watchedSensorType = null
    } else if (
      prev === RuleCondition.ALWAYS_ON ||
      prev === RuleCondition.ALWAYS_OFF ||
      prev === RuleCondition.INTERVAL ||
      prev === RuleCondition.SCHEDULE_ON ||
      prev === RuleCondition.SCHEDULE_OFF
    ) {
      // Leaving a pin, INTERVAL, or schedule for a threshold — reset sensor.
      draft.value.watchedSensorType = SensorType.TEMPERATURE
    }
  },
)

const periodChoice = computed<PeriodChoice>({
  get: () => (draft.value.period === null ? BOTH : draft.value.period),
  set: (val) => {
    draft.value.period = val === BOTH ? null : val
  },
})

const actionOptionsForCondition = computed(() => {
  if (
    draft.value.condition === RuleCondition.ALWAYS_ON ||
    draft.value.condition === RuleCondition.INTERVAL ||
    draft.value.condition === RuleCondition.SCHEDULE_ON
  ) {
    return actionOptions.filter((o) => o.value === DeviceAction.ON)
  }
  if (
    draft.value.condition === RuleCondition.ALWAYS_OFF ||
    draft.value.condition === RuleCondition.SCHEDULE_OFF
  ) {
    return actionOptions.filter((o) => o.value === DeviceAction.OFF)
  }
  return actionOptions
})

const validationError = computed<string | null>(() => validateRuleDraft(draft.value, props.devices))

const isValid = computed(() => validationError.value === null)

const inlineErrorFor = (field: FieldKey): string | null => {
  if (props.fieldError && props.fieldError.field === field) {
    return props.fieldError.message
  }
  return null
}

function onSubmit() {
  if (!isValid.value || draft.value.deviceId === null) {
    return
  }
  if (props.mode === 'create') {
    const payload = buildCreatePayload(draft.value, props.growPhaseId)
    emit('submit', { kind: 'create', payload })
  } else if (props.initialRule) {
    const payload = buildUpdatePayload(draft.value)
    emit('submit', { id: props.initialRule.id, kind: 'update', payload })
  }
}
</script>

<template>
  <form class="rule-form" @submit.prevent="onSubmit">
    <div class="form-grid">
      <div class="field">
        <label class="field-label">Device</label>
        <Select
          ref="deviceSelect"
          v-model="draft.deviceId"
          :options="deviceOptions"
          option-label="label"
          option-value="value"
          placeholder="Select a device"
          class="full-width"
          :invalid="!!inlineErrorFor('deviceId')"
        />
        <p v-if="inlineErrorFor('deviceId')" class="field-error">
          {{ inlineErrorFor('deviceId') }}
        </p>
      </div>

      <div v-if="isInterval" class="field">
        <label class="field-label">Interval ON (seconds)</label>
        <InputNumber
          v-model.number="draft.intervalOnSeconds"
          :min="1"
          data-testid="interval-on"
          show-buttons
          class="full-width"
        />
        <label class="field-label">Interval cycle (seconds)</label>
        <InputNumber
          v-model.number="draft.intervalCycleSeconds"
          :min="2"
          data-testid="interval-cycle"
          show-buttons
          class="full-width"
        />
        <p v-if="intervalPreview" class="field-hint" data-testid="interval-preview">
          {{ intervalPreview }}
        </p>
        <div class="anchor-row">
          <label class="field-label">
            <InputSwitch v-model="useAnchor" data-testid="interval-anchor-toggle" />
            Start at a time of day
          </label>
          <div v-if="useAnchor" class="time-picker">
            <Select
              v-model="anchorHour"
              :options="HOUR_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="HH"
              data-testid="interval-anchor-hour"
              class="anchor-select"
            />
            <Select
              v-model="anchorMinute"
              :options="MINUTE_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="MM"
              data-testid="interval-anchor-minute"
              class="anchor-select"
            />
          </div>
        </div>
      </div>

      <div v-else-if="isSchedule" class="field">
        <label class="field-label">Fire at (HH:MM)</label>
        <div class="time-picker">
          <Select
            v-model="scheduleHour"
            :options="HOUR_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="HH"
            class="time-picker-select"
            data-testid="schedule-hour"
            :invalid="!!inlineErrorFor('scheduleTimeMinutes')"
          />
          <span class="time-picker-sep">:</span>
          <Select
            v-model="scheduleMinute"
            :options="MINUTE_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="MM"
            class="time-picker-select"
            data-testid="schedule-minute"
            :invalid="!!inlineErrorFor('scheduleTimeMinutes')"
          />
        </div>
        <p v-if="schedulePreview" class="field-hint">{{ schedulePreview }}</p>
        <p v-if="inlineErrorFor('scheduleTimeMinutes')" class="field-error">
          {{ inlineErrorFor('scheduleTimeMinutes') }}
        </p>
      </div>

      <div class="field" v-else-if="isThreshold">
        <label class="field-label">Watched sensor</label>
        <Select
          v-model="draft.watchedSensorType"
          :options="sensorOptionsForCondition"
          option-label="label"
          option-value="value"
          placeholder="Select sensor"
          class="full-width"
          data-testid="sensor-picker"
          :invalid="!!inlineErrorFor('watchedSensorType')"
        />
        <p v-if="inlineErrorFor('watchedSensorType')" class="field-error">
          {{ inlineErrorFor('watchedSensorType') }}
        </p>
        <Message v-if="targetFieldHint" severity="info" :closable="false" class="form-message">
          {{ targetFieldHint }}
        </Message>
      </div>
      <div class="field" v-else>
        <label class="field-label">Watched sensor</label>
        <p class="field-hint locked">N/A — pinned rule (always-on/always-off)</p>
      </div>

      <div class="field">
        <label class="field-label">Condition</label>
        <Select
          v-model="draft.condition"
          :options="conditionGroups"
          option-label="label"
          option-value="value"
          option-group-label="label"
          option-group-children="items"
          class="full-width"
        />
      </div>

      <div class="field">
        <label class="field-label">Period</label>
        <Select
          v-model="periodChoice"
          :options="periodOptions"
          option-label="label"
          option-value="value"
          class="full-width"
          :invalid="!!inlineErrorFor('period')"
        />
        <p v-if="inlineErrorFor('period')" class="field-error">
          {{ inlineErrorFor('period') }}
        </p>
      </div>

      <div class="field">
        <label class="field-label">Action</label>
        <Select
          v-model="draft.action"
          :options="actionOptionsForCondition"
          option-label="label"
          option-value="value"
          :disabled="isAlways || isInterval || isSchedule"
          class="full-width"
          :invalid="!!inlineErrorFor('action')"
        />
        <p v-if="isAlways || isInterval || isSchedule" class="field-hint">
          Locked to {{ draft.action }} for condition {{ draft.condition }}.
        </p>
        <p v-else-if="inlineErrorFor('action')" class="field-error">
          {{ inlineErrorFor('action') }}
        </p>
      </div>

      <div class="field">
        <label class="field-label">Cooldown (seconds)</label>
        <InputNumber
          v-model="draft.cooldownSeconds"
          :min="0"
          :max="86400"
          show-buttons
          class="full-width"
        />
      </div>
    </div>

    <Message v-if="validationError" severity="warn" :closable="false" class="form-message">
      {{ validationError }}
    </Message>

    <div class="form-actions">
      <Button label="Cancel" severity="secondary" type="button" @click="emit('cancel')" />
      <Button
        :label="mode === 'create' ? 'Add rule' : 'Save changes'"
        severity="success"
        type="submit"
        :disabled="!isValid"
        :loading="saving"
      />
    </div>
  </form>
</template>

<style scoped>
.rule-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3) var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.field-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin: 0;
}

.field-hint.locked {
  font-style: italic;
  padding: 0.4375rem 0.625rem;
  background: var(--color-bg-elevated);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-sm);
}

.field-error {
  font-size: var(--text-xs);
  color: var(--color-danger-600, #d32f2f);
  margin: 0;
}

.full-width {
  width: 100%;
}

.time-picker {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.time-picker-select {
  width: 5rem;
}

.time-picker-sep {
  font-weight: 600;
  color: var(--color-text-muted);
}

.anchor-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.anchor-row .field-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.anchor-select {
  width: 5rem;
}

.form-message {
  margin: 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>
