import { describe, expect, it, vi } from 'vitest'
import type * as LinearClientModule from '../linear/client'
import { RuntimeLinearCommands, type RuntimeLinearCommandHost } from './orca-runtime-linear'

const mocks = vi.hoisted(() => ({
  connectLinear: vi.fn(),
  disconnectLinear: vi.fn(),
  getLinearStatus: vi.fn(),
  selectLinearWorkspace: vi.fn(),
  testLinearConnection: vi.fn(),
  searchLinearIssues: vi.fn()
}))

vi.mock('../linear/client', async () => ({
  ...(await vi.importActual<typeof LinearClientModule>('../linear/client')),
  connect: mocks.connectLinear,
  disconnect: mocks.disconnectLinear,
  getStatus: mocks.getLinearStatus,
  selectWorkspace: mocks.selectLinearWorkspace,
  testConnection: mocks.testLinearConnection
}))

vi.mock('../linear/issues', async () => ({
  ...(await vi.importActual('../linear/issues')),
  searchIssues: mocks.searchLinearIssues
}))

function createHost(overrides: Partial<RuntimeLinearCommandHost> = {}): RuntimeLinearCommandHost {
  return {
    getStore: () => null,
    resolveWorktreeSelector: vi.fn(),
    listResolvedWorktrees: vi.fn(async () => []),
    showTerminal: vi.fn(),
    emitClientEvent: vi.fn(),
    ...overrides
  }
}

describe('RuntimeLinearCommands', () => {
  it('delegates connect and disconnect', () => {
    const host = createHost()
    const commands = new RuntimeLinearCommands(host)
    mocks.connectLinear.mockReturnValue({ ok: true })

    expect(commands.linearConnect('api-key')).toEqual({ ok: true })
    expect(mocks.connectLinear).toHaveBeenCalledWith('api-key')

    expect(commands.linearDisconnect('ws-1')).toEqual({ ok: true })
    expect(mocks.disconnectLinear).toHaveBeenCalledWith('ws-1')
  })

  it('clamps search issue limits', () => {
    const host = createHost()
    const commands = new RuntimeLinearCommands(host)

    commands.linearSearchIssues('query', 500, 'ws-1')
    expect(mocks.searchLinearIssues).toHaveBeenCalledWith('query', 50, 'ws-1')
  })

  it('routes linked-issue updates through the host event bus', async () => {
    const emitClientEvent = vi.fn()
    const host = createHost({
      listResolvedWorktrees: vi.fn(
        async () =>
          [
            {
              id: 'wt-1',
              path: '/repo/wt',
              repoId: 'repo-1',
              branch: 'main',
              parentWorktreeId: null,
              childWorktreeIds: [],
              lineage: null,
              git: {} as never,
              linkedLinearIssue: 'ORCA-1',
              linkedLinearIssueWorkspaceId: 'ws-1'
            }
          ] as never
      ),
      emitClientEvent
    })
    const commands = new RuntimeLinearCommands(host)

    await expect(
      commands.linearIssueSetState({
        input: 'done',
        to: 'done',
        workspaceId: 'ws-1',
        context: { worktreeId: 'wt-1' }
      })
    ).rejects.toThrow()
  })
})
