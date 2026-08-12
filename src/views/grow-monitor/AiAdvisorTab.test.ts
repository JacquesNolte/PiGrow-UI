import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { AxiosError } from 'axios'

const cycleIdRef = ref('c1')
vi.mock('./useGrowMonitorState', () => ({
  useProvidedGrowMonitorState: () => ({ cycleId: cycleIdRef }),
}))

const analyzeMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({ ai: { analyze: analyzeMock } }),
}))

import AiAdvisorTab from './AiAdvisorTab.vue'
import { primeVueStubs } from '../../utils/testStub'
import { defineComponent, h } from 'vue'

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

function makeAxiosError(status: number, message: string, data?: unknown): AxiosError {
  return new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: undefined as never,
    data: data ?? { error: message },
    headers: undefined as never,
    status,
    statusText: '',
  } as never)
}

describe('AiAdvisorTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    analyzeMock.mockReset()
    cycleIdRef.value = 'c1'
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('shows the empty state with an enabled Analyze button on mount', () => {
    const w = mount(AiAdvisorTab, {
      global: { stubs },
    })

    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(true)
    const btn = w.find('[data-testid="ai-analyze-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBe('false')
  })

  it('shows the loading state while the analyze call is in flight', async () => {
    analyzeMock.mockReturnValue(new Promise(() => {}))

    const w = mount(AiAdvisorTab, {
      global: { stubs },
    })

    await w.get('[data-testid="ai-analyze-btn"]').trigger('click')
    await flush()

    expect(w.find('[data-testid="ai-loading"]').exists()).toBe(true)
    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(false)
  })

  it('renders health summary, issues, environmental suggestions, and prioritized actions on success', async () => {
    analyzeMock.mockResolvedValue({
      healthSummary: 'Looking good',
      issues: [
        {
          category: 'environment',
          confidence: 'medium',
          description: 'Temp high',
          rationale: 'why',
          severity: 'warning',
          suggestedAdjustment: 'Lower temp',
        },
      ],
      environmentalSuggestions: [
        {
          currentValue: 28,
          phase: 'Vegetative',
          rationale: 'too hot',
          suggestedValue: 25,
          target: 'Temperature',
          unit: '°C',
        },
      ],
      feedingSuggestions: [],
      prioritizedActions: ['Check ventilation'],
    })

    const w = mount(AiAdvisorTab, {
      global: { stubs },
    })

    await w.get('[data-testid="ai-analyze-btn"]').trigger('click')
    await flush()

    expect(analyzeMock).toHaveBeenCalledWith('c1')

    const health = w.find('[data-testid="ai-health"]')
    expect(health.exists()).toBe(true)
    expect(health.text()).toContain('Looking good')

    const issue = w.find('[data-testid="ai-issue-0"]')
    expect(issue.exists()).toBe(true)
    expect(issue.text()).toContain('Temp high')
    expect(issue.text()).toContain('warning')

    expect(w.find('[data-testid="ai-env-suggestions"]').exists()).toBe(true)
    expect(w.find('[data-testid="ai-env-suggestions"]').text()).toContain('Temperature')

    expect(w.find('[data-testid="ai-actions"]').exists()).toBe(true)
    const action = w.find('[data-testid="ai-action-0"]')
    expect(action.exists()).toBe(true)
    expect(action.text()).toContain('Check ventilation')

    expect(w.find('[data-testid="ai-last-analyzed"]').exists()).toBe(true)
    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(false)
  })

  it('renders the not-configured state when the API returns 503', async () => {
    analyzeMock.mockRejectedValue(
      makeAxiosError(503, 'Request failed', { error: 'AI provider is not configured.' }),
    )

    const w = mount(AiAdvisorTab, {
      global: { stubs },
    })

    await w.get('[data-testid="ai-analyze-btn"]').trigger('click')
    await flush()

    const notConfigured = w.find('[data-testid="ai-not-configured"]')
    expect(notConfigured.exists()).toBe(true)
    expect(notConfigured.text()).toMatch(/not configured/i)
    expect(w.find('[data-testid="ai-health"]').exists()).toBe(false)
  })

  it('renders the error state with a retry button when the API returns a non-503 error', async () => {
    analyzeMock.mockRejectedValueOnce(makeAxiosError(502, 'Provider failed'))
    analyzeMock.mockResolvedValueOnce({
      healthSummary: 'Recovered',
      issues: [],
      environmentalSuggestions: [],
      feedingSuggestions: [],
      prioritizedActions: [],
    })

    const w = mount(AiAdvisorTab, {
      global: { stubs },
    })

    await w.get('[data-testid="ai-analyze-btn"]').trigger('click')
    await flush()

    const err = w.find('[data-testid="ai-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('Provider failed')

    const retry = w.find('[data-testid="ai-retry"]')
    expect(retry.exists()).toBe(true)

    await retry.trigger('click')
    await flush()

    expect(analyzeMock).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="ai-health"]').exists()).toBe(true)
  })
})
