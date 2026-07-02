'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MacroValues } from '@/components/food/shared'

// ----------------------------------------------------------------
// Macro input group
// ----------------------------------------------------------------

interface MacroFieldsProps {
  values: MacroValues
  onChange: (field: string, value: string) => void
  disabled?: boolean
}

export function MacroFields({ values, onChange, disabled }: MacroFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(
        [
          { key: 'calories', label: 'Calories', unit: 'kcal' },
          { key: 'protein_g', label: 'Protein', unit: 'g' },
          { key: 'fat_g', label: 'Fat', unit: 'g' },
          { key: 'carbs_g', label: 'Carbs', unit: 'g' },
        ] as const
      ).map(({ key, label, unit }) => (
        <div key={key} className="space-y-1">
          <Label htmlFor={key} className="text-xs text-muted-foreground">
            {label} <span className="text-muted-foreground/60">({unit})</span>
          </Label>
          <Input
            id={key}
            type="number"
            min="0"
            step={key === 'calories' ? '1' : '0.1'}
            placeholder="0"
            value={values[key]}
            onChange={(e) => onChange(key, e.target.value)}
            disabled={disabled}
            className="h-9"
          />
        </div>
      ))}
    </div>
  )
}
