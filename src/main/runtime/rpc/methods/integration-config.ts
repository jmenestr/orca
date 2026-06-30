import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'
import { getIntegrationConfigService } from '../../../integration-config/service'

const ProfileIdParams = z.object({
  profileId: requiredString('Missing profileId')
})

const ConnectParams = z.object({
  profileId: requiredString('Missing profileId'),
  secrets: z.record(z.string()).optional(),
  config: z.record(z.string()).optional()
})

const SessionStartParams = z.object({
  profileId: requiredString('Missing profileId'),
  runId: requiredString('Missing runId')
})

const RequestParams = z.object({
  profileId: requiredString('Missing profileId'),
  runId: z.string().optional(),
  method: requiredString('Missing method'),
  path: requiredString('Missing path'),
  body: z.unknown().optional(),
  headers: z.record(z.string()).optional()
})

const GetConfigParams = z.object({
  profileId: requiredString('Missing profileId'),
  revealSecrets: z.boolean().optional()
})

export const INTEGRATION_CONFIG_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'integration.config.list',
    params: null,
    handler: async () => ({ profiles: getIntegrationConfigService().listProfiles() })
  }),
  defineMethod({
    name: 'integration.config.get',
    params: GetConfigParams,
    handler: async (params) =>
      getIntegrationConfigService().getProfile(params.profileId, params.revealSecrets === true)
  }),
  defineMethod({
    name: 'integration.config.connect',
    params: ConnectParams,
    handler: async (params) => getIntegrationConfigService().connect(params)
  }),
  defineMethod({
    name: 'integration.config.disconnect',
    params: ProfileIdParams,
    handler: async (params) => {
      getIntegrationConfigService().disconnect(params.profileId)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'integration.config.validate',
    params: ProfileIdParams,
    handler: async (params) => getIntegrationConfigService().validateConnection(params.profileId)
  }),
  defineMethod({
    name: 'integration.session.start',
    params: SessionStartParams,
    handler: async (params) =>
      getIntegrationConfigService().startSession(params.profileId, params.runId)
  }),
  defineMethod({
    name: 'integration.request',
    params: RequestParams,
    handler: async (params) =>
      getIntegrationConfigService().request(params.profileId, params.runId ?? null, {
        method: params.method,
        path: params.path,
        body: params.body,
        headers: params.headers
      })
  })
]
