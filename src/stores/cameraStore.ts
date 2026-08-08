import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios, { isAxiosError } from 'axios'
import type {
  Camera,
  CameraSnapshot,
  CreateCameraPayload,
  UpdateCameraPayload,
} from '../types/grow'
import { API_BASE } from './apiBase'
import { extractApiError } from '../utils/errors'

export class CameraConflictError extends Error {
  existingId: string | null
  constructor(existingId: string | null = null) {
    super('CAMERA_STREAM_NAME_CONFLICT')
    this.name = 'CameraConflictError'
    this.existingId = existingId
  }
}

function toConflict(err: unknown): CameraConflictError | null {
  if (isAxiosError(err) && err.response?.status === 409) {
    const data = err.response?.data as { error?: string; existingId?: string } | undefined
    if (data?.error === 'CAMERA_STREAM_NAME_CONFLICT') {
      return new CameraConflictError(data.existingId ?? null)
    }
  }
  return null
}

export const useCameraStore = defineStore('camera', () => {
  const cameras = ref<Camera[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const snapshots = ref<Record<string, CameraSnapshot[]>>({})
  const latestSnapshot = ref<Record<string, CameraSnapshot | null>>({})
  const loadingSnapshots = ref(false)

  async function fetchSnapshots(
    cameraId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<CameraSnapshot[]> {
    loadingSnapshots.value = true
    error.value = null
    try {
      const params: { limit?: number; before?: string } = {}
      if (opts?.limit !== undefined) params.limit = opts.limit
      if (opts?.before !== undefined) params.before = opts.before
      const res = await axios.get(`${API_BASE}/cameras/${cameraId}/snapshots`, { params })
      const data = res.data as CameraSnapshot[]
      snapshots.value[cameraId] =
        opts?.before && snapshots.value[cameraId] ? [...snapshots.value[cameraId], ...data] : data
      const newest = data[0]
      if (newest) latestSnapshot.value[cameraId] = newest
      return data
    } catch (err) {
      error.value = extractApiError(err, 'Failed to load snapshots').message
      throw err
    } finally {
      loadingSnapshots.value = false
    }
  }

  async function fetchLatestSnapshot(cameraId: string): Promise<CameraSnapshot | null> {
    error.value = null
    try {
      const res = await axios.get(`${API_BASE}/cameras/${cameraId}/snapshots/latest`)
      latestSnapshot.value[cameraId] = res.data as CameraSnapshot
      return res.data as CameraSnapshot
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 404 || err.response?.status === 409)) {
        latestSnapshot.value[cameraId] = null
        return null
      }
      error.value = extractApiError(err, 'Failed to load latest snapshot').message
      throw err
    }
  }

  function prependSnapshot(cameraId: string, snap: CameraSnapshot): void {
    const existing = snapshots.value[cameraId] ?? []
    snapshots.value[cameraId] = [snap, ...existing.filter((item) => item.id !== snap.id)]
    latestSnapshot.value[cameraId] = snap
  }

  async function fetchCameras(): Promise<Camera[]> {
    loading.value = true
    error.value = null
    try {
      const res = await axios.get(`${API_BASE}/cameras`)
      cameras.value = res.data as Camera[]
      return cameras.value
    } catch (err) {
      error.value = extractApiError(err, 'Failed to load cameras').message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function create(payload: CreateCameraPayload): Promise<Camera> {
    error.value = null
    try {
      const res = await axios.post(`${API_BASE}/cameras`, payload)
      const created = res.data as Camera
      const idx = cameras.value.findIndex((c) => c.id === created.id)
      if (idx === -1) {
        cameras.value.push(created)
      } else {
        cameras.value[idx] = created
      }
      return created
    } catch (err) {
      const conflict = toConflict(err)
      error.value = conflict
        ? 'Stream name already in use'
        : extractApiError(err, 'Failed to create camera').message
      throw conflict ?? err
    }
  }

  async function update(id: string, payload: UpdateCameraPayload): Promise<Camera> {
    error.value = null
    try {
      const res = await axios.patch(`${API_BASE}/cameras/${id}`, payload)
      const updated = res.data as Camera
      const idx = cameras.value.findIndex((c) => c.id === id)
      if (idx !== -1) {
        cameras.value[idx] = updated
      }
      return updated
    } catch (err) {
      const conflict = toConflict(err)
      error.value = conflict
        ? 'Stream name already in use'
        : extractApiError(err, 'Failed to update camera').message
      throw conflict ?? err
    }
  }

  async function remove(id: string): Promise<void> {
    error.value = null
    try {
      await axios.delete(`${API_BASE}/cameras/${id}`)
      cameras.value = cameras.value.filter((c) => c.id !== id)
    } catch (err) {
      error.value = extractApiError(err, 'Failed to delete camera').message
      throw err
    }
  }

  return {
    cameras,
    create,
    error,
    fetchLatestSnapshot,
    fetchSnapshots,
    fetchCameras,
    latestSnapshot,
    loading,
    loadingSnapshots,
    prependSnapshot,
    remove,
    snapshots,
    update,
  }
})
