export function canLogHarvest(cycle: { startAt: string | null; isActive: boolean }): boolean {
  return cycle.startAt != null && !cycle.isActive
}
