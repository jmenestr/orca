import type { HarnessAdapter } from './adapter.js'
import type { ConductFrame } from './frames.js'
import { ClaudeAdapter } from './adapters/claude.js'
import { CursorAdapter } from './adapters/cursor.js'
import { CodexAdapter } from './adapters/codex.js'
import { OpencodeAdapter } from './adapters/opencode.js'
import { PiAdapter } from './adapters/pi.js'

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
      process.stderr.write(`fm conduct: unknown harness "${harness}"\n`)
      process.exit(1)
  }
}

function handleFrame(frame: ConductFrame): number {
  switch (frame.kind) {
    case 'text':
      process.stdout.write(frame.delta)
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

export async function runConduct(argv: string[]): Promise<void> {
  let harness = 'claude'
  let sessionId: string | undefined
  let cwd: string | undefined
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--harness' && i + 1 < argv.length) {
      harness = argv[++i]!
    } else if (arg === '--session' && i + 1 < argv.length) {
      sessionId = argv[++i]
    } else if (arg === '--cwd' && i + 1 < argv.length) {
      cwd = argv[++i]
    } else if (!arg.startsWith('-')) {
      positional.push(arg)
    }
  }

  const prompt = positional.join(' ')
  if (!prompt) {
    process.stderr.write(
      'Usage: fm conduct [--harness <name>] [--session <id>] [--cwd <path>] <prompt>\n',
    )
    process.exit(1)
  }

  const adapter = createAdapter(harness)
  let exitCode = 0

  for await (const frame of adapter.run(prompt, { sessionId, cwd })) {
    const code = handleFrame(frame)
    if (code !== 0) {
      exitCode = code
    }
  }

  process.exit(exitCode)
}
