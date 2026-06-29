import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { attentionLabel, progressLabel, type Attention } from '@/perch/perch-client'
import {
  attentionOf,
  initialsFor,
  progressOf,
  relativeTime,
  type MockTask
} from './today-fleet-mock'

type DotKind = 'error' | 'attention' | 'live' | 'idle'

function dotKind(task: MockTask): DotKind {
  const attention = attentionOf(task)
  if (attention === 'error') {
    return 'error'
  }
  if (attention !== 'none') {
    return 'attention'
  }
  const progress = progressOf(task)
  if (progress === 'working' || progress === 'landing') {
    return 'live'
  }
  return 'idle'
}

const DOT_CLASS: Record<DotKind, string> = {
  error: 'bg-destructive',
  attention: 'bg-amber-500',
  live: 'bg-emerald-500',
  idle: 'bg-muted-foreground/40'
}

function AgentAvatar({
  name,
  task,
  large = false
}: {
  name: string
  task: MockTask
  large?: boolean
}): React.JSX.Element {
  const kind = dotKind(task)
  return (
    <div className="relative shrink-0">
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground',
          large ? 'size-10 text-sm' : 'size-8 text-xs'
        )}
      >
        {initialsFor(name)}
      </div>
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background',
          DOT_CLASS[kind],
          kind === 'live' && 'animate-pulse'
        )}
      />
    </div>
  )
}

function AttentionPill({ attention }: { attention: Attention }): React.JSX.Element | null {
  const label = attentionLabel(attention)
  if (!label) {
    return null
  }
  const isError = attention === 'error'
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        isError
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-amber-500/30 bg-amber-400/10 text-amber-600 dark:text-amber-400/90'
      )}
    >
      {label}
    </span>
  )
}

function FocusActions({
  attention,
  agent
}: {
  attention: Attention
  agent: string
}): React.JSX.Element {
  switch (attention) {
    case 'input':
      return (
        <>
          <Button>Answer {agent}</Button>
          <Button variant="outline">Open agent</Button>
        </>
      )
    case 'approval':
      return (
        <>
          <Button>Approve</Button>
          <Button variant="outline">Review changes</Button>
        </>
      )
    case 'error':
      return (
        <>
          <Button>View error</Button>
          <Button variant="outline">Retry</Button>
        </>
      )
    case 'none':
      return <Button variant="outline">Open agent</Button>
  }
}

export function FocusCard({ task }: { task: MockTask }): React.JSX.Element {
  const attention = attentionOf(task)
  const wash =
    attention === 'error'
      ? 'border-destructive/30 bg-destructive/[0.04]'
      : 'border-amber-500/30 bg-amber-400/[0.04]'
  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', wash)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Right now
          </span>
          <AttentionPill attention={attention} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground/70">
          {relativeTime(task.updatedAt)}
        </span>
      </div>
      <div className="mt-3 flex items-start gap-3">
        <AgentAvatar name={task.agent} task={task} large />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{task.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{task.agent}</span>
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span className="font-mono">
              {task.repo}/{task.worktree}
            </span>
          </div>
          {task.snippet && (
            <p className="mt-2.5 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground/90">
              {task.snippet}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-2">
        <FocusActions attention={attention} agent={task.agent} />
      </div>
    </div>
  )
}

function RowActions({ attention }: { attention: Attention }): React.JSX.Element | null {
  switch (attention) {
    case 'input':
      return (
        <Button size="sm" variant="secondary">
          Answer
        </Button>
      )
    case 'approval':
      return (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm">Approve</Button>
          <Button size="sm" variant="ghost">
            Review
          </Button>
        </div>
      )
    case 'error':
      return (
        <Button size="sm" variant="secondary">
          View
        </Button>
      )
    case 'none':
      return null
  }
}

function MetaStatus({ task }: { task: MockTask }): React.JSX.Element {
  const attention = attentionOf(task)
  const label = attentionLabel(attention)
  if (label) {
    const isError = attention === 'error'
    return (
      <span
        className={cn(
          'font-medium',
          isError ? 'text-destructive' : 'text-amber-600 dark:text-amber-400/90'
        )}
      >
        {label}
      </span>
    )
  }
  return <span>{task.runMeta ?? progressLabel(progressOf(task))}</span>
}

function FleetRow({ task }: { task: MockTask }): React.JSX.Element {
  const attention = attentionOf(task)
  const barClass =
    attention === 'error'
      ? 'border-l-destructive/50'
      : attention === 'input' || attention === 'approval'
        ? 'border-l-amber-500/50'
        : 'border-l-transparent'
  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 transition-colors hover:bg-accent',
        barClass
      )}
    >
      <AgentAvatar name={task.agent} task={task} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{task.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">{task.agent}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate font-mono">
            {task.repo}/{task.worktree}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <MetaStatus task={task} />
        </div>
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
        {relativeTime(task.updatedAt)}
      </span>
      {attention === 'none' ? (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Open"
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ArrowUpRight />
        </Button>
      ) : (
        <RowActions attention={attention} />
      )}
    </div>
  )
}

export function SectionHeader({
  title,
  count
}: {
  title: string
  count: number
}): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-2 px-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {title}
      </h2>
      <span className="text-[11px] tabular-nums text-muted-foreground/50">{count}</span>
    </div>
  )
}

export function FleetSection({
  title,
  tasks
}: {
  title: string
  tasks: MockTask[]
}): React.JSX.Element | null {
  if (tasks.length === 0) {
    return null
  }
  return (
    <section>
      <SectionHeader title={title} count={tasks.length} />
      <div className="space-y-0.5">
        {tasks.map((t) => (
          <FleetRow key={t.id} task={t} />
        ))}
      </div>
    </section>
  )
}

export function StatTile({
  label,
  value,
  icon,
  accent
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  accent?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">{icon}</span>
      </div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums text-foreground', accent)}>
        {value}
      </div>
    </div>
  )
}
