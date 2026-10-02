// The Open Ocean: a fully grown fish can be released instead of sold. It
// swims on in your ocean forever (the Fishpedia's Ocean page), earns the same
// coins as a sale plus XP, and raises the tide. Every tide pays out, with no
// end, so it's a long-term goal past the level cap, and a happy home for
// extra babies from the nursery.
import type { FishInstance, GameState, MorphId, PatternType, Rarity } from './types'
import { FOOD_CATALOG } from '../scene/food/foodDefinitions'

export interface OceanFish {
  id: string
  defId: string
  name: string
  morph?: MorphId
  pattern?: PatternType
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
    tide,
    nextAt: tideThreshold(tide + 1),
    fromAt: tideThreshold(tide),
  }
}
