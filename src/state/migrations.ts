import type { DecorationInstance, FishInstance, FishVitals, GameState } from './types'
import { getDecorationDef, STARTER_DECORATION_IDS } from '../scene/decorations/decorationDefinitions'
import { getFishDef, resolveFishId, sampleFishSize, STARTER_FISH_IDS } from '../scene/fish/fishDefinitions'
import { DEFAULT_BACKGROUND_ID, getBackgroundDef } from '../scene/backgrounds'
import { DEFAULT_SUBSTRATE_ID } from '../scene/substrates'
import { STARTER_TREATS } from '../scene/food/foodDefinitions'
import { DEFAULT_STAND_ID, STAND_CATALOG } from '../scene/stands/standDefinitions'
import { DEFAULT_GLASS_TOOL, DEFAULT_GRAVEL_TOOL, getToolDef, STARTER_TOOL_IDS } from '../scene/cleaning/toolDefinitions'
import { pickFishName } from './names'
import { NURSERY_CAPACITY } from './economy'
import { recordFish, sanitizeFishpedia, type Fishpedia } from './fishpedia'
import { getMorph } from './morphs'
import { levelFromXp } from './progression'
import { NO_WISHES, type DailyWishes } from './goals'
import { getVisitor, MAX_GIFTS, type VisitorGift, type VisitorLog } from './visitors'
import { MAX_OCEAN_FISH, type OceanFish } from './ocean'
import { isPattern } from './patterns'

export const CURRENT_SAVE_VERSION = 6

/** Make sure every fish you own (and its morph / nursery stamp) is in the book. */
function backfillFishpedia(book: Fishpedia, ownedFish: FishInstance[]): Fishpedia {
  const hatched = ownedFish.filter((f) => f.inheritance)
  const bought = ownedFish.filter((f) => !f.inheritance)
  return recordFish(recordFish(book, bought, false).book, hatched, true).book
}

function sanitizeInheritance<T extends { inheritance?: FishInstance['inheritance'] }>(item: T): T {
  const inheritance = item.inheritance
  if (!inheritance) return item
  const { morph, pattern, ...rest } = inheritance
  return { ...item, inheritance: { ...rest, ...(getMorph(morph) ? { morph } : {}), ...(isPattern(pattern) ? { pattern } : {}) } }
}

export function freshVitals(hunger = 0.5): FishVitals {
  return { hunger, growth: 0.1, mealsEaten: 0 }
}

function nameFishes(entries: Array<{ id: string; defId: string; name?: string }>, now: number): FishInstance[] {
  const taken: string[] = []
  return entries.map((f) => {
    const name = f.name ?? pickFishName(taken)
    taken.push(name)
    return { id: f.id, defId: resolveFishId(f.defId), name, bornAt: now,
      habitat: 'main' as const, sizeScale: sampleFishSize(f.defId) }
  })
}

export function createInitialState(): GameState {
  const now = Date.now()
  const ownedFish = nameFishes(
    STARTER_FISH_IDS.map((defId, i) => ({ id: `starter-fish-${i}`, defId })),
    now,
  )
  const placedDecorations: DecorationInstance[] = [
    { id: 'starter-deco-0', defId: 'rock-cluster', position: [-2.4, 0, -0.7], rotationY: 0.4 },
    { id: 'starter-deco-1', defId: 'driftwood', position: [1.9, 0, -0.9], rotationY: 0.6 },
    { id: 'starter-deco-2', defId: 'green-plant', position: [-0.9, 0, -1.15], rotationY: 0 },
    { id: 'starter-deco-3', defId: 'green-plant', position: [3.1, 0, 0.2], rotationY: 1.4 },
    { id: 'starter-deco-4', defId: 'air-stone', position: [0.4, 0, 0.1], rotationY: 0 },
  ]
  return {
    aquariumName: 'My Aquarium',
    currency: 120,
    xp: 0,
    lastTickTimestamp: now,
    ownedFish,
    // Starter fish arrive peckish so there's something to do right away.
    fishVitals: Object.fromEntries(ownedFish.map((f) => [f.id, freshVitals(0.55)])),
    nurserySession: null,
    nurseryEggs: [],
    unlockedDecorationDefIds: [...STARTER_DECORATION_IDS],
    placedDecorations,
    backgroundId: DEFAULT_BACKGROUND_ID,
    unlockedBackgroundIds: [DEFAULT_BACKGROUND_ID],
    substrateId: DEFAULT_SUBSTRATE_ID,
    unlockedSubstrateIds: [DEFAULT_SUBSTRATE_ID],
    standId: DEFAULT_STAND_ID,
    unlockedStandIds: [DEFAULT_STAND_ID],
    ownedToolIds: [...STARTER_TOOL_IDS],
    equippedGlassTool: DEFAULT_GLASS_TOOL,
    equippedGravelTool: DEFAULT_GRAVEL_TOOL,
    treats: { ...STARTER_TREATS },
    murk: 0.06,
    waste: [],
    stats: {
      foodEaten: 0,
      treatsGiven: 0,
      algaeScrubbed: 0,
      wasteVacuumed: 0,
      waterChanges: 0,
      coinsCollected: 0,
      fishBought: 0,
      bubblesPopped: 0,
      photos: 0,
      decorPlaced: 0,
      fishGreeted: 0,
      friendships: 0,
      hatched: 0,
      relaxSeconds: 0,
      visits: 0,
      giftsOpened: 0,
      released: 0,
    },
    settings: { sound: true, music: true },
    fishpedia: backfillFishpedia({}, ownedFish),
    seen: { shopLevel: 1, nurseryAt: now },
    daily: NO_WISHES,
    trophies: {},
    visitors: {},
    gifts: [],
    ocean: [],
    seasonSeen: '',
  }
}

interface SaveV1 {
  currency?: number
  lastTickTimestamp?: number
  ownedFish?: Array<{ id: string; defId: string }>
  unlockedDecorationDefIds?: string[]
  placedDecorations?: DecorationInstance[]
  backgroundId?: string
}

function upgradeV1ToV2(old: SaveV1): GameState {
  const base = createInitialState()
  const now = Date.now()
  const ownedFish = nameFishes(
    (old.ownedFish ?? []).filter((f) => getFishDef(f.defId)),
    now,
  )
  const unlocked = new Set([...(old.unlockedDecorationDefIds ?? []), ...STARTER_DECORATION_IDS])
  const backgroundId = getBackgroundDef(old.backgroundId ?? DEFAULT_BACKGROUND_ID).id
  return {
    ...base,
    currency: Math.max(0, Math.floor(old.currency ?? base.currency)),
    lastTickTimestamp: old.lastTickTimestamp ?? now,
    ownedFish: ownedFish.length > 0 ? ownedFish : base.ownedFish,
    fishVitals: Object.fromEntries(
      (ownedFish.length > 0 ? ownedFish : base.ownedFish).map((f) => [f.id, freshVitals(0.5)]),
    ),
    unlockedDecorationDefIds: [...unlocked].filter((id) => getDecorationDef(id)),
    placedDecorations: (old.placedDecorations ?? []).filter((d) => getDecorationDef(d.defId)),
    backgroundId,
    unlockedBackgroundIds: [...new Set([DEFAULT_BACKGROUND_ID, backgroundId])],
  }
}

/** Fill anything missing (e.g. from a partially-written save) with defaults. */
export function sanitize(state: Partial<GameState>): GameState {
  const base = createInitialState()
  const merged: GameState = {
    ...base,
    ...state,
    stats: { ...base.stats, ...(state.stats ?? {}) },
    settings: { ...base.settings, ...(state.settings ?? {}) },
    treats: { ...(state.treats ?? base.treats) },
  }
  merged.aquariumName = typeof state.aquariumName === 'string' && state.aquariumName.trim()
    ? state.aquariumName.trim().slice(0, 28)
    : base.aquariumName
  merged.ownedFish = merged.ownedFish
    .map((f) => {
      const defId = resolveFishId(f.defId)
      const [min, max] = getFishDef(defId)?.sizeRange ?? [1, 1]
      return sanitizeInheritance({ ...f, defId, habitat: f.habitat === 'nursery' ? 'nursery' as const : 'main' as const,
        sizeScale: Number.isFinite(f.sizeScale) && f.sizeScale >= min && f.sizeScale <= max ? f.sizeScale : 1 })
    })
    .filter((f) => getFishDef(f.defId))
  merged.fishpedia = backfillFishpedia(sanitizeFishpedia(state.fishpedia), merged.ownedFish)
  // Saves from before the "new" badges count everything so far as seen,
  // rather than flagging the whole shop as new.
  const level = levelFromXp(merged.xp).level
  const seen = state.seen
  merged.seen = {
    shopLevel: Number.isFinite(seen?.shopLevel) ? Math.max(1, Math.min(level, seen!.shopLevel)) : level,
    nurseryAt: Number.isFinite(seen?.nurseryAt) ? seen!.nurseryAt : Date.now(),
  }
  merged.daily = sanitizeDaily(state.daily, merged.stats)
  merged.trophies = Object.fromEntries(
    Object.entries(state.trophies && typeof state.trophies === 'object' ? state.trophies : {}).filter(([, at]) => Number.isFinite(at)),
  )
  merged.visitors = sanitizeVisitors(state.visitors)
  merged.gifts = sanitizeGifts(state.gifts)
  merged.ocean = sanitizeOcean(state.ocean)
  merged.seasonSeen = typeof state.seasonSeen === 'string' ? state.seasonSeen.slice(0, 40) : ''
  for (const f of merged.ownedFish) {
    if (!merged.fishVitals[f.id]) merged.fishVitals = { ...merged.fishVitals, [f.id]: freshVitals(0.4) }
  }
  merged.placedDecorations = merged.placedDecorations.filter((d) => getDecorationDef(d.defId))
  const standIds = new Set(STAND_CATALOG.map((s) => s.id as string))
  merged.unlockedStandIds = [...new Set([DEFAULT_STAND_ID, ...(Array.isArray(state.unlockedStandIds) ? state.unlockedStandIds : [])])]
    .filter((id) => standIds.has(id))
  if (!merged.unlockedStandIds.includes(merged.standId)) merged.standId = DEFAULT_STAND_ID
  merged.ownedToolIds = [...new Set([...STARTER_TOOL_IDS, ...(Array.isArray(state.ownedToolIds) ? state.ownedToolIds : [])])]
    .filter((id) => getToolDef(id))
  const owns = (id: unknown, category: 'glass' | 'gravel') =>
    typeof id === 'string' && merged.ownedToolIds.includes(id) && getToolDef(id)?.category === category
  if (!owns(merged.equippedGlassTool, 'glass')) merged.equippedGlassTool = DEFAULT_GLASS_TOOL
  if (!owns(merged.equippedGravelTool, 'gravel')) merged.equippedGravelTool = DEFAULT_GRAVEL_TOOL
  const occupiedNursery = merged.ownedFish.filter((f) => f.habitat === 'nursery').length
  const eggIds = new Set<string>()
  merged.nurseryEggs = (Array.isArray(state.nurseryEggs) ? state.nurseryEggs : [])
    .filter((egg) => {
      if (!egg || typeof egg.id !== 'string' || eggIds.has(egg.id)
        || !getFishDef(egg.defId) || !Number.isFinite(egg.hatchSeconds) || egg.hatchSeconds <= 0
        || !Number.isFinite(egg.remainingSeconds) || !Number.isFinite(egg.createdAt)) return false
      eggIds.add(egg.id)
      return true
    })
    .slice(0, Math.max(0, NURSERY_CAPACITY - occupiedNursery))
    .map((egg) => sanitizeInheritance({ ...egg, defId: resolveFishId(egg.defId), remainingSeconds: Math.max(0, Math.min(egg.hatchSeconds, egg.remainingSeconds)) }))
  const session = state.nurserySession
  const parents = session?.parentIds
  const eggCount = Number.isInteger(session?.eggCount) && session!.eggCount >= 1 && session!.eggCount <= 6
    ? session!.eggCount : 1
  merged.nurserySession = session && parents?.length === 2 && parents[0] !== parents[1]
    && parents.every((id) => merged.ownedFish.some((f) => f.id === id && f.habitat === 'nursery' && merged.fishVitals[id]?.growth >= 1))
    && Number.isFinite(session.remainingSeconds)
    && occupiedNursery + merged.nurseryEggs.length + eggCount <= NURSERY_CAPACITY
    ? { parentIds: [parents[0], parents[1]], remainingSeconds: Math.max(0, session.remainingSeconds), eggCount }
    : null
  return merged
}

/**
 * Bumping CURRENT_SAVE_VERSION and adding a step here lets old saves upgrade
 * to new shapes instead of silently breaking. Anything unexpected falls back
 * to a fresh save rather than throwing.
 */
export function migrate(persistedState: unknown, fromVersion: number): GameState {
  try {
    let state = persistedState as Partial<GameState>
    if (fromVersion < 2) state = upgradeV1ToV2(persistedState as SaveV1)
    return sanitize(state)
  } catch (error) {
    console.warn('Save migration failed, starting a fresh save.', error)
    return createInitialState()
  }
}

/** Keep today's wishes if they look right; anything odd just means new wishes get rolled. */
function sanitizeDaily(raw: unknown, stats: GameState['stats']): DailyWishes {
  const d = raw as Partial<DailyWishes> | undefined
  if (!d || typeof d.day !== 'string' || !Array.isArray(d.wishes)) return NO_WISHES
  const wishes = d.wishes.filter(
    (w) => w && typeof w.id === 'string' && w.stat in stats && Number.isFinite(w.target) && w.target > 0 && Number.isFinite(w.base),
  )
  return { day: d.day, wishes: wishes.map((w) => ({ ...w, claimed: Boolean(w.claimed) })), bonusClaimed: Boolean(d.bonusClaimed) }
}

function sanitizeVisitors(raw: unknown): VisitorLog {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as VisitorLog)
      .filter(([id, r]) => getVisitor(id) && r && Number.isFinite(r.visits) && r.visits > 0 && Number.isFinite(r.first))
      .map(([id, r]) => [id, { visits: Math.floor(r.visits), first: r.first }]),
  )
}

function sanitizeGifts(raw: unknown): VisitorGift[] {
  if (!Array.isArray(raw)) return []
  return (raw as VisitorGift[])
    .filter(
      (g) =>
        g && typeof g.id === 'string' && getVisitor(g.visitorId) && [g.x, g.z, g.coins, g.xp, g.at].every(Number.isFinite) && g.coins >= 0 && g.xp >= 0,
    )
    .slice(-MAX_GIFTS)
}

function sanitizeOcean(raw: unknown): OceanFish[] {
  if (!Array.isArray(raw)) return []
  return (raw as OceanFish[])
    .filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && getFishDef(f.defId) && Number.isFinite(f.at))
    .map((f) => ({ id: f.id, defId: f.defId, name: f.name.slice(0, 18), at: f.at, ...(getMorph(f.morph) ? { morph: f.morph } : {}), ...(isPattern(f.pattern) ? { pattern: f.pattern } : {}) }))
    .slice(-MAX_OCEAN_FISH)
}
