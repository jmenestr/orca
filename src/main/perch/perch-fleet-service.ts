// Why: PerchFleetService is the main-process fleet loop. It owns the Task/Run
// split: Tasks are units of work, Runs are agent instances executing them. It
// observes every agent terminal via hooks (updating the Run's turn-status),
// pushes deltas to the conductor transcript, and polls worktree.ps as a hook
// fallback. A Run going idle between turns NEVER terminates its Task — that
// decoupling is the fix for the disappearing-agent bug.
import type { AgentStatusOrchestrationContext } from '../../shared/agent-status-types'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchDb } from './perch-db'
import type { PerchService } from './perch-service'
import {
  cancelTaskWork,
  createCustomTask,
  mirrorWorktreeStatus,
  setTaskControlMode,
  setTaskProject,
  setTaskStatus,
  type FleetBoardDeps
} from './perch-fleet-board'
export { describeDispatchFailure } from './perch-fleet-dispatch'
export type { DispatchResult } from './perch-fleet-dispatch'
import {
  dispatchExistingTask as runDispatchExistingTask,
  dispatchWork as runDispatchWork,
  type WorkDispatchInput
} from './perch-fleet-dispatch-work'
export type { WorkDispatchInput } from './perch-fleet-dispatch-work'
export type { FleetObserveInput } from './perch-fleet-run-lifecycle'
import { observeAgentHook as runObserveAgentHook } from './perch-fleet-observe'
import type { FleetObserveInput } from './perch-fleet-run-lifecycle'
import { pollWorktreePs, reconcileWorktrees } from './perch-fleet-supervisor'
import {
  deriveTaskAttention,
  deriveTaskProgress,
  type ConductorNoticeRef,
  type ControlMode,
  type Run,
  type Task,
  type TaskMode,
  type TaskStatus
} from './perch-types'

const SUPERVISOR_POLL_MS = 3000

export type PerchFleetServiceOptions = {
  db: PerchDb
  getPerchService: () => PerchService
  getRuntime: () => OrcaRuntimeService
  /** Pushes a Task (with its current Run embedded) to the renderer fleet bus. */
  onWorkChanged?: (task: Task) => void
  /** Outbound Linear write-back for a dispatched task's status change. Injectable
   *  for tests; defaults to the real single-hub writer. */
  writeBackLinearStatus?: (externalId: string, status: TaskStatus) => Promise<unknown>
}

export class PerchFleetService {
  private readonly db: PerchDb
  private readonly getPerchService: () => PerchService
  private readonly getRuntime: () => OrcaRuntimeService
  private readonly onWorkChanged?: (task: Task) => void
  private readonly writeBackLinearStatus?: (
    externalId: string,
    status: TaskStatus
  ) => Promise<unknown>
  private pollTimer: NodeJS.Timeout | null = null
  private readonly pendingDispatchByWorktree = new Map<string, string>()

  constructor(options: PerchFleetServiceOptions) {
    this.db = options.db
    this.getPerchService = options.getPerchService
    this.getRuntime = options.getRuntime
    this.onWorkChanged = options.onWorkChanged
    this.writeBackLinearStatus = options.writeBackLinearStatus
  }

  startSupervisor(): void {
    if (this.pollTimer) {
      return
    }
    this.pollTimer = setInterval(() => {
      void pollWorktreePs(this.supervisorDeps())
    }, SUPERVISOR_POLL_MS)
    this.pollTimer.unref?.()
  }

  stopSupervisor(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  listWork(): Task[] {
    return this.db.liveTasks()
  }

  getWork(id: string): Task | undefined {
    return this.db.getTaskWithRun(id)
  }

  getOrchestrationForPaneKey(paneKey: string): AgentStatusOrchestrationContext | undefined {
    const run = this.db.getRunByPaneKey(paneKey)
    if (!run?.taskId) {
      return undefined
    }
    const task = this.db.getTask(run.taskId)
    if (!task) {
      return undefined
    }
    return {
      taskId: task.id,
      dispatchId: task.id,
      taskTitle: task.title,
      ...(task.source === 'directive' ? { coordinatorHandle: 'conductor' } : {})
    }
  }

  observeAgentHook(input: FleetObserveInput): Task | null {
    return runObserveAgentHook(this.observeDeps(), input)
  }

  listBoard(): Task[] {
    return this.db.boardTasks()
  }

  async listBoardWithReconcile(): Promise<Task[]> {
    await reconcileWorktrees(this.supervisorDeps())
    return this.db.boardTasks()
  }

  async reconcileWorktrees(): Promise<void> {
    await reconcileWorktrees(this.supervisorDeps())
  }

  createCustomTask(input: {
    title: string
    brief?: string
    repoSelector?: string
    mode?: TaskMode
  }): Task {
    return createCustomTask(this.boardDeps(), input)
  }

  setStatus(taskId: string, status: TaskStatus): Task {
    return setTaskStatus(this.boardDeps(), taskId, status)
  }

  async setProject(taskId: string, repoSelector: string): Promise<Task> {
    return setTaskProject(this.boardDeps(), taskId, repoSelector)
  }

  dispatchWork(input: WorkDispatchInput) {
    return runDispatchWork(this.dispatchCtx(), input)
  }

  dispatchExistingTask(taskId: string, repoSelector?: string) {
    return runDispatchExistingTask(this.dispatchCtx(), taskId, repoSelector)
  }

  setControlMode(taskId: string, controlMode: ControlMode): Task {
    return setTaskControlMode(this.boardDeps(), taskId, controlMode)
  }

  setControlByPaneKey(paneKey: string, controlMode: ControlMode): Task | null {
    const run = this.db.getRunByPaneKey(paneKey)
    if (!run?.taskId) {
      return null
    }
    return this.setControlMode(run.taskId, controlMode)
  }

  cancelWork(taskId: string): Task {
    return cancelTaskWork(this.boardDeps(), taskId)
  }

  formatFleetSnapshotForTurn(): string {
    const tasks = this.db.liveTasks()
    if (tasks.length === 0) {
      return ''
    }
    const lines = tasks.map((task) => {
      const progress = deriveTaskProgress(task)
      const attention = deriveTaskAttention(task)
      const badge =
        task.source === 'directive'
          ? ' [directive]'
          : task.source === 'captain_manual'
            ? ' [manual]'
            : ''
      const attn = attention !== 'none' ? ` · needs ${attention}` : ''
      const control = task.controlMode === 'captain' ? ' · captain control' : ''
      return `- ${task.title}${badge}: ${progress}${attn}${control}`
    })
    return `[Fleet snapshot]\n${lines.join('\n')}`
  }

  buildFleetSnapshot(): { items: Task[] } {
    return { items: this.db.liveTasks() }
  }

  private boardDeps(): FleetBoardDeps {
    return {
      db: this.db,
      getRuntime: () => this.getRuntime(),
      emitTask: (task) => this.emitTask(task),
      pushFleetNotice: (text) => this.pushFleetNotice(text),
      writeBackLinearStatus: this.writeBackLinearStatus
    }
  }

  private dispatchCtx() {
    return {
      db: this.db,
      getRuntime: () => this.getRuntime(),
      emitTask: (task: Task) => this.emitTask(task),
      pushFleetNotice: (text: string, ref?: ConductorNoticeRef | null) =>
        this.pushFleetNotice(text, ref),
      taskNoticeRef: (task: Task, run?: Run | null) => this.taskNoticeRef(task, run),
      markPending: (worktreeId: string, taskId: string) =>
        this.pendingDispatchByWorktree.set(worktreeId, taskId),
      mirrorWorktreeStatus: (task: Task) => mirrorWorktreeStatus(this.boardDeps(), task)
    }
  }

  private observeDeps() {
    return {
      db: this.db,
      pendingDispatchByWorktree: this.pendingDispatchByWorktree,
      runLifecycleDeps: () => ({
        db: this.db,
        emitTask: (task: Task) => this.emitTask(task),
        pushFleetNotice: (text: string, ref?: ConductorNoticeRef | null) =>
          this.pushFleetNotice(text, ref),
        taskNoticeRef: (task: Task, run?: Run | null) => this.taskNoticeRef(task, run),
        clearPending: (worktreeId: string) => {
          this.pendingDispatchByWorktree.delete(worktreeId)
        }
      })
    }
  }

  private supervisorDeps() {
    return {
      db: this.db,
      getRuntime: () => this.getRuntime(),
      emitTask: (task: Task) => this.emitTask(task),
      observeAgentHook: (input: FleetObserveInput) => this.observeAgentHook(input)
    }
  }

  private pushFleetNotice(text: string, ref?: ConductorNoticeRef | null): void {
    if (text.trim().length === 0) {
      return
    }
    this.getPerchService().pushNotice(text, ref ?? null)
  }

  // Why: link a fleet notice back to the Task and its agent pane so the conductor
  // chat can offer a "view agent" jump to the worktree/terminal that produced it.
  private taskNoticeRef(task: Task, run?: Run | null): ConductorNoticeRef {
    const paneKey = run?.paneKey ?? task.currentRun?.paneKey ?? null
    return { taskId: task.id, title: task.title, worktreeId: task.worktree, paneKey }
  }

  private emitTask(task: Task): void {
    this.onWorkChanged?.(this.db.getTaskWithRun(task.id) ?? { ...task, currentRun: null })
  }
}
