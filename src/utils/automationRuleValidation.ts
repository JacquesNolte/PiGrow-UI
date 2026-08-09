import { DeviceAction, DeviceType, RuleCondition } from '../types/grow'
import type {
  CreateAutomationRulePayload,
  DayNightPeriod,
  Device,
  SensorType,
  UpdateAutomationRulePayload,
} from '../types/grow'

export interface RuleDraft {
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

const THRESHOLD = new Set<RuleCondition>([
  RuleCondition.ABOVE_MAX,
  RuleCondition.BELOW_MIN,
  RuleCondition.BELOW_MAX,
  RuleCondition.ABOVE_MIN,
  RuleCondition.ABOVE_TARGET,
  RuleCondition.BELOW_TARGET,
])

const SCHEDULE = new Set<RuleCondition>([RuleCondition.SCHEDULE_ON, RuleCondition.SCHEDULE_OFF])

export function validateRuleDraft(d: RuleDraft, devices: Device[]): string | null {
  if (!d.deviceId) {
    return 'Select a device.'
  }
  const device = devices.find((x) => x.id === d.deviceId)
  if (device && device.type === DeviceType.LIGHT) {
    return 'LIGHT devices are not eligible for automation rules; light scheduling is driven by the grow-phase day/night clock'
  }
  if (d.condition === RuleCondition.INTERVAL) {
    if (d.action !== DeviceAction.ON) {
      return 'action must be ON for condition INTERVAL'
    }
    if (d.watchedSensorType != null) {
      return 'watchedSensorType must be null for INTERVAL rules'
    }
    if (d.intervalOnSeconds == null || d.intervalOnSeconds < 1) {
      return 'intervalOnSeconds is required for INTERVAL rules'
    }
    if (d.intervalCycleSeconds == null || d.intervalCycleSeconds < 2) {
      return 'intervalCycleSeconds is required for INTERVAL rules'
    }
    if (d.intervalCycleSeconds <= d.intervalOnSeconds) {
      return 'intervalCycleSeconds must be greater than intervalOnSeconds'
    }
    if (
      d.intervalAnchorMinutes != null &&
      (d.intervalAnchorMinutes < 0 || d.intervalAnchorMinutes > 1440)
    ) {
      return 'intervalAnchorMinutes must be between 0 and 1440 (minutes from midnight)'
    }
    if (d.scheduleTimeMinutes != null) {
      return 'scheduleTimeMinutes must be null for INTERVAL rules'
    }
  } else if (SCHEDULE.has(d.condition)) {
    if (d.watchedSensorType != null) {
      return 'watchedSensorType must be null for SCHEDULE_ON / SCHEDULE_OFF rules'
    }
    if (d.intervalOnSeconds != null || d.intervalCycleSeconds != null) {
      return 'intervalOnSeconds and intervalCycleSeconds must be null for SCHEDULE_ON / SCHEDULE_OFF rules'
    }
    if (d.intervalAnchorMinutes != null) {
      return 'intervalAnchorMinutes must be null for SCHEDULE_ON / SCHEDULE_OFF rules'
    }
    if (d.scheduleTimeMinutes == null) {
      return 'scheduleTimeMinutes is required for SCHEDULE_ON / SCHEDULE_OFF rules'
    }
    if (d.scheduleTimeMinutes < 0 || d.scheduleTimeMinutes > 1439) {
      return 'scheduleTimeMinutes must be between 0 and 1439 (minutes from midnight)'
    }
    if (d.condition === RuleCondition.SCHEDULE_ON && d.action !== DeviceAction.ON) {
      return 'action must be ON for condition SCHEDULE_ON'
    }
    if (d.condition === RuleCondition.SCHEDULE_OFF && d.action !== DeviceAction.OFF) {
      return 'action must be OFF for condition SCHEDULE_OFF'
    }
  } else {
    if (d.intervalOnSeconds != null || d.intervalCycleSeconds != null) {
      return 'intervalOnSeconds and intervalCycleSeconds must be null for non-INTERVAL rules'
    }
    if (d.intervalAnchorMinutes != null) {
      return 'intervalAnchorMinutes must be null for non-INTERVAL rules'
    }
    if (d.scheduleTimeMinutes != null) {
      return 'scheduleTimeMinutes is only valid for SCHEDULE_ON / SCHEDULE_OFF rules'
    }
    if (THRESHOLD.has(d.condition) && d.watchedSensorType == null) {
      return 'watchedSensorType is required for threshold conditions (ABOVE_MAX, BELOW_MIN, ABOVE_MIN, BELOW_MAX, ABOVE_TARGET, BELOW_TARGET)'
    }
    if (
      (d.condition === RuleCondition.ALWAYS_ON || d.condition === RuleCondition.ALWAYS_OFF) &&
      d.watchedSensorType != null
    ) {
      return 'watchedSensorType must be null for ALWAYS_ON / ALWAYS_OFF rules'
    }
    if (d.condition === RuleCondition.ALWAYS_ON && d.action !== DeviceAction.ON) {
      return 'action must be ON for condition ALWAYS_ON'
    }
    if (d.condition === RuleCondition.ALWAYS_OFF && d.action !== DeviceAction.OFF) {
      return 'action must be OFF for condition ALWAYS_OFF'
    }
  }
  if (d.cooldownSeconds < 0) {
    return 'Cooldown cannot be negative.'
  }
  return null
}

export function buildCreatePayload(d: RuleDraft, growPhaseId: string): CreateAutomationRulePayload {
  const base: CreateAutomationRulePayload = {
    action: d.action,
    condition: d.condition,
    cooldownSeconds: d.cooldownSeconds,
    deviceId: d.deviceId!,
    enabled: true,
    growPhaseId,
    period: d.period,
    watchedSensorType: d.watchedSensorType,
  }
  if (d.condition === RuleCondition.INTERVAL) {
    return {
      ...base,
      intervalAnchorMinutes: d.intervalAnchorMinutes,
      intervalCycleSeconds: d.intervalCycleSeconds!,
      intervalOnSeconds: d.intervalOnSeconds!,
    }
  }
  if (SCHEDULE.has(d.condition)) {
    return {
      ...base,
      scheduleTimeMinutes: d.scheduleTimeMinutes!,
    }
  }
  return base
}

export function buildUpdatePayload(d: RuleDraft): UpdateAutomationRulePayload {
  const base: UpdateAutomationRulePayload = {
    action: d.action,
    condition: d.condition,
    cooldownSeconds: d.cooldownSeconds,
    deviceId: d.deviceId!,
    period: d.period,
    watchedSensorType: d.watchedSensorType,
  }
  if (d.condition === RuleCondition.INTERVAL) {
    return {
      ...base,
      intervalAnchorMinutes: d.intervalAnchorMinutes,
      intervalCycleSeconds: d.intervalCycleSeconds!,
      intervalOnSeconds: d.intervalOnSeconds!,
    }
  }
  if (SCHEDULE.has(d.condition)) {
    return {
      ...base,
      intervalAnchorMinutes: null,
      intervalCycleSeconds: null,
      intervalOnSeconds: null,
      scheduleTimeMinutes: d.scheduleTimeMinutes!,
    }
  }
  return {
    ...base,
    intervalAnchorMinutes: null,
    intervalCycleSeconds: null,
    intervalOnSeconds: null,
    scheduleTimeMinutes: null,
  }
}
