// Why: read-only ingest of Linear issues into perch Tasks for the Task board.
// Linear is the source of truth ONLY while a Task is pre-dispatch (backlog/
// assigned with no live Run); once Orca has dispatched an agent it owns the
// lifecycle and Linear state no longer overwrites it. This keeps the board's
// drag-to-dispatch control from being clobbered by background sync.
import { randomUUID } from 'node:crypto'
import type {
  LinearIssue,
  LinearCollectionResult,
  TaskBoardLinearProjectRule
} from '../../shared/types'
import { listIssues, type LinearListFilter } from '../linear/issues'
import type { PerchDb } from './perch-db'
import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  DEFAULT_HARNESS,
  DEFAULT_KIND,
  DEFAULT_LANDING,
  DEFAULT_RUNNER,
  mapLinearStateToTaskStatus,
  nowSeconds,
  type DispatchTarget,
  type Task
} from './perch-types'

const SYNC_INTERVAL_MS = 60_000
const SYNC_ISSUE_LIMIT = 100

export type LinearIssueLister = (
  filter: LinearListFilter,
  limit: number
) => Promise<LinearCollectionResult<LinearIssue>>

export type PerchTaskSyncOptions = {
  db: PerchDb
  /** Injectable for tests; defaults to the real Linear client. */
  listLinearIssues?: LinearIssueLister
  /** Resolves the configured Linear scope; defaults to assigned-to-me. */
  getScope?: () => LinearListFilter
  /** Default project-assignment rules applied to new pre-dispatch tasks. */
  getProjectMap?: () => TaskBoardLinearProjectRule[]
  onTaskChanged?: (task: Task) => void
}

function linearExternalId(issueId: string): string {
  return `linear:${issueId}`
}

function matchesLowercase(value: string | undefined, candidate: string | undefined): boolean {
  if (value === undefined || value.trim() === '') {
    return true
  }
  return (candidate ?? '').toLowerCase() === value.trim().toLowerCase()
}

// Why: pick the first mapping rule whose (team key / project name / label)
// criteria all match the issue, returning its repo selector. Empty rule fields
// are wildcards; a rule with no criteria matches everything (a catch-all).
export function resolveLinearProjectRepoSelector(
  issue: LinearIssue,
  rules: readonly TaskBoardLinearProjectRule[]
): string | null {
  for (const rule of rules) {
    if (!rule.repoSelector || rule.repoSelector.trim() === '') {
      continue
    }
    const labelMatch =
      rule.label === undefined ||
      rule.label.trim() === '' ||
      issue.labels.some((label) => label.toLowerCase() === rule.label!.trim().toLowerCase())
    if (
      matchesLowercase(rule.teamKey, issue.team?.key) &&
      matchesLowercase(rule.projectName, issue.project?.name) &&
      labelMatch
    ) {
      return rule.repoSelector.trim()
    }
  }
  return null
}

export class PerchTaskSyncService {
  private readonly db: PerchDb
  private readonly listLinearIssues: LinearIssueLister
  private readonly getScope: () => LinearListFilter
  private readonly getProjectMap: () => TaskBoardLinearProjectRule[]
  private readonly onTaskChanged?: (task: Task) => void
  private timer: NodeJS.Timeout | null = null
  private inFlight = false

  constructor(options: PerchTaskSyncOptions) {
    this.db = options.db
    this.listLinearIssues =
      options.listLinearIssues ?? ((filter, limit) => listIssues(filter, limit))
    this.getScope = options.getScope ?? (() => 'assigned')
    this.getProjectMap = options.getProjectMap ?? (() => [])
    this.onTaskChanged = options.onTaskChanged
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.syncLinear()
    }, SYNC_INTERVAL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // Why: one read-only pass over the configured Linear scope. Best-effort -
  // failures (not connected, network) return 0 rather than throwing, so a board
  // open or poll never errors the UI.
  async syncLinear(): Promise<{ synced: number }> {
    if (this.inFlight) {
      return { synced: 0 }
    }
    this.inFlight = true
    try {
      const result = await this.listLinearIssues(this.getScope(), SYNC_ISSUE_LIMIT)
      const at = nowSeconds()
      let synced = 0
      for (const issue of result.items) {
        this.upsertLinearIssue(issue, at)
        synced += 1
      }
      return { synced }
    } catch (err) {
      console.warn('[perch] Linear sync failed:', err instanceof Error ? err.message : err)
      return { synced: 0 }
    } finally {
      this.inFlight = false
    }
  }

  // Why: exposed for tests and the manual-refresh RPC; same path as the poll.
  upsertLinearIssue(issue: LinearIssue, at = nowSeconds()): Task {
    const externalId = linearExternalId(issue.id)
    const mapped = mapLinearStateToTaskStatus(issue.state?.type)
    const existing = this.db.getTaskByExternalId(externalId)
    const context = issue.description ? { brief: issue.description } : undefined

    if (!existing) {
      // Why: apply default project-assignment rules to a fresh, unassigned task
      // so drag-to-dispatch never prompts for a repo.
      const repoSelector = resolveLinearProjectRepoSelector(issue, this.getProjectMap())
      const dispatchTarget: DispatchTarget | null = repoSelector
        ? { repoId: null, repoSelector, connectionId: null, worktreeStrategy: 'new' }
        : null
      const task: Task = {
        id: randomUUID(),
        source: 'linear',
        kind: DEFAULT_KIND,
        mode: 'project',
        title: issue.title,
        context: context ?? {},
        status: mapped,
        runner: DEFAULT_RUNNER,
        harness: DEFAULT_HARNESS,
        landing: DEFAULT_LANDING,
        autonomy: DEFAULT_AUTONOMY_POLICY,
        repo: null,
        worktree: null,
        branch: null,
        prUrl: null,
        error: null,
        externalId,
        externalIdentifier: issue.identifier,
        externalUrl: issue.url,
        controlMode: DEFAULT_CONTROL_MODE,
        dispatchTarget,
        currentRunId: null,
        createdAt: at,
        updatedAt: at
      }
      this.db.upsertTask(task)
      this.emit(task.id)
      return task
    }

    // Why: Linear owns status only pre-dispatch. Once a Run exists or the task
    // has advanced past assigned, keep the local lifecycle status.
    const preDispatch =
      !existing.currentRunId && (existing.status === 'backlog' || existing.status === 'assigned')
    const updated: Task = {
      ...existing,
      title: issue.title,
      externalIdentifier: issue.identifier,
      externalUrl: issue.url,
      context: context ?? existing.context,
      status: preDispatch ? mapped : existing.status,
      updatedAt: at
    }
    this.db.upsertTask(updated)
    this.emit(updated.id)
    return updated
  }

  private emit(taskId: string): void {
    const task = this.db.getTaskWithRun(taskId)
    if (task) {
      this.onTaskChanged?.(task)
    }
  }
}
