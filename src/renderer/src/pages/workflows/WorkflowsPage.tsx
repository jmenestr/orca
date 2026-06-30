import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type {
  WorkflowSkillRecord,
  WorkflowSkillTaskRecord
} from '../../../../shared/workflows/skill-task-manifest'

export default function WorkflowsPage(): React.JSX.Element {
  const closeSkillsPage = useAppStore((s) => s.closeSkillsPage)
  const openConductorPage = useAppStore((s) => s.openConductorPage)
  const [skills, setSkills] = useState<WorkflowSkillRecord[]>([])
  const [tasks, setTasks] = useState<WorkflowSkillTaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const refresh = useCallback(async () => {
    if (!window.api?.workflows) {
      setLoadError('Restart Orca to load the Workflows feature (preload update required).')
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [skillResult, taskResult] = await Promise.all([
        window.api.workflows.skillList(),
        window.api.workflows.taskList()
      ])
      const nextSkills = skillResult.skills as WorkflowSkillRecord[]
      const nextTasks = taskResult.tasks as WorkflowSkillTaskRecord[]
      setSkills(nextSkills)
      setTasks(nextTasks)
      if (nextSkills.length > 0 && !selectedSkillId) {
        setSelectedSkillId(nextSkills[0]!.id)
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load workflows')
    } finally {
      setLoading(false)
    }
  }, [selectedSkillId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? null

  useEffect(() => {
    if (selectedSkill) {
      setDraftName(selectedSkill.name)
      setDraftDescription(selectedSkill.description)
      setDraftBody(selectedSkill.body)
    }
  }, [selectedSkill])

  const saveSkill = async (): Promise<void> => {
    if (!selectedSkillId || !window.api?.workflows) {
      return
    }
    await window.api.workflows.skillUpdate({
      skillId: selectedSkillId,
      name: draftName,
      description: draftDescription,
      body: draftBody
    })
    await refresh()
    toast.success('Skill saved')
  }

  const copyTaskToken = async (taskId: string): Promise<void> => {
    await window.api.ui.writeClipboardText(`@task:${taskId}`)
    toast.success('Copied to clipboard')
  }

  const runInConductor = (taskId: string): void => {
    closeSkillsPage()
    openConductorPage()
    toast.message(`In Conductor, send: @task:${taskId}`)
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={closeSkillsPage} className="size-7">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">Workflows</h1>
          <p className="text-[12px] text-muted-foreground">
            SkillTasks dispatch from Conductor with @task:id
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">SkillTasks</h2>
            {tasks.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">No SkillTasks</CardTitle>
                  <CardDescription>
                    Restart Orca if this stays empty — verify-expenses should seed automatically.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              tasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{task.title}</CardTitle>
                    <CardDescription>
                      <code className="rounded bg-muted px-1">@task:{task.id}</code>
                      {' · '}
                      {task.integrationProfiles.join(', ')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => runInConductor(task.id)}>
                      Run in Conductor
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => void copyTaskToken(task.id)}
                    >
                      <Copy className="size-3.5" />
                      Copy @task:{task.id}
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Skills</h2>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  void (async () => {
                    if (!window.api?.workflows) {
                      return
                    }
                    const created = (await window.api.workflows.skillCreate({
                      name: 'New skill',
                      description: '',
                      body: '# New skill\n'
                    })) as WorkflowSkillRecord
                    await refresh()
                    setSelectedSkillId(created.id)
                  })()
                }}
              >
                <Plus className="size-4" />
                New
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
              <div className="space-y-1">
                {skills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelectedSkillId(skill.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px]',
                      selectedSkillId === skill.id ? 'bg-muted' : 'hover:bg-muted/60'
                    )}
                  >
                    <span className="truncate">{skill.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        void window.api?.workflows?.skillDelete({ skillId: skill.id }).then(refresh)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </button>
                ))}
              </div>
              {selectedSkill ? (
                <div className="space-y-3">
                  <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  <Input
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder="Description"
                  />
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className={cn(
                      'min-h-[280px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-[13px] shadow-xs outline-none',
                      'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
                    )}
                  />
                  <Button onClick={() => void saveSkill()}>Save skill</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a skill to edit.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
