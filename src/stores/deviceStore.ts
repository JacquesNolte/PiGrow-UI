import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Device, DeviceSeed, DeviceStateLog } from '../types/grow'
import { API_BASE } from './apiBase'
import { useControllerStore } from './controllerStore'

export const useDeviceStore = defineStore('device', () => {
  const loading = ref(false)

  function findController(controllerId: string) {
    const { controllers } = useControllerStore()
    return controllers.find((c) => c.id === controllerId) as
      | ((typeof controllers)[number] & { devices?: Device[] })
      | undefined
  }

  function findDeviceOnController(controllerId: string, deviceId: string): Device | undefined {
    return findController(controllerId)?.devices?.find((d) => d.id === deviceId)
  }

  function ensureDevicesArray(controllerId: string): Device[] | undefined {
    const controller = findController(controllerId)
    if (!controller) {
      return undefined
    }
    if (!controller.devices) {
      controller.devices = []
    }
    return controller.devices
  }

  async function fetchDevices(controllerId: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/devices/controller/${controllerId}`)
      const devices = res.data as Device[]
      const arr = ensureDevicesArray(controllerId)
      if (arr) {
        const incomingIds = new Set<string>()
        for (const device of devices) {
          incomingIds.add(device.id)
          const idx = arr.findIndex((d) => d.id === device.id)
          if (idx !== -1) {
            Object.assign(arr[idx]!, device)
          } else {
            arr.push(device)
          }
        }
        for (let i = arr.length - 1; i >= 0; i--) {
          const existing = arr[i]
          if (existing && !incomingIds.has(existing.id)) {
            arr.splice(i, 1)
          }
        }
      }
      return devices
    } finally {
      loading.value = false
    }
  }

  function updateDeviceInCache(controllerId: string, device: Partial<Device> & { id: string }) {
    const arr = ensureDevicesArray(controllerId)
    if (!arr) {
      return
    }
    const idx = arr.findIndex((d) => d.id === device.id)
    if (idx !== -1) {
      Object.assign(arr[idx]!, device)
    }
  }

  function removeDeviceFromCache(controllerId: string, deviceId: string) {
    const arr = ensureDevicesArray(controllerId)
    if (arr) {
      const idx = arr.findIndex((d) => d.id === deviceId)
      if (idx !== -1) {
        arr.splice(idx, 1)
      }
    }
  }

  async function createDevice(payload: { controllerId: string } & DeviceSeed) {
    loading.value = true
    try {
      const { controllerId, ...seed } = payload
      const res = await axios.post(`${API_BASE}/devices`, { controllerId, ...seed })
      const created = res.data as Device
      const arr = ensureDevicesArray(controllerId)
      if (arr) {
        arr.push(created)
      }
      return created
    } finally {
      loading.value = false
    }
  }

  async function createDevicesBatch(controllerId: string, devices: DeviceSeed[]) {
    loading.value = true
    try {
      const res = await axios.post(`${API_BASE}/devices/batch`, { controllerId, devices })
      const created = res.data as Device[]
      const arr = ensureDevicesArray(controllerId)
      if (arr) {
        arr.push(...created)
      }
      return created
    } finally {
      loading.value = false
    }
  }

  async function updateDevice(id: string, controllerId: string, payload: Partial<DeviceSeed>) {
    loading.value = true
    try {
      const res = await axios.put(`${API_BASE}/devices/${id}`, payload)
      const updated = res.data as Device
      updateDeviceInCache(controllerId, updated)
      return updated
    } finally {
      loading.value = false
    }
  }

  async function deleteDevice(id: string, controllerId: string) {
    loading.value = true
    try {
      await axios.delete(`${API_BASE}/devices/${id}`)
      removeDeviceFromCache(controllerId, id)
    } finally {
      loading.value = false
    }
  }

  async function sendDeviceCommand(deviceId: string, controllerId: string, action: 'ON' | 'OFF') {
    loading.value = true
    try {
      await axios.post(`${API_BASE}/devices/${deviceId}/command`, { action })
      updateDeviceInCache(controllerId, { id: deviceId, isActive: action === 'ON' })
    } finally {
      loading.value = false
    }
  }

  async function fetchDeviceStateLogs(
    deviceId: string,
    params?: { from?: string; to?: string; limit?: number },
  ) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/devices/${deviceId}/state-logs`, { params })
      return res.data as { logs: DeviceStateLog[]; priorAction: 'ON' | 'OFF' | null }
    } finally {
      loading.value = false
    }
  }

  let pollingTimer: ReturnType<typeof setInterval> | null = null

  function pollDevices(controllerId: string, intervalMs = 5000) {
    stopDevicePolling()
    pollingTimer = setInterval(async () => {
      try {
        await fetchDevices(controllerId)
      } catch {
        // Polling errors are non-critical
      }
    }, intervalMs)
  }

  function stopDevicePolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  return {
    createDevice,
    createDevicesBatch,
    deleteDevice,
    fetchDeviceStateLogs,
    fetchDevices,
    findDeviceOnController,
    loading,
    pollDevices,
    removeDeviceFromCache,
    sendDeviceCommand,
    stopDevicePolling,
    updateDevice,
    updateDeviceInCache,
  }
})
