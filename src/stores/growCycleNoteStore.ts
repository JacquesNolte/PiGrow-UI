import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type {
  CreateGrowCycleNotePayload,
  GrowCycleNote,
  UpdateGrowCycleNotePayload,
} from '../types/grow'
import { API_BASE } from './apiBase'

export const useGrowCycleNoteStore = defineStore('growCycleNote', () => {
  const byCycle = ref<Record<string, GrowCycleNote[]>>({})
  const loading = ref(false)

  function setForCycle(cycleId: string, list: GrowCycleNote[]): void {
    byCycle.value = { ...byCycle.value, [cycleId]: list }
  }

  function prependForCycle(cycleId: string, note: GrowCycleNote): void {
    const current = byCycle.value[cycleId] ?? []
    if (current.some((entry) => entry.id === note.id)) {
      return
    }
    setForCycle(cycleId, [note, ...current])
  }

  function updateLocal(cycleId: string, note: GrowCycleNote): void {
    const current = byCycle.value[cycleId] ?? []
    setForCycle(
      cycleId,
      current.map((entry) => (entry.id === note.id ? note : entry)),
    )
  }

  function removeLocal(cycleId: string, id: string): void {
    const current = byCycle.value[cycleId] ?? []
    setForCycle(
      cycleId,
      current.filter((entry) => entry.id !== id),
    )
  }

  async function list(cycleId: string): Promise<GrowCycleNote[]> {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/grow-cycles/${cycleId}/notes`)
      const notes = res.data as GrowCycleNote[]
      setForCycle(cycleId, notes)
      return notes
    } finally {
      loading.value = false
    }
  }

  async function create(
    cycleId: string,
    payload: CreateGrowCycleNotePayload,
  ): Promise<GrowCycleNote> {
    const res = await axios.post(`${API_BASE}/grow-cycles/${cycleId}/notes`, payload)
    const created = res.data as GrowCycleNote
    prependForCycle(cycleId, created)
    return created
  }

  async function update(
    cycleId: string,
    id: string,
    payload: UpdateGrowCycleNotePayload,
  ): Promise<GrowCycleNote> {
    const res = await axios.put(`${API_BASE}/grow-cycles/${cycleId}/notes/${id}`, payload)
    const updated = res.data as GrowCycleNote
    updateLocal(cycleId, updated)
    return updated
  }

  async function remove(cycleId: string, id: string): Promise<void> {
    await axios.delete(`${API_BASE}/grow-cycles/${cycleId}/notes/${id}`)
    removeLocal(cycleId, id)
  }

  return {
    byCycle,
    create,
    list,
    loading,
    remove,
    update,
  }
})
