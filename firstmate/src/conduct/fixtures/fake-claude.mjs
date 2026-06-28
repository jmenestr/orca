#!/usr/bin/env node
// Fake claude subprocess for ClaudeAdapter tests.
// Emits canned stream-json frames then exits cleanly.

const args = process.argv.slice(2)
const resumeIdx = args.indexOf('--resume')
const resumeId = resumeIdx !== -1 ? args[resumeIdx + 1] : null

process.stdout.write(
  `${JSON.stringify({ type: 'system', session_id: 'test-session-1' })}\n`,
)

const text = resumeId ? `resumed:${resumeId}` : 'hello from fake claude'

process.stdout.write(
  `${JSON.stringify({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
  })}\n`,
)

process.stdout.write(
  `${JSON.stringify({
    type: 'stream_event',
    event: {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'tool_1', name: 'bash', input: {} },
    },
  })}\n`,
)

process.stdout.write(
  `${JSON.stringify({ type: 'result', result: 'done', is_error: false })}\n`,
)
