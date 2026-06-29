import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { loadWorkspaceRepos, type WorkspaceRepoEntry } from '@/perch/perch-client'

export function ConductorDispatchDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const dispatchConductorWork = useAppStore((s) => s.dispatchConductorWork)
  const [repos, setRepos] = useState<WorkspaceRepoEntry[]>([])
  const [repoId, setRepoId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    void loadWorkspaceRepos().then((entries) => {
      setRepos(entries)
      // Why: preselect the only repo so a single-repo workspace skips the picker.
      setRepoId((current) => current || (entries.length === 1 ? entries[0].id : ''))
    })
  }, [open])

  const canSubmit = repoId.length > 0 && title.trim().length > 0 && !submitting

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return
    }
    setSubmitting(true)
    const task = await dispatchConductorWork({
      repoSelector: `id:${repoId}`,
      title: title.trim(),
      brief: brief.trim() || undefined
    })
    setSubmitting(false)
    if (task) {
      setTitle('')
      setBrief('')
      onOpenChange(false)
    }
  }, [canSubmit, dispatchConductorWork, repoId, title, brief, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Start an agent</DialogTitle>
          <DialogDescription>
            Create a worktree and launch an agent in it. The conductor tracks it in the fleet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Workspace</span>
            <Select value={repoId} onValueChange={setRepoId}>
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
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Task title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Explore the firstmate project"
              className={cn(
                'h-9 rounded-md border border-input bg-background px-3 text-[13px]',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-foreground">Prompt (optional)</span>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="What should the agent do?"
              className={cn(
                'max-h-[160px] resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px]',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              )}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit} className="gap-1.5">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Start agent
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
