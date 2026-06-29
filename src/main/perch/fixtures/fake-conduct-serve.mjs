#!/usr/bin/env node
// Emits NDJSON ConductFrames for PerchService tests (no fm/claude required).

import { createInterface } from 'node:readline'

process.stdout.write(`${JSON.stringify({ kind: 'session', sessionId: 'sess_test' })}\n`)

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const text = line.trim()
  if (text.length === 0) {
    return
  }
  for (const word of text.split(/\s+/)) {
    process.stdout.write(`${JSON.stringify({ kind: 'text', delta: `${word} ` })}\n`)
  }
  process.stdout.write(`${JSON.stringify({ kind: 'done', exitCode: 0 })}\n`)
})
