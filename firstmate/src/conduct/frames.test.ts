import { describe, it, expect } from 'vitest'
import type { ConductFrame, TextFrame, ToolFrame, DoneFrame, SessionFrame, ErrorFrame } from './frames.js'

describe('ConductFrame types', () => {
  it('TextFrame has kind text and delta string', () => {
    const frame: TextFrame = { kind: 'text', delta: 'hello' }
    expect(frame.kind).toBe('text')
    expect(frame.delta).toBe('hello')
  })

  it('ToolFrame has kind tool and name', () => {
    const frame: ToolFrame = { kind: 'tool', name: 'bash' }
    expect(frame.kind).toBe('tool')
    expect(frame.name).toBe('bash')
  })

  it('ToolFrame accepts optional input', () => {
    const frame: ToolFrame = { kind: 'tool', name: 'bash', input: { cmd: 'ls' } }
    expect(frame.input).toEqual({ cmd: 'ls' })
  })

  it('DoneFrame has kind done and exitCode number', () => {
    const frame: DoneFrame = { kind: 'done', exitCode: 0 }
    expect(frame.kind).toBe('done')
    expect(frame.exitCode).toBe(0)
  })

  it('SessionFrame has kind session and sessionId string', () => {
    const frame: SessionFrame = { kind: 'session', sessionId: 'ses_abc' }
    expect(frame.kind).toBe('session')
    expect(frame.sessionId).toBe('ses_abc')
  })

  it('ErrorFrame has kind error and message string', () => {
    const frame: ErrorFrame = { kind: 'error', message: 'something went wrong' }
    expect(frame.kind).toBe('error')
    expect(frame.message).toBe('something went wrong')
  })

  it('ConductFrame union covers all variants', () => {
    const frames: ConductFrame[] = [
      { kind: 'text', delta: 'x' },
      { kind: 'tool', name: 'bash' },
      { kind: 'done', exitCode: 1 },
      { kind: 'session', sessionId: 's1' },
      { kind: 'error', message: 'err' },
    ]
    const kinds = frames.map((f) => f.kind)
    expect(kinds).toEqual(['text', 'tool', 'done', 'session', 'error'])
  })
})
