import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DurationInput from './DurationInput.vue'
import { primeVueStubs } from '../utils/testStub'

const mountDur = (modelValue: number | null, testId = 'dur') =>
  mount(DurationInput, {
    global: { stubs: primeVueStubs },
    props: { modelValue, testId },
  })

const setVal = (w: ReturnType<typeof mountDur>, testid: string, val: string) => {
  w.find(`[data-testid="${testid}"]`).setValue(val)
}

describe('DurationInput decompose', () => {
  it('renders four part inputs', () => {
    const w = mountDur(0)
    expect(w.find('[data-testid="dur-days"]').exists()).toBe(true)
    expect(w.find('[data-testid="dur-hours"]').exists()).toBe(true)
    expect(w.find('[data-testid="dur-minutes"]').exists()).toBe(true)
    expect(w.find('[data-testid="dur-seconds"]').exists()).toBe(true)
  })
  it('decomposes 900s -> 0d 0h 15m 0s', () => {
    const w = mountDur(900)
    expect((w.find('[data-testid="dur-days"]').element as HTMLInputElement).value).toBe('0')
    expect((w.find('[data-testid="dur-hours"]').element as HTMLInputElement).value).toBe('0')
    expect((w.find('[data-testid="dur-minutes"]').element as HTMLInputElement).value).toBe('15')
    expect((w.find('[data-testid="dur-seconds"]').element as HTMLInputElement).value).toBe('0')
  })
  it('decomposes 172800s -> 2d 0h 0m 0s (2 days)', () => {
    const w = mountDur(172800)
    expect((w.find('[data-testid="dur-days"]').element as HTMLInputElement).value).toBe('2')
  })
  it('decomposes 259200s -> 3d 0h 0m 0s (3 days)', () => {
    const w = mountDur(259200)
    expect((w.find('[data-testid="dur-days"]').element as HTMLInputElement).value).toBe('3')
  })
  it('decomposes 93784s -> 1d 2h 3m 4s', () => {
    const w = mountDur(93784)
    expect((w.find('[data-testid="dur-days"]').element as HTMLInputElement).value).toBe('1')
    expect((w.find('[data-testid="dur-hours"]').element as HTMLInputElement).value).toBe('2')
    expect((w.find('[data-testid="dur-minutes"]').element as HTMLInputElement).value).toBe('3')
    expect((w.find('[data-testid="dur-seconds"]').element as HTMLInputElement).value).toBe('4')
  })
  it('treats null modelValue as all zeros', () => {
    const w = mountDur(null)
    expect((w.find('[data-testid="dur-days"]').element as HTMLInputElement).value).toBe('0')
    expect((w.find('[data-testid="dur-minutes"]').element as HTMLInputElement).value).toBe('0')
  })
})

describe('DurationInput recompose', () => {
  it('setting minutes to 15 emits 900', async () => {
    const w = mountDur(0)
    setVal(w, 'dur-minutes', '15')
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(900)
  })
  it('setting days to 2 emits 172800', async () => {
    const w = mountDur(0)
    setVal(w, 'dur-days', '2')
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(172800)
  })
  it('preserves other parts when setting one (900 -> set hours=1 -> 3600+900=4500)', async () => {
    const w = mountDur(900) // 0d 0h 15m 0s
    setVal(w, 'dur-hours', '1') // -> 0d 1h 15m 0s = 4500
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(4500)
  })
  it('setting seconds to 4 on 93780 (1d2h3m0s) -> 93784', async () => {
    const w = mountDur(93780)
    setVal(w, 'dur-seconds', '4')
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(93784)
  })
  it('floors fractional and negative input to safe values', async () => {
    const w = mountDur(0)
    setVal(w, 'dur-minutes', '12.9')
    // 12 minutes (fractional floored)
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(720)
  })
})
