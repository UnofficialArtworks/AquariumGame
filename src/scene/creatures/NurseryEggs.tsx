import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../state/useGameStore'
import { inheritedDefinition } from '../../state/nursery'
import { floorHeightAt } from '../TankBounds'
import type { NurseryEgg } from '../../state/types'

const shell = new THREE.SphereGeometry(1, 24, 18)
const nest = new THREE.TorusGeometry(0.22, 0.028, 8, 32).rotateX(Math.PI / 2)
const spot = new THREE.SphereGeometry(1, 8, 6)
const crack = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.05, 0.13, 0.145), new THREE.Vector3(0.01, 0.06, 0.164),
  new THREE.Vector3(-0.03, 0, 0.172), new THREE.Vector3(0.03, -0.07, 0.16),
]), 12, 0.004, 4, false)

function Egg({ egg, index }: { egg: NurseryEgg; index: number }) {
  const ref = useRef<THREE.Group>(null)
  const embryoRef = useRef<THREE.Mesh>(null)
  const def = inheritedDefinition(egg)
  const x = (index % 4 - 1.5) * 0.62
  const z = 0.85 - Math.floor(index / 4) * 0.58
  const progress = 1 - egg.remainingSeconds / Math.max(1, egg.hatchSeconds)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime + index * 3
    const wiggle = progress > 0.8 ? 0.07 : 0.015
    ref.current.rotation.z = Math.sin(t * (progress > 0.8 ? 9 : 2)) * wiggle
    if (embryoRef.current) embryoRef.current.rotation.y = Math.sin(t * 1.3) * 0.2
  })
  if (!def) return null
  return <group position={[x, floorHeightAt(x, z) + 0.035, z]}>
    <mesh geometry={nest}><meshStandardMaterial color="#d1b089" roughness={0.9} /></mesh>
    <group ref={ref} position={[0, 0.23, 0]}>
      {/* A soft translucent shell makes the tiny fish-shaped yolk visible. */}
      <mesh geometry={shell} scale={[0.18, 0.24, 0.17]} renderOrder={2}>
        <meshStandardMaterial color="#fff5dc" transparent opacity={0.62} roughness={0.24} depthWrite={false} />
      </mesh>
      <mesh ref={embryoRef} geometry={shell} scale={[0.11, 0.07, 0.065]}>
        <meshStandardMaterial color={def.color} roughness={0.4} />
      </mesh>
      <mesh geometry={spot} position={[0.065, 0.025, 0.054]} scale={0.016}>
        <meshStandardMaterial color="#15232f" />
      </mesh>
      {[-1, 1].map((side) => <mesh key={side} geometry={spot}
        position={[side * 0.095, 0.13, 0.112]} scale={[0.026, 0.033, 0.009]} renderOrder={3}>
        <meshStandardMaterial color={def.color2} transparent opacity={0.8} depthWrite={false} />
      </mesh>)}
      {progress > 0.7 && <mesh geometry={crack} renderOrder={3}>
        <meshStandardMaterial color="#c2a883" roughness={0.9} />
      </mesh>}
    </group>
  </group>
}

/** Nursery eggs are persistent occupants, distinct from transferable fish. */
export function NurseryEggs() {
  const eggs = useGameStore((s) => s.nurseryEggs)
  return <group>{eggs.map((egg, index) => <Egg key={egg.id} egg={egg} index={index} />)}</group>
}
