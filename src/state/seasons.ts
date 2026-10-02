// Seasons follow the device's calendar, so no server is needed. Each one
// brings a decoration to the shop and a visitor of its own. Anything you buy
// is yours to keep, and every season comes back next year, so nobody ever
// misses out for good.
export type SeasonId = 'spring-bloom' | 'summer-reef' | 'spooky-seas' | 'winter-lights'

export interface Season {
  id: SeasonId
  name: string
  icon: string
  /** When it runs, in words. */
  when: string
  /** First and last day, as [month (1–12), day]. Winter wraps over New Year. */
  start: [number, number]
  end: [number, number]
  blurb: string
}

export const SEASONS: Season[] = [
  { id: 'spring-bloom', name: 'Spring Bloom', icon: '🌸', when: 'March 20 to May 31', start: [3, 20], end: [5, 31], blurb: 'Blossoms are drifting through the water.' },
  { id: 'summer-reef', name: 'Summer Reef', icon: '☀️', when: 'June 21 to August 31', start: [6, 21], end: [8, 31], blurb: 'Sunny days and sandcastles on the reef.' },
  { id: 'spooky-seas', name: 'Spooky Seas', icon: '🎃', when: 'October 1 to November 2', start: [10, 1], end: [11, 2], blurb: 'Something spooky is glowing in the deep.' },
  { id: 'winter-lights', name: 'Winter Lights', icon: '❄️', when: 'December 1 to January 6', start: [12, 1], end: [1, 6], blurb: 'Frosty friends and twinkling lights.' },
]

export function getSeason(id: string | undefined): Season | undefined {
  return SEASONS.find((s) => s.id === id)
}

/** The season running on this date, if any. */
export function seasonOn(date = new Date()): Season | null {
  const md = (date.getMonth() + 1) * 100 + date.getDate()
  for (const s of SEASONS) {
    const from = s.start[0] * 100 + s.start[1]
    const to = s.end[0] * 100 + s.end[1]
    if (from <= to ? md >= from && md <= to : md >= from || md <= to) return s
  }
  return null
}

export function inSeason(id: string | undefined, date = new Date()): boolean {
  return !id || seasonOn(date)?.id === id
}
