import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DosingCalculatorDialog from './DosingCalculatorDialog.vue'
import { useApiStore } from '../stores/apiStore'
import { useNutrientStore } from '../stores/nutrientStore'
import { primeVueStubs } from '../utils/testStub'

describe('DosingCalculatorDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('calculates dosing and renders resolved nutrients, totals, and warnings', async () => {
    const apiStore = useApiStore()
    const nutrientStore = useNutrientStore()
    nutrientStore.nutrients = [
      { id: 'n1', name: 'Grow A' } as (typeof nutrientStore.nutrients)[number],
      { id: 'n2', name: 'Bloom B' } as (typeof nutrientStore.nutrients)[number],
    ]
    vi.spyOn(apiStore.dosing, 'preview').mockResolvedValue({
      mlByNutrientId: { n1: 12.345, n2: 6 },
      totalMl: 18.346,
      warnings: ['NO_PH_BANDS'],
    })

    const wrapper = mount(DosingCalculatorDialog, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'test-phase', modelValue: true },
    })

    await wrapper.get('[data-testid="reservoir-liters"]').setValue('10')
    await wrapper.get('form').trigger('submit')

    expect(apiStore.dosing.preview).toHaveBeenCalledWith('test-phase', {
      reservoirLiters: 10,
    })
    expect(wrapper.get('[data-testid="dosing-results"]').text()).toContain('Grow A')
    expect(wrapper.get('[data-testid="dosing-results"]').text()).toContain('12.35 ml')
    expect(wrapper.get('[data-testid="dosing-results"]').text()).toContain('Bloom B')
    expect(wrapper.get('[data-testid="dosing-total"]').text()).toContain('18.35 ml')
    expect(wrapper.get('[data-testid="dosing-warning"]').text()).toContain('No pH bands configured')
  })

  it('does not expose a period selector (DAY/NIGHT are not user-facing)', () => {
    const wrapper = mount(DosingCalculatorDialog, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'test-phase', modelValue: true },
    })
    expect(wrapper.find('[data-testid="dosing-period"]').exists()).toBe(false)
  })

  it('renders the empty result copy as phase-wide, not period-specific', async () => {
    const apiStore = useApiStore()
    const nutrientStore = useNutrientStore()
    nutrientStore.nutrients = [
      { id: 'n1', name: 'Grow A' } as (typeof nutrientStore.nutrients)[number],
    ]
    vi.spyOn(apiStore.dosing, 'preview').mockResolvedValue({
      mlByNutrientId: {},
      totalMl: 0,
      warnings: [],
    })

    const wrapper = mount(DosingCalculatorDialog, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'test-phase', modelValue: true },
    })
    await wrapper.get('form').trigger('submit')

    const resultsText = wrapper.get('[data-testid="dosing-results"]').text()
    expect(resultsText).toMatch(/phase/i)
    expect(resultsText).not.toMatch(/for this period/i)
  })
})
