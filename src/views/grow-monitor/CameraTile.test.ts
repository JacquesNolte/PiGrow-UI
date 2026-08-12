import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Ref } from 'vue'
import type { Camera, CameraSnapshot, VisionResponse } from '../../types/grow'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const socketRef: Ref<unknown> = ref(null)
vi.mock('./useGrowMonitorState', () => ({
  useProvidedGrowMonitorState: () => ({ liveTelemetry: { socket: socketRef } }),
}))

let latestSnapshotsRef = ref<Record<string, CameraSnapshot | null>>({})
let loadingSnapshotsRef = ref(false)
let visionBySnapshotRef = ref<Record<string, VisionResponse>>({})
let analyzingSnapshotsRef = ref<Record<string, boolean>>({})
const fetchLatestSnapshotMock = vi.fn(async (_id: string): Promise<CameraSnapshot | null> => null)
const fetchSnapshotsMock = vi.fn(async () => [] as CameraSnapshot[])
const prependSnapshotMock = vi.fn()
const analyzeSnapshotMock = vi.fn()

vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    get latestSnapshot() {
      return latestSnapshotsRef.value
    },
    get loadingSnapshots() {
      return loadingSnapshotsRef.value
    },
    get visionBySnapshot() {
      return visionBySnapshotRef.value
    },
    get analyzingSnapshots() {
      return analyzingSnapshotsRef.value
    },
    fetchLatestSnapshot: fetchLatestSnapshotMock,
    fetchSnapshots: fetchSnapshotsMock,
    prependSnapshot: prependSnapshotMock,
    ai: { analyzeSnapshot: analyzeSnapshotMock },
  }),
}))

import CameraTile from './CameraTile.vue'
import { primeVueStubs } from '../../utils/testStub'

const baseCamera = {
  createdAt: '2026-07-27T00:00:00.000Z',
  id: 'cam1',
  name: 'Grow Tent Cam',
  snapshotUrl: 'http://go2rtc:8555/api/frame.jpeg?src=cam1',
  streamName: 'cam1',
  controllerId: 'ctrl1',
  updatedAt: '2026-07-27T00:00:00.000Z',
  webrtcUrl: 'http://go2rtc:8555/stream.html?src=cam1',
  warnings: [] as string[],
  snapshotIntervalMinutes: null as number | null,
}

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeSnapshot(over: Partial<CameraSnapshot> = {}): CameraSnapshot {
  return {
    bytes: 142_336,
    cameraId: 'cam1',
    capturedAt: new Date().toISOString(),
    controllerId: 'ctrl1',
    growCycleId: 'c1',
    growPhaseId: 'p1',
    id: 'snap1',
    imageUrl: 'http://minio/snap1.jpg',
    ...over,
  }
}

describe('CameraTile', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    latestSnapshotsRef = ref<Record<string, CameraSnapshot | null>>({})
    loadingSnapshotsRef = ref(false)
    visionBySnapshotRef = ref<Record<string, VisionResponse>>({})
    analyzingSnapshotsRef = ref<Record<string, boolean>>({})
    fetchLatestSnapshotMock.mockReset()
    fetchSnapshotsMock.mockReset()
    prependSnapshotMock.mockReset()
    analyzeSnapshotMock.mockReset()
    fetchLatestSnapshotMock.mockResolvedValue(null)
    socketRef.value = null
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
  })

  it('shows the snapshot first; on iframe load, streamReady becomes true and the snapshot is removed', async () => {
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })

    expect(w.find('[data-testid="camera-snapshot"]').exists()).toBe(true)
    const iframe = w.find('[data-testid="camera-iframe"]')
    expect(iframe.exists()).toBe(true)
    // v-show=false sets inline display:none until the stream is ready
    expect((iframe.element as HTMLElement).style.display).toBe('none')

    await iframe.trigger('load')
    await w.vm.$nextTick()

    expect(w.find('[data-testid="camera-snapshot"]').exists()).toBe(false)
    expect((w.find('[data-testid="camera-iframe"]').element as HTMLElement).style.display).toBe('')
  })

  it('shows the go2rtc-down badge when warnings include GO2RTC_UNREACHABLE', () => {
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera, warnings: ['GO2RTC_UNREACHABLE'] } },
    })

    expect(w.find('[data-testid="camera-warning-go2rtc"]').exists()).toBe(true)
    expect(w.text()).toMatch(/go2rtc down/i)
  })

  it('marks the stream unavailable when the iframe has not loaded within the timeout', async () => {
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })

    expect(w.find('[data-testid="camera-unavailable"]').exists()).toBe(false)

    vi.advanceTimersByTime(8000)
    await Promise.resolve()

    expect(w.find('[data-testid="camera-unavailable"]').exists()).toBe(true)
    expect(w.text()).toMatch(/stream unavailable/i)
  })

  it('shows the Snapshots off badge when snapshotIntervalMinutes is null, and "every N min" when set', async () => {
    const off = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera, snapshotIntervalMinutes: null } },
    })
    await flush()
    expect(off.find('[data-testid="snapshot-off"]').exists()).toBe(true)
    expect(off.find('[data-testid="snapshot-interval"]').exists()).toBe(false)
    expect(off.text()).toMatch(/snapshots off/i)
  })

  it('shows the "every 10 min" badge when snapshotIntervalMinutes is set', async () => {
    const on = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: {
        camera: { ...baseCamera, snapshotIntervalMinutes: 10 } as Camera,
      },
    })
    await flush()
    expect(on.find('[data-testid="snapshot-interval"]').exists()).toBe(true)
    expect(on.text()).toMatch(/every 10 min/i)
  })

  it('shows "last captured" once the latest snapshot resolves, and toggle reveals the stored snapshot img', async () => {
    fetchLatestSnapshotMock.mockImplementation(async () => {
      const snap = makeSnapshot({
        id: 's1',
        cameraId: 'cam1',
        capturedAt: new Date().toISOString(),
      })
      latestSnapshotsRef.value = { cam1: snap }
      return snap
    })
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()

    expect(fetchLatestSnapshotMock).toHaveBeenCalledWith('cam1')
    expect(w.text()).toMatch(/last captured/i)

    expect(w.find('[data-testid="camera-latest"]').exists()).toBe(false)
    await w.get('[data-testid="camera-toggle"]').trigger('click')
    await w.vm.$nextTick()

    expect(w.find('[data-testid="camera-latest"]').exists()).toBe(true)
  })

  it('ignores camera_snapshot_created events from other cameras', async () => {
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }
    fetchLatestSnapshotMock.mockResolvedValue(null)
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()
    fetchLatestSnapshotMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['camera_snapshot_created']!({ id: 's2', cameraId: 'camOther', capturedAt: '' })
    await flush()

    expect(fetchLatestSnapshotMock).not.toHaveBeenCalled()
    w.unmount()
  })

  it('fetches the latest snapshot when a camera_snapshot_created event lands for this camera', async () => {
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }
    fetchLatestSnapshotMock.mockResolvedValue(null)
    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()
    fetchLatestSnapshotMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['camera_snapshot_created']!({ id: 's3', cameraId: 'cam1', capturedAt: '' })
    await flush()

    expect(fetchLatestSnapshotMock).toHaveBeenCalledWith('cam1')
    w.unmount()
  })

  it('calls store.ai.analyzeSnapshot with the latest snapshot id when Analyze is clicked', async () => {
    fetchLatestSnapshotMock.mockImplementation(async () => {
      const snap = makeSnapshot({ id: 'snap1' })
      latestSnapshotsRef.value = { cam1: snap }
      return snap
    })
    analyzeSnapshotMock.mockResolvedValue({
      summary: 'Healthy plant',
      healthScore: 8,
      findings: [],
    })

    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()

    const btn = w.find('[data-testid="camera-analyze"]')
    expect(btn.exists()).toBe(true)

    await btn.trigger('click')
    await flush()

    expect(analyzeSnapshotMock).toHaveBeenCalledWith('snap1')
  })

  it('renders the vision overlay when visionBySnapshot has the latest snapshot id', async () => {
    fetchLatestSnapshotMock.mockImplementation(async () => {
      const snap = makeSnapshot({ id: 'snap1' })
      latestSnapshotsRef.value = { cam1: snap }
      return snap
    })
    visionBySnapshotRef.value = {
      snap1: { summary: 'Healthy plant', healthScore: 8, findings: [] },
    }

    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()

    const overlay = w.find('[data-testid="camera-vision-overlay"]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('Healthy plant')
    expect(overlay.text()).toContain('8/10')
  })

  it('does not render the vision overlay when no cached analysis exists', async () => {
    fetchLatestSnapshotMock.mockImplementation(async () => {
      const snap = makeSnapshot({ id: 'snap1' })
      latestSnapshotsRef.value = { cam1: snap }
      return snap
    })
    visionBySnapshotRef.value = {}

    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()

    expect(w.find('[data-testid="camera-vision-overlay"]').exists()).toBe(false)
  })

  it('disables the Analyze button while analyzingSnapshots is true for the latest snapshot', async () => {
    fetchLatestSnapshotMock.mockImplementation(async () => {
      const snap = makeSnapshot({ id: 'snap1' })
      latestSnapshotsRef.value = { cam1: snap }
      return snap
    })
    analyzingSnapshotsRef.value = { snap1: true }

    const w = mount(CameraTile, {
      global: { stubs: primeVueStubs },
      props: { camera: { ...baseCamera } },
    })
    await flush()

    const btn = w.find('[data-testid="camera-analyze"]')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBe('true')
  })
})
