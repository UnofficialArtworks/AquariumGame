import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { atmosphere } from './Atmosphere'
import {
  GLASS_THICKNESS,
  HALF_DEPTH,
  HALF_WIDTH,
  TANK_BOTTOM_Y,
  TANK_DEPTH,
  TANK_HEIGHT,
  TANK_WIDTH,
} from './TankBounds'

const glassMaterial = new THREE.MeshStandardMaterial({
  color: '#cfeff2',
  transparent: true,
  opacity: 0.1,
  roughness: 0.03,
  metalness: 0.1,
  depthWrite: false,
  side: THREE.DoubleSide,
})

const trimMaterial = new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.35, metalness: 0.6 })

const GLASS_HEIGHT = TANK_HEIGHT - TANK_BOTTOM_Y
const GLASS_CENTER_Y = TANK_BOTTOM_Y + GLASS_HEIGHT / 2
const TRIM = 0.12

function Trim({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, HALF_DEPTH]} material={trimMaterial}>
        <boxGeometry args={[TANK_WIDTH + TRIM, TRIM, TRIM]} />
      </mesh>
      <mesh position={[0, 0, -HALF_DEPTH]} material={trimMaterial}>
        <boxGeometry args={[TANK_WIDTH + TRIM, TRIM, TRIM]} />
      </mesh>
      <mesh position={[HALF_WIDTH, 0, 0]} material={trimMaterial}>
        <boxGeometry args={[TRIM, TRIM, TANK_DEPTH + TRIM]} />
      </mesh>
      <mesh position={[-HALF_WIDTH, 0, 0]} material={trimMaterial}>
        <boxGeometry args={[TRIM, TRIM, TANK_DEPTH + TRIM]} />
      </mesh>
    </group>
  )
}

/** LED light bar resting across the back of the rim; its underside glows and shifts to moonlight blue at night. */
function LightBar() {
  const ledMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e9f7ff', emissiveIntensity: 3, toneMapped: true }),
    [],
  )
  const day = useRef(new THREE.Color('#e9f7ff'))
  const night = useRef(new THREE.Color('#4d6cff'))
  useFrame(() => {
    ledMaterial.emissive.copy(day.current).lerp(night.current, atmosphere.night)
    ledMaterial.emissiveIntensity = THREE.MathUtils.lerp(3, 1.6, atmosphere.night)
  })
  return (
    <group position={[0, TANK_HEIGHT + 0.13, -HALF_DEPTH + 0.45]}>
      <mesh material={trimMaterial}>
        <boxGeometry args={[TANK_WIDTH - 0.3, 0.07, 0.34]} />
      </mesh>
      <mesh position={[0, -0.04, 0]} material={ledMaterial}>
        <boxGeometry args={[TANK_WIDTH - 0.5, 0.012, 0.22]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF_WIDTH - 0.08), -0.06, 0]} material={trimMaterial}>
          <boxGeometry args={[0.1, 0.1, 0.34]} />
        </mesh>
      ))}
    </group>
  )
}

export function TankContainer() {
  return (
    <group>
      {/* Glass: front/back, left/right, bottom plate */}
      <mesh position={[0, GLASS_CENTER_Y, HALF_DEPTH]} material={glassMaterial} renderOrder={10}>
        <boxGeometry args={[TANK_WIDTH, GLASS_HEIGHT, GLASS_THICKNESS]} />
      </mesh>
      <mesh position={[0, GLASS_CENTER_Y, -HALF_DEPTH]} material={glassMaterial} renderOrder={10}>
        <boxGeometry args={[TANK_WIDTH, GLASS_HEIGHT, GLASS_THICKNESS]} />
      </mesh>
      <mesh position={[HALF_WIDTH, GLASS_CENTER_Y, 0]} material={glassMaterial} renderOrder={10}>
        <boxGeometry args={[GLASS_THICKNESS, GLASS_HEIGHT, TANK_DEPTH]} />
      </mesh>
      <mesh position={[-HALF_WIDTH, GLASS_CENTER_Y, 0]} material={glassMaterial} renderOrder={10}>
        <boxGeometry args={[GLASS_THICKNESS, GLASS_HEIGHT, TANK_DEPTH]} />
      </mesh>

      <Trim y={TANK_HEIGHT + 0.02} />
      <Trim y={TANK_BOTTOM_Y - 0.02} />
      {/* Vertical corner seams */}
      {[
        [HALF_WIDTH, HALF_DEPTH],
        [-HALF_WIDTH, HALF_DEPTH],
        [HALF_WIDTH, -HALF_DEPTH],
        [-HALF_WIDTH, -HALF_DEPTH],
      ].map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, GLASS_CENTER_Y, z]} material={trimMaterial}>
          <boxGeometry args={[0.07, GLASS_HEIGHT, 0.07]} />
        </mesh>
      ))}

      {/* The stand underneath is swappable; see stands/StandVisual. */}
      <LightBar />
    </group>
  )
}
