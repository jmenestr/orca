import { useAppStore } from '@/store'

// Why: the perch API is absent on preloads that don't ship the conductor (e.g.
// the web preload) and in tests that stub a partial window.api. Guard so a
// missing bridge no-ops instead of throwing during useIpcEvents setup.
export function subscribeConductorEvents(): () => void {
  const perch = window.api?.perch
  if (!perch?.onChanged) {
    return () => {}
  }
  return perch.onChanged((frame) => {
    useAppStore.getState().applyConductorFrame(frame)
  })
}

export function subscribeConductorFleetEvents(): () => void {
  const perch = window.api?.perch
  if (!perch?.onWorkChanged) {
    return () => {}
  }
  return perch.onWorkChanged((task) => {
    useAppStore.getState().applyConductorTask(task)
  })
}
