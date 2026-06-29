import { describe, expect, it, vi } from 'vitest'
import type * as JiraClientModule from '../jira/client'
import type * as JiraIssuesModule from '../jira/issues'
import { RuntimeJiraCommands } from './orca-runtime-jira'

const mocks = vi.hoisted(() => ({
  connectJira: vi.fn(),
  disconnectJira: vi.fn(),
  getJiraStatus: vi.fn(),
  selectJiraSite: vi.fn(),
  testJiraConnection: vi.fn(),
  searchJiraIssues: vi.fn(),
  listJiraIssues: vi.fn(),
  createJiraIssue: vi.fn(),
  getJiraIssue: vi.fn(),
  updateJiraIssue: vi.fn(),
  addJiraIssueComment: vi.fn(),
  getJiraIssueComments: vi.fn(),
  listJiraProjects: vi.fn(),
  listJiraIssueTypes: vi.fn(),
  listJiraCreateFields: vi.fn(),
  listJiraPriorities: vi.fn(),
  listJiraAssignableUsers: vi.fn(),
  listJiraTransitions: vi.fn()
}))

vi.mock('../jira/client', async () => ({
  ...(await vi.importActual<typeof JiraClientModule>('../jira/client')),
  connect: mocks.connectJira,
  disconnect: mocks.disconnectJira,
  getStatus: mocks.getJiraStatus,
  selectSite: mocks.selectJiraSite,
  testConnection: mocks.testJiraConnection
}))

vi.mock('../jira/issues', async () => ({
  ...(await vi.importActual<typeof JiraIssuesModule>('../jira/issues')),
  searchIssues: mocks.searchJiraIssues,
  listIssues: mocks.listJiraIssues,
  createIssue: mocks.createJiraIssue,
  getIssue: mocks.getJiraIssue,
  updateIssue: mocks.updateJiraIssue,
  addIssueComment: mocks.addJiraIssueComment,
  getIssueComments: mocks.getJiraIssueComments,
  listProjects: mocks.listJiraProjects,
  listIssueTypes: mocks.listJiraIssueTypes,
  listCreateFields: mocks.listJiraCreateFields,
  listPriorities: mocks.listJiraPriorities,
  listAssignableUsers: mocks.listJiraAssignableUsers,
  listTransitions: mocks.listJiraTransitions
}))

describe('RuntimeJiraCommands', () => {
  const commands = new RuntimeJiraCommands()

  it('delegates connect and disconnect', () => {
    mocks.connectJira.mockReturnValue({ ok: true })
    expect(
      commands.jiraConnect({
        siteUrl: 'https://example.atlassian.net',
        email: 'a@b.c',
        apiToken: 'tok'
      })
    ).toEqual({
      ok: true
    })
    expect(mocks.connectJira).toHaveBeenCalledWith({
      siteUrl: 'https://example.atlassian.net',
      email: 'a@b.c',
      apiToken: 'tok'
    })

    expect(commands.jiraDisconnect('site-1')).toEqual({ ok: true })
    expect(mocks.disconnectJira).toHaveBeenCalledWith('site-1')
  })

  it('clamps search and list issue limits', () => {
    commands.jiraSearchIssues('project = ORCA', 500, 'site-1')
    expect(mocks.searchJiraIssues).toHaveBeenCalledWith('project = ORCA', 100, 'site-1')

    commands.jiraListIssues(undefined, 0, 'site-1')
    expect(mocks.listJiraIssues).toHaveBeenCalledWith(undefined, 1, 'site-1')
  })

  it('delegates issue mutations', () => {
    mocks.createJiraIssue.mockReturnValue({ key: 'ORCA-1' })
    expect(commands.jiraCreateIssue({ projectId: 'ORCA', summary: 'Test' } as never)).toEqual({
      key: 'ORCA-1'
    })

    mocks.updateJiraIssue.mockReturnValue({ ok: true })
    commands.jiraUpdateIssue('ORCA-1', { fields: { summary: 'Updated' } } as never, 'site-1')
    expect(mocks.updateJiraIssue).toHaveBeenCalledWith(
      'ORCA-1',
      { fields: { summary: 'Updated' } },
      'site-1'
    )
  })
})
