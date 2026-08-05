import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const useConfirmMock = { require: vi.fn() }
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => useConfirmMock,
}))

import { CameraConflictError } from '../../stores/cameraStore'
import type { Camera } from '../../types/grow'

const linkedControllerRef = ref<{ id: string } | null>({ id: 'ctrl1' })
const currentCycleRef = ref<{ controllerId: string } | undefined>({ controllerId: 'ctrl1' })
const socketRef = ref<unknown>(null)

vi.mock('./useGrowMonitorState', () => ({
  useProvidedGrowMonitorState: () => ({
    linkedController: linkedControllerRef,
    currentCycle: currentCycleRef,
    liveTelemetry: { socket: socketRef },
  }),
}))

let camerasRef = ref<Camera[]>([])
let latestSnapshotRef = ref<Record<string, unknown | null>>({})
const fetchCamerasMock = vi.fn()
const fetchLatestSnapshotMock = vi.fn()
const createCameraMock = vi.fn()
const updateCameraMock = vi.fn()
const deleteCameraMock = vi.fn()

vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    get cameras() {
      return camerasRef.value
    },
    get latestSnapshot() {
      return latestSnapshotRef.value as never
    },
    fetchCameras: fetchCamerasMock,
    fetchLatestSnapshot: fetchLatestSnapshotMock,
    createCamera: createCameraMock,
    updateCamera: updateCameraMock,
    deleteCamera: deleteCameraMock,
  }),
}))

import LiveFeedTab from './LiveFeedTab.vue'
import { primeVueStubs } from '../../utils/testStub'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function makeCamera(over: Partial<Camera> = {}): Camera {
  return {
    createdAt: '2026-07-27T00:00:00.000Z',
    id: 'cam1',
    name: 'Grow Cam',
    streamName: 'cam1',
    controllerId: 'ctrl1',
    snapshotUrl: 'http://go2rtc:8555/api/frame.jpeg?src=cam1',
    updatedAt: '2026-07-27T00:00:00.000Z',
    webrtcUrl: 'http://go2rtc:8555/stream.html?src=cam1',
    warnings: [],
    snapshotIntervalMinutes: null,
    ...over,
  }
}

function setInput(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const el = wrapper.get(`[data-testid="${testid}"]`).element as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('LiveFeedTab', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    camerasRef = ref<Camera[]>([])
    latestSnapshotRef = ref<Record<string, unknown | null>>({})
    fetchCamerasMock.mockReset()
    fetchLatestSnapshotMock.mockReset()
    fetchLatestSnapshotMock.mockResolvedValue(null)
    createCameraMock.mockReset()
    updateCameraMock.mockReset()
    deleteCameraMock.mockReset()
    useConfirmMock.require.mockReset()
    linkedControllerRef.value = { id: 'ctrl1' }
    currentCycleRef.value = { controllerId: 'ctrl1' }
    socketRef.value = null
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
  })

  it('renders the empty state and calls fetchCameras on mount', async () => {
    const w = mount(LiveFeedTab, { global: { stubs: primeVueStubs } })
    await flush()

    expect(fetchCamerasMock).toHaveBeenCalledTimes(1)
    expect(w.find('[data-testid="camera-empty"]').exists()).toBe(true)
    expect(w.text()).toMatch(/no cameras for this grow yet/i)
    expect(w.find('[data-testid="add-camera-btn"]').exists()).toBe(true)
    expect(w.find('[data-testid="add-camera-empty"]').exists()).toBe(true)
  })

  it('renders one CameraTile per matching camera and hides cameras on other controllers', async () => {
    camerasRef.value = [
      makeCamera({ id: 'camA', controllerId: 'ctrl1', name: 'Tent' }),
      makeCamera({ id: 'camB', controllerId: 'ctrl2', name: 'Other' }),
    ]
    const w = mount(LiveFeedTab, { global: { stubs: primeVueStubs } })
    await flush()

    expect(w.find('[data-testid="camera-tile-camA"]').exists()).toBe(true)
    expect(w.find('[data-testid="camera-tile-camB"]').exists()).toBe(false)
  })

  it('creates a camera with this grow controllerId and the new tile appears on success', async () => {
    const created = makeCamera({ id: 'camNew', name: 'Garage', streamName: 'garage' })
    createCameraMock.mockImplementation(async () => {
      camerasRef.value = [...camerasRef.value, created]
      return created
    })

    const w = mount(LiveFeedTab, { global: { stubs: primeVueStubs } })
    await flush()

    await w.get('[data-testid="add-camera-btn"]').trigger('click')
    await flush()

    setInput(w, 'cam-name', 'Garage')
    setInput(w, 'cam-stream', 'garage')
    setInput(w, 'cam-rtsp', 'rtsp://10.0.0.1/stream')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(createCameraMock).toHaveBeenCalledWith({
      name: 'Garage',
      streamName: 'garage',
      rtspUrl: 'rtsp://10.0.0.1/stream',
      controllerId: 'ctrl1',
    })
    expect(w.find('[data-testid="camera-tile-camNew"]').exists()).toBe(true)
  })

  it('shows a field-level error on streamName and keeps the dialog open on a 409 conflict', async () => {
    createCameraMock.mockRejectedValue(new CameraConflictError('existing-id'))

    const w = mount(LiveFeedTab, { global: { stubs: primeVueStubs } })
    await flush()

    await w.get('[data-testid="add-camera-btn"]').trigger('click')
    await flush()

    setInput(w, 'cam-name', 'Dup')
    setInput(w, 'cam-stream', 'dup-stream')
    setInput(w, 'cam-rtsp', 'rtsp://10.0.0.1/stream')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(createCameraMock).toHaveBeenCalledTimes(1)
    const streamError = w.find('[data-testid="cam-stream-error"]')
    expect(streamError.exists()).toBe(true)
    expect(streamError.text()).toMatch(/already exists/i)
    // dialog stayed open: the save button is still rendered
    expect(w.find('[data-testid="cam-save"]').exists()).toBe(true)
  })

  it('deletes a camera after the confirm dialog is accepted and the tile disappears', async () => {
    camerasRef.value = [makeCamera({ id: 'cam1', name: 'Tent' })]
    deleteCameraMock.mockImplementation(async () => {
      camerasRef.value = camerasRef.value.filter((c) => c.id !== 'cam1')
    })

    const w = mount(LiveFeedTab, { global: { stubs: primeVueStubs } })
    await flush()

    expect(w.find('[data-testid="camera-tile-cam1"]').exists()).toBe(true)

    await w.get('[data-testid="camera-delete"]').trigger('click')
    await flush()

    expect(useConfirmMock.require).toHaveBeenCalledTimes(1)
    const options = useConfirmMock.require.mock.calls[0]![0] as { accept: () => void }
    options.accept()
    await flush()

    expect(deleteCameraMock).toHaveBeenCalledWith('cam1')
    expect(w.find('[data-testid="camera-tile-cam1"]').exists()).toBe(false)
  })
})
