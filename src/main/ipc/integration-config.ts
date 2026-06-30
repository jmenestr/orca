import { ipcMain } from 'electron'
import { getIntegrationConfigService } from '../integration-config/service'

export function registerIntegrationConfigHandlers(): void {
  const service = () => getIntegrationConfigService()

  ipcMain.handle('integrationConfig:list', async () => ({ profiles: service().listProfiles() }))

  ipcMain.handle(
    'integrationConfig:get',
    async (_event, args: { profileId: string; revealSecrets?: boolean }) =>
      service().getProfile(args.profileId, args.revealSecrets === true)
  )

  ipcMain.handle(
    'integrationConfig:connect',
    async (
      _event,
      args: { profileId: string; secrets?: Record<string, string>; config?: Record<string, string> }
    ) => service().connect(args)
  )

  ipcMain.handle('integrationConfig:disconnect', async (_event, args: { profileId: string }) => {
    service().disconnect(args.profileId)
    return { ok: true }
  })

  ipcMain.handle('integrationConfig:validate', async (_event, args: { profileId: string }) =>
    service().validateConnection(args.profileId)
  )
}
