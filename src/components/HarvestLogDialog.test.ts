import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const getMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('../stores/apiStore', () => ({
  useApiStore: () => ({
    harvestLogs: {
      get: getMock,
      upsert: upsertMock,
    },
  }),
}))

import HarvestLogDialog from './HarvestLogDialog.vue'
import { primeVueStubs } from '../utils/testStub'
import type { HarvestLog } from '../types/grow'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function setInputValue(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const el = wrapper.get(`[data-testid="${testid}"]`).element as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextarea(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const el = wrapper.get(`[data-testid="${testid}"]`).element as HTMLTextAreaElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function makeLog(over: Partial<HarvestLog> = {}): HarvestLog {
  return {
    completedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    growCycleId: 'c1',
    id: 'log1',
    pestOrDiseaseNotes: null,
    qualityRating: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    whatToImprove: null,
    whatWorked: null,
    yieldGrams: null,
    ...over,
  }
}

describe('HarvestLogDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getMock.mockReset()
    upsertMock.mockReset()
    upsertMock.mockImplementation(async (_id: string, payload: object) =>
      makeLog({
        pestOrDiseaseNotes: (payload as { pestOrDiseaseNotes: string | null }).pestOrDiseaseNotes,
        qualityRating: (payload as { qualityRating: number | null }).qualityRating,
        whatToImprove: (payload as { whatToImprove: string | null }).whatToImprove,
        whatWorked: (payload as { whatWorked: string | null }).whatWorked,
        yieldGrams: (payload as { yieldGrams: number | null }).yieldGrams,
      }),
    )
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('opens in create mode when get returns null and saves with trimmed values', async () => {
    getMock.mockResolvedValue(null)
    const w = mount(HarvestLogDialog, {
      global: { stubs: primeVueStubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    expect(getMock).toHaveBeenCalledWith('c1')
    expect(w.text()).toContain('Log harvest')

    setInputValue(w, 'hld-yield', '120')
    await w.get('[data-testid="rating-star-4"]').trigger('click')
    setTextarea(w, 'hld-pest', 'aphids')
    await flush()

    await w.get('[data-testid="hld-save"]').trigger('click')
    await flush()

    expect(upsertMock).toHaveBeenCalledWith('c1', {
      yieldGrams: 120,
      qualityRating: 4,
      pestOrDiseaseNotes: 'aphids',
      whatWorked: null,
      whatToImprove: null,
    })
    expect(w.emitted('saved')).toBeTruthy()
    expect(w.emitted('saved')!.length).toBe(1)
  })

  it('opens in edit mode with prefilled values and saves updated yield', async () => {
    getMock.mockResolvedValue(
      makeLog({
        pestOrDiseaseNotes: 'mites',
        qualityRating: 5,
        whatToImprove: 'lower humidity',
        whatWorked: 'good airflow',
        yieldGrams: 300,
      }),
    )
    const w = mount(HarvestLogDialog, {
      global: { stubs: primeVueStubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    expect(w.text()).toContain('Edit harvest log')
    expect((w.get('[data-testid="hld-yield"]').element as HTMLInputElement).value).toBe('300')

    setInputValue(w, 'hld-yield', '310')
    await flush()

    await w.get('[data-testid="hld-save"]').trigger('click')
    await flush()

    expect(upsertMock).toHaveBeenCalledWith('c1', {
      yieldGrams: 310,
      qualityRating: 5,
      pestOrDiseaseNotes: 'mites',
      whatWorked: 'good airflow',
      whatToImprove: 'lower humidity',
    })
  })

  it('maps empty textareas to null on save', async () => {
    getMock.mockResolvedValue(null)
    const w = mount(HarvestLogDialog, {
      global: { stubs: primeVueStubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    setInputValue(w, 'hld-yield', '50')
    await flush()

    await w.get('[data-testid="hld-save"]').trigger('click')
    await flush()

    expect(upsertMock).toHaveBeenCalledWith('c1', {
      yieldGrams: 50,
      qualityRating: null,
      pestOrDiseaseNotes: null,
      whatWorked: null,
      whatToImprove: null,
    })
  })

  it('disables save when all fields are empty', async () => {
    getMock.mockResolvedValue(null)
    const w = mount(HarvestLogDialog, {
      global: { stubs: primeVueStubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    const saveBtn = w.get('[data-testid="hld-save"]')
    await saveBtn.trigger('click')
    await flush()

    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('renders the yield input with min=0 and five rating stars', async () => {
    getMock.mockResolvedValue(null)
    const w = mount(HarvestLogDialog, {
      global: { stubs: primeVueStubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    const yieldInput = w.get('[data-testid="hld-yield"]').element as HTMLInputElement
    expect(yieldInput.getAttribute('min')).toBe('0')

    for (const n of [1, 2, 3, 4, 5]) {
      expect(w.find(`[data-testid="rating-star-${n}"]`).exists()).toBe(true)
    }
  })
})
