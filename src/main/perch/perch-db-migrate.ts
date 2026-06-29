import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import {
  CONDUCTOR_AGENT_ID,
  DEFAULT_AGENT_ID,
  DEFAULT_AUTONOMY_POLICY,
  DEFAULT_RUN_MODE,
  defaultModeForSource,
  mapLegacyStatusToRun,
  mapLegacyStatusToTask,
  type RawStatus,
  type Source
} from './perch-types'
import { type WorkItemRow } from './perch-db-rows'

export const SCHEMA_VERSION = 6

export function createPerchTables(db: Database.Database): void {
  db.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id          TEXT PRIMARY KEY,
        source      TEXT NOT NULL,
        kind        TEXT NOT NULL,
        mode        TEXT,
        title       TEXT NOT NULL,
        context     TEXT NOT NULL,
        status      TEXT NOT NULL,
        runner      TEXT NOT NULL,
        harness     TEXT,
        landing     TEXT NOT NULL,
        autonomy    TEXT,
        session_id  TEXT,
        repo        TEXT,
        worktree    TEXT,
        branch      TEXT,
        codespace   TEXT,
        pr_url      TEXT,
        error       TEXT,
        pane_key        TEXT,
        terminal_handle TEXT,
        control_mode    TEXT DEFAULT 'conductor',
        agent_type      TEXT,
        dispatch_target TEXT,
        current_run_id  TEXT,
        external_id          TEXT,
        external_identifier  TEXT,
        external_url         TEXT,
        created_at  REAL NOT NULL,
        updated_at  REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);
      CREATE INDEX IF NOT EXISTS idx_work_items_worktree ON work_items(worktree)
        WHERE worktree IS NOT NULL;

      CREATE TABLE IF NOT EXISTS runs (
        id              TEXT PRIMARY KEY,
        task_id         TEXT,
        agent_id        TEXT NOT NULL,
        harness         TEXT NOT NULL,
        mode            TEXT NOT NULL,
        status          TEXT NOT NULL,
        pane_key        TEXT,
        terminal_handle TEXT,
        worktree_id     TEXT,
        repo_id         TEXT,
        connection_id   TEXT,
        session_id      TEXT,
        agent_type      TEXT,
        result          TEXT,
        error           TEXT,
        started_at      REAL NOT NULL,
        ended_at        REAL,
        updated_at      REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_task ON runs(task_id);
      CREATE INDEX IF NOT EXISTS idx_runs_pane_key ON runs(pane_key) WHERE pane_key IS NOT NULL;

      CREATE TABLE IF NOT EXISTS agents (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        instructions    TEXT,
        allowed_tools   TEXT,
        denied_tools    TEXT,
        default_harness TEXT NOT NULL,
        default_mode    TEXT NOT NULL,
        autonomy        TEXT,
        model           TEXT,
        created_at      REAL NOT NULL,
        updated_at      REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_events (
        item_id  TEXT NOT NULL,
        seq      INTEGER NOT NULL,
        kind     TEXT NOT NULL,
        payload  TEXT NOT NULL,
        at       REAL NOT NULL,
        PRIMARY KEY (item_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_work_events_kind_at ON work_events(kind, at);

      CREATE TABLE IF NOT EXISTS work_transcript (
        item_id  TEXT NOT NULL,
        idx      INTEGER PRIMARY KEY AUTOINCREMENT,
        role     TEXT NOT NULL,
        text     TEXT NOT NULL,
        at       REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_transcript_item ON work_transcript(item_id, idx);

      CREATE TABLE IF NOT EXISTS work_timeline (
        item_id  TEXT NOT NULL,
        idx      INTEGER PRIMARY KEY AUTOINCREMENT,
        kind     TEXT NOT NULL,
        payload  TEXT NOT NULL,
        at       REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_timeline_item ON work_timeline(item_id, idx);

      CREATE TABLE IF NOT EXISTS conductor_turns (
        idx   INTEGER PRIMARY KEY AUTOINCREMENT,
        role  TEXT NOT NULL,
        text  TEXT NOT NULL,
        at    REAL NOT NULL,
        ref   TEXT
      );
    `)
}

// Why: CREATE TABLE IF NOT EXISTS is a no-op against an existing DB, so future
// schema shapes need an explicit migrate pass. user_version bumps only on a
// successful transaction, so a mid-migration crash leaves the prior version.
export function migratePerchDb(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number
  if (current >= SCHEMA_VERSION) {
    return
  }
  db.exec('BEGIN')
  try {
    if (current < 2) {
      if (!hasColumn(db, 'work_items', 'pane_key')) {
        db.exec('ALTER TABLE work_items ADD COLUMN pane_key TEXT')
      }
      if (!hasColumn(db, 'work_items', 'terminal_handle')) {
        db.exec('ALTER TABLE work_items ADD COLUMN terminal_handle TEXT')
      }
      if (!hasColumn(db, 'work_items', 'control_mode')) {
        db.exec("ALTER TABLE work_items ADD COLUMN control_mode TEXT DEFAULT 'conductor'")
      }
      if (!hasColumn(db, 'work_items', 'agent_type')) {
        db.exec('ALTER TABLE work_items ADD COLUMN agent_type TEXT')
      }
    }
    if (current < 3) {
      // v2 -> v3: split the single work item into Task + Run. Add Task columns,
      // then create one Run row per legacy work item that had a live agent and
      // remap its conflated RawStatus into a (TaskStatus, RunStatus) pair.
      if (!hasColumn(db, 'work_items', 'dispatch_target')) {
        db.exec('ALTER TABLE work_items ADD COLUMN dispatch_target TEXT')
      }
      if (!hasColumn(db, 'work_items', 'current_run_id')) {
        db.exec('ALTER TABLE work_items ADD COLUMN current_run_id TEXT')
      }
      backfillRunsFromWorkItems(db)
    }
    if (current < 4) {
      // v3 -> v4: notices can carry a Task/agent reference so the conductor
      // chat can link back to the agent that produced a report.
      if (!hasColumn(db, 'conductor_turns', 'ref')) {
        db.exec('ALTER TABLE conductor_turns ADD COLUMN ref TEXT')
      }
    }
    if (current < 5) {
      // v4 -> v5: tasks can be ingested from external sources (Linear) and
      // need a dedup key + deep link back to the source issue.
      if (!hasColumn(db, 'work_items', 'external_id')) {
        db.exec('ALTER TABLE work_items ADD COLUMN external_id TEXT')
      }
      if (!hasColumn(db, 'work_items', 'external_identifier')) {
        db.exec('ALTER TABLE work_items ADD COLUMN external_identifier TEXT')
      }
      if (!hasColumn(db, 'work_items', 'external_url')) {
        db.exec('ALTER TABLE work_items ADD COLUMN external_url TEXT')
      }
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_work_items_external ON work_items(external_id) WHERE external_id IS NOT NULL'
      )
    }
    if (current < 6) {
      // v5 -> v6: tasks gain an execution `mode` (project/scratch/manual).
      // Existing rows are defaulted from their source so they keep behaving as
      // project-mode dispatch.
      if (!hasColumn(db, 'work_items', 'mode')) {
        db.exec('ALTER TABLE work_items ADD COLUMN mode TEXT')
      }
      const rows = db.prepare('SELECT id, source FROM work_items').all() as {
        id: string
        source: string
      }[]
      const setMode = db.prepare('UPDATE work_items SET mode = ? WHERE id = ?')
      for (const row of rows) {
        setMode.run(defaultModeForSource(row.source as Source), row.id)
      }
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Why: runs inside the migrate() transaction. For each legacy work item, mint a
// Run from its pane/agent fields when it had (or was about to have) a live
// agent, link it as the task's current run, and rewrite the item's status from
// the legacy RawStatus to the new TaskStatus.
export function backfillRunsFromWorkItems(db: Database.Database): void {
  const rows = db.prepare('SELECT * FROM work_items').all() as WorkItemRow[]
  const insertRun = db.prepare(
    `INSERT INTO runs (
         id, task_id, agent_id, harness, mode, status, pane_key, terminal_handle,
         worktree_id, repo_id, connection_id, session_id, agent_type, result,
         error, started_at, ended_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const updateItem = db.prepare('UPDATE work_items SET status = ?, current_run_id = ? WHERE id = ?')
  for (const row of rows) {
    const legacy = row.status as RawStatus
    const taskStatus = mapLegacyStatusToTask(legacy)
    const runStatus = mapLegacyStatusToRun(legacy)
    let currentRunId: string | null = null
    if (runStatus !== null || row.pane_key !== null) {
      const runId = randomUUID()
      insertRun.run(
        runId,
        row.id,
        DEFAULT_AGENT_ID,
        row.harness ?? 'claude',
        DEFAULT_RUN_MODE,
        runStatus ?? 'idle',
        row.pane_key,
        row.terminal_handle,
        row.worktree,
        null,
        null,
        row.session_id,
        row.agent_type,
        null,
        null,
        row.created_at,
        null,
        row.updated_at
      )
      currentRunId = runId
    }
    updateItem.run(taskStatus, currentRunId, row.id)
  }
}

export function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some((row) => row.name === column)
}

export function seedDefaultAgents(db: Database.Database): void {
  const at = Date.now() / 1000
  const insert = db.prepare(
    `INSERT OR IGNORE INTO agents (
         id, name, instructions, allowed_tools, denied_tools, default_harness,
         default_mode, autonomy, model, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insert.run(
    DEFAULT_AGENT_ID,
    'General',
    null,
    null,
    null,
    'claude',
    DEFAULT_RUN_MODE,
    JSON.stringify(DEFAULT_AUTONOMY_POLICY),
    null,
    at,
    at
  )
  insert.run(
    CONDUCTOR_AGENT_ID,
    'Conductor',
    null,
    null,
    null,
    'claude',
    'session',
    JSON.stringify(DEFAULT_AUTONOMY_POLICY),
    null,
    at,
    at
  )
}
