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

let snapshotsRef = ref<Record<string, CameraSnapshot[]>>({})
let latestSnapshotRef = ref<Record<string, CameraSnapshot | null>>({})
let loadingSnapshotsRef = ref(false)
let visionBySnapshotRef = ref<Record<string, VisionResponse>>({})

const fetchSnapshotsMock = vi.fn()
const fetchLatestSnapshotMock = vi.fn()
const prependSnapshotMock = vi.fn()

vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    get snapshots() {
      return snapshotsRef.value
    },
    get latestSnapshot() {
      return latestSnapshotRef.value
    },
    get loadingSnapshots() {
      return loadingSnapshotsRef.value
    },
    get visionBySnapshot() {
      return visionBySnapshotRef.value
    },
    fetchSnapshots: fetchSnapshotsMock,
    fetchLatestSnapshot: fetchLatestSnapshotMock,
    prependSnapshot: prependSnapshotMock,
  }),
}))

import SnapshotGallery from './SnapshotGallery.vue'
import { primeVueStubs } from '../../utils/testStub'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeCamera(over: Partial<Camera> = {}): Camera {
  return {
    controllerId: 'ctrl1',
    createdAt: '2026-07-27T00:00:00.000Z',
    id: 'cam1',
    name: 'Tent',
    snapshotIntervalMinutes: null,
    snapshotUrl: 'http://go2rtc:8555/api/frame.jpeg?src=cam1',
    streamName: 'cam1',
    updatedAt: '2026-07-27T00:00:00.000Z',
    warnings: [],
    webrtcUrl: 'http://go2rtc:8555/stream.html?src=cam1',
    ...over,
  }
}

function makeSnap(over: Partial<CameraSnapshot>): CameraSnapshot {
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

describe('SnapshotGallery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    snapshotsRef = ref<Record<string, CameraSnapshot[]>>({})
    latestSnapshotRef = ref<Record<string, CameraSnapshot | null>>({})
    loadingSnapshotsRef = ref(false)
    visionBySnapshotRef = ref<Record<string, VisionResponse>>({})
    fetchSnapshotsMock.mockReset()
    fetchLatestSnapshotMock.mockReset()
    prependSnapshotMock.mockReset()
    fetchSnapshotsMock.mockResolvedValue([])
    fetchLatestSnapshotMock.mockResolvedValue(null)
    socketRef.value = null
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('fetches the first page (newest-first, limit 50) on open and renders one thumb per snapshot', async () => {
    const snaps = [
      makeSnap({ id: 'a', capturedAt: '2026-07-27T12:02:00.000Z' }),
      makeSnap({ id: 'b', capturedAt: '2026-07-27T12:01:00.000Z' }),
      makeSnap({ id: 'c', capturedAt: '2026-07-27T12:00:00.000Z' }),
    ]
    fetchSnapshotsMock.mockImplementation(async () => {
      snapshotsRef.value = { cam1: snaps }
      return snaps
    })

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(fetchSnapshotsMock).toHaveBeenCalledWith('cam1', { limit: 50 })
    const thumbs = w.findAll('[data-testid="gallery-thumb"]')
    expect(thumbs.length).toBe(3)
  })

  it('Load more pages the previous oldest with `before`, then appends to the list', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      makeSnap({
        id: `p1-${i}`,
        capturedAt: `2026-07-27T12:${String(50 - i).padStart(2, '0')}:00.000Z`,
      }),
    )
    // The newest is p1-0 (12:50), oldest in page1 is p1-49 (12:01).
    const page2 = [
      makeSnap({ id: 'z', capturedAt: '2026-07-27T12:00:00.000Z' }),
      makeSnap({ id: 'y', capturedAt: '2026-07-27T11:59:00.000Z' }),
    ]

    fetchSnapshotsMock.mockImplementation(async (_id, opts?: { before?: string }) => {
      if (opts?.before) {
        const merged = [...page1, ...page2]
        snapshotsRef.value = { cam1: merged }
        return page2
      }
      snapshotsRef.value = { cam1: page1 }
      return page1
    })

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    fetchSnapshotsMock.mockClear()
    await w.get('[data-testid="gallery-load-more"]').trigger('click')
    await flush()

    expect(fetchSnapshotsMock).toHaveBeenCalledWith('cam1', {
      limit: 50,
      before: page1[page1.length - 1]!.capturedAt,
    })
    expect(w.findAll('[data-testid="gallery-thumb"]').length).toBe(52)
  })

  it('hides Load more when a page returns fewer than 50 items', async () => {
    fetchSnapshotsMock.mockImplementation(async () => {
      const small = [makeSnap({ id: 'a' })]
      snapshotsRef.value = { cam1: small }
      return small
    })

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(w.find('[data-testid="gallery-load-more"]').exists()).toBe(false)
    expect(w.text()).toMatch(/no more snapshots/i)
  })

  it('prepends a new snapshot when a camera_snapshot_created event lands for this camera', async () => {
    fetchSnapshotsMock.mockResolvedValue([])
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }
    const newSnap = makeSnap({ id: 'n', capturedAt: '2026-07-27T12:05:00.000Z' })
    fetchLatestSnapshotMock.mockResolvedValue(newSnap)

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()
    fetchLatestSnapshotMock.mockClear()
    prependSnapshotMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['camera_snapshot_created']!({ id: 'n', cameraId: 'cam1', capturedAt: '' })
    await flush()

    expect(fetchLatestSnapshotMock).toHaveBeenCalledWith('cam1')
    expect(prependSnapshotMock).toHaveBeenCalledWith('cam1', newSnap)
  })

  it('ignores camera_snapshot_created events for other cameras', async () => {
    fetchSnapshotsMock.mockResolvedValue([])
    const handlers: Record<string, ((payload: unknown) => void) | undefined> = {}
    const fakeSocket = {
      off: (event: string) => {
        delete handlers[event]
      },
      on: (event: string, handler: (payload: unknown) => void) => {
        handlers[event] = handler
      },
    }

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })
    await w.setProps({ visible: true })
    await flush()
    fetchLatestSnapshotMock.mockClear()

    socketRef.value = fakeSocket
    await flush()

    handlers['camera_snapshot_created']!({ id: 'n', cameraId: 'camOther', capturedAt: '' })
    await flush()

    expect(fetchLatestSnapshotMock).not.toHaveBeenCalled()
  })

  it('shows the "set a snapshot interval" empty state when interval is null', async () => {
    const camera = makeCamera({ snapshotIntervalMinutes: null })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(w.find('[data-testid="gallery-empty-off"]').exists()).toBe(true)
    expect(w.text()).toMatch(/set a snapshot interval/i)
  })

  it('shows the "no snapshots yet" empty state when interval is set but no snaps have arrived', async () => {
    fetchSnapshotsMock.mockResolvedValue([])
    const camera = makeCamera({ snapshotIntervalMinutes: 10 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(w.find('[data-testid="gallery-empty-none"]').exists()).toBe(true)
    expect(w.text()).toMatch(/no snapshots yet/i)
  })

  it('renders a vision badge on thumbnails whose snapshot has a cached analysis', async () => {
    const snap = makeSnap({ id: 's1' })
    fetchSnapshotsMock.mockImplementation(async () => {
      snapshotsRef.value = { cam1: [snap] }
      return [snap]
    })
    visionBySnapshotRef.value = {
      s1: { summary: 'looks good', healthScore: 9, findings: [] },
    }

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(w.find('[data-testid="snap-vision-badge"]').exists()).toBe(true)
  })

  it('does not render a vision badge when the snapshot has no cached analysis', async () => {
    const snap = makeSnap({ id: 's1' })
    fetchSnapshotsMock.mockImplementation(async () => {
      snapshotsRef.value = { cam1: [snap] }
      return [snap]
    })
    visionBySnapshotRef.value = {}

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    expect(w.find('[data-testid="snap-vision-badge"]').exists()).toBe(false)
  })

  it('renders the vision detail view with summary and findings when a cached snapshot is selected', async () => {
    const snap = makeSnap({ id: 's1' })
    fetchSnapshotsMock.mockImplementation(async () => {
      snapshotsRef.value = { cam1: [snap] }
      return [snap]
    })
    visionBySnapshotRef.value = {
      s1: {
        summary: 'yellowing leaves noted',
        healthScore: 5,
        findings: [
          {
            category: 'deficiency',
            description: 'yellowing leaves',
            confidence: 'high',
          },
        ],
      },
    }

    const camera = makeCamera({ snapshotIntervalMinutes: 5 })
    const w = mount(SnapshotGallery, {
      global: { stubs: primeVueStubs },
      props: { camera, visible: false },
    })

    await w.setProps({ visible: true })
    await flush()

    await w.get('[data-testid="gallery-thumb"]').trigger('click')
    await flush()

    const detail = w.find('[data-testid="snap-vision-detail"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('yellowing leaves noted')

    const finding = w.find('[data-testid="vision-finding-0"]')
    expect(finding.exists()).toBe(true)
    expect(finding.text()).toContain('deficiency')
    expect(finding.text()).toContain('yellowing leaves')
  })
})
