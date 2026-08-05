import { describe, expect, it } from 'vitest'
import { DEFAULT_PHASE_DEFS, type DefaultPhaseDef } from './growPhaseDefaults'

function hasCo2(env: {
  co2Min?: number | null
  co2Target?: number | null
  co2Max?: number | null
}): boolean {
  return env.co2Min != null || env.co2Target != null || env.co2Max != null
}

// VPD (kPa) = (1 - RH/100) * SVP(T); SVP approx 0.6108 * exp(17.27*T/(T+237.3))
function vpdKpa(tempC: number, rhPercent: number): number {
  const svp = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
  return (1 - rhPercent / 100) * svp
}

function byName(name: string): DefaultPhaseDef {
  return DEFAULT_PHASE_DEFS.find((d) => d.name === name) as DefaultPhaseDef
}

describe('DEFAULT_PHASE_DEFS', () => {
  it('has 5 canonical phases ordered 1-5', () => {
    expect(DEFAULT_PHASE_DEFS).toHaveLength(5)
    expect(DEFAULT_PHASE_DEFS.map((d) => d.order)).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_PHASE_DEFS.map((d) => d.name)).toEqual([
      'Germination',
      'Seedling',
      'Vegetative',
      'Flowering',
      'Flush',
    ])
  })

  it('uses 18/6 for germ/seedling/veg and 12/12 for flower/flush', () => {
    expect(DEFAULT_PHASE_DEFS.map((d) => d.dayDurationMinutes)).toEqual([
      1080, 1080, 1080, 720, 720,
    ])
  })

  it('starts every day at 06:00 (360 min)', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      expect(d.dayStartMinutes).toBe(360)
    }
  })

  it('keeps every threshold within the env-dialog input bounds', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      for (const e of [d.dayEnv, d.nightEnv]) {
        expect(e.tempMin).toBeGreaterThanOrEqual(-10)
        expect(e.tempMax).toBeLessThanOrEqual(50)
        expect(e.humidityMin).toBeGreaterThanOrEqual(0)
        expect(e.humidityMax).toBeLessThanOrEqual(100)
        if (e.co2Min != null) expect(e.co2Min).toBeGreaterThanOrEqual(0)
        if (e.co2Max != null) expect(e.co2Max).toBeLessThanOrEqual(10000)
      }
      expect(d.ph.phMin).toBeGreaterThanOrEqual(0)
      expect(d.ph.phMax).toBeLessThanOrEqual(14)
    }
  })

  it('keeps min <= target <= max for every band', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      for (const e of [d.dayEnv, d.nightEnv]) {
        expect(e.tempMin!).toBeLessThanOrEqual(e.tempTarget!)
        expect(e.tempTarget!).toBeLessThanOrEqual(e.tempMax!)
        expect(e.humidityMin!).toBeLessThanOrEqual(e.humidityTarget!)
        expect(e.humidityTarget!).toBeLessThanOrEqual(e.humidityMax!)
      }
      expect(d.ph.phMin).toBeLessThanOrEqual(d.ph.phTarget)
      expect(d.ph.phTarget).toBeLessThanOrEqual(d.ph.phMax)
    }
  })

  it('enriches CO2 only for Vegetative/Flowering DAY; ambient everywhere else', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      if (d.name === 'Vegetative' || d.name === 'Flowering') {
        expect(hasCo2(d.dayEnv)).toBe(true)
        expect(hasCo2(d.nightEnv)).toBe(false)
      } else {
        expect(hasCo2(d.dayEnv)).toBe(false)
        expect(hasCo2(d.nightEnv)).toBe(false)
      }
    }
  })

  it('keeps day VPD in sane bands per stage', () => {
    expect(
      vpdKpa(
        byName('Germination').dayEnv.tempTarget!,
        byName('Germination').dayEnv.humidityTarget!,
      ),
    ).toBeLessThan(1.2)
    expect(
      vpdKpa(byName('Seedling').dayEnv.tempTarget!, byName('Seedling').dayEnv.humidityTarget!),
    ).toBeLessThan(1.2)
    for (const name of ['Vegetative', 'Flowering', 'Flush']) {
      const d = byName(name)
      const v = vpdKpa(d.dayEnv.tempTarget!, d.dayEnv.humidityTarget!)
      expect(v).toBeGreaterThan(0.4)
      expect(v).toBeLessThan(2.0)
    }
  })

  it('drops night temperature ~4C below day target for each phase', () => {
    for (const d of DEFAULT_PHASE_DEFS) {
      const diff = d.dayEnv.tempTarget! - d.nightEnv.tempTarget!
      expect(diff).toBeGreaterThanOrEqual(2)
      expect(diff).toBeLessThanOrEqual(5)
    }
  })
})
