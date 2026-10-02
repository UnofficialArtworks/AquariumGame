import { memo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { atmosphere } from './Atmosphere'
import { HALF_DEPTH, HALF_WIDTH, TANK_HEIGHT } from './TankBounds'
import { ShadowThrottle } from './RenderBudget'

const SUN_DAY = new THREE.Color('#fff4dc')
const SUN_NIGHT = new THREE.Color('#7d95ff')
const SKY_DAY = new THREE.Color('#c4ecff')
const SKY_NIGHT = new THREE.Color('#2a3d7a')

/**
 * Procedural environment map (no downloaded HDR files): a few glowing
 * panels rendered once into a cube map. Gives glass, metal and glossy
 * surfaces something believable to reflect. Memoized so parent re-renders
 * don't re-render the cube map and reset scene environment settings.
 */
export const SceneEnvironment = memo(function SceneEnvironment() {
  return (
    <Environment resolution={128} frames={1}>
      <Lightformer form="rect" intensity={2.2} color="#dff6ff" scale={[12, 6, 1]} position={[0, 8, 0]} rotation-x={Math.PI / 2} />
      <Lightformer form="rect" intensity={0.9} color="#7fd4ff" scale={[10, 3, 1]} position={[0, 2, -9]} />
      <Lightformer form="rect" intensity={0.6} color="#ffd9a8" scale={[4, 6, 1]} position={[9, 3, 3]} rotation-y={-Math.PI / 2} />
      <Lightformer form="rect" intensity={0.5} color="#b9a8ff" scale={[4, 6, 1]} position={[-9, 3, 3]} rotation-y={Math.PI / 2} />
      <Lightformer form="ring" intensity={1.4} color="#ffffff" scale={2} position={[3, 6, 8]} />
    </Environment>
  )
})

export function Lighting() {
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)

  useFrame(({ scene }) => {
    const night = atmosphere.night
    const murk = atmosphere.murk
    if (sunRef.current) {
      sunRef.current.color.copy(SUN_DAY).lerp(SUN_NIGHT, night)
      sunRef.current.intensity = THREE.MathUtils.lerp(2.6, 0.55, night) * (1 - murk * 0.35)
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(SKY_DAY).lerp(SKY_NIGHT, night)
      hemiRef.current.intensity = THREE.MathUtils.lerp(0.75, 0.22, night)
    }
    scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.12, night)
  })

  return (
    <>
      <ShadowThrottle />
      <hemisphereLight ref={hemiRef} args={['#c4ecff', '#3b5a48', 0.75]} />
      <directionalLight
        ref={sunRef}
        position={[2.5, 11, 3.5]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-HALF_WIDTH - 1}
        shadow-camera-right={HALF_WIDTH + 1}
        shadow-camera-top={HALF_DEPTH + 3}
        shadow-camera-bottom={-HALF_DEPTH - 3}
        shadow-camera-near={2}
        shadow-camera-far={TANK_HEIGHT + 14}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
    </>
  )
}
