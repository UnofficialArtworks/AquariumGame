import { useMemo, useRef, useState, type RefObject } from 'react'
import { hatchStart } from '../../sim/hatching'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { shade } from '../../utils/color'
import { randomRange } from '../../utils/math'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

const finMaterial = makeAqua(
  new THREE.MeshStandardMaterial({ color: '#ffe7b0', transparent: true, opacity: 0.75, side: THREE.DoubleSide, roughness: 0.4 }),
  {},
  'seahorse-fin',
)

function buildSeahorse(def: FishDefinition) {
  const s = def.bodyLength
  const main = def.color
  const light = def.color2
  const b = new MeshBuilder()
  // Head-to-tail S curve: belly bulges toward +X (the way it faces), tail curls under.
  b.add('satin', taperedTube([[0, s * 0.3, 0], [s * 0.06, s * 0.16, 0], [s * 0.08, 0, 0], [s * 0.03, -s * 0.16, 0]], s * 0.075, s * 0.05, 20, 12), {
    color: main,
    colorTop: shade(main, 0.08),
  })
  b.add('satin', taperedTube([[s * 0.03, -s * 0.16, 0], [-s * 0.02, -s * 0.32, 0], [-s * 0.08, -s * 0.42, 0], [-s * 0.02, -s * 0.5, 0], [s * 0.04, -s * 0.45, 0], [s * 0.02, -s * 0.39, 0]], s * 0.05, s * 0.01, 28, 8), {
    color: shade(main, -0.05),
  })
  // Belly plates: lighter rings
  for (let i = 0; i < 6; i++) {
    const t = i / 6
    b.add('satin', new THREE.TorusGeometry(s * (0.07 - t * 0.02), s * 0.012, 6, 16), {
      color: light,
      position: [s * (0.07 - t * 0.02), s * (0.12 - t * 0.28), 0],
      rotation: [Math.PI / 2, 0, 0.2],
    })
  }
  // Head + long snout
  b.add('satin', new THREE.SphereGeometry(s * 0.085, 16, 12), { color: main, position: [0.005, s * 0.33, 0], scale: [1.1, 0.95, 0.85] })
  b.add('satin', new THREE.CylinderGeometry(s * 0.022, s * 0.03, s * 0.16, 10), {
    color: shade(main, 0.05),
    position: [s * 0.12, s * 0.3, 0],
    rotation: [0, 0, Math.PI / 2 + 0.25],
  })
  // Coronet (little crown)
  for (let i = 0; i < 4; i++) {
    b.add('satin', new THREE.ConeGeometry(s * 0.018, s * 0.06, 5), {
      color: light,
      position: [-0.01 + i * 0.012, s * 0.41 + (i % 2) * 0.01, (i - 1.5) * 0.012],
      rotation: [0, 0, 0.3],
    })
  }
  // Eyes
  for (const side of [1, -1]) {
    b.add('glossy', new THREE.SphereGeometry(s * 0.028, 10, 8), { color: '#101014', position: [s * 0.04, s * 0.35, side * s * 0.06] })
    b.add('glossy', new THREE.SphereGeometry(s * 0.008, 6, 6), { color: '#ffffff', position: [s * 0.052, s * 0.36, side * s * 0.085] })
  }
  return b.build({ groundAO: false })
}

/** Upright seahorse: bobs while it hovers, leans into travel, back fin buzzing harder when it hurries. */
export function SeahorseVisual({ def, seed = 0, agentRef }: { def: FishDefinition; seed?: number; agentRef?: RefObject<FishAgent | null> }) {
  const bodyRef = useRef<THREE.Group>(null)
  const finRef = useRef<THREE.Mesh>(null)
  const parts = useMemo(() => buildSeahorse(def), [def])
  const finGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    const s = def.bodyLength
    shape.moveTo(0, 0)
    shape.quadraticCurveTo(-s * 0.12, s * 0.02, -s * 0.1, -s * 0.12)
    shape.lineTo(0, -s * 0.1)
    return new THREE.ShapeGeometry(shape, 6)
  }, [def])
  const motion = useRef({ finPhase: 0, lean: 0 })

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime + seed
    const agent = agentRef?.current
    const m = motion.current
    const speed = agent ? agent.velocity.length() : 0
    const effort = agent ? Math.min(1.4, agent.effort) : 0.4
    // Lean the head into the direction of travel; straighten up when hovering.
    m.lean = THREE.MathUtils.damp(m.lean, -Math.min(0.4, speed * 2.2), 3, delta)
    m.finPhase += delta * (26 + effort * 18)
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(t * 1.4) * 0.05 * (1 - Math.min(1, speed * 4) * 0.6)
      bodyRef.current.rotation.z = m.lean + Math.sin(t * 0.9) * 0.06
      bodyRef.current.rotation.x = Math.sin(t * 0.7) * 0.05
    }
    if (finRef.current) finRef.current.rotation.y = Math.sin(m.finPhase) * (0.3 + effort * 0.35)
  })

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group ref={bodyRef}>
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
        ))}
        <mesh ref={finRef} geometry={finGeometry} material={finMaterial} position={[-def.bodyLength * 0.04, def.bodyLength * 0.1, 0]} />
      </group>
    </group>
  )
}

/** Upright seahorse that bobs along, its little back fin buzzing. */
export function SeahorseEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'yaw', sizeScale: instance.sizeScale })
  // A fresh hatchling starts inside its egg.
  const [start] = useState<[number, number, number]>(() => hatchStart(instance) ?? [
    randomRange(-INTERIOR_HALF_WIDTH + 0.6, INTERIOR_HALF_WIDTH - 0.6),
    randomRange(1.2, 2.6),
    randomRange(-INTERIOR_HALF_DEPTH + 0.5, INTERIOR_HALF_DEPTH - 0.5),
  ])
  return (
    <group ref={groupRef} position={start}>
      <SeahorseVisual def={def} seed={instance.id.length} agentRef={agentRef} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={def.bodyLength * 0.5} iconHeight={def.bodyLength * 0.6} />
    </group>
  )
}
