'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export function Nav({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <header className="border-b bg-background">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">Druzy</Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">Trackers</Link>
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
            <Link href="/assistant" className="text-muted-foreground hover:text-foreground transition-colors">Assistant</Link>
            <Link href="/food" className="text-muted-foreground hover:text-foreground transition-colors">Food</Link>
            <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">Settings</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground hidden sm:block">{email}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                logout()
              })
            }
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
