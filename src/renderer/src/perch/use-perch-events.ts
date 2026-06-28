import { useAppStore } from '@/store'

// Why: subscribe the renderer to the conductor push bus (perch:changed). Each
// stream-json frame is reduced into the Perch store slice. Returns an
// unsubscribe so the App-level IPC bridge (useIpcEvents) can tear it down with
// the rest of its listeners.
export function subscribeConductorEvents(): () => void {
  return window.api.perch.onChanged((frame) => {
    useAppStore.getState().applyConductorFrame(frame)
  })
}
