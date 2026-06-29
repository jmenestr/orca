#!/usr/bin/env node
// Fake claude for multi-turn serve tests. Emits init once, then one turn per stdin line.

import { createInterface } from 'node:readline'

process.stdout.write(
  `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 'serve-session-1' })}\n`
)

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let content = ''
  try {
    const msg = JSON.parse(line)
    const blocks = msg?.message?.content
    if (Array.isArray(blocks) && blocks[0]?.text) {
      content = String(blocks[0].text)
    } else if (typeof msg?.message?.content === 'string') {
      content = msg.message.content
    }
  } catch {
    content = line
  }

  for (const word of content.split(/\s+/).filter(Boolean)) {
    process.stdout.write(
      `${JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: `${word} ` }
        }
      })}\n`
    )
  }

  process.stdout.write(
    `${JSON.stringify({ type: 'result', is_error: false, result: content || 'ok' })}\n`
  )
})
