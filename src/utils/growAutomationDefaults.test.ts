import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTOMATION_COOLDOWN_SECONDS,
  DEFAULT_DEVICE_RULES,
  buildDefaultAutomationPayloads,
} from './growAutomationDefaults'
import { DeviceAction, DeviceType, RuleCondition, SensorType } from '../types/grow'
import type { Device } from '../types/grow'

function makeDevice(type: DeviceType, over: Partial<Device> = {}): Device {
  return {
    automationMode: 'MANUAL' as never,
    controllerId: 'c1',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: `d-${type}`,
    isActive: true,
    name: type,
    pinNumber: 1,
    type,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('DEFAULT_DEVICE_RULES', () => {
  it('defines rules for HEATER, HUMIDIFIER, EXHAUST_FAN only', () => {
    expect(Object.keys(DEFAULT_DEVICE_RULES).toSorted()).toEqual(
      [DeviceType.HEATER, DeviceType.HUMIDIFIER, DeviceType.EXHAUST_FAN].toSorted(),
    )
    expect(DEFAULT_DEVICE_RULES[DeviceType.HEATER]).toHaveLength(2)
    expect(DEFAULT_DEVICE_RULES[DeviceType.HUMIDIFIER]).toHaveLength(2)
    expect(DEFAULT_DEVICE_RULES[DeviceType.EXHAUST_FAN]).toHaveLength(4)
  })

  it('heater drives temp: ON below min, OFF above target', () => {
    const [on, off] = DEFAULT_DEVICE_RULES[DeviceType.HEATER]!
    expect(on).toEqual({
      action: DeviceAction.ON,
      condition: RuleCondition.BELOW_MIN,
      watchedSensorType: SensorType.TEMPERATURE,
    })
    expect(off).toEqual({
      action: DeviceAction.OFF,
      condition: RuleCondition.ABOVE_TARGET,
      watchedSensorType: SensorType.TEMPERATURE,
    })
  })

  it('humidifier drives humidity: ON below min, OFF above target', () => {
    const [on, off] = DEFAULT_DEVICE_RULES[DeviceType.HUMIDIFIER]!
    expect(on).toEqual({
      action: DeviceAction.ON,
      condition: RuleCondition.BELOW_MIN,
      watchedSensorType: SensorType.HUMIDITY,
    })
    expect(off).toEqual({
      action: DeviceAction.OFF,
      condition: RuleCondition.ABOVE_TARGET,
      watchedSensorType: SensorType.HUMIDITY,
    })
  })

  it('exhaust fan drives humidity: ON above max, OFF below target (hysteresis)', () => {
    const [on, off] = DEFAULT_DEVICE_RULES[DeviceType.EXHAUST_FAN]!
    expect(on).toEqual({
      action: DeviceAction.ON,
      condition: RuleCondition.ABOVE_MAX,
      watchedSensorType: SensorType.HUMIDITY,
    })
    expect(off).toEqual({
      action: DeviceAction.OFF,
      condition: RuleCondition.BELOW_TARGET,
      watchedSensorType: SensorType.HUMIDITY,
    })
  })

  it('exhaust fan also drives temp: ON above max, OFF below max', () => {
    const [, , tempOn, tempOff] = DEFAULT_DEVICE_RULES[DeviceType.EXHAUST_FAN]!
    expect(tempOn).toEqual({
      action: DeviceAction.ON,
      condition: RuleCondition.ABOVE_MAX,
      watchedSensorType: SensorType.TEMPERATURE,
    })
    expect(tempOff).toEqual({
      action: DeviceAction.OFF,
      condition: RuleCondition.BELOW_MAX,
      watchedSensorType: SensorType.TEMPERATURE,
    })
  })
})

describe('buildDefaultAutomationPayloads', () => {
  it('emits 8 payloads (heater 2, humidifier 2, exhaust fan 4) when all 3 device types are present', () => {
    const devices = [
      makeDevice(DeviceType.HEATER),
      makeDevice(DeviceType.HUMIDIFIER),
      makeDevice(DeviceType.EXHAUST_FAN),
    ]
    const payloads = buildDefaultAutomationPayloads(devices, 'phase-1')
    expect(payloads).toHaveLength(8)
    for (const p of payloads) {
      expect(p.growPhaseId).toBe('phase-1')
      expect(p.cooldownSeconds).toBe(DEFAULT_AUTOMATION_COOLDOWN_SECONDS)
      expect(p.enabled).toBe(true)
      expect(p.period).toBeNull()
    }
  })

  it('scopes each payload to its device and the given phase', () => {
    const devices = [makeDevice(DeviceType.HEATER, { id: 'h1' })]
    const payloads = buildDefaultAutomationPayloads(devices, 'phase-42')
    expect(payloads.map((p) => p.deviceId)).toEqual(['h1', 'h1'])
    expect(payloads.every((p) => p.growPhaseId === 'phase-42')).toBe(true)
  })

  it('creates rules for inactive (relay-off) devices — isActive is relay state, not enabled', () => {
    const devices = [makeDevice(DeviceType.HEATER, { isActive: false })]
    const payloads = buildDefaultAutomationPayloads(devices, 'p1')
    expect(payloads).toHaveLength(2)
    expect(payloads.every((p) => p.deviceId === 'd-HEATER')).toBe(true)
  })

  it('creates rules for mixed active/inactive devices of the same type', () => {
    const devices = [
      makeDevice(DeviceType.HEATER, { id: 'h-on', isActive: true }),
      makeDevice(DeviceType.HEATER, { id: 'h-off', isActive: false }),
    ]
    const payloads = buildDefaultAutomationPayloads(devices, 'p1')
    expect(payloads).toHaveLength(4)
    expect(payloads.map((p) => p.deviceId)).toEqual(['h-on', 'h-on', 'h-off', 'h-off'])
  })

  it('skips non-targeted device types (LIGHT, WATER_PUMP, CO2_INJECTOR, etc.)', () => {
    const devices = [
      makeDevice(DeviceType.LIGHT),
      makeDevice(DeviceType.WATER_PUMP),
      makeDevice(DeviceType.CO2_INJECTOR),
      makeDevice(DeviceType.INTAKE_FAN),
      makeDevice(DeviceType.CIRCULATION_FAN),
      makeDevice(DeviceType.DEHUMIDIFIER),
      makeDevice(DeviceType.AIR_CONDITIONER),
    ]
    expect(buildDefaultAutomationPayloads(devices, 'p1')).toEqual([])
  })

  it('creates rules for every active device of a type (multi-heater)', () => {
    const devices = [
      makeDevice(DeviceType.HEATER, { id: 'h1' }),
      makeDevice(DeviceType.HEATER, { id: 'h2' }),
    ]
    const payloads = buildDefaultAutomationPayloads(devices, 'p1')
    expect(payloads).toHaveLength(4)
    expect(payloads.map((p) => p.deviceId)).toEqual(['h1', 'h1', 'h2', 'h2'])
  })

  it('returns an empty list for no devices', () => {
    expect(buildDefaultAutomationPayloads([], 'p1')).toEqual([])
  })

  it('preserves ON/OFF ordering and sensor per device type', () => {
    const payloads = buildDefaultAutomationPayloads(
      [makeDevice(DeviceType.EXHAUST_FAN, { id: 'f1' })],
      'p1',
    )
    expect(payloads).toHaveLength(4)
    const [humOn, humOff, tempOn, tempOff] = payloads
    expect(humOn!.condition).toBe(RuleCondition.ABOVE_MAX)
    expect(humOn!.action).toBe(DeviceAction.ON)
    expect(humOn!.watchedSensorType).toBe(SensorType.HUMIDITY)
    expect(humOff!.condition).toBe(RuleCondition.BELOW_TARGET)
    expect(humOff!.action).toBe(DeviceAction.OFF)
    expect(humOff!.watchedSensorType).toBe(SensorType.HUMIDITY)
    expect(tempOn!.condition).toBe(RuleCondition.ABOVE_MAX)
    expect(tempOn!.action).toBe(DeviceAction.ON)
    expect(tempOn!.watchedSensorType).toBe(SensorType.TEMPERATURE)
    expect(tempOff!.condition).toBe(RuleCondition.BELOW_MAX)
    expect(tempOff!.action).toBe(DeviceAction.OFF)
    expect(tempOff!.watchedSensorType).toBe(SensorType.TEMPERATURE)
  })
})
