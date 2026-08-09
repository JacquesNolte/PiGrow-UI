<script setup lang="ts">
import { computed } from 'vue'
import InputNumber from 'primevue/inputnumber'

const props = defineProps<{
  modelValue: number | null
  testId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

function decompose(total: number): { d: number; h: number; m: number; s: number } {
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return { d, h, m, s }
}

function setPart(part: 'd' | 'h' | 'm' | 's', v: number): void {
  const cur = decompose(props.modelValue ?? 0)
  cur[part] = Math.max(0, Math.floor(v || 0))
  emit('update:modelValue', cur.d * 86400 + cur.h * 3600 + cur.m * 60 + cur.s)
}

const days = computed<number>({
  get: () => decompose(props.modelValue ?? 0).d,
  set: (v) => setPart('d', v),
})
const hours = computed<number>({
  get: () => decompose(props.modelValue ?? 0).h,
  set: (v) => setPart('h', v),
})
const minutes = computed<number>({
  get: () => decompose(props.modelValue ?? 0).m,
  set: (v) => setPart('m', v),
})
const seconds = computed<number>({
  get: () => decompose(props.modelValue ?? 0).s,
  set: (v) => setPart('s', v),
})
</script>

<template>
  <div class="duration-input" :data-testid="testId">
    <div class="duration-field">
      <InputNumber
        v-model="days"
        :min="0"
        show-buttons
        class="duration-number"
        :data-testid="`${testId}-days`"
      />
      <span class="duration-label">days</span>
    </div>
    <div class="duration-field">
      <InputNumber
        v-model="hours"
        :min="0"
        :max="23"
        show-buttons
        class="duration-number"
        :data-testid="`${testId}-hours`"
      />
      <span class="duration-label">hrs</span>
    </div>
    <div class="duration-field">
      <InputNumber
        v-model="minutes"
        :min="0"
        :max="59"
        show-buttons
        class="duration-number"
        :data-testid="`${testId}-minutes`"
      />
      <span class="duration-label">min</span>
    </div>
    <div class="duration-field">
      <InputNumber
        v-model="seconds"
        :min="0"
        :max="59"
        show-buttons
        class="duration-number"
        :data-testid="`${testId}-seconds`"
      />
      <span class="duration-label">sec</span>
    </div>
  </div>
</template>

<style scoped>
.duration-input {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.duration-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.duration-number {
  width: 4.5rem;
}

.duration-label {
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>
