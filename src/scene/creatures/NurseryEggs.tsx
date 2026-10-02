import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../state/useGameStore'
import { inheritedDefinition } from '../../state/nursery'
import { floorHeightAt } from '../TankBounds'
import { MeshBuilder, type V3 } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { emitBubble } from '../../sim/bubbles'
import { emitSparks } from '../../sim/sparks'
import { sfx } from '../../audio/sfx'
import { rememberEggSpot } from '../../sim/hatching'
import { hashString } from '../../utils/rng'
import type { FishDefinition, NurseryEgg } from '../../state/types'

/**
 * Fish eggs like the real thing: small clear spheres packed into a clutch on
 * a flat spawning stone. Through each glossy shell you can watch the baby
 * grow: at first a yolk with a tiny curl of embryo, then a curled-up fry with
 * big dark eyes and speckles that slowly takes on its colours while the yolk
 * shrinks. Close to hatching the eggs twitch, and a hatched egg leaves its
 * burst shell behind for a moment.
 */

const R = 0.19
/** Centre of the clutch on the nursery floor. */
const CLUTCH: [number, number] = [0.25, 0.45]
const SPACING = R * 2.04
/** Growth stages the embryo model steps through. */
const STAGES = 6

/** Hex-packed slots around the clutch centre: the middle, then ring by ring. */
const SLOTS: Array<[number, number]> = (() => {
  const slots: Array<[number, number]> = [[0, 0]]
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
  for (let ring = 1; ring <= 2; ring++) {
    let q = ring
    let r = -ring
    for (const [dq, dr] of dirs) {
      for (let step = 0; step < ring; step++) {
        slots.push([q, r])
        q += dq
        r += dr
      }
    }
  }
  return slots.map(([q, r]) => [CLUTCH[0] + SPACING * (q + r / 2), CLUTCH[1] + SPACING * ((r * Math.sqrt(3)) / 2)])
})()

/** Stable slots so eggs don't shuffle when one hatches: each egg probes from its own hashed spot. */
function assignSlots(eggs: NurseryEgg[]): Map<string, number> {
  const taken = new Set<number>()
  const slots = new Map<string, number>()
  const order = [...eggs].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
  for (const egg of order) {
    // Fill the clutch from the middle out, nudged per egg so it looks natural.
    let slot = Math.min(SLOTS.length - 1, slots.size + (hashString(egg.id) % 2))
    while (taken.has(slot)) slot = (slot + 1) % SLOTS.length
    taken.add(slot)
    slots.set(egg.id, slot)
  }
  return slots
}

const shellGeometry = new THREE.SphereGeometry(R, 32, 24)
const yolkGeometry = new THREE.SphereGeometry(1, 20, 16)
const glintGeometry = new THREE.SphereGeometry(1, 10, 8)
const huskGeometry = new THREE.SphereGeometry(R, 28, 18, 0, Math.PI * 2, 0.95, Math.PI - 0.95)
const shellMaterial = new THREE.MeshPhysicalMaterial({
  color: '#fffaf0',
  transparent: true,
  opacity: 0.2,
  roughness: 0.05,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  // A soft bright rim, like light catching the edge of a real egg.
  sheen: 1,
  sheenRoughness: 0.25,
  sheenColor: new THREE.Color('#ffffff'),
  depthWrite: false,
})
/** The inside of the shell seen through the front: gives each egg a clear, bubble-like edge. */
const rimMaterial = new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending })
const glintMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })
const yolkMaterial = new THREE.MeshStandardMaterial({ color: '#f2b25a', emissive: '#8a4a10', emissiveIntensity: 0.3, roughness: 0.4 })
const oilMaterial = new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#a86a10', emissiveIntensity: 0.4, roughness: 0.2 })

/** The embryo at one growth stage: a curl around the yolk, eyes, speckles; colours come in as it grows. */
function buildEmbryo(def: FishDefinition, stage: number) {
  const b = new MeshBuilder()
  const k = stage / (STAGES - 1)
  const yolk = R * (0.4 - 0.18 * k)
  const thick = R * (0.09 + 0.1 * k)
  // The body lies on the yolk and wraps further round it as the baby grows.
  const curl = yolk + thick * 0.45
  const arc = Math.PI * (0.65 + 1.05 * k)
  const start = Math.PI * 0.55
  const pts: V3[] = []
  for (let i = 0; i <= 18; i++) {
    const a = start - (arc * i) / 18
    pts.push([Math.cos(a) * curl, Math.sin(a) * curl, 0])
  }
  const body = new THREE.Color('#f1e6d2').lerp(new THREE.Color(def.color), 0.1 + 0.6 * k)
  b.add('satin', taperedTube(pts, thick, thick * 0.2, 40, 10), { color: body })
  // A big round head at the front of the curl.
  const head = new THREE.Vector3(...pts[0])
  const out = head.clone().normalize()
  const along = new THREE.Vector3(-out.y, out.x, 0)
  const headR = thick * 1.3
  const headAt = head.clone().addScaledVector(out, thick * 0.15)
  b.add('satin', new THREE.SphereGeometry(headR, 16, 12), { color: body, position: headAt.toArray() as V3 })
  if (stage >= 1) {
    // Two big dark eyes looking out through the shell, each with a shine.
    const eye = headR * (0.42 + 0.18 * k)
    for (const side of [1, -1]) {
      const p = headAt.clone().addScaledVector(along, side * headR * 0.45).add(new THREE.Vector3(0, 0, headR * 0.72))
      b.add('glossy', new THREE.SphereGeometry(eye, 14, 10), { color: '#10151d', position: p.toArray() as V3 })
      b.add('glossy', new THREE.SphereGeometry(eye * 0.32, 8, 6), { color: '#ffffff', position: p.clone().add(new THREE.Vector3(-eye * 0.3, eye * 0.35, eye * 0.75)).toArray() as V3 })
    }
  }
  if (stage >= 2) {
    // Little dark speckles (melanophores) along the visible side of the body.
    const count = 6 + stage * 3
    for (let i = 0; i < count; i++) {
      const t = 0.12 + ((i * 0.618) % 1) * 0.8
      const idx = Math.min(pts.length - 1, Math.floor(t * pts.length))
      const r = thick * (1 - 0.8 * (idx / (pts.length - 1)))
      const p = new THREE.Vector3(...pts[idx])
      const n = p.clone().normalize()
      const lean = (((i * 37) % 7) / 7 - 0.5) * 1.2
      p.addScaledVector(n, r * Math.sin(lean)).setZ(r * Math.cos(lean) * 0.95)
      b.add('matte', new THREE.SphereGeometry(R * 0.016, 5, 4), { color: '#33241d', position: p.toArray() as V3 })
    }
  }
  return { parts: b.build({ groundAO: false }), yolk }
}

function Egg({ egg, slot }: { egg: NurseryEgg; slot: number }) {
  const eggRef = useRef<THREE.Group>(null)
  const embryoRef = useRef<THREE.Group>(null)
  const [x, z] = SLOTS[slot]
  const progress = Math.min(1, Math.max(0, 1 - egg.remainingSeconds / Math.max(1, egg.hatchSeconds)))
  const stage = Math.min(STAGES - 1, Math.floor(progress * STAGES))
  // Rebuilt only when the baby reaches a new stage, not every tick of its timer.
  const { defId, inheritance } = egg
  // Remember where this egg is, so its baby can swim out of it.
  rememberEggSpot(egg.id, [x, floorHeightAt(x, z) + R, z])
  const embryo = useMemo(() => {
    const def = inheritedDefinition({ defId, inheritance })
    return def ? buildEmbryo(def, stage) : null
  }, [defId, inheritance, stage])
  useEffect(() => () => embryo?.parts.forEach((p) => p.geometry.dispose()), [embryo])
  const [phase] = useState(() => (hashString(egg.id) % 100) / 16)
  // Mostly facing the glass, so you can see the baby (never edge-on).
  const tilt = useMemo(() => [((hashString(egg.id) % 9) - 4) * 0.06, ((hashString(`${egg.id}y`) % 90) / 100 - 0.45), ((hashString(`${egg.id}z`) % 628) / 100)] as V3, [egg.id])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase
    const ready = progress > 0.85
    if (eggRef.current) {
      // Ready-to-hatch eggs twitch now and then; the rest just sway in the current.
      const twitch = ready ? Math.max(0, Math.sin(t * 1.7)) ** 6 : 0
      eggRef.current.rotation.z = Math.sin(t * 0.8) * 0.02 + Math.sin(t * 22) * 0.06 * twitch
      eggRef.current.position.y = floorHeightAt(x, z) + R * 0.98 + Math.sin(t * 0.9) * 0.003
    }
    if (embryoRef.current) {
      embryoRef.current.rotation.z = tilt[2] + Math.sin(t * (ready ? 3 : 0.5)) * (ready ? 0.25 : 0.08)
      embryoRef.current.rotation.y = tilt[1] + Math.sin(t * 0.35) * 0.15
    }
  })

  if (!embryo) return null
  return (
    <group ref={eggRef} position={[x, floorHeightAt(x, z) + R, z]}>
      <group ref={embryoRef} rotation={tilt} scale={0.94}>
        <mesh geometry={yolkGeometry} material={yolkMaterial} scale={embryo.yolk} />
        <mesh geometry={yolkGeometry} material={oilMaterial} scale={embryo.yolk * 0.32} position={[embryo.yolk * 0.45, embryo.yolk * 0.55, embryo.yolk * 0.35]} />
        {embryo.parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
        ))}
      </group>
      <mesh geometry={shellGeometry} material={rimMaterial} renderOrder={2} />
      <mesh geometry={shellGeometry} material={shellMaterial} renderOrder={3} />
      <mesh geometry={glintGeometry} material={glintMaterial} position={[-R * 0.4, R * 0.52, R * 0.62]} scale={[R * 0.22, R * 0.13, R * 0.05]} rotation={[0, 0, 0.6]} renderOrder={4} />
      <mesh geometry={glintGeometry} material={glintMaterial} position={[R * 0.5, -R * 0.35, R * 0.72]} scale={[R * 0.07, R * 0.05, R * 0.03]} renderOrder={4} />
    </group>
  )
}

interface Husk {
  id: string
  x: number
  z: number
  born: number
}

const HUSK_SECONDS = 6

/** A burst shell left behind when a baby hatches; it fades away after a few seconds. */
function HuskShell({ husk }: { husk: Husk }) {
  const ref = useRef<THREE.Mesh>(null)
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#fff6e4', transparent: true, opacity: 0.4, roughness: 0.1, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }), [])
  const popped = useRef(false)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const age = (performance.now() - husk.born) / 1000
    if (!popped.current) {
      popped.current = true
      const p = new THREE.Vector3(husk.x, floorHeightAt(husk.x, husk.z) + R, husk.z)
      emitSparks(p, 14, '#fff2c8', { speed: 0.7, size: 1, life: 0.8 })
      for (let i = 0; i < 8; i++) emitBubble(p.x + (Math.random() - 0.5) * 0.15, p.y + Math.random() * 0.1, p.z + (Math.random() - 0.5) * 0.15, 0.012 + Math.random() * 0.015, 2)
      sfx.pop(1.4)
    }
    material.opacity = 0.4 * Math.max(0, 1 - age / HUSK_SECONDS)
    m.visible = age < HUSK_SECONDS
  })
  return (
    <mesh
      ref={ref}
      geometry={huskGeometry}
      material={material}
      position={[husk.x, floorHeightAt(husk.x, husk.z) + R * 0.7, husk.z]}
      rotation={[0.5, (hashString(husk.id) % 628) / 100, 0.3]}
      renderOrder={3}
    />
  )
}

/** The spawning stone the clutch sits on. */
function SpawningStone() {
  const parts = useMemo(() => {
    const b = new MeshBuilder()
    b.add('matte', new THREE.CylinderGeometry(0.95, 1.05, 0.07, 32, 1), { color: '#8b8478', colorTop: '#a39b8c', mottle: 0.18, scale: [1.05, 1, 0.85] })
    return b.build()
  }, [])
  const y = floorHeightAt(CLUTCH[0], CLUTCH[1]) - 0.01
  return (
    <group position={[CLUTCH[0], y, CLUTCH[1]]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} receiveShadow />
      ))}
    </group>
  )
}

/** Nursery eggs are persistent occupants, distinct from transferable fish. */
export function NurseryEggs() {
  const eggs = useGameStore((s) => s.nurseryEggs)
  const slots = useMemo(() => assignSlots(eggs), [eggs])
  const [seen, setSeen] = useState({ eggs, slots })
  const [husks, setHusks] = useState<Husk[]>([])
  // Eggs that just disappeared hatched: leave their burst shells behind for a moment.
  if (seen.eggs !== eggs) {
    const now = performance.now()
    const hatched = seen.eggs.filter((e) => !eggs.some((n) => n.id === e.id) && e.remainingSeconds < 5)
    if (hatched.length) {
      setHusks([
        ...husks.filter((h) => now - h.born < HUSK_SECONDS * 1000),
        ...hatched.map((e) => {
          const [x, z] = SLOTS[seen.slots.get(e.id) ?? 0]
          return { id: e.id, x, z, born: now }
        }),
      ])
    }
    setSeen({ eggs, slots })
  }
  return (
    <group>
      {(eggs.length > 0 || husks.length > 0) && <SpawningStone />}
      {eggs.map((egg) => (
        <Egg key={egg.id} egg={egg} slot={slots.get(egg.id) ?? 0} />
      ))}
      {husks.map((h) => (
        <HuskShell key={h.id} husk={h} />
      ))}
    </group>
  )
}
