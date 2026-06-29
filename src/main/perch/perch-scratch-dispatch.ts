// Why: scratch-mode dispatch launches a floating-terminal agent (no managed
// worktree) and binds a Run to it. Kept out of the already-oversized
// perch-fleet-service.ts per the plan (extract scratch into its own module).
import { randomUUID } from 'node:crypto'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/constants'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import { describeDispatchFailure, type DispatchResult } from './perch-fleet-dispatch'
import {
  DEFAULT_AGENT_ID,
  DEFAULT_RUN_MODE,
  DEFAULT_HARNESS,
  nowSeconds,
  type Harness,
  type Run,
  type Task
} from './perch-types'

export type ScratchDispatchDeps = {
  runtime: Pick<OrcaRuntimeService, 'launchScratchAgentTerminal'>
  db: Pick<PerchDb, 'upsertTask' | 'upsertRun'>
  brief: (task: Task) => string | undefined
  emitTask: (task: Task) => void
  /** Persist+surface a dispatch failure (sets the task failed, pushes a notice). */
  reportFailure: (task: Task, reason: string) => void
  /** Remember the floating worktree so the first hook attaches to this task. */
  markPending: (worktreeId: string, taskId: string) => void
}

// Why: dispatch a scratch-mode task into the floating terminal scope. The Run is
// bound to FLOATING_TERMINAL_WORKTREE_ID and the pane the floating agent spawned
// in, so hooks/observe still attribute turns. On failure the task is marked
// failed (via reportFailure) and the reason is rethrown.
export async function launchScratchRunForTask(
  deps: ScratchDispatchDeps,
  task: Task
): Promise<DispatchResult> {
  const agent = (task.harness ?? DEFAULT_HARNESS) as 'claude' | 'cursor'
  let terminal: Awaited<ReturnType<OrcaRuntimeService['launchScratchAgentTerminal']>>
  try {
    terminal = await deps.runtime.launchScratchAgentTerminal({
      agent,
      prompt: deps.brief(task) ?? task.title,
      title: task.title,
      activate: true
    })
  } catch (err) {
    const reason = describeDispatchFailure(err)
    deps.reportFailure(task, reason)
    throw new Error(reason)
  }

  const runAt = nowSeconds()
  const run: Run = {
    id: randomUUID(),
    taskId: task.id,
    agentId: DEFAULT_AGENT_ID,
    harness: agent as Harness,
    mode: DEFAULT_RUN_MODE,
    status: 'dispatched',
    paneKey: terminal.paneKey ?? null,
    terminalHandle: terminal.handle ?? null,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    repoId: null,
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
  if (terminal.paneKey) {
    deps.markPending(FLOATING_TERMINAL_WORKTREE_ID, task.id)
  }
  const linkedTask: Task = {
    ...task,
    status: 'assigned',
    worktree: FLOATING_TERMINAL_WORKTREE_ID,
    currentRunId: run.id,
    updatedAt: nowSeconds()
  }
  deps.db.upsertTask(linkedTask)
  deps.emitTask(linkedTask)
  return {
    task: { ...linkedTask, currentRun: run },
    run,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID
  }
}
