import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DecorationInstance, FishVitals, GameSettings, GameState, NurseryEgg, WasteItem } from './types'
import { CURRENT_SAVE_VERSION, createInitialState, freshVitals, migrate, sanitize } from './migrations'
import {
  COIN_INTERVAL_MAX,
  COIN_INTERVAL_MIN,
  CLEANUP_GROWTH_PER_SECOND,
  coinValueFor,
  FRIENDSHIP_SECONDS,
  GROWTH_PER_MEAL,
  HUNGER_COIN_CUTOFF,
  HUNGER_PER_SECOND,
  MAX_OFFLINE_EARNING_SECONDS,
  MAX_OFFLINE_SIM_SECONDS,
  MAX_WASTE_ITEMS,
  MURK_BASE_PER_SECOND,
  MURK_PER_FISH_PER_SECOND,
  MURK_PER_WASTE_PER_SECOND,
  NURSERY_CAPACITY,
  OFFLINE_PASSIVE_PER_SECOND,
  PASSIVE_COINS_PER_SECOND,
  salePrice as calculateSalePrice,
} from './economy'
import { levelFromXp, levelUpCoinReward, MAX_LEVEL } from './progression'
import { pickFishName } from './names'
import { useUIStore } from './useUIStore'
import { DECORATION_CATALOG, getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { FISH_CATALOG, getFishDef, MAX_OWNED_FISH, sampleFishSize } from '../scene/fish/fishDefinitions'
import { BACKGROUND_CATALOG, getBackgroundDef } from '../scene/backgrounds'
import { SUBSTRATE_CATALOG, getSubstrateDef } from '../scene/substrates'
import { FOOD_CATALOG, getFoodDef } from '../scene/food/foodDefinitions'
import { clampToInterior } from '../scene/TankBounds'
import { algaeCoverage } from '../sim/algae'
import { createNurseryEgg, getEggCountRange, sampleEggCount } from './nursery'
import { bonusesFor } from './bonuses'
import { getStandDef } from '../scene/stands/standDefinitions'
import { getToolDef } from '../scene/cleaning/toolDefinitions'

/** Hunger the auto-feeder keeps fish under while the player is away. */
const AUTO_FEEDER_HUNGER_CAP = 0.45

interface GameActions {
  tick: () => void
  applyOfflineProgress: () => void
  grantXp: (amount: number) => void
  collectCoins: (amount: number, clicked: boolean) => void
  /** Spend one use of a food (treats are limited). Returns false if none left. */
  useFood: (foodId: string) => boolean
  fishAte: (fishId: string, foodId: string) => void
  buyDecoration: (defId: string) => boolean
  buyFish: (defId: string) => string | null
  buyTreatPack: (foodId: string) => boolean
  buyBackground: (id: string) => boolean
  buySubstrate: (id: string) => boolean
  setBackground: (id: string) => void
  setSubstrate: (id: string) => void
  buyStand: (id: string) => boolean
  setStand: (id: string) => void
  buyTool: (id: string) => boolean
  equipTool: (id: string) => void
  rehomeFish: (fishId: string) => number
  sellFish: (fishId: string) => number
  salePrice: (fishId: string) => number
  renameAquarium: (name: string) => void
  transferFish: (fishId: string, destination: 'main' | 'nursery') => boolean
  startFriendship: (firstId: string, secondId: string) => boolean
  renameFish: (fishId: string, name: string) => void
  addDecorationInstance: (defId: string) => void
  updateDecorationTransform: (id: string, position: [number, number, number], rotationY?: number) => void
  rotateDecoration: (id: string) => void
  removeDecoration: (id: string) => void
  addWaste: (x: number, z: number, kind: WasteItem['kind'], size?: number) => void
  removeWaste: (ids: string[]) => number
  /** Commit waste that a vacuum dragged across the gravel without sucking up. */
  relocateWaste: (moves: Array<{ id: string; x: number; z: number }>) => void
  rewardAlgaeScrub: (amount: number) => void
  waterChange: () => boolean
  setSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void
}

export type GameStore = GameState & GameActions

let passiveRemainder = 0
let scrubRemainder = 0

function addHunger(v: FishVitals, amount: number): FishVitals {
  return { ...v, hunger: Math.min(1, Math.max(0, v.hunger + amount)) }
}

function grow(current: number, amount: number): number {
  const next = current + amount
  return next >= 1 - 1e-8 ? 1 : Math.max(0, next)
}

function cleanlinessOf(s: GameState): number {
  const wastePenalty = Math.min(0.3, s.waste.length * 0.015)
  return Math.max(0, 1 - s.murk * 0.55 - algaeCoverage() * 0.35 - wastePenalty)
}

type NurseryProgress = Pick<GameState, 'nurserySession' | 'nurseryEggs' | 'ownedFish' | 'fishVitals'> & {
  eggCreated: boolean
  hatched: number
}

function progressNursery(s: GameState, seconds: number): NurseryProgress {
  const session = s.nurserySession
  const occupied = s.ownedFish.filter((f) => f.habitat === 'nursery').length + s.nurseryEggs.length
  let nextSession = session
  let eggCreated = false
  const eggs: NurseryEgg[] = s.nurseryEggs.map((egg) => ({ ...egg, remainingSeconds: egg.remainingSeconds - seconds }))
  if (session) {
    const parents = session.parentIds.map((id) => s.ownedFish.find((f) => f.id === id))
    if (parents.some((f) => !f || f.habitat !== 'nursery' || (s.fishVitals[f.id]?.growth ?? 0) < 1)
      || occupied + session.eggCount > NURSERY_CAPACITY) {
      nextSession = null
    } else if (session.remainingSeconds > seconds) {
      nextSession = { ...session, remainingSeconds: session.remainingSeconds - seconds }
    } else {
      const leftover = Math.max(0, seconds - session.remainingSeconds)
      for (let i = 0; i < session.eggCount; i++) {
        const egg = createNurseryEgg(parents[0]!, parents[1]!, Date.now() - leftover * 1000)
        eggs.push({ ...egg, remainingSeconds: egg.hatchSeconds - leftover })
      }
      nextSession = null
      eggCreated = true
    }
  }
  const hatchedEggs = eggs.filter((egg) => egg.remainingSeconds <= 0)
  // Keep array identity when nothing hatched: the 3D scene re-renders on
  // ownedFish changes, and rebuilding it every tick caused black-frame flicker.
  if (hatchedEggs.length === 0) {
    return {
      nurserySession: nextSession,
      nurseryEggs: eggs.length === 0 && s.nurseryEggs.length === 0 ? s.nurseryEggs : eggs,
      ownedFish: s.ownedFish,
      fishVitals: s.fishVitals,
      eggCreated,
      hatched: 0,
    }
  }
  const ownedFish = [...s.ownedFish]
  const fishVitals = { ...s.fishVitals }
  for (const egg of hatchedEggs) {
    const id = crypto.randomUUID()
    const name = pickFishName(ownedFish.map((f) => f.name))
    ownedFish.push({ id, defId: egg.defId, name, bornAt: Date.now() + egg.remainingSeconds * 1000,
      habitat: 'nursery', sizeScale: sampleFishSize(egg.defId), inheritance: egg.inheritance })
    fishVitals[id] = freshVitals(0.35)
  }
  return {
    nurserySession: nextSession,
    nurseryEggs: eggs.filter((egg) => egg.remainingSeconds > 0),
    ownedFish,
    fishVitals,
    eggCreated,
    hatched: hatchedEggs.length,
  }
}

function unlocksAtLevel(level: number): string[] {
  return [
    ...FISH_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...DECORATION_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...BACKGROUND_CATALOG.filter((d) => d.unlockLevel === level).map((d) => `${d.name} background`),
    ...SUBSTRATE_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...FOOD_CATALOG.filter((d) => d.unlockLevel === level && !d.unlimited).map((d) => d.name),
  ]
}

const PREMIUM_TREAT_ROTATION = ['rainbow-flakes', 'zoom-shrimp', 'glow-bites', 'golden-pellet', 'growth-formula']

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      tick: () => {
        const s = get()
        passiveRemainder += PASSIVE_COINS_PER_SECOND
        const whole = Math.floor(passiveRemainder)
        passiveRemainder -= whole

        const vitals: Record<string, FishVitals> = { ...s.fishVitals }
        for (const f of s.ownedFish) {
          const def = getFishDef(f.defId)
          const v = vitals[f.id] ?? freshVitals()
          vitals[f.id] = def && def.appetite > 0
            ? addHunger(v, HUNGER_PER_SECOND * def.appetite)
            : def ? { ...v, growth: grow(v.growth, CLEANUP_GROWTH_PER_SECOND) } : v
        }
        const mainFishCount = s.ownedFish.filter((f) => f.habitat !== 'nursery').length
        const murk = Math.min(
          1,
          s.murk +
            (MURK_BASE_PER_SECOND +
              MURK_PER_FISH_PER_SECOND * mainFishCount +
              MURK_PER_WASTE_PER_SECOND * s.waste.length) * bonusesFor(s.placedDecorations).murkRate,
        )
        const { eggCreated, hatched, ...nursery } = progressNursery({ ...s, fishVitals: vitals }, 1)
        set({ currency: s.currency + whole, lastTickTimestamp: Date.now(), murk, ...nursery })
        if (hatched) useUIStore.getState().pushToast(`${hatched === 1 ? 'A tiny friend hatched' : `${hatched} tiny friends hatched`}! Move them to your aquarium when you like.`, 'success', '🐣')
        else if (eggCreated) useUIStore.getState().pushToast('New eggs are cozy in the nursery!', 'success', '🥚')
      },

      applyOfflineProgress: () => {
        const s = get()
        const now = Date.now()
        const elapsed = Math.min(MAX_OFFLINE_SIM_SECONDS, Math.max(0, (now - s.lastTickTimestamp) / 1000))
        if (elapsed < 5) {
          const { nurserySession, nurseryEggs, ownedFish, fishVitals } = progressNursery(s, elapsed)
          set({ lastTickTimestamp: now, nurserySession, nurseryEggs, ownedFish, fishVitals })
          return
        }
        const earnSeconds = Math.min(elapsed, MAX_OFFLINE_EARNING_SECONDS)
        let coins = earnSeconds * OFFLINE_PASSIVE_PER_SECOND
        const vitals: Record<string, FishVitals> = { ...s.fishVitals }
        const bonuses = bonusesFor(s.placedDecorations)
        const averageInterval = (COIN_INTERVAL_MIN + COIN_INTERVAL_MAX) / 2 / bonuses.coinRate
        let hungryFish = 0
        for (const f of s.ownedFish) {
          const def = getFishDef(f.defId)
          if (!def) continue
          const v = vitals[f.id] ?? freshVitals()
          const rate = HUNGER_PER_SECOND * def.appetite
          // The auto-feeder only reaches fish living in the main tank.
          const fed = bonuses.autoFeeder && f.habitat !== 'nursery' && rate > 0
          // Fish keep earning while away until they get too hungry — feed before you leave!
          const productive = rate > 0 && !fed ? Math.max(0, Math.min(earnSeconds, (HUNGER_COIN_CUTOFF - v.hunger) / rate)) : earnSeconds
          if (def.coinValue > 0) coins += (coinValueFor(def.coinValue, v.growth) * productive) / averageInterval
          vitals[f.id] = rate > 0
            ? addHunger(v, rate * elapsed)
            : { ...v, growth: grow(v.growth, CLEANUP_GROWTH_PER_SECOND * elapsed) }
          if (fed && vitals[f.id].hunger > AUTO_FEEDER_HUNGER_CAP) vitals[f.id] = { ...vitals[f.id], hunger: AUTO_FEEDER_HUNGER_CAP }
          if (vitals[f.id].hunger > 0.5) hungryFish++
        }
        const mainFishCount = s.ownedFish.filter((f) => f.habitat !== 'nursery').length
        const murk = Math.min(1, s.murk + Math.min(0.45, elapsed * (MURK_BASE_PER_SECOND + MURK_PER_FISH_PER_SECOND * mainFishCount) * bonuses.murkRate))
        const earned = Math.floor(coins)
        const { eggCreated, hatched, ...nursery } = progressNursery({ ...s, fishVitals: vitals }, elapsed)
        set({ currency: s.currency + earned, lastTickTimestamp: now, murk, ...nursery })
        if (hatched) useUIStore.getState().pushToast(`${hatched === 1 ? 'A tiny friend hatched' : `${hatched} tiny friends hatched`}! Move them to your aquarium when you like.`, 'success', '🐣')
        else if (eggCreated) useUIStore.getState().pushToast('New eggs are cozy in the nursery!', 'success', '🥚')
        if (elapsed > 180) {
          useUIStore.getState().setWelcomeBack({
            minutesAway: Math.round(elapsed / 60),
            coins: earned,
            hungryFish,
            algaePercent: 0,
            murkPercent: Math.round(murk * 100),
          })
        }
      },

      grantXp: (amount) => {
        if (amount <= 0) return
        const s = get()
        const before = levelFromXp(s.xp).level
        const xp = s.xp + amount
        const after = levelFromXp(xp).level
        if (after <= before || before >= MAX_LEVEL) {
          set({ xp })
          return
        }
        let coins = 0
        const treats = { ...s.treats }
        const treatRewards: Array<{ id: string; count: number }> = []
        const unlocks: string[] = []
        for (let level = before + 1; level <= after; level++) {
          coins += levelUpCoinReward(level)
          treats.bloodworms = (treats.bloodworms ?? 0) + 2
          treatRewards.push({ id: 'bloodworms', count: 2 })
          const premium = PREMIUM_TREAT_ROTATION[level % PREMIUM_TREAT_ROTATION.length]
          if (getFoodDef(premium).unlockLevel <= level) {
            treats[premium] = (treats[premium] ?? 0) + 1
            treatRewards.push({ id: premium, count: 1 })
          }
          unlocks.push(...unlocksAtLevel(level))
        }
        set({ xp, currency: s.currency + coins, treats })
        useUIStore.getState().setLevelUp({ level: after, coins, treats: treatRewards, unlocks })
      },

      collectCoins: (amount, clicked) => {
        const s = get()
        set({
          currency: s.currency + amount,
          stats: { ...s.stats, coinsCollected: s.stats.coinsCollected + amount },
        })
        if (clicked) get().grantXp(1)
      },

      useFood: (foodId) => {
        const def = getFoodDef(foodId)
        if (def.unlimited) return true
        const s = get()
        const have = s.treats[foodId] ?? 0
        if (have <= 0) return false
        set({
          treats: { ...s.treats, [foodId]: have - 1 },
          stats: { ...s.stats, treatsGiven: s.stats.treatsGiven + 1 },
        })
        return true
      },

      fishAte: (fishId, foodId) => {
        const s = get()
        const v = s.fishVitals[fishId]
        if (!v) return
        const food = getFoodDef(foodId)
        const fish = s.ownedFish.find((f) => f.id === fishId)
        const lamp = fish?.habitat === 'nursery' ? 1 : bonusesFor(s.placedDecorations).growthRate
        const growthBoost = (food.effect === 'growth' ? 0.25 : GROWTH_PER_MEAL) * lamp
        set({
          fishVitals: {
            ...s.fishVitals,
            [fishId]: {
              hunger: Math.max(0, v.hunger - food.nutrition),
              growth: grow(v.growth, growthBoost),
              mealsEaten: v.mealsEaten + 1,
            },
          },
          stats: { ...s.stats, foodEaten: s.stats.foodEaten + 1 },
        })
        get().grantXp(food.unlimited ? 1 : 3)
      },

      buyDecoration: (defId) => {
        const def = getDecorationDef(defId)
        const s = get()
        if (!def || levelFromXp(s.xp).level < def.unlockLevel || s.unlockedDecorationDefIds.includes(defId) || s.currency < def.cost) return false
        set({ currency: s.currency - def.cost, unlockedDecorationDefIds: [...s.unlockedDecorationDefIds, defId] })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return true
      },

      buyFish: (defId) => {
        const def = getFishDef(defId)
        const s = get()
        if (!def || levelFromXp(s.xp).level < def.unlockLevel || s.ownedFish.filter((f) => f.habitat !== 'nursery').length >= MAX_OWNED_FISH || s.currency < def.cost) return null
        const id = crypto.randomUUID()
        const name = pickFishName(s.ownedFish.map((f) => f.name))
        set({
          currency: s.currency - def.cost,
          ownedFish: [...s.ownedFish, { id, defId, name, bornAt: Date.now(), habitat: 'main', sizeScale: sampleFishSize(defId) }],
          fishVitals: { ...s.fishVitals, [id]: freshVitals(0.35) },
          stats: { ...s.stats, fishBought: s.stats.fishBought + 1 },
        })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return id
      },

      buyTreatPack: (foodId) => {
        const def = getFoodDef(foodId)
        const s = get()
        if (def.unlimited || levelFromXp(s.xp).level < def.unlockLevel || s.currency < def.packCost) return false
        set({
          currency: s.currency - def.packCost,
          treats: { ...s.treats, [foodId]: (s.treats[foodId] ?? 0) + def.packSize },
        })
        return true
      },

      buyBackground: (id) => {
        const def = getBackgroundDef(id)
        const s = get()
        if (def.id !== id || levelFromXp(s.xp).level < def.unlockLevel || s.unlockedBackgroundIds.includes(def.id) || s.currency < def.cost) return false
        set({ currency: s.currency - def.cost, unlockedBackgroundIds: [...s.unlockedBackgroundIds, def.id], backgroundId: def.id })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return true
      },

      buySubstrate: (id) => {
        const def = getSubstrateDef(id)
        const s = get()
        if (def.id !== id || levelFromXp(s.xp).level < def.unlockLevel || s.unlockedSubstrateIds.includes(def.id) || s.currency < def.cost) return false
        set({ currency: s.currency - def.cost, unlockedSubstrateIds: [...s.unlockedSubstrateIds, def.id], substrateId: def.id })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return true
      },

      setBackground: (id) => {
        if (get().unlockedBackgroundIds.includes(id)) set({ backgroundId: id })
      },

      setSubstrate: (id) => {
        if (get().unlockedSubstrateIds.includes(id)) set({ substrateId: id })
      },

      buyStand: (id) => {
        const def = getStandDef(id)
        const s = get()
        if (def.id !== id || levelFromXp(s.xp).level < def.unlockLevel || s.unlockedStandIds.includes(def.id) || s.currency < def.cost) return false
        set({ currency: s.currency - def.cost, unlockedStandIds: [...s.unlockedStandIds, def.id], standId: def.id })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return true
      },

      setStand: (id) => {
        if (get().unlockedStandIds.includes(id)) set({ standId: id })
      },

      buyTool: (id) => {
        const def = getToolDef(id)
        const s = get()
        if (!def || levelFromXp(s.xp).level < def.unlockLevel || s.ownedToolIds.includes(id) || s.currency < def.cost) return false
        set({
          currency: s.currency - def.cost,
          ownedToolIds: [...s.ownedToolIds, id],
          ...(def.category === 'glass' ? { equippedGlassTool: id } : { equippedGravelTool: id }),
        })
        get().grantXp(Math.max(3, Math.round(def.cost / 20)))
        return true
      },

      equipTool: (id) => {
        const def = getToolDef(id)
        if (!def || !get().ownedToolIds.includes(id)) return
        set(def.category === 'glass' ? { equippedGlassTool: id } : { equippedGravelTool: id })
      },

      salePrice: (fishId) => {
        const s = get()
        const fish = s.ownedFish.find((f) => f.id === fishId)
        if (!fish) return 0
        const def = getFishDef(fish.defId)
        if (!def) return 0
        return calculateSalePrice(def.cost, s.fishVitals[fishId]?.growth ?? 0, cleanlinessOf(s))
      },

      sellFish: (fishId) => {
        const s = get()
        const fish = s.ownedFish.find((f) => f.id === fishId)
        if (!fish) return 0
        const price = get().salePrice(fishId)
        const vitals = { ...s.fishVitals }
        delete vitals[fishId]
        set({
          currency: s.currency + price,
          ownedFish: s.ownedFish.filter((f) => f.id !== fishId),
          fishVitals: vitals,
          nurserySession: s.nurserySession?.parentIds.includes(fishId) ? null : s.nurserySession,
        })
        return price
      },

      rehomeFish: (fishId) => get().sellFish(fishId),

      renameAquarium: (name) => {
        const trimmed = name.trim().slice(0, 28)
        if (trimmed) set({ aquariumName: trimmed })
      },

      transferFish: (fishId, destination) => {
        const s = get()
        const fish = s.ownedFish.find((f) => f.id === fishId)
        if (!fish || fish.habitat === destination || (destination !== 'main' && destination !== 'nursery')) return false
        const capacity = destination === 'nursery' ? NURSERY_CAPACITY - s.nurseryEggs.length - (s.nurserySession?.eggCount ?? 0) : MAX_OWNED_FISH
        if (s.ownedFish.filter((f) => f.habitat === destination).length >= capacity) return false
        set({
          ownedFish: s.ownedFish.map((f) => f.id === fishId ? { ...f, habitat: destination } : f),
          nurserySession: s.nurserySession?.parentIds.includes(fishId) ? null : s.nurserySession,
        })
        return true
      },

      startFriendship: (firstId, secondId) => {
        const s = get()
        if (firstId === secondId || s.nurserySession) return false
        const eligible = (id: string) => s.ownedFish.some((f) => f.id === id && f.habitat === 'nursery') && (s.fishVitals[id]?.growth ?? 0) >= 1
        if (!eligible(firstId) || !eligible(secondId)) return false
        const first = s.ownedFish.find((f) => f.id === firstId)!
        const occupied = s.ownedFish.filter((f) => f.habitat === 'nursery').length + s.nurseryEggs.length
        if (occupied + getEggCountRange(first.defId)[1] > NURSERY_CAPACITY) return false
        set({ nurserySession: { parentIds: [firstId, secondId], remainingSeconds: FRIENDSHIP_SECONDS,
          eggCount: sampleEggCount(first.defId) } })
        return true
      },

      renameFish: (fishId, name) => {
        const trimmed = name.trim().slice(0, 18)
        if (!trimmed) return
        set({ ownedFish: get().ownedFish.map((f) => (f.id === fishId ? { ...f, name: trimmed } : f)) })
      },

      addDecorationInstance: (defId) => {
        const s = get()
        if (!s.unlockedDecorationDefIds.includes(defId)) return
        const def = getDecorationDef(defId)
        const [x, z] = clampToInterior((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.6, def?.footprintRadius ?? 0.3)
        const instance: DecorationInstance = { id: crypto.randomUUID(), defId, position: [x, 0, z], rotationY: Math.random() * Math.PI * 2 }
        set({ placedDecorations: [...s.placedDecorations, instance] })
        useUIStore.getState().setSelectedDecorationId(instance.id)
      },

      updateDecorationTransform: (id, position, rotationY) =>
        set((s) => ({
          placedDecorations: s.placedDecorations.map((d) =>
            d.id === id ? { ...d, position, rotationY: rotationY ?? d.rotationY } : d,
          ),
        })),

      rotateDecoration: (id) =>
        set((s) => ({
          placedDecorations: s.placedDecorations.map((d) =>
            d.id === id ? { ...d, rotationY: d.rotationY + Math.PI / 4 } : d,
          ),
        })),

      removeDecoration: (id) => set((s) => ({ placedDecorations: s.placedDecorations.filter((d) => d.id !== id) })),

      addWaste: (x, z, kind, size = 1) => {
        const s = get()
        const item: WasteItem = { id: crypto.randomUUID(), x, z, kind, size }
        const waste = s.waste.length >= MAX_WASTE_ITEMS ? [...s.waste.slice(1), item] : [...s.waste, item]
        set({ waste })
      },

      removeWaste: (ids) => {
        if (ids.length === 0) return 0
        const s = get()
        const idSet = new Set(ids)
        const remaining = s.waste.filter((w) => !idSet.has(w.id))
        const removed = s.waste.length - remaining.length
        if (removed === 0) return 0
        set({
          waste: remaining,
          currency: s.currency + removed,
          stats: { ...s.stats, wasteVacuumed: s.stats.wasteVacuumed + removed },
        })
        get().grantXp(removed * 2)
        return removed
      },

      relocateWaste: (moves) => {
        if (moves.length === 0) return
        const byId = new Map(moves.map((m) => [m.id, m]))
        set({
          waste: get().waste.map((w) => {
            const m = byId.get(w.id)
            if (!m) return w
            const [x, z] = clampToInterior(m.x, m.z, 0.05)
            return { ...w, x, z }
          }),
        })
      },

      rewardAlgaeScrub: (amount) => {
        // `amount` is algae removed in grid-cell units; a fully green front wall is ~1300.
        scrubRemainder += amount / 100
        const whole = Math.floor(scrubRemainder)
        if (whole <= 0) return
        scrubRemainder -= whole
        const s = get()
        set({
          currency: s.currency + whole,
          stats: { ...s.stats, algaeScrubbed: s.stats.algaeScrubbed + whole },
        })
        get().grantXp(whole)
      },

      waterChange: () => {
        const s = get()
        const murk = s.murk
        set({ murk: 0, stats: { ...s.stats, waterChanges: s.stats.waterChanges + 1 } })
        if (murk > 0.12) {
          const reward = Math.round(murk * 12)
          set({ currency: get().currency + reward })
          get().grantXp(Math.round(murk * 40))
        }
        return true
      },

      setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
    }),
    {
      name: 'aquarium-save',
      version: CURRENT_SAVE_VERSION,
      migrate,
      merge: (persisted, current) => ({ ...current, ...sanitize((persisted ?? {}) as Partial<GameState>) }),
      partialize: (s): GameState => ({
        aquariumName: s.aquariumName,
        currency: s.currency,
        xp: s.xp,
        lastTickTimestamp: s.lastTickTimestamp,
        ownedFish: s.ownedFish,
        fishVitals: s.fishVitals,
        nurserySession: s.nurserySession,
        nurseryEggs: s.nurseryEggs,
        unlockedDecorationDefIds: s.unlockedDecorationDefIds,
        placedDecorations: s.placedDecorations,
        backgroundId: s.backgroundId,
        unlockedBackgroundIds: s.unlockedBackgroundIds,
        substrateId: s.substrateId,
        unlockedSubstrateIds: s.unlockedSubstrateIds,
        standId: s.standId,
        unlockedStandIds: s.unlockedStandIds,
        ownedToolIds: s.ownedToolIds,
        equippedGlassTool: s.equippedGlassTool,
        equippedGravelTool: s.equippedGravelTool,
        treats: s.treats,
        murk: s.murk,
        waste: s.waste,
        stats: s.stats,
        settings: s.settings,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Failed to load save, starting fresh.', error)
          return
        }
        state?.applyOfflineProgress()
      },
    },
  ),
)
