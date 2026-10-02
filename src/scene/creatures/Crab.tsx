import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition } from '../../state/types'
import { MeshBuilder, type V3 } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { shade } from '../../utils/color'

/** How the crab is moving right now, written by whoever drives it. */
export interface CrabMotion {
  /** 0 = standing still, 1 = scuttling flat out. */
  speed: number
  /** Seconds left of a happy claw-snapping wave. */
  wave: number
}

/**
 * A crab built from code, facing +Z: a wide carapace on stalked eyes, two
 * pincers and three walking legs a side. The hermit crab is the same little
 * body poking out of a borrowed spiral shell.
 */
function buildBody(def: FishDefinition, hermit: boolean) {
  const b = new MeshBuilder()
  const L = def.bodyLength
  const shell = def.color3 ?? shade(def.color, 0.15)
  if (hermit) {
    // A big borrowed whelk shell, wound around an axis pointing backwards.
    const pts: V3[] = []
    const turns = 3.2 * Math.PI
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * turns
      const r = L * 0.3 * Math.exp(-0.22 * a)
      pts.push([Math.cos(a) * r, L * 0.36 + Math.sin(a) * r, -L * 0.05 - (i / 36) * L * 0.42])
    }
    const base = new THREE.Color(shell)
    const band = new THREE.Color(def.color2)
    b.add('glossy', taperedTube(pts, L * 0.27, L * 0.03, 72, 14), {
      color: shell,
      colorFn: (p, _n, c) => {
        const stripe = Math.sin(p.z * 70 + Math.atan2(p.y - L * 0.36, p.x) * 2)
        c.copy(base).lerp(band, stripe > 0.4 ? 0.75 : 0)
      },
    })
    b.add('satin', new THREE.SphereGeometry(L * 0.17, 14, 10), { color: def.color, position: [0, L * 0.18, L * 0.12], scale: [1.25, 0.8, 1] })
  } else {
    b.add('glossy', new THREE.SphereGeometry(L * 0.32, 20, 14), {
      color: def.color,
      colorTop: shade(def.color, 0.12),
      position: [0, L * 0.2, 0],
      scale: [1.35, 0.55, 1],
    })
    // Little gold bumps along the front rim.
    for (const x of [-0.22, -0.08, 0.08, 0.22]) {
      b.add('glossy', new THREE.SphereGeometry(L * 0.035, 8, 6), { color: def.color2, position: [x * L, L * 0.3, L * 0.27] })
    }
  }
  // Stalked eyes, wide and friendly.
  const eyeZ = hermit ? L * 0.26 : L * 0.22
  for (const side of [1, -1]) {
    b.add('satin', new THREE.CylinderGeometry(L * 0.018, L * 0.024, L * 0.18, 6), { color: def.color, position: [side * L * 0.09, L * 0.36, eyeZ] })
    b.add('glossy', new THREE.SphereGeometry(L * 0.06, 12, 10), { color: '#f8f8f2', position: [side * L * 0.09, L * 0.47, eyeZ] })
    b.add('glossy', new THREE.SphereGeometry(L * 0.033, 10, 8), { color: '#111111', position: [side * L * 0.095, L * 0.48, eyeZ + L * 0.04] })
  }
  return b.build({ groundAO: false })
}

function buildClaw(def: FishDefinition, side: number, big: boolean) {
  const b = new MeshBuilder()
  const L = def.bodyLength
  const s = big ? 1.25 : 1
  b.add('satin', taperedTube([[0, 0, 0], [side * L * 0.1, L * 0.04, L * 0.12], [side * L * 0.12, L * 0.08, L * 0.24]], L * 0.04, L * 0.035, 10, 6), { color: def.color })
  b.add('glossy', new THREE.SphereGeometry(L * 0.1 * s, 14, 10), { color: def.color, position: [side * L * 0.12, L * 0.09, L * 0.32], scale: [0.8, 0.75, 1.3] })
  // The fixed lower finger.
  b.add('glossy', new THREE.ConeGeometry(L * 0.04 * s, L * 0.16 * s, 8), {
    color: def.color2,
    position: [side * L * 0.12, L * 0.06, L * (0.44 + 0.04 * s)],
    rotation: [Math.PI / 2, 0, 0],
  })
  return b.build({ groundAO: false })
}

function buildFinger(def: FishDefinition, big: boolean) {
  const b = new MeshBuilder()
  const L = def.bodyLength
  const s = big ? 1.25 : 1
  b.add('glossy', new THREE.ConeGeometry(L * 0.035 * s, L * 0.15 * s, 8), { color: def.color2, position: [0, 0, L * 0.075 * s], rotation: [Math.PI / 2, 0, 0] })
  return b.build({ groundAO: false })
}

const LEGS = [-0.12, 0.02, 0.16]

export function CrabVisual({ def, hermit = false, motion }: { def: FishDefinition; hermit?: boolean; motion?: RefObject<CrabMotion> }) {
  const body = useMemo(() => buildBody(def, hermit), [def, hermit])
  const claws = useMemo(() => [1, -1].map((side) => buildClaw(def, side, hermit && side === 1)), [def, hermit])
  const fingers = useMemo(() => [buildFinger(def, hermit), buildFinger(def, false)], [def, hermit])
  const legGeometry = useMemo(() => {
    const L = def.bodyLength
    return taperedTube([[0, 0, 0], [L * 0.2, L * 0.1, 0], [L * 0.36, -L * 0.14, 0]], L * 0.028, L * 0.012, 10, 5)
  }, [def.bodyLength])
  const legMaterial = useMemo(() => makeAqua(new THREE.MeshStandardMaterial({ color: shade(def.color, -0.05), roughness: 0.5 }), {}, 'crab-leg'), [def.color])
  const legsRef = useRef<Array<THREE.Group | null>>([])
  const clawsRef = useRef<Array<THREE.Group | null>>([])
  const fingersRef = useRef<Array<THREE.Group | null>>([])
  const phase = useRef(Math.random() * 6)
  const L = def.bodyLength

  useFrame(({ clock }, delta) => {
    const m = motion?.current
    const speed = m?.speed ?? 0
    const wave = m?.wave ?? 0
    phase.current += delta * (3 + speed * 14)
    const t = clock.elapsedTime
    legsRef.current.forEach((leg, i) => {
      if (!leg) return
      const k = i % LEGS.length
      const side = i < LEGS.length ? 1 : -1
      const step = phase.current + k * 2.1 + (side > 0 ? 0 : Math.PI)
      // Legs lift and reach in turn while walking, and barely shuffle at rest.
      leg.rotation.z = side * (Math.max(0, Math.sin(step)) * 0.45 * speed + Math.sin(t * 1.3 + i) * 0.03)
      leg.rotation.y = side * Math.cos(step) * 0.25 * speed
    })
    clawsRef.current.forEach((claw, i) => {
      if (!claw) return
      const side = i === 0 ? 1 : -1
      // Waving: claws up and snapping. Otherwise a slow idle bob.
      const lift = wave > 0 ? 0.7 + Math.sin(t * 9 + i * 1.5) * 0.25 : Math.sin(t * 1.1 + i) * 0.06
      claw.rotation.x = -lift
      claw.rotation.y = side * (wave > 0 ? Math.sin(t * 6 + i) * 0.2 : 0)
    })
    fingersRef.current.forEach((finger, i) => {
      if (!finger) return
      const snap = wave > 0 ? Math.abs(Math.sin(t * 12 + i * 2)) : Math.max(0, Math.sin(t * 0.7 + i * 3)) ** 8
      finger.rotation.x = -0.1 - snap * 0.55
    })
  })

  const clawRoot = (side: number): V3 => [side * L * (hermit ? 0.18 : 0.3), L * 0.14, L * (hermit ? 0.14 : 0.12)]
  return (
    <group>
      {body.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
      ))}
      {[1, -1].map((side, ci) => (
        <group
          key={side}
          position={clawRoot(side)}
          ref={(g) => {
            clawsRef.current[ci] = g
          }}
        >
          {claws[ci].map((p, i) => (
            <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
          ))}
          <group
            position={[side * L * 0.12, L * 0.12, L * 0.38]}
            ref={(g) => {
              fingersRef.current[ci] = g
            }}
          >
            {fingers[ci].map((p, i) => (
              <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
            ))}
          </group>
        </group>
      ))}
      {[1, -1].flatMap((side, si) =>
        LEGS.map((z, k) => (
          <group
            key={`${side}${k}`}
            position={[side * L * (hermit ? 0.14 : 0.3), L * (hermit ? 0.12 : 0.16), z * L * (hermit ? 0.8 : 1) + (hermit ? L * 0.06 : 0)]}
            rotation={[0, side > 0 ? -0.25 * (k - 1) : Math.PI + 0.25 * (k - 1), 0]}
            ref={(g) => {
              legsRef.current[si * LEGS.length + k] = g
            }}
          >
            <mesh geometry={legGeometry} material={legMaterial} />
          </group>
        )),
      )}
    </group>
  )
}
