import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { Sensor, SensorSeed } from '../types/grow'
import { API_BASE } from './apiBase'
import { useControllerStore } from './controllerStore'

export type CreateSensorPayload = SensorSeed & {
  controllerId: string
}

export interface UpdateSensorPayload {
  name?: string
  type?: Sensor['type']
  pinNumbers?: number[]
  protocol?: Sensor['protocol']
  lastActive?: string
}

export const useSensorStore = defineStore('sensor', () => {
  const loading = ref(false)

  function findController(controllerId: string) {
    const { controllers } = useControllerStore()
    return controllers.find((c) => c.id === controllerId) as
      | ((typeof controllers)[number] & { sensors?: Sensor[] })
      | undefined
  }

  function findSensorOnController(controllerId: string, sensorId: string): Sensor | undefined {
    return findController(controllerId)?.sensors?.find((s) => s.id === sensorId)
  }

  function ensureSensorsArray(controllerId: string): Sensor[] | undefined {
    const controller = findController(controllerId)
    if (!controller) {
      return undefined
    }
    if (!controller.sensors) {
      controller.sensors = []
    }
    return controller.sensors
  }

  async function fetchSensors(controllerId: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/sensors/controller/${controllerId}`)
      const sensors = res.data as Sensor[]
      const controller = findController(controllerId)
      if (controller) {
        controller.sensors = sensors
      }
      return sensors
    } finally {
      loading.value = false
    }
  }

  async function fetchSensor(id: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/sensors/${id}`)
      return res.data as Sensor & {
        controller: { id: string; name: string; status: 'ONLINE' | 'OFFLINE' | 'ERROR' }
      }
    } finally {
      loading.value = false
    }
  }

  async function createSensor(payload: CreateSensorPayload) {
    loading.value = true
    try {
      const { controllerId, ...seed } = payload
      const res = await axios.post(`${API_BASE}/sensors`, { controllerId, ...seed })
      const created = res.data as Sensor
      const arr = ensureSensorsArray(controllerId)
      if (arr) {
        arr.push(created)
      }
      return created
    } finally {
      loading.value = false
    }
  }

  async function updateSensor(id: string, controllerId: string, payload: UpdateSensorPayload) {
    loading.value = true
    try {
      const res = await axios.put(`${API_BASE}/sensors/${id}`, payload)
      const updated = res.data as Sensor
      const found = findSensorOnController(controllerId, id)
      if (found) {
        Object.assign(found, updated)
      }
      return updated
    } finally {
      loading.value = false
    }
  }

  async function deleteSensor(id: string, controllerId: string) {
    loading.value = true
    try {
      await axios.delete(`${API_BASE}/sensors/${id}`)
      const controller = findController(controllerId)
      if (controller?.sensors) {
        controller.sensors = controller.sensors.filter((s) => s.id !== id)
      }
    } finally {
      loading.value = false
    }
  }

  return {
    createSensor,
    deleteSensor,
    fetchSensor,
    fetchSensors,
    findSensorOnController,
    loading,
    updateSensor,
  }
})
