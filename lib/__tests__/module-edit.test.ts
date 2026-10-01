import { describe, it, expect } from 'vitest'
import { applyModuleEdit, applyFormulaEdit, type EditableModule, type EditableFormula } from '../ai/module-edit'

const nutrition: EditableModule = {
  name: 'Nutrition',
  crystal_type: 'citrine',
  fields: [
    { key: 'calories', label: 'Calories', type: 'number', required: true, unit: 'kcal' },
    { key: 'meal', label: 'Meal', type: 'select', required: false, options: ['Breakfast', 'Lunch', 'Dinner'] },
    { key: 'notes', label: 'Notes', type: 'text', required: false },
  ],
  card_config: { items: [{ field: 'calories', mode: 'sum', timeWindow: 'today' }] },
  dashboard_config: { mode: 'category', categoryField: 'meal' },
}

function ok<T extends { success: boolean }>(r: T) {
  if (!r.success) throw new Error(`expected success, got ${JSON.stringify(r)}`)
  return r as Extract<T, { success: true }>
}

describe('applyModuleEdit', () => {
  it('adds a field and leaves everything not in the patch untouched', () => {
    const r = ok(applyModuleEdit(nutrition, {
      fields: [...nutrition.fields, { key: 'description', label: 'Description', type: 'text', required: false }],
    }))
    expect(r.proposal.fields.map((f) => f.key)).toEqual(['calories', 'meal', 'notes', 'description'])
    expect(r.proposal.name).toBe('Nutrition')
    expect(r.proposal.crystal_type).toBe('citrine')
    expect(r.proposal.card_config).toEqual(nutrition.card_config)
    expect(r.proposal.dashboard_config).toEqual(nutrition.dashboard_config)
    expect(r.diff.fieldsAdded.map((f) => f.key)).toEqual(['description'])
    expect(r.diff.fieldsRemoved).toEqual([])
    expect(r.diff.fieldsChanged).toEqual([])
  })

  it('reports a relabel as a change on the same key, not a remove + add', () => {
    const fields = nutrition.fields.map((f) => (f.key === 'notes' ? { ...f, label: 'Food details' } : f))
    const r = ok(applyModuleEdit(nutrition, { fields }))
    expect(r.diff.fieldsAdded).toEqual([])
    expect(r.diff.fieldsRemoved).toEqual([])
    expect(r.diff.fieldsChanged).toEqual([
      { key: 'notes', label: 'Food details', changes: ['label "Notes" → "Food details"'], typeChanged: false },
    ])
  })

  it('allows a type change and flags it', () => {
    const fields = nutrition.fields.map((f) => (f.key === 'notes' ? { ...f, type: 'number' as const } : f))
    const r = ok(applyModuleEdit(nutrition, { fields }))
    expect(r.diff.fieldsChanged).toEqual([
      { key: 'notes', label: 'Notes', changes: ['type text → number'], typeChanged: true },
    ])
  })

  it('reports unit, options and required changes', () => {
    const fields = nutrition.fields.map((f) => {
      if (f.key === 'calories') return { ...f, unit: 'cal', required: false }
      if (f.key === 'meal') return { ...f, options: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] }
      return f
    })
    const r = ok(applyModuleEdit(nutrition, { fields }))
    expect(r.diff.fieldsChanged).toEqual([
      { key: 'calories', label: 'Calories', changes: ['unit "kcal" → "cal"', 'no longer required'], typeChanged: false },
      { key: 'meal', label: 'Meal', changes: ['options Breakfast, Lunch, Dinner → Breakfast, Lunch, Dinner, Snack'], typeChanged: false },
    ])
  })

  it('reports removed fields', () => {
    const r = ok(applyModuleEdit(nutrition, { fields: nutrition.fields.filter((f) => f.key !== 'notes') }))
    expect(r.diff.fieldsRemoved.map((f) => f.key)).toEqual(['notes'])
  })

  it('rejects removing a field the card summary still uses', () => {
    const r = applyModuleEdit(nutrition, { fields: nutrition.fields.filter((f) => f.key !== 'calories') })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/card summary/i)
  })

  it('accepts the removal when the same patch also updates the card summary', () => {
    const r = ok(applyModuleEdit(nutrition, {
      fields: nutrition.fields.filter((f) => f.key !== 'calories'),
      card_config: null,
    }))
    expect(r.proposal.card_config).toBeNull()
    expect(r.diff.cardConfigChanged).toBe(true)
  })

  it('changes name, crystal and dashboard config', () => {
    const r = ok(applyModuleEdit(nutrition, {
      name: 'Food',
      crystal_type: 'emerald',
      dashboard_config: { mode: 'binary' },
    }))
    expect(r.diff.name).toEqual({ from: 'Nutrition', to: 'Food' })
    expect(r.diff.crystal).toEqual({ from: 'citrine', to: 'emerald' })
    expect(r.diff.dashboardConfigChanged).toBe(true)
    expect(r.diff.cardConfigChanged).toBe(false)
  })

  it('rejects a patch that changes nothing', () => {
    const r = applyModuleEdit(nutrition, { name: 'Nutrition', fields: nutrition.fields })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/no changes/i)
  })

  it('rejects duplicate field keys', () => {
    const r = applyModuleEdit(nutrition, {
      fields: [...nutrition.fields, { key: 'notes', label: 'More notes', type: 'text', required: false }],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/notes/)
  })

  it('surfaces schema errors in a form the model can act on', () => {
    const r = applyModuleEdit(nutrition, {
      fields: [...nutrition.fields, { key: 'mood', label: 'Mood', type: 'select', required: false }],
    })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/option/)
  })
})

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const ratio: EditableFormula = {
  name: 'Cal per lb',
  formula_config: {
    inputs: [
      { moduleId: A, field: 'calories', alias: 'cals' },
      { moduleId: B, field: 'weight', alias: 'w' },
    ],
    expression: 'cals / w',
  },
}

describe('applyFormulaEdit', () => {
  it('changes the expression and keeps the inputs', () => {
    const r = ok(applyFormulaEdit(ratio, { expression: 'cals / w * 100' }))
    expect(r.proposal.config.inputs).toEqual(ratio.formula_config.inputs)
    expect(r.proposal.config.expression).toBe('cals / w * 100')
    expect(r.diff.expression).toEqual({ from: 'cals / w', to: 'cals / w * 100' })
  })

  it('reports added and removed inputs by alias', () => {
    const r = ok(applyFormulaEdit(ratio, {
      inputs: [ratio.formula_config.inputs[0], { moduleId: B, field: 'height', alias: 'h' }],
      expression: 'cals / h',
    }))
    expect(r.diff.inputsAdded).toEqual(['h'])
    expect(r.diff.inputsRemoved).toEqual(['w'])
  })

  it('rejects an expression that references a removed alias', () => {
    const r = applyFormulaEdit(ratio, { inputs: [ratio.formula_config.inputs[0]] })
    expect(r.success).toBe(false)
  })

  it('rejects a patch that changes nothing', () => {
    const r = applyFormulaEdit(ratio, { name: 'Cal per lb' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toMatch(/no changes/i)
  })
})
