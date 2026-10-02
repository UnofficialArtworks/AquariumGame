import * as THREE from 'three'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { bonusesFor } from '../state/bonuses'
import { fadeAlgae } from './algae'
import { emitSparks } from './sparks'
import { floorHeightAt } from '../scene/TankBounds'

/** Seconds between the Robo-Vac's pickups. */
const TIDY_EVERY = 20
/** Share of the algae the Auto-Scrubber polishes away each second (about half in four minutes). */
const SCRUB_PER_SECOND = 0.003

let tidyTimer = TIDY_EVERY

/** Called once a second: late-game helper gadgets do their chores. */
export function runHelpers(seconds = 1) {
  const s = useGameStore.getState()
  const bonuses = bonusesFor(s.placedDecorations)
  if (bonuses.scrub) fadeAlgae(SCRUB_PER_SECOND * seconds)
  if (!bonuses.tidy) return
  tidyTimer -= seconds
  if (tidyTimer > 0 || s.waste.length === 0) return
  tidyTimer = TIDY_EVERY
  const oldest = s.waste[0]
  if (s.removeWaste([oldest.id]) && useUIStore.getState().activeTank === 'main') {
    emitSparks(new THREE.Vector3(oldest.x, floorHeightAt(oldest.x, oldest.z) + 0.05, oldest.z), 8, '#bff3ff', { speed: 0.5, size: 0.9, life: 0.6 })
  }
}
