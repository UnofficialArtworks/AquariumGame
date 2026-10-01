import { useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { makeAqua } from '../materials/aquaShader'
import { latheFrom, ribbonGeometry, taperedTube } from '../geometry/shapes'
import { randomRange } from '../../utils/math'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

const TENTACLE_VERTEX = /* glsl */ `
  vec3 jObj = modelMatrix[3].xyz;
  float jPh = jObj.x * 3.1 + jObj.z * 2.3;
  float hang = max(-transformed.y, 0.0);
  transformed.x += sin(uAquaTime * 1.7 + hang * 6.0 + jPh) * 0.06 * hang;
  transformed.z += cos(uAquaTime * 1.3 + hang * 5.0 + jPh) * 0.05 * hang;
`

const materialCache = new Map<string, ReturnType<typeof createMaterials>>()

function createMaterials(def: FishDefinition) {
  const bell = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.5, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    { fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 0.35 * uGlowBoost;' },
    'jelly-bell',
  )
  const organs = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color2, roughness: 0.4, transparent: true, opacity: 0.85 }),
    { fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 0.6 * uGlowBoost;' },
    'jelly-organs',
  )
  const tentacles = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.6, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    { vertexHook: TENTACLE_VERTEX, fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 0.45 * uGlowBoost;' },
    'jelly-tentacles',
  )
  return { bell, organs, tentacles }
}

function jellyMaterials(def: FishDefinition) {
  let m = materialCache.get(def.id)
  if (!m) {
    m = createMaterials(def)
    materialCache.set(def.id, m)
  }
  return m
}

/** Translucent pulsing bell, glowing clover organs, frilly arms and drifting tentacles. */
export function JellyfishVisual({ def, agentRef, seed = 0 }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null>; seed?: number }) {
  const bellRef = useRef<THREE.Group>(null)
  const materials = jellyMaterials(def)
  const R = def.bodyLength * 0.5
  const geometries = useMemo(() => {
    const bell = latheFrom(
      [
        [0.0001, R * 0.62],
        [R * 0.45, R * 0.56],
        [R * 0.8, R * 0.38],
        [R * 0.98, R * 0.12],
        [R * 1.02, 0],
        [R * 0.9, -R * 0.03],
      ],
      32,
    )
    const tentacles: THREE.BufferGeometry[] = []
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2
      const x = Math.cos(a) * R * 0.95
      const z = Math.sin(a) * R * 0.95
      const len = R * (2.4 + (i % 3) * 0.6)
      tentacles.push(taperedTube([[x, 0, z], [x * 0.9, -len * 0.5, z * 0.9], [x * 0.8, -len, z * 0.8]], R * 0.02, R * 0.006, 12, 3, false))
    }
    const arms: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const g = ribbonGeometry(R * 1.8, R * 0.22, 14, 1.4, 0.05)
      g.rotateX(Math.PI)
      g.rotateY((i / 4) * Math.PI * 2)
      g.translate(Math.cos((i / 4) * Math.PI * 2) * R * 0.12, 0, Math.sin((i / 4) * Math.PI * 2) * R * 0.12)
      arms.push(g)
    }
    return { bell, tentacles, arms }
  }, [R])

  useFrame(({ clock }) => {
    const bell = bellRef.current
    if (!bell) return
    const t = clock.elapsedTime + seed
    const pulse = Math.sin(t * 2.3)
    bell.scale.set(1 + pulse * 0.08, 1 - pulse * 0.12, 1 + pulse * 0.08)
    bell.position.y = Math.sin(t * 0.7) * 0.12
    const agent = agentRef?.current
    if (agent) agent.velocity.y += Math.max(0, pulse) * 0.004
  })

  return (
    <group ref={bellRef}>
      <mesh geometry={geometries.bell} material={materials.bell} renderOrder={2} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2
        return (
          <mesh key={i} material={materials.organs} position={[Math.cos(a) * R * 0.28, R * 0.35, Math.sin(a) * R * 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R * 0.16, R * 0.045, 8, 20]} />
          </mesh>
        )
      })}
      {geometries.arms.map((g, i) => (
        <mesh key={`a${i}`} geometry={g} material={materials.tentacles} renderOrder={2} />
      ))}
      {geometries.tentacles.map((g, i) => (
        <mesh key={`t${i}`} geometry={g} material={materials.tentacles} renderOrder={2} />
      ))}
    </group>
  )
}

export function JellyfishEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'none', sizeScale: instance.sizeScale })
  const [start] = useState<[number, number, number]>(() => [
    randomRange(-INTERIOR_HALF_WIDTH + 0.8, INTERIOR_HALF_WIDTH - 0.8),
    randomRange(1.6, 3.2),
    randomRange(-INTERIOR_HALF_DEPTH + 0.6, INTERIOR_HALF_DEPTH - 0.6),
  ])
  const R = def.bodyLength * 0.5
  return (
    <group ref={groupRef} position={start}>
      <JellyfishVisual def={def} agentRef={agentRef} seed={instance.id.length} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={R * 1.3} iconHeight={R + 0.25} />
    </group>
  )
}
