import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, PanelRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'

// Why: long conductor replies and fleet reports (full markdown summaries) would
// otherwise dominate the chat. Clamp tall messages to a preview with a
// Show more/less toggle, and offer opening the full content in a side panel.
const COLLAPSED_MAX_PX = 220

export function ConductorMarkdownMessage({
  text,
  streaming,
  onOpenPanel,
  fadeClassName,
  className
}: {
  text: string
  streaming?: boolean
  onOpenPanel: () => void
  /** Tailwind `from-*` color so the fade overlay matches the bubble background. */
  fadeClassName: string
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) {
      return
    }
    // Why: scrollHeight reports natural content height even while the node is
    // clamped via maxHeight, so we can detect overflow without un-clamping.
    setOverflowing(node.scrollHeight > COLLAPSED_MAX_PX + 8)
  }, [text])

  // Why: never clamp a streaming reply — the height is still growing and the
  // captain is actively reading the live output.
  const clamp = overflowing && !expanded && !streaming

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        ref={ref}
        className="relative overflow-hidden"
        style={clamp ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
      >
        <CommentMarkdown content={text} variant="document" className="text-[13px]" />
        {clamp ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent',
              fadeClassName
            )}
            aria-hidden="true"
          />
        ) : null}
        {streaming ? (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
        ) : null}
      </div>
      {overflowing && !streaming ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {expanded ? 'Show less' : 'Show more'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onOpenPanel}
          >
            <PanelRight className="size-3" />
            Open
          </Button>
        </div>
      ) : null}
    </div>
  )
}
