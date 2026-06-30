import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { IntegrationSessionInfo } from '../../shared/integration-config/types'
import { getIntegrationSessionPath, getIntegrationSessionsDir } from './paths'

const SESSION_TTL_MS = 4 * 60 * 60 * 1000

type IntegrationSessionFile = {
  version: 1
  profileId: string
  runId: string
  handle: string
  createdAt: number
  expiresAt: number
}

function readSession(runId: string): IntegrationSessionFile | null {
  const path = getIntegrationSessionPath(runId)
  if (!existsSync(path)) {
    return null
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as IntegrationSessionFile
    if (parsed.version !== 1) {
      return null
    }
    if (Date.now() > parsed.expiresAt) {
      unlinkSync(path)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: IntegrationSessionFile): void {
  mkdirSync(getIntegrationSessionsDir(), { recursive: true })
  const path = getIntegrationSessionPath(session.runId)
  writeFileSync(path, JSON.stringify(session, null, 2), 'utf8')
  try {
    chmodSync(path, 0o600)
  } catch {
    // Best effort on Windows.
  }
}

export function startIntegrationSession(profileId: string, runId: string): IntegrationSessionInfo {
  const session: IntegrationSessionFile = {
    version: 1,
    profileId,
    runId,
    handle: randomUUID(),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  }
  writeSession(session)
  return { profileId, runId, expiresAt: session.expiresAt }
}

export function resolveIntegrationSession(
  profileId: string,
  runId: string
): IntegrationSessionFile | null {
  const session = readSession(runId)
  if (!session || session.profileId !== profileId) {
    return null
  }
  return session
}
