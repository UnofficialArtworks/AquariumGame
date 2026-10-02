import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { aquaUniforms } from './materials/aquaShader'
import { useUIStore } from '../state/useUIStore'
import { useGameStore } from '../state/useGameStore'
import { waterLevel } from './TankBounds'

/**
 * Smoothed, frame-rate independent environment values that many scene
 * components read inside their own useFrame. Kept out of React state on
 * purpose — these change every frame during transitions.
 */
export const atmosphere = {
  /** 0 = day, 1 = night (eased). */
  night: 0,
  /** 0 = crystal clear, 1 = swamp (eased). */
  murk: 0,
}

const CLEAR_WATER = new THREE.Color('#1b86ad')
const MURKY_WATER = new THREE.Color('#58703a')
const NIGHT_WATER = new THREE.Color('#06213d')
const scratch = new THREE.Color()

/** Drives the shared shader uniforms from game state once per frame. */
export function AtmosphereController() {
  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    aquaUniforms.uAquaTime.value = state.clock.elapsedTime

    const nightTarget = useUIStore.getState().nightLevel
    atmosphere.night = THREE.MathUtils.damp(atmosphere.night, nightTarget, 2.2, delta)
    const murkTarget = useUIStore.getState().activeTank === 'nursery' ? 0 : useGameStore.getState().murk
    atmosphere.murk = THREE.MathUtils.damp(atmosphere.murk, murkTarget, 1.4, delta)

    const { night, murk } = atmosphere
    scratch.copy(CLEAR_WATER).lerp(MURKY_WATER, Math.min(1, murk * 0.9)).lerp(NIGHT_WATER, night * 0.8)
    aquaUniforms.uWaterColor.value.copy(scratch)
    aquaUniforms.uWaterDensity.value = 0.07 + murk * 0.34 + night * 0.05
    aquaUniforms.uCausticStrength.value = (1 - night * 0.72) * (1 - murk * 0.65)
    aquaUniforms.uGlowBoost.value = 1 + night * 2.4
    aquaUniforms.uWaterBoxMax.value.y = waterLevel.current
  })
  return null
}
