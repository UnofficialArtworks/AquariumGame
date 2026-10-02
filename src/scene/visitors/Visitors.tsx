import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore, type ActiveVisit } from '../../state/useUIStore'
import { useGameStore } from '../../state/useGameStore'
import { getVisitor, type VisitorDef, type VisitorGift } from '../../state/visitors'
import { LEAVE_MS, visitorSpot, walksOnGravel } from '../../sim/visitors'
import { obstacles } from '../../sim/world'
import { emitSparks } from '../../sim/sparks'
import { emitBubble } from '../../sim/bubbles'
import { spawnPopup } from '../../sim/popups'
import { sfx } from '../../audio/sfx'
import { useFishBrain } from '../fish/useFishBrain'
import type { CrabMotion } from '../creatures/Crab'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { decorMaterials } from '../materials/materials'
import { clampToInterior, floorHeightAt } from '../TankBounds'
import { randomRange } from '../../utils/math'
import { VisitorVisual } from './VisitorVisual'

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const hitGeometry = new THREE.SphereGeometry(1, 8, 6)

/** 0..1 how "here" the visitor is: pops in with a little overshoot, shrinks away when leaving. */
function presence(visit: ActiveVisit, now: number): number {
  if (visit.leavingAt !== null) {
    const k = Math.min(1, (now - visit.leavingAt) / LEAVE_MS)
    return (1 - k) * (1 - k)
  }
  const t = Math.min(1, (now - visit.arrivedAt) / 900)
  const c = 1.7
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

function useInteractive() {
  return useUIStore((s) => s.mode === 'view' || s.mode === 'feed')
}

/**
 * Per-frame bookkeeping shared by every visitor: sparkles and a chime as it
 * arrives, the pop-in / shrink-away scale, keeping visitorSpot current, and
 * a puff of sparkles as it leaves.
 */
function usePresence(v: VisitorDef) {
  const state = useRef({ arrived: false, left: false })
  return (inner: THREE.Group, pos: THREE.Vector3) => {
    const live = useUIStore.getState().visit
    if (!live) return
    const s = state.current
    if (!s.arrived) {
      s.arrived = true
      emitSparks(pos, 18, '#fff2b0', { speed: 0.9, size: 1.2, life: 0.9 })
      for (let i = 0; i < 6; i++) emitBubble(pos.x + randomRange(-0.15, 0.15), pos.y + randomRange(0, 0.2), pos.z + randomRange(-0.15, 0.15), 0.02 + Math.random() * 0.02, 2)
      sfx.magic()
    }
    inner.scale.setScalar(Math.max(0.001, presence(live, Date.now())))
    visitorSpot.copy(pos)
    if (live.leavingAt !== null && !s.left) {
      s.left = true
      emitSparks(pos, 14, v.look.color, { speed: 0.8, size: 1.1, life: 0.8 })
      sfx.pop(0.8)
    }
  }
}

function greetPopup(v: VisitorDef, at: THREE.Vector3, height: number) {
  spawnPopup({ x: at.x, y: at.y + height, z: at.z }, `${v.icon} ${v.name}`, '#ffe9a8')
  emitSparks(at.clone().setY(at.y + height * 0.6), 10, '#ff9ccf', { speed: 0.6, size: 1, life: 0.7, buoyancy: 0.4 })
  sfx.chime()
}

function SwimmingVisitor({ visit, v }: { visit: ActiveVisit; v: VisitorDef }) {
  const home = useMemo(() => new THREE.Vector3(...visit.home), [visit.home])
  const jelly = v.rig === 'jelly'
  const { groupRef, agentRef } = useFishBrain(`visitor-${visit.uid}`, v.look, {
    orientation: jelly ? 'none' : v.rig === 'seahorse' ? 'yaw' : 'full',
    locomotion: jelly ? 'jelly' : 'swim',
    // A touch bigger than the residents, so guests stand out.
    sizeScale: 1.15,
    home,
  })
  const innerRef = useRef<THREE.Group>(null)
  const interactive = useInteractive()
  const [start] = useState<[number, number, number]>(() => [home.x, home.y, home.z])
  const tickPresence = usePresence(v)
  const radius = Math.max(0.22, v.look.bodyLength * 0.6)

  useFrame(() => {
    if (groupRef.current && innerRef.current) tickPresence(innerRef.current, groupRef.current.position)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    const agent = agentRef.current
    if (agent) {
      agent.wiggle = 1.1
      if (v.look.features?.includes('spikes')) agent.puff = 1
    }
    if (groupRef.current) greetPopup(v, groupRef.current.position, radius + 0.15)
  }

  return (
    <group ref={groupRef} position={start}>
      <group ref={innerRef} scale={0.001}>
        <VisitorVisual visitor={v} agentRef={agentRef} />
      </group>
      {interactive && <mesh geometry={hitGeometry} material={hitMaterial} scale={radius} onClick={onClick} userData={{ interactive: true }} visible={false} />}
    </group>
  )
}

/** Crabs and shrimp wander the gravel near what they came for. */
function WalkingVisitor({ visit, v }: { visit: ActiveVisit; v: VisitorDef }) {
  const groupRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)
  const motion = useRef<CrabMotion>({ speed: 0, wave: 0 })
  const brain = useRef({ target: new THREE.Vector3(visit.home[0], 0, visit.home[2]), retarget: 1.5, pause: 0 })
  const interactive = useInteractive()
  const [start] = useState<[number, number, number]>(() => [...visit.home])
  const tickPresence = usePresence(v)
  const crab = v.rig !== 'shrimp'
  const L = v.look.bodyLength

  useFrame((_, rawDelta) => {
    const g = groupRef.current
    if (!g || !innerRef.current) return
    const dt = Math.min(rawDelta, 0.05)
    const b = brain.current
    const m = motion.current
    const pos = g.position
    m.wave = Math.max(0, m.wave - dt)
    b.retarget -= dt
    if (b.retarget <= 0) {
      const [x, z] = clampToInterior(visit.home[0] + randomRange(-0.9, 0.9), visit.home[2] + randomRange(-0.6, 0.6), 0.25)
      b.target.set(x, 0, z)
      b.retarget = randomRange(3, 6)
      b.pause = Math.random() < 0.4 ? randomRange(1.2, 2.8) : 0
    }
    b.pause = Math.max(0, b.pause - dt)
    const dx = b.target.x - pos.x
    const dz = b.target.z - pos.z
    const d = Math.hypot(dx, dz)
    const moving = d > 0.06 && b.pause <= 0 && m.wave <= 0
    if (moving) {
      const speed = v.look.maxSpeed
      let vx = (dx / d) * speed
      let vz = (dz / d) * speed
      for (const o of obstacles) {
        const ox = pos.x - o.x
        const oz = pos.z - o.z
        const od = Math.hypot(ox, oz)
        if (od < o.r && od > 0.001) {
          vx += (ox / od) * speed * 1.5
          vz += (oz / od) * speed * 1.5
        }
      }
      pos.x += vx * dt
      pos.z += vz * dt
      // Crabs scuttle sideways (whichever side is nearer); shrimp walk nose first.
      let want = crab ? Math.atan2(-vz, vx) : Math.atan2(vx, vz) - Math.PI / 2
      if (crab) {
        const flip = want + Math.PI
        const diff = (a: number) => Math.abs(Math.atan2(Math.sin(a - g.rotation.y), Math.cos(a - g.rotation.y)))
        if (diff(flip) < diff(want)) want = flip
      }
      const turn = Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y))
      g.rotation.y += turn * Math.min(1, dt * 5)
    }
    m.speed = THREE.MathUtils.damp(m.speed, moving ? 1 : 0, 6, dt)
    const [cx, cz] = clampToInterior(pos.x, pos.z, 0.15)
    pos.x = cx
    pos.z = cz
    // A happy hop when waved at.
    const hop = m.wave > 0 ? Math.abs(Math.sin(m.wave * 6)) * 0.05 : 0
    pos.y = floorHeightAt(pos.x, pos.z) + 0.02 + hop
    tickPresence(innerRef.current, pos)
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    motion.current.wave = 1.6
    const g = groupRef.current
    if (!g) return
    // Turn to face the player for the wave.
    const cam = e.camera.position
    g.rotation.y = Math.atan2(cam.x - g.position.x, cam.z - g.position.z) - (crab ? 0 : Math.PI / 2)
    greetPopup(v, g.position, L * 0.9 + 0.15)
  }

  return (
    <group ref={groupRef} position={start}>
      <group ref={innerRef} scale={0.001}>
        <VisitorVisual visitor={v} motion={motion} />
      </group>
      {interactive && (
        <mesh geometry={hitGeometry} material={hitMaterial} position={[0, L * 0.25, 0]} scale={Math.max(0.22, L * 0.7)} onClick={onClick} userData={{ interactive: true }} visible={false} />
      )}
    </group>
  )
}

// --- gifts ------------------------------------------------------------------------

const GIFT_SCALE = 1.4
const giftParts = new Map<string, ReturnType<MeshBuilder['build']>>()

/** A little wrapped present in the visitor's colour, with a gold ribbon that glows after dark. */
function giftModel(color: string) {
  let parts = giftParts.get(color)
  if (!parts) {
    const b = new MeshBuilder()
    b.add('glossy', new THREE.BoxGeometry(0.2, 0.16, 0.2), { color, position: [0, 0.08, 0] })
    b.add('glossy', new THREE.BoxGeometry(0.22, 0.04, 0.22), { color, colorTop: '#ffffff', position: [0, 0.165, 0], scale: [1, 1, 1] })
    b.add('glow', new THREE.BoxGeometry(0.045, 0.172, 0.204), { color: '#ffd24a', position: [0, 0.088, 0] })
    b.add('glow', new THREE.BoxGeometry(0.204, 0.172, 0.045), { color: '#ffd24a', position: [0, 0.088, 0] })
    for (const side of [1, -1]) {
      b.add('glow', new THREE.TorusGeometry(0.04, 0.013, 8, 16), { color: '#ffd24a', position: [side * 0.035, 0.205, 0], rotation: [0, 0, side * 0.6], scale: [1, 0.8, 0.6] })
    }
    parts = b.build({ groundAO: false })
    giftParts.set(color, parts)
  }
  return parts
}

function Gift({ gift, interactive }: { gift: VisitorGift; interactive: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const v = getVisitor(gift.visitorId)
  const parts = giftModel(v?.look.color ?? '#ff8fc7')
  const [fresh] = useState(() => Date.now() - gift.at < 4000)
  const born = useRef(0)
  const [phase] = useState(() => Math.random() * 6)

  useFrame(({ clock }, rawDelta) => {
    const g = ref.current
    if (!g) return
    const dt = Math.min(rawDelta, 0.05)
    born.current += dt
    const t = clock.elapsedTime
    const pop = fresh ? Math.min(1, born.current / 0.6) : 1
    const s = fresh ? 1 + 2.7 * Math.pow(pop - 1, 3) + 1.7 * Math.pow(pop - 1, 2) : 1
    g.scale.setScalar(Math.max(0.001, s) * GIFT_SCALE)
    g.position.y = floorHeightAt(gift.x, gift.z) + Math.max(0, Math.sin(t * 1.6 + phase)) * 0.025
    g.rotation.y = Math.sin(t * 0.5 + phase) * 0.35
    if (Math.random() < dt * 0.8) emitSparks(g.position.clone().setY(g.position.y + 0.25), 1, '#ffe38a', { speed: 0.2, size: 0.8, life: 0.8, buoyancy: 0.3 })
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return
    e.stopPropagation()
    const opened = useGameStore.getState().openGift(gift.id)
    if (!opened) return
    const at = new THREE.Vector3(gift.x, floorHeightAt(gift.x, gift.z) + 0.15, gift.z)
    emitSparks(at, 22, '#ffd84a', { speed: 1.3, size: 1.3, life: 0.8 })
    spawnPopup({ x: at.x, y: at.y + 0.25, z: at.z }, `+${opened.coins}`, '#ffd84a', true)
    sfx.coin(true)
  }

  return (
    <group ref={ref} position={[gift.x, floorHeightAt(gift.x, gift.z), gift.z]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
      ))}
      {interactive && <mesh geometry={hitGeometry} material={hitMaterial} position={[0, 0.12, 0]} scale={0.22} onClick={onClick} userData={{ interactive: true }} visible={false} />}
    </group>
  )
}

/** The visitor in the main tank right now (if any) and the gifts left on the gravel. */
export function Visitors() {
  const visit = useUIStore((s) => s.visit)
  const gifts = useGameStore((s) => s.gifts)
  const interactive = useInteractive()
  const v = visit ? getVisitor(visit.visitorId) : undefined
  return (
    <>
      {visit && v && (walksOnGravel(v) ? <WalkingVisitor key={visit.uid} visit={visit} v={v} /> : <SwimmingVisitor key={visit.uid} visit={visit} v={v} />)}
      {gifts.map((g) => (
        <Gift key={g.id} gift={g} interactive={interactive} />
      ))}
    </>
  )
}
