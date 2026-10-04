// Fishing: an optional little game for finding new fish. Cast, wait for the
// big splash, hook it, then reel it in by tapping while the marker is in the
// green. Bigger catches fight longer (more taps), with a smaller target and a
// quicker marker, but the line holds for a few misses. A catch might be
// coins, a treat pack or, now and then, a real fish for your nursery
// (sometimes in a rare colour). A handful of casts a day keeps it a treat
// rather than a chore.
import type { FishDefinition, MorphId, Rarity } from './types'
import { FISH_CATALOG, getFishDef } from '../scene/fish/fishDefinitions'
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

const RARITY_TIER: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 }

/** How hard the reel is: the green zone's width (0..1 of the bar) and the marker's speed (trips across and back per second). */
export function reelDifficulty(c: Catch): { zone: number; speed: number } {
  if (c.kind !== 'fish') return { zone: 0.32, speed: 0.45 }
  const t = RARITY_TIER[getFishDef(c.defId)?.rarity ?? 'common']
  return { zone: 0.3 - t * 0.03, speed: 0.5 + t * 0.1 }
}

/** Taps in the green needed to land it: treasure comes up in one, rarer fish fight longer. */
export function reelHits(c: Catch): number {
  if (c.kind !== 'fish') return 1
  return RARITY_TIER[getFishDef(c.defId)?.rarity ?? 'common'] >= 2 ? 3 : 2
}

/** Misses the line can take before the catch gets away. */
export const LINE_STRENGTH = 3

/** Each tap landed makes the fish fight a little harder. */
export function reelSpeed(base: number, hits: number): number {
  return base * (1 + hits * 0.12)
}

/** Where the marker is (0..1) after `t` seconds: across and back at a steady speed, like a ping-pong ball. */
export function markerAt(t: number, speed: number): number {
  const p = (((t * speed) % 1) + 1) % 1
  return p < 0.5 ? p * 2 : 2 - p * 2
}

/** Slack either side of the zone, for the marker's own width and a finger's honest timing. */
export const REEL_GRACE = 0.025

export type ReelJudgement = 'perfect' | 'hit' | 'miss'

/** Was a tap with the marker at `at` in the green? Near the middle counts as perfect. */
export function judgeReel(at: number, start: number, zone: number): ReelJudgement {
  if (at < start - REEL_GRACE || at > start + zone + REEL_GRACE) return 'miss'
  return Math.abs(at - (start + zone / 2)) <= zone * 0.18 ? 'perfect' : 'hit'
}

/** The green zone's start for a cast (it moves about so each reel feels fresh). */
export function zoneStart(zone: number, rand: () => number = Math.random): number {
  return 0.08 + rand() * (0.84 - zone)
}

/** A fresh spot for the zone after a tap, well away from the marker, so one hit can't roll straight into the next. */
export function nextZoneStart(zone: number, marker: number, rand: () => number = Math.random): number {
  for (let i = 0; i < 12; i++) {
    const start = zoneStart(zone, rand)
    if (marker < start - 0.12 || marker > start + zone + 0.12) return start
  }
  // Fall back to the far side of the bar.
  return marker > 0.5 ? 0.08 : 0.92 - zone
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

