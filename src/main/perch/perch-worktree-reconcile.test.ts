import { describe, expect, it } from 'vitest'
import { PerchDb } from './perch-db'
import {
  mapTaskStatusToWorkspaceStatus,
  mapWorkspaceStatusToTaskStatus,
  reconcileWorktreeTasks,
  type ReconcileWorktreeInput
} from './perch-worktree-reconcile'

function wt(
  overrides: Partial<ReconcileWorktreeInput> & { worktreeId: string }
): ReconcileWorktreeInput {
  return {
    repoId: 'repo-1',
    repo: 'widget',
    displayName: overrides.worktreeId,
    branch: 'feature',
    workspaceStatus: 'in-progress',
    workspaceKind: 'git',
    isArchived: false,
    isMainWorktree: false,
    ...overrides
  }
}

describe('mapWorkspaceStatusToTaskStatus', () => {
  it('maps the default workspace statuses onto board columns', () => {
    expect(mapWorkspaceStatusToTaskStatus('todo')).toBe('backlog')
    expect(mapWorkspaceStatusToTaskStatus('in-progress')).toBe('in_progress')
    expect(mapWorkspaceStatusToTaskStatus('in-review')).toBe('in_review')
    expect(mapWorkspaceStatusToTaskStatus('completed')).toBe('done')
  })

  it('collapses unknown/custom statuses to backlog', () => {
    expect(mapWorkspaceStatusToTaskStatus('some-custom-status')).toBe('backlog')
    expect(mapWorkspaceStatusToTaskStatus(null)).toBe('backlog')
    expect(mapWorkspaceStatusToTaskStatus(undefined)).toBe('backlog')
  })
})

describe('mapTaskStatusToWorkspaceStatus', () => {
  it('mirrors task statuses back onto workspace statuses', () => {
    expect(mapTaskStatusToWorkspaceStatus('backlog')).toBe('todo')
    expect(mapTaskStatusToWorkspaceStatus('in_progress')).toBe('in-progress')
    expect(mapTaskStatusToWorkspaceStatus('in_review')).toBe('in-review')
    expect(mapTaskStatusToWorkspaceStatus('done')).toBe('completed')
    expect(mapTaskStatusToWorkspaceStatus('cancelled')).toBe('completed')
  })
})

describe('reconcileWorktreeTasks', () => {
  it('creates one task per worktree with the mapped status', () => {
    const db = new PerchDb(':memory:')
    const { created } = reconcileWorktreeTasks(db, [
      wt({ worktreeId: 'wt-1', workspaceStatus: 'in-progress' }),
      wt({ worktreeId: 'wt-2', workspaceStatus: 'todo' })
    ])
    expect(created).toHaveLength(2)
    const t1 = db.findAnyTaskByWorktreeId('wt-1')
    expect(t1?.source).toBe('captain_manual')
    expect(t1?.status).toBe('in_progress')
    expect(t1?.dispatchTarget?.repoSelector).toBe('id:repo-1')
    expect(db.findAnyTaskByWorktreeId('wt-2')?.status).toBe('backlog')
    db.close()
  })

  it('dedups: a worktree with an existing task is not recreated', () => {
    const db = new PerchDb(':memory:')
    reconcileWorktreeTasks(db, [wt({ worktreeId: 'wt-1' })])
    const second = reconcileWorktreeTasks(db, [wt({ worktreeId: 'wt-1' })])
    expect(second.created).toHaveLength(0)
    expect(db.listTasks().filter((t) => t.worktree === 'wt-1')).toHaveLength(1)
    db.close()
  })

  it('does not resurrect a worktree whose task is terminal', () => {
    const db = new PerchDb(':memory:')
    const { created } = reconcileWorktreeTasks(db, [wt({ worktreeId: 'wt-1' })])
    const task = created[0]
    db.upsertTask({ ...task, status: 'done' })
    const second = reconcileWorktreeTasks(db, [wt({ worktreeId: 'wt-1' })])
    expect(second.created).toHaveLength(0)
    db.close()
  })

  it('skips main and archived worktrees', () => {
    const db = new PerchDb(':memory:')
    const { created } = reconcileWorktreeTasks(db, [
      wt({ worktreeId: 'main', isMainWorktree: true }),
      wt({ worktreeId: 'archived', isArchived: true }),
      wt({ worktreeId: 'live' })
    ])
    expect(created.map((t) => t.worktree)).toEqual(['live'])
    db.close()
  })
})
