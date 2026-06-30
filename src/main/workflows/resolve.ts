import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type {
  SkillTaskManifest,
  WorkflowsCatalogEntry,
  WorkflowsResolveResult
} from '../../shared/workflows/skill-task-manifest'
import { getIntegrationConfigService } from '../integration-config/service'
import {
  getWorkflowSkillPath,
  getWorkflowTaskPath,
  getWorkflowsRoot,
  resolveDefaultScriptsRoot
} from './paths'
import { readTaskYaml, recordToManifest } from './manifest-io'
import { getWorkflowsStore } from './store'
import { buildDispatchPrompt, resolvedPaths } from './dispatch-prompt'
import { materializeWorkflows } from './materializer'

function catalogFromStore(): WorkflowsCatalogEntry[] {
  const store = getWorkflowsStore()
  return store.listTasks().map((task) => {
    const skill = store.getSkill(task.skillId)
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
}

function loadManifest(taskId: string): SkillTaskManifest | null {
  const store = getWorkflowsStore()
  const storeTask = store.getTask(taskId)
  if (storeTask) {
    materializeWorkflows()
    const path = getWorkflowTaskPath(taskId)
    if (existsSync(path)) {
      return readTaskYaml(path)
    }
    return recordToManifest(storeTask, `skills/${storeTask.skillId}/SKILL.md`)
  }
  const path = getWorkflowTaskPath(taskId)
  if (!existsSync(path)) {
    return null
  }
  return readTaskYaml(path)
}

function skillIdFromManifestSkillPath(skillPath: string): string {
  const match = /^skills\/([^/]+)\/SKILL\.md$/u.exec(skillPath)
  return match?.[1] ?? skillPath
}

function runScriptContract(
  scriptsRoot: string,
  contract: NonNullable<SkillTaskManifest['scriptContracts']>[number]
): string | null {
  const scriptPath = join(scriptsRoot, contract.path)
  if (!existsSync(scriptPath)) {
    return `Missing script contract file: ${contract.path}`
  }
  const command = contract.command.map((part) => part.replace(/^scripts\//, `${scriptsRoot}/`))
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: scriptsRoot,
    encoding: 'utf8',
    timeout: 30_000
  })
  const expected = contract.expectExitCode ?? 0
  if (result.status !== expected) {
    return `Script contract ${contract.id} failed with exit ${result.status ?? 'unknown'}.`
  }
  if (contract.minVersion) {
    const version = (result.stdout ?? '').trim()
    if (!version.includes(contract.minVersion)) {
      return `Script contract ${contract.id} version mismatch (expected ${contract.minVersion}).`
    }
  }
  return null
}

function runPrecheck(manifest: SkillTaskManifest, scriptsRoot: string): string | null {
  if (!manifest.precheck?.command) {
    return null
  }
  const result = spawnSync('sh', ['-lc', manifest.precheck.command], {
    cwd: scriptsRoot,
    encoding: 'utf8',
    timeout: (manifest.precheck.timeoutSeconds ?? 30) * 1000
  })
  if (result.status !== 0) {
    return result.stderr?.trim() || result.stdout?.trim() || 'Precheck failed.'
  }
  return null
}

export class WorkflowsService {
  list(): { tasks: WorkflowsCatalogEntry[]; skills: { id: string; name: string }[] } {
    const store = getWorkflowsStore()
    return {
      tasks: catalogFromStore(),
      skills: store.listSkills().map((skill) => ({ id: skill.id, name: skill.name }))
    }
  }

  resolve(
    taskId: string,
    userContext = '',
    runId = randomUUID(),
    options: { validateScripts?: boolean } = {}
  ): WorkflowsResolveResult {
    const manifest = loadManifest(taskId)
    if (!manifest) {
      const known = catalogFromStore().map((entry) => entry.id)
      if (known.length === 0) {
        throw new Error(
          `Unknown SkillTask: ${taskId}. Open Workflows in the sidebar and import a template first.`
        )
      }
      throw new Error(
        `Unknown SkillTask: ${taskId}. Available: ${known.map((id) => `@task:${id}`).join(', ')}`
      )
    }
    const integration = getIntegrationConfigService()
    const missing = integration.ensureProfilesConnected(manifest.integration.profiles)
    if (missing.length > 0) {
      const labels = missing
        .map((profileId) => (profileId === 'notion.budget' ? 'Notion budget' : profileId))
        .join(', ')
      throw new Error(
        `Cannot dispatch @task:${taskId}: connect ${labels} in Settings → Integrations → Workflow providers, then try again.`
      )
    }
    const scriptsRoot = resolveDefaultScriptsRoot()
    if (options.validateScripts) {
      for (const contract of manifest.scriptContracts ?? []) {
        const error = runScriptContract(scriptsRoot, contract)
        if (error) {
          throw new Error(`SkillTask ${taskId}: ${error}`)
        }
      }
      const precheckError = runPrecheck(manifest, scriptsRoot)
      if (precheckError) {
        throw new Error(`SkillTask ${taskId}: precheck failed - ${precheckError}`)
      }
    }

    const skillId = skillIdFromManifestSkillPath(manifest.skill)
    const skillPath = getWorkflowSkillPath(skillId)
    const skillBody = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : undefined
    const publicIntegrationEnv = integration.buildPublicEnv(manifest.integration.profiles)
    return {
      manifest,
      skillPath,
      skillBody,
      workflowsRoot: getWorkflowsRoot(),
      scriptsRoot,
      publicIntegrationEnv,
      dispatchPrompt: buildDispatchPrompt({
        manifest,
        skillPath,
        runId,
        userContext,
        integrationProfiles: manifest.integration.profiles
      })
    }
  }

  getManifest(taskId: string): SkillTaskManifest | null {
    return loadManifest(taskId)
  }

  validateTask(taskId: string): {
    ready: boolean
    checks: { id: string; label: string; ok: boolean; detail?: string }[]
  } {
    const checks: { id: string; label: string; ok: boolean; detail?: string }[] = []
    const manifest = loadManifest(taskId)
    if (!manifest) {
      checks.push({
        id: 'task',
        label: 'SkillTask exists',
        ok: false,
        detail: `Unknown task: ${taskId}`
      })
      return { ready: false, checks }
    }
    checks.push({ id: 'task', label: 'SkillTask exists', ok: true })

    const store = getWorkflowsStore()
    const skill = store.getSkill(
      manifest.skill.replace(/^skills\//, '').replace(/\/SKILL\.md$/, '')
    )
    const skillOk = Boolean(skill?.body?.trim())
    checks.push({
      id: 'skill',
      label: 'Skill instructions',
      ok: skillOk,
      detail: skillOk ? undefined : 'Add skill body text'
    })

    const integration = getIntegrationConfigService()
    for (const profileId of manifest.integration.profiles) {
      const status = integration.listProfiles().find((p) => p.profileId === profileId)
      const label =
        profileId === 'notion.budget' ? 'Notion budget connected' : `${profileId} connected`
      checks.push({
        id: `profile:${profileId}`,
        label,
        ok: status?.connected === true,
        detail: status?.connected ? undefined : 'Connect in Settings or Workflows'
      })
    }

    const scriptsRoot = resolveDefaultScriptsRoot()
    checks.push({
      id: 'scripts',
      label: 'Scripts directory',
      ok: existsSync(scriptsRoot),
      detail: existsSync(scriptsRoot) ? undefined : scriptsRoot
    })

    return { ready: checks.every((check) => check.ok), checks }
  }

  landingPathsForRun(manifest: SkillTaskManifest, runId: string): ReturnType<typeof resolvedPaths> {
    return resolvedPaths(manifest, runId)
  }
}

let singleton: WorkflowsService | null = null

export function getWorkflowsService(): WorkflowsService {
  if (!singleton) {
    singleton = new WorkflowsService()
  }
  return singleton
}

export function resetWorkflowsServiceForTests(): void {
  singleton = null
}
