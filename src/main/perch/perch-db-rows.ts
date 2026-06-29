import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  defaultModeForSource,
  type Agent,
  type AutonomyPolicy,
  type ControlMode,
  type DispatchTarget,
  type Harness,
  type Kind,
  type Landing,
  type Run,
  type RunMode,
  type RunStatus,
  type Runner,
  type Source,
  type Task,
  type TaskMode,
  type TaskStatus
} from './perch-types'

// Why: row shape as stored — enums are TEXT, JSON fields are stringified, and
// timestamps are REAL unix seconds. The work_items table also keeps the legacy
// pane/agent columns (pane_key, terminal_handle, agent_type, session_id,
// codespace) nullable so the v2->v3 migration is additive; the Task domain
// object no longer reads them (they now live on Run rows).
export type WorkItemRow = {
  id: string
  source: string
  kind: string
  mode: string | null
  title: string
  context: string
  status: string
  runner: string
  harness: string | null
  landing: string
  autonomy: string | null
  session_id: string | null
  repo: string | null
  worktree: string | null
  branch: string | null
  codespace: string | null
  pr_url: string | null
  error: string | null
  pane_key: string | null
  terminal_handle: string | null
  control_mode: string | null
  agent_type: string | null
  dispatch_target: string | null
  current_run_id: string | null
  external_id: string | null
  external_identifier: string | null
  external_url: string | null
  created_at: number
  updated_at: number
}

export type RunRow = {
  id: string
  task_id: string | null
  agent_id: string
  harness: string
  mode: string
  status: string
  pane_key: string | null
  terminal_handle: string | null
  worktree_id: string | null
  repo_id: string | null
  connection_id: string | null
  session_id: string | null
  agent_type: string | null
  result: string | null
  error: string | null
  started_at: number
  ended_at: number | null
  updated_at: number
}

export type AgentRow = {
  id: string
  name: string
  instructions: string | null
  allowed_tools: string | null
  denied_tools: string | null
  default_harness: string
  default_mode: string
  autonomy: string | null
  model: string | null
  created_at: number
  updated_at: number
}

export function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function rowToTask(row: WorkItemRow): Task {
  return {
    id: row.id,
    source: row.source as Source,
    kind: row.kind as Kind,
    // Why: pre-v6 rows have a null mode; default from the source so legacy tasks
    // behave as project-mode (the historical dispatch path).
    mode: (row.mode ?? defaultModeForSource(row.source as Source)) as TaskMode,
    title: row.title,
    context: parseJson<unknown>(row.context, {}),
    status: row.status as TaskStatus,
    runner: row.runner as Runner,
    // Why: harness was migrated in nullable for pre-migration rows; default to
    // claude (the historical default) when absent.
    harness: (row.harness ?? 'claude') as Harness,
    landing: row.landing as Landing,
    autonomy: parseJson<AutonomyPolicy>(row.autonomy, DEFAULT_AUTONOMY_POLICY),
    repo: row.repo,
    worktree: row.worktree,
    branch: row.branch,
    prUrl: row.pr_url,
    error: row.error,
    controlMode: (row.control_mode ?? DEFAULT_CONTROL_MODE) as ControlMode,
    dispatchTarget: parseJson<DispatchTarget | null>(row.dispatch_target, null),
    currentRunId: row.current_run_id,
    externalId: row.external_id,
    externalIdentifier: row.external_identifier,
    externalUrl: row.external_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToRun(row: RunRow): Run {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    harness: row.harness as Harness,
    mode: row.mode as RunMode,
    status: row.status as RunStatus,
    paneKey: row.pane_key,
    terminalHandle: row.terminal_handle,
    worktreeId: row.worktree_id,
    repoId: row.repo_id,
    connectionId: row.connection_id,
    sessionId: row.session_id,
    agentType: row.agent_type,
    result: row.result,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    updatedAt: row.updated_at
  }
}

export function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    allowedTools: parseJson<string[] | null>(row.allowed_tools, null),
    deniedTools: parseJson<string[] | null>(row.denied_tools, null),
    defaultHarness: row.default_harness as Harness,
    defaultMode: row.default_mode as RunMode,
    autonomy: parseJson<AutonomyPolicy>(row.autonomy, DEFAULT_AUTONOMY_POLICY),
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
