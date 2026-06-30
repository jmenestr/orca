import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  SkillTaskLanding,
  SkillTaskScriptContract,
  WorkflowSkillRecord,
  WorkflowSkillTaskRecord
} from '../../shared/workflows/skill-task-manifest'
import { resolveExampleWorkflowsRoot, ensureWorkflowScriptsPath } from './paths'
import { readSkillMarkdown, readTaskYaml } from './manifest-io'
import { getWorkflowsStore } from './store'
import { materializeWorkflows } from './materializer'

type WorkflowTemplatePack = {
  id: string
  label: string
  skillDir: string
  taskFile: string
}

const TEMPLATE_PACKS: WorkflowTemplatePack[] = [
  {
    id: 'verify-expenses',
    label: 'Verify expenses',
    skillDir: 'skills/notion-budget-verify',
    taskFile: 'tasks/verify-expenses.task.yaml'
  },
  {
    id: 'monthly-summary',
    label: 'Monthly spending summary',
    skillDir: 'skills/notion-budget-summary',
    taskFile: 'tasks/monthly-summary.task.yaml'
  }
]

function importTemplatePack(
  pack: WorkflowTemplatePack,
  root: string
): {
  skill: WorkflowSkillRecord
  task: WorkflowSkillTaskRecord
} {
  const skillPath = join(root, pack.skillDir, 'SKILL.md')
  const taskPath = join(root, pack.taskFile)
  if (!existsSync(skillPath) || !existsSync(taskPath)) {
    throw new Error(`Template pack files missing for ${pack.id}.`)
  }
  const parsedSkill = readSkillMarkdown(skillPath)
  const manifest = readTaskYaml(taskPath)
  const now = Math.floor(Date.now() / 1000)
  const skillId = manifest.skill.replace(/^skills\//, '').replace(/\/SKILL\.md$/, '')
  const skill: WorkflowSkillRecord = {
    id: skillId,
    name: parsedSkill.name,
    description: parsedSkill.description,
    body: parsedSkill.body,
    createdAt: now,
    updatedAt: now
  }
  const task: WorkflowSkillTaskRecord = {
    id: manifest.id,
    title: manifest.title,
    version: manifest.version,
    skillId,
    integrationProfiles: manifest.integration.profiles,
    kind: manifest.kind,
    landing: manifest.landing as SkillTaskLanding,
    reviewMode: manifest.review?.mode,
    visibility: manifest.visibility ?? 'board',
    aliases: manifest.aliases ?? [],
    scriptContracts: (manifest.scriptContracts ?? []) as SkillTaskScriptContract[],
    precheck: manifest.precheck,
    workspaceRepoSelector: manifest.workspace?.repoSelector,
    createdAt: now,
    updatedAt: now
  }
  return { skill, task }
}

export function importWorkflowTemplate(templateId: string): { skillId: string; taskId: string } {
  const pack = TEMPLATE_PACKS.find((entry) => entry.id === templateId)
  if (!pack) {
    throw new Error(`Unknown workflow template: ${templateId}`)
  }
  const root = resolveExampleWorkflowsRoot()
  const { skill, task } = importTemplatePack(pack, root)
  ensureWorkflowScriptsPath(join(root, 'scripts'))
  const store = getWorkflowsStore()
  store.upsertSkill(skill)
  store.upsertTask(task)
  materializeWorkflows()
  return { skillId: skill.id, taskId: task.id }
}

export function listWorkflowTemplates(): { id: string; label: string }[] {
  return TEMPLATE_PACKS.map((pack) => ({ id: pack.id, label: pack.label }))
}

export function createWorkflowSkill(input: {
  name: string
  description: string
  body: string
}): WorkflowSkillRecord {
  const now = Math.floor(Date.now() / 1000)
  const skill: WorkflowSkillRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now
  }
  getWorkflowsStore().upsertSkill(skill)
  materializeWorkflows()
  return skill
}

export function updateWorkflowSkill(
  skillId: string,
  input: Partial<Pick<WorkflowSkillRecord, 'name' | 'description' | 'body'>>
): WorkflowSkillRecord {
  const store = getWorkflowsStore()
  const existing = store.getSkill(skillId)
  if (!existing) {
    throw new Error(`Unknown skill: ${skillId}`)
  }
  const updated: WorkflowSkillRecord = {
    ...existing,
    ...input,
    updatedAt: Math.floor(Date.now() / 1000)
  }
  store.upsertSkill(updated)
  materializeWorkflows()
  return updated
}

export function deleteWorkflowSkill(skillId: string): void {
  getWorkflowsStore().deleteSkill(skillId)
  materializeWorkflows()
}

export function createWorkflowTask(
  input: Omit<WorkflowSkillTaskRecord, 'createdAt' | 'updatedAt'>
): WorkflowSkillTaskRecord {
  const now = Math.floor(Date.now() / 1000)
  const task: WorkflowSkillTaskRecord = {
    ...input,
    createdAt: now,
    updatedAt: now
  }
  getWorkflowsStore().upsertTask(task)
  materializeWorkflows()
  return task
}

export function updateWorkflowTask(
  taskId: string,
  input: Partial<Omit<WorkflowSkillTaskRecord, 'id' | 'createdAt'>>
): WorkflowSkillTaskRecord {
  const store = getWorkflowsStore()
  const existing = store.getTask(taskId)
  if (!existing) {
    throw new Error(`Unknown SkillTask: ${taskId}`)
  }
  const updated: WorkflowSkillTaskRecord = {
    ...existing,
    ...input,
    updatedAt: Math.floor(Date.now() / 1000)
  }
  store.upsertTask(updated)
  materializeWorkflows()
  return updated
}

export function deleteWorkflowTask(taskId: string): void {
  getWorkflowsStore().deleteTask(taskId)
  materializeWorkflows()
}
