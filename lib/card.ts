// ----------------------------------------------------------------
// Trackers-grid card helpers.
//
// Two concerns live here:
//  - Binary detection: which trackers get a one-tap done/undone toggle on
//    their card instead of the entry-form modal (Commit 1).
//  - Card summary: the single at-a-glance value each card shows, computed in
//    app code by reusing the chart aggregation logic (Commit 2).
// ----------------------------------------------------------------

import type { Module, ModuleField } from './types'

/**
 * A "binary" tracker is a standard module whose log reduces to a single
 * boolean field. Its card shows a one-tap done/undone toggle; every other
 * tracker uses the reused-entry-form modal.
 */
export function getBinaryField(mod: Module): ModuleField | null {
  if (mod.kind !== 'standard') return null
  if (mod.fields.length !== 1) return null
  const [field] = mod.fields
  return field.type === 'boolean' ? field : null
}

export function isBinaryModule(mod: Module): boolean {
  return getBinaryField(mod) !== null
}
