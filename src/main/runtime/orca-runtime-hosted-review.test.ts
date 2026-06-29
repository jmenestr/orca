import { describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/types'
import type * as GitHubClientModule from '../github/client'
import {
  RuntimeHostedReviewCommands,
  type RuntimeHostedReviewCommandHost
} from './orca-runtime-hosted-review'

const mocks = vi.hoisted(() => ({
  getRepoSlug: vi.fn(),
  getRepoUpstream: vi.fn(),
  listWorkItems: vi.fn()
}))

vi.mock('../github/client', async () => ({
  ...(await vi.importActual<typeof GitHubClientModule>('../github/client')),
  getRepoSlug: mocks.getRepoSlug,
  getRepoUpstream: mocks.getRepoUpstream,
  listWorkItems: mocks.listWorkItems
}))

function createHost(
  overrides: Partial<RuntimeHostedReviewCommandHost> = {}
): RuntimeHostedReviewCommandHost {
  const repo = {
    id: 'repo-1',
    path: '/repo',
    kind: 'git',
    name: 'repo'
  } as unknown as Repo
  return {
    resolveRepoSelector: vi.fn(async () => repo),
    resolveWorktreeSelector: vi.fn(
      async () => ({ id: 'wt-1', repoId: 'repo-1', path: '/repo/wt', branch: 'main' }) as never
    ),
    requireStore: vi.fn(() => ({ getSettings: () => ({}), updateSettings: vi.fn() }) as never),
    getStore: vi.fn(() => null),
    getStats: vi.fn(() => undefined),
    ...overrides
  }
}

describe('RuntimeHostedReviewCommands', () => {
  it('delegates slug and upstream lookups with execution options', async () => {
    const host = createHost()
    const commands = new RuntimeHostedReviewCommands(host)
    mocks.getRepoSlug.mockResolvedValue({ owner: 'acme', repo: 'orca' })

    await commands.getRepoSlug('repo-1')
    expect(mocks.getRepoSlug).toHaveBeenCalled()
  })

  it('passes local git execution options to work item listing', async () => {
    const host = createHost({
      requireStore: vi.fn(
        () =>
          ({
            getSettings: () => ({ projectExecutionRuntimes: {} })
          }) as never
      )
    })
    const commands = new RuntimeHostedReviewCommands(host)
    mocks.listWorkItems.mockResolvedValue([])

    await commands.listRepoWorkItems('repo-1', 10, 'open')
    expect(mocks.listWorkItems).toHaveBeenCalled()
  })

  it('exposes execution option helpers for worktree create paths', () => {
    const host = createHost({
      requireStore: vi.fn(
        () =>
          ({
            getSettings: () => ({ projectExecutionRuntimes: {} })
          }) as never
      )
    })
    const commands = new RuntimeHostedReviewCommands(host)
    const repo = { id: 'repo-1', path: '/repo', kind: 'git', name: 'repo' } as unknown as Repo

    expect(commands.getLocalGitExecutionOptionArgs(repo)).toEqual([])
    expect(commands.getHostedReviewExecutionOptions(repo)).toBeUndefined()
  })
})
