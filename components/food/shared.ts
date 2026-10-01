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

/** Which food macro a module field corresponds to, by its key and label (null = none). */
export function macroForField(key: string, label: string): keyof MacroValues | null {
  const needle = `${key} ${label}`.toLowerCase()
  if (/calor|kcal/.test(needle)) return 'calories'
  if (/protein|prot/.test(needle)) return 'protein_g'
  if (/\bfat\b|lipid/.test(needle)) return 'fat_g'
  if (/carb/.test(needle)) return 'carbs_g'
  return null
}

/**
 * Smart-match a module field to one of the four food macros.
 * Returns the matching macro value string, or '' if no match.
 */
export function autoMatchField(
  key: string,
  label: string,
  macros: MacroValues
): string {
  const macro = macroForField(key, label)
  return macro ? macros[macro] : ''
}
