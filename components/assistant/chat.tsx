'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { isTextUIPart, isToolUIPart, getToolName } from 'ai'
import { Button } from '@/components/ui/button'
import { ModuleProposalCard } from '@/components/assistant/module-proposal-card'
import { FormulaProposalCard } from '@/components/assistant/formula-proposal-card'
import { ChartProposalCard } from '@/components/assistant/chart-proposal-card'
import { AnalyticsInsightCard } from '@/components/assistant/analytics-insight-card'
import { AssistantMarkdown } from '@/components/assistant/assistant-markdown'
import { getCrystal } from '@/lib/crystals'
import {
  sanitizeAssistantText,
  selectAssistantParts,
} from '@/lib/ai/chat-presentation'
import type { ModuleField, FormulaConfig, ChartConfig } from '@/lib/types'
import type { EnrichedInput } from '@/components/assistant/formula-proposal-card'
import type { MultiSeriesRow, SeriesMeta } from '@/lib/chart-data'
import type { AnalyticsResult } from '@/lib/analytics'

// ----------------------------------------------------------------
// Types mirroring the API route's tool execute return values
// ----------------------------------------------------------------

type CreateModuleResult =
  | { success: true; proposal: { name: string; fields: ModuleField[] } }
  | { success: false; error: string }

type CreateFormulaModuleResult =
  | {
      success: true
      proposal: {
        name: string
        config: FormulaConfig
        enrichedInputs: EnrichedInput[]
      }
    }
  | { success: false; error: string }

type ProposeChartResult =
  | {
      success: true
      config: ChartConfig
      previewData: { rows: MultiSeriesRow[]; series: SeriesMeta[] }
      moduleOptions: Array<{ id: string; name: string }>
      defaultModuleId: string
    }
  | { success: false; error: string }

type QueryAnalyticsResult =
  | {
      success: true
      operation: string
      result: AnalyticsResult
      labels: {
        moduleA: string
        fieldA: string
        unitA?: string
        moduleB?: string
        fieldB?: string
        unitB?: string
      }
    }
  | { success: false; error: string }

// ----------------------------------------------------------------
// Main chat component
// ----------------------------------------------------------------

/** A tracker as listed in the side rail. */
export interface RailModule {
  id: string
  name: string
  crystalType: string
  /** Short field description, e.g. "lbs", "score, mode", "4 fields". */
  summary: string
}

export function AssistantChat({ modules }: { modules: RailModule[] }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    onError: (error) => console.error('[chat] client stream error:', error),
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // A tool part stuck in an input-* state once its stream has settled means the
  // model's argument stream ended incomplete: execute never ran, so there is no
  // output and no output-error either. Without this the spinner runs forever.
  const streamSettled = status === 'ready' || status === 'error'
  function isStalled(messageId: string) {
    return streamSettled || messageId !== messages[messages.length - 1]?.id
  }

  function retryLastUserMessage() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    const text = lastUser.parts.filter(isTextUIPart).map((p) => p.text).join('')
    if (text) sendMessage({ text })
  }

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage({ text })
  }

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_290px] lg:items-start">
      <div className="flex flex-col gap-[18px] min-h-[calc(100vh-10rem)]">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Assistant</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Describe a tracker, ask about your data, or ask for a chart. Nothing is saved until you confirm.
          </p>
        </div>

      {/* Message list */}
      {messages.length > 0 && (
        <div className="flex-1 flex flex-col gap-[18px] pb-2">
          {messages.map((message) => {
            const visibleParts =
              message.role === 'assistant'
                ? selectAssistantParts(message.parts)
                : message.parts

            return (
              <div
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start max-w-[680px]'}
              >
                <div
                  className={
                    message.role === 'user'
                      ? 'bg-[color-mix(in_oklch,var(--primary)_18%,var(--card))] rounded-[14px_14px_4px_14px] px-[15px] py-[11px] max-w-[min(560px,85%)] text-sm leading-relaxed'
                      : 'w-full space-y-3 text-sm leading-relaxed text-foreground/85'
                  }
                >
                {visibleParts.map((part, i) => {
                  // Text part
                  if (isTextUIPart(part)) {
                    if (message.role === 'assistant') {
                      const text = sanitizeAssistantText(part.text)
                      return text ? <AssistantMarkdown key={i} text={text} /> : null
                    }
                    return (
                      <p key={i}>{part.text}</p>
                    )
                  }

                  // Tool invocation parts — only rendered for assistant messages
                  if (isToolUIPart(part) && message.role === 'assistant') {
                    const toolName = getToolName(part)
                    const invocation = part as typeof part & {
                      state: string
                      output?: unknown
                    }

                    // ── createModule ──────────────────────────────────────────
                    if (toolName === 'createModule') {
                      if (
                        invocation.state === 'input-streaming' ||
                        invocation.state === 'input-available'
                      ) {
                        return (
                          <ToolStatus
                            key={i}
                            label="Designing your tracker…"
                            stalled={isStalled(message.id)}
                            onRetry={retryLastUserMessage}
                          />
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as CreateModuleResult | undefined
                        if (output?.success) {
                          return <ModuleProposalCard key={i} proposal={output.proposal} />
                        }
                        return <ToolFailure key={i} />
                      }
                      if (invocation.state === 'output-error') {
                        return (
                          <p key={i} className="text-sm text-destructive">
                            Error calling tool — please try again.
                          </p>
                        )
                      }
                    }

                    // ── createFormulaModule ───────────────────────────────────
                    if (toolName === 'createFormulaModule') {
                      if (
                        invocation.state === 'input-streaming' ||
                        invocation.state === 'input-available'
                      ) {
                        return (
                          <ToolStatus
                            key={i}
                            label="Designing your formula tracker…"
                            stalled={isStalled(message.id)}
                            onRetry={retryLastUserMessage}
                          />
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as CreateFormulaModuleResult | undefined
                        if (output?.success) {
                          return <FormulaProposalCard key={i} proposal={output.proposal} />
                        }
                        return <ToolFailure key={i} />
                      }
                      if (invocation.state === 'output-error') {
                        return (
                          <p key={i} className="text-sm text-destructive">
                            Error calling tool — please try again.
                          </p>
                        )
                      }
                    }

                    // ── proposeChart ──────────────────────────────────────────
                    if (toolName === 'proposeChart') {
                      if (
                        invocation.state === 'input-streaming' ||
                        invocation.state === 'input-available'
                      ) {
                        return (
                          <ToolStatus
                            key={i}
                            label="Building your chart preview…"
                            stalled={isStalled(message.id)}
                            onRetry={retryLastUserMessage}
                          />
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as ProposeChartResult | undefined
                        if (output?.success) {
                          return (
                            <ChartProposalCard
                              key={i}
                              config={output.config}
                              previewData={output.previewData}
                              moduleOptions={output.moduleOptions}
                              defaultModuleId={output.defaultModuleId}
                            />
                          )
                        }
                        return <ToolFailure key={i} />
                      }
                      if (invocation.state === 'output-error') {
                        return (
                          <p key={i} className="text-sm text-destructive">
                            Error building chart preview — please try again.
                          </p>
                        )
                      }
                    }

                    // ── queryAnalytics ────────────────────────────────────────
                    if (toolName === 'queryAnalytics') {
                      if (
                        invocation.state === 'input-streaming' ||
                        invocation.state === 'input-available'
                      ) {
                        return (
                          <ToolStatus
                            key={i}
                            label="Computing…"
                            stalled={isStalled(message.id)}
                            onRetry={retryLastUserMessage}
                          />
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as QueryAnalyticsResult | undefined
                        if (output?.success) {
                          return (
                            <AnalyticsInsightCard
                              key={i}
                              operation={output.operation}
                              result={output.result}
                              labels={output.labels}
                            />
                          )
                        }
                        return <ToolFailure key={i} />
                      }
                      if (invocation.state === 'output-error') {
                        return (
                          <p key={i} className="text-sm text-destructive">
                            Error computing analytics — please try again.
                          </p>
                        )
                      }
                    }
                  }

                  return null
                })}
                </div>
              </div>
            )
          })}

          {/* Loading indicator while waiting for first token */}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start">
              <div className="flex gap-1 items-center h-6 px-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

        {/* Suggestions + input */}
        <div className="mt-auto flex flex-col gap-2.5 pt-2">
          <div className="flex flex-wrap gap-2">
            {(messages.length === 0 ? EXAMPLES : EXAMPLES.slice(0, 3)).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="text-[0.8rem] rounded-full border px-3 py-1 text-foreground/75 hover:text-foreground hover:bg-muted transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2.5 rounded-xl border border-foreground/15 bg-card py-2 pr-2 pl-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe a tracker or ask about your data…"
              aria-label="Message the assistant"
              disabled={isLoading}
              className="flex-1 min-w-0 bg-transparent text-[0.95rem] outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <span className="hidden sm:block font-mono text-[11px] text-muted-foreground">↵</span>
            <Button type="submit" disabled={isLoading || !input.trim()} className="h-9 px-3.5">
              Send
            </Button>
          </form>
        </div>
      </div>

      {/* Rail */}
      <aside className="hidden lg:flex flex-col gap-4 sticky top-6">
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="px-[18px] pt-4 pb-2.5">
            <h2 className="font-heading text-[0.95rem] font-semibold">What the assistant sees</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your tracker names and fields. Entries stay with Druzy; for questions and charts the assistant gets
              the results Druzy computes (averages, chart points), not your raw log.
            </p>
          </div>
          {modules.length === 0 ? (
            <p className="border-t px-[18px] py-3 text-[0.8rem] text-muted-foreground">No trackers yet.</p>
          ) : (
            modules.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 border-t px-[18px] py-2.5 text-[0.8rem]">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rotate-45"
                  style={{ background: getCrystal(m.crystalType).primary }}
                />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[45%]">{m.summary}</span>
              </div>
            ))
          )}
        </div>
        <div className="rounded-2xl border bg-card px-[18px] py-4 flex flex-col gap-2.5 text-[0.8rem]">
          <h2 className="font-heading text-[0.95rem] font-semibold">The assistant can</h2>
          {CAPABILITIES.map((c) => (
            <div key={c} className="flex gap-2.5">
              <span className="text-accent-text" aria-hidden="true">✦</span>
              <span className="text-foreground/80">{c}</span>
            </div>
          ))}
        </div>
      </aside>
    </main>
  )
}

// ----------------------------------------------------------------
// Pending / stalled state for a tool call
// ----------------------------------------------------------------

function ToolStatus({
  label,
  stalled,
  onRetry,
}: {
  label: string
  stalled: boolean
  onRetry: () => void
}) {
  if (!stalled) {
    return <p className="text-sm text-muted-foreground italic animate-pulse">{label}</p>
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-destructive">
        The assistant started this step but the response ended before it finished.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground transition-colors"
      >
        Try again
      </button>
    </div>
  )
}

function ToolFailure() {
  return (
    <p className="text-sm text-destructive">
      I couldn&apos;t complete that request. Please adjust it and try again.
    </p>
  )
}

const EXAMPLES = [
  'Track my saxophone songs with difficulty',
  'Log my daily mood and sleep hours',
  'Track books I read with a rating',
  'Compute my calories per unit of weight from my existing trackers',
  "What's my average sleep over the past month?",
  'Is my weight trending up or down?',
]

const CAPABILITIES = [
  'Create a tracker from a sentence',
  'Combine trackers with a formula',
  'Draft a chart from your real data',
  'Answer questions: averages, trends, correlations, streaks',
]
