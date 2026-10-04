// The Open Ocean: a fully grown fish can be released instead of sold. It
// swims on in your ocean forever (the Fishpedia's Ocean page), earns the same
// coins as a sale plus XP, and raises the tide. Every tide pays out, with no
// end, so it's a long-term goal past the level cap, and a happy home for
// extra babies from the nursery.
import type { FishInstance, GameState, MorphId, PatternType, Rarity } from './types'
import { FOOD_CATALOG } from '../scene/food/foodDefinitions'
import { getFishDef } from '../scene/fish/fishDefinitions'

export interface OceanFish {
  id: string
  defId: string
  name: string
  morph?: MorphId
  pattern?: PatternType
  /** Its own colours, when they weren't its species' usual ones (from a colour parent). */
  color?: string
  color2?: string
  color3?: string
  /** When it was released (ms). */
  at: number
}

/** Ocean entries kept for the view (the release count lives in stats). */
export const MAX_OCEAN_FISH = 400

export const RELEASE_XP: Record<Rarity, number> = { common: 10, uncommon: 18, rare: 30, epic: 50, legendary: 80 }

/** Fish released to reach each tide: 3, 8, 15, 25, 40, 60, 85, 115, 150, then 45 more each. */
const TIDES = [3, 8, 15, 25, 40, 60, 85, 115, 150]

export function tideThreshold(tide: number): number {
  if (tide <= 0) return 0
  if (tide <= TIDES.length) return TIDES[tide - 1]
  return TIDES[TIDES.length - 1] + (tide - TIDES.length) * 45
}

export function tideFor(released: number): number {
  let tide = 0
  while (released >= tideThreshold(tide + 1)) tide++
  return tide
}

const TREATS = FOOD_CATALOG.filter((f) => !f.unlimited).map((f) => f.id)

/** What reaching a tide pays: coins that grow with each tide, and a couple of treats. */
export function tideReward(tide: number) {
  return { coins: 150 + tide * 150, treat: TREATS[(tide - 1) % TREATS.length], treatCount: 2 + Math.floor(tide / 3) }
}

/** Only grown-up fish are ready for the big wide ocean. */
export function canRelease(s: Pick<GameState, 'fishVitals'>, fish: FishInstance): boolean {
  return (s.fishVitals[fish.id]?.growth ?? 0) >= 1
}

export function oceanTotals(s: Pick<GameState, 'ocean' | 'stats'>) {
  const released = s.stats.released
  const tide = tideFor(released)
  return {
    released,
    species: new Set(s.ocean.map((f) => f.defId)).size,
    rareColours: s.ocean.filter((f) => f.morph).length,
    tide,
    nextAt: tideThreshold(tide + 1),
    fromAt: tideThreshold(tide),
  }
}

/** What a released fish remembers about its looks: rare colours, pattern, and its own palette. */
export function oceanLooks(fish: Pick<FishInstance, 'defId' | 'inheritance'>): Pick<OceanFish, 'morph' | 'pattern' | 'color' | 'color2' | 'color3'> {
  const family = fish.inheritance
  if (!family) return {}
  const def = getFishDef(fish.defId)
  const ownColours = def && (family.color !== def.color || family.color2 !== def.color2 || (family.color3 ?? def.color3) !== def.color3)
  return {
    ...(family.morph ? { morph: family.morph } : {}),
    ...(family.pattern ? { pattern: family.pattern } : {}),
    ...(ownColours ? { color: family.color, color2: family.color2, ...(family.color3 ? { color3: family.color3 } : {}) } : {}),
  }
}

/** A pattern its species doesn't usually wear. */
export function hasSpecialPattern(f: OceanFish): boolean {
  return Boolean(f.pattern && f.pattern !== getFishDef(f.defId)?.pattern)
}

export type OceanSort = 'newest' | 'oldest' | 'species' | 'rarest' | 'name'
export type OceanFilter = 'all' | 'rare-colours' | 'patterns' | 'rare'

export const OCEAN_SORTS: Array<{ id: OceanSort; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'species', label: 'By species' },
  { id: 'rarest', label: 'Rarest first' },
  { id: 'name', label: 'By name (A–Z)' },
]

const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }

function rank(f: OceanFish): number {
  return RARITY_RANK[getFishDef(f.defId)?.rarity ?? 'common']
}

export function matchesOceanFilter(f: OceanFish, filter: OceanFilter): boolean {
  if (filter === 'rare-colours') return Boolean(f.morph)
  if (filter === 'patterns') return hasSpecialPattern(f)
  if (filter === 'rare') return rank(f) >= RARITY_RANK.rare
  return true
}

/** The ocean's fish, filtered, searched by name, and sorted. */
export function oceanRoster(ocean: OceanFish[], sort: OceanSort, filter: OceanFilter = 'all', query = ''): OceanFish[] {
  const q = query.trim().toLowerCase()
  const list = ocean.filter((f) => matchesOceanFilter(f, filter) && (!q || f.name.toLowerCase().includes(q) || getFishDef(f.defId)?.name.toLowerCase().includes(q)))
  const byName = (a: OceanFish, b: OceanFish) => a.name.localeCompare(b.name)
  const newest = (a: OceanFish, b: OceanFish) => b.at - a.at
  switch (sort) {
    case 'oldest':
      return list.sort((a, b) => a.at - b.at)
    case 'species':
      return list.sort((a, b) => (getFishDef(a.defId)?.name ?? '').localeCompare(getFishDef(b.defId)?.name ?? '') || newest(a, b))
    case 'rarest':
      return list.sort((a, b) => rank(b) - rank(a) || Number(Boolean(b.morph)) - Number(Boolean(a.morph)) || newest(a, b))
    case 'name':
      return list.sort((a, b) => byName(a, b) || newest(a, b))
    default:
      return list.sort(newest)
  }
}
