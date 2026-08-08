<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApiStore } from '../../stores/apiStore'
import { AutomationMode, DeviceType, SensorProtocol, SensorType } from '../../types/grow'
import type { Device, DeviceSeed, Sensor, SensorSeed } from '../../types/grow'
import {
  SENSOR_PIN_OPTIONS,
  SENSOR_PROTOCOL_OPTIONS,
  SENSOR_TYPE_OPTIONS,
  defaultSensorForm,
  formatSensorProtocol,
  formatSensorType,
} from '../../utils/sensors'
import { BCM_TO_PHYS } from '../../data/gpio-pins'
import { useUnsavedGuard } from '../../composables/useUnsavedGuard'
import type { CreateControllerPayload } from '../../stores/controllerStore'
import { extractApiError } from '../../utils/errors'
import { useToast } from 'primevue/usetoast'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import WiringDiagram from '../../components/WiringDiagram.vue'
import GpioPinoutDiagram from '../../components/GpioPinoutDiagram.vue'

const store = useApiStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const confirm = useConfirm()

const controllerId = computed(() => route.params.id as string | undefined)
const isEditMode = computed(() => Boolean(controllerId.value))

const form = ref({ ipAddress: '', macAddress: '', name: '' })
const initialForm = ref({ ipAddress: '', macAddress: '', name: '' })
const saving = ref(false)
const activeTab = ref<'details' | 'sensors' | 'devices'>('details')

const liveSensors = computed<Sensor[]>(
  () =>
    (
      store.controllers.find((c) => c.id === controllerId.value) as
        | ((typeof store.controllers)[number] & { sensors?: Sensor[] })
        | undefined
    )?.sensors ?? [],
)

const liveDevices = computed<Device[]>(
  () =>
    (
      store.controllers.find((c) => c.id === controllerId.value) as
        | ((typeof store.controllers)[number] & { devices?: Device[] })
        | undefined
    )?.devices ?? [],
)

const showWiring = ref(false)

// ---------- Sensors (unchanged from original) ----------

type StagedSensor = SensorSeed & { localKey: string }

const stagedSensors = ref<StagedSensor[]>([])

const sensors = computed<(Sensor | StagedSensor)[]>(() => {
  if (isEditMode.value) {
    return liveSensors.value
  }
  return stagedSensors.value
})

const showSensorModal = ref(false)
const editingSensorKey = ref<string | null>(null)
const editingIsLive = ref(false)
const sensorForm = ref(defaultSensorForm())
const openPinoutPanels = ref<string[]>([])

const editingSensor = computed(() => {
  if (!editingSensorKey.value) {
    return null
  }
  return (
    sensors.value.find(
      (s) =>
        (s as Sensor).id === editingSensorKey.value ||
        (s as StagedSensor).localKey === editingSensorKey.value,
    ) ?? null
  )
})

const isEditSensor = computed(
  () => Boolean(editingSensorKey.value) && editingIsLive.value && isEditMode.value,
)

const canSaveSensor = computed(
  () => sensorForm.value.name.trim().length > 0 && sensorForm.value.pinNumbers.length > 0,
)

let sensorLocalKeySeq = 0
function genSensorLocalKey(): string {
  return `sensor-${++sensorLocalKeySeq}`
}

function openAddSensor() {
  sensorForm.value = defaultSensorForm()
  editingSensorKey.value = null
  editingIsLive.value = false
  openPinoutPanels.value = []
  showSensorModal.value = true
}

function openEditSensor(sensor: Sensor | StagedSensor) {
  sensorForm.value = {
    name: sensor.name,
    pinNumbers: [...sensor.pinNumbers],
    protocol: sensor.protocol,
    type: sensor.type,
  }
  if ('id' in sensor && sensor.id) {
    editingSensorKey.value = sensor.id
    editingIsLive.value = true
  } else {
    editingSensorKey.value = (sensor as StagedSensor).localKey
    editingIsLive.value = false
  }
  openPinoutPanels.value = []
  showSensorModal.value = true
}

function closeSensorModal() {
  showSensorModal.value = false
  editingSensorKey.value = null
  editingIsLive.value = false
}

async function saveSensor() {
  if (!canSaveSensor.value) {
    return
  }
  const payload: SensorSeed = {
    name: sensorForm.value.name.trim(),
    pinNumbers: [...sensorForm.value.pinNumbers].toSorted((a, b) => a - b),
    protocol: sensorForm.value.protocol,
    type: sensorForm.value.type,
  }

  if (isEditMode.value && controllerId.value) {
    const controllerIdValue = controllerId.value
    try {
      if (editingIsLive.value && editingSensorKey.value) {
        await store.updateSensor(editingSensorKey.value, controllerIdValue, payload)
        toast.add({
          detail: `Sensor "${payload.name}" updated.`,
          life: 3000,
          severity: 'success',
          summary: 'Sensor saved',
        })
      } else {
        await store.createSensor({ controllerId: controllerIdValue, ...payload })
        toast.add({
          detail: `Sensor "${payload.name}" added.`,
          life: 3000,
          severity: 'success',
          summary: 'Sensor added',
        })
      }
      closeSensorModal()
    } catch (error) {
      const { message } = extractApiError(error, 'Failed to save sensor')
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
    }
    return
  }

  if (editingSensorKey.value) {
    const idx = stagedSensors.value.findIndex((s) => s.localKey === editingSensorKey.value)
    if (idx !== -1) {
      stagedSensors.value[idx] = { ...payload, localKey: editingSensorKey.value }
    }
  } else {
    stagedSensors.value.push({ ...payload, localKey: genSensorLocalKey() })
  }
  closeSensorModal()
}

function confirmDeleteSensor(sensor: Sensor | StagedSensor) {
  const { name } = sensor
  if ('id' in sensor && sensor.id && isEditMode.value && controllerId.value) {
    const { id } = sensor
    const controllerIdValue = controllerId.value
    confirm.require({
      accept: async () => {
        try {
          await store.deleteSensor(id, controllerIdValue)
          toast.add({
            detail: `Sensor "${name}" removed.`,
            life: 3000,
            severity: 'success',
            summary: 'Sensor deleted',
          })
        } catch (error) {
          const { message } = extractApiError(error, 'Failed to delete sensor')
          toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
        }
      },
      acceptLabel: 'Delete',
      acceptProps: { severity: 'danger' },
      header: 'Delete sensor',
      icon: 'pi pi-exclamation-triangle',
      message: `This will permanently remove "${name}" and cascade to its telemetry history. This cannot be undone.`,
      rejectLabel: 'Cancel',
    })
  } else {
    const { localKey } = sensor as StagedSensor
    confirm.require({
      accept: () => {
        stagedSensors.value = stagedSensors.value.filter((s) => s.localKey !== localKey)
      },
      acceptLabel: 'Remove',
      acceptProps: { severity: 'danger' },
      header: 'Remove staged sensor',
      icon: 'pi pi-exclamation-triangle',
      message: `Remove "${name}" from the staged sensors for this controller?`,
      rejectLabel: 'Cancel',
    })
  }
}

// ---------- Devices ----------

type StagedDevice = DeviceSeed & { localKey: string }

const stagedDevices = ref<StagedDevice[]>([])

const isDirty = computed(
  () =>
    form.value.name !== initialForm.value.name ||
    form.value.ipAddress !== initialForm.value.ipAddress ||
    (isEditMode.value
      ? form.value.macAddress !== initialForm.value.macAddress
      : form.value.macAddress.trim().length > 0) ||
    stagedSensors.value.length > 0 ||
    stagedDevices.value.length > 0,
)
useUnsavedGuard(isDirty)

const devices = computed<(Device | StagedDevice)[]>(() => {
  if (isEditMode.value) {
    return liveDevices.value
  }
  return stagedDevices.value
})

const showDeviceModal = ref(false)
const editingDeviceKey = ref<string | null>(null)
const editingDeviceIsLive = ref(false)
const deviceForm = ref({
  automationMode: AutomationMode.MANUAL,
  isActive: true,
  maxOnSeconds: null as number | null,
  name: '',
  pinNumber: null as number | null,
  type: DeviceType.LIGHT,
})
const openDevicePinoutPanels = ref<string[]>([])

const devicePinOptions = computed<{ label: string; value: number }[]>(() =>
  [...BCM_TO_PHYS.entries()]
    .map(([bcm, phys]) => ({ label: `BCM ${bcm} (pin ${phys})`, value: bcm }))
    .toSorted((a, b) => a.value - b.value),
)

const editingDevice = computed(() => {
  if (!editingDeviceKey.value) {
    return null
  }
  return (
    devices.value.find(
      (d) =>
        (d as Device).id === editingDeviceKey.value ||
        (d as StagedDevice).localKey === editingDeviceKey.value,
    ) ?? null
  )
})

const isEditDevice = computed(
  () => Boolean(editingDeviceKey.value) && editingDeviceIsLive.value && isEditMode.value,
)

const canSaveDevice = computed(
  () =>
    deviceForm.value.name.trim().length > 0 &&
    deviceForm.value.pinNumber !== null &&
    deviceForm.value.type !== undefined,
)

const deviceTypeOptions = Object.values(DeviceType).map((t) => ({
  label: t.replaceAll('_', ' '),
  value: t,
}))

const automationModeOptions = Object.values(AutomationMode).map((m) => ({
  label: m.replaceAll('_', ' '),
  value: m,
}))

const automationModeOptionsForType = computed(() => {
  if (deviceForm.value.type === DeviceType.LIGHT) {
    return automationModeOptions.filter((o) => o.value !== AutomationMode.THRESHOLD)
  }
  return automationModeOptions
})

let deviceLocalKeySeq = 0
function genDeviceLocalKey(): string {
  return `device-${++deviceLocalKeySeq}`
}

function openAddDevice() {
  deviceForm.value = {
    automationMode: AutomationMode.MANUAL,
    isActive: true,
    maxOnSeconds: null,
    name: '',
    pinNumber: null,
    type: DeviceType.LIGHT,
  }
  editingDeviceKey.value = null
  editingDeviceIsLive.value = false
  openDevicePinoutPanels.value = []
  showDeviceModal.value = true
}

function openEditDevice(device: Device | StagedDevice) {
  deviceForm.value = {
    automationMode: device.automationMode ?? AutomationMode.MANUAL,
    isActive: device.isActive ?? true,
    maxOnSeconds: device.maxOnSeconds ?? null,
    name: device.name,
    pinNumber: device.pinNumber,
    type: device.type,
  }
  if ('id' in device && device.id) {
    editingDeviceKey.value = device.id
    editingDeviceIsLive.value = true
  } else {
    editingDeviceKey.value = (device as StagedDevice).localKey
    editingDeviceIsLive.value = false
  }
  openDevicePinoutPanels.value = []
  showDeviceModal.value = true
}

function closeDeviceModal() {
  showDeviceModal.value = false
  editingDeviceKey.value = null
  editingDeviceIsLive.value = false
}

async function saveDevice() {
  if (!canSaveDevice.value || deviceForm.value.pinNumber === null) {
    return
  }
  const payload: DeviceSeed = {
    automationMode: deviceForm.value.automationMode,
    isActive: deviceForm.value.isActive,
    maxOnSeconds:
      deviceForm.value.maxOnSeconds !== null && Number.isFinite(deviceForm.value.maxOnSeconds)
        ? deviceForm.value.maxOnSeconds
        : null,
    name: deviceForm.value.name.trim(),
    pinNumber: deviceForm.value.pinNumber,
    type: deviceForm.value.type,
  }

  if (isEditMode.value && controllerId.value) {
    const controllerIdValue = controllerId.value
    try {
      if (editingDeviceIsLive.value && editingDeviceKey.value) {
        await store.updateDevice(editingDeviceKey.value, controllerIdValue, payload)
        toast.add({
          detail: `Device "${payload.name}" updated.`,
          life: 3000,
          severity: 'success',
          summary: 'Device saved',
        })
      } else {
        await store.createDevice({ controllerId: controllerIdValue, ...payload })
        toast.add({
          detail: `Device "${payload.name}" added.`,
          life: 3000,
          severity: 'success',
          summary: 'Device added',
        })
      }
      closeDeviceModal()
    } catch (error) {
      const { message } = extractApiError(error, 'Failed to save device')
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
    }
    return
  }

  if (editingDeviceKey.value) {
    const idx = stagedDevices.value.findIndex((d) => d.localKey === editingDeviceKey.value)
    if (idx !== -1) {
      stagedDevices.value[idx] = { ...payload, localKey: editingDeviceKey.value }
    }
  } else {
    stagedDevices.value.push({ ...payload, localKey: genDeviceLocalKey() })
  }
  closeDeviceModal()
}

function confirmDeleteDevice(device: Device | StagedDevice) {
  const { name } = device
  if ('id' in device && device.id && isEditMode.value && controllerId.value) {
    const { id } = device
    const controllerIdValue = controllerId.value
    confirm.require({
      accept: async () => {
        try {
          await store.deleteDevice(id, controllerIdValue)
          toast.add({
            detail: `Device "${name}" removed.`,
            life: 3000,
            severity: 'success',
            summary: 'Device deleted',
          })
        } catch (error) {
          const { message } = extractApiError(error, 'Failed to delete device')
          toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
        }
      },
      acceptLabel: 'Delete',
      acceptProps: { severity: 'danger' },
      header: 'Delete device',
      icon: 'pi pi-exclamation-triangle',
      message: `This will permanently remove "${name}" and its command history. This cannot be undone.`,
      rejectLabel: 'Cancel',
    })
  } else {
    const { localKey } = device as StagedDevice
    confirm.require({
      accept: () => {
        stagedDevices.value = stagedDevices.value.filter((d) => d.localKey !== localKey)
      },
      acceptLabel: 'Remove',
      acceptProps: { severity: 'danger' },
      header: 'Remove staged device',
      icon: 'pi pi-exclamation-triangle',
      message: `Remove "${name}" from the staged devices for this controller?`,
      rejectLabel: 'Cancel',
    })
  }
}

// ---------- Lifecycle ----------

onMounted(async () => {
  await store.fetchAll()
  if (isEditMode.value && controllerId.value) {
    const existing = store.controllers.find((c) => c.id === controllerId.value)
    if (existing) {
      form.value = {
        ipAddress: existing.ipAddress,
        macAddress: existing.macAddress,
        name: existing.name,
      }
    }
    await store.fetchController(controllerId.value)
    await store.fetchDevices(controllerId.value)
  }
  initialForm.value = { ...form.value }
})

async function handleSave() {
  if (saving.value) {
    return
  }
  saving.value = true
  try {
    if (isEditMode.value && controllerId.value) {
      await store.updateController(controllerId.value, form.value)
      initialForm.value = { ...form.value }
      router.push('/admin')
      return
    }

    const payload: CreateControllerPayload = {
      ipAddress: form.value.ipAddress,
      macAddress: form.value.macAddress,
      name: form.value.name,
    }
    if (stagedSensors.value.length > 0) {
      payload.sensors = stagedSensors.value.map((s) => ({
        name: s.name,
        pinNumbers: s.pinNumbers,
        protocol: s.protocol,
        type: s.type,
      }))
    }

    const created = await store.createController(payload)
    let deviceFailures = 0
    if (stagedDevices.value.length > 0) {
      try {
        await store.createDevicesBatch(
          created.id,
          stagedDevices.value.map((d) => ({
            automationMode: d.automationMode,
            isActive: d.isActive,
            maxOnSeconds: d.maxOnSeconds ?? null,
            name: d.name,
            pinNumber: d.pinNumber,
            type: d.type,
          })),
        )
      } catch (error) {
        deviceFailures = stagedDevices.value.length
        const { message } = extractApiError(error, 'Failed to create staged devices')
        toast.add({
          detail: `${message} The controller was created — open it in edit mode to retry the devices.`,
          life: 8000,
          severity: 'warn',
          summary: `${deviceFailures} device${deviceFailures === 1 ? '' : 's'} not created`,
        })
      }
    }
    if (stagedSensors.value.length > 0 && !created.sensors?.length) {
      toast.add({
        detail:
          'A controller with this MAC address already exists, so the staged sensors were not applied. Open the controller in edit mode to manage its sensors.',
        life: 8000,
        severity: 'warn',
        summary: 'Sensors not seeded',
      })
    }
    if (deviceFailures === 0) {
      initialForm.value = { ...form.value }
      router.push('/admin')
    }
    return
  } catch (error) {
    const { message } = extractApiError(error, 'Failed to create controller')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Create failed' })
    return
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ConfirmDialog />
  <div class="form-page">
    <Card>
      <template #title>
        {{ isEditMode ? 'Controller' : 'New Controller' }}
      </template>
      <template #content>
        <Tabs v-model:value="activeTab" class="controller-tabs">
          <TabList>
            <Tab value="details">
              <i class="pi pi-info-circle" />
              <span>Details</span>
            </Tab>
            <Tab value="sensors">
              <i class="pi pi-bolt" />
              <span>Sensors</span>
            </Tab>
            <Tab v-if="isEditMode" value="devices">
              <i class="pi pi-cog" />
              <span>Devices</span>
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel value="details">
              <div class="form-stack">
                <div class="field">
                  <label for="ctrl-name" class="field-label">Name</label>
                  <InputText
                    id="ctrl-name"
                    v-model="form.name"
                    placeholder="Tent 1 Raspberry Pi"
                    class="full-width"
                  />
                </div>
                <div class="field">
                  <label for="ctrl-mac" class="field-label">MAC Address</label>
                  <InputText
                    id="ctrl-mac"
                    v-model="form.macAddress"
                    placeholder="00:1A:2B:3C:4D:5E"
                    :disabled="isEditMode"
                    class="full-width"
                  />
                </div>
                <div class="field">
                  <label for="ctrl-ip" class="field-label">IP Address</label>
                  <InputText
                    id="ctrl-ip"
                    v-model="form.ipAddress"
                    placeholder="192.168.0.105"
                    class="full-width"
                  />
                </div>
                <p v-if="!isEditMode" class="form-hint">
                  Staged sensors and devices on the <strong>Sensors</strong> and
                  <strong>Devices</strong> tabs will be created atomically with this controller.
                  Re-registering an existing MAC will ignore staged data.
                </p>
                <div class="form-actions">
                  <Button label="Cancel" severity="secondary" @click="router.push('/admin')" />
                  <Button
                    :label="isEditMode ? 'Save Changes' : 'Create'"
                    :loading="saving"
                    @click="handleSave"
                  />
                </div>
              </div>
            </TabPanel>

            <TabPanel value="sensors">
              <div class="sensors-tab">
                <div class="section-header">
                  <div>
                    <h3 class="section-title">Sensors</h3>
                    <p class="section-subtitle">
                      <template v-if="isEditMode">
                        {{ sensors.length }} wired to this controller.
                      </template>
                      <template v-else>
                        {{ sensors.length }} staged for creation. New sensors are added live after
                        the controller is registered.
                      </template>
                    </p>
                  </div>
                  <Button
                    label="Add Sensor"
                    icon="pi pi-plus"
                    size="small"
                    severity="success"
                    @click="openAddSensor"
                  />
                </div>

                <DataTable v-if="sensors.length > 0" :value="sensors" size="small">
                  <Column field="name" header="Name" sortable style="font-weight: 600" />
                  <Column header="Type" sortable>
                    <template #body="slotProps">
                      <span class="type-pill">
                        {{ formatSensorType(slotProps.data.type) }}
                      </span>
                    </template>
                  </Column>
                  <Column header="Protocol" sortable>
                    <template #body="slotProps">
                      <span class="type-pill">
                        {{ formatSensorProtocol(slotProps.data.protocol) }}
                      </span>
                    </template>
                  </Column>
                  <Column header="GPIO Pins">
                    <template #body="slotProps">
                      <div class="pin-chips">
                        <code v-for="pin in slotProps.data.pinNumbers" :key="pin" class="meta-code">
                          {{ pin }}
                        </code>
                      </div>
                    </template>
                  </Column>
                  <Column v-if="isEditMode" header="Last Active">
                    <template #body="slotProps">
                      <span v-if="slotProps.data.lastActive" class="meta-code">
                        {{ slotProps.data.lastActive }}
                      </span>
                      <span v-else class="muted">—</span>
                    </template>
                  </Column>
                  <Column header="Actions" style="width: 120px">
                    <template #body="slotProps">
                      <div class="row-actions">
                        <Button
                          icon="pi pi-pencil"
                          severity="secondary"
                          text
                          rounded
                          size="small"
                          aria-label="Edit"
                          @click="openEditSensor(slotProps.data)"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          size="small"
                          aria-label="Delete"
                          @click="confirmDeleteSensor(slotProps.data)"
                        />
                      </div>
                    </template>
                  </Column>
                </DataTable>

                <div v-else class="empty-state">
                  <span class="pi pi-bolt empty-icon" />
                  <p>
                    No sensors configured. Click <strong>Add Sensor</strong> to wire a new probe to
                    this controller.
                  </p>
                </div>
              </div>
            </TabPanel>

            <TabPanel v-if="isEditMode" value="devices">
              <div class="devices-tab">
                <div class="section-header">
                  <div>
                    <h3 class="section-title">Devices</h3>
                    <p class="section-subtitle">
                      {{ liveDevices.length }} persistent hardware
                      {{ liveDevices.length === 1 ? 'device' : 'devices' }} wired to this
                      controller.
                    </p>
                  </div>
                  <div class="toolbar-actions">
                    <Button
                      v-if="liveDevices.length > 0"
                      icon="pi pi-sitemap"
                      label="Wiring"
                      severity="secondary"
                      size="small"
                      text
                      rounded
                      v-tooltip.top="'View generated wiring diagram'"
                      @click="showWiring = true"
                    />
                    <Button
                      label="Add Device"
                      icon="pi pi-plus"
                      size="small"
                      severity="success"
                      @click="openAddDevice"
                    />
                  </div>
                </div>

                <DataTable v-if="devices.length > 0" :value="devices" size="small">
                  <Column field="name" header="Name" sortable style="font-weight: 600" />
                  <Column field="type" header="Type" sortable>
                    <template #body="slotProps">
                      <span class="type-pill">
                        {{ slotProps.data.type.replace(/_/g, ' ') }}
                      </span>
                    </template>
                  </Column>
                  <Column field="pinNumber" header="GPIO Pin" sortable>
                    <template #body="slotProps">
                      <code class="meta-code">{{ slotProps.data.pinNumber }}</code>
                    </template>
                  </Column>
                  <Column header="Mode" sortable>
                    <template #body="slotProps">
                      <span class="type-pill">
                        {{ (slotProps.data.automationMode ?? 'MANUAL').replace(/_/g, ' ') }}
                      </span>
                    </template>
                  </Column>
                  <Column field="isActive" header="Active" sortable>
                    <template #body="slotProps">
                      <Tag
                        :value="slotProps.data.isActive ? 'Active' : 'Inactive'"
                        :severity="slotProps.data.isActive ? 'success' : 'secondary'"
                        rounded
                      />
                    </template>
                  </Column>
                  <Column header="Actions" style="width: 120px">
                    <template #body="slotProps">
                      <div class="row-actions">
                        <Button
                          icon="pi pi-pencil"
                          severity="secondary"
                          text
                          rounded
                          size="small"
                          aria-label="Edit"
                          @click="openEditDevice(slotProps.data)"
                        />
                        <Button
                          icon="pi pi-trash"
                          severity="danger"
                          text
                          rounded
                          size="small"
                          aria-label="Delete"
                          @click="confirmDeleteDevice(slotProps.data)"
                        />
                      </div>
                    </template>
                  </Column>
                </DataTable>

                <div v-else-if="!isEditMode && stagedDevices.length === 0" class="empty-state">
                  <span class="pi pi-box empty-icon" />
                  <p>
                    No devices staged. Use <strong>Add Device</strong> to provision hardware for
                    this controller.
                  </p>
                </div>
                <div v-else class="empty-state">
                  <span class="pi pi-box empty-icon" />
                  <p>No devices wired to this controller yet. Add one above.</p>
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </template>
    </Card>

    <Dialog
      v-model:visible="showSensorModal"
      :header="
        isEditSensor ? 'Edit Sensor' : editingSensorKey ? 'Edit Staged Sensor' : 'Add Sensor'
      "
      :style="{ width: '90vw', maxWidth: '640px' }"
      modal
      dismissable-mask
      class="sensor-modal"
    >
      <div class="form-stack">
        <div class="field">
          <label for="sensor-name" class="field-label">Name</label>
          <InputText
            id="sensor-name"
            v-model="sensorForm.name"
            placeholder="Tent 1 Climate Sensor"
            class="full-width"
          />
        </div>

        <div class="field-row">
          <div class="field">
            <label for="sensor-type" class="field-label">Type</label>
            <Select
              id="sensor-type"
              v-model="sensorForm.type"
              :options="SENSOR_TYPE_OPTIONS"
              optionLabel="label"
              optionValue="value"
              placeholder="Select type"
              class="full-width"
            />
          </div>
          <div class="field">
            <label for="sensor-protocol" class="field-label">Protocol</label>
            <Select
              id="sensor-protocol"
              v-model="sensorForm.protocol"
              :options="SENSOR_PROTOCOL_OPTIONS"
              optionLabel="label"
              optionValue="value"
              placeholder="Select protocol"
              class="full-width"
            />
          </div>
        </div>

        <div class="field">
          <label for="sensor-pins" class="field-label">GPIO Pins</label>
          <MultiSelect
            id="sensor-pins"
            v-model="sensorForm.pinNumbers"
            :options="SENSOR_PIN_OPTIONS"
            optionLabel="label"
            optionValue="value"
            placeholder="Select physical pins (1–40)"
            class="full-width"
            display="chip"
            :max-selected-labels="6"
          />
        </div>

        <Accordion v-model:value="openPinoutPanels" class="pinout-accordion">
          <AccordionPanel value="pinout">
            <AccordionHeader>
              <span class="pinout-accordion__title">
                <i class="pi pi-map pinout-accordion__icon" />
                GPIO Pinout Reference
              </span>
            </AccordionHeader>
            <AccordionContent>
              <p class="pinout-hint">
                Reference for choosing physical pins (1–40) on the Raspberry Pi header. Match the
                bus family to your sensor protocol (I²C, SPI, UART).
              </p>
              <GpioPinoutDiagram />
            </AccordionContent>
          </AccordionPanel>
        </Accordion>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="closeSensorModal" />
        <Button
          :label="isEditSensor ? 'Save Changes' : editingSensorKey ? 'Update Staged' : 'Add Sensor'"
          :disabled="!canSaveSensor"
          @click="saveSensor"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showDeviceModal"
      :header="
        isEditDevice ? 'Edit Device' : editingDeviceKey ? 'Edit Staged Device' : 'Add Device'
      "
      :style="{ width: '90vw', maxWidth: '560px' }"
      modal
      dismissable-mask
      class="device-modal"
    >
      <div class="form-stack">
        <div class="field">
          <label for="dev-name" class="field-label">Device Name</label>
          <InputText
            id="dev-name"
            v-model="deviceForm.name"
            placeholder="SpiderFarmer SF2000"
            class="full-width"
          />
        </div>

        <div class="field-row">
          <div class="field">
            <label for="dev-type" class="field-label">Type</label>
            <Select
              id="dev-type"
              v-model="deviceForm.type"
              :options="deviceTypeOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Select type"
              class="full-width"
            />
          </div>
          <div class="field">
            <label for="dev-mode" class="field-label">Automation Mode</label>
            <Select
              id="dev-mode"
              v-model="deviceForm.automationMode"
              :options="automationModeOptionsForType"
              optionLabel="label"
              optionValue="value"
              placeholder="Select mode"
              class="full-width"
            />
          </div>
        </div>

        <div v-if="deviceForm.type === DeviceType.LIGHT" class="light-info">
          <i class="pi pi-info-circle light-info__icon" />
          <div class="light-info__body">
            <strong><i class="pi pi-lightbulb" /> Light scheduling is automatic.</strong>
            Configure the photoperiod on this device's active grow phase (<code
              >dayStartMinutes</code
            >
            / <code>dayDurationMinutes</code>). The server's 60s scheduler will turn the light ON at
            day start and OFF at night. Use <em>Scheduled</em> for clock-driven behaviour,
            <em>Always On / Always Off</em> to pin regardless of the clock, and avoid
            <em>Threshold</em> for lights (no automation rules can target a light).
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label for="dev-pin" class="field-label">GPIO Pin (BCM)</label>
            <Select
              id="dev-pin"
              v-model="deviceForm.pinNumber"
              :options="devicePinOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Select BCM GPIO pin"
              class="full-width"
              filter
            />
          </div>
          <div class="field">
            <label for="dev-active" class="field-label">Initial State</label>
            <Select
              id="dev-active"
              v-model="deviceForm.isActive"
              :options="[
                { label: 'Active', value: true },
                { label: 'Inactive', value: false },
              ]"
              optionLabel="label"
              optionValue="value"
              class="full-width"
            />
          </div>
        </div>

        <div class="field">
          <label for="dev-max-on" class="field-label">
            Max Continuous ON (seconds)
            <span class="field-hint"
              >— optional safety ceiling; leave empty for the server default</span
            >
          </label>
          <InputNumber
            id="dev-max-on"
            v-model="deviceForm.maxOnSeconds"
            :data-testid="'dev-max-on'"
            :min="0"
            :max="86400"
            placeholder="e.g. 3600"
            class="full-width"
          />
        </div>

        <Accordion v-model:value="openDevicePinoutPanels" class="pinout-accordion">
          <AccordionPanel value="pinout">
            <AccordionHeader>
              <span class="pinout-accordion__title">
                <i class="pi pi-map pinout-accordion__icon" />
                GPIO Pinout Reference
              </span>
            </AccordionHeader>
            <AccordionContent>
              <p class="pinout-hint">
                Use the BCM GPIO number (not the physical pin position). For example, enter
                <code>4</code> for the standard GCLK pin on physical pin 7.
              </p>
              <GpioPinoutDiagram />
              <ul class="pinout-legend">
                <li class="legend-group">
                  <span class="legend-group__title">Pin types</span>
                  <span class="legend-group__items">
                    <span class="legend-item"><span class="swatch swatch--gpio" /> BCM GPIO</span>
                    <span class="legend-item"><span class="swatch swatch--3v3" /> 3.3 V</span>
                    <span class="legend-item"><span class="swatch swatch--5v" /> 5 V</span>
                    <span class="legend-item"><span class="swatch swatch--gnd" /> Ground</span>
                    <span class="legend-item"
                      ><span class="swatch swatch--id" /> Reserved (ID EEPROM)</span
                    >
                  </span>
                </li>
                <li class="legend-group">
                  <span class="legend-group__title">Bus functions</span>
                  <span class="legend-group__items">
                    <span class="legend-item"
                      ><span class="swatch swatch--i2c" /> I²C · SDA/SCL</span
                    >
                    <span class="legend-item"
                      ><span class="swatch swatch--spi" /> SPI · CE/MOSI/MISO/SCLK</span
                    >
                    <span class="legend-item"
                      ><span class="swatch swatch--uart" /> UART · TXD/RXD</span
                    >
                    <span class="legend-item"
                      ><span class="swatch swatch--pwm" /> PWM · PWM0/PWM1</span
                    >
                  </span>
                </li>
              </ul>
            </AccordionContent>
          </AccordionPanel>
        </Accordion>
      </div>

      <template #footer>
        <Button label="Cancel" severity="secondary" size="small" @click="closeDeviceModal" />
        <Button
          :label="isEditDevice ? 'Save Changes' : editingDeviceKey ? 'Update Staged' : 'Add Device'"
          icon="pi pi-plus"
          severity="success"
          size="small"
          :disabled="!canSaveDevice"
          @click="saveDevice"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="showWiring"
      header="Controller Wiring Diagram"
      :style="{ width: '90vw', maxWidth: '1100px' }"
      modal
      dismissable-mask
    >
      <WiringDiagram :devices="liveDevices" />
    </Dialog>
  </div>
</template>

<style scoped>
.form-page {
  width: 100%;
}

.controller-tabs :deep(.p-tablist) {
  margin-bottom: var(--space-5);
}

.controller-tabs :deep(.p-tab) {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

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

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

.field-label {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.field-hint {
  font-weight: 400;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin-left: var(--space-2);
}

.full-width {
  width: 100%;
}

.light-info {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-left: 3px solid var(--color-info-500, #3b82f6);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.light-info__icon {
  font-size: 1.125rem;
  color: var(--color-info-500, #3b82f6);
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.light-info__body {
  flex: 1;
}

.light-info__body code {
  background: var(--color-code-bg);
  padding: 0.0625rem 0.3125rem;
  border-radius: var(--radius-sm);
  font-size: 0.85em;
  color: var(--color-code-text);
  border: 1px solid var(--color-border-subtle);
}

.form-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin: 0;
}

.form-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  margin-top: var(--space-2);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.section-title {
  margin: 0;
  font-size: var(--text-md);
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-subtitle {
  margin: 0.125rem 0 0 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.muted {
  font-size: var(--text-base);
  color: var(--color-text-muted);
  font-weight: 500;
  font-family: var(--font-mono);
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
}

.pin-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.row-actions {
  display: flex;
  gap: var(--space-1);
}

.toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
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
}

.empty-icon {
  font-size: 2rem;
  margin-bottom: var(--space-3);
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
}

.pinout-accordion :deep(.p-accordionheader) {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.pinout-accordion__title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.pinout-accordion__icon {
  color: var(--color-accent);
}

.pinout-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 var(--space-3) 0;
}

.pinout-hint code {
  font-family: var(--font-mono);
  background: var(--color-code-bg);
  color: var(--color-code-text);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  font-size: var(--text-sm);
}

.pinout-legend {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding: 0;
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.legend-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.legend-group__title {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.legend-group__items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
}

.swatch--gpio {
  border-color: var(--color-accent);
  background: var(--color-accent-bg);
}

.swatch--3v3 {
  border-color: var(--color-info);
  background: var(--color-info-bg);
}

.swatch--5v {
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.swatch--gnd {
  border-color: var(--color-text-muted);
}

.swatch--id {
  border-color: var(--color-warning);
  background: rgba(245, 158, 11, 0.06);
  border-style: dashed;
}

.swatch--i2c {
  border-color: var(--color-bus-i2c-border);
  background: var(--color-bus-i2c-bg);
}

.swatch--spi {
  border-color: var(--color-bus-spi-border);
  background: var(--color-bus-spi-bg);
}

.swatch--uart {
  border-color: var(--color-bus-uart-border);
  background: var(--color-bus-uart-bg);
}

.swatch--pwm {
  border-color: var(--color-bus-pwm-border);
  background: var(--color-bus-pwm-bg);
}
</style>
