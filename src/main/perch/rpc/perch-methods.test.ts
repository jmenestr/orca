import { describe, expect, it } from 'vitest'
import { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { RpcDispatcher } from '../../runtime/rpc/dispatcher'
import { PerchDb } from '../perch-db'
import { PerchService } from '../perch-service'

const FAKE_CONDUCTOR = `
const readline = require('readline')
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess_rpc' }) + '\\n')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const content = (msg && msg.message && msg.message.content) || ''
  process.stdout.write(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'echo:' + content } } }) + '\\n')
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }) + '\\n')
})
`

function req(method: string, params?: unknown) {
  return { id: `t-${method}`, authToken: 'test', method, params }
}

describe('perch RPC methods round-trip', () => {
  it('streams conductor frames over perch.conductor.subscribe after a perch.conductor.send', async () => {
    const runtime = new OrcaRuntimeService()
    const db = new PerchDb(':memory:')
    const service = new PerchService({
      db,
      firstmateDir: process.cwd(),
      command: process.execPath,
      baseArgs: ['-e', FAKE_CONDUCTOR]
    })
    runtime.setPerchService(service)
    const dispatcher = new RpcDispatcher({ runtime })

    const frames: Record<string, unknown>[] = []
    let resolveResult: () => void
    const resultSeen = new Promise<void>((resolve) => {
      resolveResult = resolve
    })

    // Subscribe first so live frames are captured.
    const streaming = dispatcher.dispatchStreaming(req('perch.conductor.subscribe'), (raw) => {
      const envelope = JSON.parse(raw) as { result?: { type?: string } }
      const result = envelope.result
      if (result) {
        frames.push(result as Record<string, unknown>)
        const inner = result as { type?: string; frame?: { kind?: string } }
        if (inner.type === 'frame' && inner.frame?.kind === 'result') {
          resolveResult()
        }
      }
    })

    // Give the subscribe handler a tick to register before sending.
    await new Promise((r) => setTimeout(r, 50))

    const sendResponse = await dispatcher.dispatch(
      req('perch.conductor.send', { text: 'hello rpc' })
    )
    expect(sendResponse.ok).toBe(true)

    try {
      await resultSeen

      // ready envelope arrived with a subscriptionId + persisted transcript shape.
      const ready = frames.find((f) => f.type === 'ready')
      expect(ready).toBeDefined()
      expect(typeof ready!.subscriptionId).toBe('string')

      // a session frame + a text frame echoing the sent turn.
      const session = frames.find(
        (f) => f.type === 'frame' && (f.frame as { kind?: string }).kind === 'session'
      )
      expect(session).toBeDefined()

      const textFrame = frames.find(
        (f) => f.type === 'frame' && (f.frame as { kind?: string }).kind === 'text'
      )
      expect((textFrame!.frame as { text: string }).text).toContain('hello rpc')

      // Resolve the streaming handler by cleaning up its subscription.
      const ready2 = frames.find((f) => f.type === 'ready') as { subscriptionId: string }
      runtime.cleanupSubscription(ready2.subscriptionId)
      await streaming.catch(() => {})
    } finally {
      service.kill()
      db.close()
    }
  }, 20_000)
})
