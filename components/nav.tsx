'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/', label: 'Trackers' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/assistant', label: 'Assistant' },
  { href: '/food', label: 'Food' },
  { href: '/journal', label: 'Journal' },
  { href: '/settings', label: 'Settings' },
]

function isNavActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const navLinkClass = (active: boolean) =>
  cn(
    'transition-colors',
    active
      ? 'text-primary font-semibold'
      : 'text-foreground/80 font-medium hover:text-foreground',
  )

export function Nav({ email }: { email: string }) {
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  function handleSignOut() {
    startTransition(() => { logout() })
  }

  return (
    <header className="border-b bg-background">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-heading text-[1.05rem] font-bold tracking-tight shrink-0 text-foreground"
            onClick={() => setOpen(false)}
          >
            Druzy
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClass(isNavActive(pathname, link.href))}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-foreground/70 hidden sm:block">{email}</span>
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
          <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(navLinkClass(isNavActive(pathname, link.href)), 'py-2.5 border-b border-border/50 last:border-0')}
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
