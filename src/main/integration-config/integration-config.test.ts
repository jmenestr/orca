import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

describe('integration config store', () => {
  const previousHome = process.env.HOME
  let tempHome = ''

  afterEach(() => {
    process.env.HOME = previousHome
    if (tempHome) {
      rmSync(tempHome, { recursive: true, force: true })
    }
    vi.resetModules()
  })

  it('connects notion.budget and exposes public config', async () => {
    tempHome = mkdtempSync(join(tmpdir(), 'orca-integration-'))
    process.env.HOME = tempHome

    const { getIntegrationConfigService, resetIntegrationConfigServiceForTests } =
      await import('./service')
    const { resetIntegrationConfigStoreForTests } = await import('./store')
    resetIntegrationConfigServiceForTests()
    resetIntegrationConfigStoreForTests()

    const service = getIntegrationConfigService()
    service.connect({
      profileId: 'notion.budget',
      secrets: { token: 'secret-token' },
      config: { databaseId: 'db-123' }
    })

    const profile = service.getProfile('notion.budget')
    expect(profile.connected).toBe(true)
    expect(profile.publicConfig.databaseId).toBe('db-123')
    expect(profile.publicConfig.token).toBeUndefined()

    const env = service.buildPublicEnv(['notion.budget'])
    expect(env.ORCA_INTEGRATION_NOTION_BUDGET__DATABASE_ID).toBe('db-123')
  })
})
