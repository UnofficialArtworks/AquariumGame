// How lovely the tank looks, from its decorations. Variety counts most: each
// different decoration scores by rarity, and extra copies only add a little.
// Decorations that share a style (Nature, Sparkle…) form a set, and bigger
// sets lift the whole score. More stars make happy fish drop coins a bit more
// often, so decorating pays without ever being required.
import type { DecorationDefinition, DecorationInstance, Rarity, StyleTag } from './types'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'

export type SetStyle = Exclude<StyleTag, 'neutral'>

export const STYLES: Record<SetStyle, { name: string; icon: string }> = {
  nature: { name: 'Nature', icon: '🌿' },
  sparkle: { name: 'Sparkle', icon: '✨' },
  adventure: { name: 'Adventure', icon: '⚓' },
  classic: { name: 'Classic', icon: '🏛️' },
  scifi: { name: 'Space Age', icon: '🚀' },
}

const RARITY_POINTS: Record<Rarity, number> = { common: 4, uncommon: 6, rare: 9, epic: 13, legendary: 18 }
/** A style set's bonus grows with how many different pieces it has. */
export const SET_TIERS = [
  { count: 3, bonus: 0.1 },
  { count: 5, bonus: 0.2 },
  { count: 8, bonus: 0.35 },
]
/** Score needed for 1–5 stars. */
export const STAR_SCORES = [12, 35, 70, 115, 170]
/** Extra coin-bubble rate per star. */
const COIN_BONUS_PER_STAR = 0.04

export interface StyleSet {
  style: SetStyle
  /** Different decorations of this style in the tank. */
  count: number
  /** 0 = no bonus yet, 1–3 = tiers reached. */
  tier: number
  /** Pieces needed for the next tier, if there is one. */
  next?: number
}

export interface Beauty {
  score: number
  stars: number
  sets: StyleSet[]
  /** Fraction added to coin-bubble rate, e.g. 0.12 = +12%. */
  coinBonus: number
}

export function setStyles(def: DecorationDefinition): SetStyle[] {
  return def.styleTags.filter((t): t is SetStyle => t !== 'neutral')
}

export function styleIcons(def: DecorationDefinition): string {
  return setStyles(def)
    .map((s) => STYLES[s].icon)
    .join('')
}

let cacheKey: DecorationInstance[] | null = null
let cacheValue: Beauty | null = null

export function beautyOf(placed: DecorationInstance[]): Beauty {
  if (placed === cacheKey && cacheValue) return cacheValue
  const copies = new Map<string, number>()
  for (const p of placed) copies.set(p.defId, (copies.get(p.defId) ?? 0) + 1)
  let base = 0
  const counts = new Map<SetStyle, number>()
  for (const [id, n] of copies) {
    const def = getDecorationDef(id)
    if (!def) continue
    base += RARITY_POINTS[def.rarity] + Math.min(n - 1, 2)
    for (const style of setStyles(def)) counts.set(style, (counts.get(style) ?? 0) + 1)
  }
  const sets: StyleSet[] = [...counts]
    .map(([style, count]) => {
      const tier = SET_TIERS.filter((t) => count >= t.count).length
      return { style, count, tier, next: SET_TIERS[tier]?.count }
    })
    .sort((a, b) => b.count - a.count)
  // The best set counts in full, the runner-up by half: theming pays, but a mixed tank isn't punished.
  const bonuses = sets.map((s) => (s.tier ? SET_TIERS[s.tier - 1].bonus : 0)).sort((a, b) => b - a)
  const lift = (bonuses[0] ?? 0) + (bonuses[1] ?? 0) * 0.5
  const score = Math.round(base * (1 + lift))
  const stars = STAR_SCORES.filter((s) => score >= s).length
  cacheKey = placed
  cacheValue = { score, stars, sets, coinBonus: stars * COIN_BONUS_PER_STAR }
  return cacheValue
}
