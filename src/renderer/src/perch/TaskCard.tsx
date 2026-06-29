import { useDraggable } from '@dnd-kit/core'
import { ExternalLink, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  attentionLabel,
  deriveWorkAttention,
  deriveWorkProgress,
  progressLabel,
  type Task
} from '@/perch/perch-client'

// Why: a compact dot reflecting the current Run's turn-status so a card shows
// at a glance whether its agent is working/waiting/idle.
function runDotClass(status: string | undefined): string {
  switch (status) {
    case 'working':
      return 'bg-emerald-500'
    case 'awaiting_input':
    case 'awaiting_approval':
      return 'bg-amber-500'
    case 'failed':
      return 'bg-red-500'
    case 'idle':
    case 'dispatched':
      return 'bg-muted-foreground/50'
    default:
      return 'bg-transparent'
  }
}

function SourceBadge({ task }: { task: Task }): React.JSX.Element | null {
  if (task.source === 'linear' && task.externalIdentifier) {
    return (
      <span className="rounded bg-primary/10 px-1 py-px text-[10px] font-medium text-primary">
        {task.externalIdentifier}
      </span>
    )
  }
  if (task.source === 'directive') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-px text-[10px] text-primary">
        <Wand2 className="size-2.5" /> conductor
      </span>
    )
  }
  if (task.source === 'custom') {
    return <span className="rounded bg-foreground/10 px-1 py-px text-[10px]">custom</span>
  }
  return null
}

// Why: the card's visual body is shared by the live (draggable) card and the
// DragOverlay clone, so the floating ghost is pixel-identical to the source.
function TaskCardBody({
  task,
  onOpenAgent,
  onOpenExternal
}: {
  task: Task
  onOpenAgent?: (task: Task) => void
  onOpenExternal?: (url: string) => void
}): React.JSX.Element {
  const progress = deriveWorkProgress(task)
  const attention = attentionLabel(deriveWorkAttention(task))
  return (
    <>
      <div className="flex items-start gap-1.5">
        <span
          className={cn('mt-1 size-2 shrink-0 rounded-full', runDotClass(task.currentRun?.status))}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-foreground">
          {task.title}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-3.5 text-[10px] text-muted-foreground">
        <SourceBadge task={task} />
        <span>{progressLabel(progress)}</span>
        {attention ? <span className="text-amber-600 dark:text-amber-400">{attention}</span> : null}
        {task.externalUrl ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenExternal?.(task.externalUrl!)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 rounded px-0.5 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-2.5" /> Linear
          </button>
        ) : null}
        {task.worktree && task.currentRun ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenAgent?.(task)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="ml-auto inline-flex items-center gap-0.5 rounded px-0.5 text-primary hover:bg-primary/10"
          >
            <ExternalLink className="size-2.5" /> Agent
          </button>
        ) : null}
      </div>
    </>
  )
}

export function TaskCard({
  task,
  selected,
  onSelect,
  onOpenAgent,
  onOpenExternal
}: {
  task: Task
  selected: boolean
  onSelect: (task: Task) => void
  onOpenAgent: (task: Task) => void
  onOpenExternal: (url: string) => void
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Why: dnd-kit only starts a drag past the activation distance, so a plain
      // click (no movement) falls through to select and open the detail panel.
      onClick={() => onSelect(task)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(task)
        }
      }}
      className={cn(
        'cursor-grab rounded-md border bg-background px-2.5 py-2 text-left shadow-xs transition-colors active:cursor-grabbing',
        selected ? 'border-primary ring-1 ring-primary/40' : 'border-border/60 hover:border-border',
        // Why: the source slot is faded to a placeholder while the DragOverlay
        // clone follows the cursor, matching the Workspace board's drag feel.
        isDragging && 'opacity-30'
      )}
    >
      <TaskCardBody task={task} onOpenAgent={onOpenAgent} onOpenExternal={onOpenExternal} />
    </div>
  )
}

// Why: the floating clone rendered inside dnd-kit's <DragOverlay>. It carries
// the elevated outline + shadow of the Workspace board drag preview and is
// non-interactive (it only follows the cursor).
export function TaskCardOverlay({ task }: { task: Task }): React.JSX.Element {
  return (
    <div className="pointer-events-none cursor-grabbing rounded-md border border-primary/60 bg-background px-2.5 py-2 text-left shadow-lg ring-1 ring-primary/30 rotate-[1.5deg]">
      <TaskCardBody task={task} />
    </div>
  )
}
