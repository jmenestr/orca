import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import {
  DEFAULT_AGENT_ID,
  DEFAULT_RUN_MODE,
  nowSeconds,
  type Harness,
  type Run,
  type Task
} from './perch-types'

// Why: createManagedWorktree errors are terse and internal; translate the common
// failure (a repo with no commits has no base ref to branch a worktree from)
// into a captain-actionable message and pass others through verbatim.
export function describeDispatchFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  // Why: a base-ref REFRESH/network failure is not an empty repo. Surface it
  // verbatim instead of tacking on the bogus "no commits" advice.
  if (/could not refresh|check your network/i.test(message)) {
    return message
  }
  // Why: genuine empty-repo signals (no base ref to branch from) map to the
  // make-an-initial-commit hint.
  if (
    /base ref|base branch|resolve.*base|no commits|unborn|ambiguous argument 'HEAD'/i.test(message)
  ) {
    return `${message} (the target repo likely has no commits yet - make an initial commit, then dispatch again)`
  }
  return message
}

// Why: createManagedWorktree derives the worktree path AND git branch from
// `name`. Re-dispatching the same task, or two tasks with the same/similar
// title, would collide with an existing local branch and fail ("Branch already
// exists locally"). Append a short unique suffix so every dispatch gets its own
// branch/worktree; the human-facing displayName stays the unmodified title.
export function uniqueDispatchName(base: string): string {
  const trimmed = base.trim()
  const suffix = randomUUID().slice(0, 8)
  return trimmed.length > 0 ? `${trimmed}-${suffix}` : `task-${suffix}`
}

export function defaultTitleFromPrompt(
  prompt: string | undefined,
  agentType: string | undefined
): string {
  const trimmed = prompt?.trim()
  if (trimmed && trimmed.length > 0) {
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
  }
  if (agentType) {
    return `${agentType} agent`
  }
  return 'Agent session'
}

export type DispatchResult = {
  task: Task
  run: Run | null
  worktreeId: string
}

export type ProjectDispatchDeps = {
  runtime: Pick<OrcaRuntimeService, 'createManagedWorktree'>
  db: Pick<PerchDb, 'upsertTask' | 'upsertRun'>
  brief: (task: Task) => string | undefined
  emitTask: (task: Task) => void
  /** Persist+surface a dispatch failure (sets the task failed, pushes a notice). */
  reportFailure: (task: Task, reason: string) => void
  /** Remember the worktree so the first hook attaches to this task. */
  markPending: (worktreeId: string, taskId: string) => void
  mirrorWorktreeStatus: (task: Task) => void
}

// Why: shared worktree-create + Run-create + link path for both new and
// existing task dispatch. On failure the task is marked failed and the reason
// surfaced; on success the task moves to 'assigned' with a dispatched Run.
export async function launchProjectRunForTask(
  deps: ProjectDispatchDeps,
  task: Task,
  repoSelector: string,
  repoId: string | null,
  opts?: { startupAgent?: string; startupPrompt?: string; name?: string }
): Promise<DispatchResult> {
  const agent = (opts?.startupAgent ?? task.harness) as 'claude' | 'cursor'
  let result: Awaited<ReturnType<OrcaRuntimeService['createManagedWorktree']>>
  try {
    result = await deps.runtime.createManagedWorktree({
      repoSelector,
      name: uniqueDispatchName(opts?.name ?? task.title),
      displayName: task.title,
      createdWithAgent: agent,
      startupAgent: agent,
      startupPrompt: opts?.startupPrompt ?? deps.brief(task),
      activate: true,
      // Why: dispatch into a codespace/remote "main" repo must not hard-fail
      // when origin is unreachable; fall back to the local base ref.
      allowStaleBaseRefOnRefreshFailure: true
    })
  } catch (err) {
    const reason = describeDispatchFailure(err)
    deps.reportFailure(task, reason)
    throw new Error(reason)
  }

  const worktreeId = result.worktree.id
  const runAt = nowSeconds()
  const run: Run = {
    id: randomUUID(),
    taskId: task.id,
    agentId: DEFAULT_AGENT_ID,
    harness: agent as Harness,
    mode: DEFAULT_RUN_MODE,
    status: 'dispatched',
    paneKey: result.startupTerminal?.paneKey ?? null,
    terminalHandle: result.startupTerminal?.handle ?? null,
    worktreeId,
    repoId,
    connectionId: null,
    sessionId: null,
    agentType: agent,
    result: null,
    error: null,
    startedAt: runAt,
    endedAt: null,
    updatedAt: runAt
  }
  deps.db.upsertRun(run)
  deps.markPending(worktreeId, task.id)

  const linkedTask: Task = {
    ...task,
    status: 'assigned',
    worktree: worktreeId,
    dispatchTarget: { repoId, repoSelector, connectionId: null, worktreeStrategy: 'new' },
    currentRunId: run.id,
    updatedAt: nowSeconds()
  }
  deps.db.upsertTask(linkedTask)
  deps.mirrorWorktreeStatus(linkedTask)
  deps.emitTask(linkedTask)
  return { task: { ...linkedTask, currentRun: run }, run, worktreeId }
}
