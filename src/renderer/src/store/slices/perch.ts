import type { StateCreator } from 'zustand'
import type { PerchDispatchHarness } from '../../../../shared/perch-dispatch-harness'
import type { AppState } from '../types'
import {
  asConductorFrame,
  asTask,
  createBoardTask,
  dispatchExistingTask,
  dispatchWork,
  loadBoardTasks,
  loadConductorFleet,
  loadConductorHistory,
  sendConductorMessage,
  setTaskProject,
  setTaskStatus,
  setWorkControlMode,
  syncLinearTasks,
  taskPaneKey,
  type ConductorMessage,
  type DispatchWorkInput,
  type PerchConductorFrame,
  type Task,
  type TaskStatus
} from '@/perch/perch-client'
import { reduceConductorFrame } from './perch-conductor-frame-reducer'

// Why: the Perch Conductor chat state. Frames stream in over the perch:changed
// push bus and are reduced into `conductorTranscript`; the in-progress assistant
// reply accumulates text deltas until its turn's `result` frame finalizes it.
// Fleet Tasks (each with their current Run embedded) stream in over
// perch:workChanged and are reduced into `conductorTasks`.
export type PerchSlice = {
  conductorTranscript: ConductorMessage[]
  conductorStreaming: boolean
  conductorTasks: Task[]
  conductorTasksByPaneKey: Record<string, Task>
  boardTasks: Task[]
  openConductorPage: () => void
  closeConductorPage: () => void
  openTaskBoard: () => void
  closeTaskBoard: () => void
  hydrateConductorTranscript: () => Promise<void>
  hydrateConductorFleet: () => Promise<void>
  hydrateBoard: () => Promise<void>
  sendConductorTurn: (text: string) => Promise<void>
  applyConductorFrame: (frame: PerchConductorFrame | unknown) => void
  applyConductorTask: (task: Task | unknown) => void
  setTaskControlMode: (id: string, controlMode: Task['controlMode']) => Promise<void>
  dispatchConductorWork: (input: DispatchWorkInput) => Promise<Task | null>
  moveBoardTask: (id: string, status: TaskStatus) => Promise<void>
  createBoardTask: (input: {
    title: string
    brief?: string
    repoSelector?: string
    mode?: Task['mode']
  }) => Promise<Task | null>
  dispatchBoardTask: (
    id: string,
    repoSelector?: string,
    harness?: PerchDispatchHarness
  ) => Promise<Task | null>
  setBoardTaskProject: (id: string, repoSelector: string) => Promise<Task | null>
  syncBoardLinear: () => Promise<void>
}

// Why: a stable id for the streaming assistant turn so successive text deltas
// land on the same message; replaced once the turn finalizes. Avoids Date.now()
// collisions by combining a monotonic counter with the role.
let messageSeq = 0
function nextId(role: string): string {
  messageSeq += 1
  return `${role}-${messageSeq}`
}

// Why: the Activity/fleet overlay keys on the pane a Task's current Run is bound
// to, so a Task only attaches to an Activity thread once its Run has a pane.
function indexTasks(tasks: Task[]): Record<string, Task> {
  const byPaneKey: Record<string, Task> = {}
  for (const task of tasks) {
    const paneKey = taskPaneKey(task)
    if (paneKey) {
      byPaneKey[paneKey] = task
    }
  }
  return byPaneKey
}

// Why: a Task leaves the live fleet only when its WORK status is terminal — never
// because its Run went idle between turns. This is the fix for the
// disappearing-agent bug.
function isLiveTask(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'failed' && task.status !== 'cancelled'
}

export const createPerchSlice: StateCreator<AppState, [], [], PerchSlice> = (set, get) => ({
  conductorTranscript: [],
  conductorStreaming: false,
  conductorTasks: [],
  conductorTasksByPaneKey: {},
  boardTasks: [],

  openConductorPage: () => {
    set((state) => ({
      activeView: 'conductor',
      previousViewBeforeConductor:
        state.activeView === 'conductor' ? state.previousViewBeforeConductor : state.activeView
    }))
    void get().hydrateConductorTranscript()
    void get().hydrateConductorFleet()
  },

  closeConductorPage: () =>
    set((state) => ({
      activeView: state.previousViewBeforeConductor
    })),

  openTaskBoard: () => {
    set((state) => ({
      activeView: 'taskBoard',
      previousViewBeforeTaskBoard:
        state.activeView === 'taskBoard' ? state.previousViewBeforeTaskBoard : state.activeView
    }))
    void get().hydrateBoard()
    void get().syncBoardLinear()
  },

  closeTaskBoard: () =>
    set((state) => ({
      activeView: state.previousViewBeforeTaskBoard
    })),

  hydrateBoard: async () => {
    const items = await loadBoardTasks()
    set({ boardTasks: items })
  },

  hydrateConductorTranscript: async () => {
    const turns = await loadConductorHistory()
    set({
      conductorTranscript: turns.map((t) => ({
        id: `hist-${t.id}`,
        role: t.role,
        text: t.text,
        ref: t.ref ?? null
      }))
    })
  },

  hydrateConductorFleet: async () => {
    const items = await loadConductorFleet()
    set({
      conductorTasks: items,
      conductorTasksByPaneKey: indexTasks(items)
    })
  },

  applyConductorTask: (raw) => {
    const task = asTask(raw)
    if (!task) {
      return
    }
    set((state) => {
      const nextItems = [
        task,
        ...state.conductorTasks.filter((entry) => entry.id !== task.id)
      ].filter(isLiveTask)
      // Why: the board shows all statuses, so upsert (replace by id) without the
      // live-only filter; only upsert when the board has been hydrated.
      const nextBoard =
        state.boardTasks.length > 0 || task.source === 'custom' || task.source === 'linear'
          ? [task, ...state.boardTasks.filter((entry) => entry.id !== task.id)]
          : state.boardTasks
      return {
        conductorTasks: nextItems,
        conductorTasksByPaneKey: indexTasks(nextItems),
        boardTasks: nextBoard
      }
    })
  },

  setTaskControlMode: async (id, controlMode) => {
    try {
      const task = await setWorkControlMode(id, controlMode)
      get().applyConductorTask(task)
    } catch (err) {
      set((state) => ({
        conductorTranscript: [
          ...state.conductorTranscript,
          {
            id: nextId('notice'),
            role: 'notice',
            text: `Control handoff failed: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      }))
    }
  },

  dispatchConductorWork: async (input) => {
    try {
      const { task } = await dispatchWork(input)
      get().applyConductorTask(task)
      set((state) => ({
        conductorTranscript: [
          ...state.conductorTranscript,
          {
            id: nextId('notice'),
            role: 'notice',
            text: `Dispatched "${task.title}"${task.repo ? ` to ${task.repo}` : ''}`
          }
        ]
      }))
      return task
    } catch (err) {
      set((state) => ({
        conductorTranscript: [
          ...state.conductorTranscript,
          {
            id: nextId('notice'),
            role: 'notice',
            text: `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`
          }
        ]
      }))
      return null
    }
  },

  moveBoardTask: async (id, status) => {
    // Why: optimistic move so the card lands immediately; the server echo
    // (and any Run change) reconciles via applyConductorTask.
    set((state) => ({
      boardTasks: state.boardTasks.map((task) => (task.id === id ? { ...task, status } : task))
    }))
    try {
      const updated = await setTaskStatus(id, status)
      get().applyConductorTask(updated)
    } catch {
      void get().hydrateBoard()
    }
  },

  createBoardTask: async (input) => {
    try {
      const task = await createBoardTask(input)
      get().applyConductorTask(task)
      return task
    } catch {
      return null
    }
  },

  dispatchBoardTask: async (id, repoSelector, harness) => {
    try {
      const { task } = await dispatchExistingTask(id, repoSelector, harness)
      get().applyConductorTask(task)
      return task
    } catch (err) {
      // Why: worktree creation can succeed on the main process while the renderer
      // still sees a failure (e.g. a stale RPC error). Reconcile before toasting.
      await get().hydrateBoard()
      const fresh = get().boardTasks.find((t) => t.id === id)
      if (fresh?.currentRun || fresh?.worktree) {
        get().applyConductorTask(fresh)
        return fresh
      }
      throw err instanceof Error ? err : new Error(String(err))
    }
  },

  setBoardTaskProject: async (id, repoSelector) => {
    try {
      const task = await setTaskProject(id, repoSelector)
      get().applyConductorTask(task)
      return task
    } catch {
      return null
    }
  },

  syncBoardLinear: async () => {
    await syncLinearTasks()
    void get().hydrateBoard()
  },

  sendConductorTurn: async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return
    }
    // Optimistically show the captain's turn; the streamed reply follows.
    set((state) => ({
      conductorTranscript: [
        ...state.conductorTranscript,
        { id: nextId('user'), role: 'user', text: trimmed }
      ],
      conductorStreaming: true
    }))
    try {
      await sendConductorMessage(trimmed)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isDispatchError =
        message.includes('SkillTask') ||
        message.includes('Connect integration') ||
        message.includes('@task:')
      set((state) => ({
        conductorTranscript: [
          ...state.conductorTranscript,
          {
            id: nextId('notice'),
            role: 'notice',
            text: isDispatchError ? message : `Failed to reach the conductor: ${message}`
          }
        ],
        conductorStreaming: false
      }))
    }
  },

  applyConductorFrame: (raw) => {
    const frame = asConductorFrame(raw)
    if (!frame) {
      return
    }
    set((state) => reduceConductorFrame(state.conductorTranscript, frame, nextId))
  }
})
