// Why: append-only log shapes and conductor chat types, kept separate from the
// core Task/Run model so perch-types stays under the max-lines budget.

// Why: captain actions (steer/approve/cancel) are logged for the reconciliation
// feed; `kind` is 'captain' for those rows. Payload is free-form JSON.
export type WorkEvent = {
  itemId: string
  seq: number
  kind: string
  payload: unknown
  at: number
}

// Why: the rich timeline is the primary per-item history (text/tool/diff/
// reasoning/notice segments); the plain transcript is the pre-upgrade fallback.
export type TimelineKind = 'user' | 'text' | 'tool' | 'diff' | 'reasoning' | 'notice'

export type TimelineSegment = {
  kind: TimelineKind
  payload: unknown
}

export type TranscriptRole = 'user' | 'assistant' | 'notice'

export type TranscriptEntry = {
  role: TranscriptRole
  text: string
}

// Why: the conductor chat is the plain-language director thread, distinct from
// any single work item. Its turns persist so the view survives a relaunch.
export type ConductorRole = 'user' | 'assistant' | 'notice'

// Why: a fleet notice (e.g. a crewmate's report) can point back at the Task and
// agent pane that produced it, so the conductor chat can offer a "view agent"
// link. Persisted alongside the turn so the link survives a reload.
export type ConductorNoticeRef = {
  taskId: string
  title: string
  worktreeId: string | null
  paneKey: string | null
}

export type ConductorTurn = {
  id: number
  role: ConductorRole
  text: string
  at: number
  ref?: ConductorNoticeRef | null
}
