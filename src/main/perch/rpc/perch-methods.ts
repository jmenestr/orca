// Why: RPC surface for the Perch conductor. `perch.conductor.send` writes a
// plain-language user turn to the conductor subprocess; `perch.conductor.subscribe`
// is a long-lived stream that emits the conductor's stream-json frames. The
// streaming method mirrors runtime-client-events.ts: register a per-connection
// cleanup, emit a `ready` envelope, and resolve when the socket closes.
import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../../runtime/rpc/core'
import { requiredString } from '../../runtime/rpc/schemas'

import { PERCH_WORK_METHODS } from './perch-work-methods'

let perchSubscriptionSeq = 0

const ConductorSendParams = z.object({
  text: requiredString('Missing text')
})

export const PERCH_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'perch.conductor.send',
    params: ConductorSendParams,
    handler: async (params, { runtime }) => {
      // Why: give the conductor model a fresh fleet snapshot at the start of each
      // turn (plan 1b) by prepending it to the model's input — not as a captain-
      // facing transcript notice. Fleet deltas between turns reach the UI via
      // perch:workChanged; the next turn's snapshot reflects the latest state.
      const snapshot = runtime.getPerchFleetService().formatFleetSnapshotForTurn()
      await runtime.getPerchService().send(params.text, { modelPrefix: snapshot })
      return { ok: true }
    }
  }),

  defineMethod({
    name: 'perch.conductor.history',
    params: null,
    handler: (_params, { runtime }) => {
      // Why: the desktop Conductor view hydrates from the persisted transcript on
      // mount (the push bus only carries live frames), then streams on top.
      return { transcript: runtime.getPerchService().getTranscript() }
    }
  }),

  defineStreamingMethod({
    name: 'perch.conductor.subscribe',
    params: null,
    handler: async (_params, { runtime, connectionId }, emit) => {
      const service = runtime.getPerchService()
      await new Promise<void>((resolve) => {
        const unsubscribe = service.subscribe((frame) => {
          emit({ type: 'frame', frame })
        })

        const seq = ++perchSubscriptionSeq
        const subscriptionId = `perch-conductor-${connectionId ?? 'inproc'}-${seq}`
        runtime.registerSubscriptionCleanup(
          subscriptionId,
          () => {
            unsubscribe()
            emit({ type: 'end' })
            resolve()
          },
          connectionId
        )

        // Why: replay the persisted transcript so a fresh subscriber renders the
        // conductor history immediately, then stream live frames on top.
        emit({ type: 'ready', subscriptionId, transcript: service.getTranscript() })
      })
    }
  }),

  ...PERCH_WORK_METHODS
]
