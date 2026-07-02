// ----------------------------------------------------------------
// Geode stages — discrete milestones over the continuous openness value.
//
// A tracker's geode "opens" as openness (0–1) grows with logging consistency
// (see lib/openness.ts). These five stages name the visual milestones of that
// progression and drive the "N days to <next stage>" hint on the dashboard.
//
// Pure + dependency-light so it runs server-side (page projection) and is unit
// testable. The day-until-next projection assumes the user logs every day going
// forward — an optimistic, motivating estimate.
// ----------------------------------------------------------------

import { computeOpenness } from './openness'
import { isoDate } from './date'

export interface Stage {
  name: string
  /** Inclusive lower bound of openness for this stage. */
  min: number
}

/** Five stages by openness threshold, ascending. */
export const STAGES: Stage[] = [
  { name: 'Dormant', min: 0 },
  { name: 'Stirring', min: 0.2 },
  { name: 'Cracking', min: 0.4 },
  { name: 'Breaking', min: 0.6 },
  { name: 'Bloomed', min: 0.8 },
]

/** Index of the stage an openness value currently sits in (0–4). */
export function getStageIndex(openness: number): number {
  let idx = 0
  for (let i = 0; i < STAGES.length; i++) {
    if (openness >= STAGES[i].min) idx = i
  }
  return idx
}

export interface NextStageInput {
  /**
   * Distinct YYYY-MM-DD dates with at least one entry. Only dates within the
   * trailing 30-day window (relative to each projected day) affect the result,
   * so passing the last ~30 days of logged dates is sufficient.
   */
  loggedDates: string[]
  /** Lifetime entry count for this module. */
  totalEntries: number
  /** Days since the module was created. */
  daysSinceCreated: number
  /** Formula modules are always fully bloomed (no next stage). */
  isFormula: boolean
  /** Today as YYYY-MM-DD (day-boundary timezone already resolved). */
  today: string
}

export interface NextStage {
  /** Name of the next stage to reach. */
  name: string
  /**
   * Consecutive daily logs from today until the next stage is reached.
   * null = not reachable within the projection cap.
   */
  days: number | null
}

/** Past this many days of projection we stop and report "not soon". */
const MAX_PROJECTION_DAYS = 60

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoDate(d)
}

function recentDaysWithin(logged: Set<string>, windowStart: string, windowEnd: string): number {
  let count = 0
  for (const d of logged) if (d >= windowStart && d <= windowEnd) count++
  return count
}

/**
 * How many consecutive daily logs from today until the geode reaches its next
 * stage, assuming the user logs every day. Returns null when already at the
 * final stage (no next stage); the inner `days` is null when the next stage
 * isn't reachable within MAX_PROJECTION_DAYS.
 */
export function daysUntilNextStage(input: NextStageInput): NextStage | null {
  // Formula geodes are always fully bloomed — there's no next stage.
  if (input.isFormula) return null

  // Current openness → current stage → next threshold.
  const windowStartNow = addDays(input.today, -29)
  const loggedNow = new Set(input.loggedDates)
  const recentNow = recentDaysWithin(loggedNow, windowStartNow, input.today)
  const currentOpenness = computeOpenness({
    recentDays: recentNow,
    totalEntries: input.totalEntries,
    daysSinceCreated: input.daysSinceCreated,
    isFormula: false,
  })
  const stageIdx = getStageIndex(currentOpenness)
  if (stageIdx >= STAGES.length - 1) return null // already at the final stage
  const next = STAGES[stageIdx + 1]

  // Simulate logging on today, today+1, … until openness crosses next.min.
  const logged = new Set(input.loggedDates)
  let total = input.totalEntries
  for (let n = 1; n <= MAX_PROJECTION_DAYS; n++) {
    const simDay = addDays(input.today, n - 1)
    if (!logged.has(simDay)) {
      logged.add(simDay)
      total += 1
    }
    const recent = recentDaysWithin(logged, addDays(simDay, -29), simDay)
    const openness = computeOpenness({
      recentDays: recent,
      totalEntries: total,
      daysSinceCreated: input.daysSinceCreated + (n - 1),
      isFormula: false,
    })
    if (openness >= next.min) return { name: next.name, days: n }
  }
  return { name: next.name, days: null }
}
