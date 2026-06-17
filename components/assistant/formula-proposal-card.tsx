'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, FunctionSquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { createFormulaModuleFromProposal } from '@/app/actions/formula'
import { CrystalPicker } from '@/components/crystal-picker'
import type { FormulaConfig } from '@/lib/types'
import type { CrystalKey } from '@/lib/crystals'

// Enriched input shape returned by the tool execute (includes display names).
export interface EnrichedInput {
  moduleId: string
  moduleName: string
  field: string
  fieldLabel: string
  fieldUnit?: string
  alias: string
  defaultValue?: number
}

interface Proposal {
  name: string
  config: FormulaConfig
  enrichedInputs: EnrichedInput[]
}

interface Props {
  proposal: Proposal
}

export function FormulaProposalCard({ proposal }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(proposal.name)
  const [expression, setExpression] = useState(proposal.config.expression)
  // Alias and defaultValue are editable; moduleId/field are fixed (set by AI).
  const [inputs, setInputs] = useState<EnrichedInput[]>(proposal.enrichedInputs)
  const [crystalType, setCrystalType] = useState<CrystalKey>('amethyst')
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)

  if (discarded) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Proposal discarded. Describe what you want to compute below.
      </div>
    )
  }

  function updateInput(i: number, key: 'alias' | 'defaultValue', value: string) {
    setInputs((prev) => {
      const next = [...prev]
      if (key === 'alias') {
        next[i] = { ...next[i], alias: value }
      } else {
        const n = parseFloat(value)
        next[i] = { ...next[i], defaultValue: isNaN(n) ? undefined : n }
      }
      return next
    })
  }

  function handleConfirm() {
    setError(null)
    const config: FormulaConfig = {
      inputs: inputs.map(({ moduleId, field, alias, defaultValue }) => ({
        moduleId,
        field,
        alias,
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      })),
      expression,
    }
    startTransition(async () => {
      const result = await createFormulaModuleFromProposal(name, config, crystalType)
      if ('error' in result) {
        setError(result.error)
      } else {
        router.push(`/modules/${result.id}`)
      }
    })
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm w-full max-w-xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FunctionSquareIcon className="size-4 text-purple-500 shrink-0" />
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Formula tracker — review and confirm
        </p>
      </div>

      <Separator />

      {/* Tracker name */}
      <div className="space-y-1.5">
        <Label htmlFor="formula-name">Tracker name</Label>
        <Input
          id="formula-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-medium"
        />
      </div>

      {/* Crystal */}
      <div className="space-y-1.5">
        <Label>Crystal</Label>
        <CrystalPicker value={crystalType} onChange={setCrystalType} />
      </div>

      {/* Inputs */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Inputs</p>
        {inputs.map((inp, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/30 text-sm">
            {/* Source info (read-only) */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-normal">
                {inp.moduleName}
              </Badge>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-xs">{inp.field}</span>
              <span className="text-muted-foreground text-xs">
                ({inp.fieldLabel}{inp.fieldUnit ? `, ${inp.fieldUnit}` : ''})
              </span>
            </div>

            {/* Editable: alias + default */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Alias in expression</Label>
                <Input
                  value={inp.alias}
                  onChange={(e) => updateInput(i, 'alias', e.target.value)}
                  placeholder="e.g. w"
                  className="h-8 text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Default (no data)</Label>
                <Input
                  type="number"
                  value={inp.defaultValue ?? ''}
                  onChange={(e) => updateInput(i, 'defaultValue', e.target.value)}
                  placeholder="0"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expression */}
      <div className="space-y-1.5">
        <Label htmlFor="formula-expr">
          Expression
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            arithmetic over the aliases above
          </span>
        </Label>
        <Input
          id="formula-expr"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder={`e.g. ${inputs.map((i) => i.alias).join(' / ')}`}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Available:{' '}
          {inputs.map((i) => (
            <code key={i.alias} className="mr-1 rounded bg-muted px-1">{i.alias}</code>
          ))}
          · operators: <code className="rounded bg-muted px-1">+ - * / % ^</code>
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Separator />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleConfirm}
          disabled={pending || !name.trim() || !expression.trim()}
          className="gap-1.5"
        >
          <CheckIcon className="size-3.5" />
          {pending ? 'Creating…' : 'Create tracker'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDiscarded(true)}
          disabled={pending}
          className="text-muted-foreground"
        >
          Discard
        </Button>
      </div>
    </div>
  )
}
