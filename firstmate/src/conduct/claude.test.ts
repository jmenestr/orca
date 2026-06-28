import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ClaudeAdapter } from './adapters/claude.js'
import type { ConductFrame } from './frames.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FAKE_CLAUDE = join(__dirname, 'fixtures', 'fake-claude.mjs')

async function collectFrames(adapter: ClaudeAdapter, prompt: string, options?: { sessionId?: string }): Promise<ConductFrame[]> {
  const frames: ConductFrame[] = []
  for await (const frame of adapter.run(prompt, options)) {
    frames.push(frame)
  }
  return frames
}

describe('ClaudeAdapter', () => {
  it('yields session, text, tool, and done frames from fake claude', async () => {
    const adapter = new ClaudeAdapter({ command: 'node', args: [FAKE_CLAUDE] })
    const frames = await collectFrames(adapter, 'hello')

    const sessionFrames = frames.filter((f) => f.kind === 'session')
    const textFrames = frames.filter((f) => f.kind === 'text')
    const toolFrames = frames.filter((f) => f.kind === 'tool')
    const doneFrames = frames.filter((f) => f.kind === 'done')

    expect(sessionFrames).toHaveLength(1)
    expect(sessionFrames[0]).toMatchObject({ kind: 'session', sessionId: 'test-session-1' })

    expect(textFrames).toHaveLength(1)
    expect(textFrames[0]).toMatchObject({ kind: 'text', delta: 'hello from fake claude' })

    expect(toolFrames).toHaveLength(1)
    expect(toolFrames[0]).toMatchObject({ kind: 'tool', name: 'bash' })

    expect(doneFrames).toHaveLength(1)
    expect(doneFrames[0]).toMatchObject({ kind: 'done', exitCode: 0 })
  })

  it('done frame is always the last frame', async () => {
    const adapter = new ClaudeAdapter({ command: 'node', args: [FAKE_CLAUDE] })
    const frames = await collectFrames(adapter, 'hello')
    expect(frames.at(-1)?.kind).toBe('done')
  })

  it('passes --resume <id> to subprocess when sessionId is given', async () => {
    const adapter = new ClaudeAdapter({ command: 'node', args: [FAKE_CLAUDE] })
    const frames = await collectFrames(adapter, 'hello', { sessionId: 'ses_123' })

    const textFrame = frames.find((f) => f.kind === 'text')
    expect(textFrame).toMatchObject({ kind: 'text', delta: 'resumed:ses_123' })
  })

  it('does not include --resume when no sessionId is given', async () => {
    const adapter = new ClaudeAdapter({ command: 'node', args: [FAKE_CLAUDE] })
    const frames = await collectFrames(adapter, 'hello')

    const textFrame = frames.find((f) => f.kind === 'text')
    expect(textFrame).toMatchObject({ kind: 'text', delta: 'hello from fake claude' })
  })

  it('kill() terminates the in-progress run', async () => {
    const adapter = new ClaudeAdapter({ command: 'node', args: [FAKE_CLAUDE] })
    let frameCount = 0
    for await (const frame of adapter.run('hello')) {
      frameCount++
      if (frame.kind === 'session') {
        adapter.kill()
        break
      }
    }
    expect(frameCount).toBeGreaterThan(0)
  })
})
