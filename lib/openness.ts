export interface OpennessInput {
  /** Distinct days with at least one entry in the last 30 days. */
  recentDays: number
  /** Lifetime total entry count. */
  totalEntries: number
  /** Days since the module was created. */
  daysSinceCreated: number
  /** Formula modules are always fully open. */
  isFormula: boolean
}

export function computeOpenness(input: OpennessInput): number {
  if (input.isFormula) return 1

  const recentScore = input.recentDays / 30
  const lifetimeScore = Math.min(input.totalEntries / Math.max(input.daysSinceCreated, 1), 1)
  const openness = recentScore * (1 + lifetimeScore * 0.5)
  return Math.min(Math.max(openness, 0), 1)
}
