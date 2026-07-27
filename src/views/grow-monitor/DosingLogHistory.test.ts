import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const useConfirmMock = { require: vi.fn() }
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => useConfirmMock,
}))

const socketRef = ref<unknown>(null)
vi.mock('./useGrowMonitorState', () => ({
  useProvidedGrowMonitorState: () => ({ liveTelemetry: { socket: socketRef } }),
}))

const listMock = vi.fn()
const removeMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    dosingLogs: { list: listMock, remove: removeMock },
  }),
}))

vi.mock('../../stores/nutrientStore', () => ({
  useNutrientStore: () => ({
    nutrients: [
      { brand: null, createdAt: '', id: 'nut1', name: 'FloraGro', notes: null, updatedAt: '' },
    ],
  }),
}))

import DosingLogHistory from './DosingLogHistory.vue'
import { primeVueStubs } from '../../utils/testStub'

const TagStub = defineComponent({
  name: 'TagStub',
  props: ['value', 'severity'],
  setup(props) {
    return () =>
      h(
        'span',
        { 'data-testid': 'tag', 'data-severity': String(props.severity ?? '') },
        String(props.value ?? ''),
      )
  },
})

const stubs = { ...primeVueStubs, Tag: TagStub }

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const sampleLog = {
  createdAt: '2026-07-27T11:50:45.472Z',
  growPhaseId: 'p1',
  id: 'log1',
  lines: [{ computedMl: 25, dosingLogId: 'log1', doseMlPerL: 2, id: 'l1', nutrientId: 'nut1' }],
  measuredEc: 1.4,
  measuredPh: 6.2,
  notes: 'run 3',
  totalMl: 37.5,
  warnings: ['NO_PH_BANDS'],
  waterVolumeLiters: 12.5,
}

describe('DosingLogHistory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listMock.mockReset()
    removeMock.mockReset()
    listMock.mockResolvedValue([])
    useConfirmMock.require.mockReset()
    socketRef.value = null
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('renders the empty state when no logs exist for the phase', async () => {
    const w = mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(listMock).toHaveBeenCalledWith('p1')
    expect(w.text()).toMatch(/no batches logged/i)
  })

  it('renders logs with nutrient name, dose, computed ml, total, warnings, and notes', async () => {
    listMock.mockResolvedValue([sampleLog])
    const w = mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    expect(w.text()).toContain('FloraGro')
    expect(w.text()).toContain('2 ml/L')
    expect(w.text()).toContain('25.00 ml')
    expect(w.text()).toContain('37.50 ml total')
    expect(w.text()).toContain('12.5 L')
    expect(w.text()).toContain('No pH bands configured')
    expect(w.text()).toContain('run 3')
    expect(w.find('[data-testid="dosing-log-delete-log1"]').exists()).toBe(true)
  })

  it('refetches the list when growPhaseId changes', async () => {
    const w = mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()
    expect(listMock).toHaveBeenCalledWith('p1')

    await w.setProps({ growPhaseId: 'p2' })
    await flush()
    expect(listMock).toHaveBeenCalledWith('p2')
  })

  it('deletes a log after the confirm dialog is accepted', async () => {
    listMock.mockResolvedValue([sampleLog])
    removeMock.mockResolvedValue(undefined)
    const w = mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()

    await w.get('[data-testid="dosing-log-delete-log1"]').trigger('click')
    await flush()

    expect(useConfirmMock.require).toHaveBeenCalled()
    const options = useConfirmMock.require.mock.calls[0]![0] as { accept: () => void }
    options.accept()
    await flush()

    expect(removeMock).toHaveBeenCalledWith('p1', 'log1')
    expect(w.find('[data-testid="dosing-log-log1"]').exists()).toBe(false)
  })

  it('refetches when a dosing_log_created socket event lands for this phase', async () => {
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }
    const w = mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()
    listMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['dosing_log_created']!({ id: 'log2', growPhaseId: 'p1', createdAt: '' })
    await flush()

    expect(listMock).toHaveBeenCalledWith('p1')
    w.unmount()
  })

  it('ignores dosing_log_created events for other phases', async () => {
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }
    mount(DosingLogHistory, {
      global: { stubs },
      props: { growPhaseId: 'p1' },
    })
    await flush()
    listMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['dosing_log_created']!({ id: 'log3', growPhaseId: 'other', createdAt: '' })
    await flush()

    expect(listMock).not.toHaveBeenCalled()
  })
})
