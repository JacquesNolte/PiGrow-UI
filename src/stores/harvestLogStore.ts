import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios, { isAxiosError } from 'axios'
import type { HarvestLog, UpsertHarvestLogPayload } from '../types/grow'
import { API_BASE } from './apiBase'

export const useHarvestLogStore = defineStore('harvestLog', () => {
  const byCycle = ref<Record<string, HarvestLog | null>>({})
  const loading = ref(false)

  function setForCycle(cycleId: string, log: HarvestLog | null): void {
    byCycle.value = { ...byCycle.value, [cycleId]: log }
  }

  async function get(cycleId: string): Promise<HarvestLog | null> {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/grow-cycles/${cycleId}/harvest-log`)
      const log = res.data as HarvestLog
      setForCycle(cycleId, log)
      return log
    } catch (err) {
      // 404 means no harvest log exists yet — return null without surfacing an
      // error so the dialog can present a blank create form instead of a toast.
      if (isAxiosError(err) && err.response?.status === 404) {
        setForCycle(cycleId, null)
        return null
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  async function upsert(cycleId: string, payload: UpsertHarvestLogPayload): Promise<HarvestLog> {
    const res = await axios.put(`${API_BASE}/grow-cycles/${cycleId}/harvest-log`, payload)
    const log = res.data as HarvestLog
    setForCycle(cycleId, log)
    return log
  }

  async function remove(cycleId: string): Promise<void> {
    await axios.delete(`${API_BASE}/grow-cycles/${cycleId}/harvest-log`)
    setForCycle(cycleId, null)
  }

  return {
    byCycle,
    get,
    loading,
    remove,
    upsert,
  }
})
