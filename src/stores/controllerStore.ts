import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type {
  ClaimRequest,
  ClaimResponse,
  Controller,
  ScanResponse,
  SensorSeed,
} from '../types/grow'
import { API_BASE } from './apiBase'

export interface CreateControllerPayload {
  macAddress: string
  name: string
  ipAddress: string
  sensors?: SensorSeed[]
}

export const useControllerStore = defineStore('controller', () => {
  const controllers = ref<Controller[]>([])
  const loading = ref(false)

  async function fetchAll() {
    const res = await axios.get(`${API_BASE}/controllers`)
    controllers.value = res.data
  }

  async function createController(payload: CreateControllerPayload) {
    const res = await axios.post(`${API_BASE}/controllers`, payload)
    controllers.value.push(res.data)
    return res.data as Controller
  }

  async function updateController(id: string, payload: Partial<Controller>) {
    const res = await axios.put(`${API_BASE}/controllers/${id}`, payload)
    const idx = controllers.value.findIndex((c) => c.id === id)
    if (idx !== -1) {
      controllers.value[idx] = res.data
    }
  }

  async function deleteController(id: string) {
    await axios.delete(`${API_BASE}/controllers/${id}`)
    controllers.value = controllers.value.filter((c) => c.id !== id)
  }

  async function fetchController(id: string) {
    const res = await axios.get(`${API_BASE}/controllers/${id}`)
    const idx = controllers.value.findIndex((c) => c.id === id)
    if (idx !== -1) {
      controllers.value[idx] = res.data
    } else {
      controllers.value.push(res.data)
    }
    return res.data as Controller
  }

  async function scanControllers() {
    const res = await axios.get(`${API_BASE}/controllers/scan`)
    return res.data as ScanResponse
  }

  async function claimController(payload: ClaimRequest) {
    const res = await axios.post(`${API_BASE}/controllers/claim`, payload)
    const claimed = (res.data as ClaimResponse).controller
    const idx = controllers.value.findIndex((c) => c.id === claimed.id)
    if (idx !== -1) {
      controllers.value[idx] = claimed
    } else {
      controllers.value.push(claimed)
    }
    return claimed
  }

  return {
    claimController,
    controllers,
    createController,
    deleteController,
    fetchAll,
    fetchController,
    loading,
    scanControllers,
    updateController,
  }
})
