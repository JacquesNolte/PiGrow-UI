import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('primevue/usetoast', () => ({
  useToast: () => ({ add: vi.fn() }),
}))

const createCameraMock = vi.fn()
const updateCameraMock = vi.fn()
vi.mock('../../stores/apiStore', () => ({
  useApiStore: () => ({
    createCamera: createCameraMock,
    updateCamera: updateCameraMock,
  }),
}))

import CameraFormDialog from './CameraFormDialog.vue'
import { primeVueStubs } from '../../utils/testStub'
import type { Camera } from '../../types/grow'

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

function setInput(wrapper: ReturnType<typeof mount>, testid: string, value: string) {
  const el = wrapper.get(`[data-testid="${testid}"]`).element as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

async function openDialog(props: Record<string, unknown> = {}) {
  const w = mount(CameraFormDialog, {
    global: { stubs: primeVueStubs },
    props: { camera: null, defaultControllerId: 'ctrl1', ...props, visible: false },
  })
  await w.setProps({ visible: true })
  await flush()
  return w
}

describe('CameraFormDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createCameraMock.mockReset()
    updateCameraMock.mockReset()
    createCameraMock.mockResolvedValue(makeCamera({ id: 'camNew' }))
    updateCameraMock.mockImplementation(async (id: string, payload: Partial<Camera>) =>
      makeCamera({ id, ...payload }),
    )
  })

  afterEach(() => {
    setActivePinia(null as unknown as ReturnType<typeof createPinia>)
    vi.restoreAllMocks()
  })

  it('omits snapshotIntervalMinutes from the create payload when the interval field is empty', async () => {
    const w = await openDialog({ defaultControllerId: 'ctrl1', camera: null })

    setInput(w, 'cam-name', 'Garage')
    setInput(w, 'cam-stream', 'garage')
    setInput(w, 'cam-rtsp', 'rtsp://10.0.0.1/stream')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(createCameraMock).toHaveBeenCalledTimes(1)
    const payload = createCameraMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('snapshotIntervalMinutes')
  })

  it('includes snapshotIntervalMinutes in the create payload when set to 10', async () => {
    const w = await openDialog({ defaultControllerId: 'ctrl1', camera: null })

    setInput(w, 'cam-name', 'Garage')
    setInput(w, 'cam-stream', 'garage')
    setInput(w, 'cam-rtsp', 'rtsp://10.0.0.1/stream')
    setInput(w, 'cam-interval', '10')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(createCameraMock).toHaveBeenCalledWith({
      controllerId: 'ctrl1',
      name: 'Garage',
      rtspUrl: 'rtsp://10.0.0.1/stream',
      snapshotIntervalMinutes: 10,
      streamName: 'garage',
    })
  })

  it('prefills snapshotIntervalMinutes in edit mode and includes it in PATCH when changed', async () => {
    const w = await openDialog({
      defaultControllerId: 'ctrl1',
      camera: makeCamera({ snapshotIntervalMinutes: 5 }),
    })

    expect((w.get('[data-testid="cam-interval"]').element as HTMLInputElement).value).toBe('5')

    setInput(w, 'cam-interval', '15')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(updateCameraMock).toHaveBeenCalledTimes(1)
    const [calledId, payload] = updateCameraMock.mock.calls[0]!
    expect(calledId).toBe('cam1')
    expect(payload).toMatchObject({ snapshotIntervalMinutes: 15 })
  })

  it('sends snapshotIntervalMinutes: null in PATCH when cleared to disable', async () => {
    const w = await openDialog({
      defaultControllerId: 'ctrl1',
      camera: makeCamera({ snapshotIntervalMinutes: 10 }),
    })

    expect((w.get('[data-testid="cam-interval"]').element as HTMLInputElement).value).toBe('10')

    setInput(w, 'cam-interval', '')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(updateCameraMock).toHaveBeenCalledTimes(1)
    const [, payload] = updateCameraMock.mock.calls[0]!
    expect(payload).toMatchObject({ snapshotIntervalMinutes: null })
  })

  it('does not include snapshotIntervalMinutes in PATCH when unchanged from current value', async () => {
    const w = await openDialog({
      defaultControllerId: 'ctrl1',
      camera: makeCamera({ snapshotIntervalMinutes: 7 }),
    })

    setInput(w, 'cam-name', 'Renamed')
    await flush()

    await w.get('[data-testid="cam-save"]').trigger('click')
    await flush()

    expect(updateCameraMock).toHaveBeenCalledTimes(1)
    const [, payload] = updateCameraMock.mock.calls[0]!
    expect(payload).not.toHaveProperty('snapshotIntervalMinutes')
    expect(payload).toMatchObject({ name: 'Renamed' })
  })
})
