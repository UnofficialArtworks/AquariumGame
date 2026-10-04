import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useUIStore } from '../../state/useUIStore'
import { useGameStore } from '../../state/useGameStore'
import { vacuumFoodNear } from '../../sim/food'
import { emitSparks } from '../../sim/sparks'
import { emitBubble } from '../../sim/bubbles'
import { spawnPopup } from '../../sim/popups'
import { scrubAlgae } from '../../sim/algae'
import { sfx } from '../../audio/sfx'
import { suckedWaste, wastePosition, wastePull } from './WasteLayer'
import { makeRingMaterial } from './ringMaterial'
import { clampGlassHead } from './glassReach'
import { getGlassTool, getGravelTool, type GlassToolDef, type GlassToolLook, type GravelToolDef, type GravelToolLook } from './toolDefinitions'
import {
  floorHeightAt,
  GLASS_THICKNESS,
  HALF_DEPTH,
  HALF_WIDTH,
  onTankResize,
  TANK_BOTTOM_Y,
  TANK_HEIGHT,
  WALLS,
  type WallMapping,
} from '../TankBounds'
import { ROOM_FLOOR_Y, STAND_TOP_Y, STAND_WIDTH } from '../stands/standDefinitions'
import { onTouchCount, touches } from '../interaction/touches'
import type { WasteItem } from '../../state/types'

const INNER = GLASS_THICKNESS / 2

// --- pointer plumbing --------------------------------------------------------
// Tools track the pointer at the canvas level instead of through mesh hover
// events, so they never vanish when the pointer slides off the glass or
// gravel: the tool stays pinned at the nearest spot inside the tank.

const toolPointer = {
  ndc: new THREE.Vector2(),
  /** Where the current press started, so a quick flick still cleans its whole path. */
  downNdc: new THREE.Vector2(),
  seen: false,
  down: false,
  pressed: false,
}

function useCanvasPointer() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const track = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      toolPointer.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      toolPointer.seen = true
    }
    const onDown = (e: PointerEvent) => {
      // A second finger is for the camera, not a second scrub.
      if (e.button !== 0 || touches.count > 1) return
      track(e)
      toolPointer.downNdc.copy(toolPointer.ndc)
      toolPointer.down = true
      toolPointer.pressed = true
    }
    const onUp = () => {
      toolPointer.down = false
    }
    // When a second finger lands, put the tool down so the camera can turn.
    const stopForSecondFinger = onTouchCount((count) => {
      if (count > 1) toolPointer.down = false
    })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', track)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('blur', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('blur', onUp)
      stopForSecondFinger()
      toolPointer.down = false
      toolPointer.pressed = false
    }
  }, [gl])
}

const raycaster = new THREE.Raycaster()
const scratch = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

// --- glass tools -------------------------------------------------------------

function buildWallPlanes() {
  return new Map<WallMapping, THREE.Plane>(
    WALLS.map((w) => {
      const normal = new THREE.Vector3(...w.normal)
      const point = w.axis === 'x' ? new THREE.Vector3(0, 0, w.planeCoord) : new THREE.Vector3(w.planeCoord, 0, 0)
      return [w, new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point)]
    }),
  )
}

let wallPlanes = buildWallPlanes()

function alongOf(wall: WallMapping, p: THREE.Vector3): number {
  return wall.axis === 'x' ? p.x : p.z
}

function wallToWorld(wall: WallMapping, along: number, y: number, out: THREE.Vector3): THREE.Vector3 {
  return wall.axis === 'x' ? out.set(along, y, wall.planeCoord) : out.set(wall.planeCoord, y, along)
}

/** Where a ray meets a wall's (infinite) glass plane, or null if it never does. */
function projectOnWall(ray: THREE.Ray, wall: WallMapping): { along: number; y: number } | null {
  if (!ray.intersectPlane(wallPlanes.get(wall)!, scratch)) return null
  return { along: alongOf(wall, scratch), y: scratch.y }
}

/** Nearest wall whose glass rectangle the ray actually passes through. */
function pickWall(ray: THREE.Ray): { wall: WallMapping; along: number; y: number } | null {
  let best: { wall: WallMapping; along: number; y: number } | null = null
  let bestDist = Infinity
  for (const wall of WALLS) {
    if (!ray.intersectPlane(wallPlanes.get(wall)!, scratch)) continue
    const along = alongOf(wall, scratch)
    if (Math.abs(along) > wall.length / 2 || scratch.y < TANK_BOTTOM_Y || scratch.y > TANK_HEIGHT + 0.1) continue
    const dist = scratch.distanceToSquared(ray.origin)
    if (dist < bestDist) {
      bestDist = dist
      best = { wall, along, y: scratch.y }
    }
  }
  return best
}

const glass = {
  wall: WALLS[0],
  along: 0,
  y: 2,
  active: false,
  lastAlong: 0,
  lastY: 0,
  hasLast: false,
  lastRubAt: 0,
  lastSoundAt: 0,
  spin: 0,
}

// The walls move when the tank grows.
onTankResize(() => {
  wallPlanes = buildWallPlanes()
  glass.wall = WALLS[0]
  glass.active = false
  glass.hasLast = false
})

function scrubPath(tool: GlassToolDef, wall: WallMapping, fromAlong: number, fromY: number, toAlong: number, toY: number, strengthScale = 1): number {
  const dist = Math.hypot(toAlong - fromAlong, toY - fromY)
  const steps = Math.max(1, Math.ceil(dist / (Math.min(tool.halfWidth, tool.halfHeight) * 0.6)))
  let removed = 0
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const along = fromAlong + (toAlong - fromAlong) * t
    const y = fromY + (toY - fromY) * t
    removed += scrubAlgae(wall.a * along + wall.b, y, tool.halfWidth, tool.strength * strengthScale, tool.halfHeight)
  }
  return removed
}

const spongeBody = new RoundedBoxGeometry(0.4, 0.28, 0.1, 3, 0.04)
const spongePad = new RoundedBoxGeometry(0.4, 0.28, 0.03, 2, 0.012)
const yellowFoam = new THREE.MeshStandardMaterial({ color: '#ffd84a', roughness: 0.95 })
const greenPad = new THREE.MeshStandardMaterial({ color: '#3fae4a', roughness: 1 })

const squeegeeBlade = new THREE.BoxGeometry(1.16, 0.05, 0.035)
const squeegeeHolder = new RoundedBoxGeometry(1.2, 0.16, 0.07, 3, 0.025)
const squeegeeHandle = new THREE.CylinderGeometry(0.035, 0.04, 0.6, 12).rotateX(Math.PI / 2)
const rubber = new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.7 })
const tealPlastic = new THREE.MeshStandardMaterial({ color: '#25c2b4', roughness: 0.35 })
const orangeGrip = new THREE.MeshStandardMaterial({ color: '#ff8a2a', roughness: 0.5 })

const magnetBody = new RoundedBoxGeometry(0.84, 0.76, 0.12, 4, 0.1)
const magnetFelt = new RoundedBoxGeometry(0.8, 0.72, 0.022, 2, 0.01)
const magnetKnob = new THREE.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)
const magnetInner = new THREE.MeshStandardMaterial({ color: '#3d7bff', roughness: 0.3, metalness: 0.1 })
const magnetOuter = new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.3, metalness: 0.1 })
const felt = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 1 })

const turboPad = new THREE.CylinderGeometry(0.58, 0.58, 0.04, 36).rotateX(Math.PI / 2)
const turboBristle = new THREE.BoxGeometry(1.08, 0.05, 0.012)
const turboMotor = new THREE.CylinderGeometry(0.26, 0.3, 0.24, 28).rotateX(Math.PI / 2)
const turboRing = new THREE.TorusGeometry(0.28, 0.022, 8, 32)
const turboHandle = new THREE.CylinderGeometry(0.04, 0.04, 0.5, 12)
const padMint = new THREE.MeshStandardMaterial({ color: '#7cf0c8', roughness: 0.9 })
const bristleWhite = new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.8 })
const motorPurple = new THREE.MeshStandardMaterial({ color: '#7a4dff', roughness: 0.25, metalness: 0.2 })
const glowCyan = new THREE.MeshStandardMaterial({ color: '#0b2730', emissive: '#4ff8ff', emissiveIntensity: 2.2 })

/** The cleaning head, modelled with local z = 0 on the glass and +z pointing into the tank. */
function GlassHead({ look, spinRef }: { look: GlassToolLook; spinRef: RefObject<THREE.Group | null> }) {
  if (look === 'squeegee') {
    return (
      <group>
        <mesh geometry={squeegeeBlade} material={rubber} position={[0, -0.05, 0.022]} />
        <mesh geometry={squeegeeHolder} material={tealPlastic} position={[0, 0.02, 0.075]} />
        <mesh geometry={squeegeeHandle} material={orangeGrip} position={[0, 0.16, 0.36]} rotation={[-0.55, 0, 0]} />
      </group>
    )
  }
  if (look === 'magnet') {
    return (
      <group>
        <mesh geometry={magnetFelt} material={felt} position={[0, 0, 0.013]} />
        <mesh geometry={magnetBody} material={magnetInner} position={[0, 0, 0.085]} />
        <mesh geometry={magnetKnob} material={magnetInner} position={[0, 0, 0.145]} />
        {/* Its partner rides on the outside of the glass. */}
        <group position={[0, 0, -GLASS_THICKNESS - 0.008]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={magnetFelt} material={felt} position={[0, 0, 0.013]} />
          <mesh geometry={magnetBody} material={magnetOuter} position={[0, 0, 0.085]} />
          <mesh geometry={magnetKnob} material={magnetOuter} position={[0, 0, 0.145]} />
        </group>
      </group>
    )
  }
  if (look === 'turbo') {
    return (
      <group>
        <group ref={spinRef} position={[0, 0, 0.025]}>
          <mesh geometry={turboPad} material={padMint} />
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={turboBristle} material={bristleWhite} position={[0, 0, -0.022]} rotation={[0, 0, (i * Math.PI) / 3]} />
          ))}
        </group>
        <mesh geometry={turboMotor} material={motorPurple} position={[0, 0, 0.17]} />
        <mesh geometry={turboRing} material={glowCyan} position={[0, 0, 0.29]} />
        <mesh geometry={turboHandle} material={orangeGrip} position={[0, 0.36, 0.2]} rotation={[0.3, 0, 0]} />
      </group>
    )
  }
  return (
    <group>
      <mesh geometry={spongePad} material={greenPad} position={[0, 0, 0.02]} />
      <mesh geometry={spongeBody} material={yellowFoam} position={[0, 0, 0.085]} />
    </group>
  )
}

const basis = new THREE.Matrix4()
const tangent = new THREE.Vector3()
const normalV = new THREE.Vector3()

/** Sponge-type tools: pinned to the inside of whichever glass wall you're working on. */
function GlassToolRig() {
  const camera = useThree((s) => s.camera)
  const toolId = useGameStore((s) => s.equippedGlassTool)
  const tool = getGlassTool(toolId)
  const groupRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)

  useEffect(() => {
    return () => {
      glass.active = false
      glass.hasLast = false
      useUIStore.getState().setToolActive(false)
    }
  }, [])

  useFrame(({ clock }, rawDelta) => {
    const g = groupRef.current
    if (!g) return
    const dt = Math.min(rawDelta, 0.05)
    const now = clock.elapsedTime
    g.visible = toolPointer.seen
    if (!toolPointer.seen) return

    if (toolPointer.pressed) {
      toolPointer.pressed = false
      raycaster.setFromCamera(toolPointer.downNdc, camera)
      const picked = pickWall(raycaster.ray)
      if (picked) glass.wall = picked.wall
      const start = picked ?? projectOnWall(raycaster.ray, glass.wall)
      glass.active = true
      glass.hasLast = !!start
      if (start) {
        const c = clampGlassHead(tool, glass.wall, start.along, start.y)
        glass.lastAlong = c.along
        glass.lastY = c.y
      }
      useUIStore.getState().setToolActive(true)
    }

    raycaster.setFromCamera(toolPointer.ndc, camera)
    const ray = raycaster.ray

    // While scrubbing, stay locked to one wall; when hovering, follow the
    // wall under the pointer, or slide along the last wall's edge if the
    // pointer has wandered outside the tank.
    const target = glass.active
      ? projectOnWall(ray, glass.wall)
      : (() => {
          const picked = pickWall(ray)
          if (picked) {
            glass.wall = picked.wall
            return picked
          }
          return projectOnWall(ray, glass.wall)
        })()
    if (target) {
      const c = clampGlassHead(tool, glass.wall, target.along, target.y)
      glass.along = c.along
      glass.y = c.y
    }

    if (glass.active) {
      let removed = 0
      const moved = glass.hasLast && Math.hypot(glass.along - glass.lastAlong, glass.y - glass.lastY) > 0.004
      if (!glass.hasLast || moved) {
        removed = scrubPath(tool, glass.wall, glass.hasLast ? glass.lastAlong : glass.along, glass.hasLast ? glass.lastY : glass.y, glass.along, glass.y)
        glass.lastRubAt = now
      } else if (now - glass.lastRubAt > 0.12) {
        // Holding still keeps rubbing, just more gently.
        removed = scrubPath(tool, glass.wall, glass.along, glass.y, glass.along, glass.y, 0.5)
        glass.lastRubAt = now
      }
      glass.lastAlong = glass.along
      glass.lastY = glass.y
      glass.hasLast = true
      if (removed > 0.02) {
        useGameStore.getState().rewardAlgaeScrub(removed)
        if (now - glass.lastSoundAt > 0.12) {
          sfx.scrub()
          glass.lastSoundAt = now
        }
        const foam = wallToWorld(glass.wall, glass.along, glass.y, scratch).addScaledVector(normalV.set(...glass.wall.normal), 0.08)
        foam.x += (Math.random() - 0.5) * tool.halfWidth
        foam.y += (Math.random() - 0.5) * tool.halfHeight
        emitSparks(foam, removed > 1 ? 3 : 1, '#e9fff4', { speed: 0.3, size: 1.2, life: 0.9, buoyancy: 0.4 })
        if (removed > 0.5) emitSparks(foam, 1, '#6f9a2a', { speed: 0.2, size: 1.5, life: 1.4, buoyancy: -0.15 })
        if (tool.look === 'turbo' && Math.random() < 0.6) emitBubble(foam.x, foam.y, foam.z, 0.015 + Math.random() * 0.02)
      }
    }
    if (glass.active && !toolPointer.down) {
      glass.active = false
      glass.hasLast = false
      useUIStore.getState().setToolActive(false)
    }

    // Pose: sit on the glass, facing into the tank.
    normalV.set(...glass.wall.normal)
    tangent.crossVectors(UP, normalV)
    basis.makeBasis(tangent, UP, normalV)
    g.quaternion.setFromRotationMatrix(basis)
    wallToWorld(glass.wall, glass.along, glass.y, g.position)
    if (glass.active && tool.look !== 'turbo') g.rotateZ(Math.sin(now * 38) * 0.12)
    glass.spin += dt * (glass.active ? 26 : 1.5)
    if (spinRef.current) spinRef.current.rotation.z = glass.spin
  })

  return (
    <group ref={groupRef} visible={false}>
      <GlassHead look={tool.look} spinRef={spinRef} />
    </group>
  )
}

// --- gravel tools ------------------------------------------------------------

interface GravelLookStyle {
  tubeRadius: number
  collar: string
  hose: string
  ring: string
  bulb?: string
  glow?: boolean
}

const GRAVEL_LOOKS: Record<GravelToolLook, GravelLookStyle> = {
  siphon: { tubeRadius: 0.14, collar: '#2f9e5a', hose: '#3f9a5c', ring: '#9effc8' },
  turbo: { tubeRadius: 0.18, collar: '#ff8a2a', hose: '#e8742a', ring: '#ffd27a', bulb: '#ff5a3c' },
  hydro: { tubeRadius: 0.23, collar: '#1d2633', hose: '#26303f', ring: '#5ff4ff', bulb: '#38e1ff', glow: true },
}

const TUBE_LENGTH = 0.95
const HOSE_RADIUS = 0.05

const tubeGlass = new THREE.MeshStandardMaterial({
  color: '#e4f7ff',
  transparent: true,
  opacity: 0.36,
  roughness: 0.05,
  metalness: 0.1,
  depthWrite: false,
  side: THREE.DoubleSide,
})
const pebbleMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 })
const pebbleGeometry = new THREE.DodecahedronGeometry(0.028, 0)
const bucketMaterial = new THREE.MeshStandardMaterial({ color: '#3d8bff', roughness: 0.45, side: THREE.DoubleSide })
const bucketHandleMaterial = new THREE.MeshStandardMaterial({ color: '#c9d3dc', roughness: 0.3, metalness: 0.8 })
const PEBBLES = 18

const gravel = {
  x: 0,
  z: 0.6,
  active: false,
  lastSoundAt: 0,
  swirl: 0,
}

/** Iteratively intersect the pointer ray with the bumpy gravel surface. */
function floorHit(ray: THREE.Ray, limitX: number, limitZ: number): { x: number; z: number } | null {
  if (ray.direction.y > -0.02) return null
  let h = 0.2
  let x = 0
  let z = 0
  for (let i = 0; i < 3; i++) {
    const t = (h - ray.origin.y) / ray.direction.y
    if (t < 0) return null
    x = THREE.MathUtils.clamp(ray.origin.x + ray.direction.x * t, -limitX, limitX)
    z = THREE.MathUtils.clamp(ray.origin.z + ray.direction.z * t, -limitZ, limitZ)
    h = floorHeightAt(x, z)
  }
  return { x, z }
}

function releaseGravelTool() {
  if (wastePull.size > 0) {
    const live = new Set(useGameStore.getState().waste.map((w) => w.id))
    const moves = [...wastePull.entries()].filter(([id]) => live.has(id)).map(([id, p]) => ({ id, x: p.x, z: p.z }))
    wastePull.clear()
    useGameStore.getState().relocateWaste(moves)
  }
  gravel.active = false
  useUIStore.getState().setToolActive(false)
}

function suck(tool: GravelToolDef, nx: number, nz: number, floor: number, dt: number, now: number) {
  const state = useGameStore.getState()
  const hits: WasteItem[] = []
  const reach = tool.radius + tool.pullRadius
  for (const w of state.waste) {
    const p = wastePosition(w)
    const dx = nx - p.x
    const dz = nz - p.z
    const d = Math.hypot(dx, dz)
    if (d < tool.radius) {
      hits.push(w)
    } else if (d < reach && tool.pullRadius > 0) {
      // Suction drags nearby bits toward the nozzle, faster the closer they are.
      const k = 1 - (d - tool.radius) / tool.pullRadius
      const step = Math.min(d, dt * (0.5 + k * 2.4) * (0.6 + tool.pullRadius))
      wastePull.set(w.id, { x: p.x + (dx / d) * step, z: p.z + (dz / d) * step })
    }
  }
  if (hits.length > 0) {
    for (const w of hits) {
      const p = wastePosition(w)
      wastePull.delete(w.id)
      const y = floorHeightAt(p.x, p.z)
      suckedWaste.push({
        item: w,
        start: now,
        from: new THREE.Vector3(p.x, y + 0.06, p.z),
        via: new THREE.Vector3(nx, floor + 0.08, nz),
        to: new THREE.Vector3(gravel.x, floorHeightAt(gravel.x, gravel.z) + TUBE_LENGTH, gravel.z),
      })
    }
    const removed = state.removeWaste(hits.map((w) => w.id))
    if (removed > 0) {
      sfx.vacuum()
      spawnPopup({ x: nx, y: floor + 0.6, z: nz }, `+${removed}`, '#b8ff9a')
    }
  }
  const food = vacuumFoodNear(nx, nz, tool.radius)
  if ((food > 0 || hits.length > 0) && now - gravel.lastSoundAt > 0.1) {
    gravel.lastSoundAt = now
    emitSparks(new THREE.Vector3(nx, floor + 0.08, nz), 6, '#c9b38a', { speed: 0.5, size: 1, life: 0.5, buoyancy: 0.8 })
  }
}

/** Gravel vacuum: a clear siphon tube with a hose arching over the rim into a bucket. */
function GravelToolRig() {
  const camera = useThree((s) => s.camera)
  const toolId = useGameStore((s) => s.equippedGravelTool)
  const tool = getGravelTool(toolId)
  const style = GRAVEL_LOOKS[tool.look]
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const pullRingRef = useRef<THREE.Mesh>(null)
  const pebblesRef = useRef<THREE.InstancedMesh>(null)
  const whirlRef = useRef<THREE.Mesh>(null)
  const hoseRef = useRef<THREE.Mesh>(null)
  const bulbRef = useRef<THREE.Mesh>(null)
  const bucketRef = useRef<THREE.Group>(null)
  const hoseState = useRef({ x: Infinity, z: Infinity })

  const parts = useMemo(() => {
    const r = style.tubeRadius
    const reach = tool.radius + tool.pullRadius
    return {
      tube: new THREE.CylinderGeometry(r, r * 1.08, TUBE_LENGTH, 28, 1, true),
      rim: new THREE.TorusGeometry(r * 1.08, 0.022, 10, 32).rotateX(Math.PI / 2),
      collar: new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.1, 28),
      reducer: new THREE.CylinderGeometry(HOSE_RADIUS * 1.3, r * 1.05, 0.14, 24),
      ring: new THREE.RingGeometry(tool.radius * 0.8, tool.radius, 48).rotateX(-Math.PI / 2),
      pullRing: new THREE.RingGeometry(reach - 0.07, reach, 64).rotateX(-Math.PI / 2),
      whirl: new THREE.RingGeometry(r * 0.3, tool.radius * 0.95, 48, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2),
      collarMaterial: new THREE.MeshStandardMaterial({ color: style.collar, roughness: 0.35, metalness: style.glow ? 0.6 : 0.05 }),
      hoseMaterial: new THREE.MeshStandardMaterial({ color: style.hose, roughness: 0.45 }),
      bulbMaterial: new THREE.MeshStandardMaterial({
        color: style.bulb ?? style.hose,
        roughness: 0.3,
        emissive: style.glow ? style.bulb : '#000000',
        emissiveIntensity: style.glow ? 1.6 : 0,
      }),
      ringMaterial: makeRingMaterial(style.ring, tool.radius * 0.8, tool.radius),
      pullMaterial: makeRingMaterial(style.ring, reach - 0.07, reach),
      whirlMaterial: new THREE.MeshBasicMaterial({ color: style.ring, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
      glowMaterial: new THREE.MeshStandardMaterial({ color: '#0b2730', emissive: style.ring, emissiveIntensity: 2.4 }),
    }
  }, [style, tool.radius, tool.pullRadius])

  useEffect(() => () => {
    for (const value of Object.values(parts)) value.dispose()
  }, [parts])

  useEffect(() => {
    const mesh = pebblesRef.current
    if (!mesh) return
    const c = new THREE.Color()
    for (let i = 0; i < PEBBLES; i++) mesh.setColorAt(i, c.setHSL(0.09 + Math.random() * 0.05, 0.25, 0.45 + Math.random() * 0.3))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  useEffect(() => releaseGravelTool, [])

  useFrame(({ clock }, rawDelta) => {
    const g = groupRef.current
    if (!g) return
    const dt = Math.min(rawDelta, 0.05)
    const now = clock.elapsedTime
    g.visible = toolPointer.seen
    if (bucketRef.current) bucketRef.current.visible = toolPointer.seen
    if (!toolPointer.seen) return

    const limitX = HALF_WIDTH - INNER - style.tubeRadius * 1.15 - 0.03
    const limitZ = HALF_DEPTH - INNER - style.tubeRadius * 1.15 - 0.03
    const prevX = gravel.x
    const prevZ = gravel.z
    let sweepFromX = prevX
    let sweepFromZ = prevZ
    if (toolPointer.pressed) {
      toolPointer.pressed = false
      raycaster.setFromCamera(toolPointer.downNdc, camera)
      const start = floorHit(raycaster.ray, limitX, limitZ)
      if (start) {
        sweepFromX = start.x
        sweepFromZ = start.z
      }
      gravel.active = true
      useUIStore.getState().setToolActive(true)
    }

    raycaster.setFromCamera(toolPointer.ndc, camera)
    const hit = floorHit(raycaster.ray, limitX, limitZ)
    if (hit) {
      gravel.x = hit.x
      gravel.z = hit.z
    }

    const floor = floorHeightAt(gravel.x, gravel.z)
    const bob = gravel.active ? Math.sin(now * 30) * 0.012 : 0
    g.position.set(gravel.x, floor + 0.03 + bob, gravel.z)

    if (gravel.active) {
      // Sweep the nozzle's whole path this frame so fast strokes don't skip waste.
      const dist = Math.hypot(gravel.x - sweepFromX, gravel.z - sweepFromZ)
      const steps = Math.max(1, Math.ceil(dist / (tool.radius * 0.5)))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const nx = sweepFromX + (gravel.x - sweepFromX) * t
        const nz = sweepFromZ + (gravel.z - sweepFromZ) * t
        suck(tool, nx, nz, floorHeightAt(nx, nz), dt / steps, now)
      }
      if (Math.random() < 0.35) {
        emitBubble(gravel.x + (Math.random() - 0.5) * style.tubeRadius, floor + 0.3 + Math.random() * 0.5, gravel.z + (Math.random() - 0.5) * style.tubeRadius, 0.01)
      }
    }
    if (gravel.active && !toolPointer.down) releaseGravelTool()

    // Suction rings hug the gravel (drawn on top so bumps can't hide them).
    if (ringRef.current) {
      ringRef.current.position.y = 0.02 - bob
      ringRef.current.rotation.y = now * 0.6
      parts.ringMaterial.uniforms.uOpacity.value = gravel.active ? 1 : 0.7 + Math.sin(now * 3) * 0.15
    }
    if (pullRingRef.current) {
      pullRingRef.current.position.y = 0.02 - bob
      pullRingRef.current.visible = tool.pullRadius > 0.25
      parts.pullMaterial.uniforms.uOpacity.value = gravel.active ? 0.55 : 0.3
    }
    gravel.swirl += dt * (gravel.active ? 9 : 0.6)
    if (whirlRef.current) {
      whirlRef.current.visible = gravel.active && tool.look !== 'siphon'
      whirlRef.current.rotation.y = -gravel.swirl
      whirlRef.current.position.y = 0.04 - bob
    }

    // Gravel tumbling inside the tube, like a real gravel vacuum.
    const pebbles = pebblesRef.current
    if (pebbles) {
      const m = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const s = new THREE.Vector3(1, 1, 1)
      for (let i = 0; i < PEBBLES; i++) {
        const phase = i * 2.39996
        const lift = gravel.active ? 0.08 + ((Math.sin(now * (2.2 + (i % 5) * 0.4) + phase) + 1) / 2) * 0.55 : 0.03 + (i % 3) * 0.02
        const radius = style.tubeRadius * (0.35 + ((i * 7) % 10) / 20)
        const angle = phase + gravel.swirl * (1 + (i % 3) * 0.3)
        q.setFromEuler(new THREE.Euler(angle * 2, angle, 0))
        m.compose(scratch.set(Math.cos(angle) * radius, lift, Math.sin(angle) * radius), q, s)
        pebbles.setMatrixAt(i, m)
      }
      pebbles.instanceMatrix.needsUpdate = true
    }

    if (bulbRef.current) {
      const squeeze = gravel.active ? 1 - Math.max(0, Math.sin(now * 9)) * 0.28 : 1
      bulbRef.current.scale.set(1 / Math.sqrt(squeeze), squeeze, 1 / Math.sqrt(squeeze))
    }

    // Re-thread the hose only when the nozzle actually moves.
    const hs = hoseState.current
    if (hoseRef.current && (Math.abs(hs.x - gravel.x) > 0.01 || Math.abs(hs.z - gravel.z) > 0.01)) {
      hs.x = gravel.x
      hs.z = gravel.z
      const side = gravel.x >= 0 ? 1 : -1
      const rimX = side * (HALF_WIDTH + 0.02)
      const bucketX = side * (STAND_WIDTH / 2 + 0.75)
      const top = new THREE.Vector3(gravel.x, floor + 0.03 + TUBE_LENGTH + 0.16, gravel.z)
      const curve = new THREE.CatmullRomCurve3([
        top,
        new THREE.Vector3(gravel.x, TANK_HEIGHT + 0.2, gravel.z),
        new THREE.Vector3(gravel.x + (rimX - gravel.x) * 0.55, TANK_HEIGHT + 0.62, gravel.z * 0.75),
        new THREE.Vector3(rimX, TANK_HEIGHT + 0.42, gravel.z * 0.55),
        new THREE.Vector3(side * (HALF_WIDTH + 0.42), TANK_HEIGHT - 0.25, gravel.z * 0.4 + 0.3),
        new THREE.Vector3(side * (STAND_WIDTH / 2 + 0.45), STAND_TOP_Y + 0.1, 0.9),
        new THREE.Vector3(bucketX, ROOM_FLOOR_Y + 0.82, 1.2),
      ], false, 'centripetal')
      const old = hoseRef.current.geometry
      hoseRef.current.geometry = new THREE.TubeGeometry(curve, 72, HOSE_RADIUS, 10, false)
      old.dispose()
      // The hose lives in world space; cancel the rig's own transform.
      hoseRef.current.position.set(-gravel.x, -(floor + 0.03), -gravel.z)
      if (bulbRef.current) {
        const at = curve.getPoint(0.6)
        bulbRef.current.position.set(at.x - gravel.x, at.y - (floor + 0.03), at.z - gravel.z)
      }
      if (bucketRef.current) bucketRef.current.position.set(bucketX, ROOM_FLOOR_Y, 1.2)
    }
    if (hoseRef.current) hoseRef.current.position.y = -(floor + 0.03 + bob)
  })

  return (
    <>
      <group ref={groupRef} visible={false}>
        <mesh geometry={parts.tube} material={tubeGlass} position={[0, TUBE_LENGTH / 2 + 0.02, 0]} renderOrder={9} />
        <mesh geometry={parts.rim} material={parts.collarMaterial} position={[0, 0.03, 0]} />
        <mesh geometry={parts.collar} material={parts.collarMaterial} position={[0, TUBE_LENGTH + 0.04, 0]} />
        <mesh geometry={parts.reducer} material={parts.collarMaterial} position={[0, TUBE_LENGTH + 0.15, 0]} />
        {style.glow && <mesh geometry={parts.rim} material={parts.glowMaterial} position={[0, TUBE_LENGTH * 0.55, 0]} />}
        <instancedMesh ref={pebblesRef} args={[pebbleGeometry, pebbleMaterial, PEBBLES]} frustumCulled={false} />
        <mesh ref={ringRef} geometry={parts.ring} material={parts.ringMaterial} renderOrder={14} />
        <mesh ref={pullRingRef} geometry={parts.pullRing} material={parts.pullMaterial} renderOrder={14} />
        <mesh ref={whirlRef} geometry={parts.whirl} material={parts.whirlMaterial} renderOrder={13} />
        <mesh ref={hoseRef} material={parts.hoseMaterial} castShadow>
          <bufferGeometry />
        </mesh>
        {style.bulb && <mesh ref={bulbRef} material={parts.bulbMaterial}><sphereGeometry args={[0.11, 18, 14]} /></mesh>}
      </group>
      {/* Bucket on the floor beside the stand where the dirty water goes. */}
      <group ref={bucketRef} visible={false}>
        <mesh material={bucketMaterial} position={[0, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.28, 0.72, 28, 1, true]} />
        </mesh>
        <mesh material={bucketMaterial} position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.28, 28]} />
        </mesh>
        <mesh material={bucketHandleMaterial} position={[0, 0.72, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.36, 0.012, 6, 32, Math.PI]} />
        </mesh>
      </group>
    </>
  )
}

export function CleaningTools() {
  const mode = useUIStore((s) => s.mode)
  const tool = useUIStore((s) => s.cleanTool)
  const cameraMode = useUIStore((s) => s.cleanCameraMode)
  const cleaning = mode === 'clean' && !cameraMode
  return cleaning ? <CleaningToolRig category={tool} /> : null
}

function CleaningToolRig({ category }: { category: 'sponge' | 'vacuum' }) {
  useCanvasPointer()
  return category === 'sponge' ? <GlassToolRig /> : <GravelToolRig />
}
