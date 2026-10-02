// Fishing: an optional little game for finding new fish. Cast, wait for a
// bite, then tap Reel while the marker is in the green. Bigger catches give
// you a smaller target and a faster marker. A catch might be coins, a treat
// pack or, now and then, a real fish for your nursery (sometimes in a rare
// colour). A handful of casts a day keeps it a treat rather than a chore.
import type { FishDefinition, MorphId, Rarity } from './types'
import { FISH_CATALOG } from '../scene/fish/fishDefinitions'
import { FOOD_CATALOG } from '../scene/food/foodDefinitions'
import { levelFromXp } from './progression'
import { rollMorph } from './morphs'

export const CASTS_PER_DAY = 12
export const FISHING_LEVEL = 5

export interface FishingDay {
  /** Local date, YYYY-MM-DD. */
  day: string
  casts: number
}

export const NO_FISHING: FishingDay = { day: '', casts: 0 }

export function castsLeft(fishing: FishingDay, today: string): number {
  return fishing.day === today ? Math.max(0, CASTS_PER_DAY - fishing.casts) : CASTS_PER_DAY
}

export type Catch =
  | { kind: 'coins'; coins: number; icon: string; name: string }
  | { kind: 'treat'; treat: string; count: number }
  | { kind: 'fish'; defId: string; morph?: MorphId }

/** How hard the reel is: the green zone's width (0..1 of the bar) and the marker's speed (sweeps per second). */
export function reelDifficulty(c: Catch): { zone: number; speed: number } {
  if (c.kind !== 'fish') return { zone: 0.3, speed: 0.6 }
  const def = FISH_CATALOG.find((d) => d.id === c.defId)
  const tier: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }
  const t = tier[def?.rarity ?? 'common']
  return { zone: 0.26 - t * 0.035, speed: 0.7 + t * 0.15 }
}

const COIN_FINDS = [
  { icon: '🪙', name: 'a pouch of coins' },
  { icon: '🐚', name: 'a shiny shell' },
  { icon: '💎', name: 'a sparkly pebble' },
  { icon: '🥾', name: 'an old boot full of coins' },
]

const FISH_WEIGHT: Record<Rarity, number> = { common: 10, uncommon: 6, rare: 3, epic: 1.2, legendary: 0.4 }

/** Fish you could hook at this level: anything already unlocked in the shop, rarer ones less often. */
export function catchableFish(level: number): FishDefinition[] {
  return FISH_CATALOG.filter((d) => d.unlockLevel <= level && d.kind === 'fish')
}

/** What's on the line. */
export function rollCatch(xp: number, rand: () => number = Math.random): Catch {
  const level = levelFromXp(xp).level
  const roll = rand()
  if (roll < 0.22) {
    const pool = catchableFish(level)
    let pick = rand() * pool.reduce((n, d) => n + FISH_WEIGHT[d.rarity], 0)
    const def = pool.find((d) => (pick -= FISH_WEIGHT[d.rarity]) <= 0) ?? pool[0]
    const morph = rollMorph([])
    return { kind: 'fish', defId: def.id, ...(morph ? { morph } : {}) }
  }
  if (roll < 0.42) {
    const treats = FOOD_CATALOG.filter((f) => !f.unlimited && f.unlockLevel <= level)
    const treat = treats[Math.floor(rand() * treats.length)]
    if (treat) return { kind: 'treat', treat: treat.id, count: 1 + Math.floor(rand() * 2) }
  }
  const find = COIN_FINDS[Math.floor(rand() * COIN_FINDS.length)]
  return { kind: 'coins', coins: Math.round(15 + level * 4 + rand() * level * 3), ...find }
}

/** Where the marker is (0..1) after `t` seconds: a smooth back-and-forth sweep. */
export function markerAt(t: number, speed: number): number {
  return 0.5 - 0.5 * Math.cos(t * speed * Math.PI * 2)
}

/** The green zone's start for a cast (it moves about so each reel feels fresh). */
export function zoneStart(zone: number, rand: () => number = Math.random): number {
  return 0.1 + rand() * (0.8 - zone)
}
