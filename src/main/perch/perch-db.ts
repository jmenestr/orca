// Why: Perch keeps its own SQLite file (perch.db), entirely separate from
// Orca's orchestration.db. The two systems coexist — Orca's orchestration DB is
// untouched. perch.db hosts the conductor's Task/Run/Agent model: a Task is a
// unit of work, a Run is one agent instance executing it, and an Agent is a
// reusable personality. The SQLite boilerplate (WAL pragmas, versioned migrate
// guard, hasColumn probe) is copied from runtime/orchestration/db.ts so both DBs
// harden identically.
import Database from '../sqlite/sync-database'
import { createPerchTables, migratePerchDb, seedDefaultAgents } from './perch-db-migrate'
import {
  appendConductorTurn as dbAppendConductorTurn,
  appendEvent as dbAppendEvent,
  appendTimeline as dbAppendTimeline,
  appendTranscript as dbAppendTranscript,
  readConductorTranscript,
  readTimeline,
  readTranscript,
  recentCaptainEvents as dbRecentCaptainEvents
} from './perch-db-content'
import {
  rowToAgent,
  rowToRun,
  rowToTask,
  type AgentRow,
  type RunRow,
  type WorkItemRow
} from './perch-db-rows'
import {
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_CONTROL_MODE,
  type Agent,
  type ConductorNoticeRef,
  type ConductorRole,
  type ConductorTurn,
  type Run,
  type RunStatus,
  type Task,
  type TaskStatus,
  type TimelineKind,
  type TimelineSegment,
  type TranscriptRole,
  type WorkEvent
} from './perch-types'

export class PerchDb {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    createPerchTables(this.db)
    migratePerchDb(this.db)
    seedDefaultAgents(this.db)
  }

  upsertAgent(agent: Agent): void {
    this.db
      .prepare(
        `INSERT INTO agents (
           id, name, instructions, allowed_tools, denied_tools, default_harness,
           default_mode, autonomy, model, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, instructions = excluded.instructions,
           allowed_tools = excluded.allowed_tools, denied_tools = excluded.denied_tools,
           default_harness = excluded.default_harness, default_mode = excluded.default_mode,
           autonomy = excluded.autonomy, model = excluded.model,
           updated_at = excluded.updated_at`
      )
      .run(
        agent.id,
        agent.name,
        agent.instructions,
        agent.allowedTools ? JSON.stringify(agent.allowedTools) : null,
        agent.deniedTools ? JSON.stringify(agent.deniedTools) : null,
        agent.defaultHarness,
        agent.defaultMode,
        JSON.stringify(agent.autonomy ?? DEFAULT_AUTONOMY_POLICY),
        agent.model,
        agent.createdAt,
        agent.updatedAt
      )
  }

  getAgent(id: string): Agent | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
    return row ? rowToAgent(row) : undefined
  }

  listAgents(): Agent[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY name').all() as AgentRow[]
    return rows.map(rowToAgent)
  }

  // ── Tasks ──

  // Why: whole-row upsert (insert or fully replace) — the Task is the source of
  // truth, so the caller mutates it and writes the full row. Legacy pane/agent
  // columns are written null; that data now lives on Run rows.
  upsertTask(task: Task): void {
    this.db
      .prepare(
        `INSERT INTO work_items (
           id, source, kind, mode, title, context, status, runner, harness, landing,
           autonomy, session_id, repo, worktree, branch, codespace, pr_url,
           error, pane_key, terminal_handle, control_mode, agent_type,
           dispatch_target, current_run_id, external_id, external_identifier,
           external_url, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source, kind = excluded.kind, mode = excluded.mode,
           title = excluded.title,
           context = excluded.context, status = excluded.status, runner = excluded.runner,
           harness = excluded.harness, landing = excluded.landing, autonomy = excluded.autonomy,
           repo = excluded.repo, worktree = excluded.worktree,
           branch = excluded.branch, pr_url = excluded.pr_url,
           error = excluded.error, control_mode = excluded.control_mode,
           dispatch_target = excluded.dispatch_target, current_run_id = excluded.current_run_id,
           external_id = excluded.external_id, external_identifier = excluded.external_identifier,
           external_url = excluded.external_url,
           created_at = excluded.created_at, updated_at = excluded.updated_at`
      )
      .run(
        task.id,
        task.source,
        task.kind,
        task.mode,
        task.title,
        JSON.stringify(task.context ?? {}),
        task.status,
        task.runner,
        task.harness,
        task.landing,
        JSON.stringify(task.autonomy ?? DEFAULT_AUTONOMY_POLICY),
        null,
        task.repo,
        task.worktree,
        task.branch,
        null,
        task.prUrl,
        task.error,
        null,
        null,
        task.controlMode ?? DEFAULT_CONTROL_MODE,
        null,
        task.dispatchTarget ? JSON.stringify(task.dispatchTarget) : null,
        task.currentRunId,
        task.externalId,
        task.externalIdentifier,
        task.externalUrl,
        task.createdAt,
        task.updatedAt
      )
  }

  getTaskByExternalId(externalId: string): Task | undefined {
    const row = this.db
      .prepare('SELECT * FROM work_items WHERE external_id = ?')
      .get(externalId) as WorkItemRow | undefined
    return row ? rowToTask(row) : undefined
  }

  // Why: the Task board needs every column including Backlog and Done, unlike
  // liveTasks() which is the non-terminal recovery set. Capped + newest-first.
  boardTasks(limit = 500): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM work_items ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as WorkItemRow[]
    return rows.map((row) => this.attachCurrentRun(rowToTask(row)))
  }

  getTask(id: string): Task | undefined {
    const row = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as
      | WorkItemRow
      | undefined
    return row ? rowToTask(row) : undefined
  }

  // Why: embed the current Run so a Task can cross the RPC/push boundary without
  // a separate join on the renderer side.
  getTaskWithRun(id: string): Task | undefined {
    const task = this.getTask(id)
    if (!task) {
      return undefined
    }
    return this.attachCurrentRun(task)
  }

  private attachCurrentRun(task: Task): Task {
    const run = task.currentRunId ? this.getRun(task.currentRunId) : undefined
    return { ...task, currentRun: run ?? null }
  }

  // Why: the most recent non-terminal task for a worktree is the dispatch target
  // a freshly-observed agent in that worktree should attach to.
  getTaskByWorktreeId(worktreeId: string): Task | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM work_items WHERE worktree = ? AND status NOT IN ('done', 'failed', 'cancelled') ORDER BY updated_at DESC LIMIT 1"
      )
      .get(worktreeId) as WorkItemRow | undefined
    return row ? rowToTask(row) : undefined
  }

  // Why: reconciliation dedups by worktree across ALL statuses so a completed or
  // cancelled worktree-backed task is not resurrected as a backlog duplicate.
  findAnyTaskByWorktreeId(worktreeId: string): Task | undefined {
    const row = this.db
      .prepare('SELECT * FROM work_items WHERE worktree = ? ORDER BY updated_at DESC LIMIT 1')
      .get(worktreeId) as WorkItemRow | undefined
    return row ? rowToTask(row) : undefined
  }

  listTasks(): Task[] {
    const rows = this.db
      .prepare('SELECT * FROM work_items ORDER BY created_at DESC')
      .all() as WorkItemRow[]
    return rows.map(rowToTask)
  }

  // Why: non-terminal tasks are the live fleet — work that may still have or
  // relaunch a Run. Embeds each task's current Run for the renderer.
  liveTasks(): Task[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM work_items WHERE status NOT IN ('done', 'failed', 'cancelled') ORDER BY created_at"
      )
      .all() as WorkItemRow[]
    return rows.map((row) => this.attachCurrentRun(rowToTask(row)))
  }

  deleteTask(id: string): void {
    this.db.prepare('DELETE FROM work_items WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM runs WHERE task_id = ?').run(id)
    this.db.prepare('DELETE FROM work_events WHERE item_id = ?').run(id)
    this.db.prepare('DELETE FROM work_transcript WHERE item_id = ?').run(id)
    this.db.prepare('DELETE FROM work_timeline WHERE item_id = ?').run(id)
  }

  // ── Runs ──

  upsertRun(run: Run): void {
    this.db
      .prepare(
        `INSERT INTO runs (
           id, task_id, agent_id, harness, mode, status, pane_key, terminal_handle,
           worktree_id, repo_id, connection_id, session_id, agent_type, result,
           error, started_at, ended_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           task_id = excluded.task_id, agent_id = excluded.agent_id,
           harness = excluded.harness, mode = excluded.mode, status = excluded.status,
           pane_key = excluded.pane_key, terminal_handle = excluded.terminal_handle,
           worktree_id = excluded.worktree_id, repo_id = excluded.repo_id,
           connection_id = excluded.connection_id, session_id = excluded.session_id,
           agent_type = excluded.agent_type, result = excluded.result, error = excluded.error,
           started_at = excluded.started_at, ended_at = excluded.ended_at,
           updated_at = excluded.updated_at`
      )
      .run(
        run.id,
        run.taskId,
        run.agentId,
        run.harness,
        run.mode,
        run.status,
        run.paneKey,
        run.terminalHandle,
        run.worktreeId,
        run.repoId,
        run.connectionId,
        run.sessionId,
        run.agentType,
        run.result,
        run.error,
        run.startedAt,
        run.endedAt,
        run.updatedAt
      )
  }

  getRun(id: string): Run | undefined {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined
    return row ? rowToRun(row) : undefined
  }

  getRunByPaneKey(paneKey: string): Run | undefined {
    const row = this.db
      .prepare('SELECT * FROM runs WHERE pane_key = ? ORDER BY started_at DESC LIMIT 1')
      .get(paneKey) as RunRow | undefined
    return row ? rowToRun(row) : undefined
  }

  runsForTask(taskId: string): Run[] {
    const rows = this.db
      .prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY started_at')
      .all(taskId) as RunRow[]
    return rows.map(rowToRun)
  }

  // ── Events (captain action feed) ──

  appendEvent(itemId: string, kind: string, payload: unknown, at: number): WorkEvent {
    return dbAppendEvent(this.db, itemId, kind, payload, at)
  }

  recentCaptainEvents(limit = 30): WorkEvent[] {
    return dbRecentCaptainEvents(this.db, limit)
  }

  // ── Transcript (plain text fallback) ──

  appendTranscript(itemId: string, role: TranscriptRole, text: string, at: number): void {
    dbAppendTranscript(this.db, itemId, role, text, at)
  }

  transcript(itemId: string) {
    return readTranscript(this.db, itemId)
  }

  // ── Timeline (rich per-item history) ──

  appendTimeline(itemId: string, kind: TimelineKind, payload: unknown, at: number): void {
    dbAppendTimeline(this.db, itemId, kind, payload, at)
  }

  timeline(itemId: string): TimelineSegment[] {
    return readTimeline(this.db, itemId)
  }

  // ── Conductor chat (the plain-language director thread) ──

  appendConductorTurn(
    role: ConductorRole,
    text: string,
    at: number,
    ref?: ConductorNoticeRef | null
  ): ConductorTurn {
    return dbAppendConductorTurn(this.db, role, text, at, ref)
  }

  conductorTranscript(limit = 500): ConductorTurn[] {
    return readConductorTranscript(this.db, limit)
  }

  close(): void {
    this.db.close()
  }
}

export type { TaskStatus, RunStatus }
