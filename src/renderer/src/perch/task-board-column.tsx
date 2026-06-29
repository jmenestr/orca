import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/perch/perch-client'
import { TaskCard } from '@/perch/TaskCard'
import { taskColumnVisual } from '@/perch/task-board-visuals'

export function BoardColumn({
  status,
  label,
  tasks,
  selectedTaskId,
  onSelect,
  onOpenAgent,
  onOpenExternal,
  onCreateInColumn
}: {
  status: TaskStatus
  label: string
  tasks: Task[]
  selectedTaskId: string | null
  onSelect: (task: Task) => void
  onOpenAgent: (task: Task) => void
  onOpenExternal: (url: string) => void
  onCreateInColumn: (status: TaskStatus) => void
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const visual = taskColumnVisual(status)
  const StatusIcon = visual.icon
  return (
    <section
      ref={setNodeRef}
      data-task-board-lane-over={isOver ? 'true' : undefined}
      className={cn(
        'flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden rounded-md border border-t-2 border-border transition-colors',
        visual.border,
        visual.laneTint,
        isOver && '!border-primary bg-primary/10 ring-2 ring-inset ring-primary/40'
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border/70 px-3">
        <StatusIcon className={cn('size-3.5 shrink-0', visual.tone)} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
          {label}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium leading-none text-muted-foreground">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => onCreateInColumn(status)}
          aria-label={`New task in ${label}`}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1.5 py-2 scrollbar-sleek">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            selected={task.id === selectedTaskId}
            onSelect={onSelect}
            onOpenAgent={onOpenAgent}
            onOpenExternal={onOpenExternal}
          />
        ))}
        {isOver ? (
          <div className="mx-1 h-1 rounded-full bg-primary ring-1 ring-primary/40" />
        ) : null}
        {tasks.length === 0 && !isOver ? (
          <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/70 text-[11px] text-muted-foreground">
            Empty
          </div>
        ) : null}
      </div>
    </section>
  )
}
