// Why: perch.work.* and perch.workspace.* RPC handlers for fleet dispatch and
// workspace catalog projection.
import { z } from 'zod'
import { defineMethod, type RpcAnyMethod } from '../../runtime/rpc/core'
import { OptionalString, requiredString } from '../../runtime/rpc/schemas'
import {
  listFolderWorkspaces,
  listWorkspaceRepos,
  listWorkspaceWorktrees,
  resolveWorkspaceSelector
} from '../perch-workspace-catalog'

const WorkSelector = z.object({
  id: requiredString('Missing work item id')
})

const WorkDispatchParams = z.object({
  repoSelector: requiredString('Missing repoSelector'),
  title: requiredString('Missing title'),
  brief: OptionalString,
  harness: z.enum(['claude', 'cursor']).optional(),
  kind: z.enum(['coding', 'scout', 'review', 'chore', 'general']).optional(),
  landing: z.enum(['pr', 'report', 'slack_reply', 'todo_checkoff']).optional(),
  name: OptionalString,
  startupPrompt: OptionalString,
  startupAgent: OptionalString
})

const WorkSetControlParams = z.object({
  id: requiredString('Missing work item id'),
  controlMode: z.enum(['captain', 'conductor'])
})

const WorkCreateParams = z.object({
  title: requiredString('Missing title'),
  brief: OptionalString,
  repoSelector: OptionalString,
  mode: z.enum(['project', 'scratch', 'manual']).optional()
})

const WorkSetStatusParams = z.object({
  id: requiredString('Missing work item id'),
  status: z.enum([
    'backlog',
    'assigned',
    'in_progress',
    'in_review',
    'blocked',
    'done',
    'failed',
    'cancelled'
  ])
})

const WorkDispatchExistingParams = z.object({
  id: requiredString('Missing work item id'),
  repoSelector: OptionalString
})

const WorkSetProjectParams = z.object({
  id: requiredString('Missing work item id'),
  repoSelector: requiredString('Missing repoSelector')
})

const WorkspaceListWorktreesParams = z
  .object({
    repo: OptionalString
  })
  .optional()

const WorkspaceResolveParams = z.object({
  selector: requiredString('Missing selector')
})

export const PERCH_WORK_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'perch.workspace.listRepos',
    params: null,
    handler: async (_params, { runtime }) => ({
      repos: await listWorkspaceRepos(runtime)
    })
  }),

  defineMethod({
    name: 'perch.workspace.listWorktrees',
    params: WorkspaceListWorktreesParams,
    handler: async (params, { runtime }) => ({
      worktrees: await listWorkspaceWorktrees(runtime, params?.repo)
    })
  }),

  defineMethod({
    name: 'perch.workspace.listFolderWorkspaces',
    params: null,
    handler: async (_params, { runtime }) => ({
      folders: listFolderWorkspaces(runtime)
    })
  }),

  defineMethod({
    name: 'perch.workspace.resolve',
    params: WorkspaceResolveParams,
    handler: async (params, { runtime }) => resolveWorkspaceSelector(runtime, params.selector)
  }),

  defineMethod({
    name: 'perch.work.list',
    params: null,
    handler: async (_params, { runtime }) => ({
      items: runtime.getPerchFleetService().listWork()
    })
  }),

  defineMethod({
    name: 'perch.work.get',
    params: WorkSelector,
    handler: async (params, { runtime }) => {
      const item = runtime.getPerchFleetService().getWork(params.id)
      if (!item) {
        throw new Error('work_item_not_found')
      }
      return { item }
    }
  }),

  defineMethod({
    name: 'perch.work.board',
    params: null,
    handler: async (_params, { runtime }) => ({
      items: await runtime.getPerchFleetService().listBoardWithReconcile()
    })
  }),

  defineMethod({
    name: 'perch.work.create',
    params: WorkCreateParams,
    handler: async (params, { runtime }) => ({
      item: runtime.getPerchFleetService().createCustomTask(params)
    })
  }),

  defineMethod({
    name: 'perch.work.setStatus',
    params: WorkSetStatusParams,
    handler: async (params, { runtime }) => ({
      item: runtime.getPerchFleetService().setStatus(params.id, params.status)
    })
  }),

  defineMethod({
    name: 'perch.work.dispatch',
    params: WorkDispatchParams,
    handler: async (params, { runtime }) => runtime.getPerchFleetService().dispatchWork(params)
  }),

  defineMethod({
    name: 'perch.work.dispatchExisting',
    params: WorkDispatchExistingParams,
    handler: async (params, { runtime }) =>
      runtime.getPerchFleetService().dispatchExistingTask(params.id, params.repoSelector)
  }),

  defineMethod({
    name: 'perch.work.setProject',
    params: WorkSetProjectParams,
    handler: async (params, { runtime }) => ({
      item: await runtime.getPerchFleetService().setProject(params.id, params.repoSelector)
    })
  }),

  defineMethod({
    name: 'perch.tasks.syncLinear',
    params: null,
    handler: async (_params, { runtime }) => runtime.getPerchTaskSyncService().syncLinear()
  }),

  defineMethod({
    name: 'perch.work.cancel',
    params: WorkSelector,
    handler: async (params, { runtime }) => ({
      item: runtime.getPerchFleetService().cancelWork(params.id)
    })
  }),

  defineMethod({
    name: 'perch.work.setControl',
    params: WorkSetControlParams,
    handler: async (params, { runtime }) => ({
      item: runtime.getPerchFleetService().setControlMode(params.id, params.controlMode)
    })
  }),

  defineMethod({
    name: 'perch.fleet.snapshot',
    params: null,
    handler: async (_params, { runtime }) => runtime.getPerchFleetService().buildFleetSnapshot()
  })
]
