// Why: Perch keeps its own SQLite file (perch.db), entirely separate from
// Orca's orchestration.db. The two systems coexist — Orca's orchestration DB is
// untouched — so Perch ports perch's store.rs schema verbatim into its own DB
// rather than extending OrchestrationDb. The SQLite boilerplate (WAL pragmas,
// versioned migrate guard, hasColumn probe) is copied from
// runtime/orchestration/db.ts so both DBs harden identically.
import Database from '../sqlite/sync-database'
import {
  DEFAULT_AUTONOMY_POLICY,
  type AutonomyPolicy,
  type ConductorRole,
  type ConductorTurn,
  type Harness,
  type Kind,
  type Landing,
  type RawStatus,
  type Runner,
  type Source,
  type TimelineKind,
  type TimelineSegment,
  type TranscriptEntry,
  type TranscriptRole,
  type WorkEvent,
  type WorkItem
} from './perch-types'

// Why: row shape as stored — enums are TEXT, JSON fields are stringified, and
// timestamps are REAL unix seconds (matching the Rust f64 columns).
type WorkItemRow = {
  id: string
  source: string
  kind: string
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
  created_at: number
  updated_at: number
}

const SCHEMA_VERSION = 1

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw === '') {
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToItem(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    source: row.source as Source,
    kind: row.kind as Kind,
    title: row.title,
    context: parseJson<unknown>(row.context, {}),
    status: row.status as RawStatus,
    runner: row.runner as Runner,
    // Why: harness was migrated in nullable for pre-migration rows; default to
    // claude (the Rust default) when absent.
    harness: (row.harness ?? 'claude') as Harness,
    landing: row.landing as Landing,
    autonomy: parseJson<AutonomyPolicy>(row.autonomy, DEFAULT_AUTONOMY_POLICY),
    sessionId: row.session_id,
    repo: row.repo,
    worktree: row.worktree,
    branch: row.branch,
    codespace: row.codespace,
    prUrl: row.pr_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class PerchDb {
  private db: Database.Database

  constructor(dbPath: string | ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.createTables()
    this.migrate()
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id          TEXT PRIMARY KEY,
        source      TEXT NOT NULL,
        kind        TEXT NOT NULL,
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
        created_at  REAL NOT NULL,
        updated_at  REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status);

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
        at    REAL NOT NULL
      );
    `)
  }

  // Why: CREATE TABLE IF NOT EXISTS is a no-op against an existing DB, so future
  // schema shapes need an explicit migrate pass. user_version bumps only on a
  // successful transaction, so a mid-migration crash leaves the prior version.
  private migrate(): void {
    const current = this.db.pragma('user_version', { simple: true }) as number
    if (current >= SCHEMA_VERSION) {
      return
    }
    this.db.exec('BEGIN')
    try {
      // v0 → v1 is the initial schema created above; no column rewrites yet.
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`)
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  // ── Work items ──

  // Why: whole-row upsert (insert or fully replace) mirrors store.rs `upsert` —
  // the WorkItem is the source of truth, so the caller mutates it and writes
  // the full row rather than threading per-field updates through SQL.
  upsert(item: WorkItem): void {
    this.db
      .prepare(
        `INSERT INTO work_items (
           id, source, kind, title, context, status, runner, harness, landing,
           autonomy, session_id, repo, worktree, branch, codespace, pr_url,
           error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source = excluded.source, kind = excluded.kind, title = excluded.title,
           context = excluded.context, status = excluded.status, runner = excluded.runner,
           harness = excluded.harness, landing = excluded.landing, autonomy = excluded.autonomy,
           session_id = excluded.session_id, repo = excluded.repo, worktree = excluded.worktree,
           branch = excluded.branch, codespace = excluded.codespace, pr_url = excluded.pr_url,
           error = excluded.error, created_at = excluded.created_at, updated_at = excluded.updated_at`
      )
      .run(
        item.id,
        item.source,
        item.kind,
        item.title,
        JSON.stringify(item.context ?? {}),
        item.status,
        item.runner,
        item.harness,
        item.landing,
        JSON.stringify(item.autonomy ?? DEFAULT_AUTONOMY_POLICY),
        item.sessionId,
        item.repo,
        item.worktree,
        item.branch,
        item.codespace,
        item.prUrl,
        item.error,
        item.createdAt,
        item.updatedAt
      )
  }

  get(id: string): WorkItem | undefined {
    const row = this.db.prepare('SELECT * FROM work_items WHERE id = ?').get(id) as
      | WorkItemRow
      | undefined
    return row ? rowToItem(row) : undefined
  }

  list(): WorkItem[] {
    const rows = this.db
      .prepare('SELECT * FROM work_items ORDER BY created_at DESC')
      .all() as WorkItemRow[]
    return rows.map(rowToItem)
  }

  // Why: non-terminal items are the recovery set — work that, on relaunch, may
  // still have a live or relaunchable crewmate (mirrors store.rs `live_items`).
  liveItems(): WorkItem[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM work_items WHERE status NOT IN ('done', 'failed') ORDER BY created_at"
      )
      .all() as WorkItemRow[]
    return rows.map(rowToItem)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM work_items WHERE id = ?').run(id)
    this.db.prepare('DELETE FROM work_events WHERE item_id = ?').run(id)
    this.db.prepare('DELETE FROM work_transcript WHERE item_id = ?').run(id)
    this.db.prepare('DELETE FROM work_timeline WHERE item_id = ?').run(id)
  }

  // ── Events (captain action feed) ──

  appendEvent(itemId: string, kind: string, payload: unknown, at: number): WorkEvent {
    const next = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM work_events WHERE item_id = ?')
      .get(itemId) as { seq: number }
    const seq = next.seq
    const payloadJson = JSON.stringify(payload ?? null)
    this.db
      .prepare('INSERT INTO work_events (item_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?)')
      .run(itemId, seq, kind, payloadJson, at)
    return { itemId, seq, kind, payload: payload ?? null, at }
  }

  recentCaptainEvents(limit = 30): WorkEvent[] {
    const rows = this.db
      .prepare(
        "SELECT item_id, seq, kind, payload, at FROM work_events WHERE kind = 'captain' ORDER BY at DESC LIMIT ?"
      )
      .all(limit) as { item_id: string; seq: number; kind: string; payload: string; at: number }[]
    return rows.map((r) => ({
      itemId: r.item_id,
      seq: r.seq,
      kind: r.kind,
      payload: parseJson<unknown>(r.payload, null),
      at: r.at
    }))
  }

  // ── Transcript (plain text fallback) ──

  appendTranscript(itemId: string, role: TranscriptRole, text: string, at: number): void {
    this.db
      .prepare('INSERT INTO work_transcript (item_id, role, text, at) VALUES (?, ?, ?, ?)')
      .run(itemId, role, text, at)
  }

  transcript(itemId: string): TranscriptEntry[] {
    const rows = this.db
      .prepare('SELECT role, text FROM work_transcript WHERE item_id = ? ORDER BY idx ASC')
      .all(itemId) as { role: string; text: string }[]
    return rows.map((r) => ({ role: r.role as TranscriptRole, text: r.text }))
  }

  // ── Timeline (rich per-item history) ──

  appendTimeline(itemId: string, kind: TimelineKind, payload: unknown, at: number): void {
    this.db
      .prepare('INSERT INTO work_timeline (item_id, kind, payload, at) VALUES (?, ?, ?, ?)')
      .run(itemId, kind, JSON.stringify(payload ?? null), at)
  }

  // Why: timeline is primary; fall back to the plain transcript for pre-upgrade
  // items that only have transcript rows (mirrors store.rs `timeline`).
  timeline(itemId: string): TimelineSegment[] {
    const rows = this.db
      .prepare('SELECT kind, payload FROM work_timeline WHERE item_id = ? ORDER BY idx ASC')
      .all(itemId) as { kind: string; payload: string }[]
    if (rows.length > 0) {
      return rows.map((r) => ({
        kind: r.kind as TimelineKind,
        payload: parseJson<unknown>(r.payload, null)
      }))
    }
    return this.transcript(itemId).map((entry) => ({
      kind: entry.role === 'user' ? 'user' : entry.role === 'notice' ? 'notice' : 'text',
      payload: { text: entry.text }
    }))
  }

  // ── Conductor chat (the plain-language director thread) ──

  appendConductorTurn(role: ConductorRole, text: string, at: number): ConductorTurn {
    const info = this.db
      .prepare('INSERT INTO conductor_turns (role, text, at) VALUES (?, ?, ?)')
      .run(role, text, at)
    return { id: Number(info.lastInsertRowid), role, text, at }
  }

  conductorTranscript(limit = 500): ConductorTurn[] {
    const rows = this.db
      .prepare('SELECT idx, role, text, at FROM conductor_turns ORDER BY idx ASC LIMIT ?')
      .all(limit) as { idx: number; role: string; text: string; at: number }[]
    return rows.map((r) => ({ id: r.idx, role: r.role as ConductorRole, text: r.text, at: r.at }))
  }

  close(): void {
    this.db.close()
  }
}
