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

  // Full bloom (openness = 1.0) at 80% of the 30-day window (24/30 days).
  // Lifetime bonus gives up to a 25% reduction in the required recent %.
  const recentScore = input.recentDays / 30
  const lifetimeScore = Math.min(input.totalEntries / Math.max(input.daysSinceCreated, 1), 1)
  const raw = (recentScore / 0.8) * (1 + lifetimeScore * 0.25)
  return Math.min(Math.max(raw, 0), 1)
}
