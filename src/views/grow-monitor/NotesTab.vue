<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useApiStore } from '../../stores/apiStore'
import { extractApiError } from '../../utils/errors'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import GrowNoteDialog from './GrowNoteDialog.vue'
import { daysBetween } from '../../utils/growDates'
import DOMPurify from 'dompurify'
import type { GrowCycleNote, GrowPhase } from '../../types/grow'

const apiStore = useApiStore()
const state = useProvidedGrowMonitorState()
const confirm = useConfirm()
const toast = useToast()

const cycleId = computed(() => state.currentCycle.value?.id ?? null)
const notes = ref<GrowCycleNote[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const dialogOpen = ref(false)
const dialogRef = ref<InstanceType<typeof GrowNoteDialog> | null>(null)

const phaseById = computed(
  () =>
    new Map<string, GrowPhase>(
      state.sortedPhases.value
        .filter((p) => Boolean(p.id))
        .map((p) => [p.id as string, p as GrowPhase]),
    ),
)

function phaseLabelFor(note: GrowCycleNote): string {
  if (!note.activeGrowPhaseId) {
    return 'No active phase'
  }
  const phase = phaseById.value.get(note.activeGrowPhaseId)
  if (!phase) {
    return 'No active phase'
  }
  if (phase.startAt) {
    const day = daysBetween(phase.startAt, note.createdAt) + 1
    return `Day ${day} of ${phase.name}`
  }
  return phase.name
}

// Render-time sanitization is the XSS gate. TipTap emits clean HTML, but a
// note could be written via the API directly; never v-html raw stored content.
// A registered-once hook forces every link to open in a new tab with
// rel="noopener noreferrer" so a stored <a target="_blank"> can't be used for
// reverse tabnabbing (the opener window becomes unreachable from the new tab).
let linkHookRegistered = false
function ensureLinkHook() {
  if (linkHookRegistered) {
    return
  }
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  linkHookRegistered = true
}

function sanitizeNote(html: string): string {
  ensureLinkHook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'em',
      'u',
      's',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
    ],
    ALLOWED_ATTR: ['href', 'colspan', 'rowspan'],
  })
}

// Detect whether a stored note is rich HTML (from the editor) or legacy
// plain text (pre-rich-text notes). Plain text is rendered with pre-wrap so
// its original newlines survive without a data migration.
function isHtmlNote(note: string): boolean {
  return /<[a-z][\s\S]*>/i.test(note)
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString()
}

async function load() {
  if (!cycleId.value) {
    notes.value = []
    return
  }
  loading.value = true
  error.value = null
  try {
    notes.value = await apiStore.growCycleNotes.list(cycleId.value)
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to load notes')
    error.value = message
    notes.value = []
  } finally {
    loading.value = false
  }
}

function prepend(note: GrowCycleNote) {
  if (notes.value.some((entry) => entry.id === note.id)) {
    return
  }
  notes.value = [note, ...notes.value]
}

function replaceInPlace(note: GrowCycleNote) {
  notes.value = notes.value.map((entry) => (entry.id === note.id ? note : entry))
}

function openCreate() {
  dialogRef.value?.openCreate()
}

function openEdit(note: GrowCycleNote) {
  dialogRef.value?.openEdit(note)
}

function onCreated(note: GrowCycleNote) {
  prepend(note)
}

function onUpdated(note: GrowCycleNote) {
  replaceInPlace(note)
}

function onDelete(note: GrowCycleNote) {
  confirm.require({
    accept: () => void doDelete(note.id),
    acceptLabel: 'Delete',
    acceptProps: { severity: 'danger' },
    header: 'Delete note',
    icon: 'pi pi-exclamation-triangle',
    message: note.title ? `Delete "${note.title}"?` : 'Delete this note?',
    rejectLabel: 'Cancel',
  })
}

async function doDelete(id: string) {
  if (!cycleId.value) {
    return
  }
  deletingId.value = id
  try {
    await apiStore.growCycleNotes.remove(cycleId.value, id)
    notes.value = notes.value.filter((entry) => entry.id !== id)
    toast.add({ detail: 'Note deleted', life: 4000, severity: 'info', summary: 'Deleted' })
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to delete note')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  } finally {
    deletingId.value = null
  }
}

// No Socket.IO wiring — the notes backend is API-only (no realtime events).

watch(cycleId, () => void load(), { immediate: true })
</script>

<template>
  <ConfirmDialog />
  <GrowNoteDialog
    ref="dialogRef"
    v-model:visible="dialogOpen"
    :cycle-id="cycleId ?? ''"
    @created="onCreated"
    @updated="onUpdated"
  />
  <Card class="notes-tab">
    <template #title>
      <div class="notes-header">
        <span>Notes</span>
        <Button
          label="Add note"
          icon="pi pi-plus"
          size="small"
          severity="success"
          data-testid="gn-add"
          :disabled="!cycleId"
          @click="openCreate"
        />
      </div>
    </template>
    <template #content>
      <div v-if="loading && !notes.length" class="state-msg">
        <i class="pi pi-spin pi-spinner" /> Loading notes…
      </div>
      <div v-else-if="error" class="state-msg error">
        <i class="pi pi-exclamation-triangle" /> {{ error }}
        <Button label="Retry" severity="secondary" size="small" text @click="load" />
      </div>
      <div v-else-if="!notes.length" class="empty-state">
        <span class="pi pi-bookmark empty-icon" />
        <p>No notes for this grow cycle yet. Click <strong>Add note</strong> to record one.</p>
      </div>
      <div v-else class="note-list">
        <div
          v-for="note in notes"
          :key="note.id"
          class="note-item"
          :data-testid="`grow-note-${note.id}`"
        >
          <div class="note-head">
            <span v-if="note.title" class="note-title">{{ note.title }}</span>
            <Tag
              :value="phaseLabelFor(note)"
              severity="secondary"
              rounded
              :data-testid="`grow-note-phase-${note.id}`"
            />
            <span class="note-time" :title="note.createdAt">{{
              fmtTimestamp(note.createdAt)
            }}</span>
            <div class="note-actions">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                size="small"
                :data-testid="`grow-note-edit-${note.id}`"
                aria-label="Edit note"
                :disabled="deletingId === note.id"
                @click="openEdit(note)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :data-testid="`grow-note-delete-${note.id}`"
                aria-label="Delete note"
                :loading="deletingId === note.id"
                @click="onDelete(note)"
              />
            </div>
          </div>
          <p
            v-if="isHtmlNote(note.note)"
            class="note-body note-body--html"
            :data-testid="`grow-note-text-${note.id}`"
            v-html="sanitizeNote(note.note)"
          ></p>
          <p v-else class="note-body note-body--text" :data-testid="`grow-note-text-${note.id}`">
            {{ note.note }}
          </p>
        </div>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.notes-tab {
  width: 100%;
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.state-msg {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  padding: var(--space-3);
}

.state-msg.error {
  color: var(--color-danger);
}

.empty-state {
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

.empty-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.note-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.note-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
}

.note-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.note-title {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-right: auto;
}

.note-time {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.note-actions {
  display: inline-flex;
  gap: var(--space-1);
}

.note-body {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  word-break: break-word;
}

.note-body--text {
  white-space: pre-wrap;
}

.note-body--html :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: var(--space-2) 0;
}

.note-body--html :deep(th),
.note-body--html :deep(td) {
  border: 1px solid var(--color-border);
  padding: var(--space-1) var(--space-2);
  text-align: left;
}

.note-body--html :deep(th) {
  background: var(--color-bg-surface);
  font-weight: 600;
}

.note-body--html :deep(code) {
  background: var(--color-code-bg);
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.note-body--html :deep(pre) {
  background: var(--color-code-bg);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  overflow-x: auto;
}

.note-body--html :deep(blockquote) {
  margin: var(--space-2) 0;
  padding-left: var(--space-3);
  border-left: 2px solid var(--color-border-active);
  color: var(--color-text-muted);
}

.note-body--html :deep(ul),
.note-body--html :deep(ol) {
  margin: var(--space-2) 0;
  padding-left: var(--space-5);
}

.note-body--html :deep(li) {
  margin: var(--space-1) 0;
}

.note-body--html :deep(li > p) {
  margin: 0;
}

.note-body--html :deep(a) {
  color: var(--color-accent);
  text-decoration: underline;
}
</style>
