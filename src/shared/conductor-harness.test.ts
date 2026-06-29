import { describe, expect, it } from 'vitest'
import {
  CONDUCTOR_HARNESS_IDS,
  IMPLEMENTED_CONDUCTOR_HARNESS_IDS,
  isConductorHarnessId,
  normalizeConductorHarnessId
} from './conductor-harness'

describe('conductor-harness', () => {
  it('normalizes unknown values to claude', () => {
    expect(normalizeConductorHarnessId(undefined)).toBe('claude')
    expect(normalizeConductorHarnessId('codex')).toBe('codex')
    expect(normalizeConductorHarnessId('nope')).toBe('claude')
  })

  it('lists implemented harnesses as a subset', () => {
    for (const harness of IMPLEMENTED_CONDUCTOR_HARNESS_IDS) {
      expect(isConductorHarnessId(harness)).toBe(true)
      expect(CONDUCTOR_HARNESS_IDS).toContain(harness)
    }
  })
})
