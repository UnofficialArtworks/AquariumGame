import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { anemoneSpots, obstacles, simClock } from '../sim/world'
import { updateFood } from '../sim/food'
import { updateCoins } from '../sim/coins'
import { updateBubbles } from '../sim/bubbles'
import { updateSparks } from '../sim/sparks'
import { updateWaterChange } from '../sim/waterChange'
import { updateAutoFeeder } from '../sim/autoFeeder'
import { FEEDER_SPOUT } from './decorations/builders/gadgets'
import { useGameStore } from '../state/useGameStore'
import { useUIStore } from '../state/useUIStore'
import { NURSERY_DECORATIONS } from './nurseryLayout'
import { bubbles } from '../sim/bubbles'
import { sparks } from '../sim/sparks'
import { usePopupStore } from '../sim/popups'
import { getDecorationDef } from './decorations/decorationDefinitions'
import { floorHeightAt } from './TankBounds'
import type { DecorationInstance } from '../state/types'

function rebuildObstacles(placed: DecorationInstance[]) {
  obstacles.length = 0
  anemoneSpots.length = 0
  for (const d of placed) {
    const def = getDecorationDef(d.defId)
    if (!def) continue
    const floor = floorHeightAt(d.position[0], d.position[2])
    // Thin/tall plants don't block fish much; only solid decor gets a footprint.
    const soft = def.kind === 'kelp' || def.kind === 'lily' || def.kind === 'grass' || def.kind === 'airstone'
    if (!soft) {
      obstacles.push({ id: d.id, x: d.position[0], z: d.position[2], r: def.footprintRadius * 0.85, top: floor + def.height })
    }
    if (def.kind === 'anemone') anemoneSpots.push(new THREE.Vector3(d.position[0], floor + def.height, d.position[2]))
  }
}

/** Advances every non-React simulation system once per frame. */
export function SimController() {
  const activeTank = useUIStore((s) => s.activeTank)
  useEffect(() => {
    bubbles.length = 0
    sparks.length = 0
    usePopupStore.setState({ popups: [] })
    rebuildObstacles(activeTank === 'nursery' ? NURSERY_DECORATIONS : useGameStore.getState().placedDecorations)
    return useGameStore.subscribe((state, prev) => {
      if (activeTank === 'main' && state.placedDecorations !== prev.placedDecorations) rebuildObstacles(state.placedDecorations)
    })
  }, [activeTank])

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05)
    simClock.t = clock.elapsedTime
    updateFood(dt, clock.elapsedTime)
    updateCoins(dt)
    updateBubbles(dt)
    updateSparks(dt)
    updateWaterChange(dt)
    updateAutoFeeder(dt, FEEDER_SPOUT)
  })
  return null
}
