import type { HarnessAdapter } from './adapter.js'
import type { ConductFrame } from './frames.js'
import { ClaudeAdapter } from './adapters/claude.js'
import { CursorAdapter } from './adapters/cursor.js'
import { CodexAdapter } from './adapters/codex.js'
import { OpencodeAdapter } from './adapters/opencode.js'
import { PiAdapter } from './adapters/pi.js'

export const CONDUCT_HARNESSES = ['claude', 'cursor', 'codex', 'opencode', 'pi'] as const
export type ConductHarness = (typeof CONDUCT_HARNESSES)[number]

export type ConductOptions = {
  harness: string
  sessionId?: string
  cwd?: string
  prompt: string
}

function createAdapter(harness: string): HarnessAdapter {
  switch (harness) {
    case 'claude':
      return new ClaudeAdapter()
    case 'cursor':
      return new CursorAdapter()
    case 'codex':
      return new CodexAdapter()
    case 'opencode':
      return new OpencodeAdapter()
    case 'pi':
      return new PiAdapter()
    default:
      throw new Error(
        `unknown harness "${harness}" (expected one of: ${CONDUCT_HARNESSES.join(', ')})`
      )
  }
}

function handleFrame(frame: ConductFrame): number {
  switch (frame.kind) {
    case 'text':
      process.stdout.write(frame.delta)
      return 0
    case 'reasoning':
      // Why: chain-of-thought is not the answer; keep it off stdout.
      return 0
    case 'tool':
      process.stdout.write(`[tool: ${frame.name}]\n`)
      return 0
    case 'session':
      return 0
    case 'error':
      process.stderr.write(`fm conduct: error: ${frame.message}\n`)
      return 0
    case 'done':
      return frame.exitCode
  }
}

export async function runConduct(options: ConductOptions): Promise<number> {
  const adapter = createAdapter(options.harness)
  let exitCode = 0

  for await (const frame of adapter.run(options.prompt, {
    sessionId: options.sessionId,
    cwd: options.cwd
  })) {
    const code = handleFrame(frame)
    if (code !== 0) {
      exitCode = code
    }
  }

  return exitCode
}
