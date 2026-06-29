// Why: renderer-side Perch types and RPC wrappers. Kept local so the renderer
// does not import main-process modules across the project boundary. Mirrors the
// main Task/Run/Agent split: a Task is a unit of work, a Run is one agent
// instance executing it. The renderer binds UI rows to a Task and its embedded
// current Run.

export type {
  Attention,
  ConductorMessage,
  ConductorNoticeRef,
  ConductorTurn,
  ControlMode,
  PerchConductorFrame,
  Progress,
  Run,
  RunMode,
  RunStatus,
  Source,
  Task,
  TaskMode,
  TaskStatus,
  WorkItem
} from './perch-client-types'

export { asConductorFrame, asTask } from './perch-client-types'

export {
  createBoardTask,
  dispatchExistingTask,
  dispatchWork,
  loadBoardTasks,
  loadConductorFleet,
  loadConductorHistory,
  loadWorkspaceRepos,
  sendConductorMessage,
  setTaskProject,
  setTaskStatus,
  setWorkControlMode,
  syncLinearTasks,
  type DispatchWorkInput,
  type WorkspaceRepoEntry
} from './perch-client-rpc'

export {
  TASK_BOARD_COLUMNS,
  attentionLabel,
  columnStatusForTask,
  deriveWorkAttention,
  deriveWorkProgress,
  progressLabel,
  taskPaneKey
} from './perch-client-display'
