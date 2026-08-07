import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

const toastAddMock = vi.fn()
vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: toastAddMock }),
}))

const useConfirmMock = { require: vi.fn() }
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => useConfirmMock,
}))

const currentCycleRef = ref<{ id: string } | undefined>({ id: 'c1' })
const sortedPhasesRef = ref([
  { id: 'p1', name: 'Vegetative', order: 0, startAt: '2026-07-30' },
  { id: 'p2', name: 'Flower', order: 1, startAt: null },
])

vi.mock('./useGrowMonitorState', () => ({
  useProvidedGrowMonitorState: () => ({
    currentCycle: currentCycleRef,
    sortedPhases: sortedPhasesRef,
  }),
}))

// --- TipTap mock: a controllable fake editor so tests can drive the note body
// via a `gn-editor` textarea without instantiating ProseMirror. `isEmpty` is
// backed by a reactive object so the dialog's `canSave` computed updates when
// the textarea sets content.
const editorState = vi.hoisted(() => ({ html: '' }))
function resetEditorState() {
  editorState.html = ''
}

vi.mock('@tiptap/vue-3', async () => {
  const { ref, reactive, defineComponent, h } = await import('vue')
  const state = reactive(editorState)
  const fakeEditor = {
    get isEmpty() {
      return state.html === ''
    },
    getHTML: () => state.html,
    commands: {
      setContent: (s: string) => {
        state.html = s
      },
      clearContent: () => {
        state.html = ''
      },
    },
    chain: () => ({ focus: () => ({ run: () => undefined }) }),
    isActive: () => false,
  }
  const EditorContentStub = defineComponent({
    name: 'EditorContentStub',
    props: ['editor'],
    setup(props, { attrs }) {
      return () =>
        h('textarea', {
          'data-testid': 'gn-editor',
          value: state.html,
          onInput: (event: Event) => {
            const ed = props.editor as { commands: { setContent: (s: string) => void } } | undefined
            ed?.commands.setContent((event.target as HTMLTextAreaElement).value)
          },
        }) as unknown as ReturnType<typeof h>
    },
  })
  return {
    useEditor: () => ref(fakeEditor),
    EditorContent: EditorContentStub,
  }
})

vi.mock('@tiptap/starter-kit', () => ({ default: {} }))
vi.mock('@tiptap/extension-table', () => ({ Table: { configure: () => ({}) } }))
vi.mock('@tiptap/extension-table-row', () => ({ TableRow: {} }))
vi.mock('@tiptap/extension-table-cell', () => ({ TableCell: {} }))
vi.mock('@tiptap/extension-table-header', () => ({ TableHeader: {} }))

const listMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const removeMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    growCycleNotes: {
      list: listMock,
      create: createMock,
      update: updateMock,
      remove: removeMock,
    },
  }),
}))

import NotesTab from './NotesTab.vue'
import { primeVueStubs } from '../../utils/testStub'
import { defineComponent, h } from 'vue'
import type { GrowCycleNote } from '../../types/grow'

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
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve()
  }
}

function sampleNote(over: Partial<GrowCycleNote> = {}): GrowCycleNote {
  return {
    id: 'n1',
    growCycleId: 'c1',
    activeGrowPhaseId: 'p1',
    title: 'First note',
    note: 'Looking good',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...over,
  }
}

describe('NotesTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listMock.mockReset()
    createMock.mockReset()
    updateMock.mockReset()
    removeMock.mockReset()
    listMock.mockResolvedValue([])
    useConfirmMock.require.mockReset()
    toastAddMock.mockReset()
    resetEditorState()
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('renders the empty state when no notes exist', async () => {
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    expect(listMock).toHaveBeenCalledWith('c1')
    expect(w.text()).toMatch(/no notes for this grow cycle yet/i)
  })

  it('renders a note card per returned note, preserving newest-first order', async () => {
    listMock.mockResolvedValue([
      sampleNote({ id: 'n2', title: 'Second', note: 'B', createdAt: '2026-08-02T10:00:00.000Z' }),
      sampleNote({ id: 'n1', title: 'First', note: 'A', createdAt: '2026-08-01T10:00:00.000Z' }),
    ])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    const cards = w.findAll('.note-item')
    expect(cards.length).toBe(2)
    expect(cards[0]!.attributes('data-testid')).toBe('grow-note-n2')
    expect(cards[1]!.attributes('data-testid')).toBe('grow-note-n1')
  })

  it('resolves activeGrowPhaseId to "Day N of <phase>" using the phase startAt', async () => {
    listMock.mockResolvedValue([sampleNote({ activeGrowPhaseId: 'p1' })])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    // sampleNote createdAt is 2026-08-01; p1.startAt is 2026-07-30 → day 3.
    expect(w.find('[data-testid="grow-note-phase-n1"]').text()).toBe('Day 3 of Vegetative')
  })

  it('falls back to the bare phase name when the phase has no startAt', async () => {
    listMock.mockResolvedValue([sampleNote({ activeGrowPhaseId: 'p2' })])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    expect(w.find('[data-testid="grow-note-phase-n1"]').text()).toBe('Flower')
  })

  it('renders "No active phase" when activeGrowPhaseId is null', async () => {
    listMock.mockResolvedValue([sampleNote({ activeGrowPhaseId: null })])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    expect(w.find('[data-testid="grow-note-phase-n1"]').text()).toBe('No active phase')
  })

  it('renders rich HTML note bodies as sanitized HTML', async () => {
    listMock.mockResolvedValue([
      sampleNote({ id: 'n1', note: '<p>hello <strong>world</strong></p>' }),
    ])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    const body = w.find('[data-testid="grow-note-text-n1"]')
    expect(body.exists()).toBe(true)
    expect(body.html()).toContain('<strong>world</strong>')
  })

  it('strips script tags from stored note HTML on render', async () => {
    listMock.mockResolvedValue([
      sampleNote({ id: 'n1', note: '<p>safe</p><script>alert(1)</script>' }),
    ])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    const body = w.find('[data-testid="grow-note-text-n1"]')
    expect(body.html()).toContain('safe')
    expect(body.html()).not.toContain('script')
    expect(body.html()).not.toContain('alert(1)')
  })

  it('hardens links against reverse tabnabbing (target=_blank + rel=noopener noreferrer)', async () => {
    listMock.mockResolvedValue([
      sampleNote({ id: 'n1', note: '<a href="https://example.com">link</a>' }),
    ])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    const body = w.find('[data-testid="grow-note-text-n1"]').html()
    expect(body).toContain('target="_blank"')
    expect(body).toContain('rel="noopener noreferrer"')
    expect(body).toContain('href="https://example.com"')
  })

  it('renders legacy plain-text notes in the pre-wrap text branch', async () => {
    listMock.mockResolvedValue([sampleNote({ id: 'n1', note: 'line one\nline two' })])
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    const body = w.find('[data-testid="grow-note-text-n1"]')
    expect(body.classes()).toContain('note-body--text')
    expect(body.text()).toBe('line one\nline two')
  })

  it('adds a note: Add note -> editor -> create -> prepended at top', async () => {
    listMock.mockResolvedValue([sampleNote({ id: 'n1', title: 'Old', note: 'old' })])
    createMock.mockResolvedValue(sampleNote({ id: 'n2', title: 'New', note: 'fresh' }))
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    await w.get('[data-testid="gn-add"]').trigger('click')
    await flush()

    await w.get('[data-testid="gn-editor"]').setValue('fresh')
    await flush()

    await w.get('[data-testid="gn-save"]').trigger('click')
    await flush()

    expect(createMock).toHaveBeenCalledWith('c1', { note: 'fresh', title: undefined })
    const cards = w.findAll('.note-item')
    expect(cards[0]!.attributes('data-testid')).toBe('grow-note-n2')
  })

  it('edits a note: prefilled -> update -> replaced in place', async () => {
    listMock.mockResolvedValue([sampleNote({ id: 'n1', title: 'Old', note: 'old body' })])
    updateMock.mockResolvedValue(sampleNote({ id: 'n1', title: 'Old', note: 'new body' }))
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    await w.get('[data-testid="grow-note-edit-n1"]').trigger('click')
    await flush()

    await w.get('[data-testid="gn-editor"]').setValue('new body')
    await flush()

    await w.get('[data-testid="gn-save"]').trigger('click')
    await flush()

    expect(updateMock).toHaveBeenCalledWith(
      'c1',
      'n1',
      expect.objectContaining({ note: 'new body' }),
    )
    expect(w.find('[data-testid="grow-note-text-n1"]').text()).toBe('new body')
  })

  it('deletes a note after the confirm dialog is accepted', async () => {
    listMock.mockResolvedValue([sampleNote({ id: 'n1' })])
    removeMock.mockResolvedValue(undefined)
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    await w.get('[data-testid="grow-note-delete-n1"]').trigger('click')
    await flush()

    expect(useConfirmMock.require).toHaveBeenCalled()
    const options = useConfirmMock.require.mock.calls[0]![0] as { accept: () => void }
    options.accept()
    await flush()

    expect(removeMock).toHaveBeenCalledWith('c1', 'n1')
    expect(w.find('[data-testid="grow-note-n1"]').exists()).toBe(false)
  })

  it('shows an error state when the list call rejects', async () => {
    listMock.mockRejectedValue(new Error('boom'))
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    expect(w.text()).toContain('boom')
  })

  it('toasts an error when delete rejects', async () => {
    listMock.mockResolvedValue([sampleNote({ id: 'n1' })])
    removeMock.mockRejectedValue(new Error('boom'))
    const w = mount(NotesTab, { global: { stubs } })
    await flush()

    await w.get('[data-testid="grow-note-delete-n1"]').trigger('click')
    await flush()
    const options = useConfirmMock.require.mock.calls[0]![0] as { accept: () => void }
    options.accept()
    await flush()

    expect(removeMock).toHaveBeenCalledWith('c1', 'n1')
    expect(toastAddMock).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'boom', severity: 'error' }),
    )
  })

  it('reloads when the cycle id changes', async () => {
    const w = mount(NotesTab, { global: { stubs } })
    await flush()
    expect(listMock).toHaveBeenCalledWith('c1')

    currentCycleRef.value = { id: 'c2' }
    await flush()

    expect(listMock).toHaveBeenCalledWith('c2')
    w.unmount()
  })
})
