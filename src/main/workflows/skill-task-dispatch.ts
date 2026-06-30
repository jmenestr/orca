import { randomUUID } from 'node:crypto'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { ConductorTurnIntent } from '../../shared/workflows/conductor-turn-intent'
import type { WorkflowsResolveResult } from '../../shared/workflows/skill-task-manifest'
import type { Kind, Landing } from '../perch/perch-types'
import { getIntegrationConfigService } from '../integration-config/service'
import { getWorkflowsService } from './resolve'
import { resolvedPaths } from './dispatch-prompt'

function mapKind(kind: string): Kind {
  if (
    kind === 'scout' ||
    kind === 'review' ||
    kind === 'general' ||
    kind === 'chore' ||
    kind === 'coding'
  ) {
    return kind
  }
  if (kind === 'ship') {
    return 'coding'
  }
  return 'chore'
}

function mapLanding(manifest: WorkflowsResolveResult['manifest']): Landing {
  return manifest.landing.type === 'report' ? 'report' : 'pr'
}

export async function dispatchSkillTaskFromConductor(args: {
  runtime: OrcaRuntimeService
  intent: ConductorTurnIntent
}): Promise<{ perchTaskId: string; runId: string; resolved: WorkflowsResolveResult }> {
  const taskId = args.intent.skillTaskId
  if (!taskId) {
    throw new Error('Missing skillTaskId.')
  }
  const runId = randomUUID()
  const resolved = getWorkflowsService().resolve(taskId, args.intent.userContext, runId)
  const landing = resolvedPaths(resolved.manifest, runId)
  const fleet = args.runtime.getPerchFleetService()
  const repoSelector =
    resolved.manifest.workspace?.repoSelector ??
    args.runtime.listRepos()[0]?.displayName ??
    args.runtime.listRepos()[0]?.path
  if (!repoSelector) {
    throw new Error('Add a repo in Orca before dispatching SkillTasks.')
  }

  for (const profileId of resolved.manifest.integration.profiles) {
    getIntegrationConfigService().startSession(profileId, runId)
  }

  const dispatch = await fleet.dispatchWork({
    repoSelector,
    title: resolved.manifest.title,
    brief: args.intent.userContext || resolved.manifest.title,
    kind: mapKind(resolved.manifest.kind),
    landing: mapLanding(resolved.manifest),
    startupPrompt: resolved.dispatchPrompt.replaceAll('{runId}', runId),
    name: resolved.manifest.id
  })

  const perchTaskId = dispatch.task.id
  const db = args.runtime.getPerchDb()
  const existing = db.getTask(perchTaskId)
  if (existing) {
    db.upsertTask({
      ...existing,
      source: 'custom',
      context: {
        ...(typeof existing.context === 'object' && existing.context ? existing.context : {}),
        skillTaskId: taskId,
        integrationProfiles: resolved.manifest.integration.profiles,
        landingPaths: landing,
        runId,
        reviewMode: resolved.manifest.review?.mode ?? 'chat-only'
      }
    })
  }

  return { perchTaskId, runId, resolved }
}

export async function steerPerchRunFollowUp(args: {
  runtime: OrcaRuntimeService
  intent: ConductorTurnIntent
}): Promise<{ perchTaskId: string }> {
  const perchTaskId = args.intent.perchTaskId
  if (!perchTaskId) {
    throw new Error('Missing perchTaskId.')
  }
  const db = args.runtime.getPerchDb()
  const task = db.getTask(perchTaskId)
  if (!task) {
    throw new Error(`Unknown Perch task: ${perchTaskId}`)
  }
  const fleet = args.runtime.getPerchFleetService()
  const repoSelector = task.dispatchTarget?.repoSelector ?? task.repo ?? ''
  await fleet.dispatchExistingTask(perchTaskId, repoSelector)
  return { perchTaskId }
}
