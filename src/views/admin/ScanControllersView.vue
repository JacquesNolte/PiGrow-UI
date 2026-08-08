<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApiStore } from '../../stores/apiStore'
import { useToast } from 'primevue/usetoast'
import { extractApiError } from '../../utils/errors'
import type { ClaimRequest, DiscoveredController } from '../../types/grow'
import Button from 'primevue/button'
import Card from 'primevue/card'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'

const SCAN_INTERVAL_MS = 2_000
const SCAN_DURATION_MS = 30_000
const PIN_LENGTH = 6

const store = useApiStore()
const router = useRouter()
const toast = useToast()

interface RowState {
  controller: DiscoveredController
  pin: string
  claiming: boolean
  error: string | null
}

const rows = ref<RowState[]>([])
const scanError = ref<string | null>(null)
const scanning = ref(false)
const scanStartedAt = ref<number | null>(null)
const scansCompleted = ref(0)
const nowMs = ref(0)
const announce = ref('')

let scanTimer: ReturnType<typeof setInterval> | null = null
let stopTimer: ReturnType<typeof setTimeout> | null = null

const elapsedSeconds = computed(() => {
  if (scanStartedAt.value === null) {
    return 0
  }
  return Math.min(SCAN_DURATION_MS / 1000, Math.floor((nowMs.value - scanStartedAt.value) / 1000))
})

const remainingSeconds = computed(() => Math.max(0, SCAN_DURATION_MS / 1000 - elapsedSeconds.value))

function applyScanResults(results: DiscoveredController[]) {
  const seenMacs = new Set<string>()
  for (const controller of results) {
    seenMacs.add(controller.mac)
    const existing = rows.value.find((r) => r.controller.mac === controller.mac)
    if (existing) {
      existing.controller = controller
    } else {
      rows.value.push({
        claiming: false,
        controller,
        error: null,
        pin: '',
      })
    }
  }
  rows.value = rows.value.filter((r) => seenMacs.has(r.controller.mac))
}

function clearTimers() {
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
  if (stopTimer) {
    clearTimeout(stopTimer)
    stopTimer = null
  }
}

async function runScan() {
  nowMs.value = Date.now()
  try {
    const res = await store.scanControllers()
    scansCompleted.value += 1
    applyScanResults(res.controllers)
    scanError.value = null
  } catch (error) {
    const { message } = extractApiError(error, 'Scan failed')
    scanError.value = message
  }
}

function startScanning() {
  scanning.value = true
  scanStartedAt.value = Date.now()
  nowMs.value = scanStartedAt.value
  scansCompleted.value = 0
  scanError.value = null
  rows.value = []
  void runScan()
  scanTimer = setInterval(() => {
    if (!scanning.value) {
      return
    }
    void runScan()
  }, SCAN_INTERVAL_MS)
  stopTimer = setTimeout(() => {
    stopScanning()
  }, SCAN_DURATION_MS)
}

function stopScanning() {
  scanning.value = false
  scanStartedAt.value = null
  clearTimers()
}

function pinIsComplete(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

async function claim(row: RowState) {
  if (row.claiming) {
    return
  }
  if (!pinIsComplete(row.pin)) {
    row.error = `PIN must be ${PIN_LENGTH} digits.`
    return
  }
  if (!row.controller.pinActive) {
    row.error = 'PIN expired — waiting for the Pi to issue a new one.'
    return
  }
  row.claiming = true
  row.error = null
  const payload: ClaimRequest = {
    claimPin: row.pin,
    mac: row.controller.mac,
    name: row.controller.serial,
  }
  try {
    const claimed = await store.claimController(payload)
    stopScanning()
    toast.add({
      detail: `Controller "${claimed.name}" registered.`,
      life: 3000,
      severity: 'success',
      summary: 'Claimed',
    })
    announce.value = 'Controller claimed, opening configuration…'
    await router.push(`/admin/controllers/edit/${claimed.id}`)
  } catch (error) {
    const { status, message } = extractApiError(error, 'Claim failed')
    row.error =
      status === 401
        ? 'Wrong or expired PIN.'
        : status === 404
          ? 'Controller not visible to the server — try scanning again.'
          : message
  } finally {
    row.claiming = false
  }
}

function onPinInput(row: RowState, event: Event) {
  const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, PIN_LENGTH)
  row.pin = value
  if (row.error) {
    row.error = null
  }
}

function dismiss() {
  stopScanning()
  void router.push('/admin')
}

onMounted(() => {
  startScanning()
})

onBeforeUnmount(() => {
  stopScanning()
})

defineExpose({
  claim,
  onPinInput,
  pinIsComplete,
  rows,
  scanning,
  scansCompleted,
  startScanning,
  stopScanning,
})
</script>

<template>
  <div class="scan-page">
    <span class="visually-hidden" role="status" aria-live="polite">{{ announce }}</span>
    <Card>
      <template #title>
        <div class="section-header">
          <span>Scan for Controllers</span>
          <div class="header-actions">
            <Tag v-if="scanning" :value="`Scanning… ${elapsedSeconds}s`" severity="info" rounded />
            <Tag
              v-if="scanning && elapsedSeconds > 20"
              :value="`Scan ending in ${remainingSeconds}s`"
              severity="warn"
              rounded
            />
            <Tag v-else-if="!scanning" value="Scan stopped" severity="secondary" rounded />
            <Button
              v-if="!scanning"
              label="Scan Again"
              icon="pi pi-refresh"
              size="small"
              severity="success"
              @click="startScanning"
            />
          </div>
        </div>
      </template>
      <template #content>
        <Message v-if="scanError" severity="error" :closable="false" class="scan-error">
          {{ scanError }}
        </Message>
        <p class="form-hint">
          Looking for unclaimed Raspberry Pis on your LAN. Each Pi advertises a 6-digit claim PIN
          that rotates every 5 minutes — type the PIN shown on the device's serial console (or mDNS
          TXT record) and click <strong>Claim</strong>. The hardware manifest is applied
          automatically; you can rename the controller on the next screen.
        </p>
        <DataTable
          v-if="rows.length > 0"
          :value="rows"
          data-key="controller.mac"
          size="small"
          class="scan-table"
        >
          <Column field="controller.serial" header="Serial" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.controller.serial }}</code>
            </template>
          </Column>
          <Column field="controller.ip" header="IP" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.controller.ip }}</code>
            </template>
          </Column>
          <Column field="controller.mac" header="MAC" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.controller.mac }}</code>
            </template>
          </Column>
          <Column field="controller.fwVersion" header="Firmware" sortable>
            <template #body="slotProps">
              <code class="meta-code">{{ slotProps.data.controller.fwVersion }}</code>
            </template>
          </Column>
          <Column header="Hardware">
            <template #body="slotProps">
              <div class="hw-counts">
                <Tag
                  :value="`${slotProps.data.controller.hwManifest.sensors.length} sensors`"
                  severity="secondary"
                  rounded
                />
                <Tag
                  :value="`${slotProps.data.controller.hwManifest.relays.length} relays`"
                  severity="secondary"
                  rounded
                />
              </div>
            </template>
          </Column>
          <Column header="PIN Status">
            <template #body="slotProps">
              <Tag
                v-if="slotProps.data.controller.pinActive"
                value="PIN active"
                severity="success"
                rounded
              />
              <Tag v-else value="PIN expired, waiting…" severity="warn" rounded />
            </template>
          </Column>
          <Column header="Claim PIN" style="min-width: 200px">
            <template #body="slotProps">
              <InputText
                :model-value="slotProps.data.pin"
                :disabled="!slotProps.data.controller.pinActive || slotProps.data.claiming"
                :placeholder="'123456'"
                inputmode="numeric"
                maxlength="6"
                class="pin-input"
                @input="onPinInput(slotProps.data, $event)"
              />
            </template>
          </Column>
          <Column header="Actions" style="width: 160px">
            <template #body="slotProps">
              <Button
                label="Claim"
                icon="pi pi-check"
                size="small"
                severity="success"
                :loading="slotProps.data.claiming"
                :disabled="
                  !slotProps.data.controller.pinActive ||
                  slotProps.data.claiming ||
                  !pinIsComplete(slotProps.data.pin)
                "
                @click="claim(slotProps.data)"
              />
            </template>
          </Column>
        </DataTable>

        <div v-if="rows.length === 0 && !scanning" class="empty-state">
          <span class="pi pi-search empty-icon" />
          <p>No unclaimed Pis reported. Make sure the device is powered on and on the same LAN.</p>
        </div>
        <div v-else-if="rows.length === 0" class="empty-state">
          <span class="pi pi-spin pi-spinner empty-icon" />
          <p>Listening for ProvisionBeacons…</p>
        </div>

        <div v-if="rows.length > 0" class="row-errors">
          <Message
            v-for="row in rows.filter((r) => r.error)"
            :key="`err-${row.controller.mac}`"
            severity="error"
            :closable="true"
            class="row-error"
            @close="row.error = null"
          >
            <strong>{{ row.controller.serial }}:</strong> {{ row.error }}
          </Message>
        </div>

        <div class="form-actions">
          <Button label="Done" severity="secondary" @click="dismiss" />
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.scan-page {
  width: 100%;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: var(--space-3);
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.scan-error {
  margin-bottom: var(--space-3);
}

.form-hint {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-4) 0;
}

.scan-table {
  margin-bottom: var(--space-4);
}

.hw-counts {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.pin-input {
  width: 8rem;
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
}

.row-errors {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.row-error {
  width: 100%;
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
  margin-bottom: var(--space-4);
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.meta-code {
  background: var(--color-code-bg);
  padding: 0.1875rem 0.4375rem;
  border-radius: var(--radius-sm);
  color: var(--color-code-text);
  font-size: var(--text-sm);
  border: 1px solid var(--color-border);
}
</style>
