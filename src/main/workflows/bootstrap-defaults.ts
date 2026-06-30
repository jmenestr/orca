import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkflowsStore } from './store'
import { importWorkflowTemplate } from './import-templates'
import { resolveExampleWorkflowsRoot } from './paths'

const DEFAULT_TEMPLATE_ID = 'verify-expenses'

export function ensureDefaultWorkflowSeeded(): { seeded: boolean; error?: string } {
  const store = getWorkflowsStore()
  if (store.listTasks().length > 0) {
    return { seeded: false }
  }
  const templateRoot = resolveExampleWorkflowsRoot()
  const templatePath = join(templateRoot, 'tasks', `${DEFAULT_TEMPLATE_ID}.task.yaml`)
  if (!existsSync(templatePath)) {
    return {
      seeded: false,
      error: `Bundled template missing at ${templatePath}`
    }
  }
  try {
    importWorkflowTemplate(DEFAULT_TEMPLATE_ID)
    return { seeded: true }
  } catch (error) {
    return {
      seeded: false,
      error: error instanceof Error ? error.message : 'Could not seed default workflow'
    }
  }
}
