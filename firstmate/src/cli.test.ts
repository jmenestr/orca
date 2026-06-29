import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FM_BIN = join(__dirname, '..', 'bin', 'fm.js')
const FAKE_CLAUDE_SERVE = join(__dirname, 'conduct', 'fixtures', 'fake-claude-serve.mjs')

function runFm(
  args: string[],
  options?: { input?: string; env?: Record<string, string | undefined> }
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [FM_BIN, ...args], {
    encoding: 'utf8',
    input: options?.input,
    env: {
      ...process.env,
      NODE_OPTIONS: undefined,
      FM_CONDUCT_CLAUDE_COMMAND: 'node',
      FM_CONDUCT_CLAUDE_ARGS: FAKE_CLAUDE_SERVE,
      ...options?.env
    }
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

describe('fm CLI', () => {
  it('prints root help when invoked with no subcommand', () => {
    const { status, stdout, stderr } = runFm(['--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('Usage: fm')
    expect(stdout).toContain('conduct')
    expect(stderr).toBe('')
  })

  it('prints conduct subcommand help', () => {
    const { status, stdout } = runFm(['conduct', '--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('Usage: fm conduct')
    expect(stdout).toContain('--harness')
    expect(stdout).toContain('--session')
    expect(stdout).toContain('--cwd')
    expect(stdout).toContain('Examples:')
  })

  it('prints conduct serve help', () => {
    const { status, stdout } = runFm(['conduct', 'serve', '--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('Usage: fm conduct serve')
    expect(stdout).toContain('--format')
  })

  it('reports unknown harness with a clear error', () => {
    const { status, stderr } = runFm(['conduct', '--harness', 'unknown', 'hello'])
    expect(status).not.toBe(0)
    expect(stderr).toContain('unknown harness "unknown"')
    expect(stderr).toContain('claude')
  })

  it('reports unimplemented harness for conduct serve', () => {
    const { status, stderr } = runFm(['conduct', 'serve', '--harness', 'codex'], {
      input: 'hello\n'
    })
    expect(status).not.toBe(0)
    expect(stderr).toContain('not implemented')
  })

  it('conduct serve streams ndjson frames for stdin turns', () => {
    const { status, stdout } = runFm(
      ['conduct', 'serve', '--harness', 'claude', '--format', 'ndjson'],
      { input: 'hello there\nlets go\n' }
    )
    expect(status).toBe(0)
    const lines = stdout.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThan(0)
    const frames = lines.map((line) => JSON.parse(line) as { kind: string })
    expect(frames.some((f) => f.kind === 'session')).toBe(true)
    expect(frames.filter((f) => f.kind === 'done')).toHaveLength(2)
  })
})
