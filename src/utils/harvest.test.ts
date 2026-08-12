import { describe, expect, it } from 'vitest'
import { canLogHarvest } from './harvest'

describe('canLogHarvest', () => {
  it('returns true for a started but not active cycle', () => {
    expect(canLogHarvest({ isActive: false, startAt: '2026-01-01' })).toBe(true)
  })

  it('returns false for an active cycle', () => {
    expect(canLogHarvest({ isActive: true, startAt: '2026-01-01' })).toBe(false)
  })

  it('returns false for a never-started cycle', () => {
    expect(canLogHarvest({ isActive: false, startAt: null })).toBe(false)
  })
})
