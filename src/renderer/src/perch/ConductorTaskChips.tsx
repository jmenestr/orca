import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WorkflowsCatalogEntry } from '../../../shared/workflows/skill-task-manifest'

type ConductorTaskChipsProps = {
  onInsert: (token: string) => void
}

export function ConductorTaskChips({
  onInsert
}: ConductorTaskChipsProps): React.JSX.Element | null {
  const [tasks, setTasks] = useState<WorkflowsCatalogEntry[]>([])

  useEffect(() => {
    const list = window.api?.workflows?.list
    if (!list) {
      return
    }
    void list()
      .then((result) => {
        const payload = result as { tasks: WorkflowsCatalogEntry[] }
        setTasks(payload.tasks ?? [])
      })
      .catch(() => {})
  }, [])

  if (tasks.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1.5 pb-2">
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          onClick={() => onInsert(`@task:${task.id} `)}
          className={cn(
            'rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium',
            'text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
          )}
        >
          {task.title}
        </button>
      ))}
    </div>
  )
}
