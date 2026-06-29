import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TaskMode, WorkspaceRepoEntry } from '@/perch/perch-client'

export function TaskBoardComposerDialog({
  open,
  onOpenChange,
  newTitle,
  onNewTitleChange,
  newMode,
  onNewModeChange,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  newTitle: string
  onNewTitleChange: (value: string) => void
  newMode: TaskMode
  onNewModeChange: (value: TaskMode) => void
  onSubmit: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Add a task to the board. Drag it into In progress to dispatch an agent.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={newTitle}
          onChange={(e) => onNewTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="What needs doing?"
          className="text-[13px]"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Mode</span>
          <Select value={newMode} onValueChange={(value) => onNewModeChange(value as TaskMode)}>
            <SelectTrigger size="sm" className="h-8 w-[180px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Project (worktree agent)</SelectItem>
              <SelectItem value="scratch">Scratch (floating agent)</SelectItem>
              <SelectItem value="manual">Manual (no agent)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={newTitle.trim().length === 0}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TaskBoardRepoPromptDialog({
  open,
  onOpenChange,
  repos,
  repoId,
  onRepoIdChange,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  repos: WorkspaceRepoEntry[]
  repoId: string
  onRepoIdChange: (value: string) => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Dispatch an agent</DialogTitle>
          <DialogDescription>
            Pick the workspace to create a worktree in for this task.
          </DialogDescription>
        </DialogHeader>
        <Select value={repoId} onValueChange={onRepoIdChange}>
          <SelectTrigger className="h-9 text-[13px]">
            <SelectValue placeholder={repos.length === 0 ? 'No repos found' : 'Pick a repo'} />
          </SelectTrigger>
          <SelectContent>
            {repos.map((repo) => (
              <SelectItem key={repo.id} value={repo.id}>
                {repo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!repoId}>
            Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
