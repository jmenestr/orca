import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import { mapTaskStatusToWorkspaceStatus } from './perch-worktree-reconcile'
import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  DEFAULT_HARNESS,
  DEFAULT_KIND,
  DEFAULT_LANDING,
  DEFAULT_RUNNER,
  DEFAULT_TASK_MODE,
  isTerminalRunStatus,
  isTerminalTaskStatus,
  nowSeconds,
  type ControlMode,
  type Task,
  type TaskMode,
  type TaskStatus
} from './perch-types'

export type FleetBoardDeps = {
  db: PerchDb
  getRuntime: () => OrcaRuntimeService
  emitTask: (task: Task) => void
  pushFleetNotice: (text: string) => void
  writeBackLinearStatus?: (externalId: string, status: TaskStatus) => Promise<unknown>
}

// Why: the Task is the single Linear sync hub. Once a Linear-sourced task has
// been dispatched (has a Run or worktree), Orca owns the lifecycle and writes
// status changes back to the Linear issue. Pre-dispatch tasks still take their
// status FROM Linear (inbound), so they are not written back. Fire-and-forget.
export function mirrorLinearStatus(deps: FleetBoardDeps, task: Task): void {
  if (!task.externalId || !deps.writeBackLinearStatus) {
    return
  }
  const dispatched = Boolean(task.currentRunId || task.worktree)
  if (!dispatched) {
    return
  }
  void deps.writeBackLinearStatus(task.externalId, task.status).catch(() => {
    /* write-back is best-effort */
  })
}

// Why: Task.status is authoritative; for a worktree-backed task we write the
// status back onto the worktree's workspaceStatus mirror so the sidebar list
// and smart-sort stay correct. Fire-and-forget + guarded so a missing runtime
// method (tests) or a transient failure never blocks the board move.
export function mirrorWorktreeStatus(deps: FleetBoardDeps, task: Task): void {
  if (!task.worktree) {
    return
  }
  const runtime = deps.getRuntime()
  if (typeof runtime.updateManagedWorktreeMeta !== 'function') {
    return
  }
  const workspaceStatus = mapTaskStatusToWorkspaceStatus(task.status)
  void runtime.updateManagedWorktreeMeta(`id:${task.worktree}`, { workspaceStatus }).catch(() => {
    /* mirror is best-effort */
  })
}

// Why: a captain-created board task. Pre-dispatch (backlog); gets an agent when
// the captain drags it into an active column.
export function createCustomTask(
  deps: FleetBoardDeps,
  input: {
    title: string
    brief?: string
    repoSelector?: string
    mode?: TaskMode
  }
): Task {
  const at = nowSeconds()
  const task: Task = {
    id: randomUUID(),
    source: 'custom',
    kind: DEFAULT_KIND,
    mode: input.mode ?? DEFAULT_TASK_MODE,
    title: input.title,
    context: input.brief ? { brief: input.brief } : {},
    status: 'backlog',
    runner: DEFAULT_RUNNER,
    harness: DEFAULT_HARNESS,
    landing: DEFAULT_LANDING,
    autonomy: DEFAULT_AUTONOMY_POLICY,
    repo: null,
    worktree: null,
    branch: null,
    prUrl: null,
    error: null,
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    controlMode: DEFAULT_CONTROL_MODE,
    dispatchTarget: input.repoSelector
      ? {
          repoId: null,
          repoSelector: input.repoSelector,
          connectionId: null,
          worktreeStrategy: 'new'
        }
      : null,
    currentRunId: null,
    createdAt: at,
    updatedAt: at
  }
  deps.db.upsertTask(task)
  deps.emitTask(task)
  return deps.db.getTaskWithRun(task.id) ?? task
}

// Why: move a card between board columns. Terminal statuses also exit a live
// Run so a completed/cancelled task doesn't leave an agent marked working.
export function setTaskStatus(deps: FleetBoardDeps, taskId: string, status: TaskStatus): Task {
  const task = deps.db.getTask(taskId)
  if (!task) {
    throw new Error('work_item_not_found')
  }
  if (isTerminalTaskStatus(status) && task.currentRunId) {
    const run = deps.db.getRun(task.currentRunId)
    if (run && !isTerminalRunStatus(run.status)) {
      const endedAt = nowSeconds()
      deps.db.upsertRun({ ...run, status: 'exited', endedAt, updatedAt: endedAt })
    }
  }
  const updated: Task = { ...task, status, updatedAt: nowSeconds() }
  deps.db.upsertTask(updated)
  mirrorWorktreeStatus(deps, updated)
  mirrorLinearStatus(deps, updated)
  deps.emitTask(updated)
  return deps.db.getTaskWithRun(taskId) ?? updated
}

// Why: assign a project (repo) to a task ahead of dispatch so drag-to-dispatch
// never prompts for a repo. Resolves the repo to capture its id + displayName
// and persists the dispatch target on the Task.
export async function setTaskProject(
  deps: FleetBoardDeps,
  taskId: string,
  repoSelector: string
): Promise<Task> {
  const task = deps.db.getTask(taskId)
  if (!task) {
    throw new Error('work_item_not_found')
  }
  const repo = await deps.getRuntime().showRepo(repoSelector)
  const repoId = (repo as { id?: string }).id ?? null
  const updated: Task = {
    ...task,
    repo: repo.displayName ?? task.repo,
    dispatchTarget: {
      repoId,
      repoSelector,
      connectionId: task.dispatchTarget?.connectionId ?? null,
      worktreeStrategy: task.dispatchTarget?.worktreeStrategy ?? 'new'
    },
    updatedAt: nowSeconds()
  }
  deps.db.upsertTask(updated)
  deps.emitTask(updated)
  return deps.db.getTaskWithRun(taskId) ?? updated
}

export function setTaskControlMode(
  deps: FleetBoardDeps,
  taskId: string,
  controlMode: ControlMode
): Task {
  const task = deps.db.getTask(taskId)
  if (!task) {
    throw new Error('work_item_not_found')
  }
  if (task.controlMode === controlMode) {
    return deps.db.getTaskWithRun(taskId) ?? task
  }
  const updated: Task = { ...task, controlMode, updatedAt: nowSeconds() }
  deps.db.upsertTask(updated)
  deps.db.appendEvent(
    taskId,
    controlMode === 'captain' ? 'captain_takeover' : 'captain_handback',
    { controlMode },
    updated.updatedAt
  )
  deps.emitTask(updated)
  // Why: control handoffs are recorded as work events (above) and reflected in
  // the Fleet strip; they are no longer posted as conductor chat notices.
  return deps.db.getTaskWithRun(taskId) ?? updated
}

export function cancelTaskWork(deps: FleetBoardDeps, taskId: string): Task {
  const task = deps.db.getTask(taskId)
  if (!task) {
    throw new Error('work_item_not_found')
  }
  const updated: Task = {
    ...task,
    status: 'cancelled',
    error: 'cancelled',
    updatedAt: nowSeconds()
  }
  deps.db.upsertTask(updated)
  if (task.currentRunId) {
    const run = deps.db.getRun(task.currentRunId)
    if (run && !isTerminalRunStatus(run.status)) {
      const endedAt = nowSeconds()
      deps.db.upsertRun({ ...run, status: 'exited', endedAt, updatedAt: endedAt })
    }
  }
  deps.emitTask(updated)
  deps.pushFleetNotice(`Cancelled "${task.title}"`)
  return deps.db.getTaskWithRun(taskId) ?? updated
}
