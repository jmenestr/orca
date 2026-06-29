// Why: thin client the conductor's `fm perch` commands use to reach Orca's main
// process over the local PerchConductorBridge (port + token come from the env
// PerchService injects into the conductor subprocess).

export type PerchBridgeConfig = {
  port: string
  token: string
}

export type DispatchRequest = {
  repoSelector: string
  title: string
  brief?: string
  startupAgent?: string
}

export function readBridgeConfig(env: NodeJS.ProcessEnv = process.env): PerchBridgeConfig {
  const port = env.PERCH_BRIDGE_PORT
  const token = env.PERCH_BRIDGE_TOKEN
  if (!port || !token) {
    throw new Error(
      'perch bridge unavailable: PERCH_BRIDGE_PORT/PERCH_BRIDGE_TOKEN not set (run inside the Orca conductor)'
    )
  }
  return { port, token }
}

async function bridgeFetch<T>(
  config: PerchBridgeConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown }
): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${config.port}${path}`, {
    method: init.method,
    headers: {
      'content-type': 'application/json',
      'x-perch-bridge-token': config.token
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  })
  const text = await response.text()
  const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : {}
  if (!response.ok) {
    const message =
      typeof parsed === 'object' && parsed !== null && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `perch bridge ${path} failed (${response.status})`
    throw new Error(message)
  }
  return parsed as T
}

export function listRepos(config: PerchBridgeConfig): Promise<{ repos: unknown[] }> {
  return bridgeFetch(config, '/repos', { method: 'GET' })
}

export function listFleet(config: PerchBridgeConfig): Promise<{ items: unknown[] }> {
  return bridgeFetch(config, '/list', { method: 'GET' })
}

export function dispatchWork(
  config: PerchBridgeConfig,
  request: DispatchRequest
): Promise<{ task: unknown; run: unknown; worktreeId: string }> {
  return bridgeFetch(config, '/dispatch', { method: 'POST', body: request })
}
