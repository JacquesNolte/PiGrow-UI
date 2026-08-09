import { RuleCondition, SensorType } from '../types/grow'
import type { AutomationRule } from '../types/grow'

/**
 * Human-readable duration from seconds. Chooses the coarsest readable
 * unit: seconds (< 60 s), minutes (< 60 min), hours (>= 60 min).
 * Remainders are appended only when non-zero to avoid noisy output.
 */
export function fmtDuration(s: number): string {
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    if (h >= 24) {
      const d = Math.floor(h / 24)
      const hh = h % 24
      if (hh === 0 && mm === 0) return `${d}d`
      if (hh === 0) return `${d}d ${mm}m`
      if (mm === 0) return `${d}d ${hh}h`
      return `${d}d ${hh}h ${mm}m`
    }
    return mm === 0 ? `${h}h` : `${h}h ${mm}m`
  }
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`
}

/**
 * Readable one-line summary of an INTERVAL rule for table display.
 * Falls back to "Interval" when the interval fields are missing.
 */
export function formatIntervalRule(rule: AutomationRule): string {
  const on = rule.intervalOnSeconds
  const cyc = rule.intervalCycleSeconds
  if (on == null || cyc == null) {
    return 'Interval'
  }
  const base = `ON ${fmtDuration(on)} every ${fmtDuration(cyc)} (OFF ${fmtDuration(cyc - on)})`
  const anchor = rule.intervalAnchorMinutes
  if (anchor != null) {
    // 1440 == midnight == 00:00 (next day); normalize so formatScheduleTime renders it.
    return `${base} at ${formatScheduleTime(anchor % 1440)}`
  }
  return base
}

/**
 * Format minutes-from-midnight as a 24-hour HH:MM string.
 * Returns "—" when the value is null or out of range.
 */
export function formatScheduleTime(minutes?: number | null): string {
  if (minutes == null) {
    return '—'
  }
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439) {
    return '—'
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function isTempSensor(st: SensorType | null | undefined): boolean {
  return st === SensorType.TEMPERATURE || st === SensorType.TEMP_HUMIDITY
}

/**
 * Terse condition phrase for compact rule display (e.g. "temp > max").
 * Mirrors {@link formatIntervalRule} for INTERVAL. Falls back to
 * `String(rule.condition)` for unknown conditions.
 */
export function conditionShort(rule: AutomationRule): string {
  const watched = rule.watchedSensorType
  const isTemp = isTempSensor(watched)
  switch (rule.condition) {
    case RuleCondition.ABOVE_MAX: {
      return isTemp ? 'temp > max' : 'reading > max'
    }
    case RuleCondition.BELOW_MIN: {
      return isTemp ? 'temp < min' : 'reading < min'
    }
    case RuleCondition.BELOW_MAX: {
      return 'reading < max (recovery)'
    }
    case RuleCondition.ABOVE_MIN: {
      return 'reading > min (recovery)'
    }
    case RuleCondition.ABOVE_TARGET: {
      return 'reading > target'
    }
    case RuleCondition.BELOW_TARGET: {
      return 'reading < target'
    }
    case RuleCondition.ALWAYS_ON: {
      return 'Always ON'
    }
    case RuleCondition.ALWAYS_OFF: {
      return 'Always OFF'
    }
    case RuleCondition.INTERVAL: {
      return formatIntervalRule(rule)
    }
    case RuleCondition.SCHEDULE_ON: {
      return `ON daily at ${formatScheduleTime(rule.scheduleTimeMinutes)}`
    }
    case RuleCondition.SCHEDULE_OFF: {
      return `OFF daily at ${formatScheduleTime(rule.scheduleTimeMinutes)}`
    }
    default: {
      return String(rule.condition)
    }
  }
}
