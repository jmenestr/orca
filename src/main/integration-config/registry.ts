import type {
  IntegrationConfigField,
  IntegrationConfigValidateResult,
  IntegrationHttpRequest,
  IntegrationHttpResponse
} from '../../shared/integration-config/types'
import {
  NOTION_BUDGET_FIELDS,
  NOTION_BUDGET_PROFILE_ID,
  notionBudgetRequest,
  validateNotionBudgetConnection
} from './profiles/notion-budget'

export type IntegrationConfigProfileDefinition = {
  id: string
  label: string
  fields: IntegrationConfigField[]
  validateConnection: (
    config: Record<string, string>,
    secrets: Record<string, string>
  ) => Promise<IntegrationConfigValidateResult>
  request: (
    config: Record<string, string>,
    secrets: Record<string, string>,
    http: IntegrationHttpRequest
  ) => Promise<IntegrationHttpResponse>
}

const PROFILES: IntegrationConfigProfileDefinition[] = [
  {
    id: NOTION_BUDGET_PROFILE_ID,
    label: 'Notion budget',
    fields: NOTION_BUDGET_FIELDS,
    validateConnection: async (config, secrets) =>
      validateNotionBudgetConnection({
        token: secrets.token ?? '',
        databaseId: config.databaseId ?? ''
      }),
    request: async (config, secrets, http) => {
      const token = secrets.token ?? ''
      if (!token) {
        return { status: 401, body: { error: 'Not connected.' } }
      }
      const result = await notionBudgetRequest({
        token,
        method: http.method,
        path: http.path,
        body: http.body,
        headers: http.headers
      })
      return result
    }
  }
]

export function listIntegrationProfiles(): IntegrationConfigProfileDefinition[] {
  return PROFILES
}

export function getIntegrationProfile(
  profileId: string
): IntegrationConfigProfileDefinition | null {
  return PROFILES.find((profile) => profile.id === profileId) ?? null
}
