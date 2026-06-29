import type { Attention, Progress, Run, RunStatus, Task, TaskStatus } from './perch-client-types'

// Why: the board's column order; `blocked`/`failed` show as badges, not columns.
export const TASK_BOARD_COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'assigned', label: 'To do' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'in_review', label: 'In review' },
  { status: 'done', label: 'Done' }
]

// Why: the column a card lands in maps to the Task status it should take. The
// 'in_progress' column is the dispatch trigger (handled by the board).
export function columnStatusForTask(task: Task): TaskStatus {
  switch (task.status) {
    case 'backlog':
      return 'backlog'
    case 'assigned':
      return 'assigned'
    case 'in_review':
      return 'in_review'
    case 'done':
    case 'failed':
    case 'cancelled':
      return 'done'
    case 'blocked':
    case 'in_progress':
    default:
      return 'in_progress'
  }
}

export function progressLabel(progress: Progress): string {
  switch (progress) {
    case 'queued':
      return 'Queued'
    case 'working':
      return 'Working'
    case 'paused':
      return 'Paused'
    case 'landing':
      return 'Landing'
    case 'done':
      return 'Done'
    case 'failed':
      return 'Failed'
  }
}

export function attentionLabel(attention: Attention): string | null {
  switch (attention) {
    case 'input':
      return 'Needs input'
    case 'approval':
      return 'Needs approval'
    case 'error':
      return 'Error'
    case 'none':
      return null
  }
}

function mapRunStatusToProgress(status: RunStatus): Progress {
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

export function deriveWorkProgress(task: TaskProgressInput): Progress {
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

export function deriveWorkAttention(task: TaskProgressInput): Attention {
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

export function taskPaneKey(task: Task): string | null {
  return task.currentRun?.paneKey ?? null
}
