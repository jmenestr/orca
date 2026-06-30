#!/usr/bin/env node

/** Notion status value — only these rows count toward the total. */
const VERIFIED_STATUS = 'Verified'

const VERSION = '1.0.0'

function parseArgs(argv: string[]) {
  const args = {
    precheck: false,
    profile: null as string | null,
    version: false,
    month: null as string | null
  }
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--precheck') {
      args.precheck = true
    } else if (token === '--version') {
      args.version = true
    } else if (token === '--profile') {
      args.profile = argv[index + 1] ?? null
      index += 1
    } else if (token === '--month') {
      args.month = argv[index + 1] ?? null
      index += 1
    }
  }
  return args
}

/** Default: current calendar month in local time (YYYY-MM). */
function defaultMonth(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function isValidMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/u.test(value)
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

  const month = args.month ?? defaultMonth()
  if (!isValidMonth(month)) {
    throw new Error(`Invalid --month (expected YYYY-MM): ${month}`)
  }

  // Stub: wire Notion query (status = VERIFIED_STATUS, date in month) and sum amounts.
  process.stdout.write(
    `monthly-summary stub: sum Verified rows for ${month} (status=${VERIFIED_STATUS})\n`
  )
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
