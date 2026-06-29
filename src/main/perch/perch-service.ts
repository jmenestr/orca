// Why: PerchService owns the long-lived firstmate "conductor" — the agent the
// captain directs in plain language from the Perch view. The conductor runs as
// `fm conduct serve` (NDJSON ConductFrames on stdout, plain-text turns on stdin)
// with cwd/FM_HOME set to the vendored firstmate dir and FM_HOST=perch so
// AGENTS.md skips tmux session-lock / recovery / watcher machinery. Frames are
// mapped to PerchConductorFrame for the renderer; chat turns persist in PerchDb.
import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PerchDb } from './perch-db'
import {
  buildFmConductServeArgs,
  parseConductFrameLine,
  resolveFmBin,
  type ConductFrame,
  type ConductorHarnessId
} from './perch-conduct'
import { normalizeConductorHarnessId } from '../../shared/conductor-harness'
import { nowSeconds, type ConductorNoticeRef } from './perch-types'

export type PerchConductorFrame =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'result'; isError: boolean; result: string | null }
  | { kind: 'notice'; text: string; ref?: ConductorNoticeRef | null }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number | null }

const FRAME_EVENT = 'frame'
const DEFAULT_HARNESS: ConductorHarnessId = 'claude'

// Why: the conductor model cannot reliably observe its own process env, so it
// must not infer its operating mode from FM_HOST. This system prompt asserts
// perch mode authoritatively (claude --append-system-prompt) so the conductor
// never falls back to the tmux bootstrap/recovery/spawn playbook.
const PERCH_CONDUCTOR_SYSTEM_PROMPT = [
  'You are the Orca Perch conductor (FM_HOST=perch). This overrides any ambiguity in CLAUDE.md: you ARE running under perch.',
  'Operate strictly per section 0 of CLAUDE.md. Do NOT run bootstrap, recovery, session locks, watchers, tmux, treehouse, fm-spawn.sh, or clone projects into a projects/ directory. None of that machinery runs under perch.',
  'You spawn and observe agents ONLY through the `fm perch` CLI:',
  '- `fm perch repos` lists the repos the captain registered in Orca (resolve project names here).',
  '- `fm perch dispatch --repo <selector> --title "<title>" --prompt "<full task>"` creates a worktree and launches an agent in Orca.',
  '- `fm perch list` reports the live fleet.',
  'Never do project work yourself (no exploring, reading, coding, or investigating a project from this process) - always dispatch an agent and relay its outcome in plain language.',
  'If the captain names a project that `fm perch repos` does not list, tell the captain to add it in Orca; do not try to clone or register it yourself.'
].join('\n')

// Why: hard tool-level enforcement of the orchestrator role. The conductor must
// not spawn its own in-process subagents (Task) — those run inside the conductor
// and never appear in Orca's fleet — and must not edit projects directly. It
// dispatches real Orca agents via `fm perch` (Bash) instead.
const PERCH_CONDUCTOR_DISALLOWED_TOOLS = ['Task', 'Edit', 'Write', 'NotebookEdit'].join(' ')

// Why: a minimal contract so PerchService can inject the conductor bridge's
// port/token into the subprocess env without depending on the bridge class.
export type ConductorBridgeHandle = {
  ensureListening: () => Promise<{ port: number; token: string }>
}

export type PerchServiceOptions = {
  db: PerchDb
  firstmateDir?: string
  harness?: ConductorHarnessId | string
  /** Override spawn command (tests). Defaults to process.execPath. */
  command?: string
  /** Override full argv (tests). When set, ignores fm conduct serve args. */
  spawnArgs?: string[]
}

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
  readonly harness: ConductorHarnessId
  private readonly spawnCommand: string
  private readonly spawnArgsOverride: string[] | undefined
  private readonly emitter = new EventEmitter()

  private child: ChildProcess | null = null
  private sessionId: string | null = null
  private stdoutBuffer = ''
  private assistantBuffer = ''
  private bridge: ConductorBridgeHandle | null = null

  constructor(options: PerchServiceOptions) {
    this.db = options.db
    this.firstmateDir = options.firstmateDir ?? resolveFirstmateDir()
    this.harness = normalizeConductorHarnessId(
      process.env.PERCH_CONDUCTOR_HARNESS ?? options.harness ?? DEFAULT_HARNESS
    )
    this.spawnCommand = options.command ?? process.execPath
    this.spawnArgsOverride = options.spawnArgs
    this.emitter.setMaxListeners(0)
  }

  subscribe(listener: (frame: PerchConductorFrame) => void): () => void {
    this.emitter.on(FRAME_EVENT, listener)
    return () => {
      this.emitter.off(FRAME_EVENT, listener)
    }
  }

  // Why: lets the runtime attach the conductor bridge so its port/token reach
  // the subprocess env. Set before the first send so the first spawn carries it.
  setConductorBridge(bridge: ConductorBridgeHandle): void {
    this.bridge = bridge
  }

  isRunning(): boolean {
    return this.child !== null && this.child.exitCode === null && !this.child.killed
  }

  async ensureConductor(): Promise<void> {
    if (this.isRunning()) {
      return
    }
    // Why: the bridge must be listening before spawn so PERCH_BRIDGE_PORT is
    // captured in the conductor's env (subprocess env is fixed at spawn time).
    const bridgeEnv = this.bridge ? await this.bridge.ensureListening() : null
    this.spawnConductor(
      bridgeEnv
        ? { PERCH_BRIDGE_PORT: String(bridgeEnv.port), PERCH_BRIDGE_TOKEN: bridgeEnv.token }
        : {}
    )
  }

  // Why: `modelPrefix` carries internal context (e.g. the per-turn fleet
  // snapshot) that the conductor model must see but that is not the captain's
  // words — so it is prepended to the model's stdin turn but never persisted as
  // a user transcript entry.
  async send(text: string, options?: { modelPrefix?: string }): Promise<void> {
    await this.ensureConductor()
    this.db.appendConductorTurn('user', text, nowSeconds())
    const prefix = options?.modelPrefix?.trim()
    const modelInput = prefix && prefix.length > 0 ? `${prefix}\n\n${text}` : text
    try {
      this.child?.stdin?.write(`${modelInput}\n`)
    } catch (err) {
      this.emitFrame({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  getTranscript(): ReturnType<PerchDb['conductorTranscript']> {
    return this.db.conductorTranscript()
  }

  // Why: fleet deltas and takeover notices reach the conductor transcript without
  // requiring a subprocess round-trip. An optional ref links the notice back to
  // the Task/agent that produced it so the chat can offer a "view agent" link.
  pushNotice(text: string, ref?: ConductorNoticeRef | null): void {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return
    }
    this.db.appendConductorTurn('notice', trimmed, nowSeconds(), ref ?? null)
    this.emitFrame({ kind: 'notice', text: trimmed, ref: ref ?? null })
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

  private spawnConductor(extraEnv: Record<string, string> = {}): void {
    const args =
      this.spawnArgsOverride ??
      (() => {
        const fmBin = resolveFmBin(this.firstmateDir)
        return [fmBin, ...buildFmConductServeArgs(this.firstmateDir, this.harness, this.sessionId)]
      })()

    const child = spawn(this.spawnCommand, args, {
      cwd: this.firstmateDir,
      env: {
        ...process.env,
        FM_HOME: this.firstmateDir,
        FM_HOST: 'perch',
        CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false',
        FM_CONDUCT_APPEND_SYSTEM_PROMPT: PERCH_CONDUCTOR_SYSTEM_PROMPT,
        FM_CONDUCT_DISALLOWED_TOOLS: PERCH_CONDUCTOR_DISALLOWED_TOOLS,
        ...extraEnv
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    this.stdoutBuffer = ''
    this.assistantBuffer = ''

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk))

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

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line.length > 0) {
        this.handleConductFrame(line)
      }
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleConductFrame(line: string): void {
    const frame = parseConductFrameLine(line)
    if (!frame) {
      return
    }
    this.mapConductFrame(frame)
  }

  private mapConductFrame(frame: ConductFrame): void {
    switch (frame.kind) {
      case 'session':
        this.sessionId = frame.sessionId
        this.emitFrame({ kind: 'session', sessionId: frame.sessionId })
        return
      case 'text':
        this.assistantBuffer += frame.delta
        this.emitFrame({ kind: 'text', text: frame.delta })
        return
      case 'reasoning':
        // Why: surface chain-of-thought as a distinct frame the renderer can
        // ignore (or later reveal), and never fold it into the persisted
        // assistant turn so the chat shows the reply, not the thinking.
        this.emitFrame({ kind: 'reasoning', text: frame.delta })
        return
      case 'tool':
        this.emitFrame({ kind: 'tool', name: frame.name })
        return
      case 'error':
        this.emitFrame({ kind: 'error', message: frame.message })
        return
      case 'done': {
        const text = this.assistantBuffer.trim()
        const isError = frame.exitCode !== 0
        if (text.length > 0) {
          this.db.appendConductorTurn(isError ? 'notice' : 'assistant', text, nowSeconds())
        }
        this.assistantBuffer = ''
        this.emitFrame({
          kind: 'result',
          isError,
          result: text.length > 0 ? text : null
        })
      }
    }
  }

  private emitFrame(frame: PerchConductorFrame): void {
    this.emitter.emit(FRAME_EVENT, frame)
  }
}
