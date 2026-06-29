import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowUp,
  Check,
  ChevronRight,
  FolderGit2,
  Inbox,
  Ship,
  TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  attentionOf,
  dateLine,
  DISPATCH_CHIPS,
  greeting,
  MOCK_DONE,
  MOCK_FLEET,
  MOCK_RECENT,
  MOCK_WEEK_SHIPPED,
  progressOf,
  topAttentionTask,
  type MockTask
} from './today-fleet-mock'
import { FleetSection, FocusCard, SectionHeader, StatTile } from './today-inbox-fleet-components'

export default function TodayInbox(): React.JSX.Element {
  const [mode, setMode] = useState<'busy' | 'clear'>('busy')
  const [draft, setDraft] = useState('')
  const [dispatched, setDispatched] = useState<MockTask[]>([])
  const [doneOpen, setDoneOpen] = useState(false)

  const fleet = useMemo(() => (mode === 'clear' ? [] : MOCK_FLEET), [mode])
  const done = useMemo(() => (mode === 'clear' ? [] : MOCK_DONE), [mode])

  const focus = useMemo(() => topAttentionTask(fleet), [fleet])
  const needsYou = useMemo(
    () => fleet.filter((t) => attentionOf(t) !== 'none' && t.id !== focus?.id),
    [fleet, focus]
  )
  const inFlight = useMemo(
    () =>
      fleet.filter(
        (t) => attentionOf(t) === 'none' && ['working', 'landing'].includes(progressOf(t))
      ),
    [fleet]
  )
  const onDeck = useMemo(
    () => [
      ...dispatched,
      ...fleet.filter((t) => attentionOf(t) === 'none' && progressOf(t) === 'queued')
    ],
    [fleet, dispatched]
  )

  const needYouCount = (focus ? 1 : 0) + needsYou.length

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) {
      return
    }
    setDispatched((prev) => [
      {
        id: `new-${Date.now()}`,
        title,
        agent: 'New',
        repo: 'orca',
        worktree: 'new-task',
        source: 'directive',
        status: 'assigned',
        runStatus: null,
        updatedAt: Date.now() / 1000
      },
      ...prev
    ])
    setDraft('')
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-background scrollbar-sleek">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-accent/40 to-transparent"
      />
      <div className="relative mx-auto w-full max-w-3xl px-6 py-12">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              {dateLine()}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{greeting()}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 p-0.5">
            {(['busy', 'clear'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium capitalize transition-colors',
                  mode === m
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </header>

        <div className="mb-8 grid grid-cols-4 gap-3">
          <StatTile
            label="Need you"
            value={needYouCount}
            icon={<Inbox className="size-3.5" />}
            accent={needYouCount > 0 ? 'text-amber-600 dark:text-amber-400' : undefined}
          />
          <StatTile
            label="Working"
            value={inFlight.length}
            icon={<Activity className="size-3.5" />}
          />
          <StatTile
            label="Shipped today"
            value={done.length}
            icon={<Ship className="size-3.5" />}
          />
          <StatTile
            label="This week"
            value={mode === 'clear' ? 0 : MOCK_WEEK_SHIPPED}
            icon={<TrendingUp className="size-3.5" />}
          />
        </div>

        <form onSubmit={submit} className="mb-8">
          <div className="relative">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What should we work on?"
              className="h-12 pr-12 text-sm"
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!draft.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Dispatch"
            >
              <ArrowUp />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DISPATCH_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft(`${c}: `)}
                className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        </form>

        <div className="space-y-8">
          {focus && (
            <section>
              <FocusCard task={focus} />
            </section>
          )}

          <FleetSection title="Also needs you" tasks={needsYou} />
          <FleetSection title="In flight" tasks={inFlight} />
          <FleetSection title="On deck" tasks={onDeck} />

          <section>
            <SectionHeader title="Pick up where you left off" count={MOCK_RECENT.length} />
            <div className="flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-sleek">
              {MOCK_RECENT.map((r) => (
                <button
                  key={r.id}
                  className="group flex min-w-[170px] shrink-0 flex-col gap-1 rounded-lg border border-border/60 bg-card/40 px-3.5 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <FolderGit2 className="size-3.5 text-muted-foreground" />
                    {r.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.lastActive}</span>
                </button>
              ))}
            </div>
          </section>

          {done.length > 0 && (
            <section className="px-3">
              <button
                onClick={() => setDoneOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronRight
                  className={cn('size-3 transition-transform', doneOpen && 'rotate-90')}
                />
                Done today
                <span className="text-muted-foreground/50">{done.length}</span>
              </button>
              {doneOpen && (
                <div className="mt-1.5 space-y-0.5">
                  {done.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg py-1.5 text-sm text-muted-foreground"
                    >
                      <Check className="size-4 shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground/50">
                        {t.repo}/{t.worktree}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
