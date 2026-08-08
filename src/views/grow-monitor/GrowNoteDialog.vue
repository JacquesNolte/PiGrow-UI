<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { useApiStore } from '../../stores/apiStore'
import { extractApiError } from '../../utils/errors'
import type { GrowCycleNote } from '../../types/grow'

const props = defineProps<{ cycleId: string }>()
const emit = defineEmits<{
  (e: 'created', note: GrowCycleNote): void
  (e: 'updated', note: GrowCycleNote): void
}>()

const apiStore = useApiStore()
const toast = useToast()

const visible = defineModel<boolean>('visible', { default: false })
const saving = ref(false)
const editingId = ref<string | null>(null)
const draftTitle = ref('')

const TITLE_MAX = 100

const editor = useEditor({
  content: '',
  extensions: [StarterKit, Table.configure({ resizable: true }), TableRow, TableCell, TableHeader],
  editorProps: {
    attributes: {
      'data-testid': 'gn-editor',
      class: 'gn-editor-prose',
    },
  },
})

const isEdit = computed(() => editingId.value !== null)

const noteEmpty = computed(() => editor.value?.isEmpty ?? true)

const titleError = computed(() =>
  draftTitle.value.length > TITLE_MAX ? `Title must be ${TITLE_MAX} characters or fewer.` : '',
)

const canSave = computed(
  () => !noteEmpty.value && draftTitle.value.length <= TITLE_MAX && !saving.value,
)

function resetDialog() {
  visible.value = false
  editingId.value = null
  draftTitle.value = ''
  editor.value?.commands.clearContent()
}

function openCreate() {
  resetDialog()
  visible.value = true
}

function openEdit(note: GrowCycleNote) {
  resetDialog()
  editingId.value = note.id
  draftTitle.value = note.title ?? ''
  editor.value?.commands.setContent(note.note)
  visible.value = true
}

// Clear the editor when the dialog closes via mask/escape (not via Save, which
// calls resetDialog itself). watch `visible` so the editor resets even if the
// parent toggles it directly.
watch(visible, (open) => {
  if (!open) {
    editingId.value = null
    draftTitle.value = ''
    editor.value?.commands.clearContent()
  }
})

async function save() {
  if (!canSave.value) {
    return
  }
  const html = editor.value?.getHTML() ?? ''
  saving.value = true
  try {
    if (editingId.value) {
      const updated = await apiStore.growCycleNotes.update(props.cycleId, editingId.value, {
        note: html,
        title: draftTitle.value.trim() || null,
      })
      emit('updated', updated)
      toast.add({ detail: 'Note updated.', life: 3000, severity: 'success', summary: 'Saved' })
    } else {
      const created = await apiStore.growCycleNotes.create(props.cycleId, {
        note: html,
        title: draftTitle.value.trim() || undefined,
      })
      emit('created', created)
      toast.add({ detail: 'Note added.', life: 3000, severity: 'success', summary: 'Created' })
    }
    resetDialog()
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to save note')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
  } finally {
    saving.value = false
  }
}

function toolbar(cmd: string) {
  const ch = editor.value?.chain().focus()
  if (!ch) {
    return
  }
  switch (cmd) {
    case 'bold':
      ch.toggleBold().run()
      break
    case 'italic':
      ch.toggleItalic().run()
      break
    case 'underline':
      ch.toggleUnderline().run()
      break
    case 'h2':
      ch.toggleHeading({ level: 2 }).run()
      break
    case 'h3':
      ch.toggleHeading({ level: 3 }).run()
      break
    case 'bullet':
      ch.toggleBulletList().run()
      break
    case 'ordered':
      ch.toggleOrderedList().run()
      break
    case 'quote':
      ch.toggleBlockquote().run()
      break
    case 'code':
      ch.toggleCode().run()
      break
    case 'link': {
      const url = window.prompt('Link URL')
      if (url) {
        ch.setLink({ href: url }).run()
      } else {
        ch.unsetLink().run()
      }
      break
    }
    case 'table':
      ch.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'rowBefore':
      ch.addRowBefore().run()
      break
    case 'rowAfter':
      ch.addRowAfter().run()
      break
    case 'colBefore':
      ch.addColumnBefore().run()
      break
    case 'colAfter':
      ch.addColumnAfter().run()
      break
    case 'delRow':
      ch.deleteRow().run()
      break
    case 'delCol':
      ch.deleteColumn().run()
      break
    case 'delTable':
      ch.deleteTable().run()
      break
  }
}

function isActive(cmd: string): boolean {
  const ed = editor.value
  if (!ed) {
    return false
  }
  switch (cmd) {
    case 'bold':
      return ed.isActive('bold')
    case 'italic':
      return ed.isActive('italic')
    case 'underline':
      return ed.isActive('underline')
    case 'h2':
      return ed.isActive('heading', { level: 2 })
    case 'h3':
      return ed.isActive('heading', { level: 3 })
    case 'bullet':
      return ed.isActive('bulletList')
    case 'ordered':
      return ed.isActive('orderedList')
    case 'quote':
      return ed.isActive('blockquote')
    case 'code':
      return ed.isActive('code')
    default:
      return false
  }
}

defineExpose({ openCreate, openEdit })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="isEdit ? 'Edit note' : 'Add note'"
    :style="{ width: '90vw', maxWidth: '680px' }"
    modal
    dismissable-mask
    class="grow-note-dialog"
  >
    <div class="form-stack">
      <div class="field">
        <label for="gn-title" class="field-label">Title</label>
        <InputText
          id="gn-title"
          v-model="draftTitle"
          :maxlength="TITLE_MAX"
          placeholder="Optional title"
          class="full-width"
          data-testid="gn-title"
        />
        <span v-if="titleError" class="field-error" data-testid="gn-title-error">{{
          titleError
        }}</span>
      </div>
      <div class="field">
        <label class="field-label">Note</label>
        <div class="gn-toolbar" data-testid="gn-toolbar">
          <button
            type="button"
            class="gn-btn gn-btn-text"
            :class="{ active: isActive('bold') }"
            :disabled="!editor"
            title="Bold"
            data-testid="gn-bold"
            @click="toolbar('bold')"
          >
            B
          </button>
          <button
            type="button"
            class="gn-btn gn-btn-text gn-btn-italic"
            :class="{ active: isActive('italic') }"
            :disabled="!editor"
            title="Italic"
            data-testid="gn-italic"
            @click="toolbar('italic')"
          >
            I
          </button>
          <button
            type="button"
            class="gn-btn gn-btn-text gn-btn-underline"
            :class="{ active: isActive('underline') }"
            :disabled="!editor"
            title="Underline"
            data-testid="gn-underline"
            @click="toolbar('underline')"
          >
            U
          </button>
          <span class="gn-sep" />
          <button
            type="button"
            class="gn-btn"
            :class="{ active: isActive('h2') }"
            :disabled="!editor"
            title="Heading 2"
            @click="toolbar('h2')"
          >
            H2
          </button>
          <button
            type="button"
            class="gn-btn"
            :class="{ active: isActive('h3') }"
            :disabled="!editor"
            title="Heading 3"
            @click="toolbar('h3')"
          >
            H3
          </button>
          <span class="gn-sep" />
          <button
            type="button"
            class="gn-btn"
            :class="{ active: isActive('bullet') }"
            :disabled="!editor"
            title="Bullet list"
            @click="toolbar('bullet')"
          >
            <i class="pi pi-list" />
          </button>
          <button
            type="button"
            class="gn-btn gn-btn-text"
            :class="{ active: isActive('ordered') }"
            :disabled="!editor"
            title="Ordered list"
            data-testid="gn-ordered"
            @click="toolbar('ordered')"
          >
            1.
          </button>
          <button
            type="button"
            class="gn-btn gn-btn-text gn-btn-quote"
            :class="{ active: isActive('quote') }"
            :disabled="!editor"
            title="Blockquote"
            data-testid="gn-quote"
            @click="toolbar('quote')"
          >
            ❝
          </button>
          <button
            type="button"
            class="gn-btn"
            :class="{ active: isActive('code') }"
            :disabled="!editor"
            title="Inline code"
            @click="toolbar('code')"
          >
            <i class="pi pi-code" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Add link"
            @click="toolbar('link')"
          >
            <i class="pi pi-link" />
          </button>
          <span class="gn-sep" />
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Insert table"
            data-testid="gn-insert-table"
            @click="toolbar('table')"
          >
            <i class="pi pi-table" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Add row before"
            @click="toolbar('rowBefore')"
          >
            <i class="pi pi-angle-up" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Add row after"
            @click="toolbar('rowAfter')"
          >
            <i class="pi pi-angle-down" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Add column before"
            @click="toolbar('colBefore')"
          >
            <i class="pi pi-angle-left" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Add column after"
            @click="toolbar('colAfter')"
          >
            <i class="pi pi-angle-right" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Delete row"
            @click="toolbar('delRow')"
          >
            <i class="pi pi-minus" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Delete column"
            @click="toolbar('delCol')"
          >
            <i class="pi pi-minus-circle" />
          </button>
          <button
            type="button"
            class="gn-btn"
            :disabled="!editor"
            title="Delete table"
            @click="toolbar('delTable')"
          >
            <i class="pi pi-trash" />
          </button>
        </div>
        <div class="gn-editor-wrap" :class="{ 'is-empty': noteEmpty }">
          <EditorContent :editor="editor" />
        </div>
        <span v-if="noteEmpty" class="field-error" data-testid="gn-note-error"
          >Note is required.</span
        >
      </div>
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text :disabled="saving" @click="resetDialog" />
      <Button
        :label="isEdit ? 'Save changes' : 'Add note'"
        :loading="saving"
        :disabled="!canSave"
        data-testid="gn-save"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.field-label {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.full-width {
  width: 100%;
}

.field-error {
  font-size: var(--text-sm);
  color: var(--color-danger);
}

.gn-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: var(--space-1);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  border-bottom: none;
}

.gn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 var(--space-1);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
  transition:
    background var(--duration-fast) var(--ease-default),
    color var(--duration-fast) var(--ease-default),
    border-color var(--duration-fast) var(--ease-default);
}

.gn-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.gn-btn.active {
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-color: var(--color-accent-border);
}

.gn-btn-italic {
  font-style: italic;
}

.gn-btn-underline {
  text-decoration: underline;
}

.gn-btn-quote {
  font-size: var(--text-base);
  line-height: 1;
}

.gn-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.gn-sep {
  width: 1px;
  background: var(--color-border);
  margin: 2px var(--space-1);
}

.gn-editor-wrap {
  border: 1px solid var(--color-border);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: var(--color-bg-elevated);
  min-height: 160px;
}

.gn-editor-wrap.is-empty :deep(.gn-editor-prose) {
  color: var(--color-text-muted);
}

/* TipTap is headless — it ships no CSS. Style the ProseMirror contenteditable
   surface (`.gn-editor-prose`, applied via editorProps.attributes.class) so
   tables, lists, headings, blockquotes, and code render correctly while
   editing. Single :deep() per selector — nested :deep() is invalid and
   silently fails to apply. */
.gn-editor-wrap :deep(.gn-editor-prose) {
  padding: var(--space-3);
  min-height: 160px;
  outline: none;
  color: var(--color-text-primary);
  font-size: var(--text-base);
  line-height: 1.6;
}

.gn-editor-wrap :deep(.gn-editor-prose:focus) {
  outline: none;
}

.gn-editor-wrap :deep(.gn-editor-prose h1) {
  font-size: 1.5rem;
  font-weight: 700;
  margin: var(--space-3) 0 var(--space-2);
}

.gn-editor-wrap :deep(.gn-editor-prose h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: var(--space-3) 0 var(--space-2);
}

.gn-editor-wrap :deep(.gn-editor-prose h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: var(--space-3) 0 var(--space-2);
}

.gn-editor-wrap :deep(.gn-editor-prose p) {
  margin: var(--space-1) 0;
}

.gn-editor-wrap :deep(.gn-editor-prose ul),
.gn-editor-wrap :deep(.gn-editor-prose ol) {
  margin: var(--space-2) 0;
  padding-left: var(--space-5);
}

.gn-editor-wrap :deep(.gn-editor-prose ul) {
  list-style: disc;
}

.gn-editor-wrap :deep(.gn-editor-prose ol) {
  list-style: decimal;
}

.gn-editor-wrap :deep(.gn-editor-prose li) {
  margin: var(--space-1) 0;
}

.gn-editor-wrap :deep(.gn-editor-prose li > p) {
  margin: 0;
}

.gn-editor-wrap :deep(.gn-editor-prose blockquote) {
  margin: var(--space-2) 0;
  padding: var(--space-1) var(--space-3);
  border-left: 3px solid var(--color-border-active);
  background: var(--color-bg-surface);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-muted);
  font-style: italic;
}

.gn-editor-wrap :deep(.gn-editor-prose blockquote p) {
  margin: 0;
}

.gn-editor-wrap :deep(.gn-editor-prose code) {
  background: var(--color-code-bg);
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.875em;
}

.gn-editor-wrap :deep(.gn-editor-prose pre) {
  background: var(--color-code-bg);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: var(--space-2) 0;
}

.gn-editor-wrap :deep(.gn-editor-prose pre code) {
  background: transparent;
  padding: 0;
}

.gn-editor-wrap :deep(.gn-editor-prose a) {
  color: var(--color-accent);
  text-decoration: underline;
  cursor: pointer;
}

.gn-editor-wrap :deep(.gn-editor-prose hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: var(--space-3) 0;
}

/* Tables — borders, padding, header emphasis, and the selected-cell/node
   outline TipTap uses when a table/cell is focused. */
.gn-editor-wrap :deep(.gn-editor-prose table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: var(--space-2) 0;
  overflow: hidden;
}

.gn-editor-wrap :deep(.gn-editor-prose th),
.gn-editor-wrap :deep(.gn-editor-prose td) {
  border: 1px solid var(--color-border);
  padding: var(--space-1) var(--space-2);
  vertical-align: top;
  text-align: left;
  position: relative;
  min-width: 60px;
}

.gn-editor-wrap :deep(.gn-editor-prose th) {
  background: var(--color-bg-surface);
  font-weight: 600;
}

.gn-editor-wrap :deep(.gn-editor-prose .selectedCell) {
  background: var(--color-accent-bg);
}

.gn-editor-wrap :deep(.gn-editor-prose .ProseMirror-selectednode) {
  outline: 2px solid var(--color-accent);
}

.gn-editor-wrap :deep(.gn-editor-prose .column-resize-handle) {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--color-accent);
  opacity: 0;
  cursor: col-resize;
}

.gn-editor-wrap :deep(.gn-editor-prose .tableWrapper) {
  overflow-x: auto;
}
</style>
