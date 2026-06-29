import { describe, expect, it } from 'vitest'
import { PerchDb } from './perch-db'
import { PerchTaskSyncService } from './perch-task-sync'
import { nowSeconds, type Run } from './perch-types'
import type { LinearCollectionResult, LinearIssue } from '../../shared/types'

function issue(over: Partial<LinearIssue> & { id: string }): LinearIssue {
  return {
    identifier: 'ENG-1',
    title: 'An issue',
    url: 'https://linear.app/x/issue/ENG-1',
    state: { name: 'Todo', type: 'unstarted', color: '' },
    ...over
  } as unknown as LinearIssue
}

function lister(items: LinearIssue[]): () => Promise<LinearCollectionResult<LinearIssue>> {
  return async () => ({ items })
}

function liveRun(taskId: string): Run {
  const at = nowSeconds()
  return {
    id: 'run-x',
    taskId,
    agentId: 'general',
    harness: 'claude',
    mode: 'session',
    status: 'working',
    paneKey: 'tab:leaf',
    terminalHandle: null,
    worktreeId: 'wt',
    repoId: null,
    connectionId: null,
    sessionId: null,
    agentType: 'claude',
    result: null,
    error: null,
    startedAt: at,
    endedAt: null,
    updatedAt: at
  }
}

describe('PerchTaskSyncService', () => {
  it('ingests Linear issues as Tasks and dedups by externalId', async () => {
    const db = new PerchDb(':memory:')
    try {
      const sync = new PerchTaskSyncService({
        db,
        listLinearIssues: lister([issue({ id: 'i1', title: 'First' })])
      })
      await sync.syncLinear()
      let tasks = db.boardTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].source).toBe('linear')
      expect(tasks[0].externalId).toBe('linear:i1')
      expect(tasks[0].status).toBe('assigned') // unstarted -> assigned

      // A second pass with the same issue updates in place (no duplicate).
      const sync2 = new PerchTaskSyncService({
        db,
        listLinearIssues: lister([issue({ id: 'i1', title: 'First (edited)' })])
      })
      await sync2.syncLinear()
      tasks = db.boardTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('First (edited)')
    } finally {
      db.close()
    }
  })

  it('applies project-mapping rules to a new unassigned task at ingest', () => {
    const db = new PerchDb(':memory:')
    try {
      const sync = new PerchTaskSyncService({
        db,
        listLinearIssues: lister([]),
        getProjectMap: () => [
          { teamKey: 'WEB', repoSelector: 'id:other' },
          { teamKey: 'ENG', label: 'backend', repoSelector: 'id:repo-eng' }
        ]
      })
      const matched = sync.upsertLinearIssue(
        issue({
          id: 'm1',
          team: { id: 't', name: 'Eng', key: 'ENG' },
          labels: ['backend']
        })
      )
      expect(matched.dispatchTarget?.repoSelector).toBe('id:repo-eng')

      // No rule matches (wrong label) -> stays unassigned.
      const unmatched = sync.upsertLinearIssue(
        issue({ id: 'm2', team: { id: 't', name: 'Eng', key: 'ENG' }, labels: ['frontend'] })
      )
      expect(unmatched.dispatchTarget).toBeNull()
    } finally {
      db.close()
    }
  })

  it('maps Linear state types to task statuses', () => {
    const db = new PerchDb(':memory:')
    try {
      const sync = new PerchTaskSyncService({ db, listLinearIssues: lister([]) })
      // Why: `started` (human "In Progress" in Linear) maps to `assigned`, not
      // `in_progress`, because in_progress is reserved for dispatched Orca agents.
      expect(
        sync.upsertLinearIssue(issue({ id: 'a', state: { name: '', type: 'started', color: '' } }))
          .status
      ).toBe('assigned')
      expect(
        sync.upsertLinearIssue(
          issue({ id: 'b', state: { name: '', type: 'completed', color: '' } })
        ).status
      ).toBe('done')
      expect(
        sync.upsertLinearIssue(issue({ id: 'c', state: { name: '', type: 'backlog', color: '' } }))
          .status
      ).toBe('backlog')
    } finally {
      db.close()
    }
  })

  it('does not overwrite an in-progress task with a live Run (merge policy)', () => {
    const db = new PerchDb(':memory:')
    try {
      const sync = new PerchTaskSyncService({ db, listLinearIssues: lister([]) })
      const created = sync.upsertLinearIssue(
        issue({ id: 'x', state: { name: '', type: 'unstarted', color: '' } })
      )
      // Simulate a dispatch: a live Run + in_progress status.
      db.upsertRun(liveRun(created.id))
      db.upsertTask({ ...created, status: 'in_progress', currentRunId: 'run-x' })

      // Linear now reports the issue back in backlog — Orca must keep its lifecycle.
      const after = sync.upsertLinearIssue(
        issue({ id: 'x', state: { name: '', type: 'backlog', color: '' } })
      )
      expect(after.status).toBe('in_progress')
      // Pre-dispatch tasks, by contrast, DO follow Linear.
      const pre = sync.upsertLinearIssue(
        issue({ id: 'y', state: { name: '', type: 'unstarted', color: '' } })
      )
      expect(pre.status).toBe('assigned')
    } finally {
      db.close()
    }
  })
})
