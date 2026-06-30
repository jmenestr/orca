import type {
  IntegrationConfigConnectArgs,
  IntegrationConfigGetResult,
  IntegrationConfigProfileStatus,
  IntegrationConfigValidateResult,
  IntegrationHttpRequest,
  IntegrationHttpResponse,
  IntegrationSessionInfo
} from '../../shared/integration-config/types'
import { profileEnvPrefix, configKeyToEnvSuffix } from './paths'
import { getIntegrationProfile, listIntegrationProfiles } from './registry'
import { getIntegrationConfigStore } from './store'
import { resolveIntegrationSession, startIntegrationSession } from './session'

export class IntegrationConfigService {
  listProfiles(): IntegrationConfigProfileStatus[] {
    return listIntegrationProfiles().map((profile) => {
      const status = getIntegrationConfigStore().getStatus(profile.id)
      return {
        profileId: profile.id,
        label: profile.label,
        connected: status.connected,
        config: status.config,
        error: status.error
      }
    })
  }

  getProfile(profileId: string, revealSecrets = false): IntegrationConfigGetResult {
    const profile = getIntegrationProfile(profileId)
    if (!profile) {
      throw new Error(`Unknown integration profile: ${profileId}`)
    }
    const status = getIntegrationConfigStore().getStatus(profileId)
    const publicConfig = { ...status.config }
    if (revealSecrets) {
      const secrets = getIntegrationConfigStore().getSecrets(profileId)
      for (const field of profile.fields.filter((entry) => entry.kind === 'secret')) {
        if (secrets[field.id]) {
          publicConfig[field.id] = secrets[field.id]
        }
      }
    }
    return {
      profileId: profile.id,
      label: profile.label,
      connected: status.connected,
      publicConfig,
      secretFieldIds: profile.fields
        .filter((field) => field.kind === 'secret')
        .map((field) => field.id),
      configFieldIds: profile.fields
        .filter((field) => field.kind === 'config')
        .map((field) => field.id)
    }
  }

  connect(args: IntegrationConfigConnectArgs): IntegrationConfigProfileStatus {
    getIntegrationConfigStore().connect(args.profileId, {
      secrets: args.secrets,
      config: args.config
    })
    return this.listProfiles().find((profile) => profile.profileId === args.profileId)!
  }

  disconnect(profileId: string): void {
    getIntegrationConfigStore().disconnect(profileId)
  }

  async validateConnection(profileId: string): Promise<IntegrationConfigValidateResult> {
    const profile = getIntegrationProfile(profileId)
    if (!profile) {
      return { ok: false, error: 'Unknown profile.' }
    }
    const store = getIntegrationConfigStore()
    const config = store.getPublicConfig(profileId)
    const secrets = store.getSecrets(profileId)
    return profile.validateConnection(config, secrets)
  }

  buildPublicEnv(profileIds: string[]): Record<string, string> {
    const env: Record<string, string> = {}
    const store = getIntegrationConfigStore()
    for (const profileId of profileIds) {
      const prefix = profileEnvPrefix(profileId)
      const config = store.getPublicConfig(profileId)
      for (const [key, value] of Object.entries(config)) {
        env[`${prefix}__${configKeyToEnvSuffix(key)}`] = value
      }
    }
    return env
  }

  ensureProfilesConnected(profileIds: string[]): string[] {
    const missing: string[] = []
    const store = getIntegrationConfigStore()
    for (const profileId of profileIds) {
      const status = store.getStatus(profileId)
      if (!status.connected) {
        missing.push(profileId)
      }
    }
    return missing
  }

  startSession(profileId: string, runId: string): IntegrationSessionInfo {
    const status = getIntegrationConfigStore().getStatus(profileId)
    if (!status.connected) {
      throw new Error(`Integration profile ${profileId} is not connected.`)
    }
    return startIntegrationSession(profileId, runId)
  }

  async request(
    profileId: string,
    runId: string | null,
    http: IntegrationHttpRequest
  ): Promise<IntegrationHttpResponse> {
    const profile = getIntegrationProfile(profileId)
    if (!profile) {
      throw new Error(`Unknown integration profile: ${profileId}`)
    }
    if (runId) {
      const session = resolveIntegrationSession(profileId, runId)
      if (!session) {
        throw new Error(`No active integration session for run ${runId}.`)
      }
    }
    const store = getIntegrationConfigStore()
    const config = store.getPublicConfig(profileId)
    const secrets = store.getSecrets(profileId)
    if (!secrets.token && profile.fields.some((field) => field.kind === 'secret')) {
      throw new Error(`Integration profile ${profileId} is not connected.`)
    }
    return profile.request(config, secrets, http)
  }
}

let singleton: IntegrationConfigService | null = null

export function getIntegrationConfigService(): IntegrationConfigService {
  if (!singleton) {
    singleton = new IntegrationConfigService()
  }
  return singleton
}

export function resetIntegrationConfigServiceForTests(): void {
  singleton = null
}
