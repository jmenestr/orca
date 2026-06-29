// Why: pure, testable board helpers for Phase 5 parity - text/source/project
// filtering and pin ordering. Kept out of the component so the matching rules
// are unit-tested and reused for both columns and the detail panel.
import type { Source, Task } from '@/perch/perch-client'

export type TaskBoardFilter = {
  /** Free-text match against title and external identifier. */
  text: string
  /** Source filter, or 'all'. */
  source: Source | 'all'
  /** Dispatch-target repo selector (e.g. `id:<repoId>`), or 'all'. */
  project: string | 'all'
}

export const EMPTY_TASK_BOARD_FILTER: TaskBoardFilter = {
  text: '',
  source: 'all',
  project: 'all'
}

export function isTaskBoardFilterActive(filter: TaskBoardFilter): boolean {
  return filter.text.trim() !== '' || filter.source !== 'all' || filter.project !== 'all'
}

export function matchesTaskFilter(task: Task, filter: TaskBoardFilter): boolean {
  if (filter.source !== 'all' && task.source !== filter.source) {
    return false
  }
  if (filter.project !== 'all' && (task.dispatchTarget?.repoSelector ?? '') !== filter.project) {
    return false
  }
  const text = filter.text.trim().toLowerCase()
  if (text === '') {
    return true
  }
  const haystack = `${task.title} ${task.externalIdentifier ?? ''} ${task.repo ?? ''}`.toLowerCase()
  return haystack.includes(text)
}

export function filterBoardTasks(tasks: readonly Task[], filter: TaskBoardFilter): Task[] {
  if (!isTaskBoardFilterActive(filter)) {
    return [...tasks]
  }
  return tasks.filter((task) => matchesTaskFilter(task, filter))
}

// Why: pinned tasks float to the top of their column while preserving the
// existing relative order among pinned and among unpinned tasks (a stable
// partition). Pin state is board-local for now (see TODO in TaskBoardPage).
export function sortTasksByPin(tasks: readonly Task[], pinnedIds: ReadonlySet<string>): Task[] {
  if (pinnedIds.size === 0) {
    return [...tasks]
  }
  const pinned: Task[] = []
  const rest: Task[] = []
  for (const task of tasks) {
    if (pinnedIds.has(task.id)) {
      pinned.push(task)
    } else {
      rest.push(task)
    }
  }
  return [...pinned, ...rest]
}

// Why: the distinct sources present in the current board, for the source filter
// dropdown (so we only offer sources that actually have tasks).
export function presentSources(tasks: readonly Task[]): Source[] {
  const seen = new Set<Source>()
  for (const task of tasks) {
    seen.add(task.source)
  }
  return [...seen]
}
