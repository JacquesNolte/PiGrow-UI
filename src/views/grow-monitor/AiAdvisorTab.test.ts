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
const getAnalysisMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({ ai: { analyze: analyzeMock, getAnalysis: getAnalysisMock } }),
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
    getAnalysisMock.mockReset()
    getAnalysisMock.mockResolvedValue({ analysis: null, analysisAt: null, analysisSummary: null })
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

  it('renders the cached analysis on mount without clicking "Analyze now"', async () => {
    getAnalysisMock.mockResolvedValueOnce({
      analysis: {
        environmentalSuggestions: [],
        feedingSuggestions: [],
        healthSummary: 'Cached insight',
        issues: [
          {
            category: 'environment',
            confidence: 'high',
            description: 'Humidity off',
            rationale: 'trend',
            severity: 'warning',
            suggestedAdjustment: 'Open vents',
          },
        ],
        prioritizedActions: ['Open vents'],
      },
      analysisAt: '2026-08-14T12:34:56.000Z',
      analysisSummary: 'Cached insight',
    })

    const w = mount(AiAdvisorTab, { global: { stubs } })

    await flush()

    expect(getAnalysisMock).toHaveBeenCalledWith('c1')

    const health = w.find('[data-testid="ai-health"]')
    expect(health.exists()).toBe(true)
    expect(health.text()).toContain('Cached insight')

    const lastAnalyzed = w.find('[data-testid="ai-last-analyzed"]')
    expect(lastAnalyzed.exists()).toBe(true)
    expect(lastAnalyzed.text()).toMatch(/2026/)
    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(false)
  })

  it('shows the empty state when no cached analysis exists', async () => {
    const w = mount(AiAdvisorTab, { global: { stubs } })

    await flush()

    expect(getAnalysisMock).toHaveBeenCalledWith('c1')
    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(true)
    expect(w.find('[data-testid="ai-health"]').exists()).toBe(false)
    expect(w.find('[data-testid="ai-last-analyzed"]').exists()).toBe(false)
  })

  it('"Analyze now" still POSTs and replaces the cached result', async () => {
    getAnalysisMock.mockResolvedValueOnce({
      analysis: {
        environmentalSuggestions: [],
        feedingSuggestions: [],
        healthSummary: 'Stale cached insight',
        issues: [],
        prioritizedActions: [],
      },
      analysisAt: '2026-08-14T10:00:00.000Z',
      analysisSummary: 'Stale cached insight',
    })
    analyzeMock.mockResolvedValue({
      environmentalSuggestions: [],
      feedingSuggestions: [],
      healthSummary: 'Fresh insight',
      issues: [],
      prioritizedActions: [],
    })

    const w = mount(AiAdvisorTab, { global: { stubs } })

    await flush()

    expect(w.find('[data-testid="ai-health"]').text()).toContain('Stale cached insight')

    await w.get('[data-testid="ai-analyze-btn"]').trigger('click')
    await flush()

    expect(analyzeMock).toHaveBeenCalledWith('c1')
    const health = w.find('[data-testid="ai-health"]')
    expect(health.exists()).toBe(true)
    expect(health.text()).toContain('Fresh insight')
    expect(health.text()).not.toContain('Stale cached insight')
  })

  it('falls back to empty state if the cached read errors', async () => {
    getAnalysisMock.mockRejectedValueOnce(new Error('boom'))

    const w = mount(AiAdvisorTab, { global: { stubs } })

    await flush()

    expect(getAnalysisMock).toHaveBeenCalledWith('c1')
    expect(w.find('[data-testid="ai-empty"]').exists()).toBe(true)

    const btn = w.find('[data-testid="ai-analyze-btn"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBe('false')
  })
})
