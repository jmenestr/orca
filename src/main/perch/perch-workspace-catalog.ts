// Why: projects Orca's existing repo/worktree/folder registry for conductor
// dispatch — no duplicate firstmate projects.md in v1.
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { FolderWorkspace, Repo } from '../../shared/types'

export type WorkspaceRepoEntry = {
  id: string
  name: string
  path: string
  kind: Repo['kind']
  connectionId: string | null
  projectGroupId: string | null
}

export type WorkspaceWorktreeEntry = {
  worktreeId: string
  repoId: string
  displayName: string
  branch: string
  path: string
  isActive: boolean
}

export type WorkspaceFolderEntry = {
  id: string
  name: string
  path: string
}

export type WorkspaceResolveResult = {
  repoSelector: string
  repo: WorkspaceRepoEntry
  worktreeId?: string
}

export async function listWorkspaceRepos(
  runtime: OrcaRuntimeService
): Promise<WorkspaceRepoEntry[]> {
  return runtime.listRepos().map((repo) => ({
    id: repo.id,
    name: repo.displayName,
    path: repo.path,
    kind: repo.kind,
    connectionId: repo.connectionId ?? null,
    projectGroupId: repo.projectGroupId ?? null
  }))
}

export async function listWorkspaceWorktrees(
  runtime: OrcaRuntimeService,
  repoSelector?: string
): Promise<WorkspaceWorktreeEntry[]> {
  if (repoSelector) {
    const result = await runtime.listManagedWorktrees(repoSelector, 200)
    return result.worktrees.map((wt) => ({
      worktreeId: wt.id,
      repoId: wt.repoId,
      displayName: wt.displayName ?? wt.id,
      branch: wt.branch?.replace(/^refs\/heads\//, '') ?? '',
      path: wt.path,
      isActive: false
    }))
  }

  const ps = await runtime.getWorktreePs(200)
  return ps.worktrees.map((wt) => ({
    worktreeId: wt.worktreeId,
    repoId: wt.repoId,
    displayName: wt.displayName ?? wt.repo,
    branch: wt.branch?.replace(/^refs\/heads\//, '') ?? '',
    path: wt.path,
    isActive: wt.isActive
  }))
}

export function listFolderWorkspaces(runtime: OrcaRuntimeService): WorkspaceFolderEntry[] {
  return runtime.listFolderWorkspaces().map((folder: FolderWorkspace) => ({
    id: folder.id,
    name: folder.displayName,
    path: folder.path
  }))
}

export async function resolveWorkspaceSelector(
  runtime: OrcaRuntimeService,
  selector: string
): Promise<WorkspaceResolveResult> {
  const trimmed = selector.trim()
  if (trimmed.startsWith('worktree:')) {
    const worktreeId = trimmed.slice('worktree:'.length)
    const shown = await runtime.showManagedWorktree(worktreeId)
    const repo = await runtime.showRepo(`id:${shown.repoId}`)
    return {
      repoSelector: `id:${repo.id}`,
      repo: {
        id: repo.id,
        name: repo.displayName,
        path: repo.path,
        kind: repo.kind,
        connectionId: repo.connectionId ?? null,
        projectGroupId: repo.projectGroupId ?? null
      },
      worktreeId
    }
  }

  const repo = await runtime.showRepo(trimmed)
  return {
    repoSelector: `id:${repo.id}`,
    repo: {
      id: repo.id,
      name: repo.displayName,
      path: repo.path,
      kind: repo.kind,
      connectionId: repo.connectionId ?? null,
      projectGroupId: repo.projectGroupId ?? null
    }
  }
}
