import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { RpcDispatcher } from '../../runtime/rpc/dispatcher'
import { PerchDb } from '../perch-db'
import { PerchFleetService } from '../perch-fleet-service'
import { PerchService } from '../perch-service'

const FAKE_CONDUCT_SERVE = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'fixtures',
  'fake-conduct-serve.mjs'
)

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
      spawnArgs: [FAKE_CONDUCT_SERVE]
    })
    runtime.setPerchService(service)
    runtime.setPerchFleetService(
      new PerchFleetService({
        db,
        getPerchService: () => service,
        getRuntime: () => runtime
      })
    )
    const dispatcher = new RpcDispatcher({ runtime })

    const frames: Record<string, unknown>[] = []
    let resolveResult: () => void
    const resultSeen = new Promise<void>((resolve) => {
      resolveResult = resolve
    })

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

    await new Promise((r) => setTimeout(r, 50))

    const sendResponse = await dispatcher.dispatch(
      req('perch.conductor.send', { text: 'hello rpc' })
    )
    expect(sendResponse.ok).toBe(true)

    try {
      await resultSeen

      const ready = frames.find((f) => f.type === 'ready')
      expect(ready).toBeDefined()
      expect(typeof ready!.subscriptionId).toBe('string')

      const session = frames.find(
        (f) => f.type === 'frame' && (f.frame as { kind?: string }).kind === 'session'
      )
      expect(session).toBeDefined()

      const textFrame = frames.find(
        (f) => f.type === 'frame' && (f.frame as { kind?: string }).kind === 'text'
      )
      expect((textFrame!.frame as { text: string }).text).toContain('hello')

      const ready2 = frames.find((f) => f.type === 'ready') as { subscriptionId: string }
      runtime.cleanupSubscription(ready2.subscriptionId)
      await streaming.catch(() => {})
    } finally {
      service.kill()
      db.close()
    }
  }, 20_000)
})
