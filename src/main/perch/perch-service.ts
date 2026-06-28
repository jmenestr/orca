// Why: PerchService owns the long-lived firstmate "conductor" — the agent the
// captain directs in plain language from the Perch view. There is no separate
// conductor binary in firstmate; firstmate IS the conductor, normally a harness
// agent (claude) reading firstmate/AGENTS.md. Here we run that same agent as a
// stream-json subprocess (no tmux), with FM_HOST=perch so AGENTS.md skips the
// session-lock / recovery / watcher machinery (section 0) and dispatches
// crewmates through the mode=orca adapter. The service line-parses the agent's
// stream-json stdout into normalized frames, drives turns over stdin, and
// persists the conductor chat to PerchDb.
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PerchDb } from './perch-db'
import { nowSeconds } from './perch-types'

// Why: normalized frames the renderer can render without knowing claude's full
// stream-json schema. Text deltas drive live streaming; tool/reasoning are
// status flavor; result closes a turn. Mirrors perch's stream.rs StreamEvent.
export type PerchConductorFrame =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'result'; isError: boolean; result: string | null }
  | { kind: 'notice'; text: string }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number | null }

// Why: claude's persistent stream-json session — reads newline-delimited user
// turns from stdin and emits stream-json on stdout until stdin closes.
// --include-partial-messages gives incremental text deltas for live rendering;
// --dangerously-skip-permissions keeps the headless conductor from blocking on
// a permission prompt it cannot answer.
const DEFAULT_CONDUCTOR_COMMAND = 'claude'
const DEFAULT_CONDUCTOR_ARGS = [
  '--print',
  '--input-format',
  'stream-json',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--dangerously-skip-permissions'
]

const FRAME_EVENT = 'frame'

export type PerchServiceOptions = {
  db: PerchDb
  // The vendored firstmate dir (cwd + FM_HOME for the conductor). Resolved by
  // the caller; falls back to resolveFirstmateDir() when omitted.
  firstmateDir?: string
  // Override the agent command/args (tests, or a non-claude harness).
  command?: string
  baseArgs?: string[]
}

// Why: locate the vendored firstmate dir from the built main process. Prefer an
// explicit env override (live verification / packaged layouts), then walk up
// from this module toward the repo root looking for firstmate/bin/fm-orca-lib.sh
// (the M1 adapter that proves it's the vendored copy), then fall back to cwd.
export function resolveFirstmateDir(): string {
  const fromEnv = process.env.PERCH_FIRSTMATE_DIR
  if (fromEnv && existsSync(join(fromEnv, 'bin', 'fm-orca-lib.sh'))) {
    return fromEnv
  }
  let dir = __dirname
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'firstmate')
    if (existsSync(join(candidate, 'bin', 'fm-orca-lib.sh'))) {
      return candidate
    }
    const parent = join(dir, '..')
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return join(process.cwd(), 'firstmate')
}

export class PerchService {
  private readonly db: PerchDb
  private readonly firstmateDir: string
  private readonly command: string
  private readonly baseArgs: string[]
  private readonly emitter = new EventEmitter()

  private child: ChildProcess | null = null
  private sessionId: string | null = null
  private stdoutBuffer = ''
  // Why: text deltas stream in across many frames; accumulate the current
  // turn's assistant text so the whole reply persists as one transcript turn
  // when the turn's `result` frame lands.
  private assistantBuffer = ''

  constructor(options: PerchServiceOptions) {
    this.db = options.db
    this.firstmateDir = options.firstmateDir ?? resolveFirstmateDir()
    this.command = options.command ?? process.env.PERCH_CONDUCTOR_CMD ?? DEFAULT_CONDUCTOR_COMMAND
    this.baseArgs = options.baseArgs ?? DEFAULT_CONDUCTOR_ARGS
    // Why: cap listeners high — every renderer subscription and the push-bus
    // notifier attach here, and reconnects can briefly overlap.
    this.emitter.setMaxListeners(0)
  }

  // Why: subscribers receive every normalized frame. Returns an unsubscribe so
  // RPC stream handlers and the main-window notifier clean up on disconnect.
  subscribe(listener: (frame: PerchConductorFrame) => void): () => void {
    this.emitter.on(FRAME_EVENT, listener)
    return () => {
      this.emitter.off(FRAME_EVENT, listener)
    }
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed
  }

  // Why: lazy-spawn — the conductor process starts on the first turn, not at
  // app boot, so an idle Perch view costs nothing.
  ensureConductor(): void {
    if (this.isRunning()) {
      return
    }
    this.spawnConductor()
  }

  // Direct the conductor with a plain-language turn. Persists the user turn,
  // then writes a stream-json user message to the agent's stdin.
  send(text: string): void {
    this.ensureConductor()
    this.db.appendConductorTurn('user', text, nowSeconds())
    const line = JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
    try {
      this.child?.stdin?.write(`${line}\n`)
    } catch (err) {
      this.emitFrame({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  getTranscript(): ReturnType<PerchDb['conductorTranscript']> {
    return this.db.conductorTranscript()
  }

  // Kill the conductor (app quit). Idempotent.
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

  private spawnConductor(): void {
    // Why: --resume reattaches to the same agent session across a respawn (e.g.
    // a per-turn harness, or a claude build that exits after a turn), so the
    // conductor keeps its memory of the fleet it is directing.
    const args = this.sessionId
      ? [...this.baseArgs, '--resume', this.sessionId]
      : [...this.baseArgs]

    const child = spawn(this.command, args, {
      cwd: this.firstmateDir,
      env: {
        ...process.env,
        // Why: FM_HOME points operational dirs at the firstmate dir; FM_HOST
        // signals the perch context so AGENTS.md/bootstrap/fm-lock skip tmux
        // session-lock, recovery, and the watcher (section 0).
        FM_HOME: this.firstmateDir,
        FM_HOST: 'perch',
        // Why: silence claude's interactive prompt-suggestion ghost text, matching
        // firstmate's own crewmate launches.
        CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    this.stdoutBuffer = ''
    this.assistantBuffer = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk))

    // Why: drop stderr from the parsed stream — it carries diagnostics/heartbeats,
    // never conductor frames. Surface it to the main log for debugging only.
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      if (process.env.PERCH_DEBUG) {
        console.warn('[perch] conductor stderr:', chunk.trimEnd())
      }
    })

    child.on('error', (err) => {
      this.emitFrame({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    })
    child.on('exit', (code) => {
      if (this.child === child) {
        this.child = null
      }
      this.emitFrame({ kind: 'exit', code })
    })
  }

  // Why: stream-json is newline-delimited JSON; buffer partial chunks and parse
  // one complete line at a time. A non-JSON line (a stray log) is ignored.
  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line.length > 0) {
        this.parseLine(line)
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private parseLine(line: string): void {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    const type = obj.type

    if (type === 'system') {
      const sessionId = typeof obj.session_id === 'string' ? obj.session_id : null
      if (sessionId) {
        this.sessionId = sessionId
        this.emitFrame({ kind: 'session', sessionId })
      }
      return
    }

    if (type === 'stream_event') {
      this.parseStreamEvent(obj.event as Record<string, unknown> | undefined)
      return
    }

    // Why: cumulative `assistant` snapshots repeat the full message each frame;
    // we assemble text from the incremental deltas instead (avoids duplication),
    // exactly as perch's stream.rs does. So snapshots are ignored here.
    if (type === 'result') {
      const isError = obj.is_error === true
      const result = typeof obj.result === 'string' ? obj.result : null
      const text = this.assistantBuffer.trim() || result || ''
      if (text.length > 0) {
        this.db.appendConductorTurn(isError ? 'notice' : 'assistant', text, nowSeconds())
      }
      this.assistantBuffer = ''
      this.emitFrame({ kind: 'result', isError, result })
    }
  }

  private parseStreamEvent(event: Record<string, unknown> | undefined): void {
    if (!event) {
      return
    }
    const eventType = event.type

    if (eventType === 'content_block_start') {
      const block = event.content_block as Record<string, unknown> | undefined
      if (block?.type === 'tool_use' && typeof block.name === 'string') {
        this.emitFrame({ kind: 'tool', name: block.name })
      }
      return
    }

    if (eventType === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        this.assistantBuffer += delta.text
        this.emitFrame({ kind: 'text', text: delta.text })
      } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        this.emitFrame({ kind: 'reasoning', text: delta.thinking })
      }
    }
  }

  private emitFrame(frame: PerchConductorFrame): void {
    this.emitter.emit(FRAME_EVENT, frame)
  }
}
