import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ConductorNoticeRef } from '../perch/perch-types'
import type { SkillTaskManifest } from '../../shared/workflows/skill-task-manifest'
import { getWorkflowReportsDir } from './paths'

export type LandingArtifactStatus = {
  complete: boolean
  summaryPath?: string
  dataPath?: string
  summaryPreview?: string
}

export function verifyLandingArtifacts(
  manifest: SkillTaskManifest,
  runId: string
): LandingArtifactStatus {
  const summaryPath = join(
    getWorkflowReportsDir(runId),
    manifest.landing.paths.summary.split('/').pop() ?? 'summary.md'
  )
  const dataPath = join(
    getWorkflowReportsDir(runId),
    manifest.landing.paths.data.split('/').pop() ?? 'result.json'
  )
  const summaryExists = existsSync(summaryPath)
  const dataExists = existsSync(dataPath)
  const summaryPreview = summaryExists
    ? readFileSync(summaryPath, 'utf8').split('\n').slice(0, 5).join('\n')
    : undefined
  return {
    complete: summaryExists && dataExists,
    summaryPath: summaryExists ? summaryPath : undefined,
    dataPath: dataExists ? dataPath : undefined,
    summaryPreview
  }
}

export function buildLandingNotice(args: {
  title: string
  status: LandingArtifactStatus
  ref: ConductorNoticeRef
}): string {
  const lines = [`**${args.title}** landing report is ready.`]
  if (args.status.summaryPreview) {
    lines.push('', args.status.summaryPreview)
  }
  if (args.status.summaryPath) {
    lines.push('', `Open report: ${args.status.summaryPath}`)
  }
  return lines.join('\n')
}
