import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { translate } from '@/i18n/i18n'

const PROFILE_ID = 'notion.budget'

type ProfileStatus = {
  profileId: string
  label: string
  connected: boolean
  config: Record<string, string>
  error?: string
}

export function NotionBudgetIntegrationCard(): React.JSX.Element {
  const [status, setStatus] = useState<ProfileStatus | null>(null)
  const [token, setToken] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [testState, setTestState] = useState<'idle' | 'ok' | 'error'>('idle')

  const refresh = async (): Promise<void> => {
    if (!window.api?.integrationConfig) {
      return
    }
    const result = await window.api.integrationConfig.list()
    const profile = (result.profiles as ProfileStatus[]).find(
      (entry) => entry.profileId === PROFILE_ID
    )
    setStatus(profile ?? null)
    if (profile?.config.databaseId) {
      setDatabaseId(profile.config.databaseId)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const connect = async (): Promise<void> => {
    setBusy(true)
    setTestState('idle')
    try {
      await window.api.integrationConfig.connect({
        profileId: PROFILE_ID,
        secrets: token.trim() ? { token: token.trim() } : undefined,
        config: { databaseId: databaseId.trim() }
      })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    await window.api.integrationConfig.disconnect({ profileId: PROFILE_ID })
    setToken('')
    setTestState('idle')
    await refresh()
  }

  const test = async (): Promise<void> => {
    setBusy(true)
    const result = (await window.api.integrationConfig.validate({ profileId: PROFILE_ID })) as {
      ok: boolean
    }
    setTestState(result.ok ? 'ok' : 'error')
    setBusy(false)
  }

  const connected = status?.connected === true

  return (
    <IntegrationCardShell
      icon={<span className="text-lg">N</span>}
      name={translate('auto.settings.notionBudget.name', 'Notion budget')}
      description={
        connected
          ? translate('auto.settings.notionBudget.connected', 'Connected for SkillTask workflows.')
          : translate(
              'auto.settings.notionBudget.disconnected',
              'Connect a Notion integration token and expenses database id.'
            )
      }
      checking={status === null}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={connected ? 'Connected' : 'Not connected'}
      actions={
        <Button
          variant={connected ? 'outline' : 'default'}
          size="sm"
          disabled={busy}
          onClick={() => void (connected ? disconnect() : connect())}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </Button>
      }
    >
      <IntegrationCardDetails>
        <div className="space-y-2">
          <Input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Integration token"
          />
          <Input
            value={databaseId}
            onChange={(event) => setDatabaseId(event.target.value)}
            placeholder="Database ID"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !connected}
              onClick={() => void test()}
            >
              Test connection
            </Button>
            {testState === 'ok' ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="size-3.5" />
                OK
              </span>
            ) : null}
            {testState === 'error' ? (
              <span className="text-xs text-destructive">Test failed</span>
            ) : null}
            {busy ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          {status?.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
        </div>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
