import type {
  SkillTaskManifest,
  WorkflowsResolveResult
} from '../../shared/workflows/skill-task-manifest'
import { getWorkflowSkillPath, getWorkflowsRoot, resolveDefaultScriptsRoot } from './paths'

export function buildDispatchPrompt(args: {
  manifest: SkillTaskManifest
  skillPath: string
  runId: string
  userContext: string
  integrationProfiles: string[]
}): string {
  const summaryPath = args.manifest.landing.paths.summary.replace('{runId}', args.runId)
  const dataPath = args.manifest.landing.paths.data.replace('{runId}', args.runId)
  const lines = [
    `# SkillTask: ${args.manifest.title} (${args.manifest.id})`,
    '',
    'Follow the linked skill exactly. Do not improvise flags outside scriptContracts.',
    '',
    `Skill file: ${args.skillPath}`,
    `Run id: ${args.runId}`,
    `Integration profiles: ${args.integrationProfiles.join(', ')}`,
    '',
    'Secrets: use `orca integration request --profile <profile> --method ... --path ...` only.',
    'Public config is available via ORCA_INTEGRATION_* env vars at dispatch.',
    '',
    'Landing artifacts (required before done):',
    `- summary: ${summaryPath}`,
    `- data: ${dataPath}`,
    `- schema: ${args.manifest.landing.schema}`,
    '',
    args.manifest.precheck ? `Precheck: ${args.manifest.precheck.command}` : null,
    args.userContext ? `Captain context: ${args.userContext}` : null
  ].filter(Boolean)
  return lines.join('\n')
}

export function resolvedPaths(
  manifest: SkillTaskManifest,
  runId: string
): {
  summaryPath: string
  dataPath: string
} {
  const root = getWorkflowsRoot()
  return {
    summaryPath: `${root}/${manifest.landing.paths.summary.replace('{runId}', runId)}`,
    dataPath: `${root}/${manifest.landing.paths.data.replace('{runId}', runId)}`
  }
}

export function toResolveResult(args: {
  manifest: SkillTaskManifest
  skillBody?: string
  runId: string
  userContext: string
  integrationProfiles: string[]
}): WorkflowsResolveResult {
  const skillPath = getWorkflowSkillPath(
    args.manifest.skill.replace(/^skills\//, '').replace(/\/SKILL\.md$/, '')
  )
  return {
    manifest: args.manifest,
    skillPath,
    skillBody: args.skillBody,
    workflowsRoot: getWorkflowsRoot(),
    scriptsRoot: resolveDefaultScriptsRoot(),
    publicIntegrationEnv: {},
    dispatchPrompt: buildDispatchPrompt({
      manifest: args.manifest,
      skillPath,
      runId: args.runId,
      userContext: args.userContext,
      integrationProfiles: args.integrationProfiles
    })
  }
}
