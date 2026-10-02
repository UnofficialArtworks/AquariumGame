import { getSeason, inSeason, type SeasonId } from './seasons'
import type { GameState, Habitat } from './types'
import { levelFromXp } from './progression'
import { NURSERY_CAPACITY } from './economy'
import { getEggCountRange } from './nursery'
import { FISH_CATALOG, getFishDef, MAX_OWNED_FISH } from '../scene/fish/fishDefinitions'
import { DECORATION_CATALOG, getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { FOOD_CATALOG, getFoodDef } from '../scene/food/foodDefinitions'
import { BACKGROUND_CATALOG, getBackgroundDef } from '../scene/backgrounds'
import { SUBSTRATE_CATALOG, getSubstrateDef } from '../scene/substrates'
import { STAND_CATALOG, getStandDef } from '../scene/stands/standDefinitions'
import { getToolDef, TOOL_CATALOG } from '../scene/cleaning/toolDefinitions'

/*
 * What the player may do, and in plain words why not. The store enforces
 * these and the UI uses the same checks to explain a greyed-out button, so
 * the two can never disagree.
 */

// --- shop -------------------------------------------------------------------------

/** Shop categories, one per Shop drawer tab. */
export type ShopCategory = 'fish' | 'decorations' | 'treats' | 'tools' | 'backgrounds' | 'gravel' | 'stands'

export const SHOP_CATEGORIES: ShopCategory[] = ['fish', 'decorations', 'treats', 'tools', 'backgrounds', 'gravel', 'stands']

export type PurchaseState = Pick<
  GameState,
  'xp' | 'currency' | 'ownedFish' | 'unlockedDecorationDefIds' | 'unlockedBackgroundIds' | 'unlockedSubstrateIds' | 'unlockedStandIds' | 'ownedToolIds'
>

/** Why something can't be bought: not sold, level too low, already yours, no room, or too few coins. */
export type PurchaseBlock = 'missing' | 'locked' | 'owned' | 'full' | 'short' | 'season'

export interface PurchaseCheck {
  ok: boolean
  reason?: PurchaseBlock
  cost: number
  unlockLevel: number
  /** Seasonal items: the season they're sold in. */
  season?: SeasonId
  pond?: boolean
}

interface ShopEntry {
  cost: number
  unlockLevel: number
  owned: boolean
  full?: boolean
  /** A pond fish, so being full means the pond is full. */
  pond?: boolean
  season?: SeasonId
}

/** Fish living in the main aquarium (nursery and pond fish don't count toward its limit). */
export function mainTankCount(ownedFish: GameState['ownedFish']): number {
  return ownedFish.filter((f) => (f.habitat ?? 'main') === 'main').length
}

/** The Koi Pond opens at this level and holds this many fish. */
export const POND_LEVEL = 20
export const POND_CAPACITY = 15

export function pondCount(ownedFish: GameState['ownedFish']): number {
  return ownedFish.filter((f) => f.habitat === 'pond').length
}

const TANK_NAMES: Record<Habitat, string> = { main: 'your aquarium', nursery: 'the nursery', pond: 'the Koi Pond' }

export function tankName(tank: Habitat): string {
  return TANK_NAMES[tank]
}

/** Short labels for buttons. */
export const TANK_LABELS: Record<Habitat, { icon: string; label: string }> = {
  main: { icon: '🐠', label: 'Aquarium' },
  nursery: { icon: '🫧', label: 'Nursery' },
  pond: { icon: '🪷', label: 'Koi Pond' },
}

type Movable = Pick<GameState['ownedFish'][number], 'defId' | 'habitat'>

/** Tanks this fish could move to (the pond once it's open; pond fish never go to the aquarium). */
export function moveTargets(s: Pick<GameState, 'xp'>, fish: Movable): Habitat[] {
  const pondOpen = levelFromXp(s.xp).level >= POND_LEVEL
  const pondFish = Boolean(getFishDef(fish.defId)?.pond)
  return (['main', 'nursery', 'pond'] as Habitat[]).filter(
    (t) => t !== fish.habitat && !(t === 'pond' && !pondOpen) && !(t === 'main' && pondFish),
  )
}

/** The one-tap move from the fish list: to the nursery, or back home from it. */
export function quickMove(s: Pick<GameState, 'xp'>, fish: Movable): Habitat {
  if (fish.habitat !== 'nursery') return 'nursery'
  return moveTargets(s, fish).find((t) => t !== 'nursery') ?? 'main'
}

function shopEntry(s: PurchaseState, category: ShopCategory, id: string): ShopEntry | null {
  switch (category) {
    case 'fish': {
      const def = getFishDef(id)
      // Pond fish arrive in the pond, so it's the pond that must have room.
      const full = def?.pond ? pondCount(s.ownedFish) >= POND_CAPACITY : mainTankCount(s.ownedFish) >= MAX_OWNED_FISH
      return def ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: false, full, pond: def.pond } : null
    }
    case 'decorations': {
      const def = getDecorationDef(id)
      return def ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: s.unlockedDecorationDefIds.includes(id), season: def.season } : null
    }
    case 'treats': {
      // Staple foods are free and never sold.
      const def = getFoodDef(id)
      return def.id === id && !def.unlimited ? { cost: def.packCost, unlockLevel: def.unlockLevel, owned: false } : null
    }
    case 'tools': {
      const def = getToolDef(id)
      return def ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: s.ownedToolIds.includes(id) } : null
    }
    case 'backgrounds': {
      const def = getBackgroundDef(id)
      return def.id === id ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: s.unlockedBackgroundIds.includes(id) } : null
    }
    case 'gravel': {
      const def = getSubstrateDef(id)
      return def.id === id ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: s.unlockedSubstrateIds.includes(id) } : null
    }
    case 'stands': {
      const def = getStandDef(id)
      return def.id === id ? { cost: def.cost, unlockLevel: def.unlockLevel, owned: s.unlockedStandIds.includes(id) } : null
    }
  }
}

export function checkPurchase(s: PurchaseState, category: ShopCategory, id: string): PurchaseCheck {
  const entry = shopEntry(s, category, id)
  if (!entry) return { ok: false, reason: 'missing', cost: 0, unlockLevel: 0 }
  const reason: PurchaseBlock | undefined =
    levelFromXp(s.xp).level < entry.unlockLevel ? 'locked'
    : entry.owned ? 'owned'
    : !inSeason(entry.season) ? 'season'
    : entry.full ? 'full'
    : s.currency < entry.cost ? 'short'
    : undefined
  return { ok: !reason, reason, cost: entry.cost, unlockLevel: entry.unlockLevel, season: entry.season, pond: entry.pond }
}

/** XP for buying something: a little for everything, more for big purchases. */
export function purchaseXp(cost: number): number {
  return Math.max(3, Math.round(cost / 20))
}

/** Why `name` can't be bought, for a player tapping a greyed-out button. */
export function purchaseProblem(check: PurchaseCheck, name: string, currency: number): string | null {
  switch (check.reason) {
    case 'locked':
      return `${name} unlocks at level ${check.unlockLevel}.`
    case 'short':
      return `${name} costs ${check.cost.toLocaleString()} coins. You need ${Math.ceil(check.cost - currency).toLocaleString()} more.`
    case 'full':
      return check.pond
        ? `The Koi Pond is full (${POND_CAPACITY}/${POND_CAPACITY}). Move a pond fish to the nursery or say goodbye to one to make room.`
        : `Your aquarium is full (${MAX_OWNED_FISH}/${MAX_OWNED_FISH}). Move a fish to the nursery or sell one to make room.`
    case 'owned':
      return `You already have ${name}.`
    case 'season': {
      const season = getSeason(check.season)
      return season ? `${name} comes back for ${season.name} (${season.when}).` : `${name} isn't for sale right now.`
    }
    case 'missing':
      return `${name} isn't for sale.`
    default:
      return null
  }
}

/** Everything sold in a category, with the level it unlocks at. */
function shopCatalog(category: ShopCategory): ReadonlyArray<{ id: string; unlockLevel: number }> {
  switch (category) {
    case 'fish':
      return FISH_CATALOG
    case 'decorations':
      return DECORATION_CATALOG
    case 'treats':
      return FOOD_CATALOG.filter((d) => !d.unlimited)
    case 'tools':
      return TOOL_CATALOG
    case 'backgrounds':
      return BACKGROUND_CATALOG
    case 'gravel':
      return SUBSTRATE_CATALOG
    case 'stands':
      return STAND_CATALOG
  }
}

/** Is this item new in the shop since the player last looked (at `seenLevel`)? */
export function isNewInShop(unlockLevel: number, seenLevel: number, level: number): boolean {
  return unlockLevel > seenLevel && unlockLevel <= level
}

/** Items unlocked in a category since the player last looked in the shop. */
export function newShopItems(category: ShopCategory, seenLevel: number, level: number): string[] {
  return shopCatalog(category).filter((d) => isNewInShop(d.unlockLevel, seenLevel, level)).map((d) => d.id)
}

/** How many items across the whole shop are new since the player last looked. */
export function newShopCount(seenLevel: number, level: number): number {
  return SHOP_CATEGORIES.reduce((n, category) => n + newShopItems(category, seenLevel, level).length, 0)
}

/** The first shop tab with something new in it, if any. */
export function firstNewShopCategory(seenLevel: number, level: number): ShopCategory | undefined {
  return SHOP_CATEGORIES.find((category) => newShopItems(category, seenLevel, level).length > 0)
}

// --- the two tanks ----------------------------------------------------------------

type TankState = Pick<GameState, 'ownedFish' | 'nurseryEggs' | 'nurserySession'> & Partial<Pick<GameState, 'xp'>>

/** Nursery spots in use: little fish, eggs, and a clutch a friendship has reserved. */
export function nurseryOccupancy(s: TankState): number {
  return s.ownedFish.filter((f) => f.habitat === 'nursery').length + s.nurseryEggs.length + (s.nurserySession?.eggCount ?? 0)
}

/** Why a fish can't move to another tank, or null if it can. */
export function transferProblem(s: TankState, fishId: string, destination: Habitat): string | null {
  const fish = s.ownedFish.find((f) => f.id === fishId)
  if (!fish) return 'That fish is no longer here.'
  if (destination !== 'main' && destination !== 'nursery' && destination !== 'pond') return 'There is no tank like that.'
  if (fish.habitat === destination) return `${fish.name} is already there.`
  if (destination === 'pond') {
    if (levelFromXp(s.xp ?? 0).level < POND_LEVEL) return `The Koi Pond opens at level ${POND_LEVEL}.`
    if (pondCount(s.ownedFish) >= POND_CAPACITY) return `The Koi Pond is full (${POND_CAPACITY}/${POND_CAPACITY}).`
    return null
  }
  if (destination === 'main' && getFishDef(fish.defId)?.pond) return `${fish.name} is a pond fish and needs the open space of the Koi Pond.`
  if (destination === 'nursery') {
    const used = nurseryOccupancy(s)
    if (used >= NURSERY_CAPACITY) {
      const eggs = s.nurseryEggs.length + (s.nurserySession?.eggCount ?? 0)
      return `The nursery is full (${used}/${NURSERY_CAPACITY}).${eggs ? ' Eggs keep their spot until they hatch.' : ' Move a little fish to your aquarium first.'}`
    }
  } else if (mainTankCount(s.ownedFish) >= MAX_OWNED_FISH) {
    return `Your aquarium is full (${MAX_OWNED_FISH}/${MAX_OWNED_FISH}). Sell a fish to make room.`
  }
  return null
}

type FriendshipState = TankState & Pick<GameState, 'fishVitals'>

/** Why two fish can't become friends right now, or null if they can. */
export function friendshipProblem(s: FriendshipState, firstId: string, secondId: string): string | null {
  if (s.nurserySession) return 'A friendship visit is already under way.'
  if (!firstId || !secondId) return 'Pick two grown fish to pair.'
  if (firstId === secondId) return 'Pick two different fish.'
  for (const id of [firstId, secondId]) {
    const fish = s.ownedFish.find((f) => f.id === id)
    if (!fish) return 'That fish is no longer here.'
    if (fish.habitat !== 'nursery') return `${fish.name} needs to be in the nursery first.`
    const growth = s.fishVitals[id]?.growth ?? 0
    if (growth < 1) return `${fish.name} needs to finish growing first (${Math.floor(growth * 100)}% grown).`
  }
  const first = s.ownedFish.find((f) => f.id === firstId)!
  const clutch = getEggCountRange(first.defId)[1]
  const free = NURSERY_CAPACITY - nurseryOccupancy(s)
  if (clutch > free) {
    return `${first.name}'s clutch needs ${clutch} free spots and the nursery has ${Math.max(0, free)}. Move some little fish to your aquarium first.`
  }
  return null
}

/** Two grown nursery fish could start a friendship right now. */
export function friendshipReady(s: FriendshipState): boolean {
  if (s.nurserySession) return false
  const grown = s.ownedFish.filter((f) => f.habitat === 'nursery' && (s.fishVitals[f.id]?.growth ?? 0) >= 1)
  if (grown.length < 2) return false
  const free = NURSERY_CAPACITY - nurseryOccupancy(s)
  // Whoever is picked first sets the clutch size, so one that fits is enough.
  return grown.some((f) => getEggCountRange(f.defId)[1] <= free)
}

/** Babies that hatched since the player last looked in the nursery. */
export function newHatchlings(s: Pick<GameState, 'ownedFish' | 'seen'>): number {
  return s.ownedFish.filter((f) => f.habitat === 'nursery' && f.inheritance && f.bornAt > s.seen.nurseryAt).length
}
