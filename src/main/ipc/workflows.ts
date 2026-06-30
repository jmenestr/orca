import { ipcMain } from 'electron'
import { ensureDefaultWorkflowSeeded } from '../workflows/bootstrap-defaults'
import { getWorkflowsService } from '../workflows/resolve'
import { getWorkflowsStore } from '../workflows/store'
import {
  createWorkflowSkill,
  createWorkflowTask,
  deleteWorkflowSkill,
  deleteWorkflowTask,
  importWorkflowTemplate,
  listWorkflowTemplates,
  updateWorkflowSkill,
  updateWorkflowTask
} from '../workflows/import-templates'
import { materializeWorkflows } from '../workflows/materializer'
import type { WorkflowSkillTaskRecord } from '../../shared/workflows/skill-task-manifest'

export function registerWorkflowsHandlers(): void {
  const seedIfEmpty = (): void => {
    ensureDefaultWorkflowSeeded()
  }

  ipcMain.handle('workflows:list', async () => {
    seedIfEmpty()
    return getWorkflowsService().list()
  })

  ipcMain.handle('workflows:skillList', async () => {
    seedIfEmpty()
    return { skills: getWorkflowsStore().listSkills() }
  })

  ipcMain.handle('workflows:taskList', async () => {
    seedIfEmpty()
    return { tasks: getWorkflowsStore().listTasks() }
  })

  ipcMain.handle(
    'workflows:skillCreate',
    async (_event, args: { name: string; description?: string; body: string }) =>
      createWorkflowSkill(args)
  )

  ipcMain.handle(
    'workflows:skillUpdate',
    async (_event, args: { skillId: string; name?: string; description?: string; body?: string }) =>
      updateWorkflowSkill(args.skillId, args)
  )

  ipcMain.handle('workflows:skillDelete', async (_event, args: { skillId: string }) => {
    deleteWorkflowSkill(args.skillId)
    return { ok: true }
  })

  ipcMain.handle(
    'workflows:taskCreate',
    async (_event, args: Omit<WorkflowSkillTaskRecord, 'createdAt' | 'updatedAt'>) =>
      createWorkflowTask(args)
  )

  ipcMain.handle(
    'workflows:taskUpdate',
    async (
      _event,
      args: { taskId: string } & Partial<Omit<WorkflowSkillTaskRecord, 'id' | 'createdAt'>>
    ) => updateWorkflowTask(args.taskId, args)
  )

  ipcMain.handle('workflows:taskDelete', async (_event, args: { taskId: string }) => {
    deleteWorkflowTask(args.taskId)
    return { ok: true }
  })

  ipcMain.handle('workflows:templatesList', async () => ({ templates: listWorkflowTemplates() }))

  ipcMain.handle('workflows:templateImport', async (_event, args: { templateId: string }) =>
    importWorkflowTemplate(args.templateId)
  )

  ipcMain.handle('workflows:materialize', async () => materializeWorkflows())

  ipcMain.handle('workflows:validateTask', async (_event, args: { taskId: string }) =>
    getWorkflowsService().validateTask(args.taskId)
  )
}
