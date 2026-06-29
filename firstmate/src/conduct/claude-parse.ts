import type { ConductFrame } from './frames.js'

function parseStreamEvent(event: Record<string, unknown>): ConductFrame | null {
  const eventType = event.type

  if (eventType === 'content_block_start') {
    const block = event.content_block as Record<string, unknown> | undefined
    if (block?.type === 'tool_use' && typeof block.name === 'string') {
      return { kind: 'tool', name: block.name }
    }
    return null
  }

  if (eventType === 'content_block_delta') {
    const delta = event.delta as Record<string, unknown> | undefined
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return { kind: 'text', delta: delta.text }
    }
    if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
      return { kind: 'reasoning', delta: delta.thinking }
    }
    return null
  }

  return null
}

export function parseClaudeStreamJsonLine(line: string): ConductFrame[] {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(line) as Record<string, unknown>
  } catch {
    return [{ kind: 'error', message: `unparseable output: ${line.slice(0, 120)}` }]
  }

  const type = obj.type

  if (type === 'system') {
    const sessionId = typeof obj.session_id === 'string' ? obj.session_id : null
    return sessionId ? [{ kind: 'session', sessionId }] : []
  }

  if (type === 'stream_event') {
    const event = obj.event as Record<string, unknown> | undefined
    if (!event) {
      return []
    }
    const frame = parseStreamEvent(event)
    return frame ? [frame] : []
  }

  if (type === 'result') {
    const isError = obj.is_error === true
    return [{ kind: 'done', exitCode: isError ? 1 : 0 }]
  }

  return []
}

export function buildClaudeUserMessage(prompt: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: prompt }] }
  })
}
