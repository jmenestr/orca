import { Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function getWorkflowsSettingsSearchEntries(): {
  title: string
  description: string
  keywords: string[]
}[] {
  return [
    {
      title: 'SkillTasks',
      description: 'Author skills and dispatchable SkillTasks for Conductor.',
      keywords: ['workflows', 'skilltasks', 'skill tasks', 'conductor', 'notion', 'verify-expenses']
    }
  ]
}

export function WorkflowsSettingsPane(): React.JSX.Element {
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const closeSettingsPage = useAppStore((s) => s.closeSettingsPage)

  const openWorkflows = (): void => {
    closeSettingsPage()
    openSkillsPage()
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {translate(
          'auto.components.settings.WorkflowsSettingsPane.description',
          'SkillTasks are dispatchable jobs you trigger from Conductor with @task:id. Skills hold the agent instructions. Everything is stored locally under ~/.orca/workflows — no git repo required.'
        )}
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>
          {translate(
            'auto.components.settings.WorkflowsSettingsPane.step1',
            'Connect integrations (Settings → Integrations → Notion budget).'
          )}
        </li>
        <li>
          {translate(
            'auto.components.settings.WorkflowsSettingsPane.step2',
            'Import a template (Verify expenses) on the Workflows page.'
          )}
        </li>
        <li>
          {translate(
            'auto.components.settings.WorkflowsSettingsPane.step3',
            'Edit the skill body, then dispatch from Conductor: @task:verify-expenses'
          )}
        </li>
      </ol>
      <Button type="button" onClick={openWorkflows} className="gap-2">
        <Workflow className="size-4" />
        {translate('auto.components.settings.WorkflowsSettingsPane.open', 'Open Workflows')}
      </Button>
    </div>
  )
}
