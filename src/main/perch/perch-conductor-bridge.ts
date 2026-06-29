// Why: the conductor subprocess (claude) cannot reach Orca's renderer RPC. This
// local HTTP bridge mirrors the agent-hooks pattern (127.0.0.1:0 + token in env)
// so the conductor's `fm perch` CLI can dispatch agents and read the fleet
// through Orca's main process — the Orca-native spawn path (worktree.create),
// not Claude bash → fm-spawn.sh.
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { PerchFleetService, WorkDispatchInput } from './perch-fleet-service'
import { listWorkspaceRepos, resolveWorkspaceSelector } from './perch-workspace-catalog'

const TOKEN_HEADER = 'x-perch-bridge-token'

export type PerchConductorBridgeOptions = {
  getRuntime: () => OrcaRuntimeService
  getFleet: () => PerchFleetService
}

export type PerchBridgeEnv = {
  PERCH_BRIDGE_PORT: string
  PERCH_BRIDGE_TOKEN: string
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) {
    return {}
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim().length === 0) {
    return {}
  }
  return JSON.parse(raw)
}

export class PerchConductorBridge {
  private readonly getRuntime: () => OrcaRuntimeService
  private readonly getFleet: () => PerchFleetService
  private readonly token = randomUUID()
  private server: Server | null = null
  private port: number | null = null
  private listening: Promise<{ port: number; token: string }> | null = null

  constructor(options: PerchConductorBridgeOptions) {
    this.getRuntime = options.getRuntime
    this.getFleet = options.getFleet
  }

  ensureListening(): Promise<{ port: number; token: string }> {
    if (this.listening) {
      return this.listening
    }
    this.listening = new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res)
      })
      server.on('error', reject)
      // Why: bind to loopback only; the token guards against other local procs.
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') {
          reject(new Error('perch bridge failed to bind a port'))
          return
        }
        this.server = server
        this.port = address.port
        resolve({ port: address.port, token: this.token })
      })
    })
    return this.listening
  }

  env(): PerchBridgeEnv | null {
    if (this.port === null) {
      return null
    }
    return { PERCH_BRIDGE_PORT: String(this.port), PERCH_BRIDGE_TOKEN: this.token }
  }

  close(): void {
    this.server?.close()
    this.server = null
    this.port = null
    this.listening = null
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (req.headers[TOKEN_HEADER] !== this.token) {
        this.send(res, 401, { error: 'unauthorized' })
        return
      }
      const url = req.url ?? '/'
      if (req.method === 'GET' && url === '/repos') {
        const repos = await listWorkspaceRepos(this.getRuntime())
        this.send(res, 200, { repos })
        return
      }
      if (req.method === 'GET' && url === '/list') {
        this.send(res, 200, { items: this.getFleet().listWork() })
        return
      }
      if (req.method === 'POST' && url === '/resolve') {
        const body = (await readJsonBody(req)) as { selector?: string }
        if (!body.selector) {
          this.send(res, 400, { error: 'missing selector' })
          return
        }
        const resolved = await resolveWorkspaceSelector(this.getRuntime(), body.selector)
        this.send(res, 200, resolved)
        return
      }
      if (req.method === 'POST' && url === '/dispatch') {
        const body = (await readJsonBody(req)) as Partial<WorkDispatchInput>
        if (!body.repoSelector || !body.title) {
          this.send(res, 400, { error: 'missing repoSelector or title' })
          return
        }
        // Why: dispatch is a rare control-plane event; always log it so the dev
        // console shows when the conductor actually spawns an Orca agent.
        console.log(`[perch-bridge] dispatch repo=${body.repoSelector} title=${body.title}`)
        const result = await this.getFleet().dispatchWork({
          repoSelector: body.repoSelector,
          title: body.title,
          brief: body.brief,
          harness: body.harness,
          kind: body.kind,
          landing: body.landing,
          name: body.name,
          startupPrompt: body.startupPrompt,
          startupAgent: body.startupAgent
        })
        console.log(
          `[perch-bridge] dispatch ok worktree=${result.worktreeId} task=${result.task.id}`
        )
        this.send(res, 200, result)
        return
      }
      this.send(res, 404, { error: 'not found' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[perch-bridge] ${req.method} ${req.url} failed: ${message}`)
      this.send(res, 500, { error: message })
    }
  }

  private send(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(payload)
  }
}
