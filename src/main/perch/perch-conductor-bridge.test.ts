import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerchConductorBridge } from './perch-conductor-bridge'
import { PerchDb } from './perch-db'
import { PerchFleetService } from './perch-fleet-service'
import { PerchService } from './perch-service'

function makeFleet(db: PerchDb, dispatch: ReturnType<typeof vi.fn>): PerchFleetService {
  const fleet = new PerchFleetService({
    db,
    getPerchService: () =>
      new PerchService({ db, harness: 'claude', command: process.execPath, spawnArgs: [] }),
    getRuntime: () => ({}) as never
  })
  // Why: dispatch hits createManagedWorktree in production; stub it for the bridge test.
  fleet.dispatchWork = dispatch as never
  return fleet
}

describe('PerchConductorBridge', () => {
  let bridge: PerchConductorBridge | null = null
  let db: PerchDb | null = null

  afterEach(() => {
    bridge?.close()
    db?.close()
    bridge = null
    db = null
  })

  it('rejects requests without the token', async () => {
    db = new PerchDb(':memory:')
    const fleet = makeFleet(db, vi.fn())
    bridge = new PerchConductorBridge({
      getRuntime: () => ({ listRepos: () => [] }) as never,
      getFleet: () => fleet
    })
    const { port } = await bridge.ensureListening()

    const res = await fetch(`http://127.0.0.1:${port}/list`)
    expect(res.status).toBe(401)
  })

  it('dispatches work through the fleet service', async () => {
    db = new PerchDb(':memory:')
    const dispatch = vi.fn().mockResolvedValue({
      task: { id: 'w1', title: 'Explore firstmate' },
      run: { id: 'r1' },
      worktreeId: 'wt-1'
    })
    const fleet = makeFleet(db, dispatch)
    bridge = new PerchConductorBridge({
      getRuntime: () => ({}) as never,
      getFleet: () => fleet
    })
    const { port, token } = await bridge.ensureListening()

    const res = await fetch(`http://127.0.0.1:${port}/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-perch-bridge-token': token },
      body: JSON.stringify({ repoSelector: 'name:firstmate', title: 'Explore firstmate' })
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { worktreeId: string }
    expect(body.worktreeId).toBe('wt-1')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ repoSelector: 'name:firstmate', title: 'Explore firstmate' })
    )
  })

  it('400s a dispatch missing required fields', async () => {
    db = new PerchDb(':memory:')
    const fleet = makeFleet(db, vi.fn())
    bridge = new PerchConductorBridge({
      getRuntime: () => ({}) as never,
      getFleet: () => fleet
    })
    const { port, token } = await bridge.ensureListening()

    const res = await fetch(`http://127.0.0.1:${port}/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-perch-bridge-token': token },
      body: JSON.stringify({ title: 'no repo' })
    })
    expect(res.status).toBe(400)
  })
})
