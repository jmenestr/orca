import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PerchDb } from './perch-db'
import { PerchService, type PerchConductorFrame } from './perch-service'
import { resolveFirstmateDir } from './perch-service'

const FAKE_CONDUCT_SERVE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures',
  'fake-conduct-serve.mjs'
)

function makeService(db: PerchDb): PerchService {
  return new PerchService({
    db,
    firstmateDir: resolveFirstmateDir(),
    command: process.execPath,
    spawnArgs: [FAKE_CONDUCT_SERVE]
  })
}

describe('PerchService conductor subprocess', () => {
  it('launches fm conduct serve and streams a turn back as frames', async () => {
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

      expect(frames.some((f) => f.kind === 'session' && f.sessionId === 'sess_test')).toBe(true)

      const streamed = frames
        .filter((f): f is { kind: 'text'; text: string } => f.kind === 'text')
        .map((f) => f.text)
        .join('')
      expect(streamed).toContain('ship')
      expect(streamed).toContain('dark')
      expect(streamed).toContain('mode')

      expect(frames.some((f) => f.kind === 'result' && f.isError === false)).toBe(true)

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
