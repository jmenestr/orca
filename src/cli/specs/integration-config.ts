import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const INTEGRATION_CONFIG_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['integration', 'config', 'list'],
    summary: 'List integration config profiles',
    usage: 'orca integration config list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca integration config list --json']
  },
  {
    path: ['integration', 'config', 'get'],
    summary: 'Get integration profile config (secrets redacted)',
    usage: 'orca integration config get --profile <id> [--reveal-secrets] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile', 'reveal-secrets'],
    examples: ['orca integration config get --profile notion.budget --json']
  },
  {
    path: ['integration', 'config', 'validate'],
    summary: 'Validate an integration profile connection',
    usage: 'orca integration config validate --profile <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile'],
    examples: ['orca integration config validate --profile notion.budget --json']
  },
  {
    path: ['integration', 'session', 'start'],
    summary: 'Start a run-scoped integration session',
    usage: 'orca integration session start --profile <id> --run-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile', 'run-id'],
    examples: ['orca integration session start --profile notion.budget --run-id abc --json']
  },
  {
    path: ['integration', 'request'],
    summary: 'Proxy an authenticated integration HTTP request',
    usage:
      'orca integration request --profile <id> [--run-id <id>] --method <verb> --path <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile', 'run-id', 'method', 'path'],
    examples: [
      'orca integration request --profile notion.budget --method GET --path /databases/abc --json'
    ]
  }
]
