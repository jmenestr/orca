// Why: the raw lifecycle status as the agent/recovery loop sees it. Named
// RawStatus (not Status) because the UI consumes the *derived* Progress and
// Attention buckets below rather than these nine literal states directly.
export type RawStatus =
  | 'queued'
  | 'dispatched'
  | 'working'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'landing'
  | 'done'
  | 'failed'
  | 'parked'
export const DEFAULT_RAW_STATUS: RawStatus = 'queued'

// Why: terminal statuses have no live process and need no recovery relaunch.
export function isTerminalStatus(status: RawStatus): boolean {
  return status === 'done' || status === 'failed'
}

// Why: statuses that, on recovery, should relaunch a crewmate (work still live).
export function isLiveStatus(status: RawStatus): boolean {
  return status === 'dispatched' || status === 'working' || status === 'awaiting_input'
}

// Why: the conductor view groups the nine raw statuses into a small set of
// lifecycle phases so the UI never has to switch on every variant. This is the
// "derived Progress" half of the model: where the item is in its journey.
export type Progress = 'queued' | 'working' | 'paused' | 'landing' | 'done' | 'failed'

export function deriveProgress(status: RawStatus): Progress {
  switch (status) {
    case 'queued':
    case 'dispatched':
      return 'queued'
    case 'working':
      return 'working'
    case 'awaiting_input':
    case 'awaiting_approval':
    case 'parked':
      return 'paused'
    case 'landing':
      return 'landing'
    case 'done':
      return 'done'
    case 'failed':
      return 'failed'
  }
}

// Why: the "derived Attention" half — does the captain need to act, and why? The
// conductor surfaces this to decide which items to raise. 'none' means the item
// is progressing on its own and needs no human.
export type Attention = 'none' | 'input' | 'approval' | 'error'

export function deriveAttention(status: RawStatus): Attention {
  switch (status) {
    case 'awaiting_input':
      return 'input'
    case 'awaiting_approval':
      return 'approval'
    case 'failed':
      return 'error'
    case 'queued':
    case 'dispatched':
    case 'working':
    case 'landing':
    case 'done':
    case 'parked':
      return 'none'
  }
}
