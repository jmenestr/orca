import React from 'react'
import { Columns3, Wand2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'

// Why: the Conductor + Task board sidebar entries, styled to match the other
// SidebarNav buttons (same row layout, active-state tokens, icon weight). Lives
// in the perch dir so SidebarNav only needs a one-line <PerchSidebarNav /> mount.
function PerchNavButton({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: typeof Wand2
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">{label}</span>
    </button>
  )
}

const PerchSidebarNav = React.memo(function PerchSidebarNav() {
  const openConductorPage = useAppStore((s) => s.openConductorPage)
  const openTaskBoard = useAppStore((s) => s.openTaskBoard)
  const activeView = useAppStore((s) => s.activeView)

  return (
    <>
      <PerchNavButton
        active={activeView === 'conductor'}
        onClick={openConductorPage}
        icon={Wand2}
        label="Conductor"
      />
      <PerchNavButton
        active={activeView === 'taskBoard'}
        onClick={openTaskBoard}
        icon={Columns3}
        label="Board"
      />
    </>
  )
})

export default PerchSidebarNav
