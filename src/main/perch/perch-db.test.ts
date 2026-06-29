import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from '../sqlite/sync-database'
import { PerchDb } from './perch-db'
import {
  CONDUCTOR_AGENT_ID,
  DEFAULT_AGENT_ID,
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_RUN_MODE,
  deriveTaskAttention,
  deriveTaskProgress,
  isPerTurnHarness,
  isTerminalRunStatus,
  isTerminalTaskStatus,
  nowSeconds,
  type Run,
  type Task
} from './perch-types'

function makeTask(overrides: Partial<Task> = {}): Task {
  const at = nowSeconds()
  return {
    id: 'fix-login-k3',
    source: 'directive',
    kind: 'coding',
    mode: 'project',
    title: 'Fix the login bug',
    context: { brief: 'repro then patch', repo: 'widget' },
    status: 'backlog',
    runner: 'local',
    harness: 'claude',
    landing: 'pr',
    autonomy: DEFAULT_AUTONOMY_POLICY,
    repo: '/home/cap/widget',
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
    createdAt: at,
    updatedAt: at,
    ...overrides
  }
}

function makeRun(overrides: Partial<Run> = {}): Run {
  const at = nowSeconds()
  return {
    id: 'run-1',
    taskId: 'fix-login-k3',
    agentId: DEFAULT_AGENT_ID,
    harness: 'claude',
    mode: DEFAULT_RUN_MODE,
    status: 'working',
    paneKey: 'tab-1:leaf-1',
    terminalHandle: null,
    worktreeId: 'wt-1',
    repoId: null,
    connectionId: null,
    sessionId: null,
    agentType: 'claude',
    result: null,
    error: null,
    startedAt: at,
    endedAt: null,
    updatedAt: at,
    ...overrides
  }
}

describe('perch-types derivations', () => {
  it('derives task progress from task + current run', () => {
    expect(deriveTaskProgress({ status: 'backlog' })).toBe('queued')
    expect(
      deriveTaskProgress({ status: 'assigned', currentRun: makeRun({ status: 'dispatched' }) })
    ).toBe('queued')
    expect(
      deriveTaskProgress({ status: 'in_progress', currentRun: makeRun({ status: 'working' }) })
    ).toBe('working')
    // Why: an idle Run (between turns) reads as paused, not done.
    expect(
      deriveTaskProgress({ status: 'in_progress', currentRun: makeRun({ status: 'idle' }) })
    ).toBe('paused')
    expect(deriveTaskProgress({ status: 'in_review' })).toBe('landing')
    expect(deriveTaskProgress({ status: 'done' })).toBe('done')
    expect(deriveTaskProgress({ status: 'failed' })).toBe('failed')
    expect(deriveTaskProgress({ status: 'cancelled' })).toBe('failed')
  })

  it('derives task attention from task + current run', () => {
    expect(
      deriveTaskAttention({ status: 'in_progress', currentRun: makeRun({ status: 'working' }) })
    ).toBe('none')
    expect(
      deriveTaskAttention({
        status: 'in_progress',
        currentRun: makeRun({ status: 'awaiting_input' })
      })
    ).toBe('input')
    expect(
      deriveTaskAttention({
        status: 'in_progress',
        currentRun: makeRun({ status: 'awaiting_approval' })
      })
    ).toBe('approval')
    expect(deriveTaskAttention({ status: 'failed' })).toBe('error')
    expect(deriveTaskAttention({ status: 'blocked' })).toBe('input')
  })

  it('classifies terminal task/run states and per-turn harness', () => {
    expect(isTerminalTaskStatus('done')).toBe(true)
    expect(isTerminalTaskStatus('cancelled')).toBe(true)
    expect(isTerminalTaskStatus('in_progress')).toBe(false)
    expect(isTerminalRunStatus('exited')).toBe(true)
    expect(isTerminalRunStatus('failed')).toBe(true)
    // Why: idle is the core fix — a finished turn is NOT run-terminal.
    expect(isTerminalRunStatus('idle')).toBe(false)
    expect(isPerTurnHarness('cursor')).toBe(true)
    expect(isPerTurnHarness('claude')).toBe(false)
  })
})

describe('PerchDb (:memory:) tasks + runs', () => {
  it('round-trips a task through upsertTask/getTask/listTasks', () => {
    const db = new PerchDb(':memory:')
    try {
      const task = makeTask()
      db.upsertTask(task)

      const fetched = db.getTask(task.id)
      expect(fetched).toBeDefined()
      expect(fetched!.title).toBe('Fix the login bug')
      expect(fetched!.context).toEqual({ brief: 'repro then patch', repo: 'widget' })
      expect(fetched!.autonomy).toEqual(DEFAULT_AUTONOMY_POLICY)
      expect(fetched!.status).toBe('backlog')

      expect(db.listTasks()).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('liveTasks excludes terminal work-statuses and embeds the current run', () => {
    const db = new PerchDb(':memory:')
    try {
      db.upsertTask(makeTask({ id: 'a', status: 'in_progress', currentRunId: 'run-a' }))
      db.upsertRun(makeRun({ id: 'run-a', taskId: 'a', paneKey: 'tab-a:leaf', status: 'idle' }))
      db.upsertTask(makeTask({ id: 'b', status: 'done' }))
      db.upsertTask(makeTask({ id: 'c', status: 'failed' }))
      db.upsertTask(makeTask({ id: 'd', status: 'cancelled' }))
      db.upsertTask(makeTask({ id: 'e', status: 'assigned' }))

      const live = db
        .liveTasks()
        .map((t) => t.id)
        .sort()
      expect(live).toEqual(['a', 'e'])

      const a = db.liveTasks().find((t) => t.id === 'a')
      expect(a?.currentRun?.id).toBe('run-a')
      // Why: a Run going idle never drops its Task from the live fleet.
      expect(a?.currentRun?.status).toBe('idle')
    } finally {
      db.close()
    }
  })

  it('boardTasks includes terminal-status tasks and getTaskByExternalId dedups', () => {
    const db = new PerchDb(':memory:')
    try {
      db.upsertTask(makeTask({ id: 'a', status: 'backlog' }))
      db.upsertTask(makeTask({ id: 'b', status: 'done' }))
      db.upsertTask(makeTask({ id: 'c', status: 'cancelled', externalId: 'linear:i9' }))

      const board = db
        .boardTasks()
        .map((t) => t.id)
        .sort()
      // Unlike liveTasks(), the board keeps Done/Cancelled columns.
      expect(board).toEqual(['a', 'b', 'c'])
      expect(db.getTaskByExternalId('linear:i9')?.id).toBe('c')
      expect(db.getTaskByExternalId('linear:missing')).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('looks up runs by pane key and embeds the current run via getTaskWithRun', () => {
    const db = new PerchDb(':memory:')
    try {
      db.upsertTask(makeTask({ currentRunId: 'run-1' }))
      db.upsertRun(makeRun())
      expect(db.getRunByPaneKey('tab-1:leaf-1')?.taskId).toBe('fix-login-k3')
      expect(db.runsForTask('fix-login-k3')).toHaveLength(1)
      const withRun = db.getTaskWithRun('fix-login-k3')
      expect(withRun?.currentRun?.paneKey).toBe('tab-1:leaf-1')
    } finally {
      db.close()
    }
  })

  it('finds the live task for a worktree, skipping terminal ones', () => {
    const db = new PerchDb(':memory:')
    try {
      db.upsertTask(makeTask({ id: 'old', worktree: 'wt-9', status: 'done', updatedAt: 1 }))
      db.upsertTask(makeTask({ id: 'live', worktree: 'wt-9', status: 'in_progress', updatedAt: 2 }))
      expect(db.getTaskByWorktreeId('wt-9')?.id).toBe('live')
    } finally {
      db.close()
    }
  })

  it('seeds the default and conductor agents', () => {
    const db = new PerchDb(':memory:')
    try {
      expect(db.getAgent(DEFAULT_AGENT_ID)?.name).toBe('General')
      expect(db.getAgent(CONDUCTOR_AGENT_ID)?.name).toBe('Conductor')
      expect(db.listAgents().length).toBeGreaterThanOrEqual(2)
    } finally {
      db.close()
    }
  })

  it('appends and reads events, transcript, and timeline', () => {
    const db = new PerchDb(':memory:')
    try {
      const task = makeTask()
      db.upsertTask(task)

      const at = nowSeconds()
      const e1 = db.appendEvent(task.id, 'captain', { action: 'steer', text: 'rebase first' }, at)
      const e2 = db.appendEvent(task.id, 'captain', { action: 'approve' }, at + 1)
      expect(e1.seq).toBe(1)
      expect(e2.seq).toBe(2)

      const captain = db.recentCaptainEvents()
      expect(captain).toHaveLength(2)
      expect((captain[0].payload as { action: string }).action).toBe('approve')

      db.appendTranscript(task.id, 'user', 'fix the bug', at)
      db.appendTranscript(task.id, 'assistant', 'on it', at + 1)
      expect(db.transcript(task.id)).toEqual([
        { role: 'user', text: 'fix the bug' },
        { role: 'assistant', text: 'on it' }
      ])

      db.appendTimeline(task.id, 'text', { text: 'starting' }, at)
      const timeline = db.timeline(task.id)
      expect(timeline).toHaveLength(1)
      expect(timeline[0].kind).toBe('text')
    } finally {
      db.close()
    }
  })

  it('persists conductor turns in order', () => {
    const db = new PerchDb(':memory:')
    try {
      const at = nowSeconds()
      const t1 = db.appendConductorTurn('user', 'ship the dark mode toggle', at)
      const t2 = db.appendConductorTurn('assistant', 'Aye captain — dispatching a crewmate', at + 1)
      expect(t1.id).toBeLessThan(t2.id)

      const turns = db.conductorTranscript()
      expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
      expect(turns[0].text).toBe('ship the dark mode toggle')
    } finally {
      db.close()
    }
  })

  it('round-trips a conductor notice ref (link to the agent)', () => {
    const db = new PerchDb(':memory:')
    try {
      const at = nowSeconds()
      db.appendConductorTurn('notice', '**Explore jarvis** finished a turn.', at, {
        taskId: 'task-1',
        title: 'Explore jarvis',
        worktreeId: 'wt-1',
        paneKey: 'tab-1:leaf-1'
      })
      db.appendConductorTurn('user', 'plain turn with no ref', at + 1)

      const turns = db.conductorTranscript()
      expect(turns[0].ref).toEqual({
        taskId: 'task-1',
        title: 'Explore jarvis',
        worktreeId: 'wt-1',
        paneKey: 'tab-1:leaf-1'
      })
      expect(turns[1].ref).toBeNull()
    } finally {
      db.close()
    }
  })

  it('deletes a task and its associated runs and rows', () => {
    const db = new PerchDb(':memory:')
    try {
      const task = makeTask()
      db.upsertTask(task)
      db.upsertRun(makeRun())
      db.appendTranscript(task.id, 'user', 'x', nowSeconds())
      db.deleteTask(task.id)
      expect(db.getTask(task.id)).toBeUndefined()
      expect(db.runsForTask(task.id)).toHaveLength(0)
      expect(db.transcript(task.id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})

describe('PerchDb v2 -> v3 migration', () => {
  it('splits a legacy work item into a Task and a Run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'perch-mig-'))
    const dbPath = join(dir, 'perch.db')

    // Why: build a v2-shaped DB by hand (no dispatch_target/current_run_id, a
    // single conflated RawStatus column) so opening PerchDb runs the real
    // v2->v3 migration path.
    const raw = new Database(dbPath)
    raw.pragma('journal_mode = WAL')
    raw.exec(`
      CREATE TABLE work_items (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL,
        title TEXT NOT NULL, context TEXT NOT NULL, status TEXT NOT NULL,
        runner TEXT NOT NULL, harness TEXT, landing TEXT NOT NULL, autonomy TEXT,
        session_id TEXT, repo TEXT, worktree TEXT, branch TEXT, codespace TEXT,
        pr_url TEXT, error TEXT, pane_key TEXT, terminal_handle TEXT,
        control_mode TEXT, agent_type TEXT, created_at REAL NOT NULL,
        updated_at REAL NOT NULL
      );
    `)
    raw
      .prepare(
        `INSERT INTO work_items (id, source, kind, title, context, status, runner,
           harness, landing, autonomy, session_id, repo, worktree, branch,
           codespace, pr_url, error, pane_key, terminal_handle, control_mode,
           agent_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'w1',
        'directive',
        'coding',
        'Legacy task',
        '{}',
        'working',
        'local',
        'claude',
        'pr',
        null,
        null,
        'widget',
        'wt-1',
        null,
        null,
        null,
        null,
        'tab-1:leaf-1',
        null,
        'conductor',
        'claude',
        1000,
        1000
      )
    raw.pragma('user_version = 2')
    raw.close()

    const db = new PerchDb(dbPath)
    try {
      const task = db.getTaskWithRun('w1')
      expect(task).toBeDefined()
      // Why: legacy 'working' RawStatus splits into Task 'in_progress' + Run 'working'.
      expect(task!.status).toBe('in_progress')
      expect(task!.currentRun).toBeTruthy()
      expect(task!.currentRun!.status).toBe('working')
      expect(task!.currentRun!.paneKey).toBe('tab-1:leaf-1')
      expect(db.getRunByPaneKey('tab-1:leaf-1')?.taskId).toBe('w1')
    } finally {
      db.close()
    }
  })
})
