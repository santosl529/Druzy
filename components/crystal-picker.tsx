'use client'

import { CRYSTAL_KEYS, CRYSTALS, type CrystalKey } from '@/lib/crystals'
import { cn } from '@/lib/utils'

interface Props {
  value: CrystalKey
  onChange: (key: CrystalKey) => void
}

export function CrystalPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Crystal type">
      {CRYSTAL_KEYS.map((key) => {
        const c = CRYSTALS[key]
        const selected = key === value
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
              selected
                ? 'border-foreground/40 bg-muted font-medium'
                : 'border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            <span
              className="size-3 rounded-full"
              style={{ background: `radial-gradient(circle at 30% 30%, ${c.glow}, ${c.primary})` }}
            />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}
