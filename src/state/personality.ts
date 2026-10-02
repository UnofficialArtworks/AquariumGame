// Every fish has a personality: one trait that shapes how it swims, a
// favourite decoration it likes to hang around, and a favourite treat. It's
// worked out from the fish's id, so it never changes and needs no saving.
// Schooling fish are happier in a group of five or more.
import type { DecorationInstance, FishDefinition, FishInstance, Rarity } from './types'
import { DECORATION_CATALOG } from '../scene/decorations/decorationDefinitions'
import { FOOD_CATALOG } from '../scene/food/foodDefinitions'
import { getFishDef, isCleanupCrew } from '../scene/fish/fishDefinitions'
import { hashString, mulberry32 } from '../utils/rng'

export type TraitId = 'shy' | 'playful' | 'greedy' | 'curious' | 'showoff'

export const TRAITS: Record<TraitId, { name: string; icon: string; text: string }> = {
  shy: { name: 'Shy', icon: '🙈', text: 'Likes to tuck in by plants and castles, but never misses dinner.' },
  playful: { name: 'Playful', icon: '🎈', text: 'Loves to zip up and down through bubble streams.' },
  greedy: { name: 'Greedy', icon: '😋', text: 'Always first to the food. Every single time.' },
  curious: { name: 'Curious', icon: '🔍', text: 'Swims right up to the glass to see what you are up to.' },
  showoff: { name: 'Show-off', icon: '✨', text: 'Likes the front of the tank, where everyone can see.' },
}
const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]

export interface Personality {
  trait: TraitId
  /** A decoration this fish loves to visit. */
  favoriteDecor: string
  favoriteTreat: string
}

/** Favourites are things a player can actually get: no gadgets, nothing epic or legendary. */
const FAVORITE_RARITIES: Rarity[] = ['common', 'uncommon', 'rare']
const FAVORITE_DECOR = DECORATION_CATALOG.filter((d) => !d.bonus && !d.season && FAVORITE_RARITIES.includes(d.rarity)).map((d) => d.id)
const TREATS = FOOD_CATALOG.filter((f) => !f.unlimited).map((f) => f.id)

const cache = new Map<string, Personality>()

export function personalityOf(fishId: string): Personality {
  let p = cache.get(fishId)
  if (!p) {
    const rand = mulberry32(hashString(`${fishId}:personality`))
    p = {
      trait: TRAIT_IDS[Math.floor(rand() * TRAIT_IDS.length)],
      favoriteDecor: FAVORITE_DECOR[Math.floor(rand() * FAVORITE_DECOR.length)],
      favoriteTreat: TREATS[Math.floor(rand() * TREATS.length)],
    }
    cache.set(fishId, p)
  }
  return p
}

/** Snails and shrimp just get on with cleaning; personalities are for swimmers. */
export function hasPersonality(def: FishDefinition | undefined): boolean {
  return Boolean(def && !isCleanupCrew(def))
}

export const SCHOOL_SIZE = 5
export const SCHOOL_COIN_BONUS = 0.15
export const FAVORITE_COIN_BONUS = 0.1

/** How many of this schooling species share the main tank (null for loners). */
export function schoolSize(fish: FishInstance, owned: FishInstance[]): number | null {
  if (!getFishDef(fish.defId)?.schooling) return null
  return owned.filter((f) => f.habitat === fish.habitat && f.defId === fish.defId).length
}

export function hasFavorite(fishId: string, placed: DecorationInstance[]): boolean {
  const fav = personalityOf(fishId).favoriteDecor
  return placed.some((d) => d.defId === fav)
}

let moodKey: [FishInstance[], DecorationInstance[]] | null = null
let moodCache = new Map<string, number>()

/** Coin-bubble rate multiplier from being in a happy school and having its favourite decoration around. */
export function moodBonus(fishId: string, owned: FishInstance[], placed: DecorationInstance[]): number {
  if (!moodKey || moodKey[0] !== owned || moodKey[1] !== placed) {
    moodKey = [owned, placed]
    moodCache = new Map()
  }
  let bonus = moodCache.get(fishId)
  if (bonus === undefined) {
    const fish = owned.find((f) => f.id === fishId)
    const school = fish ? schoolSize(fish, owned) : null
    bonus = 1 + (school !== null && school >= SCHOOL_SIZE ? SCHOOL_COIN_BONUS : 0) + (fish && hasFavorite(fishId, placed) ? FAVORITE_COIN_BONUS : 0)
    moodCache.set(fishId, bonus)
  }
  return bonus
}

/** Petting: the first hello each hour makes a fish's day (hearts and a little coin). */
export const PET_COOLDOWN_MS = 60 * 60 * 1000
const lastPet = new Map<string, number>()

export function tryPet(fishId: string, now = Date.now()): boolean {
  const last = lastPet.get(fishId)
  if (last !== undefined && now - last < PET_COOLDOWN_MS) return false
  lastPet.set(fishId, now)
  return true
}
