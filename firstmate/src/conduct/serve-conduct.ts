import { createInterface } from 'node:readline'
import type { ConductFrame } from './frames.js'
import { ClaudeAdapter } from './adapters/claude.js'
import { CONDUCT_HARNESSES, type ConductHarness } from './run-conduct.js'

export type ServeConductFormat = 'ndjson' | 'human'

export type ServeConductOptions = {
  harness: string
  cwd?: string
  env?: Record<string, string>
  format?: ServeConductFormat
  sessionId?: string
  /** Test override: claude binary (defaults to `claude`, or FM_CONDUCT_CLAUDE_COMMAND). */
  claudeCommand?: string
  /** Test override: claude args (defaults to FM_CONDUCT_CLAUDE_ARGS split on spaces). */
  claudeArgs?: string[]
}

const IMPLEMENTED_SERVE_HARNESSES = new Set<string>(['claude'])

function assertServeHarness(harness: string): void {
  if (!CONDUCT_HARNESSES.includes(harness as ConductHarness)) {
    throw new Error(
      `unknown harness "${harness}" (expected one of: ${CONDUCT_HARNESSES.join(', ')})`
    )
  }
  if (!IMPLEMENTED_SERVE_HARNESSES.has(harness)) {
    throw new Error(`harness "${harness}" is not implemented for conduct serve yet`)
  }
}

function writeHumanFrame(frame: ConductFrame): void {
  switch (frame.kind) {
    case 'text':
      process.stdout.write(frame.delta)
      return
    case 'reasoning':
      return
    case 'tool':
      process.stdout.write(`[tool: ${frame.name}]\n`)
      return
    case 'session':
      return
    case 'error':
      process.stderr.write(`fm conduct serve: error: ${frame.message}\n`)
      return
    case 'done':
      if (frame.exitCode !== 0) {
        process.stderr.write(`fm conduct serve: exit ${frame.exitCode}\n`)
      }
  }
}

function writeFrame(frame: ConductFrame, format: ServeConductFormat): void {
  if (format === 'ndjson') {
    process.stdout.write(`${JSON.stringify(frame)}\n`)
    return
  }
  writeHumanFrame(frame)
}

function resolveClaudeAdapterOptions(options: ServeConductOptions): {
  command?: string
  args?: string[]
} {
  const command = options.claudeCommand ?? process.env.FM_CONDUCT_CLAUDE_COMMAND ?? undefined
  const argsFromEnv = process.env.FM_CONDUCT_CLAUDE_ARGS
  const args =
    options.claudeArgs ??
    (argsFromEnv && argsFromEnv.length > 0 ? argsFromEnv.split(' ') : undefined)
  return { command, args }
}

export async function serveConduct(options: ServeConductOptions): Promise<number> {
  assertServeHarness(options.harness)
  const format = options.format ?? 'human'

  const claudeOpts = resolveClaudeAdapterOptions(options)
  const adapter = new ClaudeAdapter(claudeOpts)
  adapter.startServeSession({
    cwd: options.cwd,
    env: options.env,
    sessionId: options.sessionId
  })

  let exitCode = 0
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  try {
    for await (const rawLine of rl) {
      const prompt = rawLine.trim()
      if (prompt.length === 0) {
        continue
      }

      for await (const frame of adapter.runServeTurn(prompt)) {
        writeFrame(frame, format)
        if (frame.kind === 'done' && frame.exitCode !== 0) {
          exitCode = frame.exitCode
        }
      }
    }
  } finally {
    adapter.kill()
  }

  return exitCode
}
