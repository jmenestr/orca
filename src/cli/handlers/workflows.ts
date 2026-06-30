import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'

export const WORKFLOW_HANDLERS: Record<string, CommandHandler> = {
  'workflows list': async ({ client, json }) => {
    const response = await client.call('workflows.list', null)
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'workflows resolve': async ({ flags, client, json }) => {
    const taskId = getRequiredStringFlag(flags, 'task')
    const userContext = getOptionalStringFlag(flags, 'context') ?? ''
    const response = await client.call('workflows.resolve', { taskId, userContext })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  },
  'workflows run': async ({ flags, client, json, rawArgs }) => {
    const taskId = rawArgs?.[0] ?? getRequiredStringFlag(flags, 'task')
    const userContext = getOptionalStringFlag(flags, 'context') ?? ''
    const response = await client.call('workflows.resolve', { taskId, userContext })
    printResult(response, json, (result) => JSON.stringify(result, null, 2))
  }
}
