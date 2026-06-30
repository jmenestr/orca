import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  WorkflowsCatalogEntry,
  WorkflowSkillRecord,
  WorkflowSkillTaskRecord
} from '../../shared/workflows/skill-task-manifest'
import {
  getWorkflowSkillDir,
  getWorkflowSkillPath,
  getWorkflowTaskPath,
  getWorkflowsIndexPath,
  getWorkflowsRoot
} from './paths'
import { recordToManifest, writeSkillMarkdown, writeTaskYaml } from './manifest-io'
import { getWorkflowsStore } from './store'

function writeIndex(skills: WorkflowSkillRecord[], tasks: WorkflowSkillTaskRecord[]): void {
  const entries: WorkflowsCatalogEntry[] = tasks.map((task) => {
    const skill = skills.find((entry) => entry.id === task.skillId)
    return {
      id: task.id,
      title: task.title,
      skillId: task.skillId,
      skillName: skill?.name ?? task.skillId,
      integrationProfiles: task.integrationProfiles,
      aliases: task.aliases,
      visibility: task.visibility
    }
  })
  writeFileSync(
    getWorkflowsIndexPath(),
    JSON.stringify(
      {
        version: 1,
        tasks: entries,
        skills: skills.map((skill) => ({ id: skill.id, name: skill.name }))
      },
      null,
      2
    ),
    'utf8'
  )
}

export function materializeWorkflows(): { skills: number; tasks: number } {
  const store = getWorkflowsStore()
  const skills = store.listSkills()
  const tasks = store.listTasks()
  mkdirSync(getWorkflowsRoot(), { recursive: true })
  mkdirSync(join(getWorkflowsRoot(), 'skills'), { recursive: true })
  mkdirSync(join(getWorkflowsRoot(), 'tasks'), { recursive: true })

  for (const skill of skills) {
    mkdirSync(getWorkflowSkillDir(skill.id), { recursive: true })
    writeSkillMarkdown(getWorkflowSkillPath(skill.id), skill)
  }

  for (const task of tasks) {
    const skillRelative = `skills/${task.skillId}/SKILL.md`
    writeTaskYaml(getWorkflowTaskPath(task.id), recordToManifest(task, skillRelative))
  }

  writeIndex(skills, tasks)
  return { skills: skills.length, tasks: tasks.length }
}

export function removeMaterializedSkill(skillId: string): void {
  const dir = getWorkflowSkillDir(skillId)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function removeMaterializedTask(taskId: string): void {
  const path = getWorkflowTaskPath(taskId)
  if (existsSync(path)) {
    rmSync(path, { force: true })
  }
}
