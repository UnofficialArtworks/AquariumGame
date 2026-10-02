import * as THREE from 'three'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { bonusesFor } from '../state/bonuses'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { floorHeightAt } from '../scene/TankBounds'
import { releaseFoodAt } from './food'
import { feederCall, gadgetPulses } from './gadgets'
import { emitSparks } from './sparks'
import { simClock } from './world'
import { sfx } from '../audio/sfx'

/** Seconds between feedings while somebody is hungry. */
const FEED_INTERVAL = 40
/** How hungry a fish must be before the feeder bothers. */
const HUNGRY = 0.4
/** Fish this peckish count toward how many pellets to pop out. */
const PECKISH = 0.22
const MIN_PELLETS = 3
const MAX_PELLETS = 10
/** Seconds between the bell and the food, so fish have time to gather. */
const CALL_SECONDS = 2.6
const UP = new THREE.Vector3(0, 1, 0)

let timer = 12
let pendingRelease = -1
let pendingPieces = 0
const spoutAt = new THREE.Vector3()

/**
 * The Auto-Feeder Lighthouse: while one is placed in the main tank, it pops
 * pellets out of its lantern whenever a fish there is getting peckish.
 */
export function updateAutoFeeder(dt: number, spout: readonly [number, number, number]) {
  if (useUIStore.getState().activeTank !== 'main') {
    pendingRelease = -1
    return
  }
  if (pendingRelease >= 0) {
    pendingRelease -= dt
    if (pendingRelease < 0) release()
    return
  }
  timer -= dt
  if (timer > 0) return
  const s = useGameStore.getState()
  if (!bonusesFor(s.placedDecorations).autoFeeder) {
    timer = 5
    return
  }
  let hungry = false
  let peckish = 0
  for (const f of s.ownedFish) {
    if (f.habitat === 'nursery' || (getFishDef(f.defId)?.appetite ?? 0) <= 0) continue
    const hunger = s.fishVitals[f.id]?.hunger ?? 0
    if (hunger > HUNGRY) hungry = true
    if (hunger > PECKISH) peckish++
  }
  if (!hungry) {
    timer = 6
    return
  }
  const feeder = s.placedDecorations.find((d) => getDecorationDef(d.defId)?.kind === 'feeder')
  if (!feeder) return
  timer = FEED_INTERVAL
  const [x, , z] = feeder.position
  const local = new THREE.Vector3(...spout).applyAxisAngle(UP, feeder.rotationY)
  spoutAt.set(x + local.x, floorHeightAt(x, z) - 0.02 + local.y, z + local.z)
  // Ring the bell first: hungry fish come over and wait by the lantern.
  pendingRelease = CALL_SECONDS
  pendingPieces = Math.max(MIN_PELLETS, Math.min(MAX_PELLETS, peckish))
  feederCall.instanceId = feeder.id
  feederCall.from = simClock.t
  feederCall.until = simClock.t + CALL_SECONDS + 5
  feederCall.position.copy(spoutAt)
  sfx.chime()
}

function release() {
  releaseFoodAt('pellets', spoutAt, pendingPieces)
  emitSparks(spoutAt, 10, '#ffd27a', { speed: 0.7, size: 1.1, life: 0.7 })
  gadgetPulses.set(feederCall.instanceId, simClock.t)
  sfx.splash()
}
