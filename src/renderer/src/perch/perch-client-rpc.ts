import type {
  ConductorTurn,
  ControlMode,
  Run,
  Task,
  TaskMode,
  TaskStatus
} from './perch-client-types'

async function perchCall<T>(method: string, params?: unknown): Promise<T> {
  const response = await window.api.perch.call({ method, params })
  if (!response.ok) {
    throw new Error(response.error?.message ?? `${method} failed`)
  }
  return response.result as T
}

export async function sendConductorMessage(text: string): Promise<void> {
  await perchCall('perch.conductor.send', { text })
}

export async function loadConductorHistory(): Promise<ConductorTurn[]> {
  try {
    const result = await perchCall<{ transcript?: ConductorTurn[] }>('perch.conductor.history')
    return result.transcript ?? []
  } catch {
    return []
  }
}

export async function loadConductorFleet(): Promise<Task[]> {
  try {
    const result = await perchCall<{ items?: Task[] }>('perch.work.list')
    return result.items ?? []
  } catch {
    return []
  }
}

export async function setWorkControlMode(id: string, controlMode: ControlMode): Promise<Task> {
  const result = await perchCall<{ item: Task }>('perch.work.setControl', { id, controlMode })
  return result.item
}

export type WorkspaceRepoEntry = {
  id: string
  name: string
  path: string
  kind: string
  connectionId: string | null
  projectGroupId: string | null
}

export async function loadWorkspaceRepos(): Promise<WorkspaceRepoEntry[]> {
  try {
    const result = await perchCall<{ repos?: WorkspaceRepoEntry[] }>('perch.workspace.listRepos')
    return result.repos ?? []
  } catch {
    return []
  }
}

export type DispatchWorkInput = {
  repoSelector: string
  title: string
  brief?: string
  startupAgent?: string
}

export async function dispatchWork(
  input: DispatchWorkInput
): Promise<{ task: Task; run: Run | null; worktreeId: string }> {
  return perchCall<{ task: Task; run: Run | null; worktreeId: string }>(
    'perch.work.dispatch',
    input
  )
}

export async function loadBoardTasks(): Promise<Task[]> {
  try {
    const result = await perchCall<{ items?: Task[] }>('perch.work.board')
    return result.items ?? []
  } catch {
    return []
  }
}

export async function createBoardTask(input: {
  title: string
  brief?: string
  repoSelector?: string
  mode?: TaskMode
}): Promise<Task> {
  const result = await perchCall<{ item: Task }>('perch.work.create', input)
  return result.item
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const result = await perchCall<{ item: Task }>('perch.work.setStatus', { id, status })
  return result.item
}

export async function dispatchExistingTask(
  id: string,
  repoSelector?: string
): Promise<{ task: Task; run: Run | null; worktreeId: string }> {
  return perchCall<{ task: Task; run: Run | null; worktreeId: string }>(
    'perch.work.dispatchExisting',
    {
      id,
      repoSelector
    }
  )
}

export async function setTaskProject(id: string, repoSelector: string): Promise<Task> {
  const result = await perchCall<{ item: Task }>('perch.work.setProject', { id, repoSelector })
  return result.item
}

export async function syncLinearTasks(): Promise<{ synced: number }> {
  try {
    return await perchCall<{ synced: number }>('perch.tasks.syncLinear')
  } catch {
    return { synced: 0 }
  }
}
