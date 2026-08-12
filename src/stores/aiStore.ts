import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { AdvisorResponse, GrowExportBundle } from '../types/grow'
import { API_BASE } from './apiBase'

export const useAiStore = defineStore('ai', () => {
  const loading = ref(false)
  const analyzing = ref(false)

  async function analyze(cycleId: string, windowDays?: number): Promise<AdvisorResponse> {
    analyzing.value = true
    try {
      const body: { windowDays?: number } = {}
      if (windowDays != null) {
        body.windowDays = windowDays
      }
      const res = await axios.post(`${API_BASE}/grow-cycles/${cycleId}/ai-analyze`, body)
      return res.data as AdvisorResponse
    } finally {
      analyzing.value = false
    }
  }

  async function fetchExport(
    cycleId: string,
    opts?: { from?: string; to?: string; bucketMinutes?: number },
  ): Promise<GrowExportBundle> {
    loading.value = true
    try {
      const params: Record<string, string> = {}
      if (opts?.from) params.from = opts.from
      if (opts?.to) params.to = opts.to
      if (opts?.bucketMinutes != null) params.bucketMinutes = String(opts.bucketMinutes)
      const res = await axios.get(`${API_BASE}/grow-cycles/${cycleId}/ai-export`, { params })
      return res.data as GrowExportBundle
    } finally {
      loading.value = false
    }
  }

  return { analyze, analyzing, fetchExport, loading }
})
