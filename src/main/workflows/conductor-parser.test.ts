import { describe, expect, it } from 'vitest'
import { parseConductorTurn } from './conductor-parser'

describe('parseConductorTurn', () => {
  it('parses @task token and keeps user context', () => {
    const result = parseConductorTurn('uploaded csv @task:verify-expenses')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.intent.skillTaskId).toBe('verify-expenses')
      expect(result.intent.userContext).toBe('uploaded csv')
    }
  })

  it('rejects bare @task without id', () => {
    const result = parseConductorTurn('@task')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.hint).toContain('verify-expenses')
    }
  })

  it('rejects bare @ tokens', () => {
    const result = parseConductorTurn('@verify-expenses')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('bare_at_token')
    }
  })

  it('parses @run and /skill tokens', () => {
    const result = parseConductorTurn('@run:abc-123 apply decisions /skill:notion-budget-verify')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.intent.perchTaskId).toBe('abc-123')
      expect(result.intent.skillOverride).toBe('notion-budget-verify')
      expect(result.intent.userContext).toContain('apply decisions')
    }
  })
})
