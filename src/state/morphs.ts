import type { FishDefinition, MorphId } from './types'
import type { Luck } from './charms'

/**
 * Rare colour morphs. Any species can hatch as one, keeping its own body,
 * fins and pattern but wearing the morph's palette. Each one is a separate
 * Fishpedia entry to collect.
 */
export interface MorphDefinition {
  id: MorphId
  name: string
  icon: string
  /** Chance per egg, before the boost from a morph parent. */
  chance: number
  color: string
  color2: string
  color3: string
  glow?: boolean
  description: string
}

export const MORPHS: MorphDefinition[] = [
  { id: 'golden', name: 'Golden', icon: '🌟', chance: 0.04, color: '#ffc93a', color2: '#fff0a8', color3: '#ff9d1e', description: 'Shines like sunken treasure.' },
  { id: 'pearl', name: 'Pearl', icon: '🤍', chance: 0.04, color: '#f6f1ea', color2: '#ffc9d6', color3: '#ff8fae', description: 'Pale as a pearl, with rosy fins.' },
  { id: 'midnight', name: 'Midnight', icon: '🌙', chance: 0.03, color: '#1c2140', color2: '#5b6cff', color3: '#b6c4ff', description: 'Dark as the deep sea, edged in blue.' },
  { id: 'aurora', name: 'Aurora', icon: '🌈', chance: 0.015, color: '#4cf2d6', color2: '#c06bff', color3: '#ff7ad9', glow: true, description: 'Glows with northern-lights colours.' },
]

const BASE_CHANCE = MORPHS.reduce((sum, m) => sum + m.chance, 0)
/** The two hardest colours to find. */
const RAREST = new Set<MorphId>(['midnight', 'aurora'])
/** A morph parent makes rare eggs this much more likely. */
const PARENT_BOOST = 2.5
/** When a morph parent's egg comes out rare, how often it is the parent's own morph. */
const FOLLOW_PARENT = 0.6

export function getMorph(id: string | undefined): MorphDefinition | undefined {
  return id ? MORPHS.find((m) => m.id === id) : undefined
}

/** Roll whether an egg hatches as a rare morph. */
export function rollMorph(parentMorphs: Array<MorphId | undefined>, random: () => number = Math.random, luck: Luck = {}): MorphId | undefined {
  const inherited = parentMorphs.filter((m): m is MorphId => Boolean(getMorph(m)))
  const chance = BASE_CHANCE * (inherited.length > 0 ? PARENT_BOOST : 1) * (luck.morphChance ?? 1)
  if (random() >= chance) return undefined
  if (inherited.length > 0 && random() < FOLLOW_PARENT) return inherited[Math.floor(random() * inherited.length)]
  // A moon pearl tilts the pick toward the rarest colours.
  const weight = (m: MorphDefinition) => m.chance * (RAREST.has(m.id) ? luck.rareTilt ?? 1 : 1)
  let pick = random() * MORPHS.reduce((sum, m) => sum + weight(m), 0)
  for (const m of MORPHS) {
    pick -= weight(m)
    if (pick < 0) return m.id
  }
  return MORPHS[0].id
}

/** A species dressed in a morph's palette. */
export function morphedDefinition(def: FishDefinition, morph: MorphId | undefined): FishDefinition {
  const m = getMorph(morph)
  if (!m) return def
  return { ...def, color: m.color, color2: m.color2, color3: m.color3, glow: def.glow || m.glow }
}

/** "Golden Goldfish", or just the species name. */
export function speciesLabel(def: FishDefinition, morph: MorphId | undefined): string {
  const m = getMorph(morph)
  return m ? `${m.name} ${def.name}` : def.name
}
