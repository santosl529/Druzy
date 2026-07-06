'use client'

import { useState, useTransition } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { deleteModule, getModuleDeleteWarnings } from '@/app/actions/modules'
import { cn } from '@/lib/utils'

export function DeleteModuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    const { formulaDependents, chartDependents } = await getModuleDeleteWarnings(id)

    const lines: string[] = ['Delete this tracker and all its entries? This cannot be undone.']

    if (formulaDependents.length > 0) {
      lines.push(
        `\nWarning: the following formula trackers use this tracker as an input and will stop computing correctly:\n  • ${formulaDependents.join('\n  • ')}`
      )
    }

    if (chartDependents.length > 0) {
      lines.push(
        `\nWarning: charts in the following trackers reference this tracker as a data source and will show missing data:\n  • ${chartDependents.join('\n  • ')}`
      )
    }

    if (!confirm(lines.join(''))) return
    setError(null)
    startTransition(async () => {
      const result = await deleteModule(id)
      // Only reachable on failure — success redirects and never returns.
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={handleClick}
        disabled={pending}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5'
        )}
      >
        {pending ? 'Deleting…' : 'Delete tracker'}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
