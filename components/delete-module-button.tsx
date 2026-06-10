'use client'

import { useTransition } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { deleteModule } from '@/app/actions/modules'
import { cn } from '@/lib/utils'

export function DeleteModuleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Delete this tracker and all its entries? This cannot be undone.')) return
    startTransition(() => deleteModule(id))
  }

  return (
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
  )
}
