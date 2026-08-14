import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type {
  AdvisorResponse,
  CachedAdvisorAnalysis,
  GrowExportBundle,
  VisionResponse,
} from '../types/grow'
import { API_BASE } from './apiBase'

export const useAiStore = defineStore('ai', () => {
  const loading = ref(false)
  const analyzing = ref(false)
  const visionBySnapshot = ref<Record<string, VisionResponse>>({})
  const analyzingSnapshots = ref<Record<string, boolean>>({})

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

  async function getAnalysis(cycleId: string): Promise<CachedAdvisorAnalysis> {
    const res = await axios.get(`${API_BASE}/grow-cycles/${cycleId}/ai-analysis`)
    return res.data as CachedAdvisorAnalysis
  }

  async function analyzeSnapshot(snapshotId: string): Promise<VisionResponse> {
    analyzingSnapshots.value = { ...analyzingSnapshots.value, [snapshotId]: true }
    try {
      const res = await axios.post(`${API_BASE}/camera-snapshots/${snapshotId}/analyze`)
      const vision = res.data as VisionResponse
      visionBySnapshot.value = { ...visionBySnapshot.value, [snapshotId]: vision }
      return vision
    } finally {
      analyzingSnapshots.value = { ...analyzingSnapshots.value, [snapshotId]: false }
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

  return {
    analyze,
    analyzeSnapshot,
    analyzing,
    analyzingSnapshots,
    fetchExport,
    getAnalysis,
    loading,
    visionBySnapshot,
  }
})
