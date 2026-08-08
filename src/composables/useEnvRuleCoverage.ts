import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { AutomationMode, RuleCondition, SensorType } from '../types/grow'
import type { AutomationRule, Device, PhaseEnvironmentPayload } from '../types/grow'

export type BoundaryKey =
  | 'tempMin'
  | 'tempMax'
  | 'humidityMin'
  | 'humidityMax'
  | 'co2Min'
  | 'co2Max'

export interface BoundaryCoverage {
  key: BoundaryKey
  label: string
  unit: string
  side: 'min' | 'max'
  payloadKey: 'temp' | 'humidity' | 'co2'
  condition: RuleCondition
  isSetAny: boolean
  setInDay: boolean
  setInNight: boolean
  matchingRuleCount: number
  hasMatchingRule: boolean
  blockingDeviceCount: number
  blockingDeviceNames: string[]
}

export interface EnvRuleCoverage {
  boundaries: BoundaryCoverage[]
  uncoveredCount: number
  blockedCount: number
  hasIssues: boolean
}

interface BoundaryDef {
  key: BoundaryKey
  side: 'min' | 'max'
  condition: RuleCondition
  sensorType: SensorType
  label: string
  unit: string
  payloadKey: 'temp' | 'humidity' | 'co2'
}

const BOUNDARY_DEFS: BoundaryDef[] = [
  {
    condition: RuleCondition.ABOVE_MAX,
    key: 'tempMax',
    label: 'Temperature max',
    payloadKey: 'temp',
    sensorType: SensorType.TEMPERATURE,
    side: 'max',
    unit: '°C',
  },
  {
    condition: RuleCondition.BELOW_MIN,
    key: 'tempMin',
    label: 'Temperature min',
    payloadKey: 'temp',
    sensorType: SensorType.TEMPERATURE,
    side: 'min',
    unit: '°C',
  },
  {
    condition: RuleCondition.ABOVE_MAX,
    key: 'humidityMax',
    label: 'Humidity max',
    payloadKey: 'humidity',
    sensorType: SensorType.HUMIDITY,
    side: 'max',
    unit: '%',
  },
  {
    condition: RuleCondition.BELOW_MIN,
    key: 'humidityMin',
    label: 'Humidity min',
    payloadKey: 'humidity',
    sensorType: SensorType.HUMIDITY,
    side: 'min',
    unit: '%',
  },
  {
    condition: RuleCondition.ABOVE_MAX,
    key: 'co2Max',
    label: 'CO₂ max',
    payloadKey: 'co2',
    sensorType: SensorType.CO2,
    side: 'max',
    unit: 'ppm',
  },
  {
    condition: RuleCondition.BELOW_MIN,
    key: 'co2Min',
    label: 'CO₂ min',
    payloadKey: 'co2',
    sensorType: SensorType.CO2,
    side: 'min',
    unit: 'ppm',
  },
]

function isSet(value: number | null | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function ruleCoversBoundary(
  rule: AutomationRule,
  def: BoundaryDef,
  period: 'DAY' | 'NIGHT',
): boolean {
  if (!rule.enabled) {
    return false
  }
  if (rule.condition !== def.condition) {
    return false
  }
  if (rule.watchedSensorType == null) {
    return false
  }
  if (rule.watchedSensorType !== def.sensorType) {
    return false
  }
  if (rule.period !== null && rule.period !== period) {
    return false
  }
  return true
}

function isBlockingMode(mode: AutomationMode, ruleAction: 'ON' | 'OFF'): boolean {
  if (mode === AutomationMode.MANUAL) {
    return true
  }
  if (mode === AutomationMode.ALWAYS_ON && ruleAction === 'OFF') {
    return true
  }
  if (mode === AutomationMode.ALWAYS_OFF && ruleAction === 'ON') {
    return true
  }
  return false
}

function isRuleDeviceBlocking(rule: AutomationRule, devices: Device[], def: BoundaryDef): boolean {
  if (rule.condition !== def.condition) {
    return false
  }
  if (rule.watchedSensorType == null) {
    return false
  }
  if (rule.watchedSensorType !== def.sensorType) {
    return false
  }
  if (!rule.device) {
    return false
  }
  return isBlockingMode(rule.device.automationMode, rule.action)
}

export function computeBoundaryCoverage(
  day: PhaseEnvironmentPayload,
  night: PhaseEnvironmentPayload,
  rules: AutomationRule[],
  devices: Device[],
): EnvRuleCoverage {
  const deviceById = new Map(devices.map((d) => [d.id, d]))
  const rulesWithDevice = rules.map((r) => ({
    ...r,
    device: r.device ?? deviceById.get(r.deviceId),
  }))

  const boundaries: BoundaryCoverage[] = BOUNDARY_DEFS.map((def) => {
    const setInDay = isSet(day[def.key])
    const setInNight = isSet(night[def.key])
    const isSetAny = setInDay || setInNight

    const periodsToCheck: ('DAY' | 'NIGHT')[] = []
    if (setInDay) {
      periodsToCheck.push('DAY')
    }
    if (setInNight) {
      periodsToCheck.push('NIGHT')
    }

    let matchingRuleCount = 0
    for (const p of periodsToCheck) {
      for (const r of rulesWithDevice) {
        if (ruleCoversBoundary(r, def, p)) {
          matchingRuleCount++
        }
      }
    }

    const blockingDeviceNames: string[] = []
    for (const r of rulesWithDevice) {
      if (matchingRuleCount > 0 && isRuleDeviceBlocking(r, devices, def)) {
        const name = r.device?.name ?? r.deviceId
        if (!blockingDeviceNames.includes(name)) {
          blockingDeviceNames.push(name)
        }
      }
    }

    const hasMatchingRule = matchingRuleCount > 0

    return {
      blockingDeviceCount: blockingDeviceNames.length,
      blockingDeviceNames,
      condition: def.condition,
      hasMatchingRule,
      isSetAny,
      key: def.key,
      label: def.label,
      matchingRuleCount,
      payloadKey: def.payloadKey,
      setInDay,
      setInNight,
      side: def.side,
      unit: def.unit,
    }
  })

  const uncoveredCount = boundaries.filter((b) => b.isSetAny && !b.hasMatchingRule).length
  const blockedCount = boundaries.filter((b) => b.blockingDeviceCount > 0).length

  return {
    blockedCount,
    boundaries,
    hasIssues: uncoveredCount > 0 || blockedCount > 0,
    uncoveredCount,
  }
}

export interface EnvRuleCoverageInput {
  getDayDraft: () => PhaseEnvironmentPayload
  getNightDraft: () => PhaseEnvironmentPayload
  getRules: () => AutomationRule[]
  getDevices: () => Device[]
}

export function useEnvRuleCoverage(input: EnvRuleCoverageInput): ComputedRef<EnvRuleCoverage> {
  return computed(() =>
    computeBoundaryCoverage(
      input.getDayDraft(),
      input.getNightDraft(),
      input.getRules(),
      input.getDevices(),
    ),
  )
}
