import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerConductCommand } from './conduct/index.js'
import { registerPerchCommand } from './perch/perch-command.js'

function readPackageVersion(): string {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }
  return pkg.version ?? '0.0.0'
}

const program = new Command()
  .name('fm')
  .description('Firstmate CLI - run harness agents with normalized frame output')
  .version(readPackageVersion())

registerConductCommand(program)
registerPerchCommand(program)

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`fm: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
