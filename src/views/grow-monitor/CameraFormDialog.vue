<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useApiStore } from '../../stores/apiStore'
import { CameraConflictError } from '../../stores/cameraStore'
import { useToast } from 'primevue/usetoast'
import { extractApiError } from '../../utils/errors'
import type { Camera, CreateCameraPayload, UpdateCameraPayload } from '../../types/grow'

const props = defineProps<{
  visible: boolean
  camera: Camera | null
  defaultControllerId: string | null
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean]; saved: [] }>()

const store = useApiStore()
const toast = useToast()

const isEdit = computed(() => props.camera !== null)

const name = ref('')
const streamName = ref('')
const rtspUrl = ref('')
const snapshotIntervalMinutes = ref<number | null>(null)
const submitting = ref(false)
const streamNameError = ref<string | null>(null)
const formError = ref<string | null>(null)

const STREAM_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/
const NAME_MAX = 100

function resetForm() {
  if (props.camera) {
    name.value = props.camera.name
    streamName.value = props.camera.streamName
    rtspUrl.value = ''
    snapshotIntervalMinutes.value = props.camera.snapshotIntervalMinutes ?? null
  } else {
    name.value = ''
    streamName.value = ''
    rtspUrl.value = ''
    snapshotIntervalMinutes.value = null
  }
  streamNameError.value = null
  formError.value = null
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      resetForm()
    }
  },
)

const nameError = computed(() => {
  if (!name.value.trim()) return 'Name is required.'
  if (name.value.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`
  return null
})

const streamNameInvalid = computed(() => {
  if (!streamName.value) return 'Stream name is required.'
  if (!STREAM_NAME_RE.test(streamName.value)) {
    return 'Letters, numbers, dash, or underscore only (1–64 chars).'
  }
  return null
})

const rtspUrlError = computed(() => {
  if (isEdit.value) {
    if (rtspUrl.value && !rtspUrl.value.startsWith('rtsp://')) {
      return 'RTSP URL must start with rtsp://'
    }
    return null
  }
  if (!rtspUrl.value) return 'RTSP URL is required.'
  if (!rtspUrl.value.startsWith('rtsp://')) return 'RTSP URL must start with rtsp://'
  return null
})

const canSave = computed(
  () =>
    !submitting.value &&
    nameError.value === null &&
    streamNameInvalid.value === null &&
    rtspUrlError.value === null,
)

function close() {
  emit('update:visible', false)
}

async function save() {
  streamNameError.value = null
  formError.value = null
  if (!canSave.value) return
  submitting.value = true
  try {
    if (isEdit.value && props.camera) {
      const payload: UpdateCameraPayload = {}
      if (name.value !== props.camera.name) payload.name = name.value
      if (streamName.value !== props.camera.streamName) payload.streamName = streamName.value
      if (rtspUrl.value) payload.rtspUrl = rtspUrl.value
      if (snapshotIntervalMinutes.value !== props.camera.snapshotIntervalMinutes) {
        payload.snapshotIntervalMinutes = snapshotIntervalMinutes.value
      }
      await store.updateCamera(props.camera.id, payload)
      toast.add({ detail: 'Camera updated', life: 4000, severity: 'success', summary: 'Saved' })
    } else {
      const payload: CreateCameraPayload = {
        name: name.value.trim(),
        streamName: streamName.value,
        rtspUrl: rtspUrl.value,
        controllerId: props.defaultControllerId ?? null,
      }
      if (snapshotIntervalMinutes.value != null) {
        payload.snapshotIntervalMinutes = snapshotIntervalMinutes.value
      }
      await store.createCamera(payload)
      toast.add({ detail: 'Camera added', life: 4000, severity: 'success', summary: 'Saved' })
    }
    emit('saved')
    close()
  } catch (err) {
    if (err instanceof CameraConflictError) {
      streamNameError.value = 'A camera with this stream name already exists.'
    } else {
      const { message } = extractApiError(err, 'Failed to save camera')
      formError.value = message
      toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Save failed' })
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="isEdit ? 'Edit Camera' : 'Add Camera'"
    :closable="false"
    modal
    style="width: 480px; max-width: 92vw"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="camera-form">
      <div class="field">
        <label class="field-label" for="cam-name">Name</label>
        <InputText
          id="cam-name"
          v-model="name"
          data-testid="cam-name"
          :maxlength="NAME_MAX"
          class="full-width"
        />
        <small v-if="nameError" class="field-error" data-testid="cam-name-error">{{
          nameError
        }}</small>
      </div>

      <div class="field">
        <label class="field-label" for="cam-stream">Stream name</label>
        <InputText
          id="cam-stream"
          v-model="streamName"
          data-testid="cam-stream"
          class="full-width"
        />
        <small class="field-hint">Letters, numbers, dash, underscore — no spaces.</small>
        <small
          v-if="streamNameError || streamNameInvalid"
          class="field-error"
          data-testid="cam-stream-error"
          >{{ streamNameError ?? streamNameInvalid }}</small
        >
      </div>

      <div class="field">
        <label class="field-label" for="cam-rtsp">RTSP URL</label>
        <InputText
          id="cam-rtsp"
          v-model="rtspUrl"
          data-testid="cam-rtsp"
          :placeholder="isEdit ? '•••••• leave blank to keep current' : 'rtsp://...'"
          class="full-width"
        />
        <small v-if="rtspUrlError" class="field-error" data-testid="cam-rtsp-error">{{
          rtspUrlError
        }}</small>
      </div>

      <div class="field">
        <label class="field-label" for="cam-interval">Snapshot interval (minutes)</label>
        <InputNumber
          input-id="cam-interval"
          v-model="snapshotIntervalMinutes"
          :min="1"
          :max="1440"
          allow-empty
          placeholder="off — set to capture every N min"
          data-testid="cam-interval"
          class="full-width"
        />
        <small class="field-hint">
          Leave empty to disable captures. Captures only run while an active grow is on this
          camera's controller.
        </small>
      </div>

      <Message v-if="formError" severity="error" :closable="false" data-testid="cam-form-error">
        {{ formError }}
      </Message>
    </div>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button
        :label="isEdit ? 'Save' : 'Add'"
        icon="pi pi-check"
        :loading="submitting"
        :disabled="!canSave"
        data-testid="cam-save"
        @click="save"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.camera-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.field-hint {
  font-size: 0.6875rem;
  color: var(--color-text-muted);
}

.field-error {
  font-size: 0.75rem;
  color: var(--color-danger);
}

.full-width {
  width: 100%;
}
</style>
