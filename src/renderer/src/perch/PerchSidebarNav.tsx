import React from 'react'
import { Wand2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'

// Why: the Conductor sidebar entry, styled to match the other SidebarNav buttons
// (same row layout, active-state tokens, icon weight). Lives in the perch dir so
// SidebarNav only needs a one-line <PerchSidebarNav /> mount.
const PerchSidebarNav = React.memo(function PerchSidebarNav() {
  const openConductorPage = useAppStore((s) => s.openConductorPage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'conductor'

  return (
    <button
      type="button"
      onClick={openConductorPage}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Wand2
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">Conductor</span>
    </button>
  )
})

export default PerchSidebarNav
