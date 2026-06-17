import type { CSSProperties } from 'react'
import { getCrystal } from './crystals'

export function geodeVars(crystalType: string, openness: number): CSSProperties {
  const c = getCrystal(crystalType)
  const clamped = Math.min(Math.max(openness, 0), 1)
  return {
    '--openness': clamped,
    '--crystal-primary': c.primary,
    '--crystal-glow': c.glow,
  } as CSSProperties
}
