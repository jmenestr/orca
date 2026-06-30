export type ConductorTurnIntent = {
  rawText: string
  userContext: string
  skillTaskId?: string
  perchTaskId?: string
  skillOverride?: string
  params: Record<string, string>
}

export type ConductorTurnParseError = {
  code: 'bare_at_token' | 'unknown_task' | 'unknown_run' | 'integration_missing' | 'precheck_failed'
  message: string
  hint?: string
}
