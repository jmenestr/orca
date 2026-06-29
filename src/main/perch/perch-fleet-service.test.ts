import { describe, expect, it, vi } from 'vitest'
import { PerchDb } from './perch-db'
import { describeDispatchFailure, PerchFleetService } from './perch-fleet-service'
import { PerchService } from './perch-service'
import { DEFAULT_AUTONOMY_POLICY, nowSeconds, type Task } from './perch-types'

describe('describeDispatchFailure', () => {
  it('passes a base-ref refresh/network error through without the no-commits hint', () => {
    const reason = describeDispatchFailure(
      new Error(
        'Could not refresh base ref "origin/dev" from "origin". Check your network and try again.'
      )
    )
    expect(reason).not.toMatch(/no commits/i)
    expect(reason).toBe(
      'Could not refresh base ref "origin/dev" from "origin". Check your network and try again.'
    )
  })

  it('still maps a genuine empty-repo error to the make-an-initial-commit hint', () => {
    expect(describeDispatchFailure(new Error('could not resolve a default base ref'))).toMatch(
      /no commits/i
    )
    expect(describeDispatchFailure(new Error("fatal: ambiguous argument 'HEAD'"))).toMatch(
      /no commits/i
    )
  })
})

function makeService(db: PerchDb): { service: PerchService; notices: string[] } {
  const notices: string[] = []
  const service = new PerchService({
    db,
    harness: 'claude',
    command: process.execPath,
    spawnArgs: []
  })
  service.subscribe((frame) => {
    if (frame.kind === 'notice') {
      notices.push(frame.text)
    }
  })
  return { service, notices }
}

describe('PerchFleetService', () => {
  it('observes manual agent hooks as a captain_manual Task with a Run', () => {
    const db = new PerchDb(':memory:')
    const { service, notices } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          getWorktreePs: vi.fn().mockResolvedValue({ worktrees: [] })
        }) as never
    })

    const task = fleet.observeAgentHook({
      paneKey: 'tab-1:leaf-1',
      worktreeId: 'wt-1',
      agentType: 'claude',
      state: 'working',
      prompt: 'Fix login'
    })

    expect(task?.source).toBe('captain_manual')
    expect(task?.status).toBe('in_progress')
    expect(task?.currentRun?.paneKey).toBe('tab-1:leaf-1')
    expect(task?.currentRun?.status).toBe('working')
    expect(db.getRunByPaneKey('tab-1:leaf-1')?.taskId).toBe(task?.id)
    expect(db.getTask(task!.id)?.title).toBe('Fix login')
    // Why: agent-start is live-state churn — it must NOT post to the conductor chat.
    expect(notices.some((text) => text.includes('Captain started agent'))).toBe(false)

    db.close()
  })

  it('maps a waiting hook state to a Run awaiting_input', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({ getWorktreePs: vi.fn() }) as never
    })

    fleet.observeAgentHook({
      paneKey: 'tab-2:leaf-2',
      state: 'waiting',
      agentType: 'claude'
    })

    expect(db.getRunByPaneKey('tab-2:leaf-2')?.status).toBe('awaiting_input')
    db.close()
  })

  it('keeps the Task live when its Run goes idle (the disappearing-agent fix)', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({ getWorktreePs: vi.fn() }) as never
    })

    const working = fleet.observeAgentHook({
      paneKey: 'tab-3:leaf-3',
      worktreeId: 'wt-3',
      state: 'working',
      agentType: 'claude',
      prompt: 'Do the thing'
    })
    expect(working?.currentRun?.status).toBe('working')

    // The agent finishes its turn -> Run idle, but the Task must NOT disappear.
    const idle = fleet.observeAgentHook({
      paneKey: 'tab-3:leaf-3',
      worktreeId: 'wt-3',
      state: 'done',
      agentType: 'claude'
    })
    expect(idle?.id).toBe(working?.id)
    expect(idle?.currentRun?.status).toBe('idle')
    expect(idle?.status).toBe('in_progress')

    // Still in the live fleet.
    expect(fleet.listWork().map((t) => t.id)).toContain(working!.id)

    db.close()
  })

  it('dispatchWork creates a Task and a Run up front', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          showRepo: vi.fn().mockResolvedValue({ id: 'r1', displayName: 'widget' }),
          createManagedWorktree: vi.fn().mockResolvedValue({
            worktree: { id: 'wt-9' },
            startupTerminal: { paneKey: 'tabX:leafX', handle: 'h1' }
          })
        }) as never
    })

    const result = await fleet.dispatchWork({ repoSelector: 'name:widget', title: 'Ship it' })

    expect(result.worktreeId).toBe('wt-9')
    expect(result.run).toBeTruthy()
    expect(result.run?.paneKey).toBe('tabX:leafX')
    expect(result.run?.status).toBe('dispatched')
    expect(result.task.status).toBe('assigned')
    expect(result.task.currentRunId).toBe(result.run?.id)
    expect(db.getRunByPaneKey('tabX:leafX')?.taskId).toBe(result.task.id)

    db.close()
  })

  it('derives a unique worktree name per dispatch so identical titles do not collide on the branch', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const createManagedWorktree = vi.fn().mockResolvedValue({
      worktree: { id: 'wt-collide' },
      startupTerminal: { paneKey: 'p:c', handle: 'h' }
    })
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          showRepo: vi.fn().mockResolvedValue({ id: 'r1', displayName: 'widget' }),
          createManagedWorktree
        }) as never
    })

    await fleet.dispatchWork({ repoSelector: 'name:widget', title: 'Explore jarvis repo' })
    await fleet.dispatchWork({ repoSelector: 'name:widget', title: 'Explore jarvis repo' })

    const names = createManagedWorktree.mock.calls.map((call) => (call[0] as { name: string }).name)
    expect(names).toHaveLength(2)
    // Why: each dispatch must get its own branch/worktree name to avoid the
    // "Branch already exists locally" failure on re-dispatch.
    expect(names[0]).not.toBe(names[1])
    for (const name of names) {
      expect(name.startsWith('Explore jarvis repo-')).toBe(true)
    }
    // The human-facing displayName stays the unmodified title.
    const displayNames = createManagedWorktree.mock.calls.map(
      (call) => (call[0] as { displayName: string }).displayName
    )
    expect(displayNames).toEqual(['Explore jarvis repo', 'Explore jarvis repo'])

    db.close()
  })

  it('marks the Task failed and surfaces the reason when dispatch cannot create a worktree', async () => {
    const db = new PerchDb(':memory:')
    const { service, notices } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          showRepo: vi.fn().mockResolvedValue({ id: 'r1', displayName: 'jarvis' }),
          createManagedWorktree: vi
            .fn()
            .mockRejectedValue(new Error('could not resolve a default base ref'))
        }) as never
    })

    await expect(
      fleet.dispatchWork({ repoSelector: 'name:jarvis', title: 'Explore jarvis' })
    ).rejects.toThrow(/no commits/i)

    const tasks = db.listTasks()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].status).toBe('failed')
    expect(tasks[0].error).toMatch(/base ref/i)
    expect(notices.some((t) => t.includes('Could not dispatch'))).toBe(true)

    db.close()
  })

  it('setStatus moves a task and exits a live run on a terminal status', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({}) as never
    })
    const at = nowSeconds()
    db.upsertTask({
      id: 'bt-1',
      source: 'custom',
      kind: 'coding',
      mode: 'project',
      title: 'Board task',
      context: {},
      status: 'in_progress',
      runner: 'local',
      harness: 'claude',
      landing: 'pr',
      autonomy: DEFAULT_AUTONOMY_POLICY,
      repo: null,
      worktree: 'wt-1',
      branch: null,
      prUrl: null,
      error: null,
      externalId: null,
      externalIdentifier: null,
      externalUrl: null,
      controlMode: 'conductor',
      dispatchTarget: null,
      currentRunId: 'run-1',
      createdAt: at,
      updatedAt: at
    })
    db.upsertRun({
      id: 'run-1',
      taskId: 'bt-1',
      agentId: 'general',
      harness: 'claude',
      mode: 'session',
      status: 'working',
      paneKey: 'tab:leaf',
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
      updatedAt: at
    })

    fleet.setStatus('bt-1', 'done')
    expect(db.getTask('bt-1')?.status).toBe('done')
    expect(db.getRun('run-1')?.status).toBe('exited')

    db.close()
  })

  it('dispatchExistingTask reuses the task id and preserves the Linear link', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          showRepo: vi.fn().mockResolvedValue({ id: 'r1', displayName: 'widget' }),
          createManagedWorktree: vi.fn().mockResolvedValue({
            worktree: { id: 'wt-9' },
            startupTerminal: { paneKey: 'p:1', handle: 'h1' }
          })
        }) as never
    })
    const at = nowSeconds()
    db.upsertTask({
      id: 'lt',
      source: 'linear',
      kind: 'coding',
      mode: 'project',
      title: 'Linear task',
      context: {},
      status: 'backlog',
      runner: 'local',
      harness: 'claude',
      landing: 'pr',
      autonomy: DEFAULT_AUTONOMY_POLICY,
      repo: null,
      worktree: null,
      branch: null,
      prUrl: null,
      error: null,
      externalId: 'linear:i1',
      externalIdentifier: 'ENG-1',
      externalUrl: 'https://linear.app/x/issue/ENG-1',
      controlMode: 'conductor',
      dispatchTarget: null,
      currentRunId: null,
      createdAt: at,
      updatedAt: at
    })

    const result = await fleet.dispatchExistingTask('lt', 'name:widget')
    expect(result.task.id).toBe('lt')
    expect(result.task.externalId).toBe('linear:i1')
    expect(result.task.status).toBe('assigned')
    expect(result.run?.paneKey).toBe('p:1')
    expect(db.getRunByPaneKey('p:1')?.taskId).toBe('lt')

    db.close()
  })

  it('setProject persists a dispatch target so dispatch never prompts', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () =>
        ({
          showRepo: vi.fn().mockResolvedValue({ id: 'r9', displayName: 'widget' })
        }) as never
    })
    const task = fleet.createCustomTask({ title: 'Pick me a repo' })
    expect(task.dispatchTarget).toBeNull()

    const updated = await fleet.setProject(task.id, 'id:r9')
    expect(updated.dispatchTarget?.repoSelector).toBe('id:r9')
    expect(updated.dispatchTarget?.repoId).toBe('r9')
    expect(updated.repo).toBe('widget')

    db.close()
  })

  it('writes a Linear status change back when a dispatched task moves', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const writeBack = vi.fn().mockResolvedValue({ ok: true })
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({}) as never,
      writeBackLinearStatus: writeBack
    })
    const at = nowSeconds()
    db.upsertTask({
      id: 'lt2',
      source: 'linear',
      kind: 'coding',
      mode: 'project',
      title: 'Linear task',
      context: {},
      status: 'in_progress',
      runner: 'local',
      harness: 'claude',
      landing: 'pr',
      autonomy: DEFAULT_AUTONOMY_POLICY,
      repo: null,
      worktree: 'wt-lt2',
      branch: null,
      prUrl: null,
      error: null,
      externalId: 'linear:issue-2',
      externalIdentifier: 'ENG-2',
      externalUrl: 'https://linear.app/x/issue/ENG-2',
      controlMode: 'conductor',
      dispatchTarget: null,
      currentRunId: null,
      createdAt: at,
      updatedAt: at
    })

    fleet.setStatus('lt2', 'in_review')
    expect(writeBack).toHaveBeenCalledWith('linear:issue-2', 'in_review')

    db.close()
  })

  it('does not write back a pre-dispatch Linear task', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const writeBack = vi.fn().mockResolvedValue({ ok: true })
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({}) as never,
      writeBackLinearStatus: writeBack
    })
    const at = nowSeconds()
    db.upsertTask({
      id: 'lt3',
      source: 'linear',
      kind: 'coding',
      mode: 'project',
      title: 'Pre-dispatch',
      context: {},
      status: 'backlog',
      runner: 'local',
      harness: 'claude',
      landing: 'pr',
      autonomy: DEFAULT_AUTONOMY_POLICY,
      repo: null,
      worktree: null,
      branch: null,
      prUrl: null,
      error: null,
      externalId: 'linear:issue-3',
      externalIdentifier: 'ENG-3',
      externalUrl: 'https://linear.app/x/issue/ENG-3',
      controlMode: 'conductor',
      dispatchTarget: null,
      currentRunId: null,
      createdAt: at,
      updatedAt: at
    })

    fleet.setStatus('lt3', 'assigned')
    expect(writeBack).not.toHaveBeenCalled()

    db.close()
  })

  it('createCustomTask records the chosen mode', () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({}) as never
    })
    const scratch = fleet.createCustomTask({ title: 'Quick experiment', mode: 'scratch' })
    expect(scratch.mode).toBe('scratch')
    expect(db.getTask(scratch.id)?.mode).toBe('scratch')
    const manual = fleet.createCustomTask({ title: 'Do by hand', mode: 'manual' })
    expect(manual.mode).toBe('manual')
    db.close()
  })

  it('refuses to dispatch a manual-mode task', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({}) as never
    })
    const task = fleet.createCustomTask({ title: 'Manual work', mode: 'manual' })
    await expect(fleet.dispatchExistingTask(task.id)).rejects.toThrow(
      /manual_task_not_dispatchable/
    )
    db.close()
  })

  it('dispatches a scratch-mode task into a floating Run (no worktree)', async () => {
    const db = new PerchDb(':memory:')
    const { service } = makeService(db)
    const launchScratchAgentTerminal = vi.fn().mockResolvedValue({
      handle: 'h-scratch',
      tabId: 'tabS',
      paneKey: 'tabS:leafS',
      worktreeId: 'global-floating-terminal',
      title: 'Quick experiment',
      surface: 'background'
    })
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({ launchScratchAgentTerminal }) as never
    })
    const task = fleet.createCustomTask({ title: 'Quick experiment', mode: 'scratch' })

    const result = await fleet.dispatchExistingTask(task.id)
    expect(launchScratchAgentTerminal).toHaveBeenCalledTimes(1)
    expect(result.worktreeId).toBe('global-floating-terminal')
    expect(result.run?.worktreeId).toBe('global-floating-terminal')
    expect(result.run?.paneKey).toBe('tabS:leafS')
    expect(result.task.status).toBe('assigned')
    expect(db.getRunByPaneKey('tabS:leafS')?.taskId).toBe(task.id)

    db.close()
  })

  it('setControlMode updates control without posting a chat notice', () => {
    const db = new PerchDb(':memory:')
    const { service, notices } = makeService(db)
    const fleet = new PerchFleetService({
      db,
      getPerchService: () => service,
      getRuntime: () => ({ getWorktreePs: vi.fn() }) as never
    })
    const at = nowSeconds()
    const task: Task = {
      id: 'work-1',
      source: 'directive',
      kind: 'coding',
      mode: 'project',
      title: 'Dark mode toggle',
      context: {},
      status: 'in_progress',
      runner: 'local',
      harness: 'claude',
      landing: 'pr',
      autonomy: DEFAULT_AUTONOMY_POLICY,
      repo: 'widget',
      worktree: 'wt-1',
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
      updatedAt: at
    }
    db.upsertTask(task)

    fleet.setControlMode('work-1', 'captain')
    expect(db.getTask('work-1')?.controlMode).toBe('captain')
    // Why: control handoffs are audit churn — recorded as work events, not chat notices.
    expect(notices.some((text) => text.includes('Captain took over'))).toBe(false)
    expect(db.recentCaptainEvents().length).toBe(0) // recorded under 'captain_takeover' kind, not 'captain'

    db.close()
  })
})
