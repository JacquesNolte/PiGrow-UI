import { computed, reactive, ref, watch } from 'vue'
import {
  AutomationMode,
  DayNightPeriod,
  DeviceAction,
  RuleCondition,
  SensorType,
} from '../types/grow'
import type { AutomationRule, Device, PhaseEnvironment } from '../types/grow'
import {
  conditionShort,
  formatIntervalRule,
  formatScheduleTime,
} from '../utils/automationRuleDisplay'
import {
  THRESHOLD_RELEVANT_SENSOR_TYPES,
  conditionToBoundarySide,
  getBoundaryKey,
} from '../utils/sensors'

export type ProximityState =
  | 'safe'
  | 'approaching'
  | 'firing'
  | 'unknown'
  | 'unset'
  | 'not-applicable'

export interface RuleDisplayInfo {
  rule: AutomationRule
  device: Device | undefined
  deviceIcon: string
  conditionText: string
  conditionShort: string
  thresholdValue: number | null
  currentValue: number | null
  unit: string
  proximity: ProximityState
  isPinned: boolean
  periodLabel: string
}

export interface AutomationGroup {
  key: string
  label: string
  unit: string
  currentReading: string
  rules: RuleDisplayInfo[]
}

export interface AutomationMonitorInput {
  getActivePhaseId: () => string | undefined
  getActivePeriod: () => DayNightPeriod
  getActiveEnv: () => { day: PhaseEnvironment | null; night: PhaseEnvironment | null }
  getDevices: () => Device[]
  getReadings: () => { temperature: number; humidity: number; co2: number }
  fetchRulesApi: (phaseId: string) => Promise<AutomationRule[]>
  toggleRuleApi: (id: string) => Promise<AutomationRule>
}

export interface AutomationMonitor {
  rules: AutomationRule[]
  loading: boolean
  groups: AutomationGroup[]
  pinnedRules: RuleDisplayInfo[]
  intervalRules: RuleDisplayInfo[]
  scheduleRules: RuleDisplayInfo[]
  hasRules: boolean
  toggleRule: (id: string) => Promise<void>
  reload: () => Promise<void>
}

const SENSOR_GROUP_ORDER: {
  key: string
  sensorTypes: SensorType[]
  label: string
  unit: string
}[] = [
  {
    key: 'temp',
    label: 'Temperature',
    sensorTypes: [SensorType.TEMPERATURE, SensorType.TEMP_HUMIDITY],
    unit: '°C',
  },
  { key: 'humidity', label: 'Humidity', sensorTypes: [SensorType.HUMIDITY], unit: '%' },
  { key: 'co2', label: 'CO₂', sensorTypes: [SensorType.CO2], unit: 'ppm' },
]

const DEVICE_TYPE_ICONS: Record<string, string> = {
  AIR_CONDITIONER: 'pi pi-th-large',
  CIRCULATION_FAN: 'pi pi-sync',
  CO2_INJECTOR: 'pi pi-wind',
  DEHUMIDIFIER: 'pi pi-stop',
  EXHAUST_FAN: 'pi pi-refresh',
  HEATER: 'pi pi-fire',
  HUMIDIFIER: 'pi pi-cloud',
  INTAKE_FAN: 'pi pi-arrow-down',
  LIGHT: 'pi pi-sun',
  WATER_PUMP: 'pi pi-cloud-download',
}

function deviceIcon(device: Device | undefined): string {
  if (!device) {
    return 'pi pi-cog'
  }
  return DEVICE_TYPE_ICONS[device.type] ?? 'pi pi-cog'
}

function conditionPhrase(rule: AutomationRule): string {
  const watched = rule.watchedSensorType
  switch (rule.condition) {
    case RuleCondition.ABOVE_MAX: {
      return watched === SensorType.HUMIDITY || watched === SensorType.CO2
        ? 'When reading exceeds the max'
        : 'When temp exceeds the max'
    }
    case RuleCondition.BELOW_MIN: {
      return watched === SensorType.HUMIDITY || watched === SensorType.CO2
        ? 'When reading drops below the min'
        : 'When temp drops below the min'
    }
    case RuleCondition.BELOW_MAX: {
      return 'When reading drops below the max (recovery off)'
    }
    case RuleCondition.ABOVE_MIN: {
      return 'When reading rises above the min (recovery off)'
    }
    case RuleCondition.ABOVE_TARGET: {
      return 'When reading exceeds the target'
    }
    case RuleCondition.BELOW_TARGET: {
      return 'When reading drops below the target'
    }
    case RuleCondition.ALWAYS_ON: {
      return 'Always ON'
    }
    case RuleCondition.ALWAYS_OFF: {
      return 'Always OFF'
    }
    case RuleCondition.INTERVAL: {
      return formatIntervalRule(rule)
    }
    case RuleCondition.SCHEDULE_ON: {
      return `Schedule ON daily at ${formatScheduleTime(rule.scheduleTimeMinutes)}`
    }
    case RuleCondition.SCHEDULE_OFF: {
      return `Schedule OFF daily at ${formatScheduleTime(rule.scheduleTimeMinutes)}`
    }
    default: {
      return String(rule.condition)
    }
  }
}

function periodLabelFor(period: DayNightPeriod | null): string {
  if (period === null) {
    return 'Both'
  }
  return period === DayNightPeriod.DAY ? 'DAY' : 'NIGHT'
}

function sensorGroupKey(sensorType: SensorType | null): string | null {
  if (sensorType == null) {
    return null
  }
  for (const g of SENSOR_GROUP_ORDER) {
    if (g.sensorTypes.includes(sensorType)) {
      return g.key
    }
  }
  return null
}

function thresholdValueFor(
  rule: AutomationRule,
  env: { day: PhaseEnvironment | null; night: PhaseEnvironment | null },
  period: DayNightPeriod,
): number | null {
  if (rule.watchedSensorType == null) {
    return null
  }
  const boundary = getBoundaryKey(rule.watchedSensorType)
  if (!boundary) {
    return null
  }
  const side = conditionToBoundarySide(rule.condition)
  if (!side) {
    return null
  }
  const periodEnv = period === DayNightPeriod.DAY ? env.day : env.night
  if (!periodEnv) {
    return null
  }
  const fieldKey = boundary[side]
  const value = periodEnv[fieldKey]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function currentReadingFor(
  sensorType: SensorType,
  readings: { temperature: number; humidity: number; co2: number },
): number | null {
  if (sensorType === SensorType.TEMPERATURE || sensorType === SensorType.TEMP_HUMIDITY) {
    return readings.temperature
  }
  if (sensorType === SensorType.HUMIDITY) {
    return readings.humidity
  }
  if (sensorType === SensorType.CO2) {
    return readings.co2
  }
  return null
}

function computeProximity(
  rule: AutomationRule,
  current: number | null,
  threshold: number | null,
): ProximityState {
  if (rule.watchedSensorType == null) {
    return 'not-applicable'
  }
  if (!THRESHOLD_RELEVANT_SENSOR_TYPES.includes(rule.watchedSensorType)) {
    return 'not-applicable'
  }
  if (threshold == null) {
    return 'unset'
  }
  if (current == null) {
    return 'unknown'
  }
  if (threshold === 0) {
    return 'unknown'
  }
  const aboveConditions = new Set<RuleCondition>([
    RuleCondition.ABOVE_MAX,
    RuleCondition.ABOVE_MIN,
    RuleCondition.ABOVE_TARGET,
  ])
  const fires = aboveConditions.has(rule.condition) ? current > threshold : current < threshold
  if (fires) {
    return 'firing'
  }
  const ratio = Math.abs(current - threshold) / Math.abs(threshold)
  if (ratio < 0.1) {
    return 'approaching'
  }
  return 'safe'
}

export function useAutomationMonitor(input: AutomationMonitorInput): AutomationMonitor {
  const rules = ref<AutomationRule[]>([])
  const loading = ref(false)
  let lastFetchedPhaseId: string | undefined = undefined

  async function reload(): Promise<void> {
    const phaseId = input.getActivePhaseId()
    if (!phaseId) {
      rules.value = []
      lastFetchedPhaseId = undefined
      return
    }
    loading.value = true
    try {
      rules.value = await input.fetchRulesApi(phaseId)
      lastFetchedPhaseId = phaseId
    } catch {
      rules.value = []
    } finally {
      loading.value = false
    }
  }

  async function toggleRule(id: string): Promise<void> {
    const idx = rules.value.findIndex((r) => r.id === id)
    if (idx === -1) {
      return
    }
    const previous = rules.value[idx]!
    const optimistic: AutomationRule = { ...previous, enabled: !previous.enabled }
    rules.value = [...rules.value.slice(0, idx), optimistic, ...rules.value.slice(idx + 1)]
    try {
      const updated = await input.toggleRuleApi(id)
      const cur = rules.value.findIndex((r) => r.id === id)
      if (cur !== -1) {
        const current = rules.value[cur] as AutomationRule
        rules.value = [
          ...rules.value.slice(0, cur),
          { ...current, enabled: updated.enabled ?? current.enabled },
          ...rules.value.slice(cur + 1),
        ]
      }
    } catch {
      const cur = rules.value.findIndex((r) => r.id === id)
      if (cur !== -1) {
        rules.value = [...rules.value.slice(0, cur), previous, ...rules.value.slice(cur + 1)]
      }
      throw new Error('toggle failed')
    }
  }

  const deviceById = computed(() => {
    const m = new Map<string, Device>()
    for (const d of input.getDevices()) {
      if (d.id) {
        m.set(d.id, d)
      }
    }
    return m
  })

  function buildDisplayInfo(rule: AutomationRule): RuleDisplayInfo {
    const device = rule.device ?? deviceById.value.get(rule.deviceId)
    const env = input.getActiveEnv()
    const period = input.getActivePeriod()
    const sensorType = rule.watchedSensorType
    const threshold = thresholdValueFor(rule, env, period)
    const current = sensorType != null ? currentReadingFor(sensorType, input.getReadings()) : null
    const proximity = computeProximity(rule, current, threshold)
    const isPinned =
      rule.condition === RuleCondition.ALWAYS_ON || rule.condition === RuleCondition.ALWAYS_OFF
    const isSchedule =
      rule.condition === RuleCondition.SCHEDULE_ON || rule.condition === RuleCondition.SCHEDULE_OFF
    const isUnset = threshold == null && !isPinned && !isSchedule && sensorType != null
    const effectiveThreshold = isUnset && env.day === null && env.night === null ? null : threshold
    const effectiveProximity: ProximityState =
      isUnset && effectiveThreshold == null ? 'unset' : proximity
    const unit =
      sensorType != null
        ? (SENSOR_GROUP_ORDER.find((g) => sensorGroupKey(sensorType) === g.key)?.unit ?? '')
        : ''
    const conditionText = conditionPhrase(rule)
    return {
      conditionShort: conditionShort(rule),
      conditionText,
      currentValue: current,
      device,
      deviceIcon: deviceIcon(device),
      isPinned,
      periodLabel: periodLabelFor(rule.period),
      proximity: effectiveProximity,
      rule,
      thresholdValue: effectiveThreshold,
      unit,
    }
  }

  const displayRules = computed<RuleDisplayInfo[]>(() => rules.value.map(buildDisplayInfo))

  const groups = computed<AutomationGroup[]>(() => {
    const readings = input.getReadings()
    const result: AutomationGroup[] = []
    for (const g of SENSOR_GROUP_ORDER) {
      const groupRules = displayRules.value.filter((r) => {
        if (r.isPinned) {
          return false
        }
        const st = r.rule.watchedSensorType
        return st != null && sensorGroupKey(st) === g.key
      })
      if (groupRules.length === 0) {
        continue
      }
      const representativeSensor = g.sensorTypes[0]!
      const reading = currentReadingFor(representativeSensor, readings)
      result.push({
        currentReading: reading == null ? '—' : `${reading} ${g.unit}`,
        key: g.key,
        label: g.label,
        rules: groupRules,
        unit: g.unit,
      })
    }
    return result
  })

  const pinnedRules = computed<RuleDisplayInfo[]>(() =>
    displayRules.value.filter((r) => r.isPinned),
  )

  const scheduleRules = computed<RuleDisplayInfo[]>(() =>
    displayRules.value.filter(
      (r) =>
        r.rule.condition === RuleCondition.SCHEDULE_ON ||
        r.rule.condition === RuleCondition.SCHEDULE_OFF,
    ),
  )

  const intervalRules = computed<RuleDisplayInfo[]>(() =>
    displayRules.value.filter((r) => r.rule.condition === RuleCondition.INTERVAL),
  )

  const hasRules = computed(() => rules.value.length > 0)

  watch(
    () => input.getActivePhaseId(),
    (newId) => {
      if (newId !== lastFetchedPhaseId) {
        void reload()
      }
    },
  )

  return reactive({
    groups,
    hasRules,
    intervalRules,
    loading,
    pinnedRules,
    reload,
    rules,
    scheduleRules,
    toggleRule,
  }) as unknown as AutomationMonitor
}

export function actionLabel(action: DeviceAction): string {
  return action === DeviceAction.ON ? 'ON' : 'OFF'
}

export function proximityLabel(state: ProximityState): string {
  switch (state) {
    case 'safe': {
      return 'Safe'
    }
    case 'approaching': {
      return 'Approaching'
    }
    case 'firing': {
      return 'Firing'
    }
    case 'unset': {
      return 'Unset'
    }
    case 'unknown': {
      return 'No reading'
    }
    case 'not-applicable': {
      return '—'
    }
  }
}
