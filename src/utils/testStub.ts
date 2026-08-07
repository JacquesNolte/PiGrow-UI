import { defineComponent, h, type ConcreteComponent } from 'vue'

const DialogStub = defineComponent({
  name: 'DialogStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()])
  },
})

const MessageStub = defineComponent({
  name: 'MessageStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'message-stub' }, slots.default?.())
  },
})

const InputNumberStub = defineComponent({
  name: 'InputNumberStub',
  props: ['dataTestid', 'modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        'data-testid': props.dataTestid,
        onInput: (event: Event) => {
          const raw = (event.target as HTMLInputElement).value.trim()
          const next = raw === '' ? null : Number(raw)
          emit('update:modelValue', next)
        },
        type: 'number',
        value: String(props.modelValue ?? ''),
      })
  },
})

// PrimeVue InputText/MultiSelect read $primevue.config during render; stubbing
// them with `true` still instantiates the real template which throws in tests.
const InputTextStub = defineComponent({
  name: 'InputTextStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        value: String(props.modelValue ?? ''),
      })
  },
})

const MultiSelectStub = defineComponent({
  name: 'MultiSelectStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(_props, { slots }) {
    return () => h('div', { class: 'multi-select-stub' }, slots.default?.() ?? [])
  },
})

const InputSwitchStub = defineComponent({
  name: 'InputSwitchStub',
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        checked: Boolean(props.modelValue),
        disabled: props.disabled,
        onChange: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).checked),
        type: 'checkbox',
      })
  },
})

const TextareaStub = defineComponent({
  name: 'TextareaStub',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        value: String(props.modelValue ?? ''),
      })
  },
})

// TipTap's EditorContent renders the contenteditable surface; in tests we
// stub it with a textarea so a test can drive the editor body via
// `data-testid="gn-editor"` without instantiating the real ProseMirror view.
const EditorContentStub = defineComponent({
  name: 'EditorContentStub',
  props: ['editor'],
  setup(props, { attrs }) {
    return () =>
      h('textarea', {
        'data-testid': (attrs as Record<string, unknown>)['data-testid'] ?? 'gn-editor',
        onInput: (event: Event) => {
          const ed = props.editor as { commands: { setContent: (s: string) => void } } | undefined
          ed?.commands.setContent((event.target as HTMLTextAreaElement).value)
        },
      })
  },
})

// PrimeVue's Tabs/TabList/TabPanels components use a context-injected active
// value to decide which TabPanel to show. A `true` stub drops the default slot
// entirely, hiding every panel; a passthrough stub at least lets the test
// exercise the slots and find the Add Device button.
const TabsStub = defineComponent({
  name: 'TabsStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'tabs-stub' }, slots.default?.() ?? [])
  },
})

const TabPanelsStub = defineComponent({
  name: 'TabPanelsStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'tab-panels-stub' }, slots.default?.() ?? [])
  },
})

// PrimeVue's DataTable sets up internal watchers on its `value` prop; the
// default `true` stub still instantiates that machinery and triggers an
// "Maximum recursive updates exceeded" loop when the test mutates the array
// backing the prop. This passthrough stub renders the default slot without
// any reactive prop bookkeeping, so tests can keep mutating the array freely.
const DataTableStub = defineComponent({
  name: 'DataTableStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'data-table-stub' }, slots.default?.() ?? [])
  },
})

const ColumnStub = defineComponent({
  name: 'ColumnStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'column-stub' }, slots.default?.() ?? [])
  },
})

// ConfirmDialog reads $primevue config during render; a `true` stub still
// instantiates the real template and explodes. A noop component keeps the
// mount quiet while leaving the dialog's <ConfirmDialog /> child slot empty.
const ConfirmDialogStub = defineComponent({
  name: 'ConfirmDialogStub',
  setup(_props, { slots }) {
    return () => h('div', { class: 'confirm-dialog-stub' }, slots.default?.() ?? [])
  },
})

// `defineComponent` returns a `DefineComponent` whose signature is wider than
// the `true | ConcreteComponent` shape that `@vue/test-utils` accepts in its
// stubs map. Cast to the structural type so the stubs are usable in tests.
export const primeVueStubs: Record<string, true | ConcreteComponent> = {
  Accordion: true,
  AccordionContent: true,
  AccordionHeader: true,
  AccordionPanel: true,
  Button: true,
  Column: ColumnStub as unknown as ConcreteComponent,
  ConfirmDialog: ConfirmDialogStub as unknown as ConcreteComponent,
  DataTable: DataTableStub as unknown as ConcreteComponent,
  Dialog: DialogStub as unknown as ConcreteComponent,
  InputNumber: InputNumberStub as unknown as ConcreteComponent,
  InputSwitch: InputSwitchStub as unknown as ConcreteComponent,
  InputText: InputTextStub as unknown as ConcreteComponent,
  Message: MessageStub as unknown as ConcreteComponent,
  MultiSelect: MultiSelectStub as unknown as ConcreteComponent,
  ProgressSpinner: true,
  Select: true,
  Tab: true,
  TabList: true,
  TabPanel: true,
  TabPanels: TabPanelsStub as unknown as ConcreteComponent,
  Tabs: TabsStub as unknown as ConcreteComponent,
  Tag: true,
  'primevue/accordion': true,
  'primevue/accordioncontent': true,
  'primevue/accordionheader': true,
  'primevue/accordionpanel': true,
  'primevue/button': true,
  'primevue/column': ColumnStub as unknown as ConcreteComponent,
  'primevue/confirmdialog': ConfirmDialogStub as unknown as ConcreteComponent,
  'primevue/datatable': DataTableStub as unknown as ConcreteComponent,
  'primevue/dialog': DialogStub as unknown as ConcreteComponent,
  'primevue/inputnumber': InputNumberStub as unknown as ConcreteComponent,
  'primevue/inputswitch': InputSwitchStub as unknown as ConcreteComponent,
  'primevue/inputtext': InputTextStub as unknown as ConcreteComponent,
  'primevue/message': MessageStub as unknown as ConcreteComponent,
  'primevue/multiselect': MultiSelectStub as unknown as ConcreteComponent,
  'primevue/progressspinner': true,
  'primevue/select': true,
  'primevue/tab': true,
  'primevue/tablist': true,
  'primevue/tabpanel': true,
  'primevue/tabpanels': TabPanelsStub as unknown as ConcreteComponent,
  'primevue/tabs': TabsStub as unknown as ConcreteComponent,
  'primevue/tag': true,
  'primevue/textarea': TextareaStub as unknown as ConcreteComponent,
  Textarea: TextareaStub as unknown as ConcreteComponent,
  EditorContent: EditorContentStub as unknown as ConcreteComponent,
}
