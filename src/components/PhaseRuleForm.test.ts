import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { DeviceAction, RuleCondition } from '../types/grow'
import PhaseRuleForm from './PhaseRuleForm.vue'
import { primeVueStubs } from '../utils/testStub'

const devices = [{ id: 'd1', isActive: true, name: 'Exhaust', type: 'EXHAUST_FAN' } as never]
const props = (over: any = {}) => ({ devices, growPhaseId: 'p1', mode: 'create' as const, ...over })

describe('PhaseRuleForm INTERVAL branch', () => {
  it('shows interval inputs and hides sensor when condition=INTERVAL', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.INTERVAL }),
    })
    expect(w.find('[data-testid="interval-on"]').exists()).toBe(true)
    expect(w.find('[data-testid="sensor-picker"]').exists()).toBe(false)
  })
  it('hides interval inputs for ABOVE_MAX', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.ABOVE_MAX }),
    })
    expect(w.find('[data-testid="interval-on"]').exists()).toBe(false)
    expect(w.find('[data-testid="sensor-picker"]').exists()).toBe(true)
  })

  it('INTERVAL → ALWAYS_OFF sets action to OFF and clears interval fields', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.INTERVAL }),
    })
    // Start in INTERVAL mode: interval inputs visible, sensor hidden
    expect(w.find('[data-testid="interval-on"]').exists()).toBe(true)
    expect(w.find('[data-testid="sensor-picker"]').exists()).toBe(false)

    // Mutate draft condition to ALWAYS_OFF to trigger the condition watch
    ;(w.vm as any).draft.condition = RuleCondition.ALWAYS_OFF
    await w.vm.$nextTick()

    // Interval inputs should now be hidden
    expect(w.find('[data-testid="interval-on"]').exists()).toBe(false)
    // Action must be OFF (the bug was that it stayed ON)
    expect((w.vm as any).draft.action).toBe(DeviceAction.OFF)
    // Interval fields must be cleared
    expect((w.vm as any).draft.intervalOnSeconds).toBeNull()
    expect((w.vm as any).draft.intervalCycleSeconds).toBeNull()
  })
})

describe('PhaseRuleForm SCHEDULE branch', () => {
  it('shows hour/minute pickers and hides sensor for SCHEDULE_ON', () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.SCHEDULE_ON }),
    })
    expect(w.find('[data-testid="schedule-hour"]').exists()).toBe(true)
    expect(w.find('[data-testid="schedule-minute"]').exists()).toBe(true)
    expect(w.find('[data-testid="sensor-picker"]').exists()).toBe(false)
    expect(w.find('[data-testid="interval-on"]').exists()).toBe(false)
  })

  it('initializes action=OFF and scheduleTimeMinutes=480 for SCHEDULE_OFF', () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.SCHEDULE_OFF }),
    })
    expect((w.vm as any).draft.action).toBe(DeviceAction.OFF)
    expect((w.vm as any).draft.scheduleTimeMinutes).toBe(480)
  })

  it('initializes action=ON and scheduleTimeMinutes=480 for SCHEDULE_ON', () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.SCHEDULE_ON }),
    })
    expect((w.vm as any).draft.action).toBe(DeviceAction.ON)
    expect((w.vm as any).draft.scheduleTimeMinutes).toBe(480)
  })

  it('clears scheduleTimeMinutes when switching away from SCHEDULE_ON', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.SCHEDULE_ON }),
    })
    expect((w.vm as any).draft.scheduleTimeMinutes).toBe(480)
    ;(w.vm as any).draft.condition = RuleCondition.ALWAYS_ON
    await w.vm.$nextTick()
    expect((w.vm as any).draft.scheduleTimeMinutes).toBeNull()
  })
})

describe('PhaseRuleForm INTERVAL anchor', () => {
  it('enabling the anchor toggle sets a default anchor of 07:00 (420)', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.INTERVAL }),
    })
    expect((w.vm as any).draft.intervalAnchorMinutes).toBeNull()
    ;(w.vm as any).useAnchor = true
    await w.vm.$nextTick()
    expect((w.vm as any).draft.intervalAnchorMinutes).toBe(420)
  })

  it('disabling the anchor toggle clears it to null', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.INTERVAL }),
    })
    ;(w.vm as any).useAnchor = true
    await w.vm.$nextTick()
    ;(w.vm as any).useAnchor = false
    await w.vm.$nextTick()
    expect((w.vm as any).draft.intervalAnchorMinutes).toBeNull()
  })

  it('normalizes anchor=1440 to hour 0 in the picker (midnight, not 24)', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({
        initialCondition: RuleCondition.INTERVAL,
        mode: 'edit',
        initialRule: {
          id: 'r1',
          action: DeviceAction.ON,
          condition: RuleCondition.INTERVAL,
          cooldownSeconds: 180,
          deviceId: 'd1',
          intervalAnchorMinutes: 1440,
          intervalCycleSeconds: 86400,
          intervalOnSeconds: 900,
          period: null,
          scheduleTimeMinutes: null,
          watchedSensorType: null,
        } as never,
      }),
    })
    // 1440 == midnight == 00:00; the hour picker (0..23) must see 0, not 24.
    expect((w.vm as any).anchorHour).toBe(0)
    expect((w.vm as any).anchorMinute).toBe(0)
  })

  it('shows a human-readable preview with the anchor time', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({ initialCondition: RuleCondition.INTERVAL }),
    })
    ;(w.vm as any).draft.intervalOnSeconds = 900
    ;(w.vm as any).draft.intervalCycleSeconds = 172800
    ;(w.vm as any).draft.intervalAnchorMinutes = 420
    await w.vm.$nextTick()
    expect((w.vm as any).intervalPreview).toContain('at 07:00')
    expect((w.vm as any).intervalPreview).toContain('2d')
  })

  it('duration composite decomposes the ON seconds into days/hours/min/sec', async () => {
    const w = mount(PhaseRuleForm, {
      global: { stubs: primeVueStubs },
      props: props({
        initialCondition: RuleCondition.INTERVAL,
        mode: 'edit',
        initialRule: {
          id: 'r1',
          action: DeviceAction.ON,
          condition: RuleCondition.INTERVAL,
          cooldownSeconds: 180,
          deviceId: 'd1',
          intervalAnchorMinutes: null,
          intervalCycleSeconds: 172800, // 2d
          intervalOnSeconds: 900, // 15m
          period: null,
          scheduleTimeMinutes: null,
          watchedSensorType: null,
        } as never,
      }),
    })
    // ON composite: 0d 0h 15m 0s
    expect((w.find('[data-testid="interval-on-minutes"]').element as HTMLInputElement).value).toBe(
      '15',
    )
    // Cycle composite: 2d 0h 0m 0s
    expect((w.find('[data-testid="interval-cycle-days"]').element as HTMLInputElement).value).toBe(
      '2',
    )
  })
})
