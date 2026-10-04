// Lucky charms: consumables that nudge the odds of one friendship's clutch.
// They're deliberately gentle (a rare colour is still rare with a charm) so
// collecting every colour and pattern stays a long-term goal: one charm per
// friendship, a few carried at a time, and used up when the friendship starts.
import { levelFromXp } from './progression'
import type { GameState } from './types'

export type CharmId = 'clover' | 'shell' | 'moon'
export type CharmBag = Partial<Record<CharmId, number>>

/** How a charm tilts a clutch's rolls. */
export interface Luck {
  /** Multiplies the chance of a rare colour. */
  morphChance?: number
  /** Multiplies how often the rarest colours are the one picked. */
  rareTilt?: number
  /** Chance of a surprise pattern when the parents' patterns match. */
  matchSurprise?: number
  /** Chance of a surprise pattern when they don't. */
  mismatchSurprise?: number
}

export interface CharmDef {
  id: CharmId
  icon: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  luck: Luck
}

/** Charms of each kind you can carry at once. */
export const MAX_CHARMS = 5

export const CHARMS: CharmDef[] = [
  {
    id: 'clover', icon: '🍀', name: 'Lucky clover', cost: 900, unlockLevel: 8,
    description: 'Rare colours are a little more likely in this clutch.',
    luck: { morphChance: 1.4 },
  },
  {
    id: 'shell', icon: '🐚', name: 'Pattern shell', cost: 700, unlockLevel: 10,
    description: 'Surprise patterns turn up more often, even from parents with different patterns.',
    luck: { matchSurprise: 0.35, mismatchSurprise: 0.08 },
  },
  {
    id: 'moon', icon: '🌙', name: 'Moon pearl', cost: 1800, unlockLevel: 18,
    description: 'If a rare colour appears, Midnight and Aurora are twice as likely.',
    luck: { rareTilt: 2 },
  },
]

export function getCharm(id: string | undefined): CharmDef | undefined {
  return id ? CHARMS.find((c) => c.id === id) : undefined
}

export function luckOf(id: string | undefined): Luck {
  return getCharm(id)?.luck ?? {}
}

/** Keep only known charms, as whole counts up to the carry limit. */
export function sanitizeCharms(raw: unknown): CharmBag {
  const out: CharmBag = {}
  if (!raw || typeof raw !== 'object') return out
  for (const charm of CHARMS) {
    const count = Math.floor(Number((raw as Record<string, unknown>)[charm.id]))
    if (Number.isFinite(count) && count > 0) out[charm.id] = Math.min(count, MAX_CHARMS)
  }
  return out
}

/** Why a charm can't be bought right now, or null if it can. */
export function charmProblem(s: Pick<GameState, 'xp' | 'currency' | 'charms'>, id: CharmId): string | null {
  const charm = getCharm(id)
  if (!charm) return 'There is no charm like that.'
  if (levelFromXp(s.xp).level < charm.unlockLevel) return `The ${charm.name} unlocks at level ${charm.unlockLevel}.`
  if ((s.charms[id] ?? 0) >= MAX_CHARMS) return `You can carry ${MAX_CHARMS} of each charm. Use one on a friendship first.`
  if (s.currency < charm.cost) return `The ${charm.name} costs ${charm.cost.toLocaleString()} coins. You need ${Math.ceil(charm.cost - s.currency).toLocaleString()} more.`
  return null
}
