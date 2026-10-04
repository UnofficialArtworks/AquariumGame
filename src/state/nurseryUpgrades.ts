// Nursery upgrades: a long-term coin sink for players who breed a lot. Each
// upgrade has a few levels, bought one at a time from the nursery panel, and
// each level unlocks at a player level. Owned levels live in
// `GameState.nurseryUpgrades` (missing means 0).
import { NURSERY_CAPACITY } from './economy'
import { levelFromXp } from './progression'
import type { GameState } from './types'

export type NurseryUpgradeId = 'space' | 'warmth' | 'nutrition' | 'clutch'
export type NurseryUpgradeLevels = Partial<Record<NurseryUpgradeId, number>>

export interface NurseryUpgradeTier {
  cost: number
  unlockLevel: number
}

export interface NurseryUpgradeDef {
  id: NurseryUpgradeId
  icon: string
  name: string
  blurb: string
  tiers: NurseryUpgradeTier[]
  /** What the upgrade does at a level, for the card ("16 spots"). */
  effect: (level: number) => string
}

/** Extra spots per "More room" level. */
const SPACE_PER_LEVEL = 4
/** How much faster friendships and eggs run per "Egg warmer" level. */
const WARMTH_PER_LEVEL = 0.25
/** Extra growth per meal for little fish, per "Baby food" level. */
const NUTRITION_PER_LEVEL = 0.3
/** Chance of one extra egg per clutch, per "Nesting moss" level. */
const CLUTCH_PER_LEVEL = 0.25

export const NURSERY_UPGRADES: NurseryUpgradeDef[] = [
  {
    id: 'space', icon: '🏡', name: 'More room',
    blurb: 'Space for more little fish and eggs.',
    tiers: [{ cost: 1500, unlockLevel: 6 }, { cost: 4500, unlockLevel: 12 }, { cost: 12000, unlockLevel: 20 }],
    effect: (level) => `${NURSERY_CAPACITY + level * SPACE_PER_LEVEL} spots`,
  },
  {
    id: 'warmth', icon: '🌡️', name: 'Egg warmer',
    blurb: 'Friendships bloom and eggs hatch sooner.',
    tiers: [{ cost: 1200, unlockLevel: 5 }, { cost: 4000, unlockLevel: 11 }, { cost: 10000, unlockLevel: 18 }],
    effect: (level) => (level ? `${Math.round(level * WARMTH_PER_LEVEL * 100)}% faster` : 'Normal speed'),
  },
  {
    id: 'nutrition', icon: '🍼', name: 'Baby food',
    blurb: 'Little fish in the nursery grow more from every meal.',
    tiers: [{ cost: 1000, unlockLevel: 4 }, { cost: 3500, unlockLevel: 10 }, { cost: 9000, unlockLevel: 17 }],
    effect: (level) => (level ? `+${Math.round(level * NUTRITION_PER_LEVEL * 100)}% growth per meal` : 'Normal growth'),
  },
  {
    id: 'clutch', icon: '🪺', name: 'Nesting moss',
    blurb: 'A cosy nest gives each clutch a chance of one extra egg.',
    tiers: [{ cost: 2500, unlockLevel: 9 }, { cost: 7000, unlockLevel: 15 }, { cost: 16000, unlockLevel: 22 }],
    effect: (level) => (level ? `${Math.round(level * CLUTCH_PER_LEVEL * 100)}% chance of an extra egg` : 'No extra eggs'),
  },
]

export function getNurseryUpgrade(id: string): NurseryUpgradeDef | undefined {
  return NURSERY_UPGRADES.find((u) => u.id === id)
}

/** Owned level of one upgrade (0 when never bought). */
export function upgradeLevel(levels: NurseryUpgradeLevels | undefined, id: NurseryUpgradeId): number {
  return levels?.[id] ?? 0
}

/** Spots in the nursery for little fish, eggs and a reserved clutch. */
export function nurseryCapacity(levels?: NurseryUpgradeLevels): number {
  return NURSERY_CAPACITY + upgradeLevel(levels, 'space') * SPACE_PER_LEVEL
}

/** How many seconds of nursery time pass per real second (friendships and eggs). */
export function nurserySpeed(levels?: NurseryUpgradeLevels): number {
  return 1 + upgradeLevel(levels, 'warmth') * WARMTH_PER_LEVEL
}

/** Growth multiplier for meals eaten by fish in the nursery. */
export function nurseryGrowth(levels?: NurseryUpgradeLevels): number {
  return 1 + upgradeLevel(levels, 'nutrition') * NUTRITION_PER_LEVEL
}

/** Chance that a clutch gets one extra egg. */
export function extraEggChance(levels?: NurseryUpgradeLevels): number {
  return upgradeLevel(levels, 'clutch') * CLUTCH_PER_LEVEL
}

/** Keep only known upgrades with whole levels inside their range. */
export function sanitizeNurseryUpgrades(raw: unknown): NurseryUpgradeLevels {
  const out: NurseryUpgradeLevels = {}
  if (!raw || typeof raw !== 'object') return out
  for (const upgrade of NURSERY_UPGRADES) {
    const level = Math.floor(Number((raw as Record<string, unknown>)[upgrade.id]))
    if (Number.isFinite(level) && level > 0) out[upgrade.id] = Math.min(level, upgrade.tiers.length)
  }
  return out
}

/** The next level of an upgrade, or null when it's fully upgraded. */
export function nextTier(levels: NurseryUpgradeLevels | undefined, id: NurseryUpgradeId): NurseryUpgradeTier | null {
  return getNurseryUpgrade(id)?.tiers[upgradeLevel(levels, id)] ?? null
}

/** Why the next level of an upgrade can't be bought right now, or null if it can. */
export function nurseryUpgradeProblem(s: Pick<GameState, 'xp' | 'currency' | 'nurseryUpgrades'>, id: NurseryUpgradeId): string | null {
  const upgrade = getNurseryUpgrade(id)
  if (!upgrade) return 'There is no upgrade like that.'
  const tier = nextTier(s.nurseryUpgrades, id)
  if (!tier) return `${upgrade.name} is fully upgraded.`
  if (levelFromXp(s.xp).level < tier.unlockLevel) return `The next ${upgrade.name} upgrade unlocks at level ${tier.unlockLevel}.`
  if (s.currency < tier.cost) return `The next ${upgrade.name} upgrade costs ${tier.cost.toLocaleString()} coins. You need ${Math.ceil(tier.cost - s.currency).toLocaleString()} more.`
  return null
}
