import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import './cleaning.test'
import './moving.test'
import { createInitialState, freshVitals, migrate } from '../src/state/migrations'
import { FISH_CATALOG, getFishDef, MAX_OWNED_FISH } from '../src/scene/fish/fishDefinitions'
import { STAND_CATALOG } from '../src/scene/stands/standDefinitions'
import { TANK_SIZES } from '../src/state/tankSizes'
import { TOOL_CATALOG } from '../src/scene/cleaning/toolDefinitions'
import { DECORATION_CATALOG } from '../src/scene/decorations/decorationDefinitions'
import { BACKGROUND_CATALOG } from '../src/scene/backgrounds'
import { SUBSTRATE_CATALOG } from '../src/scene/substrates'
import { FOOD_CATALOG } from '../src/scene/food/foodDefinitions'
import { levelFromXp } from '../src/state/progression'
import { FRIENDSHIP_SECONDS, NURSERY_CAPACITY, PASSIVE_COINS_PER_SECOND, sizeForGrowth } from '../src/state/economy'
import { createNurseryEgg, getEggCountRange, getEggHatchRange, inheritedDefinition } from '../src/state/nursery'
import { getMorph, rollMorph } from '../src/state/morphs'
import { BRED_COINS, DISCOVERY_XP, discoveryRewards, MORPH_COINS, recordFish } from '../src/state/fishpedia'
import {
  checkPurchase,
  firstNewShopCategory,
  friendshipProblem,
  friendshipReady,
  newHatchlings,
  newShopCount,
  purchaseProblem,
  transferProblem,
} from '../src/state/rules'
import type { FishInstance } from '../src/state/types'

/** A fish's own colours under any morph: what it passes on to its eggs. */
function basePalette(fish: FishInstance) {
  return fish.inheritance ?? getFishDef(fish.defId)!
}

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
}, configurable: true })
Object.defineProperty(globalThis, 'window', { value: { localStorage }, configurable: true })

const { useGameStore: store } = await import('../src/state/useGameStore')
const { useUIStore: ui } = await import('../src/state/useUIStore')
const { dropFood, foodItems, predictFood, releaseFoodAt, updateFood, vacuumFoodNear } = await import('../src/sim/food')
const THREE = await import('three')
const { floorHeightAt } = await import('../src/scene/TankBounds')
const { loadAlgae, algaeCoverage, scrubAlgae, growAlgae, saveAlgae } = await import('../src/sim/algae')

beforeEach(() => {
  store.setState(createInitialState())
  ui.setState({ activeTank: 'main', levelUp: null, welcomeBack: null })
  foodItems.length = 0
})

test('v1 migration preserves coins, renamed catfish, layout, and owned background', () => {
  const background = BACKGROUND_CATALOG.find((b) => b.cost > 0)!
  const decoration = createInitialState().placedDecorations[0]
  const result = migrate({ currency: 417, ownedFish: [{ id: 'old', defId: 'catfish' }],
    placedDecorations: [decoration], backgroundId: background.id }, 1)
  assert.equal(result.currency, 417)
  assert.equal(result.ownedFish[0].defId, 'cory-catfish')
  assert.ok(result.ownedFish[0].name)
  assert.ok(result.fishVitals.old)
  assert.deepEqual(result.placedDecorations, [decoration])
  assert.ok(result.unlockedBackgroundIds.includes(background.id))
  assert.equal(result.backgroundId, background.id)
  assert.ok(result.treats.bloodworms > 0)
  assert.equal(result.aquariumName, 'My Aquarium')
  assert.equal(result.ownedFish[0].habitat, 'main')
})

test('v2 migration gives existing fish a main tank home and keeps their progress', () => {
  const original = createInitialState()
  const fishId = original.ownedFish[0].id
  const result = migrate({ ...original, aquariumName: undefined, nurserySession: undefined,
    ownedFish: original.ownedFish.map(({ habitat: _habitat, ...fish }) => fish),
    fishVitals: { ...original.fishVitals, [fishId]: { hunger: 0.3, growth: 0.9, mealsEaten: 8 } },
  }, 2)
  assert.equal(result.ownedFish[0].habitat, 'main')
  assert.equal(result.fishVitals[fishId].growth, 0.9)
  assert.equal(result.aquariumName, 'My Aquarium')
  assert.equal(result.nurserySession, null)
})

test('v3 migration keeps a pending friendship and adds an empty egg list', () => {
  const old = createInitialState()
  const [first, second] = old.ownedFish
  old.ownedFish = old.ownedFish.map((fish) => [first.id, second.id].includes(fish.id) ? { ...fish, habitat: 'nursery' } : fish)
  old.fishVitals[first.id].growth = 1
  old.fishVitals[second.id].growth = 1
  old.nurserySession = { parentIds: [first.id, second.id], remainingSeconds: 42 }
  const result = migrate({ ...old, nurseryEggs: undefined }, 3)
  assert.deepEqual(result.nurserySession, { ...old.nurserySession, eggCount: 1 })
  assert.deepEqual(result.nurseryEggs, [])
})

test('aquarium name and nursery homes persist', () => {
  const id = store.getState().ownedFish[0].id
  store.getState().renameAquarium('  Bubble House  ')
  assert.equal(store.getState().transferFish(id, 'nursery'), true)
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(saved.aquariumName, 'Bubble House')
  assert.equal(saved.ownedFish[0].habitat, 'nursery')
  store.getState().renameAquarium('   ')
  assert.equal(store.getState().aquariumName, 'Bubble House')
})

test('starter and purchased fish keep an individual size within their species range', () => {
  for (const def of FISH_CATALOG) {
    assert.ok(def.sizeRange[0] > 0 && def.sizeRange[0] <= 1 && def.sizeRange[1] >= 1)
    assert.ok(def.eggCountRange[0] >= 1 && def.eggCountRange[1] <= 6)
  }
  assert.ok(FISH_CATALOG.some((def) => def.eggCountRange[0] === 1))
  assert.ok(FISH_CATALOG.some((def) => def.eggCountRange[1] === 6))
  const initial = createInitialState()
  for (const fish of initial.ownedFish) {
    const range = FISH_CATALOG.find((def) => def.id === fish.defId)!.sizeRange
    assert.ok(fish.sizeScale >= range[0] && fish.sizeScale <= range[1])
  }
  const id = store.getState().buyFish('goldfish')!
  const bought = store.getState().ownedFish.find((fish) => fish.id === id)!
  const [min, max] = FISH_CATALOG.find((def) => def.id === 'goldfish')!.sizeRange
  assert.ok(bought.sizeScale >= min && bought.sizeScale <= max)
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate(saved, 4).ownedFish.find((fish) => fish.id === id)?.sizeScale, bought.sizeScale)
  assert.ok(sizeForGrowth(0.1, bought.sizeScale) < sizeForGrowth(1, bought.sizeScale))
})

test('friendship samples a species clutch once and reserves its full capacity through reload', () => {
  const [first, second, third] = store.getState().ownedFish
  const [min, max] = getEggCountRange(first.defId)
  assert.ok(min >= 1 && max <= 6 && min <= max)
  assert.notDeepEqual(getEggCountRange(first.defId), getEggCountRange(second.defId))
  store.setState((s) => ({
    ownedFish: s.ownedFish.map((fish) => [first.id, second.id].includes(fish.id) ? { ...fish, habitat: 'nursery' as const } : fish),
    fishVitals: { ...s.fishVitals,
      [first.id]: { ...s.fishVitals[first.id], growth: 1 },
      [second.id]: { ...s.fishVitals[second.id], growth: 1 },
    },
  }))
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  const count = store.getState().nurserySession!.eggCount
  assert.ok(count >= min && count <= max)
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate(saved, 4).nurserySession?.eggCount, count)
  assert.equal(store.getState().transferFish(third.id, 'nursery'),
    store.getState().ownedFish.filter((fish) => fish.habitat === 'nursery').length + count < NURSERY_CAPACITY)
  store.setState((s) => ({ nurserySession: { ...s.nurserySession!, remainingSeconds: 1 } }))
  store.getState().tick()
  assert.equal(store.getState().nurseryEggs.length, count)
  assert.equal(store.getState().ownedFish.length, 3)
})

test('any two fully grown fish can become nursery friends and make a clutch that hatches later', () => {
  const [first, second] = store.getState().ownedFish
  assert.notEqual(first.defId, second.defId)
  assert.equal(store.getState().transferFish(first.id, 'nursery'), true)
  assert.equal(store.getState().transferFish(second.id, 'nursery'), true)
  assert.equal(store.getState().startFriendship(first.id, second.id), false)
  store.setState((s) => ({ fishVitals: {
    ...s.fishVitals,
    [first.id]: { ...s.fishVitals[first.id], growth: 1 },
    [second.id]: { ...s.fishVitals[second.id], growth: 1 },
  } }))
  assert.equal(store.getState().startFriendship(first.id, first.id), false)
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  assert.equal(store.getState().nurserySession?.remainingSeconds, FRIENDSHIP_SECONDS)
  const clutchCount = store.getState().nurserySession!.eggCount
  store.setState((s) => ({ nurserySession: { ...s.nurserySession!, remainingSeconds: 1 } }))
  store.getState().tick()
  const result = store.getState()
  assert.equal(result.nurserySession, null)
  assert.equal(result.ownedFish.length, 3)
  assert.equal(result.nurseryEggs.length, clutchCount)
  for (const egg of result.nurseryEggs) {
    assert.ok([first.defId, second.defId].includes(egg.defId))
    assert.ok(egg.hatchSeconds >= getEggHatchRange(egg.defId)[0])
    assert.ok(egg.hatchSeconds <= getEggHatchRange(egg.defId)[1])
    assert.equal(egg.remainingSeconds, egg.hatchSeconds)
    assert.equal(egg.inheritance?.bodyParentId, egg.defId === first.defId ? first.id : second.id)
    assert.equal(egg.inheritance?.colorParentId, egg.defId === first.defId ? second.id : first.id)
  }
  store.getState().tick()
  assert.equal(store.getState().ownedFish.length, 3)
  assert.equal(store.getState().nurseryEggs.length, clutchCount)
  store.setState((s) => ({ nurseryEggs: s.nurseryEggs.map((item) => ({ ...item, remainingSeconds: 1 })) }))
  store.getState().tick()
  assert.equal(store.getState().nurseryEggs.length, 0)
  assert.equal(store.getState().ownedFish.length, 3 + clutchCount)
  const baby = store.getState().ownedFish.at(-1)!
  assert.equal(baby.habitat, 'nursery')
  assert.ok([first.defId, second.defId].includes(baby.defId))
  assert.deepEqual(baby.inheritance, result.nurseryEggs.at(-1)?.inheritance)
  assert.ok(baby.sizeScale >= getFishDef(baby.defId)!.sizeRange[0])
  assert.ok(baby.sizeScale <= getFishDef(baby.defId)!.sizeRange[1])
  const savedBaby = JSON.parse(storage.get('aquarium-save')!).state.ownedFish.at(-1)
  assert.equal(savedBaby.sizeScale, baby.sizeScale)
  assert.equal(migrate(JSON.parse(storage.get('aquarium-save')!).state, 5).ownedFish.at(-1)?.sizeScale, baby.sizeScale)
  assert.ok(store.getState().fishVitals[baby.id].growth < 1)
  assert.ok(store.getState().ownedFish.some((f) => f.id === first.id))
  assert.ok(store.getState().ownedFish.some((f) => f.id === second.id))
  assert.equal(store.getState().transferFish(baby.id, 'main'), true)
  assert.equal(store.getState().ownedFish.at(-1)?.habitat, 'main')
  store.getState().tick()
  assert.equal(store.getState().ownedFish.length, 3 + clutchCount)
})

test('nine regular meals make a starter fish fully grown and eligible', () => {
  const [first, second] = store.getState().ownedFish
  for (let i = 0; i < 9; i++) {
    store.getState().fishAte(first.id, 'pellets')
    store.getState().fishAte(second.id, 'pellets')
  }
  assert.equal(store.getState().fishVitals[first.id].growth, 1)
  assert.equal(store.getState().fishVitals[second.id].growth, 1)
  assert.equal(store.getState().transferFish(first.id, 'nursery'), true)
  assert.equal(store.getState().transferFish(second.id, 'nursery'), true)
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
})

test('nursery reserves room for a full clutch, and moving a parent ends the friendship', () => {
  const [first, second] = store.getState().ownedFish
  const maxClutch = getEggCountRange(first.defId)[1]
  const extra = Array.from({ length: NURSERY_CAPACITY - 2 }, (_, i) => ({
    ...first, id: `extra-${i}`, name: `Extra ${i}`, habitat: 'nursery' as const,
  }))
  store.setState((s) => ({
    ownedFish: [...s.ownedFish.map((f) => f.id === first.id || f.id === second.id ? { ...f, habitat: 'nursery' as const } : f), ...extra],
    fishVitals: { ...s.fishVitals, [first.id]: { ...s.fishVitals[first.id], growth: 1 }, [second.id]: { ...s.fishVitals[second.id], growth: 1 } },
  }))
  assert.equal(store.getState().startFriendship(first.id, second.id), false)
  store.setState((s) => ({ ownedFish: s.ownedFish.filter((f) => !extra.slice(0, maxClutch).some((e) => e.id === f.id)) }))
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  store.setState((s) => ({ nurserySession: { ...s.nurserySession!, eggCount: maxClutch } }))
  assert.equal(store.getState().transferFish(store.getState().ownedFish.find((f) => f.habitat === 'main')!.id, 'nursery'), false)
  assert.equal(store.getState().transferFish(first.id, 'main'), true)
  assert.equal(store.getState().nurserySession, null)
  assert.equal(store.getState().transferFish(first.id, 'nursery'), true)
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  assert.ok(store.getState().sellFish(second.id) > 0)
  assert.equal(store.getState().nurserySession, null)
})

test('eggs occupy nursery spots, including the reserved clutch', () => {
  const [first, second, third] = store.getState().ownedFish
  const maxClutch = getEggCountRange(first.defId)[1]
  const eggs = Array.from({ length: NURSERY_CAPACITY - 2 - maxClutch }, (_, i) => ({
    ...createNurseryEgg(first, second), id: `egg-${i}`,
  }))
  store.setState((s) => ({
    ownedFish: s.ownedFish.map((f) => [first.id, second.id].includes(f.id) ? { ...f, habitat: 'nursery' as const } : f),
    fishVitals: { ...s.fishVitals,
      [first.id]: { ...s.fishVitals[first.id], growth: 1 },
      [second.id]: { ...s.fishVitals[second.id], growth: 1 },
    },
    nurseryEggs: eggs,
  }))
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  store.setState((s) => ({ nurserySession: { ...s.nurserySession!, eggCount: maxClutch } }))
  assert.equal(store.getState().transferFish(third.id, 'nursery'), false)
  store.setState((s) => ({ nurserySession: { ...s.nurserySession!, remainingSeconds: 1 } }))
  store.getState().tick()
  assert.equal(store.getState().nurseryEggs.length, NURSERY_CAPACITY - 2)
  assert.equal(store.getState().startFriendship(first.id, second.id), false)
  assert.equal(store.getState().transferFish(third.id, 'nursery'), false)
})

test('each egg saves its species-specific hatch time without rerolling on reload', () => {
  const [first, second] = store.getState().ownedFish
  const egg = createNurseryEgg(first, second)
  const [min, max] = getEggHatchRange(egg.defId)
  assert.ok(egg.hatchSeconds >= min && egg.hatchSeconds <= max)
  assert.equal(egg.remainingSeconds, egg.hatchSeconds)
  assert.notDeepEqual(getEggHatchRange('goldfish'), getEggHatchRange('neon-tetra'))
  store.setState({ nurseryEggs: [egg] })
  store.getState().tick()
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(saved.nurseryEggs[0].hatchSeconds, egg.hatchSeconds)
  assert.equal(saved.nurseryEggs[0].remainingSeconds, egg.hatchSeconds - 1)
  assert.deepEqual(migrate(saved, 4).nurseryEggs, saved.nurseryEggs)
})

test('offspring inherit one parent body and the other parent actual palette across generations', () => {
  const [first, second, third] = createInitialState().ownedFish
  const firstEgg = createNurseryEgg(first, second)
  const colorParent = firstEgg.inheritance!.colorParentId === first.id ? first : second
  const inheritedColors = basePalette(colorParent)
  assert.equal(firstEgg.inheritance?.color, inheritedColors.color)
  assert.equal(firstEgg.inheritance?.color2, inheritedColors.color2)
  assert.equal(firstEgg.inheritance?.color3, inheritedColors.color3)
  const grownChild = { ...first, id: 'second-generation-parent', name: 'Junior', defId: firstEgg.defId,
    inheritance: firstEgg.inheritance }
  const secondEgg = createNurseryEgg(grownChild, third)
  const nextColorParent = secondEgg.inheritance!.colorParentId === grownChild.id ? grownChild : third
  const nextBodyParent = secondEgg.inheritance!.bodyParentId === grownChild.id ? grownChild : third
  const inheritedAgain = basePalette(nextColorParent)
  assert.equal(secondEgg.defId, nextBodyParent.defId)
  assert.equal(secondEgg.inheritance?.color, inheritedAgain.color)
  assert.equal(secondEgg.inheritance?.color2, inheritedAgain.color2)
  assert.equal(secondEgg.inheritance?.color3, inheritedAgain.color3)
  const state = createInitialState()
  const restored = migrate({ ...state, ownedFish: [...state.ownedFish, grownChild], nurseryEggs: [secondEgg] }, 4)
  assert.deepEqual(restored.ownedFish.at(-1)?.inheritance, grownChild.inheritance)
  assert.deepEqual(restored.nurseryEggs[0].inheritance, secondEgg.inheritance)
})

test('a hatchling starts small and grows steadily to adult size', () => {
  assert.equal(sizeForGrowth(0.1), 0.5)
  assert.ok(sizeForGrowth(0.1) < sizeForGrowth(0.5))
  assert.ok(sizeForGrowth(0.5) < sizeForGrowth(1))
  assert.equal(sizeForGrowth(1), 1.22)
})

test('offline catch-up applies only time left after friendship to the new egg', () => {
  const [first, second] = store.getState().ownedFish
  store.setState((s) => ({
    ownedFish: s.ownedFish.map((f) => ({ ...f, habitat: 'nursery' as const })),
    fishVitals: Object.fromEntries(Object.entries(s.fishVitals).map(([id, v]) => [id, { ...v, growth: 1 }])),
  }))
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  const clutchCount = store.getState().nurserySession!.eggCount
  store.setState({ lastTickTimestamp: Date.now() - (FRIENDSHIP_SECONDS + 30) * 1000 })
  store.getState().applyOfflineProgress()
  const egg = store.getState().nurseryEggs[0]
  assert.ok(egg)
  assert.equal(store.getState().ownedFish.length, 3)
  assert.ok(Math.abs(egg.remainingSeconds - (egg.hatchSeconds - 30)) < 0.1)
  store.getState().applyOfflineProgress()
  assert.equal(store.getState().nurseryEggs.length, clutchCount)
  assert.equal(store.getState().nurseryEggs[0].id, egg.id)
})

test('offline friendship and hatching complete once, and selling an adult earns more in a clean tank', () => {
  const [first, second] = store.getState().ownedFish
  store.setState((s) => ({
    ownedFish: s.ownedFish.map((f) => [first.id, second.id].includes(f.id) ? { ...f, habitat: 'nursery' as const } : f),
    fishVitals: { ...s.fishVitals, [first.id]: { ...s.fishVitals[first.id], growth: 1 }, [second.id]: { ...s.fishVitals[second.id], growth: 1 } },
  }))
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  const clutchCount = store.getState().nurserySession!.eggCount
  store.setState({ lastTickTimestamp: Date.now() - (FRIENDSHIP_SECONDS + 600) * 1000 })
  store.getState().applyOfflineProgress()
  assert.equal(store.getState().ownedFish.length, 3 + clutchCount)
  assert.equal(store.getState().nurseryEggs.length, 0)
  for (const baby of store.getState().ownedFish.slice(3)) {
    const [min, max] = getFishDef(baby.defId)!.sizeRange
    assert.ok(baby.sizeScale >= min && baby.sizeScale <= max)
  }
  store.getState().applyOfflineProgress()
  assert.equal(store.getState().ownedFish.length, 3 + clutchCount)
  const baby = store.getState().ownedFish.at(-1)!
  assert.ok(store.getState().salePrice(first.id) > store.getState().salePrice(baby.id))
  const cleanPrice = store.getState().salePrice(first.id)
  assert.ok(cleanPrice > FISH_CATALOG.find((f) => f.id === first.defId)!.cost)
  store.setState({ murk: 1, waste: Array.from({ length: 25 }, (_, i) => ({ id: `w-${i}`, x: 0, z: 0, size: 1, kind: 'poop' as const })) })
  assert.ok(store.getState().salePrice(first.id) < cleanPrice)
  store.setState({ murk: 0, waste: [] })
  const before = store.getState().currency
  const price = store.getState().salePrice(first.id)
  assert.equal(store.getState().sellFish(first.id), price)
  assert.equal(store.getState().currency, before + price)
  assert.equal(store.getState().fishVitals[first.id], undefined)
  assert.equal(store.getState().sellFish(first.id), 0)
})

test('passive income is a small trickle', () => {
  assert.ok(PASSIVE_COINS_PER_SECOND <= 0.02)
})

test('all five shops enforce level locks without spending coins', () => {
  store.setState({ currency: 10000, xp: 0 })
  assert.equal(store.getState().buyFish(FISH_CATALOG.find((d) => d.unlockLevel > 1)!.id), null)
  assert.equal(store.getState().buyDecoration(DECORATION_CATALOG.find((d) => d.unlockLevel > 1)!.id), false)
  assert.equal(store.getState().buyTreatPack(FOOD_CATALOG.find((d) => d.unlockLevel > 1)!.id), false)
  assert.equal(store.getState().buyBackground(BACKGROUND_CATALOG.find((d) => d.unlockLevel > 1)!.id), false)
  assert.equal(store.getState().buySubstrate(SUBSTRATE_CATALOG.find((d) => d.unlockLevel > 1)!.id), false)
  assert.equal(store.getState().currency, 10000)
})

test('buying an available fish charges once, initializes vitals, and persists it', () => {
  const fish = FISH_CATALOG.find((d) => d.unlockLevel === 1)!
  store.setState({ currency: 1000 })
  const id = store.getState().buyFish(fish.id)!
  assert.ok(id)
  assert.equal(store.getState().currency, 1000 - fish.cost)
  assert.ok(store.getState().fishVitals[id])
  assert.ok(JSON.parse(storage.get('aquarium-save')!).state.ownedFish.some((f: { id: string }) => f.id === id))
})

test('starter treats work before their shop unlock and cannot go negative', () => {
  store.setState({ treats: { 'golden-pellet': 1 } })
  assert.equal(store.getState().useFood('golden-pellet'), true)
  assert.equal(store.getState().useFood('golden-pellet'), false)
  assert.equal(store.getState().treats['golden-pellet'], 0)
  assert.equal(store.getState().useFood('pellets'), true)
})

test('eating reduces hunger, grows fish, and grants XP', () => {
  const id = store.getState().ownedFish[0].id
  const before = store.getState().fishVitals[id]
  store.getState().fishAte(id, 'growth-formula')
  const after = store.getState().fishVitals[id]
  assert.ok(after.hunger < before.hunger)
  assert.equal(after.growth, before.growth + 0.25)
  assert.equal(after.mealsEaten, 1)
  assert.equal(store.getState().xp, 3)
})

test('uneaten food settles, rots, and vacuum rewards only actual removals', () => {
  const count = dropFood('pellets', 0, 0)
  for (let step = 0; step < 1200; step++) updateFood(0.05, step * 0.05)
  assert.equal(foodItems.length, 0)
  assert.equal(store.getState().waste.length, count)
  const ids = store.getState().waste.map((w) => w.id)
  const before = store.getState().currency
  assert.equal(store.getState().removeWaste(ids), count)
  assert.equal(store.getState().removeWaste(ids), 0)
  assert.equal(store.getState().currency, before + count)
  assert.equal(store.getState().waste.length, 0)
})

test('vacuum can remove leftovers before they rot', () => {
  const count = dropFood('pellets', 0, 0)
  for (const food of foodItems) food.state = 'resting'
  assert.equal(vacuumFoodNear(0, 0, 1), count)
  assert.equal(foodItems.length, 0)
  assert.equal(store.getState().waste.length, 0)
})

test('food remains isolated by tank and main food keeps settling while nursery is shown', () => {
  const mainCount = dropFood('pellets', 0, 0)
  for (const food of foodItems) food.state = 'resting'
  ui.getState().setActiveTank('nursery')
  assert.equal(vacuumFoodNear(0, 0, 1), 0)
  assert.equal(foodItems.length, mainCount)
  const nurseryCount = dropFood('pellets', 0, 0)
  assert.equal(foodItems.filter((f) => f.habitat === 'nursery').length, nurseryCount)
  for (let step = 0; step < 1200; step++) updateFood(0.05, step * 0.05)
  assert.equal(foodItems.length, 0)
  assert.equal(store.getState().waste.length, mainCount)
})

test('cleanup creatures grow by grazing even when they need no hand feeding', () => {
  const snail = FISH_CATALOG.find((f) => f.appetite === 0)!
  const id = 'grazing-creature'
  store.setState((s) => ({
    ownedFish: [...s.ownedFish, { id, defId: snail.id, name: 'Munchkin', bornAt: Date.now(), habitat: 'nursery' }],
    fishVitals: { ...s.fishVitals, [id]: { hunger: 0, growth: 0.1, mealsEaten: 0 } },
    lastTickTimestamp: Date.now() - 3600000,
  }))
  store.getState().applyOfflineProgress()
  assert.equal(store.getState().fishVitals[id].growth, 1)
})

test('water changes pay for dirty water only', () => {
  store.setState({ murk: 0.5 })
  const before = store.getState().currency
  store.getState().waterChange()
  assert.equal(store.getState().murk, 0)
  assert.equal(store.getState().currency, before + 6)
  store.getState().waterChange()
  assert.equal(store.getState().currency, before + 6)
})

test('level-up rewards and offline earnings are applied once', () => {
  store.getState().grantXp(50)
  assert.equal(levelFromXp(store.getState().xp).level, 2)
  assert.equal(ui.getState().levelUp?.level, 2)
  store.setState({ lastTickTimestamp: Date.now() - 3600000 })
  const before = store.getState().currency
  store.getState().applyOfflineProgress()
  const after = store.getState().currency
  assert.ok(after > before)
  assert.ok(ui.getState().welcomeBack)
  store.getState().applyOfflineProgress()
  assert.equal(store.getState().currency, after)
})

test('algae grows, scrubs, and survives a save/load roundtrip', () => {
  storage.delete('aquarium-algae')
  loadAlgae(0.2)
  const before = algaeCoverage()
  growAlgae(60, 0.2)
  assert.ok(algaeCoverage() > before)
  const grown = algaeCoverage()
  assert.ok(scrubAlgae(4, 2, 1, 1) > 0)
  assert.ok(algaeCoverage() < grown)
  saveAlgae()
  const saved = algaeCoverage()
  loadAlgae(0.2)
  assert.ok(Math.abs(algaeCoverage() - saved) < 0.004)
})

test('cleaning tools: buying requires level and coins, equips by category, and survives sanitize', () => {
  assert.deepEqual(store.getState().ownedToolIds, ['sponge', 'vacuum'])
  store.setState({ currency: 5000 })
  assert.equal(store.getState().buyTool('squeegee'), false, 'locked until level 3')
  store.setState({ xp: 10_000 })
  assert.equal(store.getState().buyTool('squeegee'), true)
  assert.equal(store.getState().equippedGlassTool, 'squeegee')
  assert.equal(store.getState().equippedGravelTool, 'vacuum')
  assert.equal(store.getState().buyTool('squeegee'), false, 'no double purchase')
  store.getState().equipTool('sponge')
  assert.equal(store.getState().equippedGlassTool, 'sponge')
  store.getState().equipTool('hydro-vac')
  assert.equal(store.getState().equippedGravelTool, 'vacuum', 'cannot equip an unowned tool')
  const restored = migrate({ ...store.getState(), equippedGravelTool: 'hydro-vac', ownedToolIds: ['squeegee', 'bogus'] }, 4)
  assert.deepEqual(restored.ownedToolIds, ['sponge', 'vacuum', 'squeegee'])
  assert.equal(restored.equippedGravelTool, 'vacuum')
})

test('stands: buy, switch, and fall back to walnut for unknown saves', () => {
  store.setState({ currency: 5000, xp: 10_000 })
  assert.equal(store.getState().standId, 'walnut')
  assert.equal(store.getState().buyStand('pirate'), true)
  assert.equal(store.getState().standId, 'pirate')
  store.getState().setStand('walnut')
  assert.equal(store.getState().standId, 'walnut')
  store.getState().setStand('galaxy')
  assert.equal(store.getState().standId, 'walnut', 'cannot use a stand you do not own')
  const restored = migrate({ ...createInitialState(), standId: 'nope', unlockedStandIds: undefined }, 4)
  assert.equal(restored.standId, 'walnut')
  assert.deepEqual(restored.unlockedStandIds, ['walnut'])
})

test('gadget bonuses switch on with one placed copy and slow algae and murk', async () => {
  const { bonusesFor } = await import('../src/state/bonuses')
  const none = bonusesFor([])
  assert.equal(none.algaeRate, 1)
  const placed = [
    { id: 'a', defId: 'marimo-moss', position: [0, 0, 0] as [number, number, number], rotationY: 0 },
    { id: 'b', defId: 'marimo-moss', position: [1, 0, 0] as [number, number, number], rotationY: 0 },
    { id: 'c', defId: 'bubble-filter', position: [2, 0, 0] as [number, number, number], rotationY: 0 },
    { id: 'd', defId: 'auto-feeder', position: [-2, 0, 0] as [number, number, number], rotationY: 0 },
  ]
  const on = bonusesFor(placed)
  assert.equal(on.algaeRate, 0.65, 'copies do not stack')
  assert.equal(on.murkRate, 0.6)
  assert.equal(on.autoFeeder, true)

  store.setState({ murk: 0, waste: [] })
  store.getState().tick()
  const plainMurk = store.getState().murk
  store.setState({ murk: 0, placedDecorations: placed })
  store.getState().tick()
  assert.ok(store.getState().murk < plainMurk)

  // Away for an hour: the auto-feeder keeps main-tank fish from starving.
  const fishId = store.getState().ownedFish[0].id
  store.setState({ lastTickTimestamp: Date.now() - 6 * 3600_000, fishVitals: { ...store.getState().fishVitals, [fishId]: { hunger: 0.2, growth: 0.3, mealsEaten: 0 } } })
  store.getState().applyOfflineProgress()
  assert.ok(store.getState().fishVitals[fishId].hunger <= 0.45)
})

test('relocated waste stays inside the tank', () => {
  store.getState().addWaste(0, 0, 'poop')
  const id = store.getState().waste[0].id
  store.getState().relocateWaste([{ id, x: 99, z: -99 }])
  const w = store.getState().waste[0]
  assert.ok(Math.abs(w.x) < 4 && Math.abs(w.z) < 2)
})

test('feeder pellets fountain up before sinking, and fish can lead falling food', () => {
  const spout = new THREE.Vector3(0, 1.4, 0)
  releaseFoodAt('pellets', spout, 6)
  assert.equal(foodItems.length, 6)
  for (let i = 0; i < 20; i++) updateFood(0.05, i * 0.05)
  assert.ok(foodItems.some((f) => f.position.y > spout.y + 0.2), 'pellets should rise above the lantern first')
  for (let i = 0; i < 400; i++) updateFood(0.05, 1 + i * 0.05)
  assert.ok(foodItems.every((f) => f.state === 'resting'), 'pellets eventually settle')

  foodItems.length = 0
  dropFood('pellets', 1, 0.5)
  for (let i = 0; i < 30; i++) updateFood(0.05, i * 0.05)
  const pellet = foodItems[0]
  assert.equal(pellet.state, 'sinking')
  const ahead = predictFood(pellet, 1, new THREE.Vector3())
  assert.ok(ahead.y < pellet.position.y, 'a sinking pellet is predicted lower')
  const later = predictFood(pellet, 60, new THREE.Vector3())
  assert.ok(Math.abs(later.y - (floorHeightAt(later.x, later.z) + 0.02)) < 1e-6, 'prediction stops at the gravel')
})

test('late game unlocks something new at every level from 13 to 30', () => {
  const catalogs = [...FISH_CATALOG, ...DECORATION_CATALOG, ...BACKGROUND_CATALOG, ...SUBSTRATE_CATALOG, ...FOOD_CATALOG]
  for (let level = 13; level <= 30; level++) {
    assert.ok(catalogs.some((d) => d.unlockLevel === level), `nothing unlocks at level ${level}`)
  }
})

test('rare morphs: rare by default, likelier from a morph parent, worn over the base palette', () => {
  assert.equal(rollMorph([], () => 0.99), undefined)
  assert.equal(rollMorph([], () => 0.2), undefined)
  assert.ok(rollMorph([], () => 0))
  // A morph parent raises the odds and often passes on its own morph.
  const rolls = [0.2, 0.1, 0]
  assert.equal(rollMorph(['midnight'], () => rolls.shift()!), 'midnight')
  const inheritance = { bodyParentName: 'A', colorParentName: 'B', bodyParentId: 'a', colorParentId: 'b', color: '#123456', color2: '#654321', morph: 'golden' as const }
  const golden = inheritedDefinition({ defId: 'guppy', inheritance })!
  assert.equal(golden.color, getMorph('golden')!.color)
  const parent: FishInstance = { ...createInitialState().ownedFish[1], inheritance }
  const egg = createNurseryEgg(parent, parent)
  assert.equal(egg.inheritance?.color, '#123456')
})

test('fishpedia records each species once, nursery stamps and morphs, with rewards that persist', () => {
  const book = store.getState().fishpedia
  assert.ok(book.goldfish && book.guppy && book['neon-tetra'])
  const fresh = FISH_CATALOG.find((d) => d.unlockLevel <= 2 && !book[d.id])!
  store.setState({ currency: 5000, xp: 60 })
  store.getState().buyFish(fresh.id)
  const firstBuyXp = Math.max(3, Math.round(fresh.cost / 20))
  assert.equal(store.getState().xp, 60 + firstBuyXp + DISCOVERY_XP[fresh.rarity])
  assert.ok(store.getState().fishpedia[fresh.id])
  store.getState().buyFish(fresh.id)
  assert.equal(store.getState().xp, 60 + firstBuyXp * 2 + DISCOVERY_XP[fresh.rarity])

  const parent = store.getState().ownedFish[0]
  const def = getFishDef(parent.defId)!
  const coins = store.getState().currency
  const hatchling: FishInstance = { ...parent, id: 'hatchling', inheritance: { bodyParentName: 'A', colorParentName: 'B', bodyParentId: 'a', colorParentId: 'b', color: '#fff', color2: '#000', morph: 'golden' } }
  store.getState().noteFish([hatchling], true)
  store.getState().noteFish([hatchling], true)
  const entry = store.getState().fishpedia[parent.defId]
  assert.equal(entry.bred, true)
  assert.deepEqual(entry.morphs, ['golden'])
  assert.equal(store.getState().currency, coins + BRED_COINS[def.rarity] + MORPH_COINS)

  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.deepEqual(saved.fishpedia[parent.defId].morphs, ['golden'])
  const restored = migrate({ ...saved, fishpedia: { ...saved.fishpedia, 'not-a-fish': { discoveredAt: 1 } } }, 5)
  assert.deepEqual(restored.fishpedia[parent.defId].morphs, ['golden'])
  assert.equal(restored.fishpedia['not-a-fish'], undefined)
  // Old saves without a book get one filled in from the fish they own.
  const { fishpedia: _book, ...legacy } = saved
  assert.ok(migrate(legacy, 5).fishpedia[fresh.id])
})

test('shop rules give every block a reason, and nursery babies do not fill the aquarium', () => {
  const fish = FISH_CATALOG.find((d) => d.unlockLevel === 1)!
  const locked = FISH_CATALOG.find((d) => d.unlockLevel > 1)!
  store.setState({ currency: 0, xp: 0 })
  const s = store.getState()
  assert.equal(checkPurchase(s, 'fish', locked.id).reason, 'locked')
  assert.match(purchaseProblem(checkPurchase(s, 'fish', locked.id), locked.name, 0)!, new RegExp(`unlocks at level ${locked.unlockLevel}`))
  const short = checkPurchase(s, 'fish', fish.id)
  assert.equal(short.reason, 'short')
  assert.ok(purchaseProblem(short, fish.name, 0)!.includes(`costs ${fish.cost.toLocaleString()} coins. You need ${fish.cost.toLocaleString()} more.`))
  assert.equal(checkPurchase(s, 'decorations', s.unlockedDecorationDefIds[0]).reason, 'owned')
  assert.equal(checkPurchase(s, 'treats', 'pellets').reason, 'missing')
  assert.equal(checkPurchase(s, 'fish', 'not-a-fish').reason, 'missing')

  // One spot left in the aquarium, plus babies in the nursery: still room for one more.
  const template = s.ownedFish[0]
  const crowd = Array.from({ length: MAX_OWNED_FISH - 1 }, (_, i) => ({ ...template, id: `crowd-${i}`, habitat: 'main' as const }))
  const babies = Array.from({ length: 3 }, (_, i) => ({ ...template, id: `baby-${i}`, habitat: 'nursery' as const }))
  const everyone = [...crowd, ...babies]
  store.setState({ currency: 100000, ownedFish: everyone, fishVitals: Object.fromEntries(everyone.map((f) => [f.id, freshVitals()])) })
  assert.equal(checkPurchase(store.getState(), 'fish', fish.id).ok, true)
  assert.ok(store.getState().buyFish(fish.id))
  assert.equal(checkPurchase(store.getState(), 'fish', fish.id).reason, 'full')
  assert.equal(store.getState().buyFish(fish.id), null)
  assert.match(transferProblem(store.getState(), 'baby-0', 'main')!, /aquarium is full/)
  assert.equal(store.getState().transferFish('baby-0', 'main'), false)
})

test('moving and pairing fish explain exactly why they cannot happen', () => {
  const [first, second, third] = store.getState().ownedFish
  assert.match(friendshipProblem(store.getState(), first.id, second.id)!, new RegExp(`${first.name} needs to be in the nursery`))
  store.setState((s) => ({ ownedFish: s.ownedFish.map((f) => (f.id === first.id || f.id === second.id ? { ...f, habitat: 'nursery' as const } : f)) }))
  assert.match(friendshipProblem(store.getState(), first.id, second.id)!, /needs to finish growing first \(\d+% grown\)/)
  assert.equal(friendshipReady(store.getState()), false)
  store.setState((s) => ({
    fishVitals: { ...s.fishVitals, [first.id]: { ...s.fishVitals[first.id], growth: 1 }, [second.id]: { ...s.fishVitals[second.id], growth: 1 } },
  }))
  assert.equal(friendshipProblem(store.getState(), first.id, second.id), null)
  assert.equal(friendshipProblem(store.getState(), first.id, first.id), 'Pick two different fish.')
  assert.equal(friendshipReady(store.getState()), true)
  assert.equal(store.getState().startFriendship(first.id, second.id), true)
  assert.match(friendshipProblem(store.getState(), first.id, second.id)!, /already under way/)
  assert.equal(friendshipReady(store.getState()), false)
  assert.match(transferProblem(store.getState(), first.id, 'nursery')!, /already there/)

  const filler = Array.from({ length: NURSERY_CAPACITY }, (_, i) => ({ ...third, id: `filler-${i}`, habitat: 'nursery' as const }))
  store.setState((s) => ({ ownedFish: [...s.ownedFish, ...filler] }))
  assert.match(transferProblem(store.getState(), third.id, 'nursery')!, /nursery is full \(\d+\/\d+\)\. Eggs keep their spot/)
  assert.equal(store.getState().transferFish(third.id, 'nursery'), false)
})

test('"new" badges count shop unlocks and hatchlings since the last look, and old saves start caught up', () => {
  assert.equal(newShopCount(store.getState().seen.shopLevel, levelFromXp(store.getState().xp).level), 0)
  store.getState().grantXp(5000)
  const level = levelFromXp(store.getState().xp).level
  const shopItems = [
    ...FISH_CATALOG, ...DECORATION_CATALOG, ...BACKGROUND_CATALOG, ...SUBSTRATE_CATALOG,
    ...FOOD_CATALOG.filter((d) => !d.unlimited), ...STAND_CATALOG, ...TOOL_CATALOG, ...TANK_SIZES,
  ]
  const expected = shopItems.filter((d) => d.unlockLevel > 1 && d.unlockLevel <= level).length
  assert.ok(expected > 0)
  assert.equal(newShopCount(store.getState().seen.shopLevel, level), expected)
  assert.ok(firstNewShopCategory(store.getState().seen.shopLevel, level))
  store.getState().markShopSeen()
  assert.equal(newShopCount(store.getState().seen.shopLevel, level), 0)
  assert.equal(JSON.parse(storage.get('aquarium-save')!).state.seen.shopLevel, level)

  // Saves from before the badges don't light up the whole shop.
  const { seen: _seen, ...legacy } = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate({ ...legacy, xp: 5000 }, 6).seen.shopLevel, levelFromXp(5000).level)

  const parent = store.getState().ownedFish[0]
  const baby: FishInstance = { ...parent, id: 'new-baby', habitat: 'nursery', bornAt: Date.now() + 1000,
    inheritance: { bodyParentName: 'A', colorParentName: 'B', bodyParentId: 'a', colorParentId: 'b', color: '#fff', color2: '#000' } }
  store.setState((s) => ({ ownedFish: [...s.ownedFish, baby], fishVitals: { ...s.fishVitals, [baby.id]: freshVitals() } }))
  assert.equal(newHatchlings(store.getState()), 1)
  store.setState((s) => ({ seen: { ...s.seen, nurseryAt: baby.bornAt } }))
  assert.equal(newHatchlings(store.getState()), 0)
})

test('every game field is saved, and nothing else', () => {
  store.getState().renameAquarium('Saved Tank')
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(createInitialState()).sort())
})

test('fishpedia rewards group a big batch of discoveries into one message', () => {
  const fresh = FISH_CATALOG.slice(0, 4).map((def, i): FishInstance => ({
    id: `pedia-${i}`, defId: def.id, name: `Pedia ${i}`, bornAt: Date.now(), habitat: 'main', sizeScale: 1,
  }))
  const found = recordFish({}, fresh, false)
  const reward = discoveryRewards({}, found)
  assert.equal(reward.news, 4)
  assert.equal(reward.xp, fresh.reduce((n, f) => n + DISCOVERY_XP[getFishDef(f.defId)!.rarity], 0))
  assert.equal(reward.toasts.length, 1)
  assert.match(reward.toasts[0].text, /4 new Fishpedia entries/)
})

test('tank lights follow the real clock, and the player can override until the next dawn or dusk', async () => {
  const { clockNight, nightLevel } = await import('../src/sim/daylight')
  const at = (h: number, m = 0) => new Date(2026, 9, 2, h, m)
  assert.equal(clockNight(at(12)), 0)
  assert.equal(clockNight(at(23)), 1)
  assert.equal(clockNight(at(3)), 1)
  assert.ok(clockNight(at(19, 45)) > 0.3 && clockNight(at(19, 45)) < 0.7)
  assert.ok(clockNight(at(6, 15)) > 0.3 && clockNight(at(6, 15)) < 0.7)
  // Lights down at noon stays night until the evening, then the clock takes over again.
  const pick = { night: true, phase: false }
  assert.deepEqual(nightLevel(pick, at(14)), { level: 1, override: pick })
  const evening = nightLevel(pick, at(22))
  assert.deepEqual(evening, { level: 1, override: null })
  // The game re-checks every second, so the cleared pick doesn't come back next morning.
  assert.deepEqual(nightLevel(evening.override, at(9)), { level: 0, override: null })
})

test('beauty rewards variety and style sets, and its stars speed up coin bubbles', async () => {
  const { beautyOf, SET_TIERS } = await import('../src/state/beauty')
  const { bonusesFor } = await import('../src/state/bonuses')
  const place = (ids: string[]) => ids.map((defId, i) => ({ id: `d${i}`, defId, position: [0, 0, 0] as [number, number, number], rotationY: 0 }))
  const nature = DECORATION_CATALOG.filter((d) => d.styleTags.includes('nature'))
  const one = nature[0].id
  // Ten copies of one thing score far less than ten different things.
  const copies = beautyOf(place(Array(10).fill(one)))
  const variety = beautyOf(place(nature.slice(0, 10).map((d) => d.id)))
  assert.ok(variety.score > copies.score * 3)
  assert.equal(copies.sets.find((s) => s.style === 'nature')?.count, 1)
  // Three different nature pieces make a set; eight make the biggest one.
  const set3 = beautyOf(place(nature.slice(0, 3).map((d) => d.id))).sets.find((s) => s.style === 'nature')!
  assert.equal(set3.tier, 1)
  assert.equal(set3.next, SET_TIERS[1].count)
  assert.ok(nature.length >= 8)
  assert.equal(beautyOf(place(nature.slice(0, 8).map((d) => d.id))).sets.find((s) => s.style === 'nature')!.tier, 3)
  // Stars feed the coin-bubble rate.
  const lots = place(DECORATION_CATALOG.filter((d) => !d.bonus).map((d) => d.id))
  const beauty = beautyOf(lots)
  assert.equal(beauty.stars, 5)
  assert.ok(Math.abs(bonusesFor(lots).coinRate - (1 + beauty.coinBonus)) < 1e-9)
  assert.equal(beautyOf([]).stars, 0)
})

test('daily wishes: three a day, progress counts from when they were given, and claims pay once', async () => {
  const { rollWishes, wishProgress, claimableCount, wishReward, dayKey } = await import('../src/state/goals')
  const s = store.getState()
  const a = rollWishes(s, '2026-10-02')
  assert.deepEqual(rollWishes(s, '2026-10-02'), a)
  assert.equal(a.wishes.length, 3)
  assert.equal(new Set(a.wishes.map((w) => w.id)).size, 3)

  store.getState().refreshGoals()
  const daily = store.getState().daily
  assert.equal(daily.day, dayKey())
  const wish = daily.wishes[0]
  assert.equal(wishProgress(store.getState(), wish), 0)
  assert.equal(store.getState().claimWish(wish.id), false)
  store.getState().noteStat(wish.stat, wish.target)
  assert.equal(claimableCount(store.getState()), 1)
  const coins = store.getState().currency
  assert.equal(store.getState().claimWish(wish.id), true)
  assert.equal(store.getState().currency, coins + wishReward(levelFromXp(store.getState().xp).level).coins)
  assert.equal(store.getState().claimWish(wish.id), false)
  // Finish the rest, then the bonus.
  for (const w of store.getState().daily.wishes.slice(1)) {
    store.getState().noteStat(w.stat, w.target)
    assert.ok(store.getState().claimWish(w.id))
  }
  assert.equal(claimableCount(store.getState()), 1)
  assert.ok(store.getState().claimWishBonus())
  assert.equal(store.getState().claimWishBonus(), false)
  assert.equal(claimableCount(store.getState()), 0)

  // A new day: finished-but-unclaimed wishes still pay, then fresh ones arrive.
  const old = rollWishes(store.getState(), '2000-01-01')
  store.setState({ daily: old })
  store.getState().noteStat(old.wishes[0].stat, old.wishes[0].target)
  const before = store.getState().currency
  store.getState().refreshGoals()
  assert.equal(store.getState().daily.day, dayKey())
  assert.ok(store.getState().currency >= before + wishReward(levelFromXp(store.getState().xp).level).coins)
  assert.ok(store.getState().daily.wishes.every((w) => !w.claimed))
})

test('trophies pay out once when reached, and saved goals survive a reload', async () => {
  const { TROPHIES } = await import('../src/state/goals')
  store.getState().refreshGoals()
  assert.equal(store.getState().trophies['bubbles'], undefined)
  store.getState().noteStat('bubblesPopped', 50)
  const coins = store.getState().currency
  store.getState().refreshGoals()
  assert.ok(store.getState().trophies['bubbles'])
  const prize = TROPHIES.find((t) => t.id === 'bubbles')!.coins
  assert.ok(store.getState().currency >= coins + prize)
  const after = store.getState().currency
  store.getState().refreshGoals()
  assert.equal(store.getState().currency, after)

  const saved = JSON.parse(storage.get('aquarium-save')!).state
  const restored = migrate({ ...saved }, 6)
  assert.ok(restored.trophies['bubbles'])
  assert.equal(restored.daily.day, saved.daily.day)
  // Old saves without goals start clean, and nonsense is dropped.
  const { daily: _d, trophies: _t, ...legacy } = saved
  const fresh = migrate(legacy, 6)
  assert.deepEqual(fresh.trophies, {})
  assert.equal(fresh.daily.wishes.length, 0)
  assert.equal(migrate({ ...saved, daily: { day: 5, wishes: 'x' } }, 6).daily.wishes.length, 0)
})

test('visitors come for what they like, and every one is findable from its hint', async () => {
  const { VISITORS, canVisit, eligibleVisitors, pickVisitor, visitSpot } = await import('../src/state/visitors')
  const decor = new Set(DECORATION_CATALOG.map((d) => d.id))
  for (const v of VISITORS) {
    // Everything a visitor asks for exists, and there's always a hint.
    for (const id of [...(v.needs.any ?? []), ...(v.needs.all ?? [])]) assert.ok(decor.has(id), `${v.id} wants ${id}`)
    assert.ok(v.hint.length > 10 && v.likes.length > 3)
    assert.equal(v.look.appetite, 0)
    assert.equal(v.look.coinValue, 0)
  }
  const place = (...ids: string[]) => ids.map((defId, i) => ({ id: `d${i}`, defId, position: [i - 2, 0, 0] as [number, number, number], rotationY: 0 }))
  const crab = VISITORS.find((v) => v.id === 'treasure-crab')!
  const ghost = VISITORS.find((v) => v.id === 'ghost-shrimp')!
  const dragon = VISITORS.find((v) => v.id === 'sea-dragon')!
  assert.equal(canVisit(crab, place('rock-cluster'), 'day'), false)
  assert.equal(canVisit(crab, place('treasure-chest'), 'day'), true)
  // Night-only guests wait for dark, but may still visit while you're away.
  assert.equal(canVisit(ghost, place('glow-mushrooms'), 'day'), false)
  assert.equal(canVisit(ghost, place('glow-mushrooms'), 'night'), true)
  assert.equal(canVisit(ghost, place('glow-mushrooms'), 'any'), true)
  // "All" means all.
  assert.equal(canVisit(dragon, place('tall-kelp'), 'day'), false)
  assert.equal(canVisit(dragon, place('tall-kelp', 'temple-ruins'), 'day'), true)
  // The starter tank already tempts someone.
  assert.ok(eligibleVisitors(createInitialState().placedDecorations, 'day').length > 0)

  // Strangers are likelier than old friends, and nobody comes twice in a row if others could.
  const pool = eligibleVisitors(place('treasure-chest', 'air-stone'), 'day')
  assert.equal(pool.length, 2)
  let newcomer = 0
  for (let i = 0; i < 400; i++) if (pickVisitor(pool, { 'bubble-goby': { visits: 3, first: 1 } }, Math.random)!.id === 'treasure-crab') newcomer++
  assert.ok(newcomer > 260, `newcomer picked ${newcomer}/400`)
  for (let i = 0; i < 20; i++) assert.equal(pickVisitor(pool, {}, Math.random, 'treasure-crab')!.id, 'bubble-goby')
  assert.equal(pickVisitor([], {}, Math.random), null)
  // Gifts land beside the decoration it came for.
  const [x, z] = visitSpot(crab, place('treasure-chest'), () => 0.25)
  assert.ok(Math.hypot(x - -2, z) < 1.2)
})

test('visitors are recorded once, leave gifts that pay once, and drop by while you are away', async () => {
  const { MAX_GIFTS, giftReward, getVisitor, FIRST_VISIT_XP } = await import('../src/state/visitors')
  const xp = store.getState().xp
  store.getState().visitorArrived('bubble-goby')
  assert.equal(store.getState().visitors['bubble-goby'].visits, 1)
  assert.equal(store.getState().xp, xp + FIRST_VISIT_XP.common)
  store.getState().visitorArrived('bubble-goby')
  assert.equal(store.getState().visitors['bubble-goby'].visits, 2)
  assert.equal(store.getState().xp, xp + FIRST_VISIT_XP.common)
  assert.equal(store.getState().stats.visits, 2)
  store.getState().visitorArrived('nobody')
  assert.equal(store.getState().stats.visits, 2)

  store.getState().leaveGift('bubble-goby', 0.5, 0.2)
  const gift = store.getState().gifts[0]
  assert.equal(gift.coins, giftReward(getVisitor('bubble-goby')!, levelFromXp(store.getState().xp).level).coins)
  const coins = store.getState().currency
  assert.ok(store.getState().openGift(gift.id))
  assert.equal(store.getState().currency, coins + gift.coins)
  assert.equal(store.getState().openGift(gift.id), null)
  assert.equal(store.getState().stats.giftsOpened, 1)
  // A full gravel opens the oldest gift to make room.
  for (let i = 0; i < MAX_GIFTS + 2; i++) store.getState().leaveGift('bubble-goby', 0, 0)
  assert.equal(store.getState().gifts.length, MAX_GIFTS)
  assert.equal(store.getState().stats.giftsOpened, 3)

  // An hour away brings a few visits, each with a gift, and the welcome back says who came.
  store.setState({ gifts: [], visitors: {}, lastTickTimestamp: Date.now() - 65 * 60 * 1000 })
  store.getState().applyOfflineProgress()
  const away = ui.getState().welcomeBack?.visitors ?? []
  assert.equal(away.length, 3)
  assert.equal(store.getState().gifts.length, 3)
  assert.ok(away.every((id) => store.getState().visitors[id]))

  // Saved visitors and gifts survive a reload; junk is dropped.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  const restored = migrate({ ...saved }, 6)
  assert.deepEqual(restored.visitors, store.getState().visitors)
  assert.equal(restored.gifts.length, 3)
  const junk = migrate({ ...saved, visitors: { nobody: { visits: 1, first: 1 }, 'bubble-goby': { visits: 'x' } }, gifts: [{ id: 'g', visitorId: 'bubble-goby', x: NaN }] }, 6)
  assert.deepEqual(junk.visitors, {})
  assert.deepEqual(junk.gifts, [])
})

test('a shared tank link round-trips the tank, keeps names private, and survives tampering', async () => {
  const { encodeTank, decodeTank, packTank, unpackTank, shareCodeFrom, shareLink, visitState, DEFAULT_SHARED_NAME } = await import('../src/state/share')
  const s = store.getState()
  const fish = s.ownedFish.map((f, i) => (i === 0 ? { ...f, inheritance: { bodyParentName: 'Mum', colorParentName: 'Dad', bodyParentId: 'a', colorParentId: 'b', color: '#7a3cff', color2: '#ffd24a', morph: 'aurora' as const, pattern: 'tiger' as const } } : f))
  const tank = { ...s, aquariumName: 'Sparkle Reef', ownedFish: fish }
  for (const code of [await encodeTank(tank), `j${Buffer.from(JSON.stringify(packTank(tank))).toString('base64url')}`]) {
    const back = (await decodeTank(code))!
    assert.equal(back.name, 'Sparkle Reef')
    assert.deepEqual(back.decorations.map((d) => d.defId), tank.placedDecorations.map((d) => d.defId))
    assert.deepEqual(back.fish.map((f) => f.defId), fish.map((f) => f.defId))
    // Species names only; parents' names and ids never leave home.
    assert.ok(back.fish.every((f) => f.name === getFishDef(f.defId)!.name))
    assert.equal(back.fish[0].inheritance?.color, '#7a3cff')
    assert.equal(back.fish[0].inheritance?.morph, 'aurora')
    assert.equal(back.fish[0].inheritance?.pattern, 'tiger')
    assert.equal(back.fish[0].inheritance?.bodyParentName, '')
    assert.equal(shareCodeFrom(shareLink(code, 'https://example.com/game/')), code)
  }
  // Nursery fish stay home.
  const nursery = { ...tank, ownedFish: [...fish, { ...fish[0], id: 'baby', habitat: 'nursery' as const }] }
  assert.equal(packTank(nursery).f.length, fish.length)

  // Anything odd is dropped or clamped rather than trusted.
  const odd = unpackTank({
    v: 1,
    n: '\u0007   ' + 'x'.repeat(60),
    b: 'not-a-background',
    g: 42,
    s: 'walnut',
    d: [['treasure-chest', 999, -999, 1], ['nope', 0, 0, 0], 'junk', ['air-stone', NaN, 0, 0]],
    f: [['koi', 99, 7], ['ghost', 1, 1], ['goldfish', 1, 1, 'red', '#00ff00']],
  })!
  assert.equal(odd.name.length, 28)
  assert.equal(odd.backgroundId, createInitialState().backgroundId)
  assert.deepEqual(odd.decorations.map((d) => d.defId), ['treasure-chest', 'air-stone'])
  assert.ok(Math.abs(odd.decorations[0].position[0]) < 5 && Math.abs(odd.decorations[0].position[2]) < 3)
  assert.equal(odd.fish.length, 2)
  assert.equal(odd.fish[0].sizeScale, getFishDef('koi')!.sizeRange[1])
  assert.equal(odd.growth[odd.fish[0].id], 1)
  assert.equal(odd.fish[1].inheritance, undefined)
  assert.equal(unpackTank({ v: 1, n: '', d: [], f: [] })!.name, DEFAULT_SHARED_NAME)
  assert.equal(unpackTank({ v: 2, d: [], f: [] }), null)
  assert.equal(unpackTank('hello'), null)
  assert.equal(await decodeTank('zNotReallyCompressed'), null)
  assert.equal(await decodeTank('q123'), null)
  assert.equal(shareCodeFrom('hello there'), null)
  const big = { v: 1, n: 'Big', d: Array.from({ length: 500 }, () => ['air-stone', 0, 0, 0]), f: Array.from({ length: 500 }, () => ['guppy', 1, 1]) }
  const capped = unpackTank(big)!
  assert.ok(capped.decorations.length <= 80)
  assert.equal(capped.fish.length, MAX_OWNED_FISH)

  // Visiting shows their tank with content fish and no leftovers of yours.
  const view = visitState(odd)
  assert.equal(view.ownedFish!.length, 2)
  assert.deepEqual(view.gifts, [])
  assert.ok(Object.values(view.fishVitals!).every((v) => v.hunger < 0.3))
})

test('fish personalities are stable, favourites are gettable, and happy schools and favourites pay a little more', async () => {
  const { personalityOf, TRAITS, moodBonus, schoolSize, tryPet, PET_COOLDOWN_MS, SCHOOL_SIZE, SCHOOL_COIN_BONUS, FAVORITE_COIN_BONUS } = await import('../src/state/personality')
  const { FISH_FACTS } = await import('../src/state/facts')
  assert.deepEqual(personalityOf('fish-a'), personalityOf('fish-a'))
  const traits = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const p = personalityOf(`fish-${i}`)
    traits.add(p.trait)
    const decor = DECORATION_CATALOG.find((d) => d.id === p.favoriteDecor)!
    assert.ok(decor && !decor.bonus && !['epic', 'legendary'].includes(decor.rarity))
    assert.ok(FOOD_CATALOG.some((f) => f.id === p.favoriteTreat && !f.unlimited))
  }
  assert.equal(traits.size, Object.keys(TRAITS).length)

  const tetras = Array.from({ length: SCHOOL_SIZE }, (_, i) => ({ id: `t${i}`, defId: 'neon-tetra', name: 'T', bornAt: 0, habitat: 'main' as const, sizeScale: 1 }))
  const goldie = { id: 'g', defId: 'goldfish', name: 'G', bornAt: 0, habitat: 'main' as const, sizeScale: 1 }
  assert.equal(schoolSize(goldie, [goldie]), null)
  assert.equal(schoolSize(tetras[0], tetras.slice(0, 3)), 3)
  assert.equal(moodBonus('t0', tetras.slice(0, 4), []), 1)
  assert.equal(moodBonus('t0', tetras, []), 1 + SCHOOL_COIN_BONUS)
  const fav = { id: 'd', defId: personalityOf('g').favoriteDecor, position: [0, 0, 0] as [number, number, number], rotationY: 0 }
  assert.equal(moodBonus('g', [goldie], []), 1)
  assert.equal(moodBonus('g', [goldie], [fav]), 1 + FAVORITE_COIN_BONUS)

  // Petting pays once an hour per fish.
  assert.equal(tryPet('pet-me', 1000), true)
  assert.equal(tryPet('pet-me', 2000), false)
  assert.equal(tryPet('pet-me', 1000 + PET_COOLDOWN_MS), true)

  // Every species has a fun fact.
  for (const def of FISH_CATALOG) assert.ok(FISH_FACTS[def.id], `fact for ${def.id}`)
})

test('releasing grown fish to the Open Ocean pays like a sale, keeps them in the ocean, and raises the tide forever', async () => {
  const { tideFor, tideThreshold, tideReward, oceanTotals } = await import('../src/state/ocean')
  assert.equal(tideFor(0), 0)
  assert.equal(tideFor(3), 1)
  assert.equal(tideFor(149), 8)
  assert.equal(tideFor(150), 9)
  assert.equal(tideFor(195), 10)
  for (let t = 1; t < 30; t++) assert.ok(tideThreshold(t + 1) > tideThreshold(t))
  assert.ok(tideReward(5).coins > tideReward(1).coins)

  const [baby, ...grown] = store.getState().ownedFish
  store.setState({ fishVitals: { ...store.getState().fishVitals, [baby.id]: freshVitals(), ...Object.fromEntries(grown.map((f) => [f.id, { hunger: 0.2, growth: 1, mealsEaten: 9 }])) } })
  // Babies can only be sold.
  assert.equal(store.getState().releaseFish(baby.id), null)
  assert.ok(store.getState().ownedFish.some((f) => f.id === baby.id))

  const target = grown[0]
  const price = store.getState().salePrice(target.id)
  const coins = store.getState().currency
  const xp = store.getState().xp
  assert.equal(store.getState().releaseFish(target.id), price)
  const s = store.getState()
  assert.ok(!s.ownedFish.some((f) => f.id === target.id))
  assert.equal(s.currency, coins + price)
  assert.ok(s.xp > xp)
  assert.equal(s.ocean.at(-1)!.name, target.name)
  assert.equal(s.stats.released, 1)
  assert.equal(store.getState().releaseFish(target.id), null)

  // Reaching a tide pays coins and treats.
  store.setState({ stats: { ...store.getState().stats, released: 2 } })
  const before = store.getState()
  const reward = tideReward(1)
  store.getState().releaseFish(grown[1].id)
  const after = store.getState()
  assert.equal(oceanTotals(after).tide, 1)
  assert.ok(after.currency >= before.currency + reward.coins)
  assert.equal(after.treats[reward.treat], (before.treats[reward.treat] ?? 0) + reward.treatCount)

  // The ocean is saved, and odd entries are dropped.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate({ ...saved }, 6).ocean.length, 2)
  assert.deepEqual(migrate({ ...saved, ocean: [{ id: 'x', defId: 'nope', name: 'X', at: 1 }, 'junk'] }, 6).ocean, [])
})

test('the ocean book remembers how each fish looked and can be sorted, filtered and searched', async () => {
  const { oceanLooks, oceanRoster, hasSpecialPattern } = await import('../src/state/ocean')
  const { fishPreviewKey } = await import('../src/state/usePreviewStore')
  const guppy = getFishDef('guppy')!
  // A store-bought fish has nothing special to remember; a hatchling keeps its morph, pattern and its own colours.
  assert.deepEqual(oceanLooks({ defId: 'guppy' }), {})
  const family = { bodyParentName: 'A', colorParentName: 'B', bodyParentId: 'a', colorParentId: 'b' }
  assert.deepEqual(oceanLooks({ defId: 'guppy', inheritance: { ...family, color: guppy.color, color2: guppy.color2, color3: guppy.color3 } }), {})
  assert.deepEqual(oceanLooks({ defId: 'guppy', inheritance: { ...family, color: '#112233', color2: '#445566', morph: 'aurora', pattern: 'spots' } }), {
    morph: 'aurora',
    pattern: 'spots',
    color: '#112233',
    color2: '#445566',
  })
  // Its own colours make a different thumbnail, unless a morph covers them.
  const palette = { color: '#112233', color2: '#445566' }
  assert.notEqual(fishPreviewKey('guppy', undefined, undefined, palette), fishPreviewKey('guppy'))
  assert.equal(fishPreviewKey('guppy', 'golden', undefined, palette), fishPreviewKey('guppy', 'golden'))

  const shark = getFishDef('reef-shark')!
  const ocean = [
    { id: '1', defId: 'guppy', name: 'Zed', at: 300 },
    { id: '2', defId: 'reef-shark', name: 'Amy', at: 100, morph: 'golden' as const },
    { id: '3', defId: 'guppy', name: 'Bo', at: 200, pattern: 'tiger' as const },
    { id: '4', defId: 'guppy', name: 'Cy', at: 400, pattern: guppy.pattern },
  ]
  const names = (list: typeof ocean) => list.map((f) => f.name)
  assert.deepEqual(names(oceanRoster(ocean, 'newest')), ['Cy', 'Zed', 'Bo', 'Amy'])
  assert.deepEqual(names(oceanRoster(ocean, 'oldest')), ['Amy', 'Bo', 'Zed', 'Cy'])
  assert.deepEqual(names(oceanRoster(ocean, 'name')), ['Amy', 'Bo', 'Cy', 'Zed'])
  assert.equal(oceanRoster(ocean, 'rarest')[0].defId, shark.rarity === 'common' ? 'guppy' : 'reef-shark')
  assert.deepEqual(names(oceanRoster(ocean, 'newest', 'rare-colours')), ['Amy'])
  // Wearing your species' usual pattern isn't special.
  assert.ok(!hasSpecialPattern(ocean[3]))
  assert.deepEqual(names(oceanRoster(ocean, 'newest', 'patterns')), ['Bo'])
  assert.deepEqual(names(oceanRoster(ocean, 'newest', 'all', 'zE')), ['Zed'])
  assert.equal(oceanRoster(ocean, 'newest', 'all', 'shark').length, 1)
  // Sorting never changes the saved list.
  assert.deepEqual(names(ocean), ['Zed', 'Amy', 'Bo', 'Cy'])

  // Saved colours survive a reload; bad ones are dropped.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  const kept = migrate({ ...saved, ocean: [{ id: 'k', defId: 'guppy', name: 'K', at: 1, color: '#112233', color2: '#445566' }, { id: 'j', defId: 'guppy', name: 'J', at: 2, color: 'red', color2: '#445566' }] }, 6).ocean
  assert.equal(kept[0].color, '#112233')
  assert.equal(kept[1].color, undefined)
})

test('seasons follow the calendar, sell their pieces only in season, and bring their own visitors', async () => {
  const { seasonOn, SEASONS } = await import('../src/state/seasons')
  const { checkPurchase: check, purchaseProblem: problem } = await import('../src/state/rules')
  const { canVisit, getVisitor, YEAR_ROUND, VISITORS } = await import('../src/state/visitors')
  const day = (m: number, d: number) => new Date(2026, m - 1, d, 12)
  assert.equal(seasonOn(day(10, 1))?.id, 'spooky-seas')
  assert.equal(seasonOn(day(11, 2))?.id, 'spooky-seas')
  assert.equal(seasonOn(day(11, 3)), null)
  assert.equal(seasonOn(day(12, 25))?.id, 'winter-lights')
  assert.equal(seasonOn(day(1, 6))?.id, 'winter-lights')
  assert.equal(seasonOn(day(4, 1))?.id, 'spring-bloom')
  assert.equal(seasonOn(day(7, 4))?.id, 'summer-reef')
  // Every season has a piece in the shop and a visitor who loves it.
  for (const s of SEASONS) {
    const piece = DECORATION_CATALOG.find((d) => d.season === s.id)!
    assert.ok(piece, s.id)
    assert.ok(VISITORS.some((v) => v.needs.season === s.id && v.needs.any?.includes(piece.id)), `${s.id} visitor`)
  }
  assert.ok(YEAR_ROUND.every((v) => !v.needs.season))

  const state = { ...store.getState(), currency: 10000 }
  const current = seasonOn()
  for (const piece of DECORATION_CATALOG.filter((d) => d.season)) {
    const c = check(state, 'decorations', piece.id)
    if (piece.season === current?.id) assert.ok(c.ok, piece.id)
    else {
      assert.equal(c.reason, 'season')
      assert.match(problem(c, piece.name, 10000)!, /comes back for/)
    }
  }
  const ghost = getVisitor('ghost-jelly')!
  const pumpkin = [{ id: 'p', defId: 'jack-o-lantern', position: [0, 0, 0] as [number, number, number], rotationY: 0 }]
  assert.equal(canVisit(ghost, pumpkin, 'day', day(10, 20)), true)
  assert.equal(canVisit(ghost, pumpkin, 'any', day(3, 1)), false)
})

test('late-game helpers tidy waste and polish algae on their own', async () => {
  const { bonusesFor } = await import('../src/state/bonuses')
  const { runHelpers } = await import('../src/sim/helpers')
  const { algaeCoverage, growAlgae } = await import('../src/sim/algae')
  const place = (...ids: string[]) => ids.map((defId, i) => ({ id: `h${i}`, defId, position: [i - 1, 0, 0] as [number, number, number], rotationY: 0 }))
  assert.equal(bonusesFor(place('rock-cluster')).tidy, false)
  assert.equal(bonusesFor(place('robo-vac')).tidy, true)
  assert.equal(bonusesFor(place('scrub-tower')).scrub, true)
  for (const id of ['robo-vac', 'scrub-tower']) assert.ok(DECORATION_CATALOG.find((d) => d.id === id)!.unlockLevel >= 20)

  store.setState({ placedDecorations: place('robo-vac', 'scrub-tower') })
  store.getState().addWaste(0.5, 0.2, 'poop')
  store.getState().addWaste(-0.5, 0.2, 'poop')
  growAlgae(20 * 60, 0.5)
  const algae = algaeCoverage()
  for (let i = 0; i < 25; i++) runHelpers(1)
  assert.equal(store.getState().waste.length, 1)
  assert.ok(algaeCoverage() < algae)
})

test('patterns pass from either parent, matching parents can surprise, and the Fishpedia collects them', async () => {
  const { rollPattern, patternOf, PATTERNS, SURPRISE_CHANCE, PATTERN_COINS, patternsFound } = await import('../src/state/patterns')
  const seq = (...values: number[]) => () => values.shift() ?? 0.5
  // Different parents: one or the other, never a surprise.
  assert.equal(rollPattern('spots', 'stripe', seq(0.1)), 'spots')
  assert.equal(rollPattern('spots', 'stripe', seq(0.9)), 'stripe')
  for (let i = 0; i < 200; i++) assert.ok(['spots', 'stripe'].includes(rollPattern('spots', 'stripe')))
  // Matching parents: usually theirs, sometimes something neither has.
  assert.equal(rollPattern('spots', 'spots', seq(SURPRISE_CHANCE + 0.01, 0.2)), 'spots')
  const surprise = rollPattern('spots', 'spots', seq(0, 0.99))
  assert.notEqual(surprise, 'spots')
  let surprises = 0
  for (let i = 0; i < 2000; i++) if (rollPattern('tiger', 'tiger') !== 'tiger') surprises++
  assert.ok(surprises > 300 && surprises < 500, `surprises ${surprises}`)

  // Eggs carry a pattern for fish bodies only, and babies wear it.
  const mk = (defId: string, pattern?: string) => ({ id: crypto.randomUUID(), defId, name: defId, bornAt: 0, habitat: 'nursery' as const, sizeScale: 1, ...(pattern ? { inheritance: { bodyParentName: '', colorParentName: '', bodyParentId: '', colorParentId: '', color: '#ff0000', color2: '#00ff00', pattern: pattern as 'spots' } } : {}) })
  const egg = createNurseryEgg(mk('goldfish'), mk('goldfish', 'spots'))
  assert.ok(['gradient', 'spots'].includes(egg.inheritance!.pattern!))
  assert.equal(createNurseryEgg(mk('seahorse'), mk('seahorse')).inheritance!.pattern, undefined)
  const baby = { ...mk('goldfish'), inheritance: { ...egg.inheritance!, pattern: 'tiger' as const } }
  assert.equal(inheritedDefinition(baby)!.pattern, 'tiger')
  assert.equal(patternOf(mk('clownfish')), 'bands')

  // A new pattern goes in the book once, with a reward; a species' own pattern is already there.
  const before = recordFish({}, [mk('goldfish')], false).book
  const found = recordFish(before, [baby], true)
  assert.deepEqual(found.patterns, [{ defId: 'goldfish', pattern: 'tiger' }])
  const reward = discoveryRewards(before, found)
  assert.ok(reward.coins >= PATTERN_COINS)
  assert.deepEqual(recordFish(found.book, [baby], true).patterns, [])
  assert.deepEqual([...patternsFound(getFishDef('goldfish')!, found.book.goldfish)].sort(), ['gradient', 'tiger'])
  assert.equal(PATTERNS.length, 9)

  // Saves keep good patterns and drop junk.
  const saved = migrate({ ...store.getState(), fishpedia: { goldfish: { discoveredAt: 1, patterns: ['tiger', 'nope', 'gradient'] } } } as never, 6)
  assert.deepEqual(saved.fishpedia.goldfish.patterns, ['tiger'])
  const eggSave = migrate({ ...store.getState(), ownedFish: [{ ...baby, habitat: 'main', inheritance: { ...baby.inheritance, pattern: 'plaid' } }] } as never, 6)
  assert.equal(eggSave.ownedFish[0].inheritance?.pattern, undefined)
})

test('a hatched baby keeps its egg id (so it can swim out of that egg) and starts there only while fresh', async () => {
  const { hatchStart, rememberEggSpot } = await import('../src/sim/hatching')
  const [first, second] = store.getState().ownedFish
  const egg = { ...createNurseryEgg(first, second), id: 'egg-hatch-test', remainingSeconds: 0.5 }
  store.setState({ nurseryEggs: [egg], lastTickTimestamp: Date.now() - 2000 })
  store.getState().tick()
  const baby = store.getState().ownedFish.find((f) => f.id === 'egg-hatch-test')!
  assert.ok(baby)
  assert.equal(baby.habitat, 'nursery')
  rememberEggSpot('egg-hatch-test', [0.25, 0.3, 0.45])
  assert.deepEqual(hatchStart(baby), [0.25, 0.3, 0.45])
  assert.deepEqual(hatchStart(baby), [0.25, 0.3, 0.45])
  assert.equal(hatchStart({ ...baby, bornAt: Date.now() - 60_000 }), null)
  assert.equal(hatchStart({ ...baby, habitat: 'main' }), null)
})

test('the cleanup crew has jobs, counts them, and earns a stat for every one', async () => {
  const { crewJobFor, crewDidWork, crewJobsDone, TIP_EVERY } = await import('../src/sim/crew')
  const { Vector3 } = await import('three')
  assert.equal(crewJobFor(getFishDef('nerite-snail')), 'glass')
  assert.equal(crewJobFor(getFishDef('cherry-shrimp')), 'gravel')
  assert.equal(crewJobFor(getFishDef('starry-pleco')), 'gravel')
  assert.equal(crewJobFor(getFishDef('goldfish')), null)
  const before = store.getState().stats.crewJobs
  for (let i = 0; i < TIP_EVERY; i++) crewDidWork('crew-test', getFishDef('cherry-shrimp')!, new Vector3())
  assert.equal(crewJobsDone('crew-test'), TIP_EVERY)
  assert.equal(store.getState().stats.crewJobs, before + TIP_EVERY)
})

test('the Koi Pond opens at level 20, takes pond fish straight from the shop, and keeps them out of the aquarium', async () => {
  const { POND_LEVEL, POND_CAPACITY, moveTargets, quickMove, mainTankCount, pondCount } = await import('../src/state/rules')
  const xpFor = (level: number) => { let xp = 0; while (levelFromXp(xp).level < level) xp += 50; return xp }
  const goldie = store.getState().ownedFish[0]
  // Before level 20 the pond is shut.
  assert.match(transferProblem(store.getState(), goldie.id, 'pond')!, /opens at level 20/)
  assert.ok(!moveTargets(store.getState(), goldie).includes('pond'))

  store.setState({ xp: xpFor(POND_LEVEL + 3), currency: 100000 })
  assert.ok(moveTargets(store.getState(), goldie).includes('pond'))
  assert.equal(transferProblem(store.getState(), goldie.id, 'pond'), null)
  assert.ok(store.getState().transferFish(goldie.id, 'pond'))

  // Pond fish arrive in the pond and don't count toward the aquarium's limit.
  const id = store.getState().buyFish('butterfly-koi')!
  const koi = store.getState().ownedFish.find((f) => f.id === id)!
  assert.equal(koi.habitat, 'pond')
  assert.equal(pondCount(store.getState().ownedFish), 2)
  assert.equal(mainTankCount(store.getState().ownedFish), store.getState().ownedFish.length - 2)
  assert.match(transferProblem(store.getState(), koi.id, 'main')!, /pond fish/)
  assert.deepEqual(moveTargets(store.getState(), koi), ['nursery'])
  assert.equal(quickMove(store.getState(), { ...koi, habitat: 'nursery' }), 'pond')

  // A full pond blocks more pond fish, and says why.
  const full = Array.from({ length: POND_CAPACITY }, (_, i) => ({ ...koi, id: `p${i}` }))
  const check = checkPurchase({ ...store.getState(), ownedFish: full }, 'fish', 'comet-goldfish')
  assert.equal(check.reason, 'full')
  assert.match(purchaseProblem(check, 'Comet Goldfish', 0)!, /Koi Pond is full/)

  // Pond fish are saved where they live.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate({ ...saved }, 6).ownedFish.find((f) => f.id === koi.id)?.habitat, 'pond')
})

test('fishing: a few casts a day, fair catches, and caught fish land somewhere with room', async () => {
  const { castsLeft, CASTS_PER_DAY, rollCatch, reelDifficulty, reelHits, markerAt, judgeReel, nextZoneStart, catchableFish, REEL_GRACE } = await import('../src/state/fishing')
  const { dayKey } = await import('../src/state/goals')
  const today = dayKey()
  assert.equal(castsLeft({ day: '2000-01-01', casts: 99 }, today), CASTS_PER_DAY)
  for (let i = 0; i < CASTS_PER_DAY; i++) assert.ok(store.getState().castLine())
  assert.equal(store.getState().castLine(), false)
  assert.equal(castsLeft(store.getState().fishing, today), 0)

  // Catches only include fish already unlocked, and rarer fish are harder to reel in.
  const level1 = catchableFish(1)
  assert.ok(level1.length > 0 && level1.every((d) => d.unlockLevel <= 1))
  for (let i = 0; i < 300; i++) {
    const c = rollCatch(0)
    if (c.kind === 'fish') assert.ok(getFishDef(c.defId)!.unlockLevel <= 1)
    if (c.kind === 'coins') assert.ok(c.coins > 0)
  }
  const easy = reelDifficulty({ kind: 'fish', defId: 'goldfish' })
  const hard = reelDifficulty({ kind: 'fish', defId: 'reef-shark' })
  assert.ok(hard.zone < easy.zone && hard.speed > easy.speed)
  assert.ok(reelHits({ kind: 'fish', defId: 'reef-shark' }) > reelHits({ kind: 'coins', coins: 1, icon: '', name: '' }))
  // The marker crosses at a steady speed and bounces back.
  assert.equal(markerAt(0, 1), 0)
  assert.ok(Math.abs(markerAt(0.25, 1) - 0.5) < 1e-9)
  assert.ok(Math.abs(markerAt(0.5, 1) - 1) < 1e-9)
  assert.ok(Math.abs(markerAt(0.75, 1) - 0.5) < 1e-9)
  // Judging gives a little grace at the zone's edges, and the middle is perfect.
  assert.equal(judgeReel(0.5, 0.4, 0.2), 'perfect')
  assert.equal(judgeReel(0.41, 0.4, 0.2), 'hit')
  assert.equal(judgeReel(0.4 - REEL_GRACE / 2, 0.4, 0.2), 'hit')
  assert.equal(judgeReel(0.4 - REEL_GRACE * 2, 0.4, 0.2), 'miss')
  assert.equal(judgeReel(0.9, 0.4, 0.2), 'miss')
  // After a tap the zone jumps somewhere clear of the marker, inside the bar.
  for (let i = 0; i < 200; i++) {
    const marker = i / 199
    const start = nextZoneStart(0.2, marker)
    assert.ok(start >= 0 && start + 0.2 <= 1)
    assert.ok(marker < start - 0.05 || marker > start + 0.25)
  }

  // Landing a catch pays out, and a fish goes to the nursery when it has room.
  const coins = store.getState().currency
  assert.match(store.getState().landCatch({ kind: 'coins', coins: 40, icon: '🪙', name: 'a pouch of coins' }), /\+40 coins/)
  assert.equal(store.getState().currency, coins + 40)
  const count = store.getState().ownedFish.length
  assert.match(store.getState().landCatch({ kind: 'fish', defId: 'guppy', morph: 'golden' }), /nursery/)
  const caught = store.getState().ownedFish.at(-1)!
  assert.equal(store.getState().ownedFish.length, count + 1)
  assert.equal(caught.habitat, 'nursery')
  assert.equal(caught.inheritance?.morph, 'golden')
  assert.ok(store.getState().fishpedia.guppy?.morphs?.includes('golden'))
  assert.equal(store.getState().stats.fishCaught, 2)
})

test('bigger tanks: bought in the shop, hold more fish, give decorations more room, and travel in shared links', async () => {
  const { TANK_SIZES, aquariumCapacity, applyTankSize, getTankSize } = await import('../src/state/tankSizes')
  const bounds = await import('../src/scene/TankBounds')
  const { packTank, unpackTank, visitState } = await import('../src/state/share')
  const algae = await import('../src/sim/algae')
  // Each size is bigger, dearer, later and holds more fish than the last.
  for (let i = 1; i < TANK_SIZES.length; i++) {
    const [a, b] = [TANK_SIZES[i - 1], TANK_SIZES[i]]
    assert.ok(b.width > a.width && b.depth > a.depth && b.cost > a.cost && b.unlockLevel > a.unlockLevel)
    assert.ok(aquariumCapacity(b.id) > aquariumCapacity(a.id))
  }
  assert.equal(aquariumCapacity('classic'), MAX_OWNED_FISH)
  assert.equal(getTankSize('nope').id, 'classic')

  // Buying one: locked until its level, then it's yours, and every smaller size counts as owned.
  store.setState({ xp: 0, currency: 100000, tankSizeId: 'classic' })
  assert.equal(checkPurchase(store.getState(), 'tanks', 'grand').reason, 'locked')
  store.setState({ xp: 999999 })
  const coins = store.getState().currency
  assert.ok(store.getState().buyTankSize('grand'))
  assert.equal(store.getState().tankSizeId, 'grand')
  assert.equal(store.getState().currency, coins - getTankSize('grand').cost)
  assert.equal(checkPurchase(store.getState(), 'tanks', 'roomy').reason, 'owned')
  assert.equal(checkPurchase(store.getState(), 'tanks', 'panorama').ok, true)
  // Room for more fish than the classic tank.
  const fish = Array.from({ length: MAX_OWNED_FISH }, (_, i) => ({ id: `t${i}`, defId: 'guppy', name: `T${i}`, bornAt: 0, habitat: 'main' as const, sizeScale: 1 }))
  store.setState({ ownedFish: fish })
  assert.equal(checkPurchase(store.getState(), 'fish', 'guppy').ok, true)
  store.setState({ tankSizeId: 'classic' })
  assert.equal(checkPurchase(store.getState(), 'fish', 'guppy').reason, 'full')
  assert.match(purchaseProblem(checkPurchase(store.getState(), 'fish', 'guppy'), 'Guppy', 0)!, /bigger tank/)

  // Resizing moves every wall, the algae grid follows, and decorations can sit right by the glass.
  try {
    const cols = algae.ALGAE_COLS
    applyTankSize('panorama')
    assert.equal(bounds.TANK_WIDTH, 12.5)
    assert.equal(bounds.HALF_DEPTH, 2.9)
    assert.equal(bounds.PERIMETER, 2 * 12.5 + 2 * 5.8)
    assert.equal(bounds.WALLS[1].planeCoord, 6.25 - bounds.GLASS_THICKNESS / 2)
    assert.ok(algae.ALGAE_COLS > cols)
    const [x, z] = bounds.clampDecoration(99, -99, 0.5)
    assert.ok(x > 5.7 && x < 6.25 - 0.4 && z < -2.3 && z > -2.9 + 0.4)
    // Much closer to the glass than fish are kept.
    assert.ok(bounds.clampDecoration(99, 0, 0.5)[0] > bounds.clampToInterior(99, 0, 0.5)[0] + 0.3)
  } finally {
    applyTankSize('classic')
  }
  assert.equal(bounds.TANK_WIDTH, 8)

  // A shared link keeps the tank's size, and its decorations stay where they were.
  store.setState({ tankSizeId: 'panorama', placedDecorations: [{ id: 'far', defId: 'rock-cluster', position: [5.6, 0, 2.3], rotationY: 0 }] })
  const shared = unpackTank(JSON.parse(JSON.stringify(packTank(store.getState()))))!
  assert.equal(shared.tankSizeId, 'panorama')
  assert.deepEqual(shared.decorations[0].position, [5.6, 0, 2.3])
  assert.equal(visitState(shared).tankSizeId, 'panorama')
  // Links from before tanks could grow open as the classic tank.
  const old = packTank({ ...store.getState(), tankSizeId: 'classic' })
  assert.equal('t' in old, false)
  assert.equal(unpackTank(old)!.tankSizeId, 'classic')

  // Saves keep the size; anything odd falls back to the classic tank.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate({ ...saved }, 6).tankSizeId, 'panorama')
  assert.equal(migrate({ ...saved, tankSizeId: 'mansion' }, 6).tankSizeId, 'classic')
  store.setState({ tankSizeId: 'classic', placedDecorations: [], ownedFish: [] })
})

test('nursery upgrades: bought a level at a time, they add room, speed up eggs, feed babies better and can add an egg', async () => {
  const up = await import('../src/state/nurseryUpgrades')
  const { progressNursery } = await import('../src/state/nursery')
  const { transferProblem } = await import('../src/state/rules')
  // Every level costs more and unlocks later than the one before.
  for (const u of up.NURSERY_UPGRADES) {
    for (let i = 1; i < u.tiers.length; i++) {
      assert.ok(u.tiers[i].cost > u.tiers[i - 1].cost && u.tiers[i].unlockLevel > u.tiers[i - 1].unlockLevel)
    }
  }
  assert.deepEqual(createInitialState().nurseryUpgrades, {})
  assert.deepEqual(up.sanitizeNurseryUpgrades({ space: 9, warmth: -1, clutch: 1.7, bogus: 2 }), { space: 3, clutch: 1 })
  assert.deepEqual(up.sanitizeNurseryUpgrades('nope'), {})

  // Locked until its level, then bought one level at a time until it's maxed.
  store.setState({ xp: 0, currency: 100000, nurseryUpgrades: {} })
  assert.match(up.nurseryUpgradeProblem(store.getState(), 'space')!, /level 6/)
  assert.equal(store.getState().buyNurseryUpgrade('space'), false)
  store.setState({ xp: 999999 })
  const coins = store.getState().currency
  for (let i = 0; i < 3; i++) assert.ok(store.getState().buyNurseryUpgrade('space'))
  assert.equal(store.getState().nurseryUpgrades.space, 3)
  assert.equal(store.getState().currency, coins - 1500 - 4500 - 12000)
  assert.equal(store.getState().buyNurseryUpgrade('space'), false)
  assert.match(up.nurseryUpgradeProblem(store.getState(), 'space')!, /fully upgraded/)
  assert.equal(up.nurseryCapacity(store.getState().nurseryUpgrades), NURSERY_CAPACITY + 12)

  // More room: the nursery takes fish past the old limit.
  const little = (id: string, habitat: 'main' | 'nursery') => ({ id, defId: 'goldfish', name: id, bornAt: 0, habitat, sizeScale: 1 })
  const babies = Array.from({ length: NURSERY_CAPACITY }, (_, i) => little(`n${i}`, 'nursery'))
  const visitor = little('m1', 'main')
  store.setState({ ownedFish: [...babies, visitor], nurseryEggs: [], nurserySession: null, placedDecorations: [],
    fishVitals: Object.fromEntries([...babies, visitor].map((f) => [f.id, { hunger: 0.8, growth: 0.2, mealsEaten: 0 }])) })
  assert.equal(transferProblem(store.getState(), 'm1', 'nursery'), null)
  store.setState({ nurseryUpgrades: {} })
  assert.match(transferProblem(store.getState(), 'm1', 'nursery')!, /full \(12\/12\)/)

  // Egg warmer: nursery time runs faster than real time.
  const egg = { ...createNurseryEgg(babies[0], babies[1]), hatchSeconds: 100, remainingSeconds: 100 }
  const base = { ...store.getState(), nurseryEggs: [egg] }
  assert.equal(progressNursery({ ...base, nurseryUpgrades: {} }, 10).nurseryEggs[0].remainingSeconds, 90)
  assert.equal(progressNursery({ ...base, nurseryUpgrades: { warmth: 2 } }, 10).nurseryEggs[0].remainingSeconds, 85)

  // Baby food: nursery fish grow more from each meal; aquarium fish don't get it.
  store.setState({ nurseryUpgrades: { nutrition: 3 } })
  store.getState().fishAte('n0', 'pellets')
  store.getState().fishAte('m1', 'pellets')
  assert.ok(Math.abs(store.getState().fishVitals.n0.growth - (0.2 + 0.1 * 1.9)) < 1e-9)
  assert.ok(Math.abs(store.getState().fishVitals.m1.growth - 0.3) < 1e-9)

  // Nesting moss: a lucky roll adds one egg to the clutch.
  const random = Math.random
  try {
    Math.random = () => 0
    const [min] = getEggCountRange('goldfish')
    const pair = [little('p1', 'nursery'), little('p2', 'nursery')]
    const grown = { ownedFish: pair, nurseryEggs: [], nurserySession: null, fishVitals: { p1: { hunger: 0.2, growth: 1, mealsEaten: 0 }, p2: { hunger: 0.2, growth: 1, mealsEaten: 0 } } }
    store.setState({ ...grown, nurseryUpgrades: {} })
    assert.ok(store.getState().startFriendship('p1', 'p2'))
    assert.equal(store.getState().nurserySession!.eggCount, min)
    store.setState({ ...grown, nurseryUpgrades: { clutch: 1 } })
    assert.ok(store.getState().startFriendship('p1', 'p2'))
    assert.equal(store.getState().nurserySession!.eggCount, min + 1)
  } finally {
    Math.random = random
  }
})

test('lucky charms: gentle nudges to one clutch, carried a few at a time and used up when pairing', async () => {
  const { CHARMS, MAX_CHARMS, luckOf, sanitizeCharms, charmProblem } = await import('../src/state/charms')
  const { PATTERNS, rollPattern, SURPRISE_CHANCE } = await import('../src/state/patterns')
  // Gentle: a clover makes rare colours only a little more likely.
  assert.equal(rollMorph([], () => 0.15), undefined)
  assert.ok(rollMorph([], () => 0.15, luckOf('clover')))
  assert.equal(rollMorph([], () => 0.2, luckOf('clover')), undefined)
  // A moon pearl tilts which rare colour it is toward Midnight and Aurora.
  const rarest = (luck = {}) => {
    let count = 0
    for (let i = 0; i < 1000; i++) {
      let calls = 0
      const morph = rollMorph([], () => (calls++ === 0 ? 0 : i / 1000), luck)
      if (morph === 'midnight' || morph === 'aurora') count++
    }
    return count
  }
  assert.ok(rarest(luckOf('moon')) > rarest() + 100)
  // A pattern shell: more surprises from matching parents, and a few from parents that differ.
  const [a, b] = [PATTERNS[0].id, PATTERNS[1].id]
  assert.equal(rollPattern(a, b, () => 0), a)
  assert.notEqual(rollPattern(a, b, () => 0, luckOf('shell')), a)
  assert.notEqual(rollPattern(a, b, () => 0, luckOf('shell')), b)
  assert.equal(rollPattern(a, a, () => SURPRISE_CHANCE + 0.05, {}), a)
  assert.notEqual(rollPattern(a, a, () => SURPRISE_CHANCE + 0.05, luckOf('shell')), a)
  assert.deepEqual(sanitizeCharms({ clover: 99, shell: -2, moon: 2.5, junk: 3 }), { clover: MAX_CHARMS, moon: 2 })

  // Bought one at a time, locked until their level, with a carry limit.
  store.setState({ xp: 0, currency: 100000, charms: {} })
  assert.match(charmProblem(store.getState(), 'clover')!, /level 8/)
  assert.equal(store.getState().buyCharm('clover'), false)
  store.setState({ xp: 999999 })
  for (let i = 0; i < MAX_CHARMS; i++) assert.ok(store.getState().buyCharm('clover'))
  assert.equal(store.getState().buyCharm('clover'), false)
  assert.match(charmProblem(store.getState(), 'clover')!, /carry/)
  assert.equal(store.getState().currency, 100000 - MAX_CHARMS * CHARMS[0].cost)

  // Pairing with a charm uses it up and remembers it for the clutch; one you don't have is ignored.
  const pair = ['p1', 'p2'].map((id) => ({ id, defId: 'goldfish', name: id, bornAt: 0, habitat: 'nursery' as const, sizeScale: 1 }))
  const grown = { ownedFish: pair, nurseryEggs: [], nurserySession: null,
    fishVitals: { p1: { hunger: 0.2, growth: 1, mealsEaten: 0 }, p2: { hunger: 0.2, growth: 1, mealsEaten: 0 } } }
  store.setState(grown)
  assert.ok(store.getState().startFriendship('p1', 'p2', 'clover'))
  assert.equal(store.getState().nurserySession!.charm, 'clover')
  assert.equal(store.getState().charms.clover, MAX_CHARMS - 1)
  store.setState(grown)
  assert.ok(store.getState().startFriendship('p1', 'p2', 'moon'))
  assert.equal(store.getState().nurserySession!.charm, undefined)
  // The charm survives a reload with the friendship.
  const saved = JSON.parse(storage.get('aquarium-save')!).state
  assert.equal(migrate({ ...saved, nurserySession: { ...saved.nurserySession, charm: 'clover' } }, 6).nurserySession!.charm, 'clover')
  assert.equal(migrate({ ...saved, nurserySession: { ...saved.nurserySession, charm: 'horseshoe' } }, 6).nurserySession!.charm, undefined)
})
