// Why: maps hook-driven agent states to perch statuses. The Run mapping is the
// core fix: hook `done` means the agent finished THIS turn (idle), never that
// the work is complete, so it maps to `idle` (non-terminal) rather than `done`.
import type { AgentStatusState } from '../../shared/agent-status-types'
import type { Harness, RawStatus, RunStatus } from './perch-types'

// Why: hook state → Run turn-status. `done` → `idle` (between-turns rest) so a
// finished turn never deletes the Task. waiting/blocked surface as awaiting input.
export function mapAgentStateToRunStatus(state: AgentStatusState): RunStatus {
  switch (state) {
    case 'working':
      return 'working'
    case 'waiting':
    case 'blocked':
      return 'awaiting_input'
    case 'done':
      return 'idle'
  }
}

// Why: kept for the legacy RawStatus derivations still used by tests/snapshots.
export function mapAgentStateToRawStatus(state: AgentStatusState): RawStatus {
  switch (state) {
    case 'working':
      return 'working'
    case 'waiting':
    case 'blocked':
      return 'awaiting_input'
    case 'done':
      return 'done'
  }
}

export function mapAgentTypeToHarness(agentType: string | undefined | null): Harness {
  if (agentType === 'cursor') {
    return 'cursor'
  }
  return 'claude'
}

export function describeFleetDelta(
  title: string,
  previous: RawStatus | null,
  next: RawStatus,
  sourceLabel: string
): string {
  if (previous === null) {
    return `${sourceLabel} started "${title}" (${next.replace(/_/g, ' ')})`
  }
  if (previous === next) {
    return ''
  }
  return `"${title}": ${previous.replace(/_/g, ' ')} → ${next.replace(/_/g, ' ')}`
}
