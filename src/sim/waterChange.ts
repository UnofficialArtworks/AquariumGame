import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH, WATER_LINE_Y, waterLevel } from '../scene/TankBounds'
import { useGameStore } from '../state/useGameStore'
import { emitBubble } from './bubbles'
import { addRipple } from './ripples'
import { sfx } from '../audio/sfx'
import { spawnPopup } from './popups'

const DRAIN_SECONDS = 2.2
const FILL_SECONDS = 2.8
const DRAIN_DEPTH = 1.5

export const waterChange = {
  phase: 'idle' as 'idle' | 'draining' | 'filling',
  t: 0,
}

export function startWaterChange(): boolean {
  if (waterChange.phase !== 'idle') return false
  waterChange.phase = 'draining'
  waterChange.t = 0
  sfx.water()
  return true
}

function ease(t: number) {
  return t * t * (3 - 2 * t)
}

export function updateWaterChange(dt: number) {
  if (waterChange.phase === 'idle') return
  waterChange.t += dt
  if (waterChange.phase === 'draining') {
    const t = Math.min(1, waterChange.t / DRAIN_SECONDS)
    waterLevel.current = WATER_LINE_Y - DRAIN_DEPTH * ease(t)
    if (t >= 1) {
      const murkBefore = useGameStore.getState().murk
      useGameStore.getState().waterChange()
      if (murkBefore > 0.12) {
        spawnPopup({ x: 0, y: WATER_LINE_Y - 1, z: 0 }, `Fresh water! +${Math.round(murkBefore * 60)}`, '#8fe8ff', true)
      }
      waterChange.phase = 'filling'
      waterChange.t = 0
      sfx.splash()
    }
  } else {
    const t = Math.min(1, waterChange.t / FILL_SECONDS)
    waterLevel.current = WATER_LINE_Y - DRAIN_DEPTH * (1 - ease(t))
    // Fresh water pouring in from the corner churns up a cloud of bubbles.
    for (let i = 0; i < 6; i++) {
      const x = INTERIOR_HALF_WIDTH * 0.7 + (Math.random() - 0.5) * 0.8
      const z = -INTERIOR_HALF_DEPTH * 0.5 + (Math.random() - 0.5) * 0.8
      emitBubble(x, waterLevel.current - 0.1 - Math.random() * 1.2, z, 0.015 + Math.random() * 0.05)
    }
    if (Math.random() < dt * 8) addRipple(INTERIOR_HALF_WIDTH * 0.7, -INTERIOR_HALF_DEPTH * 0.5, 1.4)
    if (t >= 1) {
      waterLevel.current = WATER_LINE_Y
      waterChange.phase = 'idle'
    }
  }
}
