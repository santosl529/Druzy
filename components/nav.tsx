'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTransition } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  { href: '/', label: 'Trackers' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/food', label: 'Food' },
  { href: '/journal', label: 'Journal' },
  { href: '/settings', label: 'Settings' },
]

export function Nav({ email }: { email: string }) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function handleSignOut() {
    startTransition(() => { logout() })
  }

  return (
    <header className="border-b bg-background">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight" onClick={() => setOpen(false)}>
            Druzy
          </Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{email}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleSignOut}
            className="hidden md:inline-flex"
          >
            Sign out
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t bg-background">
          <nav className="max-w-4xl mx-auto px-4 py-3 flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2.5 border-b border-border/50 last:border-0"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{email}</span>
              <Button variant="outline" size="sm" disabled={pending} onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
