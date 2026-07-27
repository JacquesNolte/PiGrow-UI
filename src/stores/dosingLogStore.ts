import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { CreateDosingLogPayload, DosingLog } from '../types/grow'
import { API_BASE } from './apiBase'

export const useDosingLogStore = defineStore('dosingLog', () => {
  const byPhase = ref<Record<string, DosingLog[]>>({})
  const loading = ref(false)

  function setForPhase(growPhaseId: string, list: DosingLog[]): void {
    byPhase.value = { ...byPhase.value, [growPhaseId]: list }
  }

  function prependForPhase(growPhaseId: string, log: DosingLog): void {
    const current = byPhase.value[growPhaseId] ?? []
    setForPhase(growPhaseId, [log, ...current])
  }

  function removeLocal(growPhaseId: string, id: string): void {
    const current = byPhase.value[growPhaseId] ?? []
    setForPhase(
      growPhaseId,
      current.filter((log) => log.id !== id),
    )
  }

  async function list(growPhaseId: string): Promise<DosingLog[]> {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/grow-phases/${growPhaseId}/dosing-logs`)
      const logs = res.data as DosingLog[]
      setForPhase(growPhaseId, logs)
      return logs
    } finally {
      loading.value = false
    }
  }

  async function get(growPhaseId: string, id: string): Promise<DosingLog> {
    const res = await axios.get(`${API_BASE}/grow-phases/${growPhaseId}/dosing-logs/${id}`)
    return res.data as DosingLog
  }

  async function create(growPhaseId: string, payload: CreateDosingLogPayload): Promise<DosingLog> {
    const res = await axios.post(`${API_BASE}/grow-phases/${growPhaseId}/dosing-logs`, payload)
    const created = res.data as DosingLog
    prependForPhase(growPhaseId, created)
    return created
  }

  async function remove(growPhaseId: string, id: string): Promise<void> {
    await axios.delete(`${API_BASE}/grow-phases/${growPhaseId}/dosing-logs/${id}`)
    removeLocal(growPhaseId, id)
  }

  return {
    byPhase,
    create,
    get,
    list,
    loading,
    remove,
  }
})
