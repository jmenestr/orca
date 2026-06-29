import type {
  Attention,
  Progress,
  RawStatus,
  Run,
  RunStatus,
  Task,
  TaskStatus
} from './perch-types'

// Why: map a Run's turn-status onto the shared Progress bucket. `idle` is a
// paused (between-turns) state, not done.
export function mapRunStatusToProgress(status: RunStatus): Progress {
  switch (status) {
    case 'dispatched':
      return 'queued'
    case 'working':
      return 'working'
    case 'awaiting_input':
    case 'awaiting_approval':
    case 'idle':
      return 'paused'
    case 'exited':
      return 'done'
    case 'failed':
      return 'failed'
  }
}

type TaskProgressInput = Pick<Task, 'status'> & { currentRun?: Run | null }

// Why: Task progress is the work lifecycle, refined by the current Run's turn
// state while the Task is actively being worked.
export function deriveTaskProgress(task: TaskProgressInput): Progress {
  switch (task.status) {
    case 'backlog':
    case 'assigned':
      return task.currentRun ? mapRunStatusToProgress(task.currentRun.status) : 'queued'
    case 'in_progress':
      return task.currentRun ? mapRunStatusToProgress(task.currentRun.status) : 'working'
    case 'in_review':
      return 'landing'
    case 'blocked':
      return 'paused'
    case 'done':
      return 'done'
    case 'failed':
    case 'cancelled':
      return 'failed'
  }
}

// Why: attention surfaces whether the captain needs to act. Task-terminal error
// states win; otherwise the current Run's awaiting_* states ask for input.
export function deriveTaskAttention(task: TaskProgressInput): Attention {
  if (task.status === 'failed' || task.status === 'cancelled') {
    return 'error'
  }
  if (task.status === 'blocked') {
    return 'input'
  }
  const run = task.currentRun
  if (run) {
    if (run.status === 'awaiting_input') {
      return 'input'
    }
    if (run.status === 'awaiting_approval') {
      return 'approval'
    }
    if (run.status === 'failed') {
      return 'error'
    }
  }
  return 'none'
}

// Why: the v2 perch.db stored a single RawStatus on each work item. The v2->v3
// migration splits that into a (TaskStatus, RunStatus) pair so legacy rows keep
// their place in the fleet without inheriting the turn/work conflation.
export function mapLegacyStatusToTask(status: RawStatus): TaskStatus {
  switch (status) {
    case 'queued':
      return 'backlog'
    case 'dispatched':
      return 'assigned'
    case 'working':
    case 'awaiting_input':
    case 'awaiting_approval':
      return 'in_progress'
    case 'landing':
      return 'in_review'
    case 'parked':
      return 'blocked'
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
  }
}

export function mapLegacyStatusToRun(status: RawStatus): RunStatus | null {
  switch (status) {
    case 'queued':
      return null
    case 'dispatched':
      return 'dispatched'
    case 'working':
      return 'working'
    case 'awaiting_input':
      return 'awaiting_input'
    case 'awaiting_approval':
      return 'awaiting_approval'
    case 'landing':
    case 'parked':
    case 'done':
      return 'idle'
    case 'failed':
      return 'failed'
  }
}

// Why: unix seconds (not millis) to match the Rust `WorkItem::now` contract so
// timestamps round-trip identically through the shared SQLite schema.
export function nowSeconds(): number {
  return Date.now() / 1000
}
