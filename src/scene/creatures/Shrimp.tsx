import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { clampToInterior, floorHeightAt, INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'
import { useGameStore } from '../../state/useGameStore'
import { foodItems, removeFood } from '../../sim/food'
import { emitSparks } from '../../sim/sparks'
import { obstacles, type FishAgent } from '../../sim/world'
import { shade } from '../../utils/color'
import { randomRange } from '../../utils/math'
import { sizeForGrowth } from '../../state/economy'

function buildShrimp(def: FishDefinition) {
  const b = new MeshBuilder()
  const L = def.bodyLength
  // Curved, segmented abdomen from head (+X) to tail fan (-X).
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    const x = L * (0.18 - t * 0.5)
    const y = L * (0.06 + Math.sin(t * Math.PI * 0.9) * 0.08)
    const r = L * (0.1 - t * 0.045)
    b.add('glossy', new THREE.SphereGeometry(r, 12, 10), { color: i % 2 ? def.color : shade(def.color, 0.06), position: [x, y, 0], scale: [1.15, 0.95, 0.85] })
  }
  // Head / carapace with a pointy rostrum
  b.add('glossy', new THREE.SphereGeometry(L * 0.13, 14, 10), { color: def.color, position: [L * 0.28, L * 0.06, 0], scale: [1.4, 0.9, 0.85] })
  b.add('glossy', new THREE.ConeGeometry(L * 0.025, L * 0.16, 5), { color: def.color2, position: [L * 0.5, L * 0.1, 0], rotation: [0, 0, -Math.PI / 2 - 0.2] })
  // Tail fan
  for (const angle of [-0.5, 0, 0.5]) {
    b.add('glossy', new THREE.ConeGeometry(L * 0.05, L * 0.14, 3), {
      color: def.color2,
      position: [-L * 0.36, L * 0.05, 0],
      rotation: [angle, 0, Math.PI / 2],
      scale: [1, 1, 0.3],
    })
  }
  // Antennae
  for (const side of [1, -1]) {
    b.add('glossy', taperedTube([[L * 0.38, L * 0.1, side * L * 0.03], [L * 0.7, L * 0.25, side * L * 0.15], [L * 1.0, L * 0.2, side * L * 0.3]], L * 0.008, L * 0.003, 12, 4), { color: def.color2 })
    b.add('glossy', new THREE.SphereGeometry(L * 0.025, 8, 6), { color: '#111111', position: [L * 0.36, L * 0.12, side * L * 0.07] })
  }
  return b.build({ groundAO: false })
}

const LEG_COUNT = 5

/** Shrimp body, antennae and animated walking legs, with no feeding simulation. */
export function ShrimpVisual({ def }: { def: FishDefinition }) {
  const parts = useMemo(() => buildShrimp(def), [def])
  const legsRef = useRef<Array<THREE.Mesh | null>>([])
  const legGeometry = useMemo(() => taperedTube([[0, 0, 0], [0, -def.bodyLength * 0.08, def.bodyLength * 0.07], [0, -def.bodyLength * 0.14, def.bodyLength * 0.08]], def.bodyLength * 0.008, def.bodyLength * 0.004, 6, 4), [def.bodyLength])
  const legMaterial = useMemo(() => makeAqua(new THREE.MeshStandardMaterial({ color: def.color2, roughness: 0.4 }), {}, 'shrimp-leg'), [def.color2])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 4
    legsRef.current.forEach((leg, i) => {
      if (leg) leg.rotation.z = Math.sin(t + i * 1.2) * 0.4
    })
  })

  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
      ))}
      {Array.from({ length: LEG_COUNT * 2 }, (_, i) => {
        const side = i < LEG_COUNT ? 1 : -1
        const k = i % LEG_COUNT
        return (
          <mesh
            key={i}
            ref={(m) => {
              legsRef.current[i] = m
            }}
            geometry={legGeometry}
            material={legMaterial}
            position={[def.bodyLength * (0.25 - k * 0.1), def.bodyLength * 0.02, side * def.bodyLength * 0.03]}
            scale={[1, 1, side]}
          />
        )
      })}
    </group>
  )
}

/** Cherry shrimp: scurries across the gravel to nibble leftovers and waste, with the odd little hop. */
export function ShrimpEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const groupRef = useRef<THREE.Group>(null)
  const agentRef = useRef<FishAgent | null>(null)
  const [start] = useState(() => new THREE.Vector3(randomRange(-2.5, 2.5), 0, randomRange(-1, 1)))
  const brain = useRef({ target: start.clone(), wasteId: null as string | null, retarget: 0, nibble: 0, hop: 0, heading: 0 })

  useFrame((_, rawDelta) => {
    const g = groupRef.current
    if (!g) return
    const dt = Math.min(rawDelta, 0.05)
    const b = brain.current
    const pos = g.position
    b.retarget -= dt
    if (b.retarget <= 0) {
      const waste = (instance.habitat ?? 'main') === 'main' ? useGameStore.getState().waste : []
      let best: { x: number; z: number; id: string | null } | null = null
      let bestD = Infinity
      for (const w of waste) {
        const d = Math.hypot(w.x - pos.x, w.z - pos.z)
        if (d < bestD) {
          bestD = d
          best = { x: w.x, z: w.z, id: w.id }
        }
      }
      for (const f of foodItems) {
        if (f.state !== 'resting' || f.inedible || f.habitat !== (instance.habitat ?? 'main')) continue
        const d = Math.hypot(f.position.x - pos.x, f.position.z - pos.z)
        if (d < bestD) {
          bestD = d
          best = { x: f.position.x, z: f.position.z, id: null }
        }
      }
      if (best && bestD < 5) {
        b.target.set(best.x, 0, best.z)
        b.wasteId = best.id
      } else {
        b.target.set(randomRange(-INTERIOR_HALF_WIDTH + 0.2, INTERIOR_HALF_WIDTH - 0.2), 0, randomRange(-INTERIOR_HALF_DEPTH + 0.2, INTERIOR_HALF_DEPTH - 0.2))
        b.wasteId = null
      }
      b.retarget = 3 + Math.random() * 3
    }
    const dx = b.target.x - pos.x
    const dz = b.target.z - pos.z
    const d = Math.hypot(dx, dz)
    if (d > 0.08) {
      let vx = (dx / d) * def.maxSpeed
      let vz = (dz / d) * def.maxSpeed
      for (const o of obstacles) {
        const ox = pos.x - o.x
        const oz = pos.z - o.z
        const od = Math.hypot(ox, oz)
        if (od < o.r && od > 0.001) {
          vx += (ox / od) * def.maxSpeed * 1.5
          vz += (oz / od) * def.maxSpeed * 1.5
        }
      }
      pos.x += vx * dt
      pos.z += vz * dt
      b.heading = Math.atan2(vx, vz)
    } else {
      b.nibble += dt
      if (b.nibble > 1.6) {
        b.nibble = 0
        if (b.wasteId) {
          const removed = useGameStore.getState().removeWaste([b.wasteId])
          if (removed) emitSparks(pos.clone().setY(pos.y + 0.05), 5, '#c9a86a', { speed: 0.3, size: 0.8, life: 0.6 })
        } else {
          const food = foodItems.find((f) => f.habitat === (instance.habitat ?? 'main') && f.state === 'resting' && !f.inedible && f.position.distanceTo(pos) < 0.25)
          if (food) {
            removeFood(food)
            useGameStore.getState().fishAte(instance.id, food.def.id)
          }
        }
        b.retarget = 0
      }
    }
    const [cx, cz] = clampToInterior(pos.x, pos.z, 0.1)
    pos.x = cx
    pos.z = cz
    if (b.hop <= 0 && Math.random() < dt * 0.08) b.hop = 0.6
    b.hop = Math.max(0, b.hop - dt)
    const hopY = b.hop > 0 ? Math.sin((b.hop / 0.6) * Math.PI) * 0.18 : 0
    pos.y = floorHeightAt(pos.x, pos.z) + 0.03 + hopY
    // Turn toward the heading the short way round.
    let turn = b.heading - Math.PI / 2 - g.rotation.y
    turn = Math.atan2(Math.sin(turn), Math.cos(turn))
    g.rotation.y += turn * Math.min(1, dt * 6)
    g.scale.setScalar(sizeForGrowth(useGameStore.getState().fishVitals[instance.id]?.growth ?? 0, instance.sizeScale ?? 1))

  })

  return (
    <group ref={groupRef} position={start}>
      <ShrimpVisual def={def} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={0.12} iconHeight={0.2} />
    </group>
  )
}
