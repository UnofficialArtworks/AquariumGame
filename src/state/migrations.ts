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

export const CURRENT_SAVE_VERSION = 5

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
    },
    settings: { sound: true },
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
      return { ...f, defId, habitat: f.habitat === 'nursery' ? 'nursery' as const : 'main' as const,
        sizeScale: Number.isFinite(f.sizeScale) && f.sizeScale >= min && f.sizeScale <= max ? f.sizeScale : 1 }
    })
    .filter((f) => getFishDef(f.defId))
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
    .map((egg) => ({ ...egg, defId: resolveFishId(egg.defId), remainingSeconds: Math.max(0, Math.min(egg.hatchSeconds, egg.remainingSeconds)) }))
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
