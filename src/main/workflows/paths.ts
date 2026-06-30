import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function bundledWorkflowsCandidates(): string[] {
  const candidates: string[] = []
  try {
    const electron = require('electron') as { app: { getAppPath: () => string } }
    const app = electron.app
    if (process.resourcesPath) {
      candidates.push(join(process.resourcesPath, 'orca-workflows'))
    }
    const appPath = app.getAppPath()
    candidates.push(join(appPath, 'examples', 'orca-workflows'))
    candidates.push(join(appPath, '..', '..', 'examples', 'orca-workflows'))
  } catch {
    // Non-Electron contexts (tests, CLI) fall through to cwd-based paths.
  }
  candidates.push(join(process.cwd(), 'examples', 'orca-workflows'))
  candidates.push(join(__dirname, '..', '..', '..', 'examples', 'orca-workflows'))
  return candidates
}

function hasVerifyExpensesTemplate(root: string): boolean {
  return existsSync(join(root, 'tasks', 'verify-expenses.task.yaml'))
}

export function getWorkflowsRoot(): string {
  return join(homedir(), '.orca', 'workflows')
}

export function getWorkflowsStorePath(): string {
  return join(getWorkflowsRoot(), 'store.json')
}

export function getWorkflowsConfigPath(): string {
  return join(getWorkflowsRoot(), 'config.json')
}

export function getWorkflowsIndexPath(): string {
  return join(getWorkflowsRoot(), 'index.json')
}

export function getWorkflowSkillDir(skillId: string): string {
  return join(getWorkflowsRoot(), 'skills', skillId)
}

export function getWorkflowSkillPath(skillId: string): string {
  return join(getWorkflowSkillDir(skillId), 'SKILL.md')
}

export function getWorkflowTaskPath(taskId: string): string {
  return join(getWorkflowsRoot(), 'tasks', `${taskId}.task.yaml`)
}

export function getWorkflowReportsDir(runId: string): string {
  return join(getWorkflowsRoot(), 'reports', runId)
}

export function resolveExampleWorkflowsRoot(): string {
  for (const candidate of bundledWorkflowsCandidates()) {
    if (hasVerifyExpensesTemplate(candidate)) {
      return candidate
    }
  }
  return join(process.cwd(), 'examples', 'orca-workflows')
}

export function readWorkflowsConfig(): { scriptsPath?: string } {
  const configPath = getWorkflowsConfigPath()
  if (!existsSync(configPath)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as { scriptsPath?: string }
  } catch {
    return {}
  }
}

export function writeWorkflowsConfig(config: { scriptsPath?: string }): void {
  mkdirSync(getWorkflowsRoot(), { recursive: true })
  writeFileSync(getWorkflowsConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

export function resolveDefaultScriptsRoot(): string {
  const configured = readWorkflowsConfig().scriptsPath?.trim()
  if (configured) {
    return configured
  }
  const exampleRoot = resolveExampleWorkflowsRoot()
  const scriptsDir = join(exampleRoot, 'scripts')
  if (existsSync(scriptsDir)) {
    return scriptsDir
  }
  return join(process.cwd(), 'examples', 'orca-workflows', 'scripts')
}

export function ensureWorkflowScriptsPath(scriptsPath: string): void {
  const existing = readWorkflowsConfig()
  writeWorkflowsConfig({ ...existing, scriptsPath })
}
