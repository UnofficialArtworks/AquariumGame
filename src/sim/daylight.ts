// The tank's lights follow the player's real clock: bright by day, dim at
// night, easing through dusk and dawn. Hours are local time.
const DAWN_START = 5.5
const DAWN_END = 7
const DUSK_START = 19
const DUSK_END = 20.5

const smooth = (t: number) => t * t * (3 - 2 * t)

/** How dark it is outside right now: 0 = day, 1 = night. */
export function clockNight(date = new Date()): number {
  const h = date.getHours() + date.getMinutes() / 60
  if (h >= DUSK_END || h < DAWN_START) return 1
  if (h >= DUSK_START) return smooth((h - DUSK_START) / (DUSK_END - DUSK_START))
  if (h < DAWN_END) return 1 - smooth((h - DAWN_START) / (DAWN_END - DAWN_START))
  return 0
}

export interface NightOverride {
  /** What the player picked with the day/night button. */
  night: boolean
  /** Whether the clock said night when they picked it; the choice lasts until the next dawn or dusk. */
  phase: boolean
}

/** The light level the scene should head for: the player's choice until the clock moves on, else the clock. */
export function nightLevel(override: NightOverride | null, date = new Date()): { level: number; override: NightOverride | null } {
  const clock = clockNight(date)
  const live = override && override.phase === clock >= 0.5 ? override : null
  return { level: live ? (live.night ? 1 : 0) : clock, override: live }
}
