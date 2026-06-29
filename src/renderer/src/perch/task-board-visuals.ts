import { Circle, CircleCheck, CircleDot, CirclePlay, GitPullRequest } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TaskStatus } from '@/perch/perch-client'

export type TaskColumnVisual = {
  tone: string
  border: string
  laneTint: string
  icon: ComponentType<{ className?: string }>
}

// Why: mirror the Workspace board's conductor palette (src/renderer/src/components/
// sidebar/workspace-status.ts) so the unified board reads the same. Keyed by the
// board column statuses in TASK_BOARD_COLUMNS.
const TASK_COLUMN_VISUALS: Record<string, TaskColumnVisual> = {
  backlog: {
    tone: 'text-muted-foreground',
    border: 'border-t-muted-foreground/45',
    laneTint: 'bg-background/55',
    icon: Circle
  },
  assigned: {
    tone: 'text-sky-600 dark:text-sky-300',
    border: 'border-t-sky-500/70',
    laneTint: 'bg-sky-500/[0.04]',
    icon: CircleDot
  },
  in_progress: {
    tone: 'text-[#d4a300]',
    border: 'border-t-[#d4a300]/70',
    laneTint: 'bg-[#d4a300]/[0.04]',
    icon: CirclePlay
  },
  in_review: {
    tone: 'text-[#16a34a]',
    border: 'border-t-[#16a34a]/70',
    laneTint: 'bg-[#16a34a]/[0.04]',
    icon: GitPullRequest
  },
  done: {
    tone: 'text-[#c7a594]',
    border: 'border-t-[#c7a594]/70',
    laneTint: 'bg-[#c7a594]/[0.04]',
    icon: CircleCheck
  }
}

export function taskColumnVisual(status: TaskStatus): TaskColumnVisual {
  return TASK_COLUMN_VISUALS[status] ?? TASK_COLUMN_VISUALS.backlog
}
