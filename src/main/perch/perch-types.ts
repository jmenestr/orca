// Why: faithful TypeScript port of perch's src-tauri/src/orchestrator/model.rs —
// the durable record of the native (non-tmux) orchestrator. Enums serialize as
// snake_case strings (matching the Rust `as_str`/`from_str` round-trip) so the
// same values persist to SQLite and cross the RPC boundary unchanged. The MVP
// only exercises source=directive, kind=coding, runner=local, landing=pr; the
// wider variants are kept as model surface for future non-coding sources.

// ── Raw enums (stored verbatim as TEXT) ──

export type Source = 'directive' | 'github_pr' | 'slack_mention' | 'todo'
export const DEFAULT_SOURCE: Source = 'directive'

export type Kind = 'coding' | 'scout' | 'review' | 'chore' | 'general'
export const DEFAULT_KIND: Kind = 'coding'

export type Runner = 'local' | 'codespace'
export const DEFAULT_RUNNER: Runner = 'local'

export type Harness = 'claude' | 'cursor'
export const DEFAULT_HARNESS: Harness = 'claude'

export type Landing = 'pr' | 'report' | 'slack_reply' | 'todo_checkoff'
export const DEFAULT_LANDING: Landing = 'pr'

// Why: the raw lifecycle status as the agent/recovery loop sees it. Named
// RawStatus (not Status) because the UI consumes the *derived* Progress and
// Attention buckets below rather than these nine literal states directly.
export type RawStatus =
  | 'queued'
  | 'dispatched'
  | 'working'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'landing'
  | 'done'
  | 'failed'
  | 'parked'
export const DEFAULT_RAW_STATUS: RawStatus = 'queued'

// Why: `cursor` is one-shot per turn (spawn per message, resume by session id);
// `claude` keeps one persistent process and takes turns on stdin. Mirrors
// Harness::is_per_turn.
export function isPerTurnHarness(harness: Harness): boolean {
  return harness === 'cursor'
}

// Why: terminal statuses have no live process and need no recovery relaunch.
export function isTerminalStatus(status: RawStatus): boolean {
  return status === 'done' || status === 'failed'
}

// Why: statuses that, on recovery, should relaunch a crewmate (work still live).
export function isLiveStatus(status: RawStatus): boolean {
  return status === 'dispatched' || status === 'working' || status === 'awaiting_input'
}

// ── Derived view buckets ──

// Why: the conductor view groups the nine raw statuses into a small set of
// lifecycle phases so the UI never has to switch on every variant. This is the
// "derived Progress" half of the model: where the item is in its journey.
export type Progress = 'queued' | 'working' | 'paused' | 'landing' | 'done' | 'failed'

export function deriveProgress(status: RawStatus): Progress {
  switch (status) {
    case 'queued':
    case 'dispatched':
      return 'queued'
    case 'working':
      return 'working'
    case 'awaiting_input':
    case 'awaiting_approval':
    case 'parked':
      return 'paused'
    case 'landing':
      return 'landing'
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
  }
}

// Why: the "derived Attention" half — does the captain need to act, and why? The
// conductor surfaces this to decide which items to raise. 'none' means the item
// is progressing on its own and needs no human.
export type Attention = 'none' | 'input' | 'approval' | 'error'

export function deriveAttention(status: RawStatus): Attention {
  switch (status) {
    case 'awaiting_input':
      return 'input'
    case 'awaiting_approval':
      return 'approval'
    case 'failed':
      return 'error'
    case 'queued':
    case 'dispatched':
    case 'working':
    case 'landing':
    case 'done':
    case 'parked':
      return 'none'
  }
}

// Why: how far a work item may proceed without the captain. Not present in the
// Rust MVP (which always paused at the PR gate); formalized here as the M2
// orchestration knob the conductor reads before auto-advancing an item.
export type AutonomyPolicy = {
  // Skip the awaiting_approval gate — open the PR and proceed without review.
  autoApprove: boolean
  // Merge/land the change once it is approved or landing-ready.
  autoLand: boolean
  // Continue past awaiting_input prompts unattended instead of pausing.
  autoContinue: boolean
}

// Why: the default mirrors the Rust MVP — fully supervised: every gate pauses
// for the captain. The conductor opts an item into more autonomy explicitly.
export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = {
  autoApprove: false,
  autoLand: false,
  autoContinue: false
}

// ── WorkItem (camelCase domain object — what the renderer consumes) ──

// Why: mirrors the Rust WorkItem with `#[serde(rename_all = "camelCase")]`.
// `context` is free-form source/runner-specific JSON (the brief, repo slug,
// etc.). Timestamps are unix seconds (floats) to match the Rust `f64` shape.
export type WorkItem = {
  id: string
  source: Source
  kind: Kind
  title: string
  context: unknown
  status: RawStatus
  runner: Runner
  harness: Harness
  landing: Landing
  autonomy: AutonomyPolicy
  sessionId: string | null
  repo: string | null
  worktree: string | null
  branch: string | null
  codespace: string | null
  prUrl: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

// Why: unix seconds (not millis) to match the Rust `WorkItem::now` contract so
// timestamps round-trip identically through the shared SQLite schema.
export function nowSeconds(): number {
  return Date.now() / 1000
}

// ── Append-only log shapes ──

// Why: captain actions (steer/approve/cancel) are logged for the reconciliation
// feed; `kind` is 'captain' for those rows. Payload is free-form JSON.
export type WorkEvent = {
  itemId: string
  seq: number
  kind: string
  payload: unknown
  at: number
}

// Why: the rich timeline is the primary per-item history (text/tool/diff/
// reasoning/notice segments); the plain transcript is the pre-upgrade fallback.
export type TimelineKind = 'user' | 'text' | 'tool' | 'diff' | 'reasoning' | 'notice'

export type TimelineSegment = {
  kind: TimelineKind
  payload: unknown
}

export type TranscriptRole = 'user' | 'assistant' | 'notice'

export type TranscriptEntry = {
  role: TranscriptRole
  text: string
}

// Why: the conductor chat is the plain-language director thread, distinct from
// any single work item. Its turns persist so the view survives a relaunch.
export type ConductorRole = 'user' | 'assistant' | 'notice'

export type ConductorTurn = {
  id: number
  role: ConductorRole
  text: string
  at: number
}
