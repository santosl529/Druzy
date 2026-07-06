import type { FormulaConfig, Module } from '@/lib/types'

interface Props {
  config: FormulaConfig
  /** Must contain the input modules (for names/labels). */
  modules: Module[]
}

/** Read-only summary of a formula module's definition. */
export function FormulaSummary({ config, modules }: Props) {
  const byId = new Map(modules.map((m) => [m.id, m]))

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1">Expression</p>
        <code className="text-sm font-mono bg-muted px-2 py-1 rounded inline-block">
          {config.expression}
        </code>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">Inputs</p>
        <ul className="space-y-1">
          {config.inputs.map((input) => {
            const mod = byId.get(input.moduleId)
            const field = mod?.fields.find((f) => f.key === input.field)
            return (
              <li key={input.alias} className="text-sm flex items-center gap-2">
                <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{input.alias}</code>
                <span className="text-muted-foreground">=</span>
                <span>
                  {mod?.name ?? 'Unknown tracker'}
                  <span className="text-muted-foreground"> · {field?.label ?? input.field}</span>
                  {field?.unit && (
                    <span className="text-muted-foreground"> ({field.unit})</span>
                  )}
                  {input.defaultValue !== undefined && (
                    <span className="text-muted-foreground"> · default {input.defaultValue}{field?.unit ? ` ${field.unit}` : ''}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">
        Computed per day from current source data. Defaults fill in for inputs with no logged value
        on days where at least one input has real data; days with no data at all are omitted, and
        multiple entries on the same day are averaged.
      </p>
    </div>
  )
}
