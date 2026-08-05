<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useApiStore } from '../../stores/apiStore'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import { formatBytes } from '../../utils/snapshotFormat'
import type { Camera, CameraSnapshot } from '../../types/grow'

const PAGE_SIZE = 50

const props = defineProps<{ visible: boolean; camera: Camera | null }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const store = useApiStore()
const state = useProvidedGrowMonitorState()

const snaps = computed<CameraSnapshot[]>(() =>
  props.camera ? (store.snapshots[props.camera.id] ?? []) : [],
)
const oldest = computed(() => snaps.value.at(-1) ?? null)

const hasMore = ref(true)
const selected = ref<CameraSnapshot | null>(null)

async function loadFirst() {
  if (!props.camera) return
  hasMore.value = true
  const data = await store.fetchSnapshots(props.camera.id, { limit: PAGE_SIZE })
  if (data.length < PAGE_SIZE) hasMore.value = false
}

async function loadMore() {
  if (!props.camera || !oldest.value || !hasMore.value) return
  const data = await store.fetchSnapshots(props.camera.id, {
    limit: PAGE_SIZE,
    before: oldest.value.capturedAt,
  })
  if (data.length < PAGE_SIZE) hasMore.value = false
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      selected.value = null
      void loadFirst()
    }
  },
  { immediate: true },
)

// Socket.IO realtime: when a camera_snapshot_created event lands for the
// gallery's camera, prepend the new snapshot to the list (preserves scroll)
// rather than re-paging from the top.
let attachedSocket: { off: (event: string, handler: (payload: unknown) => void) => void } | null =
  null
const socketHandler = async (payload: { id: string; cameraId: string; capturedAt: string }) => {
  if (props.visible && props.camera && payload?.cameraId && payload.cameraId === props.camera.id) {
    const snap = await store.fetchLatestSnapshot(props.camera.id)
    if (snap) store.prependSnapshot(props.camera.id, snap)
  }
}

watch(
  () => state.liveTelemetry.socket.value,
  (sock) => {
    if (attachedSocket) {
      attachedSocket.off('camera_snapshot_created', socketHandler as (payload: unknown) => void)
      attachedSocket = null
    }
    if (sock) {
      sock.on('camera_snapshot_created', socketHandler as (payload: unknown) => void)
      attachedSocket = sock
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (attachedSocket) {
    attachedSocket.off('camera_snapshot_created', socketHandler as (payload: unknown) => void)
    attachedSocket = null
  }
})
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    maximizable
    :style="{ width: 'min(900px, 96vw)' }"
    :header="camera ? `${camera.name} — snapshot history` : 'Snapshot history'"
    :closable="true"
    data-testid="gallery-dialog"
    @update:visible="emit('update:visible', $event)"
  >
    <div
      v-if="camera && camera.snapshotIntervalMinutes == null"
      class="gallery-empty"
      data-testid="gallery-empty-off"
    >
      <i class="pi pi-info-circle" />
      <p>Set a snapshot interval to start capturing snapshots for this camera.</p>
    </div>
    <div
      v-else-if="camera && snaps.length === 0 && !store.loadingSnapshots"
      class="gallery-empty"
      data-testid="gallery-empty-none"
    >
      <i class="pi pi-image" />
      <p>No snapshots yet — first capture appears within ~1 min.</p>
    </div>
    <div v-else-if="camera" class="gallery-content">
      <div class="gallery-grid" data-testid="gallery-grid">
        <button
          v-for="snap in snaps"
          :key="snap.id"
          class="snap-thumb"
          data-testid="gallery-thumb"
          type="button"
          :title="new Date(snap.capturedAt).toLocaleString()"
          @click="selected = snap"
        >
          <img
            :src="snap.imageUrl"
            referrerPolicy="no-referrer"
            loading="lazy"
            :alt="`Snapshot ${snap.capturedAt}`"
          />
          <span class="snap-meta">
            {{ formatBytes(snap.bytes) }} · {{ new Date(snap.capturedAt).toLocaleString() }}
          </span>
        </button>
      </div>
      <div v-if="store.loadingSnapshots" class="gallery-spinner" data-testid="gallery-spinner">
        <ProgressSpinner />
      </div>
      <div v-else class="gallery-actions">
        <Button
          v-if="hasMore && oldest"
          label="Load more"
          icon="pi pi-arrow-down"
          severity="secondary"
          data-testid="gallery-load-more"
          @click="loadMore"
        />
        <span v-else class="gallery-end">No more snapshots.</span>
      </div>
    </div>

    <div
      v-if="selected"
      class="snap-overlay"
      data-testid="gallery-preview"
      @click.self="selected = null"
    >
      <div class="snap-overlay-body">
        <img
          :src="selected.imageUrl"
          referrerPolicy="no-referrer"
          :alt="`Snapshot ${selected.capturedAt}`"
          class="gallery-preview-img"
        />
        <div class="snap-preview-meta">
          {{ formatBytes(selected.bytes) }} · {{ new Date(selected.capturedAt).toLocaleString() }}
        </div>
        <Button
          icon="pi pi-times"
          severity="secondary"
          rounded
          aria-label="Close preview"
          class="snap-close"
          @click="selected = null"
        />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.gallery-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.gallery-empty {
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

.gallery-empty i {
  font-size: 2rem;
  opacity: 0.5;
}

.gallery-empty p {
  margin: 0;
  font-size: var(--text-md);
  max-width: 480px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-2);
}

.snap-thumb {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
}

.snap-thumb:hover {
  border-color: var(--color-text-muted);
}

.snap-thumb img {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #000;
  display: block;
}

.snap-meta {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.gallery-spinner {
  display: flex;
  justify-content: center;
  padding: var(--space-3);
}

.gallery-actions {
  display: flex;
  justify-content: center;
  padding: var(--space-2);
}

.gallery-end {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.snap-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
  padding: var(--space-3);
}

.snap-overlay-body {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-2);
  max-width: min(720px, 92vw);
  max-height: 92vh;
  background: var(--color-bg-elevated);
  padding: var(--space-3);
  border-radius: var(--radius-md);
}

.gallery-preview-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 75vh;
  object-fit: contain;
  background: #000;
  border-radius: var(--radius-sm);
}

.snap-preview-meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.snap-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}
</style>
