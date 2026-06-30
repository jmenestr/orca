#!/usr/bin/env node

const VERSION = '1.0.0'

function parseArgs(argv) {
  const args = { precheck: false, profile: null, version: false }
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--precheck') {
      args.precheck = true
    } else if (token === '--version') {
      args.version = true
    } else if (token === '--profile') {
      args.profile = argv[index + 1] ?? null
      index += 1
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.version) {
    process.stdout.write(`${VERSION}\n`)
    return
  }
  if (args.precheck) {
    if (!args.profile) {
      throw new Error('--profile is required for precheck')
    }
    process.stdout.write(`precheck ok for ${args.profile}\n`)
    return
  }
  process.stdout.write('verify-uploaded stub: use --precheck or --version\n')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
