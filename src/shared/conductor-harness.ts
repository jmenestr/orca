export const CONDUCTOR_HARNESS_IDS = ['claude', 'cursor', 'codex', 'opencode', 'pi'] as const
export type ConductorHarnessId = (typeof CONDUCTOR_HARNESS_IDS)[number]

/** Harnesses with a working `fm conduct serve` adapter in @orca/firstmate. */
export const IMPLEMENTED_CONDUCTOR_HARNESS_IDS = new Set<ConductorHarnessId>(['claude'])

export function isConductorHarnessId(value: string): value is ConductorHarnessId {
  return (CONDUCTOR_HARNESS_IDS as readonly string[]).includes(value)
}

export function normalizeConductorHarnessId(value: string | undefined | null): ConductorHarnessId {
  if (value && isConductorHarnessId(value)) {
    return value
  }
  return 'claude'
}
