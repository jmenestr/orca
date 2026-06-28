// Why: the renderer-side door to the Perch conductor. One-shot calls (send,
// history) go through window.api.perch.call (the runtime:call IPC door); live
// frames arrive on the perch:changed push channel (see use-perch-events). The
// frame union mirrors PerchService.PerchConductorFrame in main — kept as a small
// local copy so the renderer doesn't cross the main/renderer project boundary.

export type PerchConductorFrame =
  | { kind: 'session'; sessionId: string }
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'tool'; name: string }
  | { kind: 'result'; isError: boolean; result: string | null }
  | { kind: 'notice'; text: string }
  | { kind: 'error'; message: string }
  | { kind: 'exit'; code: number | null }

// A persisted conductor turn as returned by perch.conductor.history.
export type ConductorTurn = {
  id: number
  role: 'user' | 'assistant' | 'notice'
  text: string
  at: number
}

// A message as rendered in the Conductor chat. `streaming` marks the in-progress
// assistant turn whose text is still being assembled from text deltas.
export type ConductorMessage = {
  id: string
  role: 'user' | 'assistant' | 'notice'
  text: string
  streaming?: boolean
}

// Narrow an unknown push-bus payload into a typed frame (defensive: the IPC
// channel hands us `unknown`).
export function asConductorFrame(value: unknown): PerchConductorFrame | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return null
  }
  return value as PerchConductorFrame
}

export async function sendConductorMessage(text: string): Promise<void> {
  const response = await window.api.perch.call({
    method: 'perch.conductor.send',
    params: { text }
  })
  if (!response.ok) {
    throw new Error(response.error?.message ?? 'perch.conductor.send failed')
  }
}

export async function loadConductorHistory(): Promise<ConductorTurn[]> {
  const response = await window.api.perch.call({ method: 'perch.conductor.history' })
  if (!response.ok) {
    return []
  }
  const result = response.result as { transcript?: ConductorTurn[] } | undefined
  return result?.transcript ?? []
}
