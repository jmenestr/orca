import type { ConductFrame } from '../frames.js'
import type { HarnessAdapter, RunOptions } from '../adapter.js'

export class CodexAdapter implements HarnessAdapter {
  run(_prompt: string, _options?: RunOptions): AsyncIterable<ConductFrame> {
    throw new Error('not implemented')
  }

  async send(_text: string): Promise<void> {
    throw new Error('not implemented')
  }

  kill(): void {
    throw new Error('not implemented')
  }
}
