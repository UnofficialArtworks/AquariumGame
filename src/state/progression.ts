export const MAX_LEVEL = 30

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return 50 + (level - 1) * 40
}

export interface LevelProgress {
  level: number
  /** XP earned inside the current level. */
  into: number
  /** XP required to finish the current level. */
  needed: number
}

export function levelFromXp(xp: number): LevelProgress {
  let level = 1
  let remaining = Math.max(0, xp)
  while (level < MAX_LEVEL && remaining >= xpToNext(level)) {
    remaining -= xpToNext(level)
    level++
  }
  return { level, into: remaining, needed: level >= MAX_LEVEL ? 1 : xpToNext(level) }
}

export function levelUpCoinReward(level: number): number {
  return 50 + level * 25
}
