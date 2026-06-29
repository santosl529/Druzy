import { describe, it, expect } from 'vitest'
import { CRYSTAL_KEYS, CRYSTALS, getCrystal } from '../crystals'

describe('crystals', () => {
  it('has exactly the 18 expected keys', () => {
    expect([...CRYSTAL_KEYS].sort()).toEqual(
      ['amethyst', 'aquamarine', 'carnelian', 'citrine', 'emerald', 'garnet', 'labradorite', 'malachite', 'moonstone', 'obsidian', 'opal', 'onyx', 'rose_quartz', 'ruby', 'sapphire', 'sunstone', 'topaz', 'turquoise'].sort()
    )
  })

  it('every crystal has a name, primary and glow color', () => {
    for (const key of CRYSTAL_KEYS) {
      const def = CRYSTALS[key]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.glow).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('getCrystal falls back to amethyst for unknown keys', () => {
    expect(getCrystal('not_a_crystal').key).toBe('amethyst')
    expect(getCrystal('citrine').key).toBe('citrine')
  })
})
