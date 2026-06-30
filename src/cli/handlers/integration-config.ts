import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'

export const INTEGRATION_CONFIG_HANDLERS: Record<string, CommandHandler> = {
  'integration config list': async ({ client, json }) => {
    const response = await client.call('integration.config.list', null)
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'integration config get': async ({ flags, client, json }) => {
    const profileId = getRequiredStringFlag(flags, 'profile')
    const response = await client.call('integration.config.get', {
      profileId,
      revealSecrets: flags.get('reveal-secrets') === true
    })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'integration config validate': async ({ flags, client, json }) => {
    const profileId = getRequiredStringFlag(flags, 'profile')
    const response = await client.call('integration.config.validate', { profileId })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'integration session start': async ({ flags, client, json }) => {
    const profileId = getRequiredStringFlag(flags, 'profile')
    const runId = getRequiredStringFlag(flags, 'run-id')
    const response = await client.call('integration.session.start', { profileId, runId })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'integration request': async ({ flags, client, json }) => {
    const profileId = getRequiredStringFlag(flags, 'profile')
    const method = getRequiredStringFlag(flags, 'method')
    const path = getRequiredStringFlag(flags, 'path')
    const runId = getOptionalStringFlag(flags, 'run-id')
    const response = await client.call('integration.request', {
      profileId,
      runId,
      method,
      path
    })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  }
}
