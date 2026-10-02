import type { DecorationBonusKind, DecorationInstance } from './types'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { beautyOf } from './beauty'

/** Multipliers derived from the gadget decorations placed in the main tank. */
export interface ActiveBonuses {
  /** Multiplies algae growth (1 = normal, 0.65 = 35% slower). */
  algaeRate: number
  /** Multiplies how fast the water turns murky. */
  murkRate: number
  /** Multiplies how often content fish release coin bubbles (gadgets and the tank's beauty stars). */
  coinRate: number
  /** Multiplies growth gained per meal. */
  growthRate: number
  autoFeeder: boolean
  /** A helper vacuums up waste on its own. */
  tidy: boolean
  /** A helper slowly scrubs algae off the glass. */
  scrub: boolean
}

export const NO_BONUSES: ActiveBonuses = { algaeRate: 1, murkRate: 1, coinRate: 1, growthRate: 1, autoFeeder: false, tidy: false, scrub: false }

let cacheKey: DecorationInstance[] | null = null
let cacheValue: ActiveBonuses = NO_BONUSES

/** One copy of a gadget switches its perk on; extra copies are purely decorative. */
export function bonusesFor(placed: DecorationInstance[]): ActiveBonuses {
  if (placed === cacheKey) return cacheValue
  const best: Partial<Record<DecorationBonusKind, number>> = {}
  for (const d of placed) {
    const bonus = getDecorationDef(d.defId)?.bonus
    if (bonus) best[bonus.kind] = Math.max(best[bonus.kind] ?? 0, bonus.amount)
  }
  cacheKey = placed
  cacheValue = {
    algaeRate: 1 - (best.algae ?? 0),
    murkRate: 1 - (best.murk ?? 0),
    coinRate: (1 + (best.coins ?? 0)) * (1 + beautyOf(placed).coinBonus),
    growthRate: 1 + (best.growth ?? 0),
    autoFeeder: (best.feeder ?? 0) > 0,
    tidy: (best.tidy ?? 0) > 0,
    scrub: (best.scrub ?? 0) > 0,
  }
  return cacheValue
}
