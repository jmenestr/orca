import { describe, expect, it } from 'vitest'
import type { Task } from '@/perch/perch-client'
import {
  EMPTY_TASK_BOARD_FILTER,
  filterBoardTasks,
  isTaskBoardFilterActive,
  matchesTaskFilter,
  presentSources,
  sortTasksByPin
} from './task-board-filter'

function task(over: Partial<Task>): Task {
  return {
    id: 't',
    source: 'custom',
    kind: 'coding',
    mode: 'project',
    title: 'Untitled',
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

describe('matchesTaskFilter', () => {
  it('matches text against title, identifier, and repo', () => {
    const t = task({ title: 'Fix login', externalIdentifier: 'ENG-12', repo: 'widget' })
    expect(matchesTaskFilter(t, { ...EMPTY_TASK_BOARD_FILTER, text: 'login' })).toBe(true)
    expect(matchesTaskFilter(t, { ...EMPTY_TASK_BOARD_FILTER, text: 'eng-12' })).toBe(true)
    expect(matchesTaskFilter(t, { ...EMPTY_TASK_BOARD_FILTER, text: 'widget' })).toBe(true)
    expect(matchesTaskFilter(t, { ...EMPTY_TASK_BOARD_FILTER, text: 'nope' })).toBe(false)
  })

  it('filters by source and project', () => {
    const linear = task({ source: 'linear' })
    const proj = task({
      source: 'custom',
      dispatchTarget: {
        repoId: 'r1',
        repoSelector: 'id:r1',
        connectionId: null,
        worktreeStrategy: 'new'
      }
    })
    expect(matchesTaskFilter(linear, { ...EMPTY_TASK_BOARD_FILTER, source: 'linear' })).toBe(true)
    expect(matchesTaskFilter(proj, { ...EMPTY_TASK_BOARD_FILTER, source: 'linear' })).toBe(false)
    expect(matchesTaskFilter(proj, { ...EMPTY_TASK_BOARD_FILTER, project: 'id:r1' })).toBe(true)
    expect(matchesTaskFilter(linear, { ...EMPTY_TASK_BOARD_FILTER, project: 'id:r1' })).toBe(false)
  })
})

describe('filterBoardTasks', () => {
  it('returns all tasks when the filter is inactive', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })]
    expect(filterBoardTasks(tasks, EMPTY_TASK_BOARD_FILTER)).toHaveLength(2)
    expect(isTaskBoardFilterActive(EMPTY_TASK_BOARD_FILTER)).toBe(false)
  })

  it('narrows to matching tasks when active', () => {
    const tasks = [task({ id: 'a', title: 'alpha' }), task({ id: 'b', title: 'beta' })]
    const result = filterBoardTasks(tasks, { ...EMPTY_TASK_BOARD_FILTER, text: 'alpha' })
    expect(result.map((t) => t.id)).toEqual(['a'])
  })
})

describe('sortTasksByPin', () => {
  it('floats pinned tasks to the top, preserving relative order', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c' })]
    const result = sortTasksByPin(tasks, new Set(['c']))
    expect(result.map((t) => t.id)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op when nothing is pinned', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })]
    expect(sortTasksByPin(tasks, new Set()).map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('presentSources', () => {
  it('lists distinct sources present', () => {
    const tasks = [
      task({ source: 'linear' }),
      task({ source: 'custom' }),
      task({ source: 'linear' })
    ]
    expect(presentSources(tasks).sort()).toEqual(['custom', 'linear'])
  })
})
