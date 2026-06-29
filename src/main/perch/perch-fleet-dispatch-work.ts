import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import {
  launchProjectRunForTask,
  type DispatchResult,
  type ProjectDispatchDeps
} from './perch-fleet-dispatch'
import { launchScratchRunForTask } from './perch-scratch-dispatch'
import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  DEFAULT_HARNESS,
  DEFAULT_KIND,
  DEFAULT_LANDING,
  DEFAULT_RUNNER,
  nowSeconds,
  type ConductorNoticeRef,
  type Kind,
  type Landing,
  type Run,
  type Task
} from './perch-types'

export type WorkDispatchInput = {
  repoSelector: string
  title: string
  brief?: string
  harness?: 'claude' | 'cursor'
  kind?: Kind
  landing?: Landing
  name?: string
  startupPrompt?: string
  startupAgent?: string
}

export function taskBrief(task: Task): string | undefined {
  const ctx = task.context
  if (ctx && typeof ctx === 'object' && 'brief' in ctx) {
    const brief = (ctx as { brief?: unknown }).brief
    return typeof brief === 'string' && brief.length > 0 ? brief : undefined
  }
  return undefined
}

export type FleetDispatchContext = {
  db: PerchDb
  getRuntime: () => OrcaRuntimeService
  emitTask: (task: Task) => void
  pushFleetNotice: (text: string, ref?: ConductorNoticeRef | null) => void
  taskNoticeRef: (task: Task, run?: Run | null) => ConductorNoticeRef
  markPending: (worktreeId: string, taskId: string) => void
  mirrorWorktreeStatus: (task: Task) => void
}

function projectDispatchDeps(ctx: FleetDispatchContext): ProjectDispatchDeps {
  return {
    runtime: ctx.getRuntime(),
    db: ctx.db,
    brief: taskBrief,
    emitTask: (t) => ctx.emitTask(t),
    reportFailure: (t, reason) => {
      const failed: Task = { ...t, status: 'failed', error: reason, updatedAt: nowSeconds() }
      ctx.db.upsertTask(failed)
      ctx.emitTask(failed)
      ctx.pushFleetNotice(`Could not dispatch "${t.title}": ${reason}`, ctx.taskNoticeRef(failed))
    },
    markPending: (worktreeId, taskId) => ctx.markPending(worktreeId, taskId),
    mirrorWorktreeStatus: (t) => ctx.mirrorWorktreeStatus(t)
  }
}

export async function dispatchWork(
  ctx: FleetDispatchContext,
  input: WorkDispatchInput
): Promise<DispatchResult> {
  const runtime = ctx.getRuntime()
  const repo = await runtime.showRepo(input.repoSelector)
  const repoId = (repo as { id?: string }).id ?? null
  const harness = input.harness ?? DEFAULT_HARNESS
  const at = nowSeconds()
  const task: Task = {
    id: randomUUID(),
    source: 'directive',
    kind: input.kind ?? DEFAULT_KIND,
    mode: 'project',
    title: input.title,
    context: input.brief ? { brief: input.brief } : {},
    status: 'backlog',
    runner: DEFAULT_RUNNER,
    harness,
    landing: input.landing ?? DEFAULT_LANDING,
    autonomy: DEFAULT_AUTONOMY_POLICY,
    repo: repo.displayName,
    worktree: null,
    branch: null,
    prUrl: null,
    error: null,
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    controlMode: DEFAULT_CONTROL_MODE,
    dispatchTarget: {
      repoId,
      repoSelector: input.repoSelector,
      connectionId: null,
      worktreeStrategy: 'new'
    },
    currentRunId: null,
    createdAt: at,
    updatedAt: at
  }
  ctx.db.upsertTask(task)
  ctx.emitTask(task)
  return launchProjectRunForTask(projectDispatchDeps(ctx), task, input.repoSelector, repoId, {
    startupAgent: input.startupAgent,
    startupPrompt: input.startupPrompt ?? input.brief,
    name: input.name
  })
}

export async function dispatchExistingTask(
  ctx: FleetDispatchContext,
  taskId: string,
  repoSelector?: string
): Promise<DispatchResult> {
  const task = ctx.db.getTask(taskId)
  if (!task) {
    throw new Error('work_item_not_found')
  }
  // Why: dispatch is routed by the task's mode. Manual tasks never spawn an
  // agent; scratch tasks launch a floating-terminal agent (no worktree);
  // project tasks cut a managed worktree (the default path).
  if (task.mode === 'manual') {
    throw new Error('manual_task_not_dispatchable')
  }
  if (task.mode === 'scratch') {
    return launchScratchRunForTask(
      {
        runtime: ctx.getRuntime(),
        db: ctx.db,
        brief: taskBrief,
        emitTask: (t) => ctx.emitTask(t),
        reportFailure: (t, reason) => {
          const failed: Task = { ...t, status: 'failed', error: reason, updatedAt: nowSeconds() }
          ctx.db.upsertTask(failed)
          ctx.emitTask(failed)
          ctx.pushFleetNotice(
            `Could not dispatch "${t.title}": ${reason}`,
            ctx.taskNoticeRef(failed)
          )
        },
        markPending: (worktreeId, tid) => ctx.markPending(worktreeId, tid)
      },
      task
    )
  }
  const selector = repoSelector ?? task.dispatchTarget?.repoSelector ?? null
  if (!selector) {
    throw new Error('repo_required')
  }
  const repo = await ctx.getRuntime().showRepo(selector)
  const repoId = (repo as { id?: string }).id ?? null
  return launchProjectRunForTask(projectDispatchDeps(ctx), task, selector, repoId)
}
