import { describe, it, expect } from 'vitest'
import { geodeVars } from '../geode-style'

describe('geodeVars', () => {
  it('resolves crystal colors and clamps openness', () => {
    const v = geodeVars('citrine', 1.4) as Record<string, string | number>
    expect(v['--crystal-primary']).toBe('#C49A2A')
    expect(v['--crystal-glow']).toBe('#F0CC6A')
    expect(v['--openness']).toBe(1)
  })

  it('floors openness at 0 and falls back for unknown crystals', () => {
    const v = geodeVars('nope', -0.5) as Record<string, string | number>
    expect(v['--openness']).toBe(0)
    expect(v['--crystal-primary']).toBe('#9B6DCC') // amethyst fallback
  })
})
