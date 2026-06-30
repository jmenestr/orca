import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKFLOW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workflows', 'list'],
    summary: 'List SkillTasks and Orca-authored skills',
    usage: 'orca workflows list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca workflows list --json']
  },
  {
    path: ['workflows', 'resolve'],
    summary: 'Resolve a SkillTask dispatch envelope',
    usage: 'orca workflows resolve --task <id> [--context <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task', 'context'],
    examples: ['orca workflows resolve --task verify-expenses --json']
  },
  {
    path: ['workflows', 'run'],
    summary: 'Resolve a SkillTask (alias for resolve)',
    usage: 'orca workflows run <task-id> [--context <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'context'],
    positionalArgs: ['task-id'],
    examples: ['orca workflows run verify-expenses --json']
  }
]
