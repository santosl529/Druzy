'use client'

import { useMemo, useState, useTransition } from 'react'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createFormulaModule, updateFormulaModule } from '@/app/actions/formula'
import { CrystalPicker } from '@/components/crystal-picker'
import { validateExpression, computeFormulaSeries } from '@/lib/formula'
import type { Entry, FormulaConfig, Module, ModuleField } from '@/lib/types'
import type { CrystalKey } from '@/lib/crystals'

interface Props {
  /** Standard modules available as formula inputs. */
  modules: Module[]
  /** Entries for those modules — used for the live preview. */
  entries: Entry[]
  /** When set, the builder edits an existing formula module. */
  initial?: { id: string; name: string; config: FormulaConfig; crystal_type?: CrystalKey }
}

interface InputRow {
  moduleId: string
  field: string
  alias: string
  /** Empty string = no default. */
  defaultValue: string
}

const PREVIEW_DAYS = 14

function defaultAlias(fieldKey: string): string {
  return /^\d/.test(fieldKey) ? `_${fieldKey}` : fieldKey
}

function parseDefaultValue(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

function toInputRows(inputs: FormulaConfig['inputs']): InputRow[] {
  return inputs.map((i) => ({
    moduleId: i.moduleId,
    field: i.field,
    alias: i.alias,
    defaultValue: i.defaultValue !== undefined ? String(i.defaultValue) : '',
  }))
}

function buildFormulaInputs(rows: InputRow[]) {
  return rows
    .filter((r) => r.moduleId && r.field && r.alias)
    .map((r) => {
      const input = {
        moduleId: r.moduleId,
        field: r.field,
        alias: r.alias,
      } as FormulaConfig['inputs'][number]
      const dv = parseDefaultValue(r.defaultValue)
      if (dv !== undefined) input.defaultValue = dv
      return input
    })
}

export function FormulaBuilder({ modules, entries, initial }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(initial?.name ?? '')
  const [crystalType, setCrystalType] = useState<CrystalKey>(initial?.crystal_type ?? 'amethyst')
  const [inputs, setInputs] = useState<InputRow[]>(
    initial?.config.inputs
      ? toInputRows(initial.config.inputs)
      : [{ moduleId: '', field: '', alias: '', defaultValue: '' }]
  )
  const [expression, setExpression] = useState(initial?.config.expression ?? '')

  const moduleItems = modules.map((m) => ({ value: m.id, label: m.name }))

  function numericFieldsFor(moduleId: string): ModuleField[] {
    const mod = modules.find((m) => m.id === moduleId)
    return (mod?.fields ?? []).filter((f) => f.type === 'number' || f.type === 'rating')
  }

  function updateInput(i: number, patch: Partial<InputRow>) {
    setInputs((rows) => {
      const next = [...rows]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  function addInput() {
    setInputs((rows) => [...rows, { moduleId: '', field: '', alias: '', defaultValue: '' }])
  }

  function removeInput(i: number) {
    setInputs((rows) => rows.filter((_, idx) => idx !== i))
  }

  const completeInputs = buildFormulaInputs(inputs)
  const aliases = completeInputs.map((r) => r.alias)
  const duplicateAliases = new Set(aliases).size !== aliases.length

  const expressionError = expression.trim()
    ? validateExpression(expression, aliases)
    : null

  // Live preview: recent computed values from real source data.
  const preview = useMemo(() => {
    if (!expression.trim() || expressionError || duplicateAliases || completeInputs.length === 0) {
      return []
    }
    const byModule = new Map<string, Entry[]>()
    for (const e of entries) {
      const list = byModule.get(e.module_id) ?? []
      list.push(e)
      byModule.set(e.module_id, list)
    }
    const points = computeFormulaSeries(
      { inputs: completeInputs, expression },
      byModule
    )
    return points.slice(-PREVIEW_DAYS).reverse()
    // completeInputs/expressionError/duplicateAliases derive from inputs + expression
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, expression, entries])

  const canSubmit =
    name.trim().length > 0 &&
    completeInputs.length > 0 &&
    completeInputs.length === inputs.length &&
    !duplicateAliases &&
    expression.trim().length > 0 &&
    !expressionError &&
    inputs.every((r) => !r.defaultValue.trim() || parseDefaultValue(r.defaultValue) !== undefined)

  function handleSubmit() {
    setError(null)
    const formData = new FormData()
    formData.set('name', name.trim())
    formData.set('config', JSON.stringify({ inputs: completeInputs, expression: expression.trim() }))
    formData.set('crystal_type', crystalType)

    startTransition(async () => {
      const result = initial
        ? await updateFormulaModule(initial.id, formData)
        : await createFormulaModule(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Day progress"
          className="max-w-sm"
        />
      </div>

      {/* Crystal */}
      <div className="space-y-2">
        <Label>Crystal</Label>
        <CrystalPicker value={crystalType} onChange={setCrystalType} />
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Inputs</Label>
          <Button type="button" variant="outline" size="sm" onClick={addInput}>
            <PlusIcon className="size-4 mr-1" /> Add input
          </Button>
        </div>
        {modules.length === 0 && (
          <p className="text-sm text-muted-foreground">
            You need at least one standard tracker with a numeric field first.
          </p>
        )}
        {inputs.map((row, i) => {
          const fields = numericFieldsFor(row.moduleId)
          const fieldItems = fields.map((f) => ({ value: f.key, label: f.label }))
          return (
            <div key={i} className="rounded-lg border p-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tracker</Label>
                <Select
                  items={moduleItems}
                  value={row.moduleId}
                  onValueChange={(v) => v && updateInput(i, { moduleId: v, field: '', alias: '', defaultValue: '' })}
                >
                  <SelectTrigger className="min-w-40"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Field</Label>
                <Select
                  items={fieldItems}
                  value={row.field}
                  onValueChange={(v) => {
                    if (!v) return
                    updateInput(i, { field: v, alias: row.alias || defaultAlias(v) })
                  }}
                >
                  <SelectTrigger className="min-w-32"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Alias</Label>
                <Input
                  value={row.alias}
                  onChange={(e) => updateInput(i, { alias: e.target.value })}
                  placeholder="e.g. sleep"
                  className="w-32 font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Default <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={row.defaultValue}
                  onChange={(e) => updateInput(i, { defaultValue: e.target.value })}
                  placeholder="—"
                  className="w-24 font-mono text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={() => removeInput(i)}
                disabled={inputs.length === 1}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          )
        })}
        {duplicateAliases && (
          <p className="text-sm text-destructive">Aliases must be unique.</p>
        )}
        {inputs.some((r) => r.defaultValue.trim() && parseDefaultValue(r.defaultValue) === undefined) && (
          <p className="text-sm text-destructive">Default values must be valid numbers.</p>
        )}
      </div>

      {/* Expression */}
      <div className="space-y-1.5">
        <Label>Expression</Label>
        <Input
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          placeholder="e.g. sleep*0.4 + practiced*0.3 + protein_hit*0.3"
          className="font-mono text-sm"
        />
        {expressionError ? (
          <p className="text-sm text-destructive">{expressionError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Arithmetic over the aliases above: + − * / % ^ and parentheses.
          </p>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-1.5">
        <Label>Preview</Label>
        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canSubmit || (expression.trim() && !expressionError)
              ? 'No computed days yet — log data in at least one input, or set defaults for all inputs.'
              : 'Pick inputs and write a valid expression to preview recent values.'}
          </p>
        ) : (
          <div className="rounded-lg border overflow-hidden max-w-sm">
            <table className="w-full text-sm">
              <tbody>
                {preview.map((p) => (
                  <tr key={p.date} className="border-b last:border-b-0">
                    <td className="px-3 py-1.5 text-muted-foreground">{p.date}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{p.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={handleSubmit} disabled={!canSubmit || pending}>
        {pending ? 'Saving…' : initial ? 'Save formula' : 'Create formula tracker'}
      </Button>
    </div>
  )
}
