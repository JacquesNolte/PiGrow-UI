import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type {
  AutomationRule,
  CreateAutomationRulePayload,
  UpdateAutomationRulePayload,
} from '../types/grow'
import { API_BASE } from './apiBase'

export const useAutomationRuleStore = defineStore('automationRule', () => {
  const loading = ref(false)
  async function fetchRulesByPhase(growPhaseId: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/automation-rules/grow-phase/${growPhaseId}`)
      return res.data as AutomationRule[]
    } finally {
      loading.value = false
    }
  }

  async function fetchRulesByCycle(growCycleId: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/automation-rules/grow-cycle/${growCycleId}`)
      return res.data as AutomationRule[]
    } finally {
      loading.value = false
    }
  }

  async function fetchRulesByDevice(deviceId: string) {
    loading.value = true
    try {
      const res = await axios.get(`${API_BASE}/automation-rules/device/${deviceId}`)
      return res.data as AutomationRule[]
    } finally {
      loading.value = false
    }
  }

  async function createRule(payload: CreateAutomationRulePayload) {
    loading.value = true
    try {
      const res = await axios.post(`${API_BASE}/automation-rules`, payload)
      return res.data as AutomationRule
    } finally {
      loading.value = false
    }
  }

  async function updateRule(id: string, payload: UpdateAutomationRulePayload) {
    loading.value = true
    try {
      const res = await axios.put(`${API_BASE}/automation-rules/${id}`, payload)
      return res.data as AutomationRule
    } finally {
      loading.value = false
    }
  }

  async function toggleRule(id: string) {
    loading.value = true
    try {
      const res = await axios.patch(`${API_BASE}/automation-rules/${id}/toggle`)
      return res.data as AutomationRule
    } finally {
      loading.value = false
    }
  }

  async function deleteRule(id: string) {
    loading.value = true
    try {
      await axios.delete(`${API_BASE}/automation-rules/${id}`)
    } finally {
      loading.value = false
    }
  }

  return {
    createRule,
    deleteRule,
    fetchRulesByCycle,
    fetchRulesByDevice,
    fetchRulesByPhase,
    loading,
    toggleRule,
    updateRule,
  }
})
