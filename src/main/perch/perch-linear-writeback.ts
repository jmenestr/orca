// Why: the Task is the single Linear sync hub. After dispatch, Orca owns the
// lifecycle, so a board status change must be written back to the Linear issue's
// workflow state (outbound). This is the one writer; the old worktree->Linear
// sync is retired (plan Phase 3).
import { getIssue } from '../linear/issues'
import { updateIssue } from '../linear/issues'
import { getTeamStates } from '../linear/teams'
import type { LinearIssue, LinearWorkflowState } from '../../shared/types'
import type { TaskStatus } from './perch-types'

// Why: map a board TaskStatus onto the Linear workflow-state *type* it should
// land in. Linear state types are triage | backlog | unstarted | started |
// completed | canceled. in_review/blocked have no dedicated Linear type, so
// they stay 'started' (the issue is in flight). This is the inverse of
// mapLinearStateToTaskStatus used at ingest.
export function mapTaskStatusToLinearStateType(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
      return 'backlog'
    case 'assigned':
      return 'unstarted'
    case 'in_progress':
    case 'in_review':
    case 'blocked':
      return 'started'
    case 'done':
      return 'completed'
    case 'failed':
    case 'cancelled':
      return 'canceled'
  }
}

export function parseLinearIssueId(externalId: string | null): string | null {
  if (!externalId || !externalId.startsWith('linear:')) {
    return null
  }
  const id = externalId.slice('linear:'.length).trim()
  return id.length > 0 ? id : null
}

// Why: pick the workflow state for the target type. Prefer an exact type match
// at the lowest position (Linear orders states within a type); fall back to the
// first state of that type. Returns null when the team has no such state.
export function resolveWorkflowStateForType(
  states: readonly LinearWorkflowState[],
  targetType: string
): LinearWorkflowState | null {
  const matches = states.filter((state) => state.type === targetType)
  if (matches.length === 0) {
    return null
  }
  return [...matches].sort((a, b) => a.position - b.position)[0]
}

export type LinearWriteBackDeps = {
  getIssue: (id: string, workspaceId?: string | null) => Promise<LinearIssue | null>
  getTeamStates: (teamId: string, workspaceId?: string | null) => Promise<LinearWorkflowState[]>
  updateIssue: (
    id: string,
    updates: { stateId?: string },
    workspaceId?: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

const defaultDeps: LinearWriteBackDeps = {
  getIssue: (id, workspaceId) => getIssue(id, workspaceId),
  getTeamStates: (teamId, workspaceId) => getTeamStates(teamId, workspaceId),
  updateIssue: (id, updates, workspaceId) => updateIssue(id, updates, workspaceId)
}

export type LinearWriteBackResult = { ok: true; updated: boolean } | { ok: false; reason: string }

// Why: resolve the issue's team + current state, find the target state for the
// new TaskStatus, and write it back. Best-effort and idempotent: a no-op when
// the issue is already in a matching-type state or the issue/team/state is
// missing. Injectable deps keep it testable without a live Linear client.
export async function writeBackTaskStatusToLinear(
  externalId: string | null,
  status: TaskStatus,
  deps: Partial<LinearWriteBackDeps> = {}
): Promise<LinearWriteBackResult> {
  const resolved = { ...defaultDeps, ...deps }
  const issueId = parseLinearIssueId(externalId)
  if (!issueId) {
    return { ok: false, reason: 'not_a_linear_task' }
  }
  const issue = await resolved.getIssue(issueId)
  if (!issue?.team?.id) {
    return { ok: false, reason: 'issue_not_found' }
  }
  const targetType = mapTaskStatusToLinearStateType(status)
  if (issue.state?.type === targetType) {
    // Why: already in a state of the target type; do not churn the exact state.
    return { ok: true, updated: false }
  }
  const states = await resolved.getTeamStates(issue.team.id, issue.workspaceId)
  const target = resolveWorkflowStateForType(states, targetType)
  if (!target) {
    return { ok: false, reason: 'missing_workflow_state' }
  }
  const result = await resolved.updateIssue(issue.id, { stateId: target.id }, issue.workspaceId)
  if (!result.ok) {
    return { ok: false, reason: result.error }
  }
  return { ok: true, updated: true }
}
