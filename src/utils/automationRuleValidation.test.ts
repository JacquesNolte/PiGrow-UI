import { describe, expect, it } from 'vitest'
import { DeviceAction, DeviceType, RuleCondition, SensorType } from '../types/grow'
import type { Device } from '../types/grow'
import {
  buildCreatePayload,
  buildUpdatePayload,
  validateRuleDraft,
} from './automationRuleValidation'
import type { RuleDraft } from './automationRuleValidation'

const fan: Device = {
  automationMode: 'MANUAL' as never,
  controllerId: 'c',
  createdAt: '',
  id: 'd1',
  isActive: true,
  name: 'Exhaust',
  pinNumber: 1,
  type: DeviceType.EXHAUST_FAN,
  updatedAt: '',
}
const base = (over: Partial<RuleDraft> = {}): RuleDraft => ({
  action: DeviceAction.ON,
  condition: RuleCondition.ABOVE_MAX,
  cooldownSeconds: 60,
  deviceId: 'd1',
  intervalAnchorMinutes: null,
  intervalCycleSeconds: null,
  intervalOnSeconds: null,
  period: null,
  scheduleTimeMinutes: null,
  watchedSensorType: SensorType.TEMPERATURE,
  ...over,
})

describe('validateRuleDraft INTERVAL', () => {
  it('passes for 30/300 ON', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toBeNull()
  })
  it.each([
    { cycle: 300, label: 'cycle == on', on: 300 },
    { cycle: 299, label: 'cycle < on', on: 300 },
  ])('blocks cycle <= on ($label)', ({ cycle, on }) => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: cycle,
          intervalOnSeconds: on,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/greater than intervalOnSeconds/)
  })
  it('blocks missing onSeconds', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: 300,
          intervalOnSeconds: null,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/intervalOnSeconds is required/)
  })
  it('blocks missing cycleSeconds', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: null,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/intervalCycleSeconds is required/)
  })
  it('blocks LIGHT device', () => {
    const light = { ...fan, id: 'dL', type: DeviceType.LIGHT }
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          deviceId: 'dL',
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [light],
      ),
    ).toMatch(/LIGHT devices are not eligible/)
  })
  it('blocks action != ON', () => {
    expect(
      validateRuleDraft(
        base({
          action: DeviceAction.OFF,
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/action must be ON for condition INTERVAL/)
  })
  it('blocks non-null sensor', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
        }),
        [fan],
      ),
    ).toMatch(/watchedSensorType must be null for INTERVAL/)
  })
  it('accepts a null anchor (createdAt-based duty cycle)', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalAnchorMinutes: null,
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toBeNull()
  })
  it('accepts a time-of-day anchor (watering schedule)', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalAnchorMinutes: 420,
          intervalCycleSeconds: 172800,
          intervalOnSeconds: 900,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toBeNull()
  })
  it('blocks anchor > 1440', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.INTERVAL,
          intervalAnchorMinutes: 1441,
          intervalCycleSeconds: 300,
          intervalOnSeconds: 30,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/intervalAnchorMinutes must be between 0 and 1440/)
  })
  it('blocks anchor on a non-INTERVAL (threshold) rule', () => {
    expect(
      validateRuleDraft(
        base({
          intervalAnchorMinutes: 420,
        }),
        [fan],
      ),
    ).toMatch(/intervalAnchorMinutes must be null for non-INTERVAL/)
  })
})

describe('buildCreatePayload', () => {
  it('includes interval fields for INTERVAL', () => {
    const p = buildCreatePayload(
      base({
        condition: RuleCondition.INTERVAL,
        intervalAnchorMinutes: 420,
        intervalCycleSeconds: 172800,
        intervalOnSeconds: 900,
        watchedSensorType: null,
      }),
      'phase1',
    )
    expect(p).toMatchObject({
      action: 'ON',
      condition: 'INTERVAL',
      intervalAnchorMinutes: 420,
      intervalCycleSeconds: 172800,
      intervalOnSeconds: 900,
      watchedSensorType: null,
    })
  })
  it('omits interval fields for ABOVE_MAX', () => {
    const p = buildCreatePayload(base(), 'phase1')
    expect('intervalOnSeconds' in p).toBe(false)
    expect('intervalCycleSeconds' in p).toBe(false)
  })
})

describe('buildUpdatePayload', () => {
  it('includes interval fields for INTERVAL', () => {
    const p = buildUpdatePayload(
      base({
        condition: RuleCondition.INTERVAL,
        intervalAnchorMinutes: 420,
        intervalCycleSeconds: 172800,
        intervalOnSeconds: 900,
        watchedSensorType: null,
      }),
    )
    expect(p).toMatchObject({
      intervalCycleSeconds: 172800,
      intervalOnSeconds: 900,
      intervalAnchorMinutes: 420,
    })
  })
  it('sends explicit null for non-INTERVAL to clear stale values', () => {
    const p = buildUpdatePayload(base()) as Record<string, unknown>
    expect(p.intervalOnSeconds).toBeNull()
    expect(p.intervalCycleSeconds).toBeNull()
    expect(p.intervalAnchorMinutes).toBeNull()
    expect(p.scheduleTimeMinutes).toBeNull()
  })
})

describe('validateRuleDraft SCHEDULE_ON', () => {
  it('passes for SCHEDULE_ON at 480 with action ON and no sensor', () => {
    expect(
      validateRuleDraft(
        base({
          action: DeviceAction.ON,
          condition: RuleCondition.SCHEDULE_ON,
          scheduleTimeMinutes: 480,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toBeNull()
  })
  it('blocks action != ON', () => {
    expect(
      validateRuleDraft(
        base({
          action: DeviceAction.OFF,
          condition: RuleCondition.SCHEDULE_ON,
          scheduleTimeMinutes: 480,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/action must be ON for condition SCHEDULE_ON/)
  })
  it('blocks non-null watchedSensorType', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.SCHEDULE_ON,
          scheduleTimeMinutes: 480,
        }),
        [fan],
      ),
    ).toMatch(/watchedSensorType must be null for SCHEDULE/)
  })
  it('blocks intervalOnSeconds set', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.SCHEDULE_ON,
          intervalOnSeconds: 30,
          scheduleTimeMinutes: 480,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/intervalOnSeconds and intervalCycleSeconds must be null for SCHEDULE/)
  })
  it('blocks missing scheduleTimeMinutes', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.SCHEDULE_ON,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/scheduleTimeMinutes is required for SCHEDULE/)
  })
  it('blocks scheduleTimeMinutes < 0', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.SCHEDULE_ON,
          scheduleTimeMinutes: -1,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/scheduleTimeMinutes must be between 0 and 1439/)
  })
  it('blocks scheduleTimeMinutes > 1439', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.SCHEDULE_ON,
          scheduleTimeMinutes: 1440,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/scheduleTimeMinutes must be between 0 and 1439/)
  })
})

describe('validateRuleDraft SCHEDULE_OFF', () => {
  it('passes for SCHEDULE_OFF at 1140 with action OFF', () => {
    expect(
      validateRuleDraft(
        base({
          action: DeviceAction.OFF,
          condition: RuleCondition.SCHEDULE_OFF,
          scheduleTimeMinutes: 1140,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toBeNull()
  })
  it('blocks action != OFF', () => {
    expect(
      validateRuleDraft(
        base({
          action: DeviceAction.ON,
          condition: RuleCondition.SCHEDULE_OFF,
          scheduleTimeMinutes: 1140,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/action must be OFF for condition SCHEDULE_OFF/)
  })
})

describe('validateRuleDraft scheduleTimeMinutes on non-schedule', () => {
  it('blocks scheduleTimeMinutes on ABOVE_MAX', () => {
    expect(validateRuleDraft(base({ scheduleTimeMinutes: 480 }), [fan])).toMatch(
      /scheduleTimeMinutes is only valid for SCHEDULE_ON \/ SCHEDULE_OFF/,
    )
  })
  it('blocks scheduleTimeMinutes on ALWAYS_ON', () => {
    expect(
      validateRuleDraft(
        base({
          condition: RuleCondition.ALWAYS_ON,
          scheduleTimeMinutes: 480,
          watchedSensorType: null,
        }),
        [fan],
      ),
    ).toMatch(/scheduleTimeMinutes is only valid for SCHEDULE_ON \/ SCHEDULE_OFF/)
  })
})

describe('buildCreatePayload SCHEDULE', () => {
  it('includes scheduleTimeMinutes for SCHEDULE_ON', () => {
    const p = buildCreatePayload(
      base({
        action: DeviceAction.ON,
        condition: RuleCondition.SCHEDULE_ON,
        scheduleTimeMinutes: 480,
        watchedSensorType: null,
      }),
      'phase1',
    )
    expect(p).toMatchObject({
      action: 'ON',
      condition: 'SCHEDULE_ON',
      scheduleTimeMinutes: 480,
      watchedSensorType: null,
    })
    expect('intervalOnSeconds' in p).toBe(false)
    expect('intervalCycleSeconds' in p).toBe(false)
  })
  it('omits scheduleTimeMinutes for non-SCHEDULE', () => {
    const p = buildCreatePayload(base(), 'phase1')
    expect('scheduleTimeMinutes' in p).toBe(false)
  })
})

describe('buildUpdatePayload SCHEDULE', () => {
  it('includes scheduleTimeMinutes for SCHEDULE_ON and nulls interval fields', () => {
    const p = buildUpdatePayload(
      base({
        action: DeviceAction.ON,
        condition: RuleCondition.SCHEDULE_ON,
        scheduleTimeMinutes: 480,
        watchedSensorType: null,
      }),
    ) as Record<string, unknown>
    expect(p.scheduleTimeMinutes).toBe(480)
    expect(p.intervalOnSeconds).toBeNull()
    expect(p.intervalCycleSeconds).toBeNull()
  })
  it('sends scheduleTimeMinutes null for non-SCHEDULE to clear stale values', () => {
    const p = buildUpdatePayload(base()) as Record<string, unknown>
    expect(p.scheduleTimeMinutes).toBeNull()
  })
})
