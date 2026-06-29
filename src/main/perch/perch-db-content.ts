import type Database from '../sqlite/sync-database'
import { parseJson } from './perch-db-rows'
import type {
  ConductorNoticeRef,
  ConductorRole,
  ConductorTurn,
  TimelineKind,
  TimelineSegment,
  TranscriptEntry,
  TranscriptRole,
  WorkEvent
} from './perch-types'

export function appendEvent(
  db: Database.Database,
  itemId: string,
  kind: string,
  payload: unknown,
  at: number
): WorkEvent {
  const next = db
    .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM work_events WHERE item_id = ?')
    .get(itemId) as { seq: number }
  const seq = next.seq
  const payloadJson = JSON.stringify(payload ?? null)
  db.prepare(
    'INSERT INTO work_events (item_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?)'
  ).run(itemId, seq, kind, payloadJson, at)
  return { itemId, seq, kind, payload: payload ?? null, at }
}

export function recentCaptainEvents(db: Database.Database, limit = 30): WorkEvent[] {
  const rows = db
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

export function appendTranscript(
  db: Database.Database,
  itemId: string,
  role: TranscriptRole,
  text: string,
  at: number
): void {
  db.prepare('INSERT INTO work_transcript (item_id, role, text, at) VALUES (?, ?, ?, ?)').run(
    itemId,
    role,
    text,
    at
  )
}

export function readTranscript(db: Database.Database, itemId: string): TranscriptEntry[] {
  const rows = db
    .prepare('SELECT role, text FROM work_transcript WHERE item_id = ? ORDER BY idx ASC')
    .all(itemId) as { role: string; text: string }[]
  return rows.map((r) => ({ role: r.role as TranscriptRole, text: r.text }))
}

export function appendTimeline(
  db: Database.Database,
  itemId: string,
  kind: TimelineKind,
  payload: unknown,
  at: number
): void {
  db.prepare('INSERT INTO work_timeline (item_id, kind, payload, at) VALUES (?, ?, ?, ?)').run(
    itemId,
    kind,
    JSON.stringify(payload ?? null),
    at
  )
}

// Why: timeline is primary; fall back to the plain transcript for pre-upgrade
// items that only have transcript rows.
export function readTimeline(db: Database.Database, itemId: string): TimelineSegment[] {
  const rows = db
    .prepare('SELECT kind, payload FROM work_timeline WHERE item_id = ? ORDER BY idx ASC')
    .all(itemId) as { kind: string; payload: string }[]
  if (rows.length > 0) {
    return rows.map((r) => ({
      kind: r.kind as TimelineKind,
      payload: parseJson<unknown>(r.payload, null)
    }))
  }
  return readTranscript(db, itemId).map((entry) => ({
    kind: entry.role === 'user' ? 'user' : entry.role === 'notice' ? 'notice' : 'text',
    payload: { text: entry.text }
  }))
}

export function appendConductorTurn(
  db: Database.Database,
  role: ConductorRole,
  text: string,
  at: number,
  ref?: ConductorNoticeRef | null
): ConductorTurn {
  const info = db
    .prepare('INSERT INTO conductor_turns (role, text, at, ref) VALUES (?, ?, ?, ?)')
    .run(role, text, at, ref ? JSON.stringify(ref) : null)
  return { id: Number(info.lastInsertRowid), role, text, at, ref: ref ?? null }
}

export function readConductorTranscript(db: Database.Database, limit = 500): ConductorTurn[] {
  const rows = db
    .prepare('SELECT idx, role, text, at, ref FROM conductor_turns ORDER BY idx ASC LIMIT ?')
    .all(limit) as { idx: number; role: string; text: string; at: number; ref: string | null }[]
  return rows.map((r) => ({
    id: r.idx,
    role: r.role as ConductorRole,
    text: r.text,
    at: r.at,
    ref: parseJson<ConductorNoticeRef | null>(r.ref, null)
  }))
}
