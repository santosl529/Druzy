'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/** Sticky section links for the settings page; highlights the section in view. */
export function SettingsRail({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (items) => {
        const visible = items.filter((i) => i.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -60% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav aria-label="Settings sections" className="flex md:flex-col gap-1 overflow-x-auto">
      {sections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          aria-current={active === s.id ? 'true' : undefined}
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
            active === s.id ? 'bg-card font-medium text-foreground' : 'text-foreground/75 hover:text-foreground',
          )}
        >
          {s.label}
        </a>
      ))}
    </nav>
  )
}
