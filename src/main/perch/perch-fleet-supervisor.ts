import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import type { FleetObserveInput } from './perch-fleet-run-lifecycle'
import { mapAgentStateToRunStatus } from './perch-fleet-status'
import { reconcileWorktreeTasks, type ReconcileWorktreeInput } from './perch-worktree-reconcile'
import type { Task } from './perch-types'

export type FleetSupervisorDeps = {
  db: PerchDb
  getRuntime: () => OrcaRuntimeService
  emitTask: (task: Task) => void
  observeAgentHook: (input: FleetObserveInput) => Task | null
}

// Why: synthesize a Task for every live worktree that lacks one (full merge).
// Runs on board hydrate and on the supervisor cadence. Emits each created Task
// so subscribed renderers see new rows without a full refetch.
export async function reconcileWorktrees(deps: FleetSupervisorDeps): Promise<void> {
  const runtime = deps.getRuntime()
  if (typeof runtime.getWorktreePs !== 'function') {
    return
  }
  try {
    const ps = await runtime.getWorktreePs(200)
    const inputs: ReconcileWorktreeInput[] = ps.worktrees.map((wt) => ({
      worktreeId: wt.worktreeId,
      repoId: wt.repoId,
      repo: wt.repo,
      displayName: wt.displayName,
      branch: wt.branch,
      workspaceStatus: wt.workspaceStatus,
      workspaceKind: wt.workspaceKind,
      isArchived: wt.isArchived,
      isMainWorktree: wt.isMainWorktree
    }))
    const { created } = reconcileWorktreeTasks(deps.db, inputs)
    for (const task of created) {
      deps.emitTask(task)
    }
  } catch {
    /* reconciliation is best-effort */
  }
}

export async function pollWorktreePs(deps: FleetSupervisorDeps): Promise<void> {
  const runtime = deps.getRuntime()
  try {
    const ps = await runtime.getWorktreePs(50)
    // Why: the supervisor cadence also reconciles worktrees -> Tasks so a
    // worktree created outside the board (sidebar/CLI) surfaces as a row.
    const { created } = reconcileWorktreeTasks(
      deps.db,
      ps.worktrees.map((wt) => ({
        worktreeId: wt.worktreeId,
        repoId: wt.repoId,
        repo: wt.repo,
        displayName: wt.displayName,
        branch: wt.branch,
        workspaceStatus: wt.workspaceStatus,
        workspaceKind: wt.workspaceKind,
        isArchived: wt.isArchived,
        isMainWorktree: wt.isMainWorktree
      }))
    )
    for (const task of created) {
      deps.emitTask(task)
    }
    for (const summary of ps.worktrees) {
      for (const agent of summary.agents ?? []) {
        const existingRun = deps.db.getRunByPaneKey(agent.paneKey)
        const runStatus = mapAgentStateToRunStatus(agent.state)
        // Why: only observe on a new pane or a real status change so the poll
        // doesn't re-emit unchanged tasks every tick. No terminal guard — idle
        // is non-terminal, so a revived agent transitions naturally.
        if (!existingRun || existingRun.status !== runStatus) {
          deps.observeAgentHook({
            paneKey: agent.paneKey,
            worktreeId: summary.worktreeId,
            agentType: agent.agentType ?? undefined,
            state: agent.state,
            prompt: agent.prompt
          })
        }
      }
    }
  } catch {
    /* poll is best-effort */
  }
}
