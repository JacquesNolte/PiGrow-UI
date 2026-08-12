import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { GrowAlert } from '../types/grow'
import { API_BASE } from './apiBase'

export const useAlertStore = defineStore('growAlert', () => {
  const byCycle = ref<Record<string, GrowAlert[]>>({})
  const loading = ref(false)

  function setForCycle(cycleId: string, alerts: GrowAlert[]): void {
    byCycle.value = { ...byCycle.value, [cycleId]: alerts }
  }

  function updateLocal(cycleId: string, alert: GrowAlert): void {
    const current = byCycle.value[cycleId] ?? []
    setForCycle(
      cycleId,
      current.map((entry) => (entry.id === alert.id ? alert : entry)),
    )
  }

  async function list(cycleId: string, resolved?: boolean): Promise<GrowAlert[]> {
    loading.value = true
    try {
      const params: { resolved?: boolean } = {}
      if (resolved !== undefined) {
        params.resolved = resolved
      }
      const res = await axios.get(`${API_BASE}/grow-cycles/${cycleId}/alerts`, { params })
      const data = res.data as GrowAlert[]
      setForCycle(cycleId, data)
      return data
    } finally {
      loading.value = false
    }
  }

  async function setResolved(alertId: string, resolved: boolean): Promise<GrowAlert> {
    const res = await axios.patch(`${API_BASE}/alerts/${alertId}`, { resolved })
    return res.data as GrowAlert
  }

  return { byCycle, list, loading, setResolved, updateLocal }
})
