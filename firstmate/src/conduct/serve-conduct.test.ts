import { describe, expect, it } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveConduct } from './serve-conduct.js'
import type { ConductFrame } from './frames.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FAKE_CLAUDE_SERVE = join(__dirname, 'fixtures', 'fake-claude-serve.mjs')

describe('serveConduct', () => {
  it('writes ndjson ConductFrames for each stdin turn', async () => {
    const lines: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk))
      return true
    }) as typeof process.stdout.write

    const originalStdin = process.stdin
    const { PassThrough } = await import('node:stream')
    const input = new PassThrough()
    Object.defineProperty(process, 'stdin', { value: input, configurable: true })

    const runPromise = serveConduct({
      harness: 'claude',
      format: 'ndjson',
      claudeCommand: 'node',
      claudeArgs: [FAKE_CLAUDE_SERVE]
    })

    input.write('ship dark\n')
    input.write('lets go\n')
    input.end()

    const exitCode = await runPromise
    process.stdout.write = originalWrite
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true })

    expect(exitCode).toBe(0)
    const frames = lines
      .join('')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ConductFrame)

    expect(frames.some((f) => f.kind === 'session')).toBe(true)
    expect(frames.filter((f) => f.kind === 'done')).toHaveLength(2)
    expect(frames.some((f) => f.kind === 'text')).toBe(true)
  })

  it('rejects unimplemented harnesses', async () => {
    await expect(serveConduct({ harness: 'codex' })).rejects.toThrow('not implemented')
  })
})
