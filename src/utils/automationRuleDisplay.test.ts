import { describe, expect, it } from 'vitest'
import { conditionShort, formatIntervalRule, formatScheduleTime } from './automationRuleDisplay'
import { DeviceAction, RuleCondition, SensorType } from '../types/grow'
import type { AutomationRule } from '../types/grow'

const intervalRule = (on: number | null, cyc: number | null, anchor: number | null = null) =>
  ({
    condition: RuleCondition.INTERVAL,
    intervalAnchorMinutes: anchor,
    intervalCycleSeconds: cyc,
    intervalOnSeconds: on,
  }) as AutomationRule

const thresholdRule = (condition: RuleCondition, watchedSensorType: SensorType) =>
  ({ condition, watchedSensorType }) as AutomationRule

const scheduleRule = (condition: RuleCondition, scheduleTimeMinutes: number | null) =>
  ({ condition, scheduleTimeMinutes }) as AutomationRule

describe('formatIntervalRule', () => {
  it('formats 30/300', () => {
    expect(formatIntervalRule(intervalRule(30, 300))).toBe('ON 30s every 5m (OFF 4m 30s)')
  })
  it('formats 60/3600', () => {
    expect(formatIntervalRule(intervalRule(60, 3600))).toBe('ON 1m every 1h (OFF 59m)')
  })
  it('handles nulls', () => {
    expect(formatIntervalRule(intervalRule(null, null))).toBe('Interval')
  })
  it('appends anchor time-of-day when set', () => {
    expect(formatIntervalRule(intervalRule(900, 172800, 420))).toBe(
      'ON 15m every 2d (OFF 1d 23h 45m) at 07:00',
    )
  })
  it('omits anchor when null (duty-cycle)', () => {
    expect(formatIntervalRule(intervalRule(30, 300, null))).toBe('ON 30s every 5m (OFF 4m 30s)')
  })
  it('normalizes anchor 1440 to 00:00 (midnight)', () => {
    expect(formatIntervalRule(intervalRule(60, 3600, 1440))).toBe(
      'ON 1m every 1h (OFF 59m) at 00:00',
    )
  })
})

describe('formatScheduleTime', () => {
  it('formats 0 as 00:00', () => {
    expect(formatScheduleTime(0)).toBe('00:00')
  })
  it('formats 480 as 08:00', () => {
    expect(formatScheduleTime(480)).toBe('08:00')
  })
  it('formats 1140 as 19:00', () => {
    expect(formatScheduleTime(1140)).toBe('19:00')
  })
  it('formats 1439 as 23:59', () => {
    expect(formatScheduleTime(1439)).toBe('23:59')
  })
  it('returns "—" for null', () => {
    expect(formatScheduleTime(null)).toBe('—')
  })
  it('returns "—" for undefined', () => {
    expect(formatScheduleTime()).toBe('—')
  })
  it('returns "—" for out-of-range negative', () => {
    expect(formatScheduleTime(-1)).toBe('—')
  })
  it('returns "—" for out-of-range > 1439', () => {
    expect(formatScheduleTime(1440)).toBe('—')
  })
})

describe('conditionShort', () => {
  it('renders ABOVE_MAX on temperature as "temp > max"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_MAX, SensorType.TEMPERATURE))).toBe(
      'temp > max',
    )
  })

  it('renders ABOVE_MAX on TEMP_HUMIDITY as "temp > max"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_MAX, SensorType.TEMP_HUMIDITY))).toBe(
      'temp > max',
    )
  })

  it('renders ABOVE_MAX on humidity as "reading > max"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_MAX, SensorType.HUMIDITY))).toBe(
      'reading > max',
    )
  })

  it('renders ABOVE_MAX on CO2 as "reading > max"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_MAX, SensorType.CO2))).toBe(
      'reading > max',
    )
  })

  it('renders BELOW_MIN on temperature as "temp < min"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.BELOW_MIN, SensorType.TEMPERATURE))).toBe(
      'temp < min',
    )
  })

  it('renders BELOW_MIN on CO2 as "reading < min"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.BELOW_MIN, SensorType.CO2))).toBe(
      'reading < min',
    )
  })

  it('renders ABOVE_TARGET as "reading > target"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_TARGET, SensorType.HUMIDITY))).toBe(
      'reading > target',
    )
  })

  it('renders BELOW_TARGET as "reading < target"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.BELOW_TARGET, SensorType.HUMIDITY))).toBe(
      'reading < target',
    )
  })

  it('renders BELOW_MAX (recovery) as "reading < max (recovery)"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.BELOW_MAX, SensorType.HUMIDITY))).toBe(
      'reading < max (recovery)',
    )
  })

  it('renders ABOVE_MIN (recovery) as "reading > min (recovery)"', () => {
    expect(conditionShort(thresholdRule(RuleCondition.ABOVE_MIN, SensorType.HUMIDITY))).toBe(
      'reading > min (recovery)',
    )
  })

  it('renders ALWAYS_ON as "Always ON"', () => {
    expect(conditionShort({ condition: RuleCondition.ALWAYS_ON } as AutomationRule)).toBe(
      'Always ON',
    )
  })

  it('renders ALWAYS_OFF as "Always OFF"', () => {
    expect(conditionShort({ condition: RuleCondition.ALWAYS_OFF } as AutomationRule)).toBe(
      'Always OFF',
    )
  })

  it('renders INTERVAL via formatIntervalRule (valid fields)', () => {
    expect(conditionShort(intervalRule(30, 300))).toBe('ON 30s every 5m (OFF 4m 30s)')
  })

  it('renders INTERVAL as "Interval" when fields are null', () => {
    expect(conditionShort(intervalRule(null, null))).toBe('Interval')
  })

  it('renders SCHEDULE_ON as "ON daily at HH:MM"', () => {
    expect(conditionShort(scheduleRule(RuleCondition.SCHEDULE_ON, 480))).toBe('ON daily at 08:00')
  })

  it('renders SCHEDULE_OFF as "OFF daily at HH:MM"', () => {
    expect(conditionShort(scheduleRule(RuleCondition.SCHEDULE_OFF, 1140))).toBe(
      'OFF daily at 19:00',
    )
  })

  it('renders SCHEDULE_ON with null time as "ON daily at —"', () => {
    expect(conditionShort(scheduleRule(RuleCondition.SCHEDULE_ON, null))).toBe('ON daily at —')
  })
})

// Ensure DeviceAction import is retained for future tests even if unused above.
void DeviceAction
