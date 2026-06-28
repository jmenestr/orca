import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import {
  asConductorFrame,
  loadConductorHistory,
  sendConductorMessage,
  type ConductorMessage,
  type PerchConductorFrame
} from '@/perch/perch-client'

// Why: the Perch Conductor chat state. Frames stream in over the perch:changed
// push bus and are reduced into `conductorTranscript`; the in-progress assistant
// reply accumulates text deltas until its turn's `result` frame finalizes it.
export type PerchSlice = {
  conductorTranscript: ConductorMessage[]
  conductorStreaming: boolean
  openConductorPage: () => void
  closeConductorPage: () => void
  hydrateConductorTranscript: () => Promise<void>
  sendConductorTurn: (text: string) => Promise<void>
  applyConductorFrame: (frame: PerchConductorFrame | unknown) => void
}

// Why: a stable id for the streaming assistant turn so successive text deltas
// land on the same message; replaced once the turn finalizes. Avoids Date.now()
// collisions by combining a monotonic counter with the role.
let messageSeq = 0
function nextId(role: string): string {
  messageSeq += 1
  return `${role}-${messageSeq}`
}

export const createPerchSlice: StateCreator<AppState, [], [], PerchSlice> = (set, get) => ({
  conductorTranscript: [],
  conductorStreaming: false,

  openConductorPage: () => {
    set((state) => ({
      activeView: 'conductor',
      previousViewBeforeConductor:
        state.activeView === 'conductor' ? state.previousViewBeforeConductor : state.activeView
    }))
    void get().hydrateConductorTranscript()
  },

  closeConductorPage: () =>
    set((state) => ({
      activeView: state.previousViewBeforeConductor
    })),

  hydrateConductorTranscript: async () => {
    const turns = await loadConductorHistory()
    set({
      conductorTranscript: turns.map((t) => ({
        id: `hist-${t.id}`,
        role: t.role,
        text: t.text
      }))
    })
  },

  sendConductorTurn: async (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return
    }
    // Optimistically show the captain's turn; the streamed reply follows.
    set((state) => ({
      conductorTranscript: [
        ...state.conductorTranscript,
        { id: nextId('user'), role: 'user', text: trimmed }
      ],
      conductorStreaming: true
    }))
    try {
      await sendConductorMessage(trimmed)
    } catch (err) {
      set((state) => ({
        conductorTranscript: [
          ...state.conductorTranscript,
          {
            id: nextId('notice'),
            role: 'notice',
            text: `Failed to reach the conductor: ${err instanceof Error ? err.message : String(err)}`
          }
        ],
        conductorStreaming: false
      }))
    }
  },

  applyConductorFrame: (raw) => {
    const frame = asConductorFrame(raw)
    if (!frame) {
      return
    }
    set((state) => {
      const transcript = state.conductorTranscript
      switch (frame.kind) {
        case 'text': {
          // Append to the streaming assistant message, or start one.
          const last = transcript.at(-1)
          if (last && last.role === 'assistant' && last.streaming) {
            const updated = { ...last, text: last.text + frame.text }
            return { conductorTranscript: [...transcript.slice(0, -1), updated] }
          }
          return {
            conductorTranscript: [
              ...transcript,
              { id: nextId('assistant'), role: 'assistant', text: frame.text, streaming: true }
            ],
            conductorStreaming: true
          }
        }
        case 'result': {
          // Finalize the streaming assistant message.
          const last = transcript.at(-1)
          let next = transcript
          if (last && last.role === 'assistant' && last.streaming) {
            next = [...transcript.slice(0, -1), { ...last, streaming: false }]
          }
          return { conductorTranscript: next, conductorStreaming: false }
        }
        case 'notice':
        case 'error': {
          const text = frame.kind === 'notice' ? frame.text : `Error: ${frame.message}`
          return {
            conductorTranscript: [...transcript, { id: nextId('notice'), role: 'notice', text }]
          }
        }
        case 'session':
        case 'tool':
        case 'reasoning':
        case 'exit':
          // Status flavor only; no transcript change.
          return {}
      }
    })
  }
})
