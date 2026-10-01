'use client'

import { useEffect, useState } from 'react'
import { checkOllama, type OllamaStatus } from '@/lib/ollama'
import { cn } from '@/lib/utils'

/** Header pill: whether the local transcription model is reachable. */
export function OllamaStatusPill() {
  const [status, setStatus] = useState<OllamaStatus | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    checkOllama(ctrl.signal).then(setStatus)
    return () => ctrl.abort()
  }, [])

  const label =
    status === null
      ? 'Checking Ollama…'
      : status.state === 'connected'
        ? 'Ollama connected'
        : status.state === 'model-missing'
          ? 'Model not pulled'
          : 'Ollama not reachable'
  const dot =
    status?.state === 'connected' ? '#72D4A8' : status?.state === 'model-missing' ? '#F0CC6A' : status ? '#F09070' : undefined

  return (
    <span
      className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-[0.8rem] font-medium"
      title={status?.state === 'unreachable' ? 'Start it with `ollama serve` (see the journal setup notes).' : undefined}
    >
      <span
        aria-hidden="true"
        className={cn('size-[7px] rounded-full', !dot && 'bg-muted-foreground/50 animate-pulse')}
        style={dot ? { background: dot, boxShadow: `0 0 6px ${dot}` } : undefined}
      />
      {label}
      {status && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs text-muted-foreground">{status.model}</span>
        </>
      )}
    </span>
  )
}
