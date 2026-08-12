import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'

const listMock = vi.fn()
const setResolvedMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    alerts: {
      list: listMock,
      setResolved: setResolvedMock,
    },
  }),
}))

import AlertsPanel from './AlertsPanel.vue'
import { primeVueStubs } from '../../utils/testStub'
import type { GrowAlert } from '../../types/grow'

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

const ButtonStub = defineComponent({
  name: 'ButtonStub',
  props: ['label', 'loading', 'disabled', 'severity', 'icon', 'size'],
  setup(props, { slots, attrs }) {
    return () =>
      h(
        'button',
        {
          'data-testid': (attrs as Record<string, unknown>)['data-testid'],
          disabled: props.disabled || props.loading,
          type: 'button',
        },
        slots.default?.() ?? [String(props.label ?? '')],
      )
  },
})

const stubs = { ...primeVueStubs, Button: ButtonStub, Tag: TagStub }

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function sampleAlert(over: Partial<GrowAlert> = {}): GrowAlert {
  return {
    id: 'a1',
    growCycleId: 'c1',
    severity: 'warning',
    category: 'env',
    sensorType: null,
    message: 'Temp high',
    detectedAt: '2026-08-01T00:00:00.000Z',
    resolvedAt: null,
    telemetrySnapshot: null,
    ...over,
  }
}

describe('AlertsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listMock.mockReset()
    setResolvedMock.mockReset()
    listMock.mockResolvedValue([])
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('renders the empty state when no alerts exist', async () => {
    const w = mount(AlertsPanel, {
      global: { stubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    expect(listMock).toHaveBeenCalledWith('c1', false)
    expect(listMock).toHaveBeenCalledWith('c1', true)
    expect(w.find('[data-testid="alerts-empty"]').exists()).toBe(true)
  })

  it('renders unresolved + resolved alerts sorted by detectedAt desc', async () => {
    listMock.mockImplementation(async (_cycleId: string, resolved?: boolean) => {
      if (resolved === false) {
        return [
          sampleAlert({ id: 'a1', message: 'Temp high', detectedAt: '2026-08-01T00:00:00.000Z' }),
        ]
      }
      if (resolved === true) {
        return [
          sampleAlert({
            id: 'a2',
            severity: 'critical',
            category: 'feeding',
            message: 'pH low',
            detectedAt: '2026-08-02T00:00:00.000Z',
            resolvedAt: '2026-08-02T05:00:00.000Z',
          }),
        ]
      }
      return []
    })

    const w = mount(AlertsPanel, {
      global: { stubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    expect(w.find('[data-testid="alert-row-a1"]').exists()).toBe(true)
    expect(w.find('[data-testid="alert-row-a2"]').exists()).toBe(true)
    expect(w.text()).toContain('Temp high')
    expect(w.text()).toContain('pH low')

    const rows = w.findAll('.alert-row')
    expect(rows[0]!.attributes('data-testid')).toBe('alert-row-a2')
    expect(rows[1]!.attributes('data-testid')).toBe('alert-row-a1')

    expect(w.get('[data-testid="alert-toggle-a1"]').text()).toContain('Resolve')
    expect(w.get('[data-testid="alert-toggle-a2"]').text()).toContain('Unresolve')
  })

  it('toggles resolve/unresolve and emits the changed event', async () => {
    listMock.mockImplementation(async (_cycleId: string, resolved?: boolean) => {
      if (resolved === false) {
        return [sampleAlert({ id: 'a1', resolvedAt: null })]
      }
      return []
    })
    setResolvedMock.mockResolvedValue(
      sampleAlert({ id: 'a1', resolvedAt: '2026-08-03T00:00:00.000Z' }),
    )

    const w = mount(AlertsPanel, {
      global: { stubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    await w.get('[data-testid="alert-toggle-a1"]').trigger('click')
    await flush()

    expect(setResolvedMock).toHaveBeenCalledWith('a1', true)
    expect(w.emitted('changed')).toBeTruthy()
    expect(w.get('[data-testid="alert-toggle-a1"]').text()).toContain('Unresolve')
  })

  it('maps unknown severities to a fallback Tag without crashing', async () => {
    listMock.mockImplementation(async (_cycleId: string, resolved?: boolean) => {
      if (resolved === false) {
        return [sampleAlert({ id: 'a1', severity: 'unknown', message: 'something novel' })]
      }
      return []
    })

    const w = mount(AlertsPanel, {
      global: { stubs },
      props: { visible: true, cycleId: 'c1' },
    })
    await flush()

    const row = w.find('[data-testid="alert-row-a1"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('unknown')
    const tag = row.find('[data-testid="tag"]')
    expect(tag.attributes('data-severity')).toBe('secondary')
  })
})
