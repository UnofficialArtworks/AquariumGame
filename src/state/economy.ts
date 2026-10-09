// Tuning knobs for the game loop, all in one place.

/** Coins trickled in per second while the game is open. */
export const PASSIVE_COINS_PER_SECOND = 0.005
/** Passive coins per second while away (plus whatever the fish earn). */
export const OFFLINE_PASSIVE_PER_SECOND = 0.001
/** Fish keep making coins for up to this long while the player is away. */
export const MAX_OFFLINE_EARNING_SECONDS = 8 * 60 * 60
/** The most away time fish spend earning at full pace (fed, or kept fed by the auto-feeder). */
export const MAX_OFFLINE_FULL_PACE_SECONDS = 3 * 60 * 60
/** Hungry fish still make coins while the player is away, at this fraction of their usual pace. */
export const AWAY_COIN_PACE = 0.25
export const MAX_OFFLINE_SIM_SECONDS = 12 * 60 * 60

/** Full -> starving in ~18 minutes for a fish with appetite 1. */
export const HUNGER_PER_SECOND = 1 / (18 * 60)
/** Fish stop making coins once hunger passes this. */
export const HUNGER_COIN_CUTOFF = 0.62
/** Fish won't chase food when fuller than this. */
export const HUNGER_FULL_THRESHOLD = 0.1

export const MURK_BASE_PER_SECOND = 0.00006
export const MURK_PER_FISH_PER_SECOND = 0.000006
export const MURK_PER_WASTE_PER_SECOND = 0.000012

export const GROWTH_PER_MEAL = 0.1
/** Cleanup creatures graze on the tank and grow without hand feeding. */
export const CLEANUP_GROWTH_PER_SECOND = 1 / (45 * 60)
export const MAX_WASTE_ITEMS = 60
export const NURSERY_CAPACITY = 12
export const FRIENDSHIP_SECONDS = 120

/** Average seconds between coin bubbles from one content fish. */
export const COIN_INTERVAL_MIN = 600
export const COIN_INTERVAL_MAX = 900

export function coinValueFor(baseValue: number, growth: number): number {
  return Math.max(1, Math.round(baseValue * (1 + growth * 0.6)))
}

/** Size multiplier for a fish, from its growth. */
export function sizeForGrowth(growth: number, sizeScale = 1): number {
  return (0.42 + Math.max(0, Math.min(1, growth)) * 0.8) * sizeScale
}

export function salePrice(cost: number, growth: number, cleanliness: number): number {
  const maturity = Math.max(0, Math.min(1, growth))
  const clean = Math.max(0, Math.min(1, cleanliness))
  // Raising a fish to adulthood is the profitable step; a spotless tank adds up to 25%.
  return Math.max(1, Math.round(cost * (0.4 + maturity * 0.85) * (1 + clean * 0.25)))
}
