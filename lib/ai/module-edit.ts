import { moduleSchema, formulaModuleSchema } from '../validations'
import type { Module, ModuleField, FormulaConfig } from '../types'
import type { ZodError } from 'zod'

/**
 * Pure merge + diff logic behind the assistant's `editModule` and
 * `editFormulaModule` tools. The tool proposes a patch; this combines it with
 * the tracker as it is now, validates the result with the same schemas the
 * manual editors use, and describes what changed for the confirmation card.
 * Nothing here touches the database — saving happens only after the user
 * confirms the card.
 */

// ----------------------------------------------------------------
// Standard trackers
// ----------------------------------------------------------------

export type EditableModule = Pick<Module, 'name' | 'fields' | 'crystal_type' | 'card_config' | 'dashboard_config'>

/** Omitted keys stay as they are; `null` configs reset to the auto default. */
export type ModuleEditPatch = Partial<EditableModule>

export interface FieldChange {
  key: string
  /** Label after the edit. */
  label: string
  /** Human-readable descriptions, e.g. 'type text → number'. */
  changes: string[]
  /** Past values may no longer display or chart correctly. */
  typeChanged: boolean
}

export interface ModuleEditDiff {
  name?: { from: string; to: string }
  crystal?: { from: string; to: string }
  fieldsAdded: ModuleField[]
  fieldsRemoved: ModuleField[]
  fieldsChanged: FieldChange[]
  cardConfigChanged: boolean
  dashboardConfigChanged: boolean
}

type EditResult<P, D> =
  | { success: true; proposal: P; diff: D }
  | { success: false; error: string }

function formatIssues(error: ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ')
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/** First field key that appears more than once, if any. */
export function findDuplicateKey(fields: ModuleField[]): string | null {
  const seen = new Set<string>()
  for (const f of fields) {
    if (seen.has(f.key)) return f.key
    seen.add(f.key)
  }
  return null
}

function describeFieldChanges(before: ModuleField, after: ModuleField): string[] {
  const changes: string[] = []
  if (before.label !== after.label) changes.push(`label "${before.label}" → "${after.label}"`)
  if (before.type !== after.type) changes.push(`type ${before.type} → ${after.type}`)
  if ((before.unit ?? '') !== (after.unit ?? '')) {
    changes.push(`unit "${before.unit ?? ''}" → "${after.unit ?? ''}"`)
  }
  if (!sameJson(before.options ?? [], after.options ?? [])) {
    changes.push(`options ${(before.options ?? []).join(', ')} → ${(after.options ?? []).join(', ')}`)
  }
  if (before.required !== after.required) changes.push(after.required ? 'now required' : 'no longer required')
  return changes
}

export function diffModule(before: EditableModule, after: EditableModule): ModuleEditDiff {
  const beforeByKey = new Map(before.fields.map((f) => [f.key, f]))
  const afterKeys = new Set(after.fields.map((f) => f.key))

  const fieldsChanged: FieldChange[] = []
  for (const f of after.fields) {
    const prev = beforeByKey.get(f.key)
    if (!prev) continue
    const changes = describeFieldChanges(prev, f)
    if (changes.length) {
      fieldsChanged.push({ key: f.key, label: f.label, changes, typeChanged: prev.type !== f.type })
    }
  }

  return {
    name: before.name !== after.name ? { from: before.name, to: after.name } : undefined,
    crystal:
      before.crystal_type !== after.crystal_type
        ? { from: before.crystal_type, to: after.crystal_type }
        : undefined,
    fieldsAdded: after.fields.filter((f) => !beforeByKey.has(f.key)),
    fieldsRemoved: before.fields.filter((f) => !afterKeys.has(f.key)),
    fieldsChanged,
    cardConfigChanged: !sameJson(before.card_config, after.card_config),
    dashboardConfigChanged: !sameJson(before.dashboard_config, after.dashboard_config),
  }
}

function isEmptyModuleDiff(d: ModuleEditDiff): boolean {
  return (
    !d.name && !d.crystal &&
    d.fieldsAdded.length === 0 && d.fieldsRemoved.length === 0 && d.fieldsChanged.length === 0 &&
    !d.cardConfigChanged && !d.dashboardConfigChanged
  )
}

/** Drop `undefined` so an explicitly-omitted key doesn't overwrite the current value. */
function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** Validate a full set of tracker values the way every save path should. */
export function validateModuleValues(values: EditableModule): EditResult<EditableModule, null> {
  const dup = findDuplicateKey(values.fields)
  if (dup) return { success: false, error: `Field key "${dup}" is used more than once. Keys must be unique.` }

  const parsed = moduleSchema.safeParse(values)
  if (!parsed.success) return { success: false, error: formatIssues(parsed.error) }

  return {
    success: true,
    proposal: {
      name: parsed.data.name,
      fields: parsed.data.fields,
      crystal_type: parsed.data.crystal_type,
      card_config: parsed.data.card_config ?? null,
      dashboard_config: (parsed.data.dashboard_config ?? null) as EditableModule['dashboard_config'],
    },
    diff: null,
  }
}

export function applyModuleEdit(
  current: EditableModule,
  patch: ModuleEditPatch,
): EditResult<EditableModule, ModuleEditDiff> {
  const merged: EditableModule = { ...current, ...definedOnly(patch) }

  const validated = validateModuleValues(merged)
  if (!validated.success) return validated

  const diff = diffModule(current, validated.proposal)
  if (isEmptyModuleDiff(diff)) {
    return { success: false, error: 'No changes: the proposed tracker is identical to the current one.' }
  }

  return { success: true, proposal: validated.proposal, diff }
}

// ----------------------------------------------------------------
// Formula trackers
// ----------------------------------------------------------------

export interface EditableFormula {
  name: string
  formula_config: FormulaConfig
}

export interface FormulaEditPatch {
  name?: string
  inputs?: FormulaConfig['inputs']
  expression?: string
}

export interface FormulaEditDiff {
  name?: { from: string; to: string }
  expression?: { from: string; to: string }
  /** Aliases of inputs that are new. */
  inputsAdded: string[]
  /** Aliases of inputs that were dropped. */
  inputsRemoved: string[]
  /** Aliases whose source tracker, field or default changed. */
  inputsChanged: string[]
}

export function applyFormulaEdit(
  current: EditableFormula,
  patch: FormulaEditPatch,
): EditResult<{ name: string; config: FormulaConfig }, FormulaEditDiff> {
  const merged = {
    name: patch.name ?? current.name,
    config: {
      inputs: patch.inputs ?? current.formula_config.inputs,
      expression: patch.expression ?? current.formula_config.expression,
    },
  }

  const parsed = formulaModuleSchema.safeParse(merged)
  if (!parsed.success) return { success: false, error: formatIssues(parsed.error) }

  const before = current.formula_config
  const after = parsed.data.config
  const beforeByAlias = new Map(before.inputs.map((i) => [i.alias, i]))
  const afterAliases = new Set(after.inputs.map((i) => i.alias))

  const diff: FormulaEditDiff = {
    name: current.name !== parsed.data.name ? { from: current.name, to: parsed.data.name } : undefined,
    expression: before.expression !== after.expression ? { from: before.expression, to: after.expression } : undefined,
    inputsAdded: after.inputs.filter((i) => !beforeByAlias.has(i.alias)).map((i) => i.alias),
    inputsRemoved: before.inputs.filter((i) => !afterAliases.has(i.alias)).map((i) => i.alias),
    inputsChanged: after.inputs
      .filter((i) => beforeByAlias.has(i.alias) && !sameJson(beforeByAlias.get(i.alias), i))
      .map((i) => i.alias),
  }

  if (
    !diff.name && !diff.expression &&
    diff.inputsAdded.length === 0 && diff.inputsRemoved.length === 0 && diff.inputsChanged.length === 0
  ) {
    return { success: false, error: 'No changes: the proposed formula is identical to the current one.' }
  }

  return { success: true, proposal: { name: parsed.data.name, config: after }, diff }
}
