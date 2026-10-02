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
import { noise3 } from '../../utils/noise'
import { shade } from '../../utils/color'
import { randomRange } from '../../utils/math'
import { hashString } from '../../utils/rng'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

type Parts = ReturnType<MeshBuilder['build']>

/**
 * Shell plates: a row of vertebral scutes down the spine, costal scutes either
 * side and a ring of small marginal ones, each with a lighter centre and a
 * dark seam.
 */
function scutes(shell: string, light: string, halfLength: number, halfWidth: number) {
  const plate = new THREE.Color(shell)
  const glow = new THREE.Color(light)
  const seam = new THREE.Color(shade(shell, -0.45))
  return (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    const nx = p.x / halfLength
    const nz = p.z / halfWidth
    const r = Math.hypot(nx, nz)
    let cell: number
    let border: number
    let centre: number
    if (r > 0.84) {
      const seg = ((Math.atan2(nz, nx) / (Math.PI * 2)) + 1) * 26
      cell = 100 + Math.floor(seg)
      border = Math.max(1 - Math.min(seg % 1, 1 - (seg % 1)) / 0.08, 1 - Math.abs(r - 0.84) / 0.03)
      centre = 0.3
    } else if (Math.abs(nz) < 0.3) {
      const row = (nx + 0.84) / 1.68 * 5
      cell = Math.floor(row)
      border = Math.max(1 - Math.min(row % 1, 1 - (row % 1)) / 0.06, 1 - Math.abs(Math.abs(nz) - 0.3) / 0.03)
      centre = 1 - Math.hypot((row % 1) - 0.5, nz / 0.3 * 0.5) * 1.6
    } else {
      const row = (nx + 0.84) / 1.68 * 4
      cell = 10 + Math.floor(row) + (nz > 0 ? 0 : 5)
      border = 1 - Math.min(row % 1, 1 - (row % 1)) / 0.06
      centre = 1 - Math.abs((row % 1) - 0.5) * 1.6
    }
    const tone = 0.85 + noise3(cell * 1.7, 0.3, 0.9) * 0.3
    c.copy(plate).multiplyScalar(tone).lerp(glow, Math.max(0, centre) * 0.45)
    c.lerp(seam, THREE.MathUtils.clamp(border, 0, 1) * 0.85)
  }
}

/**
 * A flipper built for the right side (+Z): narrow at the shoulder, broad in
 * the middle, tapering to a point that sweeps back.
 */
function paddle(length: number, width: number, thickness: number, sweep: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 18, 12)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const along = (pos.getZ(i) + 1) / 2
    const broad = 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, along * 1.1)), 0.7)
    const x = pos.getX(i) * width * 0.5 * broad - sweep * along * along * length
    const y = pos.getY(i) * thickness * (1 - along * 0.6)
    pos.setXYZ(i, x, y, along * length)
  }
  g.computeVertexNormals()
  return g
}

const cache = new Map<string, { body: Parts; head: Parts; front: Parts; rear: Parts }>()

function turtleGeometry(def: FishDefinition) {
  const key = `${def.bodyLength}:${def.color}:${def.color2}:${def.color3}`
  let parts = cache.get(key)
  if (parts) return parts
  const L = def.bodyLength
  const skin = def.color
  const shell = def.color2
  const light = def.color3 ?? shade(shell, 0.4)
  const belly = shade(light, 0.15)
  const skinScales = (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    const n = noise3(p.x * (40 / L), p.y * (40 / L), p.z * (40 / L))
    c.set(skin).multiplyScalar(n > 0.2 ? 1.12 : 0.92)
  }
  const halfLength = L * 0.3
  const halfWidth = L * 0.24

  const body = new MeshBuilder()
  // Domed carapace over a flatter plastron, and a little pointed tail.
  body.add('satin', new THREE.SphereGeometry(1, 72, 30, 0, Math.PI * 2, 0, Math.PI / 2), {
    color: shell,
    scale: [halfLength, L * 0.13, halfWidth],
    colorFn: scutes(shell, light, halfLength, halfWidth),
  })
  body.add('satin', new THREE.SphereGeometry(1, 36, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { color: belly, scale: [halfLength * 0.97, L * 0.05, halfWidth * 0.95] })
  body.add('satin', new THREE.TorusGeometry(1, 0.03, 6, 64), { color: shade(shell, -0.08), rotation: [Math.PI / 2, 0, 0], scale: [halfLength, halfWidth, 0.2] })
  body.add('satin', new THREE.ConeGeometry(L * 0.025, L * 0.08, 8), { color: skin, position: [-halfLength - L * 0.02, -L * 0.005, 0], rotation: [0, 0, Math.PI / 2], colorFn: skinScales })
  // The neck reaches out under the front of the shell.
  body.add('satin', taperedTube([[halfLength * 0.6, -L * 0.01, 0], [halfLength * 0.95, 0, 0], [halfLength + L * 0.05, L * 0.005, 0]], L * 0.055, L * 0.045, 8, 10), { color: skin, colorFn: skinScales })

  const head = new MeshBuilder()
  head.add('satin', new THREE.SphereGeometry(L * 0.06, 20, 14), { color: skin, position: [L * 0.05, 0, 0], scale: [1.35, 0.85, 0.9], colorFn: skinScales })
  head.add('satin', new THREE.ConeGeometry(L * 0.03, L * 0.04, 10), { color: shade(skin, -0.3), position: [L * 0.125, -L * 0.012, 0], rotation: [0, 0, -Math.PI / 2], scale: [1, 1, 0.8] })
  for (const side of [1, -1]) {
    head.add('glossy', new THREE.SphereGeometry(L * 0.014, 10, 8), { color: '#120f0c', position: [L * 0.085, L * 0.018, side * L * 0.045] })
    head.add('glossy', new THREE.SphereGeometry(L * 0.0045, 6, 6), { color: '#ffffff', position: [L * 0.091, L * 0.024, side * L * 0.057] })
  }

  const front = new MeshBuilder()
  front.add('satin', paddle(L * 0.36, L * 0.085, L * 0.022, 0.55), { color: skin, colorFn: skinScales })
  const rear = new MeshBuilder()
  rear.add('satin', paddle(L * 0.14, L * 0.07, L * 0.018, 0.9), { color: skin, colorFn: skinScales })

  parts = { body: body.build({ groundAO: false }), head: head.build({ groundAO: false }), front: front.build({ groundAO: false }), rear: rear.build({ groundAO: false }) }
  cache.set(key, parts)
  return parts
}

function Meshes({ parts }: { parts: Parts }) {
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
      ))}
    </>
  )
}

/** Sea turtle: big front flippers row in slow strokes, the head turns into curves. */
export function SeaTurtleVisual({ def, agentRef, seed = 0 }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null>; seed?: number }) {
  const L = def.bodyLength
  const parts = turtleGeometry(def)
  const bodyRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const flipperRefs = useRef<Array<THREE.Group | null>>([])
  const stroke = useRef({ phase: seed, power: 0.5 })

  useFrame(({ clock }, delta) => {
    const agent = agentRef?.current
    const t = clock.elapsedTime + seed
    const s = stroke.current
    const effort = agent ? Math.min(1.2, agent.effort) : 0.5
    s.power = THREE.MathUtils.damp(s.power, 0.35 + Math.min(1, effort) * 0.65, 2, delta)
    s.phase += delta * (1.3 + effort * 1.6)
    // A strong downstroke and a slower, feathered recovery.
    const cycle = s.phase % (Math.PI * 2)
    const down = cycle < Math.PI * 0.8
    const k = down ? cycle / (Math.PI * 0.8) : (cycle - Math.PI * 0.8) / (Math.PI * 1.2)
    const flap = (down ? Math.cos(k * Math.PI) : -Math.cos(k * Math.PI)) * 0.55 * s.power
    const sweep = (down ? -k : -1 + k) * 0.5 * s.power
    flipperRefs.current.forEach((g, i) => {
      if (!g) return
      const side = i % 2 === 0 ? 1 : -1
      if (i < 2) {
        g.rotation.set(side * -flap, side * (sweep + 0.25), side * (down ? 0 : 0.3 * s.power))
      } else {
        // Rear flippers paddle softly and steer.
        g.rotation.set(side * Math.sin(s.phase + 1) * 0.25, side * (Math.sin(s.phase * 0.5) * 0.25 + (agent ? agent.bend * 0.4 : 0)), 0)
      }
    })
    if (bodyRef.current) {
      // The shell surges a little with each power stroke.
      bodyRef.current.position.y = -flap * L * 0.025
      bodyRef.current.rotation.z = Math.sin(t * 0.5) * 0.03
    }
    if (headRef.current) {
      headRef.current.rotation.y = (agent ? -agent.bend * 0.6 : Math.sin(t * 0.4) * 0.3) + Math.sin(t * 0.7) * 0.05
      headRef.current.rotation.z = Math.sin(t * 0.6 + 1) * 0.08
      // Neck stretches toward food it is after, and snaps forward on a bite.
      const snap = agent ? Math.sin(Math.min(1, agent.eatPulse / 0.3) * Math.PI) : 0
      const reach = agent ? agent.gazing * 0.4 + snap : 0
      headRef.current.position.x = L * 0.34 + reach * L * 0.05
    }
  })

  const halfLength = L * 0.3
  const halfWidth = L * 0.24
  const spots: Array<[number, number, number]> = [
    [halfLength * 0.45, -L * 0.02, halfWidth * 0.75],
    [halfLength * 0.45, -L * 0.02, -halfWidth * 0.75],
    [-halfLength * 0.7, -L * 0.02, halfWidth * 0.55],
    [-halfLength * 0.7, -L * 0.02, -halfWidth * 0.55],
  ]
  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group ref={bodyRef}>
        <Meshes parts={parts.body} />
        <group ref={headRef} position={[halfLength + L * 0.04, L * 0.005, 0]}>
          <Meshes parts={parts.head} />
        </group>
        {spots.map(([x, y, z], i) => (
          <group
            key={i}
            ref={(g) => {
              flipperRefs.current[i] = g
            }}
            position={[x, y, z]}
            scale={[1, 1, z > 0 ? 1 : -1]}
          >
            <Meshes parts={i < 2 ? parts.front : parts.rear} />
          </group>
        ))}
      </group>
    </group>
  )
}

export function SeaTurtleEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'full', sizeScale: instance.sizeScale })
  // A fresh hatchling starts inside its egg.
  const [start] = useState<[number, number, number]>(() => hatchStart(instance) ?? [
    randomRange(-INTERIOR_HALF_WIDTH + 0.9, INTERIOR_HALF_WIDTH - 0.9),
    randomRange(1.2, 2.4),
    randomRange(-INTERIOR_HALF_DEPTH + 0.6, INTERIOR_HALF_DEPTH - 0.6),
  ])
  const seed = useMemo(() => (hashString(instance.id) % 1000) / 100, [instance.id])
  return (
    <group ref={groupRef} position={start}>
      <SeaTurtleVisual def={def} agentRef={agentRef} seed={seed} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={def.bodyLength * 0.45} iconHeight={def.bodyLength * 0.3 + 0.12} />
    </group>
  )
}
