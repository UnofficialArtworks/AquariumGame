import * as THREE from 'three'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { bonusesFor } from '../state/bonuses'
import { getDecorationDef } from '../scene/decorations/decorationDefinitions'
import { getFishDef } from '../scene/fish/fishDefinitions'
import { floorHeightAt } from '../scene/TankBounds'
import { releaseFoodAt } from './food'
import { gadgetPulses } from './gadgets'
import { emitSparks } from './sparks'
import { simClock } from './world'
import { sfx } from '../audio/sfx'

/** Seconds between feedings while somebody is hungry. */
const FEED_INTERVAL = 40
/** How hungry a fish must be before the feeder bothers. */
const HUNGRY = 0.4
const PELLETS = 4
const UP = new THREE.Vector3(0, 1, 0)

let timer = 12

/**
 * The Auto-Feeder Lighthouse: while one is placed in the main tank, it pops
 * pellets out of its lantern whenever a fish there is getting peckish.
 */
export function updateAutoFeeder(dt: number, spout: readonly [number, number, number]) {
  if (useUIStore.getState().activeTank !== 'main') return
  timer -= dt
  if (timer > 0) return
  const s = useGameStore.getState()
  if (!bonusesFor(s.placedDecorations).autoFeeder) {
    timer = 5
    return
  }
  const hungry = s.ownedFish.some((f) =>
    f.habitat !== 'nursery' && (getFishDef(f.defId)?.appetite ?? 0) > 0 && (s.fishVitals[f.id]?.hunger ?? 0) > HUNGRY)
  if (!hungry) {
    timer = 6
    return
  }
  const feeder = s.placedDecorations.find((d) => getDecorationDef(d.defId)?.kind === 'feeder')
  if (!feeder) return
  timer = FEED_INTERVAL
  const [x, , z] = feeder.position
  const local = new THREE.Vector3(...spout).applyAxisAngle(UP, feeder.rotationY)
  const at = new THREE.Vector3(x + local.x, floorHeightAt(x, z) - 0.02 + local.y, z + local.z)
  releaseFoodAt('pellets', at, PELLETS)
  emitSparks(at, 10, '#ffd27a', { speed: 0.7, size: 1.1, life: 0.7 })
  gadgetPulses.set(feeder.id, simClock.t)
  sfx.splash()
}
