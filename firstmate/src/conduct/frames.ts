export type TextFrame = { kind: 'text'; delta: string }
export type ToolFrame = { kind: 'tool'; name: string; input?: unknown }
export type DoneFrame = { kind: 'done'; exitCode: number }
export type SessionFrame = { kind: 'session'; sessionId: string }
export type ErrorFrame = { kind: 'error'; message: string }

export type ConductFrame = TextFrame | ToolFrame | DoneFrame | SessionFrame | ErrorFrame
