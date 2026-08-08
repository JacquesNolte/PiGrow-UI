<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ConfirmDialog from 'primevue/confirmdialog'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { useApiStore } from '../../stores/apiStore'
import { extractApiError } from '../../utils/errors'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import type { Camera } from '../../types/grow'
import CameraTile from './CameraTile.vue'
import CameraFormDialog from './CameraFormDialog.vue'
import SnapshotGallery from './SnapshotGallery.vue'

const store = useApiStore()
const state = useProvidedGrowMonitorState()
const confirm = useConfirm()
const toast = useToast()

const controllerId = computed(() => {
  const linked = state.linkedController.value
  if (linked?.id) {
    return linked.id
  }
  return state.currentCycle.value?.controllerId ?? null
})

const growCameras = computed(() =>
  controllerId.value ? store.cameras.filter((c) => c.controllerId === controllerId.value) : [],
)

const formVisible = ref(false)
const editingCamera = ref<Camera | null>(null)
const galleryVisible = ref(false)
const galleryCamera = ref<Camera | null>(null)
const cameraError = ref<string | null>(null)

const dialogHeader = computed(() => 'Live Feed')

onMounted(() => {
  void loadCameras()
})

async function loadCameras() {
  cameraError.value = null
  try {
    await store.fetchCameras()
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to load cameras')
    cameraError.value = message
  }
}

function openAddForm() {
  editingCamera.value = null
  formVisible.value = true
}

function openEditForm(camera: Camera) {
  editingCamera.value = camera
  formVisible.value = true
}

function openGallery(camera: Camera) {
  galleryCamera.value = camera
  galleryVisible.value = true
}

function onSaved() {
  // The store already mutated `cameras`; the computed filter re-renders the grid.
}

function confirmDelete(camera: Camera) {
  confirm.require({
    header: 'Delete camera',
    message: `Delete camera "${camera.name}"? This removes the stream from go2rtc.`,
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: () => void doDelete(camera.id),
  })
}

async function doDelete(id: string) {
  try {
    await store.deleteCamera(id)
    toast.add({ detail: 'Camera removed', life: 4000, severity: 'info', summary: 'Deleted' })
  } catch (err) {
    const { message } = extractApiError(err, 'Failed to delete camera')
    toast.add({ detail: message, life: 6000, severity: 'error', summary: 'Delete failed' })
  }
}
</script>

<template>
  <div class="live-feed-tab">
    <ConfirmDialog />
    <div class="header">
      <h3 class="section-title">{{ dialogHeader }}</h3>
      <Button
        label="Add Camera"
        icon="pi pi-plus"
        data-testid="add-camera-btn"
        @click="openAddForm"
      />
    </div>

    <Card v-if="growCameras.length === 0" data-testid="camera-empty">
      <template #content>
        <Message
          v-if="cameraError"
          severity="error"
          :closable="false"
          class="camera-error"
          data-testid="camera-error"
        >
          {{ cameraError }}
          <Button label="Retry" severity="secondary" size="small" text @click="loadCameras" />
        </Message>
        <div class="empty-state">
          <i class="pi pi-video" />
          <p>No cameras for this grow yet.</p>
          <Button
            label="Add Camera"
            icon="pi pi-plus"
            data-testid="add-camera-empty"
            @click="openAddForm"
          />
        </div>
      </template>
    </Card>

    <div v-else class="camera-grid" data-testid="camera-grid">
      <CameraTile
        v-for="camera in growCameras"
        :key="camera.id"
        :camera="camera"
        @edit="openEditForm(camera)"
        @delete="confirmDelete(camera)"
        @gallery="openGallery(camera)"
      />
    </div>

    <CameraFormDialog
      v-model:visible="formVisible"
      :camera="editingCamera"
      :default-controller-id="controllerId"
      @saved="onSaved"
    />
    <SnapshotGallery
      v-if="galleryCamera"
      v-model:visible="galleryVisible"
      :camera="galleryCamera"
    />
  </div>
</template>

<style scoped>
.live-feed-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.section-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text-primary);
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

.camera-error {
  margin-bottom: var(--space-3);
}

.empty-state i {
  font-size: 2rem;
  opacity: 0.5;
}

.empty-state p {
  margin: 0;
  font-size: var(--text-md);
}

.camera-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--space-4);
}
</style>
