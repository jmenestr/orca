import { randomUUID } from 'node:crypto'
import type { AgentStatusState } from '../../shared/agent-status-types'
import type { PerchDb } from './perch-db'
import { defaultTitleFromPrompt } from './perch-fleet-dispatch'
import { mapAgentTypeToHarness } from './perch-fleet-status'
import {
  DEFAULT_AGENT_ID,
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  DEFAULT_KIND,
  DEFAULT_LANDING,
  DEFAULT_RUN_MODE,
  DEFAULT_RUN_STATUS,
  DEFAULT_RUNNER,
  defaultModeForSource,
  isTerminalRunStatus,
  isTerminalTaskStatus,
  nowSeconds,
  type ConductorNoticeRef,
  type Run,
  type RunStatus,
  type Source,
  type Task,
  type TaskStatus
} from './perch-types'
import { verifyLandingArtifacts, buildLandingNotice } from '../workflows/landing-artifacts'
import { getWorkflowsService } from '../workflows/resolve'

export type FleetObserveInput = {
  paneKey: string
  tabId?: string
  worktreeId?: string
  terminalHandle?: string
  agentType?: string
  state: AgentStatusState
  prompt?: string
  /** The agent's latest assistant message, used as the report on completion. */
  lastAssistantMessage?: string
  preferredSource?: Source
}

export type FleetRunLifecycleDeps = {
  db: Pick<PerchDb, 'upsertRun' | 'upsertTask' | 'getTask'>
  emitTask: (task: Task) => void
  pushFleetNotice: (text: string, ref?: ConductorNoticeRef | null) => void
  taskNoticeRef: (task: Task, run?: Run | null) => ConductorNoticeRef
  clearPending: (worktreeId: string) => void
}

// Why: build a fresh Run object for a pane we are observing for the first time.
export function newRun(taskId: string | null, input: FleetObserveInput): Run {
  const at = nowSeconds()
  return {
    id: randomUUID(),
    taskId,
    agentId: DEFAULT_AGENT_ID,
    harness: mapAgentTypeToHarness(input.agentType),
    mode: DEFAULT_RUN_MODE,
    status: DEFAULT_RUN_STATUS,
    paneKey: input.paneKey,
    terminalHandle: input.terminalHandle ?? null,
    worktreeId: input.worktreeId ?? null,
    repoId: null,
    connectionId: null,
    sessionId: null,
    agentType: input.agentType ?? null,
    result: null,
    error: null,
    startedAt: at,
    endedAt: null,
    updatedAt: at
  }
}

// Why: a Run's turn activity advances the Task lifecycle only forward into
// in_progress; terminal Task states are never set from a turn event.
export function advanceTaskForRun(
  deps: Pick<FleetRunLifecycleDeps, 'db'>,
  task: Task,
  run: Run,
  input: FleetObserveInput
): Task {
  let status: TaskStatus = task.status
  if (!isTerminalTaskStatus(status) && (status === 'backlog' || status === 'assigned')) {
    if (
      run.status === 'working' ||
      run.status === 'awaiting_input' ||
      run.status === 'awaiting_approval'
    ) {
      status = 'in_progress'
    }
  }
  const updated: Task = {
    ...task,
    status,
    currentRunId: run.id,
    worktree: input.worktreeId ?? task.worktree,
    title:
      task.source === 'captain_manual' && input.prompt?.trim()
        ? defaultTitleFromPrompt(input.prompt, input.agentType)
        : task.title,
    updatedAt: nowSeconds()
  }
  deps.db.upsertTask(updated)
  return updated
}

export function createCaptainTaskAndRun(
  deps: FleetRunLifecycleDeps,
  input: FleetObserveInput,
  runStatus: RunStatus
): Task {
  const at = nowSeconds()
  const source: Source = input.preferredSource ?? 'captain_manual'
  const taskId = randomUUID()
  const task: Task = {
    id: taskId,
    source,
    kind: DEFAULT_KIND,
    mode: defaultModeForSource(source),
    title: defaultTitleFromPrompt(input.prompt, input.agentType),
    context: input.prompt ? { prompt: input.prompt } : {},
    status: 'in_progress',
    runner: DEFAULT_RUNNER,
    harness: mapAgentTypeToHarness(input.agentType),
    landing: DEFAULT_LANDING,
    autonomy: DEFAULT_AUTONOMY_POLICY,
    repo: null,
    worktree: input.worktreeId ?? null,
    branch: null,
    prUrl: null,
    error: null,
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    controlMode: DEFAULT_CONTROL_MODE,
    dispatchTarget: null,
    currentRunId: null,
    createdAt: at,
    updatedAt: at
  }
  const run: Run = { ...newRun(taskId, input), status: runStatus }
  task.currentRunId = run.id
  deps.db.upsertTask(task)
  deps.db.upsertRun(run)
  if (input.worktreeId) {
    deps.clearPending(input.worktreeId)
  }
  deps.emitTask(task)
  // Why: a newly observed agent shows up live in the Fleet strip / Activity; its
  // start is not posted to the conductor chat (live-state churn).
  return { ...task, currentRun: run }
}

export function applyRunUpdate(
  deps: FleetRunLifecycleDeps,
  run: Run,
  input: FleetObserveInput,
  runStatus: RunStatus,
  knownTask?: Task
): Task {
  const previousRunStatus = run.status
  const endedAt = isTerminalRunStatus(runStatus) ? nowSeconds() : run.endedAt
  const updatedRun: Run = {
    ...run,
    status: runStatus,
    paneKey: input.paneKey,
    worktreeId: input.worktreeId ?? run.worktreeId,
    terminalHandle: input.terminalHandle ?? run.terminalHandle,
    agentType: input.agentType ?? run.agentType,
    harness: input.agentType ? mapAgentTypeToHarness(input.agentType) : run.harness,
    endedAt,
    updatedAt: nowSeconds()
  }
  deps.db.upsertRun(updatedRun)

  const task = knownTask ?? (updatedRun.taskId ? deps.db.getTask(updatedRun.taskId) : undefined)
  if (!task) {
    // Orphan run with no task — nothing to surface. Return a minimal Task so
    // the signature holds; callers go through observeAgentHook which guards.
    return createCaptainTaskAndRun(deps, input, runStatus)
  }
  const advanced = advanceTaskForRun(deps, task, updatedRun, input)
  const emitted: Task = { ...advanced, currentRun: updatedRun }
  deps.emitTask(advanced)
  reportRunTransition(deps, emitted, previousRunStatus, runStatus, input.lastAssistantMessage)
  return emitted
}

// Why: the conductor must not stream an agent's output — instead the fleet
// surfaces a report into the conductor chat only on meaningful Run transitions
// (idle/needs-input/exited/failed). Routine working churn is suppressed.
export function reportRunTransition(
  deps: FleetRunLifecycleDeps,
  task: Task,
  previousStatus: RunStatus,
  nextStatus: RunStatus,
  lastAssistantMessage?: string
): void {
  if (previousStatus === nextStatus) {
    return
  }
  const ref = deps.taskNoticeRef(task)
  if (nextStatus === 'idle') {
    const ctx =
      task.context && typeof task.context === 'object'
        ? (task.context as Record<string, unknown>)
        : null
    const skillTaskId = typeof ctx?.skillTaskId === 'string' ? ctx.skillTaskId : null
    const runId = typeof ctx?.runId === 'string' ? ctx.runId : null
    if (task.landing === 'report' && skillTaskId && runId) {
      try {
        const manifest = getWorkflowsService().getManifest(skillTaskId)
        if (manifest) {
          const status = verifyLandingArtifacts(manifest, runId)
          if (status.complete) {
            const reviewMode =
              (typeof ctx?.reviewMode === 'string' ? ctx.reviewMode : null) ??
              manifest.review?.mode ??
              'chat-only'
            const nextTaskStatus: TaskStatus = reviewMode === 'report-first' ? 'in_review' : 'done'
            if (!isTerminalTaskStatus(task.status) && task.status !== nextTaskStatus) {
              const updated: Task = { ...task, status: nextTaskStatus, updatedAt: nowSeconds() }
              deps.db.upsertTask(updated)
              deps.emitTask(updated)
            }
            deps.pushFleetNotice(buildLandingNotice({ title: task.title, status, ref }), ref)
            return
          }
        }
      } catch {
        // Fall through to the default turn notice.
      }
    }
    // Why: idle means the agent finished THIS turn, not the whole task. Surface
    // a soft "finished a turn" so the captain can look, without ending the Task.
    // Pass the agent's full last message (already capped upstream at the hook
    // assistant-message limit); the conductor chat collapses long markdown and
    // can pop it open in a side panel, so we no longer truncate it here.
    const report = lastAssistantMessage?.trim() ?? ''
    deps.pushFleetNotice(
      report.length > 0
        ? `**${task.title}** finished a turn.\n\n${report}`
        : `**${task.title}** finished a turn. Open the agent to see its result.`,
      ref
    )
    return
  }
  if (nextStatus === 'failed') {
    deps.pushFleetNotice(`**${task.title}** failed${task.error ? `: ${task.error}` : '.'}`, ref)
    return
  }
  if (nextStatus === 'awaiting_input' || nextStatus === 'awaiting_approval') {
    deps.pushFleetNotice(`**${task.title}** needs your input.`, ref)
  }
  // Why: working / dispatched / exited are live-state churn already reflected in
  // the Fleet strip (and Activity), so they are not posted to the conductor
  // chat. The chat is scoped to action-needed events (needs input, failure) and
  // reports, keeping the conversation surface clean.
}
