import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { type ConductorHarnessId } from '../../shared/conductor-harness.js'

export type { ConductorHarnessId }

export type ConductFrame =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; delta: string }
  | { kind: 'reasoning'; delta: string }
  | { kind: 'tool'; name: string; input?: unknown }
  | { kind: 'done'; exitCode: number }
  | { kind: 'error'; message: string }

export function resolveFmBin(firstmateDir: string): string {
  const fromEnv = process.env.PERCH_FM_BIN
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv
  }
  const candidate = join(firstmateDir, 'bin', 'fm.js')
  if (!existsSync(candidate)) {
    throw new Error(`fm binary not found at ${candidate}`)
  }
  const builtEntry = join(firstmateDir, 'out', 'index.js')
  if (!existsSync(builtEntry)) {
    throw new Error(
      `firstmate is not built (${builtEntry} missing). Run: pnpm --filter @orca/firstmate build`
    )
  }
  return candidate
}

export function buildFmConductServeArgs(
  firstmateDir: string,
  harness: string,
  sessionId?: string | null
): string[] {
  const args = [
    'conduct',
    'serve',
    '--harness',
    harness,
    '--format',
    'ndjson',
    '--cwd',
    firstmateDir
  ]
  if (sessionId) {
    args.push('--session', sessionId)
  }
  return args
}

export function parseConductFrameLine(line: string): ConductFrame | null {
  try {
    const value = JSON.parse(line) as ConductFrame
    if (typeof value !== 'object' || value === null || !('kind' in value)) {
      return null
    }
    return value
  } catch {
    return null
  }
}
