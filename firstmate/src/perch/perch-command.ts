// Why: the conductor (running under FM_HOST=perch) uses these commands to spawn
// and observe Orca agents through the Orca-native dispatch path, instead of
// opening tmux panes or doing project work itself.
import type { Command } from 'commander'
import { dispatchWork, listFleet, listRepos, readBridgeConfig } from './perch-bridge-client.js'

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function registerPerchCommand(program: Command): Command {
  const perch = program
    .command('perch')
    .description('Conductor bridge to Orca: dispatch and observe fleet agents (FM_HOST=perch)')

  perch
    .command('repos')
    .description('List repos/workspaces the captain has registered in Orca')
    .action(async () => {
      const result = await listRepos(readBridgeConfig())
      printJson(result.repos)
    })

  perch
    .command('list')
    .description('List live fleet work items (every observed agent)')
    .action(async () => {
      const result = await listFleet(readBridgeConfig())
      printJson(result.items)
    })

  perch
    .command('dispatch')
    .description('Spawn an Orca agent in a worktree (the Orca-native crewmate path)')
    .requiredOption('--repo <selector>', 'Repo selector: name:<name>, id:<id>, or a bare name')
    .requiredOption('--title <title>', 'Short task title shown in the fleet and Activity')
    .option('--prompt <prompt>', 'Initial prompt/brief handed to the agent')
    .option('--agent <agent>', 'Harness/agent to launch (default: claude)')
    .action(async (options: { repo: string; title: string; prompt?: string; agent?: string }) => {
      const result = await dispatchWork(readBridgeConfig(), {
        repoSelector: options.repo,
        title: options.title,
        brief: options.prompt,
        startupAgent: options.agent
      })
      printJson(result)
    })

  return perch
}
