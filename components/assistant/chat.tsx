'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { isTextUIPart, isToolUIPart, getToolName } from 'ai'
import { SendIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleProposalCard } from '@/components/assistant/module-proposal-card'
import { FormulaProposalCard } from '@/components/assistant/formula-proposal-card'
import { ChartProposalCard } from '@/components/assistant/chart-proposal-card'
import { AnalyticsInsightCard } from '@/components/assistant/analytics-insight-card'
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

export function AssistantChat() {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat()

  const isLoading = status === 'submitted' || status === 'streaming'

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
    <main className="flex flex-col flex-1 max-w-3xl mx-auto w-full px-4 py-6">
      {/* Empty state */}
      {messages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 pb-24">
          <div className="rounded-full bg-muted p-4">
            <SparklesIcon className="size-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight mb-1">AI assistant</h1>
            <p className="text-muted-foreground text-sm max-w-xs">
              Describe a tracker to create, or ask me to compute something from your existing trackers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                className="text-xs rounded-full border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <div className="flex-1 space-y-6 pb-4 overflow-y-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%] text-sm'
                    : 'max-w-full space-y-3'
                }
              >
                {message.parts.map((part, i) => {
                  // Text part
                  if (isTextUIPart(part)) {
                    return (
                      <p
                        key={i}
                        className={
                          message.role === 'assistant'
                            ? 'text-sm leading-relaxed whitespace-pre-wrap'
                            : undefined
                        }
                      >
                        {part.text}
                      </p>
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
                          <p key={i} className="text-sm text-muted-foreground italic animate-pulse">
                            Designing your tracker…
                          </p>
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as CreateModuleResult | undefined
                        if (output?.success) {
                          return <ModuleProposalCard key={i} proposal={output.proposal} />
                        }
                        // success: false → model retries; render nothing
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
                          <p key={i} className="text-sm text-muted-foreground italic animate-pulse">
                            Designing your formula tracker…
                          </p>
                        )
                      }
                      if (invocation.state === 'output-available') {
                        const output = invocation.output as CreateFormulaModuleResult | undefined
                        if (output?.success) {
                          return <FormulaProposalCard key={i} proposal={output.proposal} />
                        }
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
                          <p key={i} className="text-sm text-muted-foreground italic animate-pulse">
                            Building your chart preview…
                          </p>
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
                          <p key={i} className="text-sm text-muted-foreground italic animate-pulse">
                            Computing…
                          </p>
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
                        // success: false → LLM retries; render nothing
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
          ))}

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

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="mt-auto flex gap-2 pt-4 border-t"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe a tracker you want to create…"
          disabled={isLoading}
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
          <SendIcon className="size-4" />
        </Button>
      </form>
    </main>
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
