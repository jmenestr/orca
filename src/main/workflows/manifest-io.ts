import { readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import type {
  SkillTaskManifest,
  WorkflowSkillRecord,
  WorkflowSkillTaskRecord
} from '../../shared/workflows/skill-task-manifest'

export function recordToManifest(
  task: WorkflowSkillTaskRecord,
  skillRelativePath: string
): SkillTaskManifest {
  return {
    id: task.id,
    title: task.title,
    version: task.version,
    skill: skillRelativePath,
    workspace: task.workspaceRepoSelector
      ? { repoSelector: task.workspaceRepoSelector }
      : undefined,
    integration: { profiles: task.integrationProfiles },
    kind: task.kind,
    landing: task.landing,
    review: task.reviewMode ? { mode: task.reviewMode } : undefined,
    visibility: task.visibility,
    aliases: task.aliases,
    scriptContracts: task.scriptContracts,
    precheck: task.precheck
  }
}

export function writeTaskYaml(path: string, manifest: SkillTaskManifest): void {
  writeFileSync(path, stringify(manifest), 'utf8')
}

export function readTaskYaml(path: string): SkillTaskManifest {
  const raw = readFileSync(path, 'utf8')
  return parse(raw) as SkillTaskManifest
}

export function writeSkillMarkdown(path: string, skill: WorkflowSkillRecord): void {
  const frontmatter = stringify({
    name: skill.name,
    description: skill.description
  }).trim()
  writeFileSync(path, `---\n${frontmatter}\n---\n\n${skill.body.trim()}\n`, 'utf8')
}

export function readSkillMarkdown(
  path: string
): Pick<WorkflowSkillRecord, 'name' | 'description' | 'body'> {
  const raw = readFileSync(path, 'utf8')
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(raw)
  if (!match) {
    return { name: 'skill', description: '', body: raw.trim() }
  }
  const meta = parse(match[1]) as { name?: string; description?: string }
  return {
    name: meta.name ?? 'skill',
    description: meta.description ?? '',
    body: match[2]?.trim() ?? ''
  }
}
