import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkflowsCatalogEntry } from '../../../../shared/workflows/skill-task-manifest'

export type ConductorSuggestion = {
  token: string
  label: string
  detail?: string
}

export function useConductorComposerSuggestions(draft: string): {
  suggestions: ConductorSuggestion[]
  active: boolean
  reload: () => void
} {
  const [tasks, setTasks] = useState<WorkflowsCatalogEntry[]>([])
  const [skills, setSkills] = useState<{ id: string; name: string }[]>([])

  const reload = useCallback(() => {
    const list = window.api?.workflows?.list
    if (!list) {
      return
    }
    void list()
      .then((result) => {
        const payload = result as {
          tasks: WorkflowsCatalogEntry[]
          skills: { id: string; name: string }[]
        }
        setTasks(payload.tasks ?? [])
        setSkills(payload.skills ?? [])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return useMemo(() => {
    const taskSuggestions = (query: string): ConductorSuggestion[] =>
      tasks
        .filter(
          (task) =>
            query.length === 0 ||
            task.id.includes(query) ||
            task.title.toLowerCase().includes(query)
        )
        .slice(0, 8)
        .map((task) => ({
          token: `@task:${task.id}`,
          label: task.title,
          detail: `@task:${task.id}`
        }))

    if (/(?:^|\s)@$/u.test(draft) || /(?:^|\s)@task$/u.test(draft)) {
      const suggestions = taskSuggestions('')
      if (suggestions.length === 0) {
        return {
          suggestions: [
            {
              token: '',
              label: 'No SkillTasks yet',
              detail: 'Open Workflows in the sidebar to import verify-expenses'
            }
          ],
          active: true,
          reload
        }
      }
      return { suggestions, active: true, reload }
    }

    const taskMatch = draft.match(/(?:^|\s)@task:?([a-z0-9-]*)$/iu)
    if (taskMatch) {
      const query = (taskMatch[1] ?? '').toLowerCase()
      const suggestions = taskSuggestions(query)
      return { suggestions, active: suggestions.length > 0, reload }
    }

    const skillMatch = draft.match(/(?:^|\s)\/skill:?([a-z0-9-]*)$/iu)
    if (skillMatch) {
      const query = (skillMatch[1] ?? '').toLowerCase()
      const suggestions = skills
        .filter(
          (skill) =>
            query.length === 0 ||
            skill.name.toLowerCase().includes(query) ||
            skill.id.includes(query)
        )
        .slice(0, 8)
        .map((skill) => ({
          token: `/skill:${skill.name}`,
          label: skill.name,
          detail: 'Skill override'
        }))
      return { suggestions, active: suggestions.length > 0, reload }
    }

    return { suggestions: [], active: false, reload }
  }, [draft, reload, skills, tasks])
}

export function applyConductorSuggestion(draft: string, token: string): string {
  if (!token) {
    return draft
  }
  const taskTail = draft.match(/^(.*?)(?:^|\s)@task:?[a-z0-9-]*$/iu)
  if (taskTail) {
    const head = taskTail[1] ?? ''
    const spacer = head.length > 0 && !head.endsWith(' ') ? ' ' : ''
    return `${head}${spacer}${token} `
  }
  const atTaskTail = draft.match(/^(.*?)(?:^|\s)@task$/iu)
  if (atTaskTail) {
    const head = atTaskTail[1] ?? ''
    const spacer = head.length > 0 && !head.endsWith(' ') ? ' ' : ''
    return `${head}${spacer}${token} `
  }
  const atOnly = draft.match(/^(.*?)(?:^|\s)@$/u)
  if (atOnly) {
    const head = atOnly[1] ?? ''
    const spacer = head.length > 0 && !head.endsWith(' ') ? ' ' : ''
    return `${head}${spacer}${token} `
  }
  const skillTail = draft.match(/^(.*?)(?:^|\s)\/skill:?[a-z0-9-]*$/iu)
  if (skillTail) {
    const head = skillTail[1] ?? ''
    const spacer = head.length > 0 && !head.endsWith(' ') ? ' ' : ''
    return `${head}${spacer}${token} `
  }
  return `${draft.trim()} ${token}`.trim()
}
