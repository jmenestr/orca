// Why: renderer-side Perch types. Kept local so the renderer does not import
// main-process modules across the project boundary.

export type Source =
  | 'directive'
  | 'captain_manual'
  | 'github_pr'
  | 'slack_mention'
  | 'todo'
  | 'linear'
  | 'custom'

export type RunStatus =
  | 'dispatched'
  | 'working'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'idle'
  | 'exited'
  | 'failed'

export type TaskStatus =
  | 'backlog'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled'

export type RunMode = 'session' | 'oneshot'

export type Progress = 'queued' | 'working' | 'paused' | 'landing' | 'done' | 'failed'
export type Attention = 'none' | 'input' | 'approval' | 'error'
export type ControlMode = 'conductor' | 'captain'

export type Run = {
  id: string
  taskId: string | null
  agentId: string
  harness: string
  mode: RunMode
  status: RunStatus
  paneKey: string | null
  terminalHandle: string | null
  worktreeId: string | null
  repoId: string | null
  connectionId: string | null
  sessionId: string | null
  agentType: string | null
  result: string | null
  error: string | null
  startedAt: number
  endedAt: number | null
  updatedAt: number
}

export type TaskMode = 'project' | 'scratch' | 'manual'

export type Task = {
  id: string
  source: Source
  kind: string
  mode: TaskMode
  title: string
  context: unknown
  status: TaskStatus
  runner: string
  harness: string
  landing: string
  autonomy: { autoApprove: boolean; autoLand: boolean; autoContinue: boolean }
  repo: string | null
  worktree: string | null
  branch: string | null
  prUrl: string | null
  error: string | null
  externalId: string | null
  externalIdentifier: string | null
  externalUrl: string | null
  controlMode: ControlMode
  dispatchTarget: {
    repoId: string | null
    repoSelector: string | null
    connectionId: string | null
    worktreeStrategy: string
  } | null
  currentRunId: string | null
  createdAt: number
  updatedAt: number
  currentRun?: Run | null
}

export type ConductorNoticeRef = {
  taskId: string
  title: string
  worktreeId: string | null
  paneKey: string | null
}

export type PerchConductorFrame =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'result'; isError: boolean; result: string | null }
  | { kind: 'notice'; text: string; ref?: ConductorNoticeRef | null }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number | null }

export type ConductorTurn = {
  id: number
  role: 'user' | 'assistant' | 'notice'
  text: string
  at: number
  ref?: ConductorNoticeRef | null
}

export type ConductorMessage = {
  id: string
  role: 'user' | 'assistant' | 'notice'
  text: string
  streaming?: boolean
  ref?: ConductorNoticeRef | null
}

export function asConductorFrame(value: unknown): PerchConductorFrame | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return null
  }
  return value as PerchConductorFrame
}

export function asTask(value: unknown): Task | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    !('status' in value) ||
    !('source' in value)
  ) {
    return null
  }
  return value as Task
}

export type WorkItem = Task
