import type { DailyWishes } from './goals'
import type { VisitorGift, VisitorLog } from './visitors'
export type StyleTag = 'neutral' | 'adventure' | 'sparkle' | 'nature' | 'classic' | 'scifi'
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/**
 * A passive perk granted while at least one copy of the decoration is
 * placed in the main aquarium. Copies don't stack.
 */
export type DecorationBonusKind = 'algae' | 'murk' | 'coins' | 'growth' | 'feeder'

export interface DecorationBonus {
  kind: DecorationBonusKind
  /** Fractional strength, e.g. 0.35 = 35% less algae / 30% more coins. */
  amount: number
  /** Short badge text for the shop and decorate palette. */
  label: string
}

export interface DecorationDefinition {
  id: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  rarity: Rarity
  styleTags: StyleTag[]
  footprintRadius: number
  /** Rough height, so fish know to swim around/over it. */
  height: number
  bonus?: DecorationBonus
}

export type CreatureKind = 'fish' | 'jellyfish' | 'seahorse' | 'axolotl' | 'snail' | 'shrimp' | 'octopus' | 'ray' | 'turtle'
export type FishZone = 'top' | 'middle' | 'bottom' | 'any'
export type FinStyle = 'forked' | 'fan' | 'veil' | 'sword' | 'shark' | 'round' | 'lunate'
export type PatternType =
  | 'solid'
  | 'bands'
  | 'stripe'
  | 'spots'
  | 'gradient'
  | 'calico'
  | 'neon'
  | 'tiger'
  | 'scales'
export type FishFeature = 'spines' | 'spikes' | 'whiskers' | 'longFins' | 'beak' | 'hump' | 'bigEyes' | 'pointyNose'

export interface FishDefinition {
  id: string
  name: string
  description: string
  cost: number
  unlockLevel: number
  rarity: Rarity
  kind: CreatureKind
  color: string
  color2: string
  color3?: string
  pattern: PatternType
  finStyle: FinStyle
  features?: FishFeature[]
  bodyLength: number
  bodyHeight: number
  /** Individual adult visual size multiplier and clutch size bounds for this species. */
  sizeRange: [number, number]
  eggCountRange: [number, number]
  /** Side-to-side thickness as a fraction of height (default ~0.6). */
  bodyWidth?: number
  maxSpeed: number
  turnSpeed: number
  zone: FishZone
  schooling?: boolean
  /** Neon/bioluminescent accents that glow at night. */
  glow?: boolean
  coinValue: number
  /** Hunger rate multiplier (1 = normal). */
  appetite: number
}

export interface DecorationInstance {
  id: string
  defId: string
  position: [number, number, number]
  rotationY: number
}

export type MorphId = 'golden' | 'pearl' | 'midnight' | 'aurora'

export interface FishInheritance {
  bodyParentName: string
  colorParentName: string
  bodyParentId: string
  colorParentId: string
  /** The inherited palette (a morph, if any, is worn on top of it). */
  color: string
  color2: string
  color3?: string
  /** Hatched as a rare colour morph. */
  morph?: MorphId
}

/** What the player has already looked at, so the "new" badges know what's new. */
export interface SeenMarkers {
  /** Level the shop was last browsed at; anything unlocked after it is new. */
  shopLevel: number
  /** When the nursery was last visited; babies hatched after it are new. */
  nurseryAt: number
}

export interface FishpediaEntry {
  /** When the species first joined one of your tanks. */
  discoveredAt: number
  /** Raised from an egg in the nursery at least once. */
  bred?: boolean
  /** Rare colour morphs of this species you've hatched. */
  morphs?: MorphId[]
}

export interface FishInstance {
  id: string
  defId: string
  name: string
  bornAt: number
  habitat: 'main' | 'nursery'
  /** Sampled once on arrival or hatching, then kept as this fish grows. */
  sizeScale: number
  inheritance?: FishInheritance
}

export interface NurserySession {
  parentIds: [string, string]
  remainingSeconds: number
  /** Sampled at pairing and reserved until the round completes. */
  eggCount: number
}

export interface NurseryEgg {
  id: string
  defId: string
  remainingSeconds: number
  hatchSeconds: number
  createdAt: number
  inheritance?: FishInheritance
}

export interface FishVitals {
  /** 0 = stuffed, 1 = starving. */
  hunger: number
  /** 0..1, grows with meals; makes the fish bigger and more valuable. */
  growth: number
  mealsEaten: number
}

export interface WasteItem {
  id: string
  x: number
  z: number
  size: number
  kind: 'poop' | 'food'
}

export interface GameStats {
  foodEaten: number
  treatsGiven: number
  algaeScrubbed: number
  wasteVacuumed: number
  waterChanges: number
  coinsCollected: number
  fishBought: number
  /** Coin bubbles tapped (not ones that floated away). */
  bubblesPopped: number
  photos: number
  decorPlaced: number
  /** Taps on fish to say hi. */
  fishGreeted: number
  friendships: number
  hatched: number
  relaxSeconds: number
  /** Visitors that came by (counting repeat visits). */
  visits: number
  giftsOpened: number
}

export interface GameSettings {
  sound: boolean
  music: boolean
}

export interface GameState {
  aquariumName: string
  currency: number
  xp: number
  lastTickTimestamp: number
  ownedFish: FishInstance[]
  fishVitals: Record<string, FishVitals>
  nurserySession: NurserySession | null
  nurseryEggs: NurseryEgg[]
  unlockedDecorationDefIds: string[]
  placedDecorations: DecorationInstance[]
  backgroundId: string
  unlockedBackgroundIds: string[]
  substrateId: string
  unlockedSubstrateIds: string[]
  /** Cabinet the tank sits on. */
  standId: string
  unlockedStandIds: string[]
  /** Cleaning tools bought from the shop (the starter sponge and vacuum are always owned). */
  ownedToolIds: string[]
  equippedGlassTool: string
  equippedGravelTool: string
  treats: Record<string, number>
  /** 0 = crystal clear, 1 = swamp. */
  murk: number
  waste: WasteItem[]
  stats: GameStats
  settings: GameSettings
  /** Collection book: every species (and morph) that has ever lived in your tanks. */
  fishpedia: Record<string, FishpediaEntry>
  seen: SeenMarkers
  daily: DailyWishes
  /** Trophy id → when it was earned (ms). */
  trophies: Record<string, number>
  /** Visitors you've met, and how often they came. */
  visitors: VisitorLog
  /** Gifts visitors left on the gravel, waiting to be opened. */
  gifts: VisitorGift[]
}
