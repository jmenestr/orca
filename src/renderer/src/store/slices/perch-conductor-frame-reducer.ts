import type { ConductorMessage, PerchConductorFrame } from '@/perch/perch-client'

export function reduceConductorFrame(
  transcript: ConductorMessage[],
  frame: PerchConductorFrame,
  nextId: (role: string) => string
): {
  conductorTranscript?: ConductorMessage[]
  conductorStreaming?: boolean
} {
  switch (frame.kind) {
    case 'text': {
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
      const ref = frame.kind === 'notice' ? (frame.ref ?? null) : null
      return {
        conductorTranscript: [...transcript, { id: nextId('notice'), role: 'notice', text, ref }]
      }
    }
    case 'session':
    case 'tool':
    case 'reasoning':
    case 'exit':
      return {}
  }
}
