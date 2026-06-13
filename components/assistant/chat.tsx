'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { isTextUIPart, isToolUIPart, getToolName } from 'ai'
import { SendIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModuleProposalCard } from '@/components/assistant/module-proposal-card'
import type { ModuleField } from '@/lib/types'

// ----------------------------------------------------------------
// Types mirroring the API route's tool execute return value
// ----------------------------------------------------------------

interface CreateModuleSuccess {
  success: true
  proposal: { name: string; fields: ModuleField[] }
}

interface CreateModuleError {
  success: false
  error: string
}

type CreateModuleResult = CreateModuleSuccess | CreateModuleError

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
            <h1 className="text-xl font-semibold mb-1">AI assistant</h1>
            <p className="text-muted-foreground text-sm max-w-xs">
              Describe a tracker in plain language and I&apos;ll design the schema for you.
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

                  // Tool invocation part — only rendered for assistant messages
                  if (isToolUIPart(part) && message.role === 'assistant') {
                    const toolName = getToolName(part)

                    if (toolName === 'createModule') {
                      const invocation = part as typeof part & {
                        state: string
                        output?: CreateModuleResult
                      }

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
                        const output = invocation.output
                        if (output?.success) {
                          return (
                            <ModuleProposalCard key={i} proposal={output.proposal} />
                          )
                        }
                        // output.success === false: the model will retry via maxSteps,
                        // so we show nothing here — the retry flow produces a new part.
                      }

                      if (invocation.state === 'output-error') {
                        return (
                          <p key={i} className="text-sm text-destructive">
                            Error calling tool — please try again.
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
  'Log workouts with duration and type',
]
