import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const useConfirmMock = { require: vi.fn() }
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => useConfirmMock,
}))

interface TestNutrient {
  id: string
  name: string
  brand: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface TestPhaseNutrient {
  id: string
  growPhaseId: string
  nutrientId: string
  doseMlPerL: number
  sortOrder: number
  createdAt: string
  updatedAt: string
}

const nutrients: TestNutrient[] = [
  {
    brand: 'GH',
    createdAt: '2026-07-21T00:00:00.000Z',
    id: 'nut1',
    name: 'FloraGro',
    notes: null,
    updatedAt: '2026-07-21T00:00:00.000Z',
  },
  {
    brand: 'GH',
    createdAt: '2026-07-21T00:00:00.000Z',
    id: 'nut2',
    name: 'FloraBloom',
    notes: null,
    updatedAt: '2026-07-21T00:00:00.000Z',
  },
]

let phaseNutrients: TestPhaseNutrient[] = []

interface CreateRecord {
  nutrientId: string
  doseMlPerL: number
  sortOrder?: number
}

interface UpdateRecord {
  doseMlPerL?: number
  sortOrder?: number
}

const recordedCreates: CreateRecord[] = []
const recordedUpdates: UpdateRecord[] = []

vi.mock('../stores/apiStore', () => ({
  useApiStore: () => ({
    get nutrients(): TestNutrient[] {
      return nutrients
    },
    phaseNutrients: {
      addOne: (
        _growPhaseId: string,
        payload: Omit<TestPhaseNutrient, 'id' | 'createdAt' | 'updatedAt'>,
      ) => {
        recordedCreates.push({
          doseMlPerL: payload.doseMlPerL,
          nutrientId: payload.nutrientId,
          sortOrder: payload.sortOrder,
        })
        const created: TestPhaseNutrient = {
          ...payload,
          createdAt: '2026-07-21T00:00:00.000Z',
          id: `pn${phaseNutrients.length + 1}`,
          updatedAt: '2026-07-21T00:00:00.000Z',
        }
        phaseNutrients.push(created)
        return Promise.resolve(created)
      },
      fetchForPhase: (_growPhaseId: string) => Promise.resolve(phaseNutrients),
      removeOne: (_growPhaseId: string, id: string) => {
        phaseNutrients = phaseNutrients.filter((pn) => pn.id !== id)
        return Promise.resolve()
      },
      updateOne: (
        _growPhaseId: string,
        id: string,
        payload: Partial<Omit<TestPhaseNutrient, 'id' | 'createdAt' | 'updatedAt'>>,
      ) => {
        recordedUpdates.push({
          doseMlPerL: payload.doseMlPerL,
          sortOrder: payload.sortOrder,
        })
        const idx = phaseNutrients.findIndex((pn) => pn.id === id)
        if (idx !== -1) {
          phaseNutrients[idx] = { ...phaseNutrients[idx]!, ...payload } as TestPhaseNutrient
          return Promise.resolve(phaseNutrients[idx]!)
        }
        return Promise.reject(new Error('not found'))
      },
    },
  }),
}))

import { defineComponent, h } from 'vue'
import PhaseNutrientList from './PhaseNutrientList.vue'
import { primeVueStubs } from '../utils/testStub'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const SelectStub = defineComponent({
  name: 'SelectStub',
  props: ['modelValue', 'options', 'optionLabel', 'optionValue'],
  emits: ['update:modelValue'],
  setup(_props, { emit }) {
    return () => {
      const options = _props.options as Array<{ id: string; name: string }> | undefined
      const optionValue = (_props.optionValue as string) || 'id'
      return h(
        'select',
        {
          'data-testid': 'pn-nutrient-select',
          onChange: (e: Event) => {
            const value = (e.target as HTMLSelectElement).value
            emit('update:modelValue', value || null)
          },
        },
        [
          h('option', { disabled: true, value: '' }, 'Select'),
          ...(options ?? []).map((o) =>
            h('option', { value: o[optionValue as keyof typeof o] as string }, o.name),
          ),
        ],
      )
    }
  },
})

function setSelectValue(wrapper: VueWrapper, value: string) {
  const select = wrapper.get('[data-testid="pn-nutrient-select"]')
  const selectEl = select.element as unknown as HTMLSelectElement
  selectEl.value = value
  selectEl.dispatchEvent(new Event('change', { bubbles: true }))
}

function setDoseValue(wrapper: VueWrapper, value: string) {
  const input = wrapper.get('[data-testid="pn-dose"]')
  const inputEl = input.element as unknown as HTMLInputElement
  inputEl.value = value
  inputEl.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PhaseNutrientList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    phaseNutrients = []
    recordedCreates.length = 0
    recordedUpdates.length = 0
    useConfirmMock.require.mockReset()
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('renders the locked-hint when no phaseId is provided', () => {
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: '' },
    })
    expect(w.text()).toMatch(/save the grow first/i)
  })

  it('hides the Add button, row actions, and dialog in readonly mode', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 2.5,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1', readonly: true },
    })
    await flush()

    expect(w.find('[data-testid="pn-add"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-edit-pn1"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-delete-pn1"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-save"]').exists()).toBe(false)
    expect(w.text()).toContain('FloraGro')
    expect(w.text()).toContain('2.5')
  })

  it('shows the generic empty state (no Add prompt) in readonly mode', async () => {
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1', readonly: true },
    })
    await flush()

    expect(w.text()).toMatch(/no nutrients configured/i)
    expect(w.text()).not.toMatch(/click.*add/i)
  })

  it('shows the empty state when no rows exist for the phase', async () => {
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.text()).toMatch(/no nutrients configured/i)
  })

  it('renders a single shared list of phase nutrient rows with resolved nutrient name and dose', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 2.5,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 3,
        growPhaseId: 'p1',
        id: 'pn2',
        nutrientId: 'nut2',
        sortOrder: 2,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w: VueWrapper = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.text()).toContain('FloraGro')
    expect(w.text()).toContain('FloraBloom')
    expect(w.text()).toContain('2.5')
    expect(w.text()).toContain('3')
    expect(w.text()).not.toMatch(/DAY/i)
    expect(w.text()).not.toMatch(/NIGHT/i)
  })

  it('renders edit and delete actions for each row', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.find('[data-testid="pn-edit-pn1"]').exists()).toBe(true)
    expect(w.find('[data-testid="pn-delete-pn1"]').exists()).toBe(true)
  })

  it('does not render a period chip or DAY/NIGHT toggle', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.find('[data-testid="pn-both-toggle"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-period-pn1"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-add-day"]').exists()).toBe(false)
    expect(w.find('[data-testid="pn-add-night"]').exists()).toBe(false)
  })

  it('sends a periodless create payload when adding a nutrient', async () => {
    const w = mount(PhaseNutrientList, {
      global: { stubs: { ...primeVueStubs, Select: SelectStub } },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="pn-add"]').trigger('click')
    await flush()

    setSelectValue(w, 'nut1')
    setDoseValue(w, '2.5')
    await flush()

    await w.get('[data-testid="pn-save"]').trigger('click')
    await flush()

    expect(recordedCreates.length).toBe(1)
    const payload = recordedCreates[0] as unknown as Record<string, unknown>
    expect(payload).not.toHaveProperty('period')
    expect(payload.doseMlPerL).toBe(2.5)
    expect(payload.nutrientId).toBe('nut1')
  })

  it('sends a periodless update payload when editing a row', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: { ...primeVueStubs, Select: SelectStub } },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="pn-edit-pn1"]').trigger('click')
    await flush()

    setDoseValue(w, '4.0')
    await flush()

    await w.get('[data-testid="pn-save"]').trigger('click')
    await flush()

    expect(recordedUpdates.length).toBe(1)
    const payload = recordedUpdates[0] as unknown as Record<string, unknown>
    expect(payload).not.toHaveProperty('period')
    expect(payload.doseMlPerL).toBe(4)
  })

  it('hides nutrient options that are already added to the phase', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: { ...primeVueStubs, Select: SelectStub } },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="pn-add"]').trigger('click')
    await flush()

    const select = w.get('[data-testid="pn-nutrient-select"]')
    const optionValues = select.findAll('option').map((o) => o.attributes('value'))
    expect(optionValues).not.toContain('nut1')
    expect(optionValues).toContain('nut2')
  })

  it('disables the Add button when every nutrient is already added', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 1,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn2',
        nutrientId: 'nut2',
        sortOrder: 2,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.get('[data-testid="pn-add"]').attributes('disabled')).toBeDefined()
  })

  it('renders the card header with the "PHASE-WIDE" tag value', async () => {
    const TagStub = defineComponent({
      name: 'TagStub',
      props: ['value'],
      setup(props) {
        return () => h('span', { 'data-testid': 'phase-tag' }, String(props.value ?? ''))
      },
    })
    const w = mount(PhaseNutrientList, {
      global: { stubs: { ...primeVueStubs, Tag: TagStub } },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.find('[data-testid="phase-tag"]').text()).toBe('PHASE-WIDE')
  })

  it('places a newly-added nutrient at the end of the existing sort order', async () => {
    phaseNutrients = [
      {
        createdAt: '2026-07-21T00:00:00.000Z',
        doseMlPerL: 1,
        growPhaseId: 'p1',
        id: 'pn1',
        nutrientId: 'nut1',
        sortOrder: 5,
        updatedAt: '2026-07-21T00:00:00.000Z',
      },
    ]
    const w = mount(PhaseNutrientList, {
      global: { stubs: { ...primeVueStubs, Select: SelectStub } },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="pn-add"]').trigger('click')
    await flush()

    setSelectValue(w, 'nut2')
    setDoseValue(w, '2.5')
    await flush()
    await w.get('[data-testid="pn-save"]').trigger('click')
    await flush()

    expect(recordedCreates.length).toBe(1)
    expect(recordedCreates[0]!.sortOrder).toBe(6)
  })
})
