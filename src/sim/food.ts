import * as THREE from 'three'
import { getFoodDef, type FoodDefinition } from '../scene/food/foodDefinitions'
import { clampToInterior, floorHeightAt, waterLevel } from '../scene/TankBounds'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { addRipple } from './ripples'

export interface FoodItem {
  habitat: 'main' | 'nursery'
  uid: number
  def: FoodDefinition
  /** Fish poop falls through the same system but is never eaten. */
  inedible: boolean
  position: THREE.Vector3
  drift: THREE.Vector3
  state: 'floating' | 'sinking' | 'resting'
  age: number
  restAge: number
  phase: number
  spin: THREE.Euler
  removed: boolean
}

const MAX_FOOD = 90
/** Seconds food can sit on the gravel before it rots into waste. */
const REST_BEFORE_WASTE = 22

export const foodItems: FoodItem[] = []
let uidSeq = 1

const POOP_DEF: FoodDefinition = {
  ...getFoodDef('pellets'),
  id: 'poop',
  name: 'Poop',
  color: '#5a4630',
  sinkSpeed: 0.3,
  floatTime: 0,
}

function spawn(def: FoodDefinition, x: number, y: number, z: number, inedible: boolean): FoodItem {
  const item: FoodItem = {
    habitat: useUIStore.getState().activeTank,
    uid: uidSeq++,
    def,
    inedible,
    position: new THREE.Vector3(x, y, z),
    drift: new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12),
    state: y >= waterLevel.current - 0.05 ? 'floating' : 'sinking',
    age: 0,
    restAge: 0,
    phase: Math.random() * Math.PI * 2,
    spin: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    removed: false,
  }
  if (foodItems.length >= MAX_FOOD) {
    const oldest = foodItems.shift()
    if (oldest) oldest.removed = true
  }
  foodItems.push(item)
  return item
}

/** Drop a pinch of food onto the water surface around (x, z). */
export function dropFood(foodId: string, x: number, z: number): number {
  const def = getFoodDef(foodId)
  const spread = def.pieces > 1 ? 0.28 : 0
  for (let i = 0; i < def.pieces; i++) {
    const [px, pz] = clampToInterior(x + (Math.random() - 0.5) * spread * 2, z + (Math.random() - 0.5) * spread * 2, 0.05)
    spawn(def, px, waterLevel.current - 0.02, pz, false)
  }
  addRipple(x, z, def.pieces > 2 ? 1.2 : 0.8)
  return def.pieces
}

/** Pop a few pieces of food out of a point underwater (the auto-feeder's lantern). */
export function releaseFoodAt(foodId: string, position: THREE.Vector3, pieces: number) {
  const def = getFoodDef(foodId)
  for (let i = 0; i < pieces; i++) {
    const item = spawn(def, position.x, Math.min(position.y, waterLevel.current - 0.1), position.z, false)
    const angle = (i / pieces) * Math.PI * 2 + Math.random()
    item.drift.set(Math.cos(angle) * 0.35, 0, Math.sin(angle) * 0.35)
  }
}

export function dropPoop(position: THREE.Vector3) {
  spawn(POOP_DEF, position.x, position.y, position.z, true)
}

export function removeFood(item: FoodItem) {
  item.removed = true
  const index = foodItems.indexOf(item)
  if (index >= 0) foodItems.splice(index, 1)
}

/** Remove all edible food near a floor point (gravel vacuum). Returns how many. */
export function vacuumFoodNear(x: number, z: number, radius: number): number {
  let count = 0
  for (let i = foodItems.length - 1; i >= 0; i--) {
    const item = foodItems[i]
    if (item.state !== 'resting' || item.habitat !== useUIStore.getState().activeTank) continue
    if (Math.hypot(item.position.x - x, item.position.z - z) < radius) {
      item.removed = true
      foodItems.splice(i, 1)
      count++
    }
  }
  return count
}

export function updateFood(dt: number, time: number) {
  for (let i = foodItems.length - 1; i >= 0; i--) {
    const item = foodItems[i]
    item.age += dt
    const surface = waterLevel.current - 0.02
    if (item.state === 'floating') {
      item.position.y = surface + Math.sin(time * 3 + item.phase) * 0.008
      item.position.addScaledVector(item.drift, dt * 0.6)
      if (item.age > item.def.floatTime) item.state = 'sinking'
    } else if (item.state === 'sinking') {
      const flutter = item.def.visual === 'flake' ? 0.25 : item.def.visual === 'worm' ? 0.1 : 0.05
      item.position.y -= item.def.sinkSpeed * dt * (0.8 + Math.sin(time * 2.2 + item.phase) * 0.35)
      item.position.x += Math.sin(time * 1.7 + item.phase) * flutter * dt + item.drift.x * dt
      item.position.z += Math.cos(time * 1.3 + item.phase) * flutter * dt + item.drift.z * dt
      item.spin.x += dt * 1.5
      item.spin.y += dt * 2.1
      const [cx, cz] = clampToInterior(item.position.x, item.position.z, 0.05)
      item.position.x = cx
      item.position.z = cz
      const floor = floorHeightAt(item.position.x, item.position.z) + 0.02
      if (item.position.y <= floor) {
        item.position.y = floor
        item.state = 'resting'
        if (item.inedible) {
          if (item.habitat === 'main') useGameStore.getState().addWaste(item.position.x, item.position.z, 'poop', 0.8 + Math.random() * 0.5)
          removeFood(item)
        }
      }
    } else {
      item.restAge += dt
      if (item.restAge > REST_BEFORE_WASTE) {
        if (item.habitat === 'main') useGameStore.getState().addWaste(item.position.x, item.position.z, 'food', 0.8)
        removeFood(item)
      }
    }
  }
}
