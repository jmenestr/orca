import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Send, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { ConductorMessage } from '@/perch/perch-client'

// Why: the Conductor view — a plain-language chat with the firstmate conductor
// that directs real Orca crewmates. Built on Orca's shadcn primitives and the
// STYLEGUIDE tokens (worktree-sidebar / muted / border roles, 13px body text).
function ConductorNoticeRow({ message }: { message: ConductorMessage }): React.JSX.Element {
  return (
    <div className="flex w-full items-center justify-center py-0.5">
      <span className="text-[11px] italic text-muted-foreground/70">{message.text}</span>
    </div>
  )
}

function ConductorMessageRow({ message }: { message: ConductorMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[680px] rounded-lg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words',
          isUser && 'bg-primary text-primary-foreground',
          !isUser && 'bg-muted text-foreground'
        )}
      >
        {message.text}
        {message.streaming ? (
          <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
        ) : null}
      </div>
    </div>
  )
}

export default function ConductorPage(): React.JSX.Element {
  const transcript = useAppStore((s) => s.conductorTranscript)
  const streaming = useAppStore((s) => s.conductorStreaming)
  const sendConductorTurn = useAppStore((s) => s.sendConductorTurn)
  const closeConductorPage = useAppStore((s) => s.closeConductorPage)
  const hydrateConductorTranscript = useAppStore((s) => s.hydrateConductorTranscript)

  const [draft, setDraft] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void hydrateConductorTranscript()
  }, [hydrateConductorTranscript])

  // Keep the newest turn in view as frames stream in.
  useEffect(() => {
    const node = viewportRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [transcript])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (text.length === 0) {
      return
    }
    setDraft('')
    void sendConductorTurn(text)
  }, [draft, sendConductorTurn])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter submits; Shift+Enter inserts a newline.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    },
    [submit]
  )

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={closeConductorPage}
          aria-label="Back"
          className="size-7"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Wand2 className="size-4 text-muted-foreground" />
        <h1 className="text-[15px] font-semibold tracking-tight">Conductor</h1>
        <span className="ml-2 text-[12px] text-muted-foreground">
          Direct your fleet in plain language
        </span>
      </header>

      <ScrollArea viewportRef={viewportRef} className="flex-1">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3 px-4 py-5">
          {transcript.length === 0 ? (
            <div className="mt-20 flex flex-col items-center gap-2 text-center text-muted-foreground">
              <Wand2 className="size-7 opacity-40" />
              <p className="text-[14px] font-medium text-foreground">Tell the conductor a goal</p>
              <p className="max-w-[420px] text-[13px]">
                Describe what you want done and the conductor will dispatch a crewmate to work on it
                inside Orca - watch it run in the app.
              </p>
            </div>
          ) : (
            transcript.map((message) =>
              message.role === 'notice' ? (
                <ConductorNoticeRow key={message.id} message={message} />
              ) : (
                <ConductorMessageRow key={message.id} message={message} />
              )
            )
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-[820px] items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ship the dark mode toggle in widget…"
            className={cn(
              'min-h-[40px] max-h-[160px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px]',
              'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
            )}
          />
          <Button onClick={submit} disabled={draft.trim().length === 0} className="h-10 gap-1.5">
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
