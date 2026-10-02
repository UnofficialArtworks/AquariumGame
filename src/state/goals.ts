// Daily wishes and trophies. Wishes are three small things to do each day,
// measured from the player's running stats, so nothing has to be wired up
// per wish: a wish remembers the stat's value when it was handed out and
// counts up from there. Missing a day costs nothing; tomorrow simply brings
// new wishes. Trophies are long-term milestones that pay out once.
import type { GameState, GameStats } from './types'
import { levelFromXp } from './progression'
import { fishpediaTotals } from './fishpedia'
import { beautyOf } from './beauty'
import { eligibleVisitors, visitorTotals, YEAR_ROUND } from './visitors'
import { tideFor } from './ocean'
import { hashString, mulberry32 } from '../utils/rng'

export type StatKey = keyof GameStats

type WishKind = 'care' | 'play' | 'create'

interface WishTemplate {
  id: string
  icon: string
  kind: WishKind
  stat: StatKey
  target: (level: number) => number
  text: (target: number) => string
  /** Only offered when this is true at the start of the day. */
  available?: (s: GameState, level: number) => boolean
}

const WISHES: WishTemplate[] = [
  { id: 'feed', icon: '🍤', kind: 'care', stat: 'foodEaten', target: (l) => 10 + Math.min(l, 20), text: (n) => `Watch your fish eat ${n} bites` },
  {
    id: 'treat',
    icon: '🍬',
    kind: 'care',
    stat: 'treatsGiven',
    target: () => 2,
    text: (n) => `Give your fish ${n} special treats`,
    available: (s) => Object.values(s.treats).reduce((a, b) => a + b, 0) >= 2,
  },
  { id: 'scrub', icon: '🧽', kind: 'care', stat: 'algaeScrubbed', target: () => 3, text: () => 'Scrub some algae off the glass', available: (_s, l) => l >= 2 },
  { id: 'vacuum', icon: '🌀', kind: 'care', stat: 'wasteVacuumed', target: () => 4, text: (n) => `Vacuum up ${n} bits of mess`, available: (_s, l) => l >= 2 },
  { id: 'water', icon: '💧', kind: 'care', stat: 'waterChanges', target: () => 1, text: () => 'Give your tank fresh water', available: (_s, l) => l >= 3 },
  { id: 'bubbles', icon: '🫧', kind: 'play', stat: 'bubblesPopped', target: (l) => (l < 5 ? 3 : 5), text: (n) => `Tap ${n} coin bubbles` },
  { id: 'greet', icon: '👋', kind: 'play', stat: 'fishGreeted', target: () => 5, text: (n) => `Say hi to ${n} fish (tap them)` },
  { id: 'photo', icon: '📸', kind: 'play', stat: 'photos', target: () => 1, text: () => 'Take a photo of your aquarium' },
  { id: 'relax', icon: '😌', kind: 'play', stat: 'relaxSeconds', target: () => 60, text: () => 'Relax with your fish for a minute' },
  {
    id: 'gift',
    icon: '🎁',
    kind: 'play',
    stat: 'giftsOpened',
    target: () => 1,
    text: () => 'Open a gift from a visitor',
    available: (s) => eligibleVisitors(s.placedDecorations, 'day').length > 0,
  },
  { id: 'coins', icon: '🪙', kind: 'play', stat: 'coinsCollected', target: (l) => 40 + l * 20, text: (n) => `Earn ${n} coins` },
  { id: 'decor', icon: '🪸', kind: 'create', stat: 'decorPlaced', target: () => 2, text: (n) => `Place ${n} decorations` },
  {
    id: 'friends',
    icon: '💗',
    kind: 'create',
    stat: 'friendships',
    target: () => 1,
    text: () => 'Start a friendship in the nursery',
    available: (s) => s.ownedFish.filter((f) => (s.fishVitals[f.id]?.growth ?? 0) >= 1).length >= 2,
  },
]

export interface Wish {
  id: string
  stat: StatKey
  target: number
  /** The stat's value when the wish was handed out. */
  base: number
  claimed: boolean
}

export interface DailyWishes {
  /** Local date, YYYY-MM-DD. */
  day: string
  wishes: Wish[]
  bonusClaimed: boolean
}

export const NO_WISHES: DailyWishes = { day: '', wishes: [], bonusClaimed: false }

export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getWishTemplate(id: string) {
  return WISHES.find((w) => w.id === id)
}

/** Today's three wishes: one of each kind when possible, the same all day for the same save. */
export function rollWishes(s: GameState, day: string): DailyWishes {
  const level = levelFromXp(s.xp).level
  const rand = mulberry32(hashString(`${day}:${s.aquariumName}`))
  const pool = WISHES.filter((w) => !w.available || w.available(s, level))
  const shuffled = pool.map((w) => ({ w, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.w)
  const picked: WishTemplate[] = []
  for (const kind of ['care', 'play', 'create'] as WishKind[]) {
    const first = shuffled.find((w) => w.kind === kind)
    if (first) picked.push(first)
  }
  for (const w of shuffled) if (picked.length < 3 && !picked.includes(w)) picked.push(w)
  return {
    day,
    bonusClaimed: false,
    wishes: picked.map((w) => ({ id: w.id, stat: w.stat, target: w.target(level), base: s.stats[w.stat] ?? 0, claimed: false })),
  }
}

export function wishProgress(s: Pick<GameState, 'stats'>, wish: Wish): number {
  return Math.max(0, Math.min(wish.target, (s.stats[wish.stat] ?? 0) - wish.base))
}

export function wishDone(s: Pick<GameState, 'stats'>, wish: Wish): boolean {
  return wishProgress(s, wish) >= wish.target
}

export function wishReward(level: number) {
  return { coins: 30 + level * 10, xp: 10 + level * 2 }
}

export function bonusReward(level: number) {
  return { coins: 60 + level * 20, xp: 25 + level * 4 }
}

/** Wishes ready to claim, plus the all-done bonus: drives the badge on the Goals button. */
export function claimableCount(s: Pick<GameState, 'stats' | 'daily'>): number {
  const ready = s.daily.wishes.filter((w) => !w.claimed && wishDone(s, w)).length
  const bonus = s.daily.wishes.length > 0 && s.daily.wishes.every((w) => w.claimed) && !s.daily.bonusClaimed ? 1 : 0
  return ready + bonus
}

// --- trophies -----------------------------------------------------------------------

export interface Trophy {
  id: string
  icon: string
  name: string
  text: string
  target: number
  coins: number
  progress: (s: GameState) => number
}

const stat = (key: StatKey) => (s: GameState) => s.stats[key] ?? 0
const mainFish = (s: GameState) => s.ownedFish.filter((f) => f.habitat === 'main').length
/** Patterns hatched that a species doesn't wear by nature. */
const newPatterns = (s: GameState) => Object.values(s.fishpedia).reduce((n, e) => n + (e.patterns?.length ?? 0), 0)

export const TROPHIES: Trophy[] = [
  { id: 'first-bites', icon: '🍤', name: 'Dinner Bell', text: 'Your fish eat 100 bites', target: 100, coins: 50, progress: stat('foodEaten') },
  { id: 'feast', icon: '🍱', name: 'Feast Maker', text: 'Your fish eat 2,000 bites', target: 2000, coins: 400, progress: stat('foodEaten') },
  { id: 'treats', icon: '🍬', name: 'Treat Giver', text: 'Give 25 special treats', target: 25, coins: 150, progress: stat('treatsGiven') },
  { id: 'scrub', icon: '🧽', name: 'Squeaky Clean', text: 'Scrub 100 patches of algae', target: 100, coins: 200, progress: stat('algaeScrubbed') },
  { id: 'vacuum', icon: '🌀', name: 'Gravel Guardian', text: 'Vacuum up 100 bits of mess', target: 100, coins: 200, progress: stat('wasteVacuumed') },
  { id: 'water', icon: '💧', name: 'Fresh as a Stream', text: 'Change the water 10 times', target: 10, coins: 150, progress: stat('waterChanges') },
  { id: 'bubbles', icon: '🫧', name: 'Bubble Popper', text: 'Tap 50 coin bubbles', target: 50, coins: 150, progress: stat('bubblesPopped') },
  { id: 'coins', icon: '🪙', name: 'Treasure Keeper', text: 'Earn 10,000 coins', target: 10000, coins: 500, progress: stat('coinsCollected') },
  { id: 'greet', icon: '👋', name: 'Friendly Face', text: 'Say hi to fish 50 times', target: 50, coins: 100, progress: stat('fishGreeted') },
  { id: 'photos', icon: '📸', name: 'Shutterbug', text: 'Take 10 aquarium photos', target: 10, coins: 100, progress: stat('photos') },
  { id: 'decor', icon: '🪸', name: 'Interior Designer', text: 'Place 50 decorations', target: 50, coins: 200, progress: stat('decorPlaced') },
  { id: 'friends', icon: '💗', name: 'Matchmaker', text: 'Start 5 nursery friendships', target: 5, coins: 200, progress: stat('friendships') },
  { id: 'hatch', icon: '🐣', name: 'Proud Parent', text: 'Hatch 10 baby fish', target: 10, coins: 250, progress: stat('hatched') },
  { id: 'hatch-lots', icon: '🥚', name: 'Big Family', text: 'Hatch 50 baby fish', target: 50, coins: 600, progress: stat('hatched') },
  { id: 'relax', icon: '😌', name: 'Zen Keeper', text: 'Relax with your fish for 10 minutes', target: 600, coins: 150, progress: stat('relaxSeconds') },
  { id: 'species-10', icon: '📖', name: 'Fish Spotter', text: 'Collect 10 species in the Fishpedia', target: 10, coins: 200, progress: (s) => fishpediaTotals(s.fishpedia).species },
  { id: 'species-25', icon: '📚', name: 'Fish Expert', text: 'Collect 25 species in the Fishpedia', target: 25, coins: 600, progress: (s) => fishpediaTotals(s.fishpedia).species },
  { id: 'morph', icon: '🌟', name: 'Rare Find', text: 'Discover a rare color morph', target: 1, coins: 300, progress: (s) => fishpediaTotals(s.fishpedia).morphs },
  { id: 'full-house', icon: '🐠', name: 'Full House', text: 'Have 20 fish in your aquarium', target: 20, coins: 300, progress: mainFish },
  { id: 'beauty-3', icon: '🌸', name: 'Pretty Tank', text: 'Reach 3-star beauty', target: 3, coins: 150, progress: (s) => beautyOf(s.placedDecorations).stars },
  { id: 'beauty-5', icon: '💎', name: 'Picture Perfect', text: 'Reach 5-star beauty', target: 5, coins: 600, progress: (s) => beautyOf(s.placedDecorations).stars },
  {
    id: 'theme',
    icon: '🎨',
    name: 'Theme Master',
    text: 'Place 8 different decorations of one style',
    target: 8,
    coins: 400,
    progress: (s) => beautyOf(s.placedDecorations).sets[0]?.count ?? 0,
  },
  { id: 'visitor-1', icon: '✨', name: 'First Guest', text: 'Meet your first visitor', target: 1, coins: 50, progress: (s) => visitorTotals(s.visitors).met },
  { id: 'visitors-6', icon: '🏡', name: 'Popular Spot', text: 'Meet 6 different visitors', target: 6, coins: 300, progress: (s) => visitorTotals(s.visitors).met },
  {
    id: 'visitors-all',
    icon: '📒',
    name: 'Guest Book',
    text: 'Meet every year-round visitor',
    target: YEAR_ROUND.length,
    coins: 800,
    progress: (s) => visitorTotals(s.visitors).yearRound,
  },
  { id: 'gifts', icon: '🎁', name: 'Gift Collector', text: 'Open 25 visitor gifts', target: 25, coins: 250, progress: stat('giftsOpened') },
  { id: 'patterns-5', icon: '🎨', name: 'Pattern Spotter', text: 'Hatch 5 new patterns', target: 5, coins: 250, progress: (s) => newPatterns(s) },
  {
    id: 'pattern-set',
    icon: '🖼️',
    name: 'Full Set',
    text: 'Find all 9 patterns for one species',
    target: 9,
    coins: 1000,
    progress: (s) => fishpediaTotals(s.fishpedia).fullSet,
  },
  { id: 'crew-200', icon: '🧹', name: 'Hard Workers', text: 'Your cleanup crew finishes 200 jobs', target: 200, coins: 250, progress: stat('crewJobs') },
  { id: 'angler', icon: '🎣', name: 'Angler', text: 'Reel in 25 catches while fishing', target: 25, coins: 300, progress: stat('fishCaught') },
  { id: 'release-1', icon: '🌊', name: 'Swim Free', text: 'Release a grown fish to the Open Ocean', target: 1, coins: 100, progress: stat('released') },
  { id: 'release-10', icon: '🐬', name: 'Ocean Friend', text: 'Release 10 fish to the Open Ocean', target: 10, coins: 300, progress: stat('released') },
  { id: 'tide-5', icon: '🌅', name: 'High Tide', text: 'Raise the ocean to Tide 5', target: 5, coins: 800, progress: (s) => tideFor(s.stats.released) },
  { id: 'level-10', icon: '⭐', name: 'Rising Star', text: 'Reach level 10', target: 10, coins: 200, progress: (s) => levelFromXp(s.xp).level },
  { id: 'level-20', icon: '🌠', name: 'Shining Star', text: 'Reach level 20', target: 20, coins: 400, progress: (s) => levelFromXp(s.xp).level },
  { id: 'level-30', icon: '🏆', name: 'Aquarium Legend', text: 'Reach level 30', target: 30, coins: 1000, progress: (s) => levelFromXp(s.xp).level },
]

/** Trophies the player has just reached but not yet been given. */
export function newTrophies(s: GameState): Trophy[] {
  return TROPHIES.filter((t) => !s.trophies[t.id] && t.progress(s) >= t.target)
}
