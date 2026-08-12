export type HealthScoreClass = 'good' | 'ok' | 'bad' | 'neutral'

export function healthScoreClass(score: number | null): HealthScoreClass {
  if (score == null) return 'neutral'
  if (score >= 7) return 'good'
  if (score >= 4) return 'ok'
  return 'bad'
}
