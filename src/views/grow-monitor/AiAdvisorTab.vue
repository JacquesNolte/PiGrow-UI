<script setup lang="ts">
import { ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import { useApiStore } from '../../stores/apiStore'
import { extractApiError } from '../../utils/errors'
import type { AdvisorIssue, AdvisorResponse } from '../../types/grow'

const state = useProvidedGrowMonitorState()
const store = useApiStore()

const result = ref<AdvisorResponse | null>(null)
const error = ref<string | null>(null)
const notConfigured = ref(false)
const analyzing = ref(false)
const lastAnalyzedAt = ref<string | null>(null)

async function analyzeNow() {
  analyzing.value = true
  error.value = null
  notConfigured.value = false
  try {
    const res = await store.ai.analyze(state.cycleId.value)
    result.value = res
    lastAnalyzedAt.value = new Date().toLocaleString()
  } catch (err) {
    const { status, message } = extractApiError(err, 'Analysis failed')
    if (status === 503) {
      notConfigured.value = true
      result.value = null
    } else {
      error.value = message
      result.value = null
    }
  } finally {
    analyzing.value = false
  }
}

function issueSeverityTag(sev: AdvisorIssue['severity']): 'danger' | 'warn' | 'info' {
  if (sev === 'critical') return 'danger'
  if (sev === 'warning') return 'warn'
  return 'info'
}
</script>

<template>
  <div class="ai-advisor-tab">
    <div class="ai-header">
      <Button
        label="Analyze now"
        icon="pi pi-sparkles"
        :loading="analyzing"
        :disabled="analyzing"
        data-testid="ai-analyze-btn"
        @click="analyzeNow"
      />
      <span v-if="lastAnalyzedAt" class="ai-last-analyzed" data-testid="ai-last-analyzed">
        Last analyzed {{ lastAnalyzedAt }}
      </span>
    </div>

    <div v-if="analyzing" class="ai-loading" data-testid="ai-loading">
      <ProgressSpinner />
      <p>Analyzing grow data…</p>
    </div>

    <Message
      v-else-if="notConfigured"
      severity="info"
      :closable="false"
      data-testid="ai-not-configured"
    >
      AI provider not configured — set AI_PROVIDER and AI_API_KEY on the server.
    </Message>

    <div v-else-if="error" class="ai-error" data-testid="ai-error">
      <Message severity="error" :closable="false">{{ error }}</Message>
      <Button
        label="Retry"
        icon="pi pi-refresh"
        severity="secondary"
        size="small"
        data-testid="ai-retry"
        @click="analyzeNow"
      />
    </div>

    <div v-else-if="!result" class="ai-empty" data-testid="ai-empty">
      <i class="pi pi-sparkles" />
      <p>No analysis yet. Click <strong>Analyze now</strong> for an AI assessment of this grow.</p>
    </div>

    <template v-else>
      <Card data-testid="ai-health">
        <template #title>Health summary</template>
        <template #content>
          <p class="ai-health-summary">{{ result.healthSummary }}</p>
        </template>
      </Card>

      <Card v-if="result.issues.length" data-testid="ai-issues">
        <template #title>Issues ({{ result.issues.length }})</template>
        <template #content>
          <div class="ai-issue-list">
            <div
              v-for="(issue, i) in result.issues"
              :key="i"
              class="ai-issue"
              :data-testid="`ai-issue-${i}`"
            >
              <div class="ai-issue-tags">
                <Tag :value="issue.severity" :severity="issueSeverityTag(issue.severity)" />
                <Tag :value="issue.confidence" severity="secondary" />
                <Tag :value="issue.category" severity="contrast" />
              </div>
              <p class="ai-issue-desc">{{ issue.description }}</p>
              <p class="ai-issue-suggestion">{{ issue.suggestedAdjustment }}</p>
              <p class="ai-issue-rationale">{{ issue.rationale }}</p>
            </div>
          </div>
        </template>
      </Card>

      <Card v-if="result.environmentalSuggestions.length" data-testid="ai-env-suggestions">
        <template #title>Environmental suggestions</template>
        <template #content>
          <div class="ai-suggestion-list">
            <div v-for="(s, i) in result.environmentalSuggestions" :key="i" class="ai-suggestion">
              <span class="ai-suggestion-target">{{ s.target }}</span>
              <span class="ai-suggestion-values">
                {{ s.currentValue != null ? s.currentValue : '—' }} → {{ s.suggestedValue }}
                {{ s.unit }}
              </span>
              <span v-if="s.phase" class="ai-suggestion-phase">{{ s.phase }}</span>
              <p class="ai-suggestion-rationale">{{ s.rationale }}</p>
            </div>
          </div>
        </template>
      </Card>

      <Card v-if="result.feedingSuggestions.length" data-testid="ai-feeding-suggestions">
        <template #title>Feeding suggestions</template>
        <template #content>
          <div class="ai-suggestion-list">
            <div v-for="(s, i) in result.feedingSuggestions" :key="i" class="ai-suggestion">
              <span class="ai-suggestion-target">{{ s.target }}</span>
              <span class="ai-suggestion-values">
                {{ s.currentValue != null ? s.currentValue : '—' }} → {{ s.suggestedValue }}
                {{ s.unit }}
              </span>
              <p class="ai-suggestion-rationale">{{ s.rationale }}</p>
            </div>
          </div>
        </template>
      </Card>

      <Card v-if="result.prioritizedActions.length" data-testid="ai-actions">
        <template #title>Prioritized actions</template>
        <template #content>
          <ol class="ai-actions-list">
            <li
              v-for="(action, i) in result.prioritizedActions"
              :key="i"
              :data-testid="`ai-action-${i}`"
            >
              {{ action }}
            </li>
          </ol>
        </template>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.ai-advisor-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ai-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.ai-last-analyzed {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.ai-loading {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  color: var(--color-text-secondary);
}

.ai-loading p {
  margin: 0;
  font-size: var(--text-md);
}

.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-4);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
  background: var(--color-bg-elevated);
  gap: var(--space-2);
}

.ai-empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.ai-empty p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.ai-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  background: var(--color-danger-bg);
}

.ai-health-summary {
  margin: 0;
  font-size: var(--text-md);
  color: var(--color-text-primary);
  line-height: var(--leading-relaxed);
}

.ai-issue-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai-issue {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.ai-issue-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.ai-issue-desc {
  margin: 0;
  font-size: var(--text-md);
  color: var(--color-text-primary);
  font-weight: 500;
}

.ai-issue-suggestion {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-surface);
  border-radius: var(--radius-sm);
}

.ai-issue-rationale {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-normal);
}

.ai-suggestion-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ai-suggestion {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.ai-suggestion-target {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}

.ai-suggestion-values {
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--color-code-text);
}

.ai-suggestion-phase {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.ai-suggestion-rationale {
  flex-basis: 100%;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--leading-normal);
}

.ai-actions-list {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ai-actions-list li {
  font-size: var(--text-md);
  color: var(--color-text-primary);
  line-height: var(--leading-normal);
}
</style>
