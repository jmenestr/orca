// Why: faithful TypeScript port of perch's src-tauri/src/orchestrator/model.rs —
// the durable record of the native (non-tmux) orchestrator. Enums serialize as
// snake_case strings (matching the Rust `as_str`/`from_str` round-trip) so the
// same values persist to SQLite and cross the RPC boundary unchanged. The MVP
// only exercises source=directive, kind=coding, runner=local, landing=pr; the
// wider variants are kept as model surface for future non-coding sources.

// ── Raw enums (stored verbatim as TEXT) ──

export type Source =
  | 'directive'
  | 'captain_manual'
  | 'github_pr'
  | 'slack_mention'
  | 'todo'
  | 'linear'
  | 'custom'
export const DEFAULT_SOURCE: Source = 'directive'

// Why: a Task's execution mode decides how dispatch behaves.
//   - project: dispatch cuts a managed worktree + agent (the existing path).
//   - scratch: dispatch launches a floating-terminal agent (no worktree).
//   - manual:  no agent ever - the captain works it by hand; the board only
//     tracks its status (drag = status move, Done = check off).
export type TaskMode = 'project' | 'scratch' | 'manual'
export const DEFAULT_TASK_MODE: TaskMode = 'project'

// Why: default a task's mode from its source for the v5->v6 migration and for
// freshly-ingested tasks. Externally-sourced and dispatched work is project
// mode; custom (captain-authored) tasks default to project but the composer can
// override to scratch/manual.
export function defaultModeForSource(source: Source): TaskMode {
  switch (source) {
    case 'linear':
    case 'directive':
    case 'captain_manual':
    case 'github_pr':
    case 'slack_mention':
    case 'todo':
    case 'custom':
      return 'project'
  }
}

export type Kind = 'coding' | 'scout' | 'review' | 'chore' | 'general'
export const DEFAULT_KIND: Kind = 'coding'

export type Runner = 'local' | 'codespace'
export const DEFAULT_RUNNER: Runner = 'local'

export type Harness = 'claude' | 'cursor'
export const DEFAULT_HARNESS: Harness = 'claude'

export type Landing = 'pr' | 'report' | 'slack_reply' | 'todo_checkoff'
export const DEFAULT_LANDING: Landing = 'pr'

export {
  DEFAULT_RAW_STATUS,
  deriveAttention,
  deriveProgress,
  isLiveStatus,
  isTerminalStatus,
  type Attention,
  type Progress,
  type RawStatus
} from './perch-legacy-status'

// Why: `cursor` is one-shot per turn (spawn per message, resume by session id);
// `claude` keeps one persistent process and takes turns on stdin. Mirrors
// Harness::is_per_turn.
export function isPerTurnHarness(harness: Harness): boolean {
  return harness === 'cursor'
}

// ── Run / Task / Agent split ──
//
// The model is split into three entities to stop the overloaded "agent" concept
// from fusing work, instance, and live status into one record:
//   - Task  = the unit of work (work-level lifecycle status)
//   - Run   = one agent instance executing a Task (turn-level, hook-driven status)
//   - Agent = a reusable personality/role that templates a Run (stubbed for now)
// The decoupling is the core fix for the disappearing-agent bug: a Run going
// idle between turns must never terminate or delete its Task.

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

// Why: takeover is policy + visibility — who may steer an agent (conductor vs
// captain typing in the terminal). Defaults to conductor for directive spawns.
export type ControlMode = 'conductor' | 'captain'
export const DEFAULT_CONTROL_MODE: ControlMode = 'conductor'

// Why: a Run's status is the live, hook-driven turn state and is intentionally
// NOT work-terminal. An agent going idle between turns is `idle`, not `done`.
// Only exited/failed are run-terminal (the process is gone).
export type RunStatus =
  | 'dispatched'
  | 'working'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'idle'
  | 'exited'
  | 'failed'
export const DEFAULT_RUN_STATUS: RunStatus = 'dispatched'

export function isTerminalRunStatus(status: RunStatus): boolean {
  return status === 'exited' || status === 'failed'
}

// Why: a Task's status is the work lifecycle, decoupled from any single Run's
// turn state. A Task becomes terminal only via an explicit signal (cancel,
// landing complete, conductor report) — never because a Run finished a turn.
export type TaskStatus =
  | 'backlog'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled'
export const DEFAULT_TASK_STATUS: TaskStatus = 'backlog'

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

// Why: map a Linear workflow-state type onto a board TaskStatus during read-only
// ingest. Linear state types are: triage | backlog | unstarted | started |
// completed | canceled. Note `started` maps to `assigned`, NOT `in_progress`:
// on this board `in_progress` means "an Orca agent is dispatched and running",
// so a human-"In Progress" Linear issue with no Orca agent must stay in the
// pre-dispatch (To do) column until it is actually dispatched.
export function mapLinearStateToTaskStatus(stateType: string | null | undefined): TaskStatus {
  switch (stateType) {
    case 'unstarted':
    case 'started':
      return 'assigned'
    case 'completed':
      return 'done'
    case 'canceled':
      return 'cancelled'
    case 'triage':
    case 'backlog':
    default:
      return 'backlog'
  }
}

// Why: session = one persistent process taking turns on stdin (claude); oneshot
// = spawn-per-turn / fire-and-report (cursor, research). Defaulted from the Agent
// personality, overridable per dispatch.
export type RunMode = 'session' | 'oneshot'
export const DEFAULT_RUN_MODE: RunMode = 'session'

// Why: where a Run executes. connectionId carries the SSH remote (null = local);
// worktreeStrategy is 'new' to cut a fresh worktree or an existing worktree id.
export type DispatchTarget = {
  repoId: string | null
  repoSelector: string | null
  connectionId: string | null
  worktreeStrategy: 'new' | string
}

// Why: stable ids for the seeded default personalities. The personality layer is
// modeled now but stubbed to these two until a config UI exists.
export const DEFAULT_AGENT_ID = 'general'
export const CONDUCTOR_AGENT_ID = 'conductor'

// ── Task (the unit of work the renderer consumes) ──
export type Task = {
  id: string
  source: Source
  kind: Kind
  /** How dispatch executes this task (project worktree / floating scratch /
   *  manual no-agent). */
  mode: TaskMode
  title: string
  context: unknown
  status: TaskStatus
  runner: Runner
  /** Preferred harness for the work; the harness actually used lives on the Run. */
  harness: Harness
  landing: Landing
  autonomy: AutonomyPolicy
  repo: string | null
  worktree: string | null
  branch: string | null
  prUrl: string | null
  error: string | null
  /** Stable dedup key for an externally-sourced task (e.g. `linear:<issueId>`). */
  externalId: string | null
  /** Human identifier from the source (e.g. `ENG-123`). */
  externalIdentifier: string | null
  /** Deep link back to the source issue. */
  externalUrl: string | null
  /** Who currently owns steering policy for this task. */
  controlMode: ControlMode
  /** Where a Run for this task should execute. */
  dispatchTarget: DispatchTarget | null
  /** The Run currently working this Task, if any. */
  currentRunId: string | null
  createdAt: number
  updatedAt: number
  // Why: transport convenience — the current Run is embedded when a Task crosses
  // the RPC/push boundary so the renderer renders turn-status without a join.
  // Not a stored column on the Task row.
  currentRun?: Run | null
}

// ── Run (one agent instance executing a Task) ──
export type Run = {
  id: string
  taskId: string | null
  agentId: string
  harness: Harness
  mode: RunMode
  status: RunStatus
  /** Terminal pane key (`tabId:leafId`) once linked to a live agent. */
  paneKey: string | null
  /** Runtime terminal handle for steer/wait RPC. */
  terminalHandle: string | null
  worktreeId: string | null
  repoId: string | null
  /** SSH connection id, or null for local. */
  connectionId: string | null
  /** Provider-owned conversation/session id for exact CLI resume. */
  sessionId: string | null
  /** Agent CLI type from hooks (claude, codex, …). */
  agentType: string | null
  result: string | null
  error: string | null
  startedAt: number
  endedAt: number | null
  updatedAt: number
}

// ── Agent (reusable personality/role — stubbed) ──
export type Agent = {
  id: string
  name: string
  instructions: string | null
  allowedTools: string[] | null
  deniedTools: string[] | null
  defaultHarness: Harness
  defaultMode: RunMode
  autonomy: AutonomyPolicy
  model: string | null
  createdAt: number
  updatedAt: number
}

export {
  mapRunStatusToProgress,
  deriveTaskProgress,
  deriveTaskAttention,
  mapLegacyStatusToTask,
  mapLegacyStatusToRun,
  nowSeconds
} from './perch-task-derive'

export type {
  WorkEvent,
  TimelineKind,
  TimelineSegment,
  TranscriptRole,
  TranscriptEntry,
  ConductorRole,
  ConductorNoticeRef,
  ConductorTurn
} from './perch-conductor-types'
