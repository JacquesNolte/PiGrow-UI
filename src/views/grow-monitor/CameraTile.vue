<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useApiStore } from '../../stores/apiStore'
import { useProvidedGrowMonitorState } from './useGrowMonitorState'
import { formatRelative } from '../../utils/snapshotFormat'
import { extractApiError } from '../../utils/errors'
import { healthScoreClass, type HealthScoreClass } from '../../utils/vision'
import type { Camera } from '../../types/grow'

const props = defineProps<{ camera: Camera }>()
defineEmits<{ edit: []; delete: []; gallery: [] }>()

const store = useApiStore()
const state = useProvidedGrowMonitorState()
const toast = useToast()

const streamReady = ref(false)
const streamFailed = ref(false)
const snapshotBroken = ref(false)
const showSnapshot = ref(false)
let failureTimer: ReturnType<typeof setTimeout> | null = null

const latest = computed(() => store.latestSnapshot[props.camera.id] ?? null)

function healthClass(snapshotId: string): HealthScoreClass {
  return healthScoreClass(store.visionBySnapshot[snapshotId]?.healthScore ?? null)
}

void store.fetchLatestSnapshot(props.camera.id)

async function analyzeLatest() {
  const snap = latest.value
  if (!snap) return
  try {
    await store.ai.analyzeSnapshot(snap.id)
  } catch (err) {
    const { status, message } = extractApiError(err, 'Analysis failed')
    if (status === 503) {
      toast.add({
        detail: 'AI vision not configured — set AI_PROVIDER and AI_API_KEY on the server.',
        life: 6000,
        severity: 'info',
        summary: 'Not configured',
      })
    } else {
      toast.add({
        detail: message,
        life: 6000,
        severity: 'error',
        summary: 'Analysis failed',
      })
    }
  }
}

function onIframeLoad() {
  streamReady.value = true
  streamFailed.value = false
  if (failureTimer) {
    clearTimeout(failureTimer)
    failureTimer = null
  }
}

function onSnapshotError() {
  snapshotBroken.value = true
}

function armFailureTimer() {
  if (failureTimer) {
    clearTimeout(failureTimer)
  }
  failureTimer = setTimeout(() => {
    if (!streamReady.value) {
      streamFailed.value = true
    }
    failureTimer = null
  }, 8000)
}

armFailureTimer()

// Socket.IO realtime: refresh the latest snapshot when a camera_snapshot_created
// event lands for this camera. The event carries only { id, cameraId, capturedAt },
// so we re-fetch from /snapshots/latest rather than reconstruct the snapshot.
let attachedSocket: { off: (event: string, handler: (payload: unknown) => void) => void } | null =
  null
const socketHandler = (payload: { id: string; cameraId: string; capturedAt: string }) => {
  if (payload?.cameraId && payload.cameraId === props.camera.id) {
    void store.fetchLatestSnapshot(props.camera.id)
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
  if (failureTimer) {
    clearTimeout(failureTimer)
    failureTimer = null
  }
  if (attachedSocket) {
    attachedSocket.off('camera_snapshot_created', socketHandler as (payload: unknown) => void)
    attachedSocket = null
  }
})
</script>

<template>
  <div class="camera-tile" :data-testid="`camera-tile-${camera.id}`">
    <div class="tile-header">
      <span class="name">{{ camera.name }}</span>
      <span
        v-if="camera.warnings.includes('GO2RTC_UNREACHABLE')"
        class="warning-badge"
        data-testid="camera-warning-go2rtc"
      >
        go2rtc down
      </span>
      <span class="spacer" />
      <Button
        icon="pi pi-pencil"
        text
        rounded
        size="small"
        severity="secondary"
        aria-label="Edit camera"
        data-testid="camera-edit"
        @click="$emit('edit')"
      />
      <Button
        icon="pi pi-trash"
        text
        rounded
        size="small"
        severity="danger"
        aria-label="Delete camera"
        data-testid="camera-delete"
        @click="$emit('delete')"
      />
    </div>
    <div class="tile-body">
      <img
        v-if="!streamReady && !showSnapshot"
        :src="camera.snapshotUrl"
        referrerPolicy="no-referrer"
        class="snapshot-placeholder"
        :class="{ broken: snapshotBroken }"
        data-testid="camera-snapshot"
        alt=""
        @error="onSnapshotError"
      />
      <div
        v-if="!streamReady && !showSnapshot && (snapshotBroken || streamFailed)"
        class="stream-unavailable"
        data-testid="camera-unavailable"
      >
        <i class="pi pi-video" />
        <span>{{
          snapshotBroken ? 'No snapshot available' : 'Stream unavailable — showing last snapshot'
        }}</span>
      </div>
      <img
        v-if="showSnapshot && latest"
        :src="latest.imageUrl"
        referrerPolicy="no-referrer"
        class="latest-snapshot"
        data-testid="camera-latest"
        alt=""
      />
      <div v-if="showSnapshot && !latest" class="no-snapshot" data-testid="camera-no-snapshot">
        <i class="pi pi-image" />
        <span>No snapshots yet</span>
      </div>
      <iframe
        v-show="!showSnapshot && streamReady"
        :src="camera.webrtcUrl"
        :title="camera.name"
        allow="autoplay; encrypted-media"
        class="live-iframe"
        data-testid="camera-iframe"
        @load="onIframeLoad"
      />
      <div
        v-if="latest && store.visionBySnapshot[latest.id]"
        class="vision-overlay"
        data-testid="camera-vision-overlay"
      >
        <span
          class="vision-health"
          :class="healthClass(latest.id)"
          :data-testid="`vision-health-${latest.id}`"
        >
          {{ store.visionBySnapshot[latest.id]?.healthScore ?? '—' }}/10
        </span>
        <span class="vision-summary">{{ store.visionBySnapshot[latest.id]?.summary }}</span>
      </div>
    </div>
    <div class="tile-footer">
      <span
        v-if="camera.snapshotIntervalMinutes == null"
        class="snapshot-badge off"
        data-testid="snapshot-off"
      >
        Snapshots off
      </span>
      <span v-else class="snapshot-badge on" data-testid="snapshot-interval">
        every {{ camera.snapshotIntervalMinutes }} min
      </span>
      <span v-if="latest" class="last-captured" data-testid="last-captured">
        last captured {{ formatRelative(latest.capturedAt) }}
      </span>
      <span class="spacer" />
      <Button
        :label="showSnapshot ? 'Live' : 'Last snapshot'"
        :icon="showSnapshot ? 'pi pi-video' : 'pi pi-image'"
        text
        size="small"
        data-testid="camera-toggle"
        @click="showSnapshot = !showSnapshot"
      />
      <Button
        label="Gallery"
        icon="pi pi-images"
        text
        size="small"
        aria-label="Open snapshot gallery"
        data-testid="camera-gallery"
        @click="$emit('gallery')"
      />
      <Button
        v-if="latest"
        label="Analyze"
        icon="pi pi-sparkles"
        text
        size="small"
        :loading="!!store.analyzingSnapshots[latest.id]"
        :disabled="!!store.analyzingSnapshots[latest.id]"
        aria-label="Analyze snapshot"
        data-testid="camera-analyze"
        @click="analyzeLatest"
      />
    </div>
  </div>
</template>

<style scoped>
.camera-tile {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-elevated);
  overflow: hidden;
}

.tile-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.tile-header .name {
  font-weight: 600;
  font-size: var(--text-md);
  color: var(--color-text-primary);
}

.spacer {
  flex: 1;
}

.warning-badge {
  font-size: var(--text-xs);
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.375rem;
}

.tile-body {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.snapshot-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.snapshot-placeholder.broken {
  display: none;
}

.stream-unavailable {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-3);
}

.stream-unavailable i {
  font-size: 1.5rem;
  opacity: 0.6;
}

.live-iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  pointer-events: none;
}

.latest-snapshot {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-snapshot {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  padding: var(--space-3);
}

.no-snapshot i {
  font-size: 1.5rem;
  opacity: 0.6;
}

.tile-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.snapshot-badge {
  font-size: var(--text-xs);
  border-radius: var(--radius-sm);
  padding: 0.125rem 0.5rem;
  font-variant-numeric: tabular-nums;
}

.snapshot-badge.off {
  color: var(--color-text-muted);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
}

.snapshot-badge.on {
  color: var(--color-text-primary);
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.last-captured {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.vision-overlay {
  position: absolute;
  bottom: var(--space-2);
  left: var(--space-2);
  right: var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: rgba(0, 0, 0, 0.7);
  color: var(--color-text-primary);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  pointer-events: none;
  max-width: calc(100% - var(--space-4));
}

.vision-health {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: var(--text-sm);
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.vision-health.good {
  background: var(--color-success-bg);
  color: var(--color-success);
  border: 1px solid var(--color-success-border);
}

.vision-health.ok {
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border: 1px solid var(--color-warning-border);
}

.vision-health.bad {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
}

.vision-health.neutral {
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.vision-summary {
  line-height: var(--leading-normal);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
