import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'
import type { ConductFrame } from '../frames.js'
import type { HarnessAdapter, RunOptions } from '../adapter.js'
import { buildClaudeUserMessage, parseClaudeStreamJsonLine } from '../claude-parse.js'

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

export type ClaudeServeSessionOptions = RunOptions & {
  sessionId?: string
}

export class ClaudeAdapter implements HarnessAdapter {
  private readonly command: string
  private readonly baseArgs: string[]
  private child: ChildProcess | null = null
  private serveStdout: Interface | null = null
  private serveLineQueue: string[] = []
  private serveLineWaiters: ((line: string | null) => void)[] = []
  private serveExitCode: number | null = null
  private serveSpawnErr: string | null = null

  constructor(options?: ClaudeAdapterOptions) {
    this.command = options?.command ?? DEFAULT_COMMAND
    this.baseArgs = options?.args ?? DEFAULT_ARGS
  }

  // Why: the host (e.g. Orca's perch conductor) can pin an authoritative system
  // prompt via env so the agent's operating mode does not depend on the model
  // guessing its own environment. Forwarded verbatim to claude.
  private resolveArgs(sessionId?: string): string[] {
    const args = [...this.baseArgs]
    const systemPrompt = process.env.FM_CONDUCT_APPEND_SYSTEM_PROMPT
    if (systemPrompt && systemPrompt.trim().length > 0) {
      args.push('--append-system-prompt', systemPrompt)
    }
    // Why: the host can forbid tools the agent must not use (e.g. the perch
    // conductor must orchestrate via `fm perch`, never spawn its own Task
    // subagents or edit projects). `--disallowed-tools` takes space-separated
    // tool names.
    const disallowed = process.env.FM_CONDUCT_DISALLOWED_TOOLS
    if (disallowed && disallowed.trim().length > 0) {
      args.push('--disallowed-tools', ...disallowed.trim().split(/\s+/))
    }
    if (sessionId) {
      args.push('--resume', sessionId)
    }
    return args
  }

  async *run(prompt: string, options?: RunOptions): AsyncGenerator<ConductFrame> {
    const args = this.resolveArgs(options?.sessionId)

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

    child.stdin?.write(`${buildClaudeUserMessage(prompt)}\n`)

    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    let gotDone = false
    for await (const rawLine of rl) {
      const trimmed = rawLine.trim()
      if (!trimmed) {
        continue
      }
      for (const frame of parseClaudeStreamJsonLine(trimmed)) {
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

  startServeSession(options?: ClaudeServeSessionOptions): void {
    if (this.child) {
      throw new Error('claude serve session already started')
    }

    const args = this.resolveArgs(options?.sessionId)

    const child = spawn(this.command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    this.serveExitCode = null
    this.serveSpawnErr = null
    this.serveLineQueue = []
    this.serveLineWaiters = []

    child.on('exit', (code) => {
      this.serveExitCode = code ?? 0
      this.flushServeWaiters(null)
    })
    child.on('error', (err) => {
      this.serveSpawnErr = err.message
      this.serveExitCode = 1
      this.flushServeWaiters(null)
    })

    this.serveStdout = createInterface({ input: child.stdout!, crlfDelay: Infinity })
    this.serveStdout.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return
      }
      this.enqueueServeLine(trimmed)
    })
    this.serveStdout.on('close', () => {
      this.flushServeWaiters(null)
    })
  }

  async *runServeTurn(prompt: string): AsyncGenerator<ConductFrame> {
    if (!this.child?.stdin) {
      throw new Error('claude serve session not started')
    }

    const line = buildClaudeUserMessage(prompt)
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin!.write(`${line}\n`, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    let gotDone = false
    while (!gotDone) {
      const stdoutLine = await this.nextServeLine()
      if (stdoutLine === null) {
        if (this.serveSpawnErr) {
          yield { kind: 'error', message: this.serveSpawnErr }
        }
        yield { kind: 'done', exitCode: this.serveExitCode ?? 1 }
        return
      }

      for (const frame of parseClaudeStreamJsonLine(stdoutLine)) {
        if (frame.kind === 'done') {
          gotDone = true
        }
        yield frame
      }
    }
  }

  async send(text: string): Promise<void> {
    if (!this.child?.stdin) {
      return
    }
    const line = buildClaudeUserMessage(text)
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
    if (this.serveStdout) {
      this.serveStdout.close()
      this.serveStdout = null
    }
    if (!this.child) {
      return
    }
    const child = this.child
    this.child = null
    this.flushServeWaiters(null)
    try {
      child.stdin?.end()
    } catch {
      /* stdin may already be closed */
    }
    child.kill('SIGTERM')
  }

  private enqueueServeLine(line: string): void {
    const waiter = this.serveLineWaiters.shift()
    if (waiter) {
      waiter(line)
      return
    }
    this.serveLineQueue.push(line)
  }

  private flushServeWaiters(line: string | null): void {
    while (this.serveLineWaiters.length > 0) {
      const waiter = this.serveLineWaiters.shift()
      waiter?.(line)
    }
  }

  private nextServeLine(): Promise<string | null> {
    const queued = this.serveLineQueue.shift()
    if (queued !== undefined) {
      return Promise.resolve(queued)
    }
    if (this.serveExitCode !== null && this.serveLineQueue.length === 0) {
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      this.serveLineWaiters.push(resolve)
    })
  }
}
