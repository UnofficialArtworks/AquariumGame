import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import './cleaning.test'
import { createInitialState, freshVitals, migrate } from '../src/state/migrations'
import { FISH_CATALOG, getFishDef, MAX_OWNED_FISH } from '../src/scene/fish/fishDefinitions'
import { STAND_CATALOG } from '../src/scene/stands/standDefinitions'
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
    ...FOOD_CATALOG.filter((d) => !d.unlimited), ...STAND_CATALOG, ...TOOL_CATALOG,
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
  const fish = s.ownedFish.map((f, i) => (i === 0 ? { ...f, inheritance: { bodyParentName: 'Mum', colorParentName: 'Dad', bodyParentId: 'a', colorParentId: 'b', color: '#7a3cff', color2: '#ffd24a', morph: 'aurora' as const } } : f))
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
