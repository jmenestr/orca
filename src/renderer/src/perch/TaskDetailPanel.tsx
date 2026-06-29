import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, Pin, PinOff, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import {
  TASK_BOARD_COLUMNS,
  attentionLabel,
  deriveWorkAttention,
  deriveWorkProgress,
  loadWorkspaceRepos,
  progressLabel,
  type Run,
  type Task,
  type TaskStatus,
  type WorkspaceRepoEntry
} from '@/perch/perch-client'

function taskBrief(task: Task): string {
  const ctx = task.context
  if (ctx && typeof ctx === 'object' && 'brief' in ctx) {
    const brief = (ctx as { brief?: unknown }).brief
    return typeof brief === 'string' ? brief : ''
  }
  return ''
}

function runStatusLabel(status: Run['status']): string {
  switch (status) {
    case 'dispatched':
      return 'Dispatched'
    case 'working':
      return 'Working'
    case 'awaiting_input':
      return 'Awaiting input'
    case 'awaiting_approval':
      return 'Awaiting approval'
    case 'idle':
      return 'Idle'
    case 'exited':
      return 'Exited'
    case 'failed':
      return 'Failed'
  }
}

function sourceLabel(task: Task): string {
  switch (task.source) {
    case 'linear':
      return task.externalIdentifier ?? 'Linear'
    case 'directive':
      return 'Conductor'
    case 'custom':
      return 'Custom'
    case 'captain_manual':
      return 'Manual'
    default:
      return task.source
  }
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-foreground">{value}</span>
    </div>
  )
}

// Why: the dispatch target is stored as a repo selector (`id:<repoId>`); the
// picker offers repos by id so a selection persists ahead of dispatch.
function ProjectPicker({
  task,
  onSetProject
}: {
  task: Task
  onSetProject: (id: string, repoSelector: string) => void
}): React.JSX.Element {
  const [repos, setRepos] = useState<WorkspaceRepoEntry[]>([])
  useEffect(() => {
    let active = true
    void loadWorkspaceRepos().then((entries) => {
      if (active) {
        setRepos(entries)
      }
    })
    return () => {
      active = false
    }
  }, [])
  const selector = task.dispatchTarget?.repoSelector ?? ''
  const selectedId = selector.startsWith('id:') ? selector.slice(3) : ''
  return (
    <Select value={selectedId} onValueChange={(id) => onSetProject(task.id, `id:${id}`)}>
      <SelectTrigger size="sm" className="h-7 w-[180px] text-[12px]">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {repos.map((repo) => (
          <SelectItem key={repo.id} value={repo.id}>
            {repo.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function TaskDetailPanel({
  task,
  dispatching,
  pinned,
  onClose,
  onDispatch,
  onOpenAgent,
  onMoveStatus,
  onSetProject,
  onTogglePin,
  onOpenExternal
}: {
  task: Task
  dispatching: boolean
  pinned: boolean
  onClose: () => void
  onDispatch: (task: Task) => void
  onOpenAgent: (task: Task) => void
  onMoveStatus: (id: string, status: TaskStatus) => void
  onSetProject: (id: string, repoSelector: string) => void
  onTogglePin: (id: string) => void
  onOpenExternal: (url: string) => void
}): React.JSX.Element {
  const brief = taskBrief(task)
  const run = task.currentRun ?? null
  const attention = attentionLabel(deriveWorkAttention(task))

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {task.source === 'directive' ? (
              <Wand2 className="size-3.5 shrink-0 text-primary" />
            ) : null}
            {task.externalUrl ? (
              <button
                type="button"
                onClick={() => onOpenExternal(task.externalUrl!)}
                className="inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-primary hover:bg-primary/10"
              >
                {sourceLabel(task)} <ExternalLink className="size-3" />
              </button>
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground">
                {sourceLabel(task)}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-[14px] font-semibold leading-snug text-foreground break-words">
            {task.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => onTogglePin(task.id)}
          aria-label={pinned ? 'Unpin task' : 'Pin task'}
        >
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={onClose}
          aria-label="Close details"
        >
          <X className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <DetailRow
              label="Status"
              value={
                <span className="inline-flex items-center gap-2">
                  <Select
                    value={task.status}
                    onValueChange={(value) => onMoveStatus(task.id, value as TaskStatus)}
                  >
                    <SelectTrigger size="sm" className="h-7 w-[150px] text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_BOARD_COLUMNS.map((column) => (
                        <SelectItem key={column.status} value={column.status}>
                          {column.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {attention ? (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                      {attention}
                    </span>
                  ) : null}
                </span>
              }
            />
            <DetailRow label="Progress" value={progressLabel(deriveWorkProgress(task))} />
            <DetailRow label="Mode" value={task.mode} />
            {task.mode === 'project' ? (
              <DetailRow
                label="Project"
                value={
                  task.currentRun || task.worktree ? (
                    (task.repo ?? '-')
                  ) : (
                    <ProjectPicker task={task} onSetProject={onSetProject} />
                  )
                }
              />
            ) : null}
          </div>

          {brief ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </span>
              <CommentMarkdown content={brief} variant="document" className="text-[12px]" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Agent
            </span>
            {run ? (
              <>
                <DetailRow label="State" value={runStatusLabel(run.status)} />
                <DetailRow label="Type" value={run.agentType ?? run.harness} />
                <DetailRow label="Mode" value={run.mode} />
                {task.worktree ? <DetailRow label="Worktree" value={task.worktree} /> : null}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('mt-1 h-8 gap-1.5', !task.worktree && 'hidden')}
                  onClick={() => onOpenAgent(task)}
                >
                  <ExternalLink className="size-3.5" />
                  View agent
                </Button>
              </>
            ) : task.mode === 'manual' ? (
              // Why: manual tasks are worked by hand - no agent is ever
              // dispatched, so the board only tracks their status.
              <p className="text-[12px] text-muted-foreground">
                Manual task - no agent. Move it across the board as you work it.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground">
                  {task.mode === 'scratch'
                    ? 'No agent yet. Dispatch a floating (scratch) agent to start.'
                    : 'No agent yet. Dispatch one to start work on this task.'}
                </p>
                <Button
                  size="sm"
                  className="mt-1 h-8 gap-1.5"
                  disabled={dispatching}
                  onClick={() => onDispatch(task)}
                >
                  {dispatching ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Dispatch agent
                </Button>
              </>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
