import { describe, expect, it } from 'vitest'
import { PerchDb } from './perch-db'
import {
  DEFAULT_AUTONOMY_POLICY,
  deriveAttention,
  deriveProgress,
  isLiveStatus,
  isPerTurnHarness,
  isTerminalStatus,
  nowSeconds,
  type WorkItem
} from './perch-types'

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  const at = nowSeconds()
  return {
    id: 'fix-login-k3',
    source: 'directive',
    kind: 'coding',
    title: 'Fix the login bug',
    context: { brief: 'repro then patch', repo: 'widget' },
    status: 'queued',
    runner: 'local',
    harness: 'claude',
    landing: 'pr',
    autonomy: DEFAULT_AUTONOMY_POLICY,
    sessionId: null,
    repo: '/home/cap/widget',
    worktree: null,
    branch: null,
    codespace: null,
    prUrl: null,
    error: null,
    createdAt: at,
    updatedAt: at,
    ...overrides
  }
}

describe('perch-types derivations', () => {
  it('derives progress buckets from raw status', () => {
    expect(deriveProgress('queued')).toBe('queued')
    expect(deriveProgress('dispatched')).toBe('queued')
    expect(deriveProgress('working')).toBe('working')
    expect(deriveProgress('awaiting_input')).toBe('paused')
    expect(deriveProgress('awaiting_approval')).toBe('paused')
    expect(deriveProgress('parked')).toBe('paused')
    expect(deriveProgress('landing')).toBe('landing')
    expect(deriveProgress('done')).toBe('done')
    expect(deriveProgress('failed')).toBe('failed')
  })

  it('derives attention from raw status', () => {
    expect(deriveAttention('working')).toBe('none')
    expect(deriveAttention('awaiting_input')).toBe('input')
    expect(deriveAttention('awaiting_approval')).toBe('approval')
    expect(deriveAttention('failed')).toBe('error')
    expect(deriveAttention('done')).toBe('none')
  })

  it('classifies terminal, live, and per-turn states', () => {
    expect(isTerminalStatus('done')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('working')).toBe(false)
    expect(isLiveStatus('working')).toBe(true)
    expect(isLiveStatus('dispatched')).toBe(true)
    expect(isLiveStatus('queued')).toBe(false)
    expect(isPerTurnHarness('cursor')).toBe(true)
    expect(isPerTurnHarness('claude')).toBe(false)
  })
})

describe('PerchDb (:memory:)', () => {
  it('round-trips a work item through upsert/get/list', () => {
    const db = new PerchDb(':memory:')
    try {
      const item = makeItem()
      db.upsert(item)

      const fetched = db.get(item.id)
      expect(fetched).toBeDefined()
      expect(fetched!.title).toBe('Fix the login bug')
      expect(fetched!.context).toEqual({ brief: 'repro then patch', repo: 'widget' })
      expect(fetched!.autonomy).toEqual(DEFAULT_AUTONOMY_POLICY)
      expect(fetched!.status).toBe('queued')

      expect(db.list()).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('replaces the whole row on a second upsert with the same id', () => {
    const db = new PerchDb(':memory:')
    try {
      const item = makeItem()
      db.upsert(item)
      db.upsert({ ...item, status: 'working', prUrl: 'https://example/pr/1' })

      const fetched = db.get(item.id)
      expect(fetched!.status).toBe('working')
      expect(fetched!.prUrl).toBe('https://example/pr/1')
      expect(db.list()).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('liveItems excludes terminal statuses', () => {
    const db = new PerchDb(':memory:')
    try {
      db.upsert(makeItem({ id: 'a', status: 'working' }))
      db.upsert(makeItem({ id: 'b', status: 'done' }))
      db.upsert(makeItem({ id: 'c', status: 'failed' }))
      db.upsert(makeItem({ id: 'd', status: 'awaiting_input' }))

      const live = db
        .liveItems()
        .map((i) => i.id)
        .sort()
      expect(live).toEqual(['a', 'd'])
    } finally {
      db.close()
    }
  })

  it('appends and reads events, transcript, and timeline', () => {
    const db = new PerchDb(':memory:')
    try {
      const item = makeItem()
      db.upsert(item)

      const at = nowSeconds()
      const e1 = db.appendEvent(item.id, 'captain', { action: 'steer', text: 'rebase first' }, at)
      const e2 = db.appendEvent(item.id, 'captain', { action: 'approve' }, at + 1)
      expect(e1.seq).toBe(1)
      expect(e2.seq).toBe(2)

      const captain = db.recentCaptainEvents()
      expect(captain).toHaveLength(2)
      // newest first
      expect((captain[0].payload as { action: string }).action).toBe('approve')

      db.appendTranscript(item.id, 'user', 'fix the bug', at)
      db.appendTranscript(item.id, 'assistant', 'on it', at + 1)
      expect(db.transcript(item.id)).toEqual([
        { role: 'user', text: 'fix the bug' },
        { role: 'assistant', text: 'on it' }
      ])

      db.appendTimeline(item.id, 'text', { text: 'starting' }, at)
      const timeline = db.timeline(item.id)
      expect(timeline).toHaveLength(1)
      expect(timeline[0].kind).toBe('text')
    } finally {
      db.close()
    }
  })

  it('falls back to transcript when an item has no timeline rows', () => {
    const db = new PerchDb(':memory:')
    try {
      const item = makeItem()
      db.upsert(item)
      const at = nowSeconds()
      db.appendTranscript(item.id, 'user', 'hello', at)
      db.appendTranscript(item.id, 'notice', 'spawned', at + 1)

      const timeline = db.timeline(item.id)
      expect(timeline.map((t) => t.kind)).toEqual(['user', 'notice'])
    } finally {
      db.close()
    }
  })

  it('persists conductor turns in order', () => {
    const db = new PerchDb(':memory:')
    try {
      const at = nowSeconds()
      const t1 = db.appendConductorTurn('user', 'ship the dark mode toggle', at)
      const t2 = db.appendConductorTurn('assistant', 'Aye captain — dispatching a crewmate', at + 1)
      expect(t1.id).toBeLessThan(t2.id)

      const turns = db.conductorTranscript()
      expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
      expect(turns[0].text).toBe('ship the dark mode toggle')
    } finally {
      db.close()
    }
  })

  it('deletes an item and its associated rows', () => {
    const db = new PerchDb(':memory:')
    try {
      const item = makeItem()
      db.upsert(item)
      db.appendTranscript(item.id, 'user', 'x', nowSeconds())
      db.delete(item.id)
      expect(db.get(item.id)).toBeUndefined()
      expect(db.transcript(item.id)).toHaveLength(0)
    } finally {
      db.close()
    }
  })
})
