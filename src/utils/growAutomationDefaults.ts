import { DeviceAction, DeviceType, RuleCondition, SensorType } from '../types/grow'
import type { CreateAutomationRulePayload, Device } from '../types/grow'

export interface DefaultRuleSpec {
  condition: RuleCondition
  action: DeviceAction
  watchedSensorType: SensorType
}

export const DEFAULT_DEVICE_RULES: Partial<Record<DeviceType, DefaultRuleSpec[]>> = {
  [DeviceType.HEATER]: [
    {
      action: DeviceAction.ON,
      condition: RuleCondition.BELOW_MIN,
      watchedSensorType: SensorType.TEMPERATURE,
    },
    {
      action: DeviceAction.OFF,
      condition: RuleCondition.ABOVE_TARGET,
      watchedSensorType: SensorType.TEMPERATURE,
    },
  ],
  [DeviceType.HUMIDIFIER]: [
    {
      action: DeviceAction.ON,
      condition: RuleCondition.BELOW_MIN,
      watchedSensorType: SensorType.HUMIDITY,
    },
    {
      action: DeviceAction.OFF,
      condition: RuleCondition.ABOVE_TARGET,
      watchedSensorType: SensorType.HUMIDITY,
    },
  ],
  [DeviceType.EXHAUST_FAN]: [
    {
      action: DeviceAction.ON,
      condition: RuleCondition.ABOVE_MAX,
      watchedSensorType: SensorType.HUMIDITY,
    },
    {
      action: DeviceAction.OFF,
      condition: RuleCondition.BELOW_TARGET,
      watchedSensorType: SensorType.HUMIDITY,
    },
    {
      action: DeviceAction.ON,
      condition: RuleCondition.ABOVE_MAX,
      watchedSensorType: SensorType.TEMPERATURE,
    },
    {
      action: DeviceAction.OFF,
      condition: RuleCondition.BELOW_MAX,
      watchedSensorType: SensorType.TEMPERATURE,
    },
  ],
}

export const DEFAULT_AUTOMATION_COOLDOWN_SECONDS = 180

export function buildDefaultAutomationPayloads(
  devices: Device[],
  growPhaseId: string,
): CreateAutomationRulePayload[] {
  const payloads: CreateAutomationRulePayload[] = []
  for (const dev of devices) {
    const specs = DEFAULT_DEVICE_RULES[dev.type]
    if (!specs) {
      continue
    }
    for (const spec of specs) {
      payloads.push({
        action: spec.action,
        condition: spec.condition,
        cooldownSeconds: DEFAULT_AUTOMATION_COOLDOWN_SECONDS,
        deviceId: dev.id,
        enabled: true,
        growPhaseId,
        period: null,
        watchedSensorType: spec.watchedSensorType,
      })
    }
  }
  return payloads
}
