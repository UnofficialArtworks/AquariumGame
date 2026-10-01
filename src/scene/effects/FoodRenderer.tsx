import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { foodItems } from '../../sim/food'
import { useUIStore } from '../../state/useUIStore'
import { makeAqua } from '../materials/aquaShader'
import type { FoodVisual } from '../food/foodDefinitions'

const MAX_PER_KIND = 90

const plainMaterial = makeAqua(new THREE.MeshStandardMaterial({ roughness: 0.6 }), {}, 'aqua-food')
const glowMaterial = makeAqua(
  new THREE.MeshStandardMaterial({ roughness: 0.3 }),
  { fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 1.4 * uGlowBoost;' },
  'aqua-food-glow',
)

type RenderKind = FoodVisual | 'golden'

const GEOMETRIES: Record<RenderKind, THREE.BufferGeometry> = {
  pellet: new THREE.SphereGeometry(0.032, 10, 8),
  golden: new THREE.SphereGeometry(0.045, 14, 10),
  flake: new THREE.BoxGeometry(0.075, 0.005, 0.055),
  worm: new THREE.CapsuleGeometry(0.011, 0.09, 3, 6),
  star: new THREE.OctahedronGeometry(0.04, 0),
  shrimp: new THREE.CapsuleGeometry(0.018, 0.05, 4, 8),
  orb: new THREE.IcosahedronGeometry(0.035, 2),
}

const KINDS: RenderKind[] = ['pellet', 'golden', 'flake', 'worm', 'star', 'shrimp', 'orb']

/** Every food piece in the tank, drawn as a handful of instanced meshes. */
export function FoodRenderer() {
  const refs = useRef<Record<string, THREE.InstancedMesh | null>>({})
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    const counts: Record<string, number> = {}
    const t = clock.elapsedTime
    for (const item of foodItems) {
      if (item.habitat !== useUIStore.getState().activeTank) continue
      const kind: RenderKind = item.def.effect === 'golden' ? 'golden' : item.def.visual
      const mesh = refs.current[kind]
      if (!mesh) continue
      const i = counts[kind] ?? 0
      if (i >= MAX_PER_KIND) continue
      dummy.position.copy(item.position)
      if (kind === 'worm') {
        dummy.rotation.set(Math.sin(t * 9 + item.phase) * 0.8, item.phase, Math.PI / 2 + Math.sin(t * 7 + item.phase) * 0.6)
      } else if (kind === 'flake') {
        dummy.rotation.set(Math.sin(t * 2 + item.phase) * 0.6, item.spin.y, Math.cos(t * 1.7 + item.phase) * 0.5)
      } else {
        dummy.rotation.copy(item.spin)
      }
      const pulse = kind === 'star' || kind === 'orb' || kind === 'golden' ? 1 + Math.sin(t * 6 + item.phase) * 0.15 : 1
      dummy.scale.setScalar(pulse)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.set(item.def.color)
      if (item.state === 'resting') color.multiplyScalar(Math.max(0.45, 1 - item.restAge / 30))
      mesh.setColorAt(i, color)
      counts[kind] = i + 1
    }
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (!mesh) continue
      mesh.count = counts[kind] ?? 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={(m) => {
            refs.current[kind] = m
            // Create the color buffer up front so the shader compiles with it.
            if (m && !m.instanceColor) {
              m.setColorAt(0, new THREE.Color('#ffffff'))
              m.count = 0
            }
          }}
          args={[GEOMETRIES[kind], kind === 'star' || kind === 'orb' || kind === 'golden' ? glowMaterial : plainMaterial, MAX_PER_KIND]}
          frustumCulled={false}
          castShadow
        />
      ))}
    </group>
  )
}
