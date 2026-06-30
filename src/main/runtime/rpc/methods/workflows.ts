import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { requiredString } from '../schemas'
import { getWorkflowsService } from '../../../workflows/resolve'
import {
  createWorkflowSkill,
  createWorkflowTask,
  deleteWorkflowSkill,
  deleteWorkflowTask,
  importWorkflowTemplate,
  listWorkflowTemplates,
  updateWorkflowSkill,
  updateWorkflowTask
} from '../../../workflows/import-templates'
import { getWorkflowsStore } from '../../../workflows/store'
import { materializeWorkflows } from '../../../workflows/materializer'

const TaskIdParams = z.object({
  taskId: requiredString('Missing taskId')
})

const ResolveParams = z.object({
  taskId: requiredString('Missing taskId'),
  userContext: z.string().optional()
})

const SkillUpsertParams = z.object({
  name: requiredString('Missing name'),
  description: z.string().optional(),
  body: requiredString('Missing body')
})

const SkillUpdateParams = z.object({
  skillId: requiredString('Missing skillId'),
  name: z.string().optional(),
  description: z.string().optional(),
  body: z.string().optional()
})

const SkillDeleteParams = z.object({
  skillId: requiredString('Missing skillId')
})

const TaskUpsertParams = z.object({
  id: requiredString('Missing id'),
  title: requiredString('Missing title'),
  version: z.number().optional(),
  skillId: requiredString('Missing skillId'),
  integrationProfiles: z.array(z.string()),
  kind: z.enum(['chore', 'general', 'scout', 'coding', 'review']),
  landing: z.object({
    type: z.literal('report'),
    paths: z.object({
      summary: z.string(),
      data: z.string()
    }),
    schema: z.string()
  }),
  reviewMode: z.enum(['report-first', 'chat-only']).optional(),
  visibility: z.enum(['board', 'silent']).optional(),
  aliases: z.array(z.string()).optional(),
  scriptContracts: z
    .array(
      z.object({
        id: z.string(),
        path: z.string(),
        command: z.array(z.string()),
        expectExitCode: z.number().optional(),
        minVersion: z.string().optional()
      })
    )
    .optional(),
  precheck: z
    .object({
      command: z.string(),
      timeoutSeconds: z.number().optional()
    })
    .optional(),
  workspaceRepoSelector: z.string().optional()
})

const TaskUpdateParams = TaskUpsertParams.extend({
  taskId: requiredString('Missing taskId')
}).omit({ id: true })

const TemplateImportParams = z.object({
  templateId: requiredString('Missing templateId')
})

export const WORKFLOW_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'workflows.list',
    params: null,
    handler: async () => getWorkflowsService().list()
  }),
  defineMethod({
    name: 'workflows.resolve',
    params: ResolveParams,
    handler: async (params) =>
      getWorkflowsService().resolve(params.taskId, params.userContext ?? '')
  }),
  defineMethod({
    name: 'workflows.materialize',
    params: null,
    handler: async () => materializeWorkflows()
  }),
  defineMethod({
    name: 'workflows.skill.list',
    params: null,
    handler: async () => ({ skills: getWorkflowsStore().listSkills() })
  }),
  defineMethod({
    name: 'workflows.skill.create',
    params: SkillUpsertParams,
    handler: async (params) =>
      createWorkflowSkill({
        name: params.name,
        description: params.description ?? '',
        body: params.body
      })
  }),
  defineMethod({
    name: 'workflows.skill.update',
    params: SkillUpdateParams,
    handler: async (params) =>
      updateWorkflowSkill(params.skillId, {
        name: params.name,
        description: params.description,
        body: params.body
      })
  }),
  defineMethod({
    name: 'workflows.skill.delete',
    params: SkillDeleteParams,
    handler: async (params) => {
      deleteWorkflowSkill(params.skillId)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'workflows.task.list',
    params: null,
    handler: async () => ({ tasks: getWorkflowsStore().listTasks() })
  }),
  defineMethod({
    name: 'workflows.task.create',
    params: TaskUpsertParams,
    handler: async (params) =>
      createWorkflowTask({
        id: params.id,
        title: params.title,
        version: params.version ?? 1,
        skillId: params.skillId,
        integrationProfiles: params.integrationProfiles,
        kind: params.kind,
        landing: params.landing,
        reviewMode: params.reviewMode,
        visibility: params.visibility ?? 'board',
        aliases: params.aliases ?? [],
        scriptContracts: params.scriptContracts ?? [],
        precheck: params.precheck,
        workspaceRepoSelector: params.workspaceRepoSelector
      })
  }),
  defineMethod({
    name: 'workflows.task.update',
    params: TaskUpdateParams,
    handler: async (params) =>
      updateWorkflowTask(params.taskId, {
        title: params.title,
        version: params.version,
        skillId: params.skillId,
        integrationProfiles: params.integrationProfiles,
        kind: params.kind,
        landing: params.landing,
        reviewMode: params.reviewMode,
        visibility: params.visibility,
        aliases: params.aliases,
        scriptContracts: params.scriptContracts,
        precheck: params.precheck,
        workspaceRepoSelector: params.workspaceRepoSelector
      })
  }),
  defineMethod({
    name: 'workflows.task.delete',
    params: TaskIdParams,
    handler: async (params) => {
      deleteWorkflowTask(params.taskId)
      return { ok: true }
    }
  }),
  defineMethod({
    name: 'workflows.task.validate',
    params: TaskIdParams,
    handler: async (params) => getWorkflowsService().validateTask(params.taskId)
  }),
  defineMethod({
    name: 'workflows.templates.list',
    params: null,
    handler: async () => ({ templates: listWorkflowTemplates() })
  }),
  defineMethod({
    name: 'workflows.templates.import',
    params: TemplateImportParams,
    handler: async (params) => importWorkflowTemplate(params.templateId)
  })
]
