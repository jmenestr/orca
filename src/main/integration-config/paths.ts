import { homedir } from 'node:os'
import { join } from 'node:path'

export function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

export function getIntegrationConfigDir(): string {
  return join(getOrcaDir(), 'integration-config')
}

export function getIntegrationConfigStorePath(): string {
  return join(getIntegrationConfigDir(), 'profiles.json')
}

export function getIntegrationSessionsDir(): string {
  return join(getOrcaDir(), 'integration-sessions')
}

export function getIntegrationSessionPath(runId: string): string {
  return join(getIntegrationSessionsDir(), `${runId}.json`)
}

export function profileEnvPrefix(profileId: string): string {
  return `ORCA_INTEGRATION_${profileId.replace(/\./g, '_').toUpperCase()}`
}

export function configKeyToEnvSuffix(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase()
}
