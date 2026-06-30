import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, FileText, Loader2, Plus, Send, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import type { ConductorMessage, ConductorNoticeRef } from '@/perch/perch-client'
import { ConductorDispatchDialog } from '@/perch/ConductorDispatchDialog'
import { ConductorMarkdownMessage } from '@/perch/ConductorMarkdownMessage'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import {
  applyConductorSuggestion,
  useConductorComposerSuggestions
} from '@/perch/ConductorComposerSuggestions'
import { ConductorTaskChips } from '@/perch/ConductorTaskChips'

// Why: the Conductor view — a plain-language chat with the firstmate conductor
// that directs real Orca crewmates. Built on Orca's shadcn primitives and the
// STYLEGUIDE tokens (worktree-sidebar / muted / border roles, 13px body text).
function openIntegrationsSettings(): void {
  useAppStore.getState().openSettingsTarget({ pane: 'integrations', repoId: null })
  useAppStore.getState().openSettingsPage()
}

function ConductorMessageRow({
  message,
  onOpenPanel,
  onOpenAgent,
  isOpenInPanel
}: {
  message: ConductorMessage
  onOpenPanel: (message: ConductorMessage) => void
  onOpenAgent: (ref: ConductorNoticeRef) => void
  isOpenInPanel: boolean
}): React.JSX.Element {
  const isUser = message.role === 'user'
  const isNotice = message.role === 'notice'
  const needsIntegrationConnect =
    isNotice &&
    (message.text.includes('connect') || message.text.includes('Connect integration')) &&
    (message.text.includes('Integrations') || message.text.includes('notion.budget'))
  // Why: only offer the jump when the referenced agent still has a worktree to
  // reveal; a failed/cancelled dispatch carries a ref with no worktree.
  const agentRef = message.ref?.worktreeId ? message.ref : null
  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[680px] rounded-lg px-3 py-2 text-[13px] leading-relaxed break-words',
          isUser && 'bg-primary text-primary-foreground whitespace-pre-wrap',
          !isUser && !isNotice && 'bg-muted text-foreground',
          isNotice &&
            !needsIntegrationConnect &&
            'border border-border/60 bg-background/40 text-muted-foreground italic',
          isNotice &&
            needsIntegrationConnect &&
            'border border-destructive/40 bg-destructive/5 text-foreground not-italic',
          isOpenInPanel && 'ring-1 ring-primary/40'
        )}
      >
        {/* Why: the captain's own turns are plain typed text, but the conductor's
            replies and fleet reports are markdown (headers, tables, lists) that
            can run long — render them collapsed with a side-panel escape hatch. */}
        {isUser ? (
          message.text
        ) : needsIntegrationConnect ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] leading-relaxed">{message.text}</p>
            <p className="text-[12px] text-muted-foreground">
              No agent was dispatched. Connect Notion budget, then send @task:verify-expenses again.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={openIntegrationsSettings}
            >
              Open Integrations
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <ConductorMarkdownMessage
              text={message.text}
              streaming={message.streaming}
              onOpenPanel={() => onOpenPanel(message)}
              fadeClassName={isNotice ? 'from-background' : 'from-muted'}
            />
            {agentRef ? (
              <button
                type="button"
                onClick={() => onOpenAgent(agentRef)}
                className={cn(
                  'inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium not-italic',
                  'text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                )}
              >
                <ExternalLink className="size-3" />
                View {agentRef.title || 'agent'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

// Why: long markdown (a crewmate's full report) is hard to read inline; the side
// panel gives it a roomy, scrollable surface without leaving the conductor chat.
function ConductorReportPanel({
  message,
  onClose
}: {
  message: ConductorMessage
  onClose: () => void
}): React.JSX.Element {
  return (
    <aside className="flex w-[440px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <FileText className="size-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold tracking-tight">Report</h2>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          onClick={onClose}
          aria-label="Close report"
        >
          <X className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 py-4">
          <CommentMarkdown content={message.text} variant="document" className="text-[13px]" />
        </div>
      </ScrollArea>
    </aside>
  )
}

export default function ConductorPage(): React.JSX.Element {
  const transcript = useAppStore((s) => s.conductorTranscript)
  const streaming = useAppStore((s) => s.conductorStreaming)
  const sendConductorTurn = useAppStore((s) => s.sendConductorTurn)
  const closeConductorPage = useAppStore((s) => s.closeConductorPage)
  const hydrateConductorTranscript = useAppStore((s) => s.hydrateConductorTranscript)
  const openActivityPage = useAppStore((s) => s.openActivityPage)

  const [draft, setDraft] = useState('')
  const {
    suggestions,
    active: suggestionsActive,
    reload: reloadSuggestions
  } = useConductorComposerSuggestions(draft)
  const [dispatchOpen, setDispatchOpen] = useState(false)
  // Why: track the panel message by id (not the object) so a streaming/finalizing
  // turn stays in sync and the panel auto-closes if the message disappears.
  const [panelMessageId, setPanelMessageId] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const panelMessage = useMemo(
    () => (panelMessageId ? (transcript.find((m) => m.id === panelMessageId) ?? null) : null),
    [panelMessageId, transcript]
  )

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
      if (suggestionsActive && suggestions.length > 0 && suggestions[0]?.token) {
        if (e.key === 'Tab') {
          e.preventDefault()
          setDraft(applyConductorSuggestion(draft, suggestions[0]!.token))
          return
        }
      }
      // Enter submits; Shift+Enter inserts a newline.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit()
      }
    },
    [draft, submit, suggestions, suggestionsActive]
  )

  const insertToken = useCallback((token: string) => {
    setDraft((current) => (current.trim().length > 0 ? `${current.trimEnd()} ${token}` : token))
  }, [])

  // Why: jump from a fleet report to the agent that produced it — open Activity
  // and reveal the agent's worktree, mirroring the fleet strip's open action.
  const onOpenAgent = useCallback(
    (ref: ConductorNoticeRef) => {
      openActivityPage()
      if (ref.worktreeId) {
        activateAndRevealWorktree(ref.worktreeId)
      }
    },
    [openActivityPage]
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDispatchOpen(true)}
          className="ml-auto h-8 gap-1.5"
        >
          <Plus className="size-4" />
          Start agent
        </Button>
      </header>

      <ConductorDispatchDialog open={dispatchOpen} onOpenChange={setDispatchOpen} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea viewportRef={viewportRef} className="min-h-0 flex-1">
            <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3 px-4 py-5">
              {transcript.length === 0 ? (
                <div className="mt-20 flex flex-col items-center gap-2 text-center text-muted-foreground">
                  <Wand2 className="size-7 opacity-40" />
                  <p className="text-[14px] font-medium text-foreground">
                    Tell the conductor a goal
                  </p>
                  <p className="max-w-[420px] text-[13px]">
                    Describe what you want done and the conductor will dispatch a crewmate to work
                    on it inside Orca - watch it run in the app.
                  </p>
                </div>
              ) : (
                transcript.map((message) => (
                  <ConductorMessageRow
                    key={message.id}
                    message={message}
                    onOpenPanel={(m) => setPanelMessageId(m.id)}
                    onOpenAgent={onOpenAgent}
                    isOpenInPanel={message.id === panelMessageId}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border px-4 py-3">
            <div className="relative mx-auto w-full max-w-[820px]">
              <ConductorTaskChips onInsert={insertToken} />
              {suggestionsActive ? (
                <div className="absolute bottom-full left-0 right-14 z-10 mb-2 overflow-hidden rounded-md border border-border bg-popover shadow-md">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.token || suggestion.label}
                      type="button"
                      disabled={!suggestion.token}
                      className="block w-full px-3 py-2 text-left hover:bg-muted disabled:cursor-default disabled:opacity-70"
                      onClick={() => {
                        if (suggestion.token) {
                          setDraft(applyConductorSuggestion(draft, suggestion.token))
                        }
                      }}
                    >
                      <div className="text-[13px] font-medium">{suggestion.label}</div>
                      {suggestion.detail ? (
                        <div className="text-[11px] text-muted-foreground">{suggestion.detail}</div>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  onFocus={() => reloadSuggestions()}
                  rows={1}
                  placeholder="Describe the goal, or type @ to pick a SkillTask"
                  className={cn(
                    'min-h-[40px] max-h-[160px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px]',
                    'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                  )}
                />
                <Button
                  onClick={submit}
                  disabled={draft.trim().length === 0}
                  className="h-10 gap-1.5"
                >
                  {streaming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>

        {panelMessage ? (
          <ConductorReportPanel message={panelMessage} onClose={() => setPanelMessageId(null)} />
        ) : null}
      </div>
    </div>
  )
}
