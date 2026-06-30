export type IntegrationConfigFieldKind = 'secret' | 'config'

export type IntegrationConfigField = {
  id: string
  label: string
  kind: IntegrationConfigFieldKind
  placeholder?: string
  required?: boolean
}

export type IntegrationConfigProfileStatus = {
  profileId: string
  label: string
  connected: boolean
  config: Record<string, string>
  error?: string
}

export type IntegrationConfigConnectArgs = {
  profileId: string
  secrets?: Record<string, string>
  config?: Record<string, string>
}

export type IntegrationConfigValidateResult = {
  ok: boolean
  error?: string
  details?: Record<string, unknown>
}

export type IntegrationSessionInfo = {
  profileId: string
  runId: string
  expiresAt: number
}

export type IntegrationHttpRequest = {
  method: string
  path: string
  body?: unknown
  headers?: Record<string, string>
}

export type IntegrationHttpResponse = {
  status: number
  body: unknown
}

export type IntegrationConfigGetResult = {
  profileId: string
  label: string
  connected: boolean
  publicConfig: Record<string, string>
  secretFieldIds: string[]
  configFieldIds: string[]
}
