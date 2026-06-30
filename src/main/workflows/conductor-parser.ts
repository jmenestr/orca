import type {
  ConductorTurnIntent,
  ConductorTurnParseError
} from '../../shared/workflows/conductor-turn-intent'

const TASK_TOKEN = /^@task:([a-z0-9-]+)/i
const RUN_TOKEN = /^@run:([a-zA-Z0-9-]+)/
const SKILL_TOKEN = /^\/skill:([a-z0-9-]+)/i
const BARE_AT = /^@([a-z0-9-]+)/i
const PARAM_TOKEN = /(?:^|\s)([a-zA-Z_][a-zA-Z0-9_]*)=([^\s]+)/g

export type ConductorTurnParseResult =
  | { ok: true; intent: ConductorTurnIntent }
  | { ok: false; error: ConductorTurnParseError }

export function parseConductorTurn(rawText: string): ConductorTurnParseResult {
  let remaining = rawText.trim()
  const params: Record<string, string> = {}
  let skillTaskId: string | undefined
  let perchTaskId: string | undefined
  let skillOverride: string | undefined

  const tokens = remaining.split(/\s+/).filter(Boolean)
  const kept: string[] = []

  for (const token of tokens) {
    const taskMatch = token.match(TASK_TOKEN)
    if (taskMatch) {
      skillTaskId = taskMatch[1]!.toLowerCase()
      continue
    }
    const runMatch = token.match(RUN_TOKEN)
    if (runMatch) {
      perchTaskId = runMatch[1]!
      continue
    }
    const skillMatch = token.match(SKILL_TOKEN)
    if (skillMatch) {
      skillOverride = skillMatch[1]!.toLowerCase()
      continue
    }
    if (token === '@task' || token === '@task:') {
      return {
        ok: false,
        error: {
          code: 'bare_at_token',
          message: '@task requires a SkillTask id.',
          hint: 'Use @task:verify-expenses (import it from Workflows → Templates first).'
        }
      }
    }
    const bareMatch = token.match(BARE_AT)
    if (bareMatch && !token.startsWith('@task:') && !token.startsWith('@run:')) {
      return {
        ok: false,
        error: {
          code: 'bare_at_token',
          message: `Bare @${bareMatch[1]} is not supported in Conductor.`,
          hint: `Use @task:${bareMatch[1]} for SkillTasks.`
        }
      }
    }
    kept.push(token)
  }

  for (const match of rawText.matchAll(PARAM_TOKEN)) {
    params[match[1]!] = match[2]!
  }

  const userContext = kept.join(' ').trim()
  return {
    ok: true,
    intent: {
      rawText,
      userContext,
      skillTaskId,
      perchTaskId,
      skillOverride,
      params
    }
  }
}

export function buildConductorModelPrefix(
  intent: ConductorTurnIntent,
  envelope: Record<string, unknown>
): string {
  return [
    'ConductorTurnIntent:',
    JSON.stringify({
      userContext: intent.userContext,
      skillTaskId: intent.skillTaskId ?? null,
      perchTaskId: intent.perchTaskId ?? null,
      skillOverride: intent.skillOverride ?? null,
      params: intent.params,
      envelope
    })
  ].join('\n')
}
