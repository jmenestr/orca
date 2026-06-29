import { describe, expect, it, vi } from 'vitest'
import type { LinearIssue, LinearWorkflowState } from '../../shared/types'
import {
  mapTaskStatusToLinearStateType,
  parseLinearIssueId,
  resolveWorkflowStateForType,
  writeBackTaskStatusToLinear
} from './perch-linear-writeback'

function state(overrides: Partial<LinearWorkflowState>): LinearWorkflowState {
  return { id: 'state', name: 'State', type: 'started', color: '#000', position: 0, ...overrides }
}

function issue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: 'issue-uuid',
    identifier: 'ENG-1',
    title: 'Fix it',
    url: 'https://linear.app/x/issue/ENG-1',
    state: { name: 'Todo', type: 'backlog', color: '#000' },
    team: { id: 'team-1', name: 'Eng', key: 'ENG' },
    labels: [],
    labelIds: [],
    priority: 0,
    updatedAt: '2026-06-01T00:00:00.000Z',
    workspaceId: 'ws-1',
    ...overrides
  }
}

describe('mapTaskStatusToLinearStateType', () => {
  it('maps board statuses onto Linear state types', () => {
    expect(mapTaskStatusToLinearStateType('backlog')).toBe('backlog')
    expect(mapTaskStatusToLinearStateType('assigned')).toBe('unstarted')
    expect(mapTaskStatusToLinearStateType('in_progress')).toBe('started')
    expect(mapTaskStatusToLinearStateType('in_review')).toBe('started')
    expect(mapTaskStatusToLinearStateType('done')).toBe('completed')
    expect(mapTaskStatusToLinearStateType('cancelled')).toBe('canceled')
  })
})

describe('parseLinearIssueId', () => {
  it('extracts the issue id from a linear external id', () => {
    expect(parseLinearIssueId('linear:issue-uuid')).toBe('issue-uuid')
    expect(parseLinearIssueId('custom:abc')).toBeNull()
    expect(parseLinearIssueId(null)).toBeNull()
  })
})

describe('resolveWorkflowStateForType', () => {
  it('picks the lowest-position state of the matching type', () => {
    const states = [
      state({ id: 'b', type: 'started', position: 2 }),
      state({ id: 'a', type: 'started', position: 1 }),
      state({ id: 'done', type: 'completed', position: 0 })
    ]
    expect(resolveWorkflowStateForType(states, 'started')?.id).toBe('a')
    expect(resolveWorkflowStateForType(states, 'completed')?.id).toBe('done')
    expect(resolveWorkflowStateForType(states, 'canceled')).toBeNull()
  })
})

describe('writeBackTaskStatusToLinear', () => {
  it('writes the target workflow state when the type differs', async () => {
    const updateIssue = vi.fn().mockResolvedValue({ ok: true })
    const result = await writeBackTaskStatusToLinear('linear:issue-uuid', 'done', {
      getIssue: vi
        .fn()
        .mockResolvedValue(issue({ state: { name: 'Doing', type: 'started', color: '#000' } })),
      getTeamStates: vi
        .fn()
        .mockResolvedValue([
          state({ id: 'done-state', type: 'completed', position: 0 }),
          state({ id: 'doing', type: 'started', position: 0 })
        ]),
      updateIssue
    })
    expect(result).toEqual({ ok: true, updated: true })
    expect(updateIssue).toHaveBeenCalledWith('issue-uuid', { stateId: 'done-state' }, 'ws-1')
  })

  it('is a no-op when the issue is already in a matching-type state', async () => {
    const updateIssue = vi.fn()
    const result = await writeBackTaskStatusToLinear('linear:issue-uuid', 'in_progress', {
      getIssue: vi
        .fn()
        .mockResolvedValue(issue({ state: { name: 'Doing', type: 'started', color: '#000' } })),
      getTeamStates: vi.fn(),
      updateIssue
    })
    expect(result).toEqual({ ok: true, updated: false })
    expect(updateIssue).not.toHaveBeenCalled()
  })

  it('reports a missing workflow state without writing', async () => {
    const updateIssue = vi.fn()
    const result = await writeBackTaskStatusToLinear('linear:issue-uuid', 'done', {
      getIssue: vi.fn().mockResolvedValue(issue()),
      getTeamStates: vi.fn().mockResolvedValue([state({ type: 'started' })]),
      updateIssue
    })
    expect(result).toEqual({ ok: false, reason: 'missing_workflow_state' })
    expect(updateIssue).not.toHaveBeenCalled()
  })

  it('skips non-linear tasks', async () => {
    const result = await writeBackTaskStatusToLinear('custom:abc', 'done', {
      getIssue: vi.fn(),
      getTeamStates: vi.fn(),
      updateIssue: vi.fn()
    })
    expect(result).toEqual({ ok: false, reason: 'not_a_linear_task' })
  })
})
