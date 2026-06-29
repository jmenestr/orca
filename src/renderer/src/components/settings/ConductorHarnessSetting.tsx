import type { GlobalSettings } from '../../../../shared/types'
import {
  CONDUCTOR_HARNESS_IDS,
  IMPLEMENTED_CONDUCTOR_HARNESS_IDS,
  type ConductorHarnessId
} from '../../../../shared/conductor-harness'
import { Label } from '../ui/label'
import { cn } from '@/lib/utils'
import { SearchableSetting } from './SearchableSetting'

export function getConductorHarnessSearchEntry() {
  return {
    conductorHarness: {
      title: 'Conductor harness',
      description: 'Agent harness used by the Perch Conductor (fm conduct serve).',
      keywords: ['conductor', 'perch', 'firstmate', 'harness', 'claude', 'codex', 'experimental']
    }
  }
}

type ConductorHarnessSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

export function ConductorHarnessSetting({
  settings,
  updateSettings
}: ConductorHarnessSettingProps): React.JSX.Element {
  const selected = settings.conductorHarness ?? 'claude'

  return (
    <SearchableSetting
      title="Conductor harness"
      description="Choose which agent harness powers the Perch Conductor chat. Only Claude is available today; others are listed for upcoming adapters."
      keywords={getConductorHarnessSearchEntry().conductorHarness.keywords}
      className="space-y-3 py-2"
      id="experimental-conductor-harness"
    >
      <div className="space-y-2">
        <Label>Harness</Label>
        <div className="flex flex-col gap-1.5">
          {CONDUCTOR_HARNESS_IDS.map((harness) => {
            const enabled = IMPLEMENTED_CONDUCTOR_HARNESS_IDS.has(harness)
            const isSelected = selected === harness
            return (
              <button
                key={harness}
                type="button"
                disabled={!enabled}
                onClick={() => {
                  if (enabled) {
                    void updateSettings({ conductorHarness: harness as ConductorHarnessId })
                  }
                }}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left text-[13px] transition-colors',
                  enabled && 'hover:bg-muted/60',
                  isSelected && enabled && 'border-primary bg-primary/5',
                  !enabled && 'cursor-not-allowed opacity-50'
                )}
              >
                <span className="font-medium capitalize">{harness}</span>
                {!enabled ? (
                  <span className="text-[11px] text-muted-foreground">Coming soon</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </SearchableSetting>
  )
}
