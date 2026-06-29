import { describe, expect, it } from 'vitest'
import { columnStatusForTask, TASK_BOARD_COLUMNS, type Task } from './perch-client'

function task(over: Partial<Task>): Task {
  return {
    id: 't',
    source: 'custom',
    kind: 'coding',
    mode: 'project',
    title: 'x',
    context: {},
    status: 'backlog',
    runner: 'local',
    harness: 'claude',
    landing: 'pr',
    autonomy: { autoApprove: false, autoLand: false, autoContinue: false },
    repo: null,
    worktree: null,
    branch: null,
    prUrl: null,
    error: null,
    externalId: null,
    externalIdentifier: null,
    externalUrl: null,
    controlMode: 'conductor',
    dispatchTarget: null,
    currentRunId: null,
    createdAt: 0,
    updatedAt: 0,
    ...over
  }
}

describe('task board columns', () => {
  it('exposes five columns ending in Done', () => {
    expect(TASK_BOARD_COLUMNS.map((c) => c.status)).toEqual([
      'backlog',
      'assigned',
      'in_progress',
      'in_review',
      'done'
    ])
  })

  it('maps a task status onto its board column', () => {
    expect(columnStatusForTask(task({ status: 'backlog' }))).toBe('backlog')
    expect(columnStatusForTask(task({ status: 'assigned' }))).toBe('assigned')
    expect(columnStatusForTask(task({ status: 'in_progress' }))).toBe('in_progress')
    expect(columnStatusForTask(task({ status: 'in_review' }))).toBe('in_review')
    // Blocked agents still live in the active column; terminal states fold into Done.
    expect(columnStatusForTask(task({ status: 'blocked' }))).toBe('in_progress')
    expect(columnStatusForTask(task({ status: 'done' }))).toBe('done')
    expect(columnStatusForTask(task({ status: 'failed' }))).toBe('done')
    expect(columnStatusForTask(task({ status: 'cancelled' }))).toBe('done')
  })
})
