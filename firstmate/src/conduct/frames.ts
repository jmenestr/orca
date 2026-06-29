export type TextFrame = { kind: 'text'; delta: string }
// Why: the model's extended-thinking stream, kept distinct from `text` so the
// host can drop or separately display chain-of-thought instead of rendering it
// as the assistant's actual reply.
export type ReasoningFrame = { kind: 'reasoning'; delta: string }
export type ToolFrame = { kind: 'tool'; name: string; input?: unknown }
export type DoneFrame = { kind: 'done'; exitCode: number }
export type SessionFrame = { kind: 'session'; sessionId: string }
export type ErrorFrame = { kind: 'error'; message: string }

export type ConductFrame =
  | TextFrame
  | ReasoningFrame
  | ToolFrame
  | DoneFrame
  | SessionFrame
  | ErrorFrame
