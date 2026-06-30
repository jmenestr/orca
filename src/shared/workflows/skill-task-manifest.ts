export type SkillTaskKind = 'chore' | 'general' | 'scout' | 'coding' | 'review'

export type SkillTaskVisibility = 'board' | 'silent'

export type SkillTaskReviewMode = 'report-first' | 'chat-only'

export type SkillTaskLandingPaths = {
  summary: string
  data: string
}

export type SkillTaskLanding = {
  type: 'report'
  paths: SkillTaskLandingPaths
  schema: string
}

export type SkillTaskScriptContract = {
  id: string
  path: string
  command: string[]
  expectExitCode?: number
  minVersion?: string
}

export type SkillTaskPrecheck = {
  command: string
  timeoutSeconds?: number
}

export type SkillTaskManifest = {
  id: string
  title: string
  version: number
  skill: string
  workspace?: { name?: string; repoSelector?: string }
  integration: { profiles: string[] }
  kind: SkillTaskKind
  landing: SkillTaskLanding
  review?: { mode: SkillTaskReviewMode }
  visibility?: SkillTaskVisibility
  aliases?: string[]
  scriptContracts?: SkillTaskScriptContract[]
  precheck?: SkillTaskPrecheck
}

export type WorkflowSkillRecord = {
  id: string
  name: string
  description: string
  body: string
  createdAt: number
  updatedAt: number
}

export type WorkflowSkillTaskRecord = {
  id: string
  title: string
  version: number
  skillId: string
  integrationProfiles: string[]
  kind: SkillTaskKind
  landing: SkillTaskLanding
  reviewMode?: SkillTaskReviewMode
  visibility: SkillTaskVisibility
  aliases: string[]
  scriptContracts: SkillTaskScriptContract[]
  precheck?: SkillTaskPrecheck
  workspaceRepoSelector?: string
  createdAt: number
  updatedAt: number
}

export type WorkflowsCatalogEntry = {
  id: string
  title: string
  skillId: string
  skillName: string
  integrationProfiles: string[]
  aliases: string[]
  visibility: SkillTaskVisibility
}

export type WorkflowsResolveResult = {
  manifest: SkillTaskManifest
  skillPath: string
  skillBody?: string
  workflowsRoot: string
  scriptsRoot: string
  publicIntegrationEnv: Record<string, string>
  dispatchPrompt: string
}
