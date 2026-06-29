import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import {
  TASK_BOARD_COLUMNS,
  columnStatusForTask,
  loadWorkspaceRepos,
  type Task,
  type TaskMode,
  type TaskStatus,
  type WorkspaceRepoEntry
} from '@/perch/perch-client'
import { TaskCardOverlay } from '@/perch/TaskCard'
import { TaskDetailPanel } from '@/perch/TaskDetailPanel'
import { BoardColumn } from '@/perch/task-board-column'
import { TaskBoardComposerDialog, TaskBoardRepoPromptDialog } from '@/perch/task-board-dialogs'
import {
  EMPTY_TASK_BOARD_FILTER,
  filterBoardTasks,
  presentSources,
  sortTasksByPin,
  type TaskBoardFilter
} from '@/perch/task-board-filter'
import type { Source } from '@/perch/perch-client'

const DISPATCH_COLUMN: TaskStatus = 'in_progress'

export default function TaskBoardPage(): React.JSX.Element {
  const boardTasks = useAppStore((s) => s.boardTasks)
  const hydrateBoard = useAppStore((s) => s.hydrateBoard)
  const syncBoardLinear = useAppStore((s) => s.syncBoardLinear)
  const moveBoardTask = useAppStore((s) => s.moveBoardTask)
  const createBoardTask = useAppStore((s) => s.createBoardTask)
  const dispatchBoardTask = useAppStore((s) => s.dispatchBoardTask)
  const setBoardTaskProject = useAppStore((s) => s.setBoardTaskProject)
  const openActivityPage = useAppStore((s) => s.openActivityPage)

  const [syncing, setSyncing] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newMode, setNewMode] = useState<TaskMode>('project')
  // Why: when the composer is opened from a column's + button, the new task is
  // seeded into that column's status (create-in-column, Phase 5).
  const [composerStatus, setComposerStatus] = useState<TaskStatus>('backlog')
  const [filter, setFilter] = useState<TaskBoardFilter>(EMPTY_TASK_BOARD_FILTER)
  // Why: pins are board-local for now (no Task.pinned column yet); pinned cards
  // float to the top of their column. TODO: persist via Task.pinned + RPC.
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<string | null>(null)
  // Why: the id of the card currently being dragged, so the DragOverlay can
  // render a floating clone that follows the cursor.
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  // Why: a card dragged into the active column with no repo target prompts for
  // a repo before dispatching; the choice is persisted on the task.
  const [repoPrompt, setRepoPrompt] = useState<{ taskId: string } | null>(null)
  const [repos, setRepos] = useState<WorkspaceRepoEntry[]>([])
  const [repoId, setRepoId] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    void hydrateBoard()
  }, [hydrateBoard])

  const visibleTasks = useMemo(() => filterBoardTasks(boardTasks, filter), [boardTasks, filter])

  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, Task[]>()
    for (const column of TASK_BOARD_COLUMNS) {
      byStatus.set(column.status, [])
    }
    for (const task of visibleTasks) {
      const column = columnStatusForTask(task)
      const bucket = byStatus.get(column)
      if (bucket) {
        bucket.push(task)
      }
    }
    return TASK_BOARD_COLUMNS.map((column) => ({
      ...column,
      tasks: sortTasksByPin(byStatus.get(column.status) ?? [], pinnedIds)
    }))
  }, [visibleTasks, pinnedIds])

  // Why: filter dropdowns offer only the sources/projects actually present.
  const sourceOptions = useMemo(() => presentSources(boardTasks), [boardTasks])
  const projectOptions = useMemo(() => {
    const bySelector = new Map<string, string>()
    for (const task of boardTasks) {
      const selector = task.dispatchTarget?.repoSelector
      if (selector) {
        bySelector.set(selector, task.repo ?? selector)
      }
    }
    return [...bySelector.entries()].map(([selector, name]) => ({ selector, name }))
  }, [boardTasks])

  const togglePin = useCallback((taskId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }, [])

  const onOpenAgent = useCallback(
    (task: Task) => {
      if (!task.worktree) {
        return
      }
      openActivityPage()
      activateAndRevealWorktree(task.worktree)
    },
    [openActivityPage]
  )

  const onOpenExternal = useCallback((url: string) => {
    window.open(url, '_blank')
  }, [])

  const selectedTask = useMemo(
    () => (selectedTaskId ? (boardTasks.find((t) => t.id === selectedTaskId) ?? null) : null),
    [selectedTaskId, boardTasks]
  )

  const activeDragTask = useMemo(
    () => (activeDragId ? (boardTasks.find((t) => t.id === activeDragId) ?? null) : null),
    [activeDragId, boardTasks]
  )

  const openRepoPrompt = useCallback(async (taskId: string) => {
    const entries = await loadWorkspaceRepos()
    setRepos(entries)
    setRepoId(entries.length === 1 ? entries[0].id : '')
    setRepoPrompt({ taskId })
  }, [])

  // Why: shared dispatch path for both drag-into-active and the detail panel's
  // Dispatch button. Auto-dispatch when the task has a repo target, else prompt.
  const requestDispatch = useCallback(
    async (task: Task) => {
      if (task.currentRun) {
        return
      }
      const selector = task.dispatchTarget?.repoSelector
      if (selector) {
        setDispatchingId(task.id)
        try {
          await dispatchBoardTask(task.id)
        } catch (err) {
          toast.error(`Could not dispatch "${task.title}"`, {
            description: err instanceof Error ? err.message : String(err)
          })
        } finally {
          setDispatchingId(null)
        }
      } else {
        await openRepoPrompt(task.id)
      }
    },
    [dispatchBoardTask, openRepoPrompt]
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      const over = event.over
      if (!over) {
        return
      }
      const targetStatus = over.id as TaskStatus
      const task = boardTasks.find((t) => t.id === event.active.id)
      if (!task) {
        return
      }
      // Why: dropping into the active column dispatches an agent when the task
      // has none yet; otherwise it is a plain status move. Manual-mode tasks
      // never dispatch - the drop just moves their status (the captain works
      // them by hand).
      if (targetStatus === DISPATCH_COLUMN && !task.currentRun && task.mode !== 'manual') {
        void requestDispatch(task)
        return
      }
      if (columnStatusForTask(task) === targetStatus) {
        return
      }
      void moveBoardTask(task.id, targetStatus)
    },
    [boardTasks, moveBoardTask, requestDispatch]
  )

  const onSync = useCallback(async () => {
    setSyncing(true)
    await syncBoardLinear()
    setSyncing(false)
  }, [syncBoardLinear])

  const openComposerInColumn = useCallback((status: TaskStatus) => {
    setComposerStatus(status)
    setComposerOpen(true)
  }, [])

  const submitNewTask = useCallback(async () => {
    const title = newTitle.trim()
    if (title.length === 0) {
      return
    }
    const mode = newMode
    const status = composerStatus
    setNewTitle('')
    setNewMode('project')
    setComposerOpen(false)
    const created = await createBoardTask({ title, mode })
    // Why: create-in-column seeds the task into the dropped column's status
    // (a plain status move, never an auto-dispatch).
    if (created && status !== 'backlog') {
      await moveBoardTask(created.id, status)
    }
  }, [newTitle, newMode, composerStatus, createBoardTask, moveBoardTask])

  const confirmRepoDispatch = useCallback(async () => {
    if (!repoPrompt || !repoId) {
      return
    }
    const taskId = repoPrompt.taskId
    const title = boardTasks.find((t) => t.id === taskId)?.title ?? 'task'
    setRepoPrompt(null)
    setDispatchingId(taskId)
    try {
      await dispatchBoardTask(taskId, `id:${repoId}`)
    } catch (err) {
      toast.error(`Could not dispatch "${title}"`, {
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setDispatchingId(null)
    }
  }, [repoPrompt, repoId, dispatchBoardTask, boardTasks])

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h1 className="text-[15px] font-semibold tracking-tight">Board</h1>
        <div className="ml-3 flex items-center gap-1.5">
          <Input
            value={filter.text}
            onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
            placeholder="Filter tasks..."
            className="h-8 w-[180px] text-[12px]"
          />
          <Select
            value={filter.source}
            onValueChange={(value) => setFilter((f) => ({ ...f, source: value as Source | 'all' }))}
          >
            <SelectTrigger size="sm" className="h-8 w-[130px] text-[12px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sourceOptions.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.project}
            onValueChange={(value) => setFilter((f) => ({ ...f, project: value }))}
          >
            <SelectTrigger size="sm" className="h-8 w-[150px] text-[12px]">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projectOptions.map((project) => (
                <SelectItem key={project.selector} value={project.selector}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void onSync()}>
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Sync Linear
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setComposerStatus('backlog')
              setComposerOpen(true)
            }}
          >
            <Plus className="size-4" />
            New task
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDragId(null)}
        >
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {columns.map((column) => (
              <BoardColumn
                key={column.status}
                status={column.status}
                label={column.label}
                tasks={column.tasks}
                selectedTaskId={selectedTaskId}
                onSelect={(task) => setSelectedTaskId(task.id)}
                onOpenAgent={onOpenAgent}
                onOpenExternal={onOpenExternal}
                onCreateInColumn={openComposerInColumn}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDragTask ? <TaskCardOverlay task={activeDragTask} /> : null}
          </DragOverlay>
        </DndContext>

        {selectedTask ? (
          <TaskDetailPanel
            task={selectedTask}
            dispatching={dispatchingId === selectedTask.id}
            pinned={pinnedIds.has(selectedTask.id)}
            onClose={() => setSelectedTaskId(null)}
            onDispatch={(task) => void requestDispatch(task)}
            onOpenAgent={onOpenAgent}
            onMoveStatus={(id, status) => void moveBoardTask(id, status)}
            onSetProject={(id, repoSelector) => void setBoardTaskProject(id, repoSelector)}
            onTogglePin={togglePin}
            onOpenExternal={onOpenExternal}
          />
        ) : null}
      </div>

      <TaskBoardComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        newTitle={newTitle}
        onNewTitleChange={setNewTitle}
        newMode={newMode}
        onNewModeChange={setNewMode}
        onSubmit={() => void submitNewTask()}
      />

      <TaskBoardRepoPromptDialog
        open={repoPrompt !== null}
        onOpenChange={(open) => !open && setRepoPrompt(null)}
        repos={repos}
        repoId={repoId}
        onRepoIdChange={setRepoId}
        onConfirm={() => void confirmRepoDispatch()}
      />
    </div>
  )
}
