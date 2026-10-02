// Visitors: special creatures that drop by for a minute or two when the tank
// has something they like, then leave a gift on the gravel. They aren't
// owned, never need feeding and don't count toward the fish limit. Every
// visitor has a hint in the Fishpedia, so finding them all is a puzzle you
// can always solve, never a secret.
import type { DecorationInstance, FishDefinition, Rarity } from './types'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { clampToInterior, INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../scene/TankBounds'
import { beautyOf, type SetStyle } from './beauty'
import { inSeason, type SeasonId } from './seasons'

/** Which body a visitor borrows: most reuse a creature rig in new colours. */
export type VisitorRig = 'fish' | 'seahorse' | 'jelly' | 'turtle' | 'shrimp' | 'crab' | 'hermit'

export interface VisitorNeeds {
  /** Every one of these decorations. */
  all?: string[]
  /** At least one of these decorations. */
  any?: string[]
  /** Only comes after dark. */
  night?: boolean
  /** At least this many different decorations of one style. */
  style?: { style: SetStyle; count: number }
  /** Tank beauty stars. */
  stars?: number
  /** Only during this season (it comes back every year). */
  season?: SeasonId
}

export interface VisitorDef {
  id: string
  name: string
  /** One of a kind: "the Old Wanderer", or a proper name like "Captain Puffer". Otherwise "a Hermit Crab". */
  article?: 'the' | 'none'
  icon: string
  rarity: Rarity
  /** Shown once you've met it. */
  description: string
  /** Shown before you've met it: always enough to work out how. */
  hint: string
  /** What brings it, in words, for the Fishpedia page. */
  likes: string
  rig: VisitorRig
  look: FishDefinition
  needs: VisitorNeeds
  /** Gift size compared with an ordinary gift. */
  gift: number
}

/** A visitor's colours on top of a catalog species' body (or a plain small fish). */
function look(base: string | null, id: string, colors: Partial<FishDefinition>): FishDefinition {
  const species = base ? getFishDef(base) : undefined
  return {
    name: '',
    description: '',
    cost: 0,
    unlockLevel: 0,
    rarity: 'common',
    kind: 'fish',
    color: '#ffffff',
    color2: '#ffffff',
    pattern: 'solid',
    finStyle: 'forked',
    bodyLength: 0.24,
    bodyHeight: 0.11,
    sizeRange: [1, 1],
    eggCountRange: [0, 0],
    maxSpeed: 0.6,
    turnSpeed: 2.6,
    zone: 'middle',
    ...species,
    ...colors,
    id: `visitor-${id}`,
    schooling: false,
    // Guests never eat your fish food or drop coin bubbles; they bring a gift instead.
    coinValue: 0,
    appetite: 0,
  }
}

export const VISITORS: VisitorDef[] = [
  {
    id: 'bubble-goby',
    name: 'Bubble Goby',
    icon: '🫧',
    rarity: 'common',
    description: 'A tiny speckled goby that rides the bubble stream up and down, just for fun.',
    hint: 'Loves playing in a stream of bubbles.',
    likes: 'Bubble Stone',
    rig: 'fish',
    look: look(null, 'bubble-goby', {
      color: '#e9f6ff', color2: '#4aa8e8', pattern: 'spots', finStyle: 'round', features: ['bigEyes'],
      bodyLength: 0.22, bodyHeight: 0.1, bodyWidth: 0.85, maxSpeed: 0.7,
    }),
    needs: { any: ['air-stone'] },
    gift: 1,
  },
  {
    id: 'hermit-crab',
    name: 'Hermit Crab',
    icon: '🐚',
    rarity: 'common',
    description: 'Shuffles about in a borrowed shell, always checking whether yours might fit better.',
    hint: 'Always hunting for a nicer shell to try on.',
    likes: 'Starfish & Shells or a Giant Clam',
    rig: 'hermit',
    look: look(null, 'hermit-crab', { color: '#e8673c', color2: '#f2d7b0', color3: '#c98a5a', bodyLength: 0.5, maxSpeed: 0.18 }),
    needs: { any: ['seashell-cluster', 'giant-clam'] },
    gift: 1,
  },
  {
    id: 'treasure-crab',
    name: 'Treasure Crab',
    icon: '🦀',
    rarity: 'uncommon',
    description: 'A bright red crab that polishes treasure chests and always leaves a little extra behind.',
    hint: "Can't resist a treasure chest.",
    likes: 'Treasure Chest',
    rig: 'crab',
    look: look(null, 'treasure-crab', { color: '#e3402f', color2: '#ffd24a', color3: '#fff1c2', bodyLength: 0.55, maxSpeed: 0.26 }),
    needs: { any: ['treasure-chest'] },
    gift: 1.4,
  },
  {
    id: 'lava-blenny',
    name: 'Lava Blenny',
    icon: '🌋',
    rarity: 'uncommon',
    description: 'A sooty little fish with glowing orange freckles. It likes things toasty.',
    hint: 'Likes it warm, and loves a bubbling volcano.',
    likes: 'Bubbling Volcano',
    rig: 'fish',
    look: look(null, 'lava-blenny', {
      color: '#2b2321', color2: '#ff6a1a', color3: '#ffd166', pattern: 'neon', finStyle: 'round', glow: true, features: ['bigEyes'],
      bodyLength: 0.26, bodyHeight: 0.1, maxSpeed: 0.55,
    }),
    needs: { any: ['volcano'] },
    gift: 1.2,
  },
  {
    id: 'ghost-shrimp',
    name: 'Ghost Shrimp',
    icon: '👻',
    rarity: 'rare',
    description: 'So pale you can almost see through it. It only tiptoes out once the lights are low.',
    hint: 'Only comes out at night, and is drawn to things that glow.',
    likes: 'Glow Mushrooms, a Crystal Cluster or a Glow Cave, after dark',
    rig: 'shrimp',
    look: look('cherry-shrimp', 'ghost-shrimp', { color: '#e8f6ff', color2: '#8fe9ff', glow: true, bodyLength: 0.3, maxSpeed: 0.16 }),
    needs: { any: ['glow-mushrooms', 'gem-rock', 'glow-cave'], night: true },
    gift: 1.3,
  },
  {
    id: 'robo-fish',
    name: 'Robo Fish',
    icon: '🤖',
    rarity: 'rare',
    description: 'Beep boop! A friendly little robot that follows signals from machines.',
    hint: 'Picks up signals from submarines, spaceships and humming machines.',
    likes: 'Yellow Submarine, Crashed UFO or Bubble Filter Tower',
    rig: 'fish',
    look: look(null, 'robo-fish', {
      color: '#b9c6d2', color2: '#6bff9a', color3: '#3a4a5a', pattern: 'neon', finStyle: 'lunate', glow: true,
      bodyLength: 0.32, bodyHeight: 0.13, maxSpeed: 0.75,
    }),
    needs: { any: ['submarine', 'crashed-ufo', 'bubble-filter'] },
    gift: 1.3,
  },
  {
    id: 'lucky-koi',
    article: 'the',
    name: 'Lucky Koi Spirit',
    icon: '🍀',
    rarity: 'rare',
    description: 'A shimmering golden koi said to bring good fortune to any tank it visits.',
    hint: 'Drawn to good fortune and golden fountains.',
    likes: 'Lucky Coin Fountain',
    rig: 'fish',
    look: look('koi', 'lucky-koi', { color: '#fff6d8', color2: '#ffc93c', color3: '#ff8f3c', glow: true }),
    needs: { any: ['coin-fountain'] },
    gift: 2,
  },
  {
    id: 'lantern-jelly',
    name: 'Lantern Jelly',
    icon: '🏮',
    rarity: 'rare',
    description: 'A glowing violet jelly that drifts like a paper lantern on a summer night.',
    hint: 'Drifts by at night when a tank really sparkles (4 different Sparkle pieces).',
    likes: '4 Sparkle decorations, after dark',
    rig: 'jelly',
    look: look('moon-jelly', 'lantern-jelly', { color: '#d9b8ff', color2: '#ffcf6b' }),
    needs: { style: { style: 'sparkle', count: 4 }, night: true },
    gift: 1.4,
  },
  {
    id: 'captain-puffer',
    article: 'none',
    name: 'Captain Puffer',
    icon: '⚓',
    rarity: 'epic',
    description: 'A grizzled old pufferfish who has sailed every sea. Puffs up proudly when you wave.',
    hint: 'An old sea captain looking for a ship to call home.',
    likes: 'Pirate Shipwreck',
    rig: 'fish',
    look: look('pufferfish', 'captain-puffer', { color: '#3c5a8a', color2: '#f2e6c9', pattern: 'spots' }),
    needs: { any: ['shipwreck'] },
    gift: 1.8,
  },
  {
    id: 'sea-dragon',
    name: 'Leafy Sea Dragon',
    icon: '🐉',
    rarity: 'epic',
    description: 'Covered in leafy frills, it looks just like a drifting piece of seaweed.',
    hint: 'Hides among tall kelp beside ancient ruins.',
    likes: 'Giant Kelp and a Sunken Temple together',
    rig: 'seahorse',
    look: look('seahorse', 'sea-dragon', { color: '#8fbf3a', color2: '#f0d36a', bodyLength: 0.5 }),
    needs: { all: ['tall-kelp', 'temple-ruins'] },
    gift: 2,
  },
  {
    id: 'royal-seahorse',
    article: 'the',
    name: 'Royal Seahorse',
    icon: '👑',
    rarity: 'epic',
    description: 'Her Majesty of the reef, in rose and gold. She expects a palace, naturally.',
    hint: 'Only visits tanks with a palace fit for royalty.',
    likes: 'Crystal Palace or Atlantis Palace',
    rig: 'seahorse',
    look: look('seahorse', 'royal-seahorse', { color: '#ff8fc7', color2: '#ffd36a', glow: true }),
    needs: { any: ['crystal-palace', 'atlantis-palace'] },
    gift: 2,
  },
  {
    id: 'old-wanderer',
    article: 'the',
    name: 'Old Wanderer',
    icon: '🐢',
    rarity: 'legendary',
    description: 'An ancient turtle with a mossy shell who has seen every reef in the world.',
    hint: 'A world traveller who only stops at the prettiest tanks (4-star beauty).',
    likes: 'A 4-star beautiful tank',
    rig: 'turtle',
    look: look('sea-turtle', 'old-wanderer', { color: '#7f9c6a', color2: '#4d6b3a', color3: '#d9c79a' }),
    needs: { stars: 4 },
    gift: 3,
  },
]

/** "A Hermit Crab came to visit" / "a gift from the Hermit Crab". */
export function visitorName(v: VisitorDef, { definite = false, start = false } = {}): string {
  if (v.article === 'none') return v.name
  const article = v.article === 'the' || definite ? 'the' : 'a'
  return `${start ? article[0].toUpperCase() + article.slice(1) : article} ${v.name}`
}

VISITORS.push(
  {
    id: 'petal-goby',
    name: 'Petal Goby',
    icon: '🌸',
    rarity: 'rare',
    description: 'A blushing pink goby that drifts in on the spring currents, trailing petals.',
    hint: 'A Spring Bloom guest (March 20 to May 31) who adores blossoms.',
    likes: 'Blossom Coral, during Spring Bloom',
    rig: 'fish',
    look: look(null, 'petal-goby', { color: '#ffd1e4', color2: '#ff7fb3', pattern: 'spots', finStyle: 'fan', features: ['bigEyes'], bodyLength: 0.24, bodyHeight: 0.11 }),
    needs: { any: ['blossom-coral'], season: 'spring-bloom' },
    gift: 1.5,
  },
  {
    id: 'sunny-sunfish',
    name: 'Sunny Sunfish',
    icon: '🌞',
    rarity: 'rare',
    description: 'A round, beaming sunfish on its summer holidays. It loves a good sandcastle.',
    hint: 'A Summer Reef guest (June 21 to August 31) who is on holiday at the beach.',
    likes: 'A Sandcastle, during Summer Reef',
    rig: 'fish',
    look: look('discus', 'sunny-sunfish', { color: '#ffd23f', color2: '#ff8a3c', pattern: 'gradient' }),
    needs: { any: ['sandcastle'], season: 'summer-reef' },
    gift: 1.5,
  },
  {
    id: 'ghost-jelly',
    name: 'Ghost Jelly',
    icon: '👻',
    rarity: 'rare',
    description: 'Boo! A friendly little ghost that floats by to admire your pumpkin.',
    hint: 'A Spooky Seas guest (October 1 to November 2) who follows a pumpkin glow.',
    likes: "A Jack-o'-Lantern, during Spooky Seas",
    rig: 'jelly',
    look: look('moon-jelly', 'ghost-jelly', { color: '#e9fff2', color2: '#9dffb8' }),
    needs: { any: ['jack-o-lantern'], season: 'spooky-seas' },
    gift: 1.5,
  },
  {
    id: 'frost-puffer',
    name: 'Frost Puffer',
    icon: '❄️',
    rarity: 'rare',
    description: 'An icy-blue puffer with frosty spikes, here to say hello to the snowman.',
    hint: 'A Winter Lights guest (December 1 to January 6) who loves snowy friends.',
    likes: 'A Sea Snowman, during Winter Lights',
    rig: 'fish',
    look: look('pufferfish', 'frost-puffer', { color: '#dff4ff', color2: '#6fb8e8', pattern: 'spots' }),
    needs: { any: ['sea-snowman'], season: 'winter-lights' },
    gift: 1.5,
  },
)

export function getVisitor(id: string): VisitorDef | undefined {
  return VISITORS.find((v) => v.id === id)
}

/** When it is: 'any' ignores day and night (used for visits while you were away). */
export type VisitTime = 'day' | 'night' | 'any'

export function canVisit(v: VisitorDef, placed: DecorationInstance[], time: VisitTime, date = new Date()): boolean {
  const n = v.needs
  if (n.night && time === 'day') return false
  if (n.season && !inSeason(n.season, date)) return false
  const has = new Set(placed.map((d) => d.defId))
  if (n.all && !n.all.every((id) => has.has(id))) return false
  if (n.any && !n.any.some((id) => has.has(id))) return false
  if (n.style || n.stars) {
    const beauty = beautyOf(placed)
    if (n.stars && beauty.stars < n.stars) return false
    if (n.style && (beauty.sets.find((s) => s.style === n.style!.style)?.count ?? 0) < n.style.count) return false
  }
  return true
}

export function eligibleVisitors(placed: DecorationInstance[], time: VisitTime, date = new Date()): VisitorDef[] {
  return VISITORS.filter((v) => canVisit(v, placed, time, date))
}

export interface VisitorRecord {
  visits: number
  /** When you first met it (ms). */
  first: number
}

export type VisitorLog = Record<string, VisitorRecord>

const RARITY_WEIGHT: Record<Rarity, number> = { common: 1, uncommon: 0.9, rare: 0.75, epic: 0.6, legendary: 0.5 }

/** Pick who comes next. Someone you haven't met yet is much more likely, so the book fills up. */
export function pickVisitor(eligible: VisitorDef[], log: VisitorLog, rand: () => number, last?: string): VisitorDef | null {
  // Don't send the same guest twice in a row when anyone else could come.
  const pool = eligible.length > 1 ? eligible.filter((v) => v.id !== last) : eligible
  if (pool.length === 0) return null
  const weights = pool.map((v) => RARITY_WEIGHT[v.rarity] * (log[v.id] ? 1 : 3))
  let roll = rand() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

/** The decoration a visitor came for, if any: it hangs around there. */
export function attractorFor(v: VisitorDef, placed: DecorationInstance[], rand: () => number = Math.random): DecorationInstance | undefined {
  const ids = [...(v.needs.any ?? []), ...(v.needs.all ?? [])]
  const matches = placed.filter((d) => ids.includes(d.defId))
  return matches[Math.floor(rand() * matches.length)]
}

/** A spot on the gravel beside what it came for (anywhere roomy if nothing in particular), as [x, z]. */
export function visitSpot(v: VisitorDef, placed: DecorationInstance[], rand: () => number = Math.random): [number, number] {
  const near = attractorFor(v, placed, rand)
  const def = near && getDecorationDef(near.defId)
  if (!near || !def) return clampToInterior((rand() - 0.5) * INTERIOR_HALF_WIDTH * 1.4, (rand() - 0.5) * INTERIOR_HALF_DEPTH * 1.2, 0.4)
  const angle = rand() * Math.PI * 2
  const reach = def.footprintRadius + 0.3
  return clampToInterior(near.position[0] + Math.cos(angle) * reach, near.position[2] + Math.sin(angle) * reach * 0.8, 0.3)
}

export interface VisitorGift {
  id: string
  visitorId: string
  x: number
  z: number
  coins: number
  xp: number
  /** When it was left (ms). */
  at: number
}

/** Gifts waiting on the gravel at once; another visit opens the oldest for you. */
export const MAX_GIFTS = 3

export function giftReward(v: VisitorDef, level: number) {
  return { coins: Math.round((8 + level * 2.5) * v.gift), xp: Math.round((4 + level * 0.5) * v.gift) }
}

/** XP for meeting a visitor for the first time. */
export const FIRST_VISIT_XP: Record<Rarity, number> = { common: 15, uncommon: 25, rare: 40, epic: 60, legendary: 100 }

/** One visit for every 20 minutes away, up to three. */
export const AWAY_VISIT_SECONDS = 20 * 60
export const MAX_AWAY_VISITS = 3

/** Visitors who can come any time of year (seasonal ones come back every year). */
export const YEAR_ROUND = VISITORS.filter((v) => !v.needs.season)

export function visitorTotals(log: VisitorLog) {
  return { met: VISITORS.filter((v) => log[v.id]).length, total: VISITORS.length, yearRound: YEAR_ROUND.filter((v) => log[v.id]).length }
}
