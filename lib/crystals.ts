export const CRYSTAL_KEYS = [
  'amethyst',
  'rose_quartz',
  'citrine',
  'aquamarine',
  'malachite',
  'carnelian',
  'labradorite',
  'obsidian',
] as const

export type CrystalKey = (typeof CRYSTAL_KEYS)[number]

export interface CrystalDef {
  key: CrystalKey
  name: string
  primary: string
  glow: string
}

export const CRYSTALS: Record<CrystalKey, CrystalDef> = {
  amethyst:     { key: 'amethyst',     name: 'Amethyst',     primary: '#9B6DCC', glow: '#C9A7F0' },
  rose_quartz:  { key: 'rose_quartz',  name: 'Rose Quartz',  primary: '#D4789C', glow: '#F0B8CF' },
  citrine:      { key: 'citrine',      name: 'Citrine',      primary: '#C49A2A', glow: '#F0CC6A' },
  aquamarine:   { key: 'aquamarine',   name: 'Aquamarine',   primary: '#3AADA8', glow: '#7FE0DC' },
  malachite:    { key: 'malachite',    name: 'Malachite',    primary: '#3A9B6F', glow: '#72D4A8' },
  carnelian:    { key: 'carnelian',    name: 'Carnelian',    primary: '#C45E3A', glow: '#F09070' },
  labradorite:  { key: 'labradorite',  name: 'Labradorite',  primary: '#4A7AB5', glow: '#8AB8E8' },
  obsidian:     { key: 'obsidian',     name: 'Obsidian',     primary: '#6A6580', glow: '#A8A2C0' },
}

const DEFAULT_KEY: CrystalKey = 'amethyst'

export function getCrystal(key: string): CrystalDef {
  return (CRYSTALS as Record<string, CrystalDef>)[key] ?? CRYSTALS[DEFAULT_KEY]
}
