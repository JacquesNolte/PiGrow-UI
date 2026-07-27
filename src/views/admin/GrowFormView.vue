<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '../../stores/apiStore'
import { useUnsavedGuard } from '../../composables/useUnsavedGuard'
import {
  AutomationMode,
  DayNightPeriod,
  DeviceAction,
  DeviceType,
  RuleCondition,
  SensorType,
} from '../../types/grow'
import type {
  AutomationRule,
  CreateAutomationRulePayload,
  Device,
  GrowPhase,
  PhaseEnvironment,
  PhaseEnvironmentPayload,
  UpdateAutomationRulePayload,
} from '../../types/grow'
import { useAutomationRuleStore } from '../../stores/automationRuleStore'
import { computeBoundaryCoverage } from '../../composables/useEnvRuleCoverage'
import type { EnvRuleCoverage } from '../../composables/useEnvRuleCoverage'
import { defineAsyncComponent } from 'vue'
const PhaseAutomationRulesDialog = defineAsyncComponent(
  () => import('../../components/PhaseAutomationRulesDialog.vue'),
)
const PhaseNutrientList = defineAsyncComponent(
  () => import('../../components/PhaseNutrientList.vue'),
)
const PhasePhBandEditor = defineAsyncComponent(
  () => import('../../components/PhasePhBandEditor.vue'),
)
const DosingCalculatorDialog = defineAsyncComponent(
  () => import('../../components/DosingCalculatorDialog.vue'),
)
import {
  deriveActivePhaseIndex,
  deriveGrowActive,
  formatDate,
  parseDateOnly,
  recalculatePhaseDates,
} from '../../utils/growDates'
import { extractApiError } from '../../utils/errors'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import InputSwitch from 'primevue/inputswitch'
import MultiSelect from 'primevue/multiselect'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'

const store = useApiStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const growId = computed(() => route.params.id as string | undefined)
const isEditMode = computed(() => Boolean(growId.value))

const form = ref({ controllerId: '', name: '' })
const growStartDate = ref<Date>(new Date())
const phases = ref<GrowPhase[]>([])
const ready = ref(false)
const saving = ref(false)
const previousActivePhaseId = ref<string | null>(null)
const initialSnapshot = ref<string>('')

function captureSnapshot() {
  initialSnapshot.value = JSON.stringify({
    controllerId: form.value.controllerId,
    name: form.value.name,
    phases: phases.value,
    startAt: formatDate(growStartDate.value),
  })
}

const isDirty = computed(() => {
  if (!ready.value || !initialSnapshot.value) {
    return false
  }
  return (
    JSON.stringify({
      controllerId: form.value.controllerId,
      name: form.value.name,
      phases: phases.value,
      startAt: formatDate(growStartDate.value),
    }) !== initialSnapshot.value
  )
})
useUnsavedGuard(isDirty)

function recalculateDates() {
  recalculatePhaseDates(phases.value, growStartDate.value)
}

const controllerOptions = computed(() => store.controllers.filter((c) => c.id != null))

const totalCycleDays = computed(() => phases.value.reduce((sum, p) => sum + p.durationDays, 0))

const sortedPhases = computed(() => [...phases.value].toSorted((a, b) => a.order - b.order))

let localKeySeq = 0
function genLocalKey(prefix: string): string {
  return `${prefix}-${++localKeySeq}`
}

function getDefaultPhases(): GrowPhase[] {
  return [
    {
      dayDurationMinutes: 1080,
      dayStartMinutes: 360,
      durationDays: 7,
      endAt: null,
      isActive: false,
      localKey: genLocalKey('phase'),
      name: 'Germination',
      order: 1,
      phMax: null,
      phMin: null,
      phTarget: null,
      startAt: null,
    },
    {
      dayDurationMinutes: 1080,
      dayStartMinutes: 360,
      durationDays: 14,
      endAt: null,
      isActive: false,
      localKey: genLocalKey('phase'),
      name: 'Seedling',
      order: 2,
      phMax: null,
      phMin: null,
      phTarget: null,
      startAt: null,
    },
    {
      dayDurationMinutes: 1080,
      dayStartMinutes: 360,
      durationDays: 28,
      endAt: null,
      isActive: false,
      localKey: genLocalKey('phase'),
      name: 'Vegetative',
      order: 3,
      phMax: null,
      phMin: null,
      phTarget: null,
      startAt: null,
    },
    {
      dayDurationMinutes: 1080,
      dayStartMinutes: 360,
      durationDays: 56,
      endAt: null,
      isActive: false,
      localKey: genLocalKey('phase'),
      name: 'Flowering',
      order: 4,
      phMax: null,
      phMin: null,
      phTarget: null,
      startAt: null,
    },
    {
      dayDurationMinutes: 1080,
      dayStartMinutes: 360,
      durationDays: 14,
      endAt: null,
      isActive: false,
      localKey: genLocalKey('phase'),
      name: 'Flush',
      order: 5,
      phMax: null,
      phMin: null,
      phTarget: null,
      startAt: null,
    },
  ]
}

watch(
  () => phases.value.map((p) => p.durationDays),
  () => recalculateDates(),
  { deep: true },
)

watch(growStartDate, () => recalculateDates())

onMounted(async () => {
  try {
    await store.fetchAll()
    if (isEditMode.value && growId.value) {
      await loadExistingCycle(growId.value)
    } else {
      phases.value = getDefaultPhases()
      recalculateDates()
    }
  } catch (error) {
    console.error('Failed to load form data', error)
  } finally {
    captureSnapshot()
    ready.value = true
  }
})

async function loadExistingCycle(id: string) {
  const cycle = await store.fetchGrowCycle(id)
  form.value.controllerId = cycle.controllerId ?? ''
  form.value.name = cycle.name
  if (cycle.startAt) {
    growStartDate.value = parseDateOnly(cycle.startAt)
  }
  phases.value = (cycle.phases ?? []).map((p) => ({
    ...p,
    localKey: p.localKey ?? genLocalKey('phase'),
  }))
  recalculateDates()
  const previouslyActive = phases.value.find((p) => p.isActive && p.id)
  previousActivePhaseId.value = previouslyActive?.id ?? null
  await store.fetchDevices(cycle.controllerId)
}

function isPhaseActive(phase: GrowPhase): boolean {
  const activeIdx = deriveActivePhaseIndex(sortedPhases.value)
  if (activeIdx < 0) {
    return false
  }
  return sortedPhases.value[activeIdx] === phase
}

const activeTab = ref<'details' | 'phases' | 'nutrients'>('details')

const showPhaseModal = ref(false)
const editingPhaseIndex = ref<number | null>(null)
const phaseDraft = ref<GrowPhase>({
  dayDurationMinutes: 1080,
  dayStartMinutes: 360,
  durationDays: 7,
  endAt: null,
  isActive: false,
  name: '',
  order: 0,
  phMax: null,
  phMin: null,
  phTarget: null,
  startAt: null,
})

function dayStartTime(dayStartMinutes: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(dayStartMinutes / 60),
    minutes: dayStartMinutes % 60,
  }
}

function minutesFromTime(hours: number, minutes: number): number {
  return hours * 60 + minutes
}

const phaseDraftStartTime = computed(() => {
  const mins = phaseDraft.value.dayStartMinutes ?? 360
  return dayStartTime(mins)
})

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR
const DEFAULT_DAY_DURATION_MINUTES = 18 * MINUTES_PER_HOUR

const phaseDraftDurationHours = computed({
  get: () =>
    Math.round(
      (phaseDraft.value.dayDurationMinutes ?? DEFAULT_DAY_DURATION_MINUTES) / MINUTES_PER_HOUR,
    ),
  set: (hours: number) => {
    phaseDraft.value.dayDurationMinutes = hours * MINUTES_PER_HOUR
  },
})

function phaseDayNight(phase: GrowPhase): {
  startLabel: string
  dayHours: number
  nightHours: number
} {
  const dayMinutes = phase.dayDurationMinutes ?? DEFAULT_DAY_DURATION_MINUTES
  const nightMinutes = MINUTES_PER_DAY - dayMinutes
  const dayHours = dayMinutes / MINUTES_PER_HOUR
  const nightHours = nightMinutes / MINUTES_PER_HOUR
  if (phase.dayStartMinutes === undefined) {
    return { dayHours, nightHours, startLabel: '—' }
  }
  return { dayHours, nightHours, startLabel: fmtTime(phase.dayStartMinutes) }
}

function formatPhaseDayNight(phase: GrowPhase): string {
  const { startLabel, dayHours, nightHours } = phaseDayNight(phase)
  return `${startLabel} · ${dayHours}h day / ${nightHours}h night`
}

const phaseDraftDateRange = computed<{ start: string; end: string }>(() => {
  if (!phaseDraft.value.durationDays) {
    return { end: '—', start: '—' }
  }
  const idx = editingPhaseIndex.value ?? phases.value.length
  const cursor = new Date(growStartDate.value)
  cursor.setHours(0, 0, 0, 0)
  for (let i = 0; i < idx; i++) {
    const p = phases.value[i]
    if (p) {
      cursor.setDate(cursor.getDate() + p.durationDays)
    }
  }
  const start = new Date(cursor)
  const end = new Date(cursor)
  end.setDate(end.getDate() + phaseDraft.value.durationDays)
  return { end: formatDate(end), start: formatDate(start) }
})

function openAddPhase() {
  editingPhaseIndex.value = null
  phaseDraft.value = {
    dayDurationMinutes: 1080,
    dayStartMinutes: 360,
    durationDays: 7,
    endAt: null,
    isActive: false,
    localKey: genLocalKey('phase'),
    name: '',
    order: sortedPhases.value.length + 1,
    phMax: null,
    phMin: null,
    phTarget: null,
    startAt: null,
  }
  showPhaseModal.value = true
}

function openEditPhase(idx: number) {
  const phase = phases.value[idx]
  if (!phase) {
    return
  }
  editingPhaseIndex.value = idx
  phaseDraft.value = {
    ...phase,
    dayDurationMinutes: phase.dayDurationMinutes ?? 1080,
    dayStartMinutes: phase.dayStartMinutes ?? 360,
  }
  showPhaseModal.value = true
}

function closePhaseModal() {
  showPhaseModal.value = false
  editingPhaseIndex.value = null
}

function savePhaseDraft() {
  if (editingPhaseIndex.value === null) {
    phases.value.push({ ...phaseDraft.value })
  } else {
    const target = phases.value[editingPhaseIndex.value]
    if (target) {
      Object.assign(target, phaseDraft.value)
    }
  }
  phases.value.forEach((p, i) => (p.order = i + 1))
  recalculateDates()
  closePhaseModal()
}

function confirmRemovePhase(index: number) {
  const phase = phases.value[index]
  if (!phase) {
    return
  }
  const isPersisted = Boolean(phase.id)
  const detail = isPersisted
    ? 'This will permanently delete the phase from the server along with its environment and automation rules. This cannot be undone.'
    : 'Remove this staged phase from the cycle? This cannot be undone.'
  confirm.require({
    accept: () => removePhase(index),
    acceptLabel: 'Delete phase',
    acceptProps: { severity: 'danger' },
    header: `Delete "${phase.name}"`,
    icon: 'pi pi-exclamation-triangle',
    message: detail,
    rejectLabel: 'Cancel',
  })
}

async function removePhase(index: number) {
  const phase = phases.value[index]
  if (!phase) {
    return
  }
  if (phase.id) {
    try {
      await store.deleteGrowPhase(phase.id)
    } catch (error) {
      const { message } = extractApiError(error, 'Failed to delete phase')
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
      return
    }
    if (previousActivePhaseId.value === phase.id) {
      previousActivePhaseId.value = null
    }
  }
  phases.value.splice(index, 1)
  phases.value.forEach((p, i) => (p.order = i + 1))
  recalculateDates()
}

function mergePhaseFromEditor(updated: GrowPhase) {
  const idx = phases.value.findIndex(
    (p) =>
      (updated.id && p.id === updated.id) ||
      (p.localKey && updated.localKey && p.localKey === updated.localKey),
  )
  if (idx === -1) {
    return
  }
  phases.value[idx] = { ...phases.value[idx], ...updated }
}

const phaseDraftStartHours = ref(6)
const phaseDraftStartMinutes = ref(0)

watch(
  () => showPhaseModal.value,
  (visible) => {
    if (visible) {
      const t = dayStartTime(phaseDraft.value.dayStartMinutes ?? 360)
      phaseDraftStartHours.value = t.hours
      phaseDraftStartMinutes.value = t.minutes
    }
  },
)

function applyTimeToPhaseDraft() {
  phaseDraft.value.dayStartMinutes = minutesFromTime(
    phaseDraftStartHours.value,
    phaseDraftStartMinutes.value,
  )
}

async function savePhase(phase: GrowPhase, cycleId?: string): Promise<GrowPhase | null> {
  const payload = {
    dayDurationMinutes: phase.dayDurationMinutes,
    dayStartMinutes: phase.dayStartMinutes,
    durationDays: phase.durationDays,
    endAt: phase.endAt,
    isActive: phase.isActive,
    name: phase.name,
    order: phase.order,
    startAt: phase.startAt,
  }
  if (phase.id) {
    return await store.updateGrowPhase(phase.id, payload)
  }
  const targetCycleId = cycleId ?? growId.value
  if (targetCycleId) {
    const created = await store.createGrowPhase({
      ...payload,
      growCycleId: targetCycleId,
      isActive: false,
    })
    phase.id = created.id
    return created
  }
  return null
}

async function reconcileActivePhase() {
  const activeIdx = deriveActivePhaseIndex(sortedPhases.value)
  if (activeIdx >= 0) {
    const target = sortedPhases.value[activeIdx]
    if (target && target.id && target.id !== previousActivePhaseId.value) {
      await store.activateGrowPhase(target.id)
    }
    return
  }
  if (previousActivePhaseId.value) {
    await store.updateGrowPhase(previousActivePhaseId.value, { isActive: false })
  }
}

// ---------- Environment ----------

interface PhaseEnvCache {
  day: PhaseEnvironment | null
  night: PhaseEnvironment | null
  loading: boolean
  savingDay: boolean
  savingNight: boolean
}

const envCache = ref<Record<string, PhaseEnvCache>>({})

function getEnvCache(phase: GrowPhase): PhaseEnvCache {
  const key = phase.localKey!
  if (!envCache.value[key]) {
    envCache.value[key] = {
      day: null,
      loading: false,
      night: null,
      savingDay: false,
      savingNight: false,
    }
  }
  return envCache.value[key]
}

async function loadPhaseEnv(phase: GrowPhase) {
  if (!phase.id) {
    return
  }
  const cache = getEnvCache(phase)
  cache.loading = true
  try {
    const data = await store.fetchPhaseEnvironment(phase.id)
    cache.day = data.day
    cache.night = data.night
  } catch {
    // Non-fatal
  } finally {
    cache.loading = false
  }
}

async function savePhaseEnv(
  phase: GrowPhase,
  period: 'DAY' | 'NIGHT',
  payload: PhaseEnvironmentPayload,
  options: { silent?: boolean } = {},
) {
  if (!phase.id) {
    return
  }
  const cache = getEnvCache(phase)
  if (period === 'DAY') {
    cache.savingDay = true
  } else {
    cache.savingNight = true
  }
  try {
    const saved = await store.upsertPhaseEnvironment(phase.id, period, payload)
    if (period === 'DAY') {
      cache.day = saved
    } else {
      cache.night = saved
    }
    return saved
  } catch (error) {
    if (!options.silent) {
      const { message } = extractApiError(error, 'Failed to save environment')
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
    }
    throw error
  } finally {
    if (period === 'DAY') {
      cache.savingDay = false
    } else {
      cache.savingNight = false
    }
  }
}

// oxlint-disable-next-line require-await
async function clearPhaseEnv(phase: GrowPhase, period: 'DAY' | 'NIGHT') {
  const phaseId = phase.id
  if (!phaseId) {
    return
  }
  confirm.require({
    accept: async () => {
      const cache = getEnvCache(phase)
      if (period === 'DAY') {
        cache.savingDay = true
      } else {
        cache.savingNight = true
      }
      try {
        await store.deletePhaseEnvironment(phaseId, period)
        if (period === 'DAY') {
          cache.day = null
        } else {
          cache.night = null
        }
      } catch (error) {
        const { message } = extractApiError(error, 'Failed to clear environment')
        toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
      } finally {
        if (period === 'DAY') {
          cache.savingDay = false
        } else {
          cache.savingNight = false
        }
      }
    },
    acceptLabel: 'Clear',
    acceptProps: { severity: 'danger' },
    header: `Clear ${period} environment`,
    icon: 'pi pi-exclamation-triangle',
    message: `Remove the ${period} environment thresholds for "${phase.name}"?`,
    rejectLabel: 'Cancel',
  })
}

function emptyEnvPayload(): PhaseEnvironmentPayload {
  return {
    co2Max: null,
    co2Min: null,
    co2Target: null,
    humidityMax: null,
    humidityMin: null,
    humidityTarget: null,
    tempMax: null,
    tempMin: null,
    tempTarget: null,
  }
}

const envDraftDay = ref<PhaseEnvironmentPayload>(emptyEnvPayload())
const envDraftNight = ref<PhaseEnvironmentPayload>(emptyEnvPayload())
const envEditingPhase = ref<GrowPhase | null>(null)
const showEnvForm = ref(false)
const envDialogLoading = ref(false)

function envPayloadFromCache(env: PhaseEnvironment | null): PhaseEnvironmentPayload {
  return {
    co2Max: env?.co2Max ?? null,
    co2Min: env?.co2Min ?? null,
    co2Target: env?.co2Target ?? null,
    humidityMax: env?.humidityMax ?? null,
    humidityMin: env?.humidityMin ?? null,
    humidityTarget: env?.humidityTarget ?? null,
    tempMax: env?.tempMax ?? null,
    tempMin: env?.tempMin ?? null,
    tempTarget: env?.tempTarget ?? null,
  }
}

async function openEnvDialog(phase: GrowPhase) {
  envEditingPhase.value = phase
  showEnvForm.value = true
  envDialogLoading.value = true
  try {
    await Promise.all([loadPhaseEnv(phase), loadPhaseRules(phase)])
    const cache = getEnvCache(phase)
    envDraftDay.value = envPayloadFromCache(cache.day)
    envDraftNight.value = envPayloadFromCache(cache.night)
  } finally {
    envDialogLoading.value = false
  }
}

function closeEnvDialog() {
  envEditingPhase.value = null
  showEnvForm.value = false
}

async function saveEnvDialog() {
  const phase = envEditingPhase.value
  if (!phase) {
    return
  }
  const [dayRes, nightRes] = await Promise.allSettled([
    savePhaseEnv(phase, 'DAY', envDraftDay.value, { silent: true }),
    savePhaseEnv(phase, 'NIGHT', envDraftNight.value, { silent: true }),
  ])
  if (dayRes.status === 'fulfilled' && nightRes.status === 'fulfilled') {
    toast.add({
      detail: 'Environment saved',
      life: 3000,
      severity: 'success',
      summary: 'Saved',
    })
    closeEnvDialog()
    return
  }
  const failed: string[] = []
  if (dayRes.status === 'rejected') {
    failed.push('Day')
  }
  if (nightRes.status === 'rejected') {
    failed.push('Night')
  }
  toast.add({
    detail: `${failed.join(' and ')} save failed`,
    life: 6000,
    severity: 'error',
    summary: 'Save failed',
  })
}

function envDraftFor(period: 'DAY' | 'NIGHT'): PhaseEnvironmentPayload {
  return period === 'DAY' ? envDraftDay.value : envDraftNight.value
}

const envIsSaving = computed(() => {
  const phase = envEditingPhase.value
  if (!phase) {
    return false
  }
  const cache = getEnvCache(phase)
  return cache.savingDay || cache.savingNight
})

// ---------- Automation rules dialog ----------

const ruleStore = useAutomationRuleStore()

const showRulesDialog = ref(false)
const showDosingCalculator = ref(false)
const dosingCalculatorPhase = ref<GrowPhase | null>(null)
const rulesEditingPhase = ref<GrowPhase | null>(null)

function openDosingCalculator(phase: GrowPhase) {
  if (!phase.id) {
    return
  }
  dosingCalculatorPhase.value = phase
  showDosingCalculator.value = true
}
const rulesLoading = ref(false)
const phaseRules = ref<Record<string, AutomationRule[]>>({})

function openRulesDialog(phase: GrowPhase) {
  rulesEditingPhase.value = phase
  showRulesDialog.value = true
}

function closeRulesDialog() {
  showRulesDialog.value = false
  rulesEditingPhase.value = null
}

async function onRulesChanged() {
  const phase = rulesEditingPhase.value
  if (phase) {
    await refreshPhaseRules(phase)
  }
}

async function loadPhaseRules(phase: GrowPhase) {
  if (!phase.id) {
    return
  }
  rulesLoading.value = true
  try {
    const list = await ruleStore.fetchRulesByPhase(phase.id)
    phaseRules.value[phase.localKey!] = list
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to load rules')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Load failed' })
  } finally {
    rulesLoading.value = false
  }
}

async function refreshPhaseRules(phase: GrowPhase) {
  if (!phase.id) {
    return
  }
  try {
    const list = await ruleStore.fetchRulesByPhase(phase.id)
    phaseRules.value[phase.localKey!] = list
  } catch {
    // Non-fatal
  }
}

function getPhaseRules(phase: GrowPhase): AutomationRule[] {
  return phaseRules.value[phase.localKey!] ?? []
}

// ---------- Env→Rules coverage + auto-create ----------

const controllerDevices = computed<Device[]>(
  () =>
    (
      store.controllers.find((c) => c.id === form.value.controllerId) as
        | ((typeof store.controllers)[number] & { devices?: Device[] })
        | undefined
    )?.devices ?? [],
)

const envRuleCoverage = computed<EnvRuleCoverage | null>(() => {
  const phase = envEditingPhase.value
  if (!phase) {
    return null
  }
  return computeBoundaryCoverage(
    envDraftDay.value,
    envDraftNight.value,
    getPhaseRules(phase),
    controllerDevices.value,
  )
})

interface AutoCreateTemplate {
  deviceTypes: DeviceType[]
  watchedSensorType: SensorType
  condition: RuleCondition
  action: DeviceAction
  period: DayNightPeriod | null
  boundary: { payloadKey: 'temp' | 'humidity' | 'co2'; side: 'min' | 'max' }
}

const AUTO_CREATE_TEMPLATES: AutoCreateTemplate[] = [
  {
    action: DeviceAction.ON,
    boundary: { payloadKey: 'temp', side: 'max' },
    condition: RuleCondition.ABOVE_MAX,
    deviceTypes: [
      DeviceType.EXHAUST_FAN,
      DeviceType.INTAKE_FAN,
      DeviceType.AIR_CONDITIONER,
      DeviceType.CIRCULATION_FAN,
    ],
    period: null,
    watchedSensorType: SensorType.TEMPERATURE,
  },
  {
    action: DeviceAction.ON,
    boundary: { payloadKey: 'temp', side: 'min' },
    condition: RuleCondition.BELOW_MIN,
    deviceTypes: [DeviceType.HEATER],
    period: null,
    watchedSensorType: SensorType.TEMPERATURE,
  },
  {
    action: DeviceAction.ON,
    boundary: { payloadKey: 'humidity', side: 'min' },
    condition: RuleCondition.BELOW_MIN,
    deviceTypes: [DeviceType.HUMIDIFIER],
    period: null,
    watchedSensorType: SensorType.HUMIDITY,
  },
  {
    action: DeviceAction.ON,
    boundary: { payloadKey: 'humidity', side: 'max' },
    condition: RuleCondition.ABOVE_MAX,
    deviceTypes: [DeviceType.DEHUMIDIFIER],
    period: null,
    watchedSensorType: SensorType.HUMIDITY,
  },
  {
    action: DeviceAction.ON,
    boundary: { payloadKey: 'co2', side: 'min' },
    condition: RuleCondition.BELOW_MIN,
    deviceTypes: [DeviceType.CO2_INJECTOR],
    period: null,
    watchedSensorType: SensorType.CO2,
  },
]

const autoCreateBusy = ref(false)

function existingRuleKey(
  rule: AutomationRule,
  boundary: { payloadKey: 'temp' | 'humidity' | 'co2'; side: 'min' | 'max' },
): string {
  const condition = boundary.side === 'max' ? RuleCondition.ABOVE_MAX : RuleCondition.BELOW_MIN
  return `${rule.deviceId}|${rule.watchedSensorType}|${condition}|${rule.period ?? 'null'}`
}

async function autoCreateFromEnv() {
  const phase = envEditingPhase.value
  const coverage = envRuleCoverage.value
  if (!phase?.id || !coverage) {
    return
  }
  const phaseId = phase.id

  const devices = controllerDevices.value.filter((d) => d.isActive)
  const existing = getPhaseRules(phase)
  const existingKeys = new Set<string>()
  for (const rule of existing) {
    const tpl = AUTO_CREATE_TEMPLATES.find(
      (t) =>
        t.condition === rule.condition &&
        t.watchedSensorType === rule.watchedSensorType &&
        t.boundary.payloadKey &&
        t.boundary.side === (rule.condition === RuleCondition.ABOVE_MAX ? 'max' : 'min'),
    )
    if (tpl) {
      existingKeys.add(existingRuleKey(rule, tpl.boundary))
    }
  }

  const toCreate: { deviceId: string; template: AutoCreateTemplate }[] = []
  for (const tpl of AUTO_CREATE_TEMPLATES) {
    const boundaryKey =
      tpl.boundary.side === 'max'
        ? `${tpl.boundary.payloadKey}Max`
        : `${tpl.boundary.payloadKey}Min`
    const covered = coverage.boundaries.find((b) => b.key === boundaryKey)
    if (!covered?.isSetAny) {
      continue
    }

    for (const dev of devices) {
      if (!tpl.deviceTypes.includes(dev.type)) {
        continue
      }
      const key = `${dev.id}|${tpl.watchedSensorType}|${tpl.condition}|${tpl.period ?? 'null'}`
      if (existingKeys.has(key)) {
        continue
      }
      toCreate.push({ deviceId: dev.id, template: tpl })
    }
  }

  if (toCreate.length === 0) {
    toast.add({
      detail: 'No matching devices or no unmatched thresholds.',
      life: 4000,
      severity: 'info',
      summary: 'Nothing to create',
    })
    return
  }

  autoCreateBusy.value = true
  try {
    const results = await Promise.allSettled(
      toCreate.map(({ deviceId, template }) =>
        ruleStore.createRule({
          action: template.action,
          condition: template.condition,
          cooldownSeconds: 180,
          deviceId,
          enabled: true,
          growPhaseId: phaseId,
          period: template.period,
          watchedSensorType: template.watchedSensorType,
        }),
      ),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    await refreshPhaseRules(phase)
    if (failed === 0) {
      toast.add({
        detail: `Created ${toCreate.length} rule${toCreate.length > 1 ? 's' : ''} from environment.`,
        life: 4000,
        severity: 'success',
        summary: 'Rules created',
      })
    } else {
      const { message } = extractApiError(
        results.find((r) => r.status === 'rejected')?.reason,
        `Created ${toCreate.length - failed} rules; ${failed} failed.`,
      )
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Some rules failed' })
    }
  } finally {
    autoCreateBusy.value = false
  }
}

// ---------- Save ---------

const handleSave = async () => {
  if (!form.value.controllerId) {
    console.error('controllerId is required')
    return
  }
  saving.value = true
  try {
    const startAtDate = formatDate(growStartDate.value)
    if (isEditMode.value && growId.value) {
      const growActive = deriveGrowActive(startAtDate, sortedPhases.value)
      try {
        await store.updateGrowCycle(growId.value, {
          isActive: growActive,
          name: form.value.name,
          startAt: startAtDate,
        })
      } catch (error) {
        const { message, status } = extractApiError(error, 'Failed to update grow cycle')
        if (status === 409) {
          toast.add({
            detail:
              'End the currently running grow on this controller before activating another one.',
            life: 8000,
            severity: 'error',
            summary: 'Controller busy',
          })
        } else {
          toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Update failed' })
        }
        return
      }
      for (const phase of phases.value) {
        await savePhase(phase)
      }
      await reconcileActivePhase()
      captureSnapshot()
      router.push('/admin')
    } else {
      let created
      try {
        created = await store.createGrowCycle({
          controllerId: form.value.controllerId,
          name: form.value.name,
          startAt: startAtDate,
        })
      } catch (error) {
        const { message, status } = extractApiError(error, 'Failed to create grow cycle')
        if (status === 409) {
          toast.add({
            detail: 'End the currently running grow on this controller before starting a new one.',
            life: 8000,
            severity: 'error',
            summary: 'Controller busy',
          })
        } else {
          toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Create failed' })
        }
        return
      }

      for (const phase of sortedPhases.value) {
        await savePhase(phase, created.id)
      }

      const growActive = deriveGrowActive(startAtDate, sortedPhases.value)
      try {
        await store.updateGrowCycle(created.id, { isActive: growActive })
      } catch (error) {
        const { message, status } = extractApiError(error, 'Failed to activate grow cycle')
        if (status === 409) {
          toast.add({
            detail:
              'End the currently running grow on this controller before activating another one.',
            life: 8000,
            severity: 'error',
            summary: 'Controller busy',
          })
        } else {
          toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Update failed' })
        }
        return
      }
      await reconcileActivePhase()
      captureSnapshot()
      router.push(`/admin/grows/edit/${created.id}`)
    }
  } catch (error) {
    console.error('Failed to save', error)
  } finally {
    saving.value = false
  }
}

function fmtTime(dayStartMinutes: number): string {
  const h = Math.floor(dayStartMinutes / 60)
  const m = dayStartMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
</script>

<template>
  <ConfirmDialog />
  <div v-if="ready" class="form-page">
    <Card>
      <template #title>
        {{ isEditMode ? 'Adjust Grow Lifecycle Plan' : 'Schedule New Botanical Run' }}
      </template>
      <template #content>
        <Tabs v-model:value="activeTab" class="grow-tabs">
          <TabList>
            <Tab value="details">
              <i class="pi pi-info-circle" />
              <span>Details</span>
            </Tab>
            <Tab value="phases">
              <i class="pi pi-list" />
              <span>Phases</span>
            </Tab>
            <Tab value="nutrients">
              <i class="pi pi-flask" />
              <span>Nutrient Dosing</span>
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="details">
              <div class="details-grid">
                <div class="field">
                  <label for="grow-controller" class="field-label">Assigned Controller</label>
                  <Select
                    id="grow-controller"
                    v-model="form.controllerId"
                    :options="controllerOptions"
                    optionLabel="name"
                    optionValue="id"
                    placeholder="Select controller"
                    class="full-width"
                    show-clear
                    :disabled="isEditMode"
                  />
                </div>
                <div class="field">
                  <label for="grow-name" class="field-label">Grow Name</label>
                  <InputText
                    id="grow-name"
                    v-model="form.name"
                    placeholder="Run #5 - White Widow"
                    class="full-width"
                  />
                </div>
                <div class="field">
                  <label for="grow-start-date" class="field-label">Start Date</label>
                  <DatePicker
                    id="grow-start-date"
                    v-model="growStartDate"
                    dateFormat="yy-mm-dd"
                    showIcon
                    class="full-width"
                  />
                </div>
              </div>
              <p v-if="isEditMode" class="form-hint">
                Controller assignment is locked for the lifetime of a grow. To move this run to a
                different Pi, end it and create a new one.
              </p>
            </TabPanel>

            <TabPanel value="phases">
              <div class="tab-section">
                <div class="section-toolbar">
                  <h3 class="section-title">Grow Phases</h3>
                  <Button
                    label="Add Phase"
                    icon="pi pi-plus"
                    size="small"
                    severity="success"
                    @click="openAddPhase"
                  />
                </div>

                <DataTable
                  v-if="phases.length > 0"
                  :value="sortedPhases"
                  size="small"
                  class="phases-table"
                >
                  <Column header="#" style="width: 60px">
                    <template #body="slotProps">
                      <span class="phase-order-badge">{{ slotProps.data.order }}</span>
                    </template>
                  </Column>
                  <Column field="name" header="Name" sortable style="font-weight: 600" />
                  <Column header="Duration" sortable>
                    <template #body="slotProps"> {{ slotProps.data.durationDays }} days </template>
                  </Column>
                  <Column header="Day/Night" sortable>
                    <template #body="slotProps">
                      <code v-if="slotProps.data.dayStartMinutes != null" class="meta-code">
                        {{ formatPhaseDayNight(slotProps.data) }}
                      </code>
                      <span v-else class="muted">—</span>
                    </template>
                  </Column>
                  <Column header="Status" sortable>
                    <template #body="slotProps">
                      <Tag
                        :value="isPhaseActive(slotProps.data) ? 'Active' : 'Scheduled'"
                        :severity="isPhaseActive(slotProps.data) ? 'success' : 'secondary'"
                        rounded
                      />
                    </template>
                  </Column>
                  <Column header="Actions" style="width: 160px">
                    <template #body="slotProps">
                      <div class="row-actions">
                        <Button
                          icon="pi pi-pencil"
                          severity="secondary"
                          text
                          rounded
                          size="small"
                          aria-label="Edit phase"
                          v-tooltip.top="'Edit phase'"
                          @click.stop="openEditPhase(phases.indexOf(slotProps.data))"
                        />
                        <Button
                          icon="pi pi-sun"
                          severity="info"
                          text
                          rounded
                          size="small"
                          aria-label="Edit environment"
                          :disabled="!slotProps.data.id"
                          v-tooltip.top="slotProps.data.id ? 'Environment' : 'Save the grow first'"
                          @click.stop="openEnvDialog(slotProps.data)"
                        />
                        <Button
                          icon="pi pi-bolt"
                          severity="warn"
                          text
                          rounded
                          size="small"
                          aria-label="Edit automation rules"
                          :disabled="!slotProps.data.id || rulesLoading"
                          v-tooltip.top="
                            slotProps.data.id ? 'Automation Rules' : 'Save the grow first'
                          "
                          @click.stop="openRulesDialog(slotProps.data)"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          size="small"
                          aria-label="Delete phase"
                          v-tooltip.top="'Delete phase'"
                          @click.stop="confirmRemovePhase(phases.indexOf(slotProps.data))"
                        />
                      </div>
                    </template>
                  </Column>
                </DataTable>

                <div v-else class="empty-state">
                  <span class="pi pi-list empty-icon" />
                  <p>No phases defined yet. Add a phase to begin planning the grow cycle.</p>
                </div>

                <div v-if="phases.length > 0" class="total-summary">
                  <span class="total-label">Total Cycle Duration</span>
                  <span class="total-value">{{ totalCycleDays }} days</span>
                </div>
              </div>
            </TabPanel>

            <TabPanel value="nutrients">
              <div class="tab-section">
                <div class="section-toolbar">
                  <h3 class="section-title">Nutrient Dosing per Phase</h3>
                  <span class="section-hint">
                    Configure one shared nutrient mix and pH band per phase. The same values apply
                    to both DAY and NIGHT.
                  </span>
                </div>

                <div v-if="phases.length === 0" class="empty-state">
                  <span class="pi pi-list empty-icon" />
                  <p>Add at least one phase to configure nutrient dosing.</p>
                </div>

                <div v-else class="nutrient-phase-stack">
                  <div
                    v-for="phase in sortedPhases"
                    :key="phase.localKey ?? phase.id ?? phase.name"
                    class="nutrient-phase-block"
                  >
                    <div class="nutrient-phase-header">
                      <span class="nutrient-phase-order">#{{ phase.order }}</span>
                      <span class="nutrient-phase-name">{{ phase.name }}</span>
                      <span
                        v-if="!phase.id"
                        class="nutrient-phase-locked"
                        data-testid="phase-unsaved"
                      >
                        Save the grow to enable dosing.
                      </span>
                    </div>
                    <div class="nutrient-phase-actions">
                      <PhaseNutrientList :grow-phase-id="phase.id ?? ''" />
                      <Button
                        label="Calculator"
                        icon="pi pi-calculator"
                        size="small"
                        severity="info"
                        :disabled="!phase.id"
                        @click="openDosingCalculator(phase)"
                      />
                    </div>
                    <div class="nutrient-phase-ph">
                      <PhasePhBandEditor :phase="phase" @updated="mergePhaseFromEditor" />
                    </div>
                  </div>
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <div class="form-actions">
          <Button
            :label="isEditMode ? 'Commit Changes' : 'Initialize Batch'"
            severity="success"
            :loading="saving"
            @click="handleSave"
          />
          <Button label="Cancel" severity="secondary" @click="router.push('/admin')" />
        </div>
      </template>
    </Card>

    <Dialog
      v-model:visible="showPhaseModal"
      :header="editingPhaseIndex === null ? 'Add Phase' : 'Edit Phase'"
      :style="{ width: '90vw', maxWidth: '520px' }"
      modal
      dismissable-mask
      class="phase-modal"
    >
      <div class="form-stack">
        <div class="field">
          <label for="phase-name-modal" class="field-label">Phase Name</label>
          <InputText
            id="phase-name-modal"
            v-model="phaseDraft.name"
            placeholder="e.g. Vegetative"
            class="full-width"
            autofocus
          />
        </div>
        <div class="field">
          <label for="phase-duration-modal" class="field-label">Duration (days)</label>
          <InputNumber inputId="phase-duration-modal" v-model="phaseDraft.durationDays" :min="1" />
        </div>
        <div class="field-row-2">
          <div class="field">
            <label for="phase-day-start" class="field-label">Day Start (HH:MM)</label>
            <div class="time-picker-row">
              <InputNumber
                inputId="phase-day-start-hours"
                v-model="phaseDraftStartHours"
                :min="0"
                :max="23"
                showButtons
                buttonLayout="horizontal"
                :step="1"
                class="time-input"
                @blur="applyTimeToPhaseDraft"
              />
              <span class="time-sep">:</span>
              <InputNumber
                inputId="phase-day-start-minutes"
                v-model="phaseDraftStartMinutes"
                :min="0"
                :max="59"
                showButtons
                buttonLayout="horizontal"
                :step="5"
                class="time-input"
                @blur="applyTimeToPhaseDraft"
              />
            </div>
          </div>
          <div class="field">
            <label for="phase-day-duration" class="field-label">Day Duration (hours)</label>
            <InputNumber
              inputId="phase-day-duration"
              v-model="phaseDraftDurationHours"
              :min="0"
              :max="24"
              showButtons
              buttonLayout="horizontal"
              :step="1"
            />
            <span class="field-hint">Night = {{ 24 - phaseDraftDurationHours }} h</span>
          </div>
        </div>
        <div v-if="phaseDraft.durationDays" class="date-range date-range--modal">
          <span>
            <strong>Runs:</strong>
            {{ phaseDraftDateRange.start }} → {{ phaseDraftDateRange.end }}
          </span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" size="small" @click="closePhaseModal" />
        <Button
          :label="editingPhaseIndex === null ? 'Add Phase' : 'Save'"
          severity="success"
          size="small"
          :disabled="!phaseDraft.name || !phaseDraft.durationDays"
          @click="savePhaseDraft"
        />
      </template>
    </Dialog>

    <!-- Environment edit dialog (combined Day + Night) -->
    <Dialog
      v-model:visible="showEnvForm"
      :header="`Environment — ${envEditingPhase?.name ?? ''}`"
      :style="{ width: '90vw', maxWidth: '800px' }"
      modal
      dismissable-mask
      class="env-modal"
    >
      <div v-if="envDialogLoading" class="env-loading">
        <i class="pi pi-spin pi-spinner" /> Loading environment…
      </div>
      <div v-else class="form-stack">
        <div
          v-if="envRuleCoverage && envRuleCoverage.uncoveredCount > 0"
          class="env-coverage-banner env-coverage-warn"
        >
          <div class="env-coverage-content">
            <i class="pi pi-exclamation-triangle" />
            <div>
              <strong>No rule will fire on these thresholds yet.</strong>
              <ul class="env-coverage-list">
                <li
                  v-for="b in envRuleCoverage.boundaries.filter(
                    (b) => b.isSetAny && !b.hasMatchingRule,
                  )"
                  :key="b.key"
                >
                  {{ b.label }} ({{ b.side === 'max' ? 'max' : 'min'
                  }}{{
                    b.setInDay && b.setInNight ? ', day & night' : b.setInDay ? ', day' : ', night'
                  }})
                </li>
              </ul>
            </div>
          </div>
          <Button
            label="Create default rules"
            icon="pi pi-bolt"
            severity="warn"
            size="small"
            :loading="autoCreateBusy"
            @click="autoCreateFromEnv"
          />
        </div>

        <div
          v-else-if="envRuleCoverage && envRuleCoverage.blockedCount > 0"
          class="env-coverage-banner env-coverage-info"
        >
          <div class="env-coverage-content">
            <i class="pi pi-info-circle" />
            <div>
              <strong>Some matching rules are blocked by device mode.</strong>
              <ul class="env-coverage-list">
                <li
                  v-for="b in envRuleCoverage.boundaries.filter((b) => b.blockingDeviceCount > 0)"
                  :key="b.key"
                >
                  {{ b.label }} — blocked by: {{ b.blockingDeviceNames.join(', ') }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="env-form-grid">
          <div v-for="period in ['DAY', 'NIGHT'] as const" :key="period" class="env-form-group">
            <div class="env-form-group-header">
              <h5 class="env-form-group-title">{{ period }}</h5>
              <Button
                v-if="envEditingPhase?.id"
                icon="pi pi-trash"
                label="Clear"
                text
                size="small"
                severity="danger"
                v-tooltip.top="`Clear ${period} environment`"
                :loading="
                  period === 'DAY'
                    ? getEnvCache(envEditingPhase).savingDay
                    : getEnvCache(envEditingPhase).savingNight
                "
                @click="clearPhaseEnv(envEditingPhase!, period)"
              />
            </div>
            <div class="env-form-fields">
              <h6 class="env-form-subtitle">Temperature (°C)</h6>
              <div class="field-row-3">
                <div class="field">
                  <label class="field-label">Min</label>
                  <InputNumber
                    v-model="envDraftFor(period).tempMin"
                    placeholder="e.g. 18"
                    :min="-10"
                    :max="50"
                    :step="0.5"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Triggers BELOW_MIN rules</small>
                </div>
                <div class="field">
                  <label class="field-label">Target</label>
                  <InputNumber
                    v-model="envDraftFor(period).tempTarget"
                    placeholder="e.g. 22"
                    :min="-10"
                    :max="50"
                    :step="0.5"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Stored; not used by automation</small>
                </div>
                <div class="field">
                  <label class="field-label">Max</label>
                  <InputNumber
                    v-model="envDraftFor(period).tempMax"
                    placeholder="e.g. 28"
                    :min="-10"
                    :max="50"
                    :step="0.5"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Triggers ABOVE_MAX rules</small>
                </div>
              </div>
            </div>
            <div class="env-form-fields">
              <h6 class="env-form-subtitle">Humidity (%)</h6>
              <div class="field-row-3">
                <div class="field">
                  <label class="field-label">Min</label>
                  <InputNumber
                    v-model="envDraftFor(period).humidityMin"
                    placeholder="e.g. 50"
                    :min="0"
                    :max="100"
                    :step="1"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Triggers BELOW_MIN rules</small>
                </div>
                <div class="field">
                  <label class="field-label">Target</label>
                  <InputNumber
                    v-model="envDraftFor(period).humidityTarget"
                    placeholder="e.g. 65"
                    :min="0"
                    :max="100"
                    :step="1"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Stored; not used by automation</small>
                </div>
                <div class="field">
                  <label class="field-label">Max</label>
                  <InputNumber
                    v-model="envDraftFor(period).humidityMax"
                    placeholder="e.g. 80"
                    :min="0"
                    :max="100"
                    :step="1"
                    :minFractionDigits="0"
                    :maxFractionDigits="1"
                  />
                  <small class="field-micro-hint">Triggers ABOVE_MAX rules</small>
                </div>
              </div>
            </div>
            <div class="env-form-fields">
              <h6 class="env-form-subtitle">CO₂ (ppm)</h6>
              <div class="field-row-3">
                <div class="field">
                  <label class="field-label">Min</label>
                  <InputNumber
                    v-model="envDraftFor(period).co2Min"
                    placeholder="e.g. 800"
                    :min="0"
                    :max="10000"
                    :step="50"
                  />
                  <small class="field-micro-hint">Triggers BELOW_MIN rules</small>
                </div>
                <div class="field">
                  <label class="field-label">Target</label>
                  <InputNumber
                    v-model="envDraftFor(period).co2Target"
                    placeholder="e.g. 1200"
                    :min="0"
                    :max="10000"
                    :step="50"
                  />
                  <small class="field-micro-hint">Stored; not used by automation</small>
                </div>
                <div class="field">
                  <label class="field-label">Max</label>
                  <InputNumber
                    v-model="envDraftFor(period).co2Max"
                    placeholder="e.g. 1500"
                    :min="0"
                    :max="10000"
                    :step="50"
                  />
                  <small class="field-micro-hint">Triggers ABOVE_MAX rules</small>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p class="field-hint">
          Leave blank to leave a threshold unconstrained. Targets are stored but not yet used by
          automation. pH bands are configured per phase on the Nutrient Dosing tab.
        </p>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" size="small" @click="closeEnvDialog" />
        <Button
          label="Save"
          severity="success"
          size="small"
          :loading="envIsSaving"
          :disabled="envDialogLoading"
          @click="saveEnvDialog"
        />
      </template>
    </Dialog>

    <!-- Automation rules dialog -->
    <PhaseAutomationRulesDialog
      v-model:visible="showRulesDialog"
      :phase="rulesEditingPhase"
      :devices="controllerDevices"
      @changed="onRulesChanged"
    />
    <DosingCalculatorDialog
      v-if="dosingCalculatorPhase?.id"
      v-model="showDosingCalculator"
      :grow-phase-id="dosingCalculatorPhase.id"
    />
  </div>
</template>

<style scoped>
.form-page {
  max-width: 880px;
  margin: 0 auto;
}

.grow-tabs {
  margin-bottom: var(--space-2);
}

.grow-tabs :deep(.p-tabpanel) {
  padding: var(--space-4) 0 0 0;
}

.grow-tabs :deep(.p-tab) {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.section-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}

.section-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text-primary);
}

.section-hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.tab-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-4);
}

@media (max-width: 768px) {
  .details-grid {
    grid-template-columns: 1fr;
  }
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

.form-hint {
  margin: var(--space-3) 0 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.full-width {
  width: 100%;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.phase-order-badge {
  background: var(--color-info);
  color: #ffffff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 700;
}

.row-actions {
  display: flex;
  gap: var(--space-1);
}

.type-pill {
  text-transform: capitalize;
  padding: 0.1875rem 0.5rem;
  background: var(--color-bg-elevated);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
  border: 1px solid var(--color-border);
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
}

.muted {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.total-summary {
  margin-top: var(--space-2);
  padding: 0.75rem var(--space-4);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  justify-content: space-between;
  font-size: var(--text-md);
}

.total-label {
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-size: var(--text-sm);
  font-weight: 500;
}

.total-value {
  color: var(--color-accent);
  font-weight: 700;
  font-family: var(--font-mono);
}

.date-range {
  display: flex;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: var(--color-bg-base);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  font-family: var(--font-mono);
}

.date-range--modal {
  margin-top: var(--space-2);
}

.date-range strong {
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-right: 0.25rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
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
}

.form-actions {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}

.field-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.time-picker-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.time-input {
  width: 80px;
}

.time-sep {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text-secondary);
}

.field-hint {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-top: 0.25rem;
}

/* Env form */
.env-form-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.env-form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.env-form-group-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
}

.field-row-3 .field {
  gap: var(--space-1);
}

.env-form-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.env-form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.env-form-subtitle {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-micro-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
  line-height: 1.2;
}

.env-coverage-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid;
}

.env-coverage-warn {
  background: color-mix(in srgb, var(--color-warn) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-warn) 40%, transparent);
  color: var(--color-text-primary);
}

.env-coverage-info {
  background: color-mix(in srgb, var(--color-info) 10%, transparent);
  border-color: color-mix(in srgb, var(--color-info) 40%, transparent);
  color: var(--color-text-primary);
}

.env-coverage-content {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.env-coverage-content > i {
  margin-top: 0.125rem;
  flex-shrink: 0;
}

.env-coverage-content > div {
  flex: 1;
  min-width: 0;
}

.env-coverage-content strong {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--text-sm);
}

.env-coverage-list {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.env-coverage-list li {
  margin: 0.125rem 0;
}

.nutrient-phase-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.nutrient-phase-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.nutrient-phase-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.nutrient-phase-order {
  background: var(--color-info);
  color: #ffffff;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 700;
}

.nutrient-phase-name {
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-text-primary);
}

.nutrient-phase-locked {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-style: italic;
}

.nutrient-phase-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.nutrient-phase-ph {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
}
</style>
