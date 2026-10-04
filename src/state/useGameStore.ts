import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DecorationInstance, FishInstance, FishVitals, GameSettings, GameState, Habitat, WasteItem } from './types'
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
  OFFLINE_PASSIVE_PER_SECOND,
  PASSIVE_COINS_PER_SECOND,
  salePrice as calculateSalePrice,
} from './economy'
import { charmProblem, getCharm, type CharmId } from './charms'
import { extraEggChance, nextTier, nurseryCapacity, nurseryGrowth, nurseryUpgradeProblem, type NurseryUpgradeId } from './nurseryUpgrades'
import { levelFromXp, levelUpCoinReward, MAX_LEVEL } from './progression'
import { pickFishName } from './names'
import { useUIStore } from './useUIStore'
import { DECORATION_CATALOG, getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { FISH_CATALOG, getFishDef, sampleFishSize } from '../scene/fish/fishDefinitions'
import { aquariumCapacity } from './tankSizes'
import { BACKGROUND_CATALOG } from '../scene/backgrounds'
import { SUBSTRATE_CATALOG } from '../scene/substrates'
import { FOOD_CATALOG, getFoodDef } from '../scene/food/foodDefinitions'
import { clampDecoration, clampToInterior, TANK_DEPTH, TANK_WIDTH } from '../scene/TankBounds'
import { algaeCoverage } from '../sim/algae'
import { progressNursery, sampleEggCount } from './nursery'
import {
  checkPurchase,
  friendshipProblem,
  mainTankCount,
  nurseryOccupancy,
  POND_CAPACITY,
  POND_LEVEL,
  pondCount,
  purchaseXp,
  tankName,
  transferProblem,
  type ShopCategory,
} from './rules'
import { castsLeft, type Catch } from './fishing'
import { speciesLabel } from './morphs'
import { bonusesFor } from './bonuses'
import { beautyOf } from './beauty'
import { STAND_CATALOG } from '../scene/stands/standDefinitions'
import { discoveryRewards, recordFish } from './fishpedia'
import { getToolDef } from '../scene/cleaning/toolDefinitions'
import { canRelease, MAX_OCEAN_FISH, oceanLooks, RELEASE_XP, tideFor, tideReward } from './ocean'
import { seasonOn } from './seasons'
import {
  AWAY_VISIT_SECONDS,
  eligibleVisitors,
  FIRST_VISIT_XP,
  getVisitor,
  giftReward,
  MAX_AWAY_VISITS,
  MAX_GIFTS,
  pickVisitor,
  visitorName,
  visitSpot,
  type VisitorGift,
} from './visitors'
import { bonusReward, dayKey, getWishTemplate, newTrophies, rollWishes, wishDone, wishReward, type StatKey } from './goals'

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
  /** Move everything into a bigger tank. */
  buyTankSize: (id: string) => boolean
  /** Buy the next level of a nursery upgrade. */
  buyNurseryUpgrade: (id: NurseryUpgradeId) => boolean
  setStand: (id: string) => void
  buyTool: (id: string) => boolean
  equipTool: (id: string) => void
  rehomeFish: (fishId: string) => number
  sellFish: (fishId: string) => number
  /** Release a grown fish to the Open Ocean. Returns the coins it earned, or null if it isn't grown yet. */
  releaseFish: (fishId: string) => number | null
  salePrice: (fishId: string) => number
  renameAquarium: (name: string) => void
  transferFish: (fishId: string, destination: Habitat) => boolean
  /** Pair two grown nursery fish, optionally using up a lucky charm on their clutch. */
  startFriendship: (firstId: string, secondId: string, charm?: CharmId) => boolean
  buyCharm: (id: CharmId) => boolean
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
  /** Add newly arrived fish to the Fishpedia and pay out any discovery rewards. */
  noteFish: (fish: FishInstance[], hatched: boolean) => void
  /** The player browsed the shop: everything unlocked so far is no longer "new". */
  markShopSeen: () => void
  /** The player looked in the nursery: its hatchlings are no longer "new". */
  markNurserySeen: () => void
  /** Count something the player did (for wishes and trophies). */
  noteStat: (key: StatKey, amount?: number) => void
  /** New day? New wishes. New trophies? Hand them out. Runs every second. */
  refreshGoals: () => void
  claimWish: (id: string) => boolean
  claimWishBonus: () => boolean
  /** A visitor just came by: note it in the book (quietly when it happened while you were away). */
  visitorArrived: (visitorId: string, quiet?: boolean) => void
  /** A visitor left a gift on the gravel at (x, z). */
  leaveGift: (visitorId: string, x: number, z: number) => void
  openGift: (giftId: string) => VisitorGift | null
  /** Use one of today's fishing casts. False when there are none left. */
  castLine: () => boolean
  /** Keep what you reeled in. Returns a sentence saying what you got. */
  landCatch: (c: Catch) => string
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

function unlocksAtLevel(level: number): string[] {
  return [
    ...FISH_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...DECORATION_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...BACKGROUND_CATALOG.filter((d) => d.unlockLevel === level).map((d) => `${d.name} background`),
    ...SUBSTRATE_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
    ...FOOD_CATALOG.filter((d) => d.unlockLevel === level && !d.unlimited).map((d) => d.name),
    ...STAND_CATALOG.filter((d) => d.unlockLevel === level).map((d) => d.name),
  ]
}

function hatchToast(count: number) {
  useUIStore.getState().pushToast(`${count === 1 ? 'A tiny friend hatched' : `${count} tiny friends hatched`}! Move them to your aquarium when you like.`, 'success', '🐣')
}

/** Every saved field: createInitialState has to fill in all of GameState, so it lists them all. */
const SAVED_KEYS = Object.keys(createInitialState()) as Array<keyof GameState>

const PREMIUM_TREAT_ROTATION = ['rainbow-flakes', 'zoom-shrimp', 'glow-bites', 'golden-pellet', 'growth-formula']

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      /**
       * Buy something `checkPurchase` allows: charge for it, apply what it
       * unlocks, and grant the usual purchase XP.
       */
      const purchase = (category: ShopCategory, id: string, unlock: (s: GameState) => Partial<GameState>, xp = true): boolean => {
        const s = get()
        const check = checkPurchase(s, category, id)
        if (!check.ok) return false
        set({ ...unlock(s), currency: s.currency - check.cost })
        if (xp) get().grantXp(purchaseXp(check.cost))
        return true
      }

      return {
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
          const mainFishCount = s.ownedFish.filter((f) => f.habitat === 'main').length
          const murk = Math.min(
            1,
            s.murk +
              (MURK_BASE_PER_SECOND +
                MURK_PER_FISH_PER_SECOND * mainFishCount +
                MURK_PER_WASTE_PER_SECOND * s.waste.length) * bonusesFor(s.placedDecorations).murkRate,
          )
          const { eggCreated, hatched, ...nursery } = progressNursery({ ...s, fishVitals: vitals }, 1)
          set({ currency: s.currency + whole, lastTickTimestamp: Date.now(), murk, ...nursery })
          if (hatched.length) {
            get().noteStat('hatched', hatched.length)
            hatchToast(hatched.length)
            get().noteFish(hatched, true)
          } else if (eggCreated) useUIStore.getState().pushToast('New eggs are cozy in the nursery!', 'success', '🥚')
        },

        applyOfflineProgress: () => {
          const s = get()
          const now = Date.now()
          const elapsed = Math.min(MAX_OFFLINE_SIM_SECONDS, Math.max(0, (now - s.lastTickTimestamp) / 1000))
          if (elapsed < 5) {
            const { nurserySession, nurseryEggs, ownedFish, fishVitals, hatched } = progressNursery(s, elapsed)
            set({ lastTickTimestamp: now, nurserySession, nurseryEggs, ownedFish, fishVitals })
            if (hatched.length) get().noteFish(hatched, true)
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
            const fed = bonuses.autoFeeder && f.habitat === 'main' && rate > 0
            // Fish keep earning while away until they get too hungry — feed before you leave!
            const productive = rate > 0 && !fed ? Math.max(0, Math.min(earnSeconds, (HUNGER_COIN_CUTOFF - v.hunger) / rate)) : earnSeconds
            if (def.coinValue > 0) coins += (coinValueFor(def.coinValue, v.growth) * productive) / averageInterval
            vitals[f.id] = rate > 0
              ? addHunger(v, rate * elapsed)
              : { ...v, growth: grow(v.growth, CLEANUP_GROWTH_PER_SECOND * elapsed) }
            if (fed && vitals[f.id].hunger > AUTO_FEEDER_HUNGER_CAP) vitals[f.id] = { ...vitals[f.id], hunger: AUTO_FEEDER_HUNGER_CAP }
            if (vitals[f.id].hunger > 0.5) hungryFish++
          }
          const mainFishCount = s.ownedFish.filter((f) => f.habitat === 'main').length
          const murk = Math.min(1, s.murk + Math.min(0.45, elapsed * (MURK_BASE_PER_SECOND + MURK_PER_FISH_PER_SECOND * mainFishCount) * bonuses.murkRate))
          const earned = Math.floor(coins)
          const { eggCreated, hatched, ...nursery } = progressNursery({ ...s, fishVitals: vitals }, elapsed)
          set({ currency: s.currency + earned, lastTickTimestamp: now, murk, ...nursery })
          if (hatched.length) {
            get().noteStat('hatched', hatched.length)
            hatchToast(hatched.length)
            get().noteFish(hatched, true)
          } else if (eggCreated) useUIStore.getState().pushToast('New eggs are cozy in the nursery!', 'success', '🥚')
          // Visitors kept dropping by too, and each left a gift.
          const awayVisitors: string[] = []
          const visits = Math.min(MAX_AWAY_VISITS, Math.floor(elapsed / AWAY_VISIT_SECONDS))
          for (let i = 0; i < visits; i++) {
            const g = get()
            const v = pickVisitor(eligibleVisitors(g.placedDecorations, 'any'), g.visitors, Math.random, awayVisitors[awayVisitors.length - 1])
            if (!v) break
            g.visitorArrived(v.id, true)
            const [x, z] = visitSpot(v, g.placedDecorations)
            g.leaveGift(v.id, x, z)
            awayVisitors.push(v.id)
          }
          if (elapsed > 180) {
            useUIStore.getState().setWelcomeBack({
              visitors: awayVisitors,
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
          if (before < POND_LEVEL && after >= POND_LEVEL) unlocks.unshift('🪷 The Koi Pond (a whole new tank!)')
          useUIStore.getState().setLevelUp({ level: after, coins, treats: treatRewards, unlocks })
        },

        collectCoins: (amount, clicked) => {
          const s = get()
          set({
            currency: s.currency + amount,
            stats: { ...s.stats, coinsCollected: s.stats.coinsCollected + amount, bubblesPopped: s.stats.bubblesPopped + (clicked ? 1 : 0) },
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
          const lamp = fish?.habitat === 'main' ? bonusesFor(s.placedDecorations).growthRate
            : fish?.habitat === 'nursery' ? nurseryGrowth(s.nurseryUpgrades) : 1
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

        buyDecoration: (defId) =>
          purchase('decorations', defId, (s) => ({ unlockedDecorationDefIds: [...s.unlockedDecorationDefIds, defId] })),

        buyFish: (defId) => {
          const s = get()
          // Pond fish arrive straight in the Koi Pond.
          const fish: FishInstance = { id: crypto.randomUUID(), defId, name: pickFishName(s.ownedFish.map((f) => f.name)),
            bornAt: Date.now(), habitat: getFishDef(defId)?.pond ? 'pond' : 'main', sizeScale: sampleFishSize(defId) }
          const bought = purchase('fish', defId, (s) => ({
            ownedFish: [...s.ownedFish, fish],
            fishVitals: { ...s.fishVitals, [fish.id]: freshVitals(0.35) },
            stats: { ...s.stats, fishBought: s.stats.fishBought + 1 },
          }))
          if (!bought) return null
          get().noteFish([fish], false)
          return fish.id
        },

        // Treat packs are consumables, so they give no purchase XP.
        buyTreatPack: (foodId) =>
          purchase('treats', foodId, (s) => ({ treats: { ...s.treats, [foodId]: (s.treats[foodId] ?? 0) + getFoodDef(foodId).packSize } }), false),

        buyBackground: (id) =>
          purchase('backgrounds', id, (s) => ({ unlockedBackgroundIds: [...s.unlockedBackgroundIds, id], backgroundId: id })),

        buySubstrate: (id) =>
          purchase('gravel', id, (s) => ({ unlockedSubstrateIds: [...s.unlockedSubstrateIds, id], substrateId: id })),

        setBackground: (id) => {
          if (get().unlockedBackgroundIds.includes(id)) set({ backgroundId: id })
        },

        setSubstrate: (id) => {
          if (get().unlockedSubstrateIds.includes(id)) set({ substrateId: id })
        },

        buyStand: (id) => purchase('stands', id, (s) => ({ unlockedStandIds: [...s.unlockedStandIds, id], standId: id })),

        setStand: (id) => {
          if (get().unlockedStandIds.includes(id)) set({ standId: id })
        },

        buyTankSize: (id) => {
          const bought = purchase('tanks', id, () => ({ tankSizeId: id }))
          // Nothing stays mid-drag or selected while everything moves house.
          if (bought) useUIStore.getState().setSelectedDecorationId(null)
          return bought
        },

        buyCharm: (id) => {
          const s = get()
          const charm = getCharm(id)
          if (!charm || charmProblem(s, id)) return false
          set({ currency: s.currency - charm.cost, charms: { ...s.charms, [id]: (s.charms[id] ?? 0) + 1 } })
          get().grantXp(purchaseXp(charm.cost))
          return true
        },

        buyNurseryUpgrade: (id) => {
          const s = get()
          const tier = nextTier(s.nurseryUpgrades, id)
          if (!tier || nurseryUpgradeProblem(s, id)) return false
          set({ currency: s.currency - tier.cost, nurseryUpgrades: { ...s.nurseryUpgrades, [id]: (s.nurseryUpgrades[id] ?? 0) + 1 } })
          get().grantXp(purchaseXp(tier.cost))
          return true
        },

        buyTool: (id) =>
          purchase('tools', id, (s) => ({
            ownedToolIds: [...s.ownedToolIds, id],
            ...(getToolDef(id)?.category === 'glass' ? { equippedGlassTool: id } : { equippedGravelTool: id }),
          })),

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

        releaseFish: (fishId) => {
          const s = get()
          const fish = s.ownedFish.find((f) => f.id === fishId)
          const def = fish && getFishDef(fish.defId)
          if (!fish || !def || !canRelease(s, fish)) return null
          const firstOfKind = !s.ocean.some((f) => f.defId === fish.defId)
          const tideBefore = tideFor(s.stats.released)
          const ocean = [...s.ocean, { id: fish.id, defId: fish.defId, name: fish.name, at: Date.now(), ...oceanLooks(fish) }].slice(-MAX_OCEAN_FISH)
          // Same coins as selling, so letting go never costs anything.
          const coins = get().sellFish(fishId)
          set((g) => ({ ocean, stats: { ...g.stats, released: g.stats.released + 1 } }))
          get().grantXp(RELEASE_XP[def.rarity])
          const ui = useUIStore.getState()
          ui.pushToast(`${fish.name} swam off into the Open Ocean! +${coins} coins`, 'reward', '🌊')
          if (firstOfKind) ui.pushToast(`New ocean stamp: ${def.name}!`, 'success', '🐚')
          const tide = tideFor(get().stats.released)
          for (let t = tideBefore + 1; t <= tide; t++) {
            const reward = tideReward(t)
            set((g) => ({ currency: g.currency + reward.coins, treats: { ...g.treats, [reward.treat]: (g.treats[reward.treat] ?? 0) + reward.treatCount } }))
            ui.pushToast(`The tide rose to Tide ${t}! +${reward.coins} coins and ${reward.treatCount} ${getFoodDef(reward.treat).name}`, 'reward', '🌊')
          }
          return coins
        },

        renameAquarium: (name) => {
          const trimmed = name.trim().slice(0, 28)
          if (trimmed) set({ aquariumName: trimmed })
        },

        transferFish: (fishId, destination) => {
          const s = get()
          if (transferProblem(s, fishId, destination)) return false
          set({
            ownedFish: s.ownedFish.map((f) => f.id === fishId ? { ...f, habitat: destination } : f),
            // Moving a parent out ends its friendship visit.
            nurserySession: s.nurserySession?.parentIds.includes(fishId) ? null : s.nurserySession,
          })
          return true
        },

        startFriendship: (firstId, secondId, charm) => {
          const s = get()
          if (friendshipProblem(s, firstId, secondId)) return false
          const useCharm = charm && (s.charms[charm] ?? 0) > 0 ? charm : undefined
          const first = s.ownedFish.find((f) => f.id === firstId)!
          // Nesting moss may add one more egg, if there's a spot for it.
          const free = nurseryCapacity(s.nurseryUpgrades) - nurseryOccupancy(s)
          const extra = Math.random() < extraEggChance(s.nurseryUpgrades) ? 1 : 0
          set({ nurserySession: { parentIds: [firstId, secondId], remainingSeconds: FRIENDSHIP_SECONDS,
            eggCount: Math.min(free, sampleEggCount(first.defId) + extra), ...(useCharm ? { charm: useCharm } : {}) },
            ...(useCharm ? { charms: { ...s.charms, [useCharm]: s.charms[useCharm]! - 1 } } : {}) })
          get().noteStat('friendships')
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
          const [x, z] = clampDecoration((Math.random() - 0.5) * TANK_WIDTH * 0.4, (Math.random() - 0.5) * TANK_DEPTH * 0.4, def?.footprintRadius ?? 0.3)
          const instance: DecorationInstance = { id: crypto.randomUUID(), defId, position: [x, 0, z], rotationY: Math.random() * Math.PI * 2 }
          set({ placedDecorations: [...s.placedDecorations, instance], stats: { ...s.stats, decorPlaced: s.stats.decorPlaced + 1 } })
          const before = beautyOf(s.placedDecorations).stars
          const after = beautyOf(get().placedDecorations)
          if (after.stars > before) {
            useUIStore.getState().pushToast(
              `Your tank is now ${'★'.repeat(after.stars)} beautiful! Coin bubbles +${Math.round(after.coinBonus * 100)}%`,
              'reward',
              '✨',
            )
          }
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

        noteFish: (fish, hatched) => {
          const s = get()
          const found = recordFish(s.fishpedia, fish, hatched)
          if (found.book === s.fishpedia) return
          const reward = discoveryRewards(s.fishpedia, found)
          const ui = useUIStore.getState()
          for (const toast of reward.toasts) ui.pushToast(toast.text, 'success', toast.icon)
          set({ fishpedia: found.book, currency: get().currency + reward.coins })
          ui.bumpFishpediaNews(reward.news)
          if (reward.xp) get().grantXp(reward.xp)
        },

        markShopSeen: () => {
          const s = get()
          const level = levelFromXp(s.xp).level
          if (s.seen.shopLevel !== level) set({ seen: { ...s.seen, shopLevel: level } })
        },

        markNurserySeen: () => set((s) => ({ seen: { ...s.seen, nurseryAt: Date.now() } })),

        noteStat: (key, amount = 1) => set((s) => ({ stats: { ...s.stats, [key]: (s.stats[key] ?? 0) + amount } })),

        refreshGoals: () => {
          const s = get()
          const today = dayKey()
          if (s.daily.day !== today) {
            // Finished but unclaimed wishes from an earlier day still pay out.
            const level = levelFromXp(s.xp).level
            const done = s.daily.wishes.filter((w) => !w.claimed && wishDone(s, w)).length
            const reward = wishReward(level)
            set({ daily: rollWishes(s, today), currency: s.currency + done * reward.coins })
            if (done) {
              get().grantXp(done * reward.xp)
              useUIStore.getState().pushToast(`Wishes you finished last time paid out: +${done * reward.coins} coins`, 'reward', '🪙')
            }
          }
          // A new season says hello once a year.
          const season = seasonOn()
          const seasonKey = season ? `${season.id}-${new Date().getFullYear()}` : ''
          if (season && get().seasonSeen !== seasonKey) {
            set({ seasonSeen: seasonKey })
            const piece = DECORATION_CATALOG.find((d) => d.season === season.id)
            useUIStore.getState().pushToast(`${season.name} is here! ${season.blurb}${piece ? ` Find the ${piece.name} in the shop.` : ''}`, 'success', season.icon)
          }
          const won = newTrophies(get())
          if (won.length === 0) return
          const coins = won.reduce((n, t) => n + t.coins, 0)
          const now = Date.now()
          set((g) => ({ trophies: { ...g.trophies, ...Object.fromEntries(won.map((t) => [t.id, now])) }, currency: g.currency + coins }))
          const ui = useUIStore.getState()
          if (won.length <= 2) for (const t of won) ui.pushToast(`Trophy earned: ${t.name}! +${t.coins} coins`, 'reward', t.icon)
          else ui.pushToast(`You earned ${won.length} trophies! +${coins.toLocaleString()} coins`, 'reward', '🏆')
          ui.bumpGoalsNews(won.length)
        },

        claimWish: (id) => {
          const s = get()
          const wish = s.daily.wishes.find((w) => w.id === id)
          if (!wish || wish.claimed || !wishDone(s, wish)) return false
          const reward = wishReward(levelFromXp(s.xp).level)
          set({
            daily: { ...s.daily, wishes: s.daily.wishes.map((w) => (w.id === id ? { ...w, claimed: true } : w)) },
            currency: s.currency + reward.coins,
          })
          get().grantXp(reward.xp)
          useUIStore.getState().pushToast(`Wish granted! +${reward.coins} coins`, 'reward', getWishTemplate(id)?.icon ?? '⭐')
          return true
        },

        claimWishBonus: () => {
          const s = get()
          if (s.daily.bonusClaimed || s.daily.wishes.length === 0 || !s.daily.wishes.every((w) => w.claimed)) return false
          const reward = bonusReward(levelFromXp(s.xp).level)
          set({ daily: { ...s.daily, bonusClaimed: true }, currency: s.currency + reward.coins })
          get().grantXp(reward.xp)
          useUIStore.getState().pushToast(`All of today's wishes came true! +${reward.coins} coins`, 'reward', '🎁')
          return true
        },

        visitorArrived: (visitorId, quiet = false) => {
          const s = get()
          const v = getVisitor(visitorId)
          if (!v) return
          const known = s.visitors[visitorId]
          set({
            visitors: { ...s.visitors, [visitorId]: { visits: (known?.visits ?? 0) + 1, first: known?.first ?? Date.now() } },
            stats: { ...s.stats, visits: s.stats.visits + 1 },
          })
          const ui = useUIStore.getState()
          if (!known) {
            const xp = FIRST_VISIT_XP[v.rarity]
            if (!quiet) ui.pushToast(`New visitor! ${visitorName(v, { start: true })} came to see your tank. +${xp} XP`, 'success', v.icon)
            ui.bumpFishpediaNews(1)
            get().grantXp(xp)
          } else if (!quiet) {
            ui.pushToast(`${visitorName(v, { start: true })} came to visit!`, 'info', v.icon)
          }
        },

        leaveGift: (visitorId, x, z) => {
          const v = getVisitor(visitorId)
          if (!v) return
          // No room on the gravel: the oldest gift opens itself.
          while (get().gifts.length >= MAX_GIFTS) get().openGift(get().gifts[0].id)
          const s = get()
          const reward = giftReward(v, levelFromXp(s.xp).level)
          const gift: VisitorGift = { id: `gift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, visitorId, x, z, ...reward, at: Date.now() }
          set({ gifts: [...s.gifts, gift] })
        },

        castLine: () => {
          const s = get()
          const today = dayKey()
          if (castsLeft(s.fishing, today) <= 0) return false
          set({ fishing: { day: today, casts: (s.fishing.day === today ? s.fishing.casts : 0) + 1 } })
          return true
        },

        landCatch: (c) => {
          const s = get()
          set({ stats: { ...s.stats, fishCaught: s.stats.fishCaught + 1 } })
          if (c.kind === 'coins') {
            get().collectCoins(c.coins, false)
            return `You reeled in ${c.name}! +${c.coins} coins`
          }
          if (c.kind === 'treat') {
            set((g) => ({ treats: { ...g.treats, [c.treat]: (g.treats[c.treat] ?? 0) + c.count } }))
            return `You reeled in ${c.count} ${getFoodDef(c.treat).name}!`
          }
          const def = getFishDef(c.defId)!
          // Somewhere with room: pond fish to the pond, others to the nursery, else the aquarium.
          const pondOpen = levelFromXp(s.xp).level >= POND_LEVEL
          const room: Habitat | null =
            def.pond && pondOpen && pondCount(s.ownedFish) < POND_CAPACITY ? 'pond'
            : nurseryOccupancy(s) < nurseryCapacity(s.nurseryUpgrades) ? 'nursery'
            : !def.pond && mainTankCount(s.ownedFish) < aquariumCapacity(s.tankSizeId) ? 'main'
            : null
          if (!room) {
            const coins = Math.round(def.cost * 0.4)
            get().collectCoins(coins, false)
            return `You caught a ${def.name}, but there's no room, so you let it swim away. +${coins} coins`
          }
          const fish: FishInstance = {
            id: crypto.randomUUID(),
            defId: def.id,
            name: pickFishName(s.ownedFish.map((f) => f.name)),
            bornAt: Date.now(),
            habitat: room,
            sizeScale: sampleFishSize(def.id),
            ...(c.morph
              ? { inheritance: { bodyParentName: '', colorParentName: '', bodyParentId: '', colorParentId: '', color: def.color, color2: def.color2, color3: def.color3, morph: c.morph } }
              : {}),
          }
          set((g) => ({ ownedFish: [...g.ownedFish, fish], fishVitals: { ...g.fishVitals, [fish.id]: { hunger: 0.3, growth: 0.7, mealsEaten: 4 } } }))
          get().noteFish([fish], false)
          return `You caught ${fish.name} the ${speciesLabel(def, c.morph)}! It's waiting in ${tankName(room)}.`
        },

        openGift: (giftId) => {
          const s = get()
          const gift = s.gifts.find((g) => g.id === giftId)
          if (!gift) return null
          set({ gifts: s.gifts.filter((g) => g.id !== giftId), stats: { ...s.stats, giftsOpened: s.stats.giftsOpened + 1 } })
          get().collectCoins(gift.coins, false)
          get().grantXp(gift.xp)
          const v = getVisitor(gift.visitorId)
          useUIStore.getState().pushToast(`A gift from ${v ? visitorName(v, { definite: true }) : 'a visitor'}! +${gift.coins} coins`, 'reward', '🎁')
          return gift
        },
      }
    },
    {
      name: 'aquarium-save',
      version: CURRENT_SAVE_VERSION,
      migrate,
      merge: (persisted, current) => ({ ...current, ...sanitize((persisted ?? {}) as Partial<GameState>) }),
      partialize: (s): GameState => Object.fromEntries(SAVED_KEYS.map((key) => [key, s[key]])) as unknown as GameState,
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
