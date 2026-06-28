import type { ConductFrame } from './frames.js'

export type RunOptions = {
  sessionId?: string
  cwd?: string
  env?: Record<string, string>
}

export type HarnessAdapter = {
  run(prompt: string, options?: RunOptions): AsyncIterable<ConductFrame>
  send(text: string): Promise<void>
  kill(): void
}
