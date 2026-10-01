import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { algaeAt, scrubAlgae } from '../../sim/algae'
import { floorHeightAt, PERIMETER, perimeterToWorld, wallForS, WATER_LINE_Y } from '../TankBounds'
import { hashString } from '../../utils/rng'
import type { FishAgent } from '../../sim/world'
import { useGameStore } from '../../state/useGameStore'
import { sizeForGrowth } from '../../state/economy'

function buildSnail(def: FishDefinition) {
  const b = new MeshBuilder()
  const dark = new THREE.Color(def.color)
  const gold = new THREE.Color(def.color2)
  // Spiral shell: a tube wound inward along a shrinking spiral.
  const pts: Array<[number, number, number]> = []
  const turns = 3.4 * Math.PI
  for (let i = 0; i <= 30; i++) {
    const a = (i / 30) * turns
    const r = 0.055 * Math.exp(-0.2 * a)
    pts.push([Math.cos(a) * r, 0.075 + Math.sin(a) * r, (i / 30) * 0.02])
  }
  b.add('glossy', taperedTube(pts, 0.05, 0.006, 60, 12), {
    color: def.color,
    colorFn: (p, _n, c) => {
      // Zig-zag gold stripes radiating around the spiral.
      const angle = Math.atan2(p.y - 0.075, p.x)
      const stripe = Math.sin(angle * 10 + Math.sin(angle * 30) * 0.6)
      c.copy(dark).lerp(gold, stripe > 0.55 ? 0.85 : 0)
    },
  })
  // Soft foot and head
  b.add('satin', new THREE.CapsuleGeometry(0.035, 0.12, 4, 10), {
    color: '#8d8272',
    position: [0.01, 0.02, 0],
    rotation: [0, 0, Math.PI / 2],
    scale: [1, 1, 0.8],
  })
  for (const side of [1, -1]) {
    b.add('satin', taperedTube([[0.08, 0.035, side * 0.012], [0.11, 0.075, side * 0.03], [0.12, 0.09, side * 0.035]], 0.006, 0.003, 6, 5), { color: '#7a6f60' })
    b.add('glossy', new THREE.SphereGeometry(0.006, 6, 6), { color: '#111111', position: [0.12, 0.093, side * 0.036] })
  }
  return b.build({ groundAO: false })
}

const SPEED = 0.07

/** Shell and body model without the glass-crawling or algae-eating simulation.
 */
export function SnailVisual({ def }: { def: FishDefinition }) {
  const parts = useMemo(() => buildSnail(def), [def])
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
      ))}
    </group>
  )
}

/**
 * Nerite snail: crawls around the unrolled glass perimeter in (s, y) space,
 * heading for the thickest algae it can find and eating it as it goes.
 */
export function SnailEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const groupRef = useRef<THREE.Group>(null)
  const agentRef = useRef<FishAgent | null>(null)
  const state = useRef({
    s: (hashString(instance.id) % 1000) / 1000 * PERIMETER,
    y: 0.6,
    targetS: 0,
    targetY: 0.8,
    retarget: 0,
  })
  const basis = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() }), [])

  useFrame((_, rawDelta) => {
    const g = groupRef.current
    if (!g) return
    const dt = Math.min(rawDelta, 0.05)
    const st = state.current
    st.retarget -= dt
    if (st.retarget <= 0) {
      // Sample a handful of spots and go for the greenest nearby one.
      let bestScore = -Infinity
      for (let i = 0; i < 14; i++) {
        const s = st.s + (Math.random() - 0.5) * 6
        const y = 0.35 + Math.random() * (WATER_LINE_Y - 0.8)
        const score = algaeAt(s, y) * 2 - Math.hypot(s - st.s, y - st.y) * 0.15
        if (score > bestScore) {
          bestScore = score
          st.targetS = s
          st.targetY = y
        }
      }
      st.retarget = 6 + Math.random() * 6
    }
    // s is kept unwrapped (it can grow past PERIMETER); world lookups wrap it.
    const ds = st.targetS - st.s
    const dy = st.targetY - st.y
    const d = Math.hypot(ds, dy)
    let moveS = 1
    let moveY = 0
    if (d > 0.02) {
      const step = Math.min(d, SPEED * dt)
      moveS = ds / d
      moveY = dy / d
      st.s += moveS * step
      st.y += moveY * step
    }
    const [wx, , wz] = perimeterToWorld(st.s, st.y, 0)
    st.y = Math.max(floorHeightAt(wx * 0.97, wz * 0.95) + 0.12, Math.min(WATER_LINE_Y - 0.15, st.y))
    const [x, y, z] = perimeterToWorld(st.s, st.y, 0.012)
    g.position.set(x, y, z)

    // Foot against the glass (local +Y = wall normal), head pointing where it crawls.
    const wall = wallForS(st.s)
    const normal = basis.y.set(...wall.normal)
    const heading = basis.x.set(wall.axis === 'x' ? wall.a * moveS : 0, moveY, wall.axis === 'z' ? wall.a * moveS : 0)
    if (heading.lengthSq() < 0.0001) heading.set(0, 1, 0)
    heading.addScaledVector(normal, -heading.dot(normal)).normalize()
    basis.z.crossVectors(heading, normal).normalize()
    basis.m.makeBasis(heading, normal, basis.z)
    basis.q.setFromRotationMatrix(basis.m)
    g.quaternion.slerp(basis.q, Math.min(1, dt * 3))

    if ((instance.habitat ?? 'main') === 'main') scrubAlgae(st.s, st.y, 0.16, dt * 0.35)
    g.scale.setScalar(sizeForGrowth(useGameStore.getState().fishVitals[instance.id]?.growth ?? 0, instance.sizeScale ?? 1))
  })

  return (
    <group ref={groupRef}>
      <SnailVisual def={def} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={0.14} iconHeight={0.22} />
    </group>
  )
}
