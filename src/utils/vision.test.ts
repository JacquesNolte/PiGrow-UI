import { describe, expect, it } from 'vitest'
import { healthScoreClass } from './vision'

describe('healthScoreClass', () => {
  it('returns good for 7-10', () => {
    expect(healthScoreClass(7)).toBe('good')
    expect(healthScoreClass(10)).toBe('good')
  })

  it('returns ok for 4-6', () => {
    expect(healthScoreClass(4)).toBe('ok')
    expect(healthScoreClass(6)).toBe('ok')
  })

  it('returns bad for 1-3', () => {
    expect(healthScoreClass(1)).toBe('bad')
    expect(healthScoreClass(3)).toBe('bad')
  })

  it('returns neutral for null', () => {
    expect(healthScoreClass(null)).toBe('neutral')
  })
})
