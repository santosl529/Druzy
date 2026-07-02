// ----------------------------------------------------------------
// Shared types
// ----------------------------------------------------------------

export type MacroValues = {
  calories: string
  protein_g: string
  fat_g: string
  carbs_g: string
}

/** What the tracker log section exposes to the parent on save. */
export interface TrackerSelection {
  moduleId: string
  fieldValues: Record<string, string>
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

/**
 * Smart-match a module field to one of the four food macros.
 * Returns the matching macro value string, or '' if no match.
 */
export function autoMatchField(
  key: string,
  label: string,
  macros: MacroValues
): string {
  const needle = `${key} ${label}`.toLowerCase()
  if (/calor|kcal/.test(needle)) return macros.calories
  if (/protein|prot/.test(needle)) return macros.protein_g
  if (/\bfat\b|lipid/.test(needle)) return macros.fat_g
  if (/carb/.test(needle)) return macros.carbs_g
  return ''
}
