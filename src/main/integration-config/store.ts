import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { safeStorage } from 'electron'
import {
  CredentialDecryptionError,
  credentialFileHasContent,
  readStoredCredentialToken
} from '../integration-credential-file'
import type { IntegrationCredentialService } from '../../shared/integration-credential-errors'
import { getIntegrationConfigDir, getIntegrationConfigStorePath } from './paths'
import { getIntegrationProfile } from './registry'

type StoredProfileRecord = {
  config: Record<string, string>
  secretCiphertext?: string
}

type IntegrationConfigStoreFile = {
  version: 1
  profiles: Record<string, StoredProfileRecord>
}

const SERVICE_BY_PROFILE: Record<string, IntegrationCredentialService> = {
  'notion.budget': 'Notion Budget'
}

function emptyStore(): IntegrationConfigStoreFile {
  return { version: 1, profiles: {} }
}

function readStoreFile(): IntegrationConfigStoreFile {
  const path = getIntegrationConfigStorePath()
  if (!existsSync(path)) {
    return emptyStore()
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as IntegrationConfigStoreFile
    if (parsed.version !== 1 || typeof parsed.profiles !== 'object') {
      return emptyStore()
    }
    return parsed
  } catch {
    return emptyStore()
  }
}

function writeStoreFile(store: IntegrationConfigStoreFile): void {
  const dir = getIntegrationConfigDir()
  mkdirSync(dir, { recursive: true })
  const path = getIntegrationConfigStorePath()
  writeFileSync(path, JSON.stringify(store, null, 2), 'utf8')
  try {
    chmodSync(path, 0o600)
  } catch {
    // Best effort on Windows.
  }
}

function serviceForProfile(profileId: string): IntegrationCredentialService {
  return SERVICE_BY_PROFILE[profileId] ?? 'Notion Budget'
}

function encryptSecret(value: string): Buffer {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value)
  }
  return Buffer.from(value, 'utf8')
}

function decryptSecret(profileId: string, raw: Buffer | undefined): string | null {
  if (!raw || raw.length === 0) {
    return null
  }
  return readStoredCredentialToken(serviceForProfile(profileId), raw)
}

export class IntegrationConfigStore {
  private store = readStoreFile()
  private secretCache = new Map<string, string>()
  private credentialErrors = new Map<string, string>()

  listProfileIds(): string[] {
    return Object.keys(this.store.profiles)
  }

  getPublicConfig(profileId: string): Record<string, string> {
    return { ...this.store.profiles[profileId]?.config }
  }

  getStatus(profileId: string): {
    connected: boolean
    config: Record<string, string>
    error?: string
  } {
    const profile = getIntegrationProfile(profileId)
    if (!profile) {
      return { connected: false, config: {}, error: 'Unknown profile.' }
    }
    const record = this.store.profiles[profileId]
    const config = { ...record?.config }
    const credentialError = this.credentialErrors.get(profileId)
    if (credentialError) {
      return { connected: false, config, error: credentialError }
    }
    const secret = this.readSecret(profileId)
    const requiredConfig = profile.fields.filter(
      (field) => field.kind === 'config' && field.required
    )
    const configReady = requiredConfig.every((field) => Boolean(config[field.id]?.trim()))
    return { connected: Boolean(secret) && configReady, config }
  }

  readSecret(profileId: string): string | null {
    if (this.secretCache.has(profileId)) {
      return this.secretCache.get(profileId) ?? null
    }
    const record = this.store.profiles[profileId]
    if (!record?.secretCiphertext) {
      return null
    }
    try {
      const raw = Buffer.from(record.secretCiphertext, 'base64')
      if (!credentialFileHasContent(getIntegrationConfigStorePath()) && raw.length === 0) {
        return null
      }
      const token = decryptSecret(profileId, raw)
      if (token) {
        this.secretCache.set(profileId, token)
      }
      return token
    } catch (error) {
      const message =
        error instanceof CredentialDecryptionError
          ? error.message
          : 'Could not read stored credential.'
      this.credentialErrors.set(profileId, message)
      return null
    }
  }

  connect(
    profileId: string,
    args: { secrets?: Record<string, string>; config?: Record<string, string> }
  ): void {
    const profile = getIntegrationProfile(profileId)
    if (!profile) {
      throw new Error(`Unknown integration profile: ${profileId}`)
    }
    const existing = this.store.profiles[profileId] ?? { config: {} }
    const config = { ...existing.config, ...args.config }
    let secretCiphertext = existing.secretCiphertext
    const token = args.secrets?.token?.trim()
    if (token) {
      secretCiphertext = encryptSecret(token).toString('base64')
      this.secretCache.set(profileId, token)
      this.credentialErrors.delete(profileId)
    }
    this.store.profiles[profileId] = { config, secretCiphertext }
    writeStoreFile(this.store)
  }

  disconnect(profileId: string): void {
    delete this.store.profiles[profileId]
    this.secretCache.delete(profileId)
    this.credentialErrors.delete(profileId)
    writeStoreFile(this.store)
  }

  getSecrets(profileId: string): Record<string, string> {
    const token = this.readSecret(profileId)
    return token ? { token } : {}
  }
}

let singleton: IntegrationConfigStore | null = null

export function getIntegrationConfigStore(): IntegrationConfigStore {
  if (!singleton) {
    singleton = new IntegrationConfigStore()
  }
  return singleton
}

export function resetIntegrationConfigStoreForTests(): void {
  singleton = null
}
