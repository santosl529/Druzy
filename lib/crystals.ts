export const CRYSTAL_KEYS = [
  'amethyst',
  'rose_quartz',
  'citrine',
  'aquamarine',
  'malachite',
  'carnelian',
  'labradorite',
  'obsidian',
  'sapphire',
  'emerald',
  'ruby',
  'topaz',
  'turquoise',
  'moonstone',
  'onyx',
  'garnet',
  'opal',
  'sunstone',
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
  sapphire:     { key: 'sapphire',     name: 'Sapphire',     primary: '#2B6CB0', glow: '#63B3ED' },
  emerald:      { key: 'emerald',      name: 'Emerald',      primary: '#276749', glow: '#48BB78' },
  ruby:         { key: 'ruby',         name: 'Ruby',         primary: '#C53030', glow: '#FC8181' },
  topaz:        { key: 'topaz',        name: 'Topaz',        primary: '#B7791F', glow: '#F6AD55' },
  turquoise:    { key: 'turquoise',    name: 'Turquoise',    primary: '#2C7A7B', glow: '#4FD1C5' },
  moonstone:    { key: 'moonstone',    name: 'Moonstone',    primary: '#6B7FA8', glow: '#A3BFFA' },
  onyx:         { key: 'onyx',         name: 'Onyx',         primary: '#44337A', glow: '#9F7AEA' },
  garnet:       { key: 'garnet',       name: 'Garnet',       primary: '#822727', glow: '#C05621' },
  opal:         { key: 'opal',         name: 'Opal',         primary: '#B7396E', glow: '#F687B3' },
  sunstone:     { key: 'sunstone',     name: 'Sunstone',     primary: '#C05621', glow: '#F6AD55' },
}

const DEFAULT_KEY: CrystalKey = 'amethyst'

export function getCrystal(key: string): CrystalDef {
  return (CRYSTALS as Record<string, CrystalDef>)[key] ?? CRYSTALS[DEFAULT_KEY]
}
