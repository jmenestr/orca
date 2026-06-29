import type { PerchDb } from './perch-db'
import {
  applyRunUpdate,
  createCaptainTaskAndRun,
  newRun,
  type FleetRunLifecycleDeps
} from './perch-fleet-run-lifecycle'
import type { FleetObserveInput } from './perch-fleet-run-lifecycle'
import { mapAgentStateToRunStatus } from './perch-fleet-status'
import type { Task } from './perch-types'

export type FleetObserveDeps = {
  db: PerchDb
  pendingDispatchByWorktree: Map<string, string>
  runLifecycleDeps: () => FleetRunLifecycleDeps
}

// Why: a hook tells us the live turn-state of the agent in a pane. We resolve
// (or create) the Run for that pane, update its turn-status, and advance the
// Task lifecycle without ever marking the Task terminal from a turn event.
export function observeAgentHook(deps: FleetObserveDeps, input: FleetObserveInput): Task | null {
  if (!input.paneKey) {
    return null
  }
  const runStatus = mapAgentStateToRunStatus(input.state)

  const existingRun = deps.db.getRunByPaneKey(input.paneKey)
  if (existingRun && existingRun.taskId) {
    return applyRunUpdate(deps.runLifecycleDeps(), existingRun, input, runStatus)
  }

  // No Run owns this pane yet. Attach to a pending dispatched Task for the
  // worktree if one exists; otherwise this is a captain-started agent.
  const pendingTaskId =
    (input.worktreeId ? deps.pendingDispatchByWorktree.get(input.worktreeId) : undefined) ??
    (input.worktreeId ? deps.db.getTaskByWorktreeId(input.worktreeId)?.id : undefined)

  if (pendingTaskId) {
    const task = deps.db.getTask(pendingTaskId)
    if (task) {
      if (input.worktreeId) {
        deps.pendingDispatchByWorktree.delete(input.worktreeId)
      }
      const placeholder = task.currentRunId ? deps.db.getRun(task.currentRunId) : undefined
      // Why: reuse the dispatch-time placeholder Run (status 'dispatched')
      // even if its paneKey differs from the hook's, so the dispatched Task
      // binds to the real pane instead of spawning a duplicate Run.
      const run =
        placeholder && placeholder.status === 'dispatched' ? placeholder : newRun(task.id, input)
      return applyRunUpdate(deps.runLifecycleDeps(), run, input, runStatus, task)
    }
  }

  return createCaptainTaskAndRun(deps.runLifecycleDeps(), input, runStatus)
}
