import type { Command } from 'commander'
import { CONDUCT_HARNESSES, runConduct } from './run-conduct.js'
import { serveConduct } from './serve-conduct.js'

function registerConductServeCommand(conduct: Command): void {
  conduct
    .command('serve')
    .description(
      'Long-lived multi-turn harness server: read plain-text turns from stdin, write ConductFrames to stdout'
    )
    .option('--harness <name>', `Harness adapter (${CONDUCT_HARNESSES.join(', ')})`, 'claude')
    .option('-s, --session <id>', 'Resume an existing harness session')
    .option('--cwd <path>', 'Working directory for the harness subprocess')
    .option(
      '--format <format>',
      'Output format: ndjson (one JSON frame per line) or human',
      'human'
    )
    .addHelpText(
      'after',
      `
Examples:
  $ fm conduct serve --harness claude --cwd ./firstmate --format ndjson
  $ echo "ship dark mode" | fm conduct serve --format ndjson
`
    )
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as {
        harness: string
        session?: string
        cwd?: string
        format: string
      }
      const format = options.format === 'ndjson' ? 'ndjson' : 'human'
      try {
        const exitCode = await serveConduct({
          harness: options.harness,
          sessionId: options.session,
          cwd: options.cwd,
          format
        })
        process.exit(exitCode)
      } catch (err) {
        process.stderr.write(
          `fm conduct serve: ${err instanceof Error ? err.message : String(err)}\n`
        )
        process.exit(1)
      }
    })
}

function registerConductOneShotCommand(conduct: Command): void {
  conduct
    .argument('<prompt...>', 'Prompt text for the harness agent')
    .option('--harness <name>', `Harness adapter (${CONDUCT_HARNESSES.join(', ')})`, 'claude')
    .option('-s, --session <id>', 'Resume an existing harness session')
    .option('--cwd <path>', 'Working directory for the harness subprocess')
    .addHelpText(
      'after',
      `
Examples:
  $ fm conduct "hello"
  $ fm conduct --harness codex "fix the login bug"
  $ fm conduct --session ses_123 "continue where you left off"
  $ fm conduct --cwd ./my-project "add tests for auth"
  $ fm conduct serve --harness claude --format ndjson
`
    )
    .action(async (promptParts: string[], _options, command) => {
      const options = command.optsWithGlobals() as {
        harness: string
        session?: string
        cwd?: string
      }
      const exitCode = await runConduct({
        harness: options.harness,
        sessionId: options.session,
        cwd: options.cwd,
        prompt: promptParts.join(' ')
      })
      process.exit(exitCode)
    })
}

export function registerConductCommand(program: Command): Command {
  const conduct = program
    .command('conduct')
    .description('Run a harness agent with a prompt and stream normalized ConductFrames')

  registerConductServeCommand(conduct)
  registerConductOneShotCommand(conduct)

  return conduct
}
