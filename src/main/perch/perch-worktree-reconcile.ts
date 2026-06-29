// Why: the unified Task board is the single board — every live worktree must be
// represented as a Task. This reconciliation synthesizes one Task per worktree
// that lacks one (including manual, no-agent worktrees) so the Workspace board
// can be retired without losing rows. It is the full-merge core (plan Phase 2).
import { randomUUID } from 'node:crypto'
import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  DEFAULT_HARNESS,
  DEFAULT_KIND,
  DEFAULT_LANDING,
  DEFAULT_RUNNER,
  nowSeconds,
  type Task,
  type TaskStatus
} from './perch-types'
import type { PerchDb } from './perch-db'

// Why: a worktree summary carries the legacy `workspaceStatus` mirror; only the
// fields the reconciliation needs are required so callers (and tests) can pass a
// minimal shape instead of the full runtime ps summary.
export type ReconcileWorktreeInput = {
  worktreeId: string
  repoId: string
  repo?: string
  displayName?: string
  branch?: string
  workspaceStatus?: string | null
  workspaceKind?: 'git' | 'folder-workspace'
  isArchived?: boolean
  isMainWorktree?: boolean
}

// Why: TaskStatus is the behavioral source of truth; the legacy workspaceStatus
// becomes a mirror. This maps the existing per-worktree status onto a board
// column when synthesizing (and migrating) a worktree-backed Task. Unknown or
// user-custom statuses collapse to backlog (the nearest non-active column).
export function mapWorkspaceStatusToTaskStatus(status: string | null | undefined): TaskStatus {
  switch (status) {
    case 'todo':
      return 'backlog'
    case 'in-progress':
      return 'in_progress'
    case 'in-review':
      return 'in_review'
    case 'completed':
      return 'done'
    default:
      return 'backlog'
  }
}

// Why: the inverse mirror — when Task.status (authoritative) changes for a
// worktree-backed task, the worktree's workspaceStatus is written back so the
// sidebar list / smart-sort stay correct. The board has more lifecycle states
// than the four default workspace columns, so several collapse to the nearest.
export function mapTaskStatusToWorkspaceStatus(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
      return 'todo'
    case 'assigned':
    case 'in_progress':
    case 'blocked':
      return 'in-progress'
    case 'in_review':
      return 'in-review'
    case 'done':
    case 'failed':
    case 'cancelled':
      return 'completed'
  }
}

// Why: the main checkout and archived/folder workspaces are not units of work —
// only real, live git worktrees become synthesized tasks.
function isReconcilableWorktree(input: ReconcileWorktreeInput): boolean {
  if (input.isArchived === true || input.isMainWorktree === true) {
    return false
  }
  return input.workspaceKind === undefined || input.workspaceKind === 'git'
}

function synthesizeWorktreeTask(input: ReconcileWorktreeInput, at: number): Task {
  const repoSelector = `id:${input.repoId}`
  const title =
    input.displayName?.trim() ||
    input.branch?.replace(/^refs\/heads\//, '').trim() ||
    input.repo?.trim() ||
    input.worktreeId
  return {
    id: randomUUID(),
    source: 'captain_manual',
    kind: DEFAULT_KIND,
    // Why: a worktree-backed task is a real project worktree, so it dispatches
    // through the standard worktree path.
    mode: 'project',
    title,
    context: {},
    status: mapWorkspaceStatusToTaskStatus(input.workspaceStatus),
    runner: DEFAULT_RUNNER,
    harness: DEFAULT_HARNESS,
    landing: DEFAULT_LANDING,
    autonomy: DEFAULT_AUTONOMY_POLICY,
    repo: input.repo ?? null,
    worktree: input.worktreeId,
    branch: input.branch ?? null,
    prUrl: null,
    error: null,
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    controlMode: DEFAULT_CONTROL_MODE,
    dispatchTarget: {
      repoId: input.repoId,
      repoSelector,
      connectionId: null,
      worktreeStrategy: input.worktreeId
    },
    currentRunId: null,
    createdAt: at,
    updatedAt: at
  }
}

export type ReconcileResult = {
  created: Task[]
}

// Why: pure reconciliation pass — for each reconcilable worktree without an
// existing linked Task, synthesize one. Dedup is by worktree id (any status) so
// a completed/cancelled worktree-backed task is not resurrected as a backlog
// duplicate. The one-time workspaceStatus->TaskStatus migration is implicit:
// the first pass over an existing worktree maps its status onto the new Task.
export function reconcileWorktreeTasks(
  db: Pick<PerchDb, 'findAnyTaskByWorktreeId' | 'upsertTask'>,
  worktrees: readonly ReconcileWorktreeInput[]
): ReconcileResult {
  const created: Task[] = []
  const at = nowSeconds()
  const seen = new Set<string>()
  for (const input of worktrees) {
    if (!isReconcilableWorktree(input) || seen.has(input.worktreeId)) {
      continue
    }
    seen.add(input.worktreeId)
    if (db.findAnyTaskByWorktreeId(input.worktreeId)) {
      continue
    }
    const task = synthesizeWorktreeTask(input, at)
    db.upsertTask(task)
    created.push(task)
  }
  return { created }
}
