'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { MacroValues } from '@/components/food/shared'

// ----------------------------------------------------------------
// Macro input group
// ----------------------------------------------------------------

export const MACROS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
] as const

interface MacroFieldsProps {
  values: MacroValues
  onChange: (field: string, value: string) => void
  disabled?: boolean
  /** `lg`: tall inputs with the unit inside (the log panel). */
  size?: 'default' | 'lg'
  /** Prefix for input ids, so two groups can share a page. */
  idPrefix?: string
  className?: string
}

export function MacroFields({ values, onChange, disabled, size = 'default', idPrefix = '', className }: MacroFieldsProps) {
  const lg = size === 'lg'
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      {MACROS.map(({ key, label, unit }) => (
        <div key={key} className={lg ? 'flex flex-col gap-1.5' : 'space-y-1'}>
          <Label htmlFor={`${idPrefix}${key}`} className="text-xs font-normal text-muted-foreground">
            {label}
            {!lg && <span className="text-muted-foreground/60"> ({unit})</span>}
          </Label>
          <div className="relative">
            <Input
              id={`${idPrefix}${key}`}
              type="number"
              inputMode="decimal"
              min="0"
              step={key === 'calories' ? '1' : '0.1'}
              placeholder="0"
              value={values[key]}
              onChange={(e) => onChange(key, e.target.value)}
              disabled={disabled}
              className={cn(
                lg
                  ? 'h-[52px] rounded-[10px] bg-background dark:bg-background px-3.5 pr-12 font-heading text-[1.35rem] md:text-[1.35rem] font-semibold tabular-nums placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'
                  : 'h-9',
              )}
            />
            {lg && (
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.8rem] text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
