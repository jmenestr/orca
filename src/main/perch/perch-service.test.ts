import { describe, expect, it } from 'vitest'
import { PerchDb } from './perch-db'
import { PerchService, type PerchConductorFrame } from './perch-service'
import { resolveFirstmateDir } from './perch-service'

// Why: a fake stream-json conductor so the subprocess pipeline is exercised
// without requiring a real `claude` binary or the running Orca app. It speaks
// the same protocol PerchService parses: a `system` init frame on startup, then
// per stdin user turn it streams `text_delta` frames (one per word) and a
// terminal `result`. This proves: the subprocess launches, a turn's tokens
// stream back, and the line-parser maps them to normalized frames.
const FAKE_CONDUCTOR = `
const readline = require('readline')
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_test' }) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const content = (msg && msg.message && msg.message.content) || ''
  for (const word of String(content).split(' ')) {
    process.stdout.write(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: word + ' ' } } }) + '\\n')
  }
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }) + '\\n')
})
`

function makeService(db: PerchDb): PerchService {
  return new PerchService({
    db,
    firstmateDir: resolveFirstmateDir(),
    command: process.execPath,
    baseArgs: ['-e', FAKE_CONDUCTOR]
  })
}

describe('PerchService conductor subprocess', () => {
  it('launches the conductor and streams a turn back as frames', async () => {
    const db = new PerchDb(':memory:')
    const service = makeService(db)
    const frames: PerchConductorFrame[] = []
    const unsubscribe = service.subscribe((f) => frames.push(f))

    try {
      const resultSeen = new Promise<void>((resolve) => {
        const unsub = service.subscribe((f) => {
          if (f.kind === 'result') {
            unsub()
            resolve()
          }
        })
      })

      expect(service.isRunning()).toBe(false)
      service.send('ship dark mode')
      expect(service.isRunning()).toBe(true)

      await resultSeen

      // Session frame arrived from the init line.
      expect(frames.some((f) => f.kind === 'session' && f.sessionId === 'sess_test')).toBe(true)

      // Streamed text tokens echo the words back.
      const streamed = frames
        .filter((f): f is { kind: 'text'; text: string } => f.kind === 'text')
        .map((f) => f.text)
        .join('')
      expect(streamed).toContain('ship')
      expect(streamed).toContain('dark')
      expect(streamed).toContain('mode')

      // A terminal result closed the turn.
      expect(frames.some((f) => f.kind === 'result' && f.isError === false)).toBe(true)

      // The chat persisted: user turn + the assembled assistant reply.
      const transcript = db.conductorTranscript()
      expect(transcript.map((t) => t.role)).toEqual(['user', 'assistant'])
      expect(transcript[0].text).toBe('ship dark mode')
      expect(transcript[1].text.trim()).toBe('ship dark mode')
    } finally {
      unsubscribe()
      service.kill()
      db.close()
    }
  }, 20_000)
})
