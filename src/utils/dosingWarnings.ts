import type { DosingWarningCode } from '../types/grow'

export const dosingWarningText: Record<DosingWarningCode, string> = {
  NO_NUTRIENTS_CONFIGURED: 'No nutrients configured for this phase.',
  NO_PH_BANDS: "No pH bands configured for this phase. Auto-dosing won't correct drift.",
  RESERVOIR_TOO_SMALL: 'Reservoir volume must be > 0.',
}

export function dosingWarningLabel(code: DosingWarningCode): string {
  return dosingWarningText[code] ?? code
}
