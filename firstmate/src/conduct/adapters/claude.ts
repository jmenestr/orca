import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { ConductFrame } from '../frames.js'
import type { HarnessAdapter, RunOptions } from '../adapter.js'

const DEFAULT_COMMAND = 'claude'
const DEFAULT_ARGS = [
  '--print',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--dangerously-skip-permissions'
]

type ClaudeAdapterOptions = {
  command?: string
  args?: string[]
}

function parseStreamEvent(event: Record<string, unknown>): ConductFrame | null {
  const eventType = event.type

  if (eventType === 'content_block_start') {
    const block = event.content_block as Record<string, unknown> | undefined
    if (block?.type === 'tool_use' && typeof block.name === 'string') {
      return { kind: 'tool', name: block.name }
    }
    return null
  }

  if (eventType === 'content_block_delta') {
    const delta = event.delta as Record<string, unknown> | undefined
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return { kind: 'text', delta: delta.text }
    }
    return null
  }

  return null
}

function parseLine(line: string): ConductFrame[] {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line) as Record<string, unknown>
  } catch {
    return [{ kind: 'error', message: `unparseable output: ${line.slice(0, 120)}` }]
  }

  const type = obj.type

  if (type === 'system') {
    const sessionId = typeof obj.session_id === 'string' ? obj.session_id : null
    return sessionId ? [{ kind: 'session', sessionId }] : []
  }

  if (type === 'stream_event') {
    const event = obj.event as Record<string, unknown> | undefined
    if (!event) {
      return []
    }
    const frame = parseStreamEvent(event)
    return frame ? [frame] : []
  }

  if (type === 'result') {
    const isError = obj.is_error === true
    return [{ kind: 'done', exitCode: isError ? 1 : 0 }]
  }

  return []
}

function buildUserMessage(prompt: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: prompt }] }
  })
}

export class ClaudeAdapter implements HarnessAdapter {
  private readonly command: string
  private readonly baseArgs: string[]
  private child: ChildProcess | null = null

  constructor(options?: ClaudeAdapterOptions) {
    this.command = options?.command ?? DEFAULT_COMMAND
    this.baseArgs = options?.args ?? DEFAULT_ARGS
  }

  async *run(prompt: string, options?: RunOptions): AsyncGenerator<ConductFrame> {
    const args = options?.sessionId
      ? [...this.baseArgs, '--resume', options.sessionId]
      : [...this.baseArgs]

    const child = spawn(this.command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child

    let spawnErr: string | null = null
    const exitCodePromise = new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 0))
      child.on('error', (err) => {
        spawnErr = err.message
        resolve(1)
      })
    })

    child.stdin?.write(`${buildUserMessage(prompt)}\n`)

    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    let gotDone = false
    for await (const rawLine of rl) {
      const trimmed = rawLine.trim()
      if (!trimmed) {
        continue
      }
      for (const frame of parseLine(trimmed)) {
        if (frame.kind === 'done') {
          gotDone = true
        }
        yield frame
      }
    }

    const exitCode = await exitCodePromise
    this.child = null

    if (spawnErr !== null) {
      yield { kind: 'error', message: spawnErr }
    }
    if (!gotDone) {
      yield { kind: 'done', exitCode }
    }
  }

  async send(text: string): Promise<void> {
    if (!this.child?.stdin) {
      return
    }
    const line = buildUserMessage(text)
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin!.write(`${line}\n`, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  kill(): void {
    if (!this.child) {
      return
    }
    const child = this.child
    this.child = null
    try {
      child.stdin?.end()
    } catch {
      /* stdin may already be closed */
    }
    child.kill('SIGTERM')
  }
}
