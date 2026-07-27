import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const previewMock = vi.fn()
const createMock = vi.fn()

vi.mock('../stores/apiStore', () => ({
  useApiStore: () => ({
    dosing: { preview: previewMock },
    dosingLogs: { create: createMock },
  }),
}))

vi.mock('../stores/nutrientStore', () => ({
  useNutrientStore: () => ({
    nutrients: [
      {
        brand: null,
        createdAt: '',
        id: 'nut1',
        name: 'FloraGro',
        notes: null,
        updatedAt: '',
      },
    ],
  }),
}))

import DosingLogForm from './DosingLogForm.vue'
import { primeVueStubs } from '../utils/testStub'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setInputValue(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const input = wrapper.get(`[data-testid="${testid}"]`)
  const el = input.element as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextarea(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const el = wrapper.get(`[data-testid="${testid}"]`).element as HTMLTextAreaElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('DosingLogForm', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    previewMock.mockReset()
    createMock.mockReset()
    previewMock.mockResolvedValue({ mlByNutrientId: { nut1: 2.5 }, totalMl: 2.5, warnings: [] })
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('renders the locked-hint when no growPhaseId is provided', () => {
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: '' },
    })
    expect(w.text()).toMatch(/no active phase/i)
  })

  it('fetches a preview on mount using the default volume', async () => {
    mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(previewMock).toHaveBeenCalledWith('p1', { reservoirLiters: 1 })
  })

  it('renders the preview rows and total', async () => {
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.text()).toContain('FloraGro')
    expect(w.text()).toContain('2.50 ml')
    expect(w.text()).toContain('Total: 2.50 ml')
  })

  it('renders preview warnings via the shared warning labels', async () => {
    previewMock.mockResolvedValue({
      mlByNutrientId: {},
      totalMl: 0,
      warnings: ['NO_NUTRIENTS_CONFIGURED'],
    })
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.text()).toContain('No nutrients configured for this phase.')
  })

  it('submits a dosing log and emits created with the returned log', async () => {
    const created = {
      createdAt: '2026-07-27T00:00:00.000Z',
      growPhaseId: 'p1',
      id: 'log1',
      lines: [],
      measuredEc: null,
      measuredPh: null,
      notes: null,
      totalMl: 2.5,
      warnings: [],
      waterVolumeLiters: 1,
    }
    createMock.mockResolvedValue(created)
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="dlf-submit"]').trigger('click')
    await flush()

    expect(createMock).toHaveBeenCalledWith('p1', {
      waterVolumeLiters: 1,
      measuredEc: null,
      measuredPh: null,
      notes: null,
    })
    expect(w.emitted('created')).toBeTruthy()
    expect(w.emitted('created')![0]).toEqual([created])
  })

  it('blocks submit when the water volume is missing', async () => {
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    setInputValue(w, 'dlf-volume', '')
    await flush()

    await w.get('[data-testid="dlf-submit"]').trigger('click')
    await flush()

    expect(createMock).not.toHaveBeenCalled()
    expect(w.text()).toMatch(/water volume is required/i)
  })

  it('blocks submit when notes exceed 500 characters', async () => {
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    setTextarea(w, 'dlf-notes', 'x'.repeat(501))
    await flush()

    await w.get('[data-testid="dlf-submit"]').trigger('click')
    await flush()

    expect(createMock).not.toHaveBeenCalled()
    expect(w.text()).toMatch(/500 characters or fewer/i)
  })

  it('sends optional measured ph/ec and trimmed notes on submit', async () => {
    createMock.mockResolvedValue({
      createdAt: '',
      growPhaseId: 'p1',
      id: 'log2',
      lines: [],
      measuredEc: 1.4,
      measuredPh: 6.2,
      notes: 'run 3',
      totalMl: 5,
      warnings: [],
      waterVolumeLiters: 2,
    })
    const w = mount(DosingLogForm, {
      global: { stubs: primeVueStubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    setInputValue(w, 'dlf-volume', '2')
    setInputValue(w, 'dlf-ph', '6.2')
    setInputValue(w, 'dlf-ec', '1.4')
    setTextarea(w, 'dlf-notes', '  run 3  ')
    await flush()

    await w.get('[data-testid="dlf-submit"]').trigger('click')
    await flush()

    expect(createMock).toHaveBeenCalledWith('p1', {
      waterVolumeLiters: 2,
      measuredEc: 1.4,
      measuredPh: 6.2,
      notes: 'run 3',
    })
  })
})
