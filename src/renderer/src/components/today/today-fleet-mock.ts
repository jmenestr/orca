// Why: prototype-only fleet fixtures + display helpers for the Today command
// center. Work/turn status is fed through the real perch derive* helpers so the
// triage buckets behave exactly like production; everything else (agent names,
// snippets, recents) is mock data to dress the prototype.
import {
  deriveWorkAttention,
  deriveWorkProgress,
  type Attention,
  type Progress,
  type Run,
  type RunStatus,
  type Source,
  type TaskStatus
} from '@/perch/perch-client'

export type MockTask = {
  id: string
  title: string
  agent: string
  repo: string
  worktree: string
  source: Source
  status: TaskStatus
  runStatus: RunStatus | null
  updatedAt: number
  runMeta?: string
  snippet?: string
}

const now = Date.now() / 1000

function mockRun(status: RunStatus): Run {
  return {
    id: `run-${status}`,
    taskId: null,
    agentId: 'general',
    harness: 'claude',
    mode: 'session',
    status,
    paneKey: null,
    terminalHandle: null,
    worktreeId: null,
    repoId: null,
    connectionId: null,
    sessionId: null,
    agentType: null,
    result: null,
    error: null,
    startedAt: now - 600,
    endedAt: null,
    updatedAt: now
  }
}

export function attentionOf(t: MockTask): Attention {
  return deriveWorkAttention({
    status: t.status,
    currentRun: t.runStatus ? mockRun(t.runStatus) : null
  })
}

export function progressOf(t: MockTask): Progress {
  return deriveWorkProgress({
    status: t.status,
    currentRun: t.runStatus ? mockRun(t.runStatus) : null
  })
}

export const MOCK_FLEET: MockTask[] = [
  {
    id: 't3',
    title: 'Migrate auth tables to the new schema',
    agent: 'Reef',
    repo: 'core',
    worktree: 'auth-migration',
    source: 'captain_manual',
    status: 'failed',
    runStatus: 'failed',
    updatedAt: now - 60 * 60,
    snippet: "Migration failed: column 'legacy_id' is still referenced by 2 foreign keys."
  },
  {
    id: 't2',
    title: 'Bump dependencies to v3 and run the suite',
    agent: 'Coral',
    repo: 'orca',
    worktree: 'deps-v3',
    source: 'directive',
    status: 'in_progress',
    runStatus: 'awaiting_approval',
    updatedAt: now - 12 * 60,
    snippet: 'Ready to bump 12 packages including 2 majors. Approve the upgrade?'
  },
  {
    id: 't1',
    title: 'Fix dark-mode flicker on the settings pane',
    agent: 'Mako',
    repo: 'orca',
    worktree: 'dark-mode-flicker',
    source: 'directive',
    status: 'in_progress',
    runStatus: 'awaiting_input',
    updatedAt: now - 4 * 60,
    snippet:
      'The flicker only repros with the system theme on. Force a repaint, or prefer a CSS-only fix?'
  },
  {
    id: 't4',
    title: 'Refactor PerchService into fleet modules',
    agent: 'Tide',
    repo: 'orca',
    worktree: 'fleet-refactor',
    source: 'directive',
    status: 'in_progress',
    runStatus: 'working',
    updatedAt: now - 8 * 60,
    runMeta: 'running 8m'
  },
  {
    id: 't5',
    title: 'Add CSV export to the reports view',
    agent: 'Finn',
    repo: 'orca',
    worktree: 'csv-export',
    source: 'directive',
    status: 'in_review',
    runStatus: 'idle',
    updatedAt: now - 25 * 60,
    runMeta: 'opening PR'
  },
  {
    id: 't6',
    title: 'Write fleet service tests',
    agent: 'Wave',
    repo: 'orca',
    worktree: 'fleet-tests',
    source: 'directive',
    status: 'assigned',
    runStatus: null,
    updatedAt: now - 40 * 60
  }
]

export const MOCK_DONE: MockTask[] = [
  {
    id: 'd1',
    title: 'Add keyboard shortcut for command palette',
    agent: 'Mako',
    repo: 'orca',
    worktree: 'cmd-k',
    source: 'directive',
    status: 'done',
    runStatus: 'exited',
    updatedAt: now - 2 * 3600
  },
  {
    id: 'd2',
    title: 'Fix flaky terminal reconnect test',
    agent: 'Wave',
    repo: 'orca',
    worktree: 'terminal-flake',
    source: 'directive',
    status: 'done',
    runStatus: 'exited',
    updatedAt: now - 3 * 3600
  },
  {
    id: 'd3',
    title: 'Tidy sidebar spacing tokens',
    agent: 'Tide',
    repo: 'orca',
    worktree: 'sidebar-spacing',
    source: 'captain_manual',
    status: 'done',
    runStatus: 'exited',
    updatedAt: now - 5 * 3600
  }
]

export const MOCK_RECENT = [
  { id: 'r1', name: 'orca/main', lastActive: '2h ago' },
  { id: 'r2', name: 'orca/deps-v3', lastActive: 'yesterday' },
  { id: 'r3', name: 'core/auth-migration', lastActive: '3d ago' }
]

export const MOCK_WEEK_SHIPPED = 14

export const DISPATCH_CHIPS = ['Fix a bug', 'Write tests', 'Review a PR', 'Refactor a module']

export const SOURCE_LABEL: Record<Source, string> = {
  directive: 'directive',
  captain_manual: 'captain',
  github_pr: 'PR',
  slack_mention: 'slack',
  todo: 'todo',
  linear: 'linear',
  custom: 'custom'
}

export function relativeTime(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec
  if (diff < 60) {
    return 'now'
  }
  if (diff < 3600) {
    return `${Math.floor(diff / 60)}m`
  }
  if (diff < 86400) {
    return `${Math.floor(diff / 3600)}h`
  }
  const days = Math.floor(diff / 86400)
  return days === 1 ? 'yesterday' : `${days}d`
}

export function greeting(): string {
  const h = new Date().getHours()
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  return `Good ${part}, Captain.`
}

export function dateLine(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
}

export function initialsFor(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

// Why: the single most important thing to surface in the focus zone - errors
// outrank approvals outrank input, matching the triage priority.
export function topAttentionTask(tasks: MockTask[]): MockTask | null {
  const order: Attention[] = ['error', 'approval', 'input']
  for (const level of order) {
    const hit = tasks.find((t) => attentionOf(t) === level)
    if (hit) {
      return hit
    }
  }
  return null
}
