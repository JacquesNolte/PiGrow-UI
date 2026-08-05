import type { PhaseEnvironmentPayload } from '../types/grow'

export interface PhaseDefaultConfig {
  ph: { phMin: number; phTarget: number; phMax: number }
  dayEnv: PhaseEnvironmentPayload
  nightEnv: PhaseEnvironmentPayload
}

export interface DefaultPhaseDef extends PhaseDefaultConfig {
  name: string
  order: number
  durationDays: number
  dayStartMinutes: number
  dayDurationMinutes: number
}

function env(
  tempMin: number,
  tempTarget: number,
  tempMax: number,
  humidityMin: number,
  humidityTarget: number,
  humidityMax: number,
  co2Min: number | null,
  co2Target: number | null,
  co2Max: number | null,
): PhaseEnvironmentPayload {
  return {
    co2Max,
    co2Min,
    co2Target,
    humidityMax,
    humidityMin,
    humidityTarget,
    tempMax,
    tempMin,
    tempTarget,
  }
}

export const DEFAULT_PHASE_DEFS: DefaultPhaseDef[] = [
  {
    dayDurationMinutes: 1080,
    dayStartMinutes: 360,
    durationDays: 7,
    dayEnv: env(22, 24, 26, 75, 80, 85, null, null, null),
    name: 'Germination',
    nightEnv: env(20, 22, 24, 75, 80, 85, null, null, null),
    order: 1,
    ph: { phMax: 6.3, phMin: 5.8, phTarget: 6.0 },
  },
  {
    dayDurationMinutes: 1080,
    dayStartMinutes: 360,
    durationDays: 14,
    dayEnv: env(22, 25, 27, 65, 70, 75, null, null, null),
    name: 'Seedling',
    nightEnv: env(20, 23, 25, 65, 70, 75, null, null, null),
    order: 2,
    ph: { phMax: 6.3, phMin: 5.8, phTarget: 6.0 },
  },
  {
    dayDurationMinutes: 1080,
    dayStartMinutes: 360,
    durationDays: 28,
    dayEnv: env(22, 26, 28, 50, 60, 70, 400, 800, 1200),
    name: 'Vegetative',
    nightEnv: env(18, 22, 24, 50, 60, 70, null, null, null),
    order: 3,
    ph: { phMax: 6.4, phMin: 5.8, phTarget: 6.1 },
  },
  {
    dayDurationMinutes: 720,
    dayStartMinutes: 360,
    durationDays: 56,
    dayEnv: env(20, 26, 28, 40, 50, 55, 400, 1000, 1200),
    name: 'Flowering',
    nightEnv: env(18, 22, 24, 40, 45, 55, null, null, null),
    order: 4,
    ph: { phMax: 6.5, phMin: 5.9, phTarget: 6.2 },
  },
  {
    dayDurationMinutes: 720,
    dayStartMinutes: 360,
    durationDays: 14,
    dayEnv: env(20, 24, 26, 40, 45, 55, null, null, null),
    name: 'Flush',
    nightEnv: env(18, 21, 23, 40, 45, 55, null, null, null),
    order: 5,
    ph: { phMax: 6.5, phMin: 5.9, phTarget: 6.2 },
  },
]
