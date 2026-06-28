import { runConduct } from './conduct/index.js'

const [, , subcommand, ...rest] = process.argv

if (subcommand === 'conduct') {
  runConduct(rest).catch((err: unknown) => {
    process.stderr.write(`fm: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
} else {
  process.stderr.write('Usage: fm <subcommand> [...args]\n\nSubcommands:\n  conduct  Run a harness agent with a prompt\n')
  process.exit(1)
}
