import { useMemo, useRef, type ComponentType } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecorationCatalogEntry, DecorationKind } from './decorationDefinitions'
import { burstBubbles, useBubbleEmitter, useIsPreview } from './decorationHooks'
import { decorMaterials } from '../materials/materials'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { latheFrom, taperedTube } from '../geometry/shapes'
import { buildChestLid, CHEST, DIVER_VALVE, SUB_POSE, SUB_PROPELLER, UFO_POSE, UFO_RIM_RADIUS, VOLCANO_CRATER } from './builders/adventure'
import { buildClamLid, CLAM_DEPTH, CLAM_HINGE_X } from './builders/sparkle'
import { emitSparks } from '../../sim/sparks'
import { spawnPopup } from '../../sim/popups'
import { useGameStore } from '../../state/useGameStore'
import { useUIStore } from '../../state/useUIStore'
import { sfx } from '../../audio/sfx'
import { floorHeightAt, waterLevel } from '../TankBounds'
import { hashString } from '../../utils/rng'

export interface FxProps {
  def: DecorationCatalogEntry
  instanceId?: string
}

const lidCache = new Map<string, ReturnType<typeof buildChestLid>>()
function cachedLid(key: string, build: () => ReturnType<typeof buildChestLid>) {
  let parts = lidCache.get(key)
  if (!parts) {
    parts = build()
    lidCache.set(key, parts)
  }
  return parts
}

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
const lastTreasure = new Map<string, number>()
const TREASURE_COOLDOWN_MS = 3 * 60 * 1000

/** Tapping a chest/clam in View mode pops it open; every few minutes it also pays out. */
function claimTreasure(instanceId: string | undefined, origin: THREE.Object3D, coins: number) {
  if (!instanceId) return
  const now = Date.now()
  const last = lastTreasure.get(instanceId) ?? 0
  const p = new THREE.Vector3()
  origin.getWorldPosition(p)
  if (now - last < TREASURE_COOLDOWN_MS) {
    spawnPopup({ x: p.x, y: p.y + 0.5, z: p.z }, 'Empty… check back soon', '#cfe8ff')
    return
  }
  lastTreasure.set(instanceId, now)
  useGameStore.getState().collectCoins(coins, true)
  spawnPopup({ x: p.x, y: p.y + 0.55, z: p.z }, `Treasure! +${coins}`, '#ffd84a', true)
  emitSparks(p.clone().setY(p.y + 0.3), 30, '#ffd84a', { speed: 1.4, size: 1.4, life: 1 })
  sfx.coin(true)
}

/** Shared open/close timing: opens on a timer, or immediately when poked. */
function useOpener(periodMin: number, periodMax: number, seed: string) {
  const state = useRef({ timer: 4 + (hashString(seed) % 1000) / 100, open: 0, target: 0, hold: 0 })
  const poke = () => {
    state.current.target = 1
    state.current.hold = 2.5
  }
  const step = (dt: number, onOpen: () => void) => {
    const s = state.current
    if (s.target === 0) {
      s.timer -= dt
      if (s.timer <= 0) {
        s.target = 1
        s.hold = 2
      }
    } else {
      s.hold -= dt
      if (s.hold <= 0) {
        s.target = 0
        s.timer = periodMin + Math.random() * (periodMax - periodMin)
      }
    }
    const before = s.open
    s.open = THREE.MathUtils.damp(s.open, s.target, s.target > s.open ? 7 : 2.5, dt)
    if (before < 0.15 && s.open >= 0.15 && s.target === 1) onOpen()
    return s.open
  }
  return { poke, step }
}

function TreasureHit({ size, position, onTap }: { size: [number, number, number]; position: [number, number, number]; onTap: () => void }) {
  const viewMode = useUIStore((s) => s.mode === 'view')
  const preview = useIsPreview()
  if (!viewMode || preview) return null
  return (
    <mesh
      position={position}
      material={hitMaterial}
      userData={{ interactive: true }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 6) return
        e.stopPropagation()
        onTap()
      }}
    >
      <boxGeometry args={size} />
    </mesh>
  )
}

function ChestFx({ def, instanceId }: FxProps) {
  const lidRef = useRef<THREE.Group>(null)
  const mouthRef = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const parts = cachedLid(`chest:${def.id}`, () => buildChestLid(def, Math.random))
  const opener = useOpener(14, 22, instanceId ?? def.id)
  useFrame((_, delta) => {
    if (preview || !lidRef.current) return
    const open = opener.step(Math.min(delta, 0.05), () => {
      if (mouthRef.current) {
        burstBubbles(mouthRef.current, 24, 0.03, 0.15)
        const p = new THREE.Vector3()
        mouthRef.current.getWorldPosition(p)
        emitSparks(p, 14, '#ffd84a', { speed: 0.6, size: 1.2, life: 1.2, buoyancy: 0.3 })
      }
    })
    lidRef.current.rotation.x = -open * 1.15
  })
  return (
    <>
      <group ref={lidRef} position={[0, CHEST.H, -CHEST.D / 2]}>
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
        ))}
      </group>
      <group ref={mouthRef} position={[0, CHEST.H + 0.05, 0]} />
      <TreasureHit
        size={[CHEST.W + 0.1, CHEST.H + 0.25, CHEST.D + 0.1]}
        position={[0, CHEST.H / 2 + 0.1, 0]}
        onTap={() => {
          opener.poke()
          if (mouthRef.current) claimTreasure(instanceId, mouthRef.current, 15)
        }}
      />
    </>
  )
}

function ClamFx({ def, instanceId }: FxProps) {
  const lidRef = useRef<THREE.Group>(null)
  const pearlRef = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const parts = cachedLid(`clam:${def.id}`, () => buildClamLid(def, Math.random))
  const opener = useOpener(10, 18, instanceId ?? def.id)
  useFrame((_, delta) => {
    if (!lidRef.current) return
    if (preview) {
      lidRef.current.rotation.z = 0.75
      return
    }
    const open = opener.step(Math.min(delta, 0.05), () => {
      if (pearlRef.current) burstBubbles(pearlRef.current, 18, 0.028, 0.12)
    })
    lidRef.current.rotation.z = 0.08 + open * 0.85
  })
  return (
    <>
      <group ref={lidRef} position={[CLAM_HINGE_X, CLAM_DEPTH, 0]}>
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
        ))}
      </group>
      <group ref={pearlRef} position={[CLAM_HINGE_X + 0.16, CLAM_DEPTH + 0.06, 0]} />
      <TreasureHit
        size={[0.8, 0.5, 0.8]}
        position={[0, 0.2, 0]}
        onTap={() => {
          opener.poke()
          if (pearlRef.current) claimTreasure(instanceId, pearlRef.current, 20)
        }}
      />
    </>
  )
}

function AirstoneFx() {
  const ref = useRef<THREE.Group>(null)
  useBubbleEmitter(ref, { rate: 26, radius: 0.022, spread: 0.05 })
  return <group ref={ref} position={[0, 0.1, 0]} />
}

function DiverFx() {
  const ref = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const timer = useRef(1)
  useFrame((_, delta) => {
    if (preview || !ref.current) return
    timer.current -= delta
    if (timer.current <= 0) {
      timer.current = 2 + Math.random() * 2
      burstBubbles(ref.current, 6, 0.035, 0.03)
    }
  })
  return <group ref={ref} position={[DIVER_VALVE.x, DIVER_VALVE.y, DIVER_VALVE.z]} />
}

const bladeGeometry = (() => {
  const b = new MeshBuilder()
  for (let i = 0; i < 4; i++) {
    const g = new THREE.BoxGeometry(0.012, 0.13, 0.05)
    g.translate(0, 0.07, 0)
    g.rotateY(0.5)
    g.rotateX((i / 4) * Math.PI * 2)
    b.add('metal', g, { color: '#b8a25a' })
  }
  b.add('metal', new THREE.SphereGeometry(0.03, 10, 8), { color: '#8a8f96' })
  return b.build({ groundAO: false })
})()

function SubmarineFx() {
  const spinRef = useRef<THREE.Group>(null)
  const emitRef = useRef<THREE.Group>(null)
  useBubbleEmitter(emitRef, { rate: 7, radius: 0.02, spread: 0.06 })
  const pose = useMemo(() => {
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    SUB_POSE.decompose(position, quaternion, new THREE.Vector3())
    return { position, quaternion }
  }, [])
  useFrame((_, delta) => {
    if (spinRef.current) spinRef.current.rotation.x += delta * 7
  })
  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      <group position={SUB_PROPELLER.toArray()}>
        <group ref={spinRef}>
          {bladeGeometry.map((p, i) => (
            <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
          ))}
        </group>
        <group ref={emitRef} position={[-0.06, 0, 0]} />
      </group>
    </group>
  )
}

function VolcanoFx() {
  const ref = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const eruption = useRef(6)
  useBubbleEmitter(ref, { rate: 6, radius: 0.03, spread: 0.07, kind: 1 })
  useFrame((_, delta) => {
    if (preview || !ref.current) return
    eruption.current -= delta
    if (eruption.current <= 0) {
      eruption.current = 8 + Math.random() * 6
      burstBubbles(ref.current, 40, 0.04, 0.1, 1)
      const p = new THREE.Vector3()
      ref.current.getWorldPosition(p)
      emitSparks(p, 30, '#ff7a1a', { speed: 1.6, size: 1.6, life: 1.4, buoyancy: 0.6 })
    }
  })
  return <group ref={ref} position={VOLCANO_CRATER.toArray()} />
}

const chaseMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfffd8').multiplyScalar(4), toneMapped: false })

function UfoFx() {
  const chaseRef = useRef<THREE.Mesh>(null)
  const sparkRef = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const pose = useMemo(() => {
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    UFO_POSE.decompose(position, quaternion, new THREE.Vector3())
    return { position, quaternion }
  }, [])
  const sparkTimer = useRef(2)
  useFrame(({ clock }, delta) => {
    const a = clock.elapsedTime * 2.5
    if (chaseRef.current) chaseRef.current.position.set(Math.cos(a) * UFO_RIM_RADIUS, 0.015, Math.sin(a) * UFO_RIM_RADIUS)
    if (preview || !sparkRef.current) return
    sparkTimer.current -= delta
    if (sparkTimer.current <= 0) {
      sparkTimer.current = 1.5 + Math.random() * 3
      const p = new THREE.Vector3()
      sparkRef.current.getWorldPosition(p)
      emitSparks(p, 10, '#7ff0ff', { speed: 1.2, size: 0.9, life: 0.4 })
    }
  })
  return (
    <group position={pose.position} quaternion={pose.quaternion}>
      <mesh ref={chaseRef} material={chaseMaterial}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
      <group ref={sparkRef} position={[-0.4, 0.05, 0.3]} />
    </group>
  )
}

function SporesFx() {
  const ref = useRef<THREE.Group>(null)
  useBubbleEmitter(ref, { rate: 1.6, radius: 0.012, spread: 0.25, kind: 2 })
  return <group ref={ref} position={[0, 0.45, 0]} />
}

export function GlintFx({ height, spread, color }: { height: number; spread: number; color: string }) {
  const ref = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const timer = useRef(Math.random() * 2)
  useFrame((_, delta) => {
    if (preview || !ref.current) return
    timer.current -= delta
    if (timer.current > 0) return
    timer.current = 0.6 + Math.random() * 1.4
    const p = new THREE.Vector3()
    ref.current.getWorldPosition(p)
    p.x += (Math.random() - 0.5) * spread
    p.z += (Math.random() - 0.5) * spread
    p.y += Math.random() * height
    emitSparks(p, 3, color, { speed: 0.15, size: 1.5, life: 0.8 })
  })
  return <group ref={ref} position={[0, 0.1, 0]} />
}

function CrystalFx({ def }: FxProps) {
  return <GlintFx height={0.5} spread={0.35} color={def.accentColor} />
}

function PalaceFx({ def }: FxProps) {
  return <GlintFx height={1.6} spread={0.6} color={def.accentColor} />
}

const flagGeometry = (() => {
  const g = new THREE.PlaneGeometry(0.2, 0.12, 8, 2)
  g.translate(0.1, 0, 0)
  return g
})()

function CastleFlag({ def }: FxProps) {
  const flagRef = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: def.accentColor, side: THREE.DoubleSide, roughness: 0.6 }),
    [def.accentColor],
  )
  const base = useMemo(() => Float32Array.from(flagGeometry.getAttribute('position').array), [])
  const geometry = useMemo(() => flagGeometry.clone(), [])
  useFrame(({ clock }) => {
    const pos = geometry.getAttribute('position')
    const t = clock.elapsedTime
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]
      pos.setZ(i, Math.sin(x * 25 - t * 4) * 0.025 * (x / 0.2))
    }
    pos.needsUpdate = true
  })
  return (
    <group position={[0.05, 1.53, -0.05]}>
      <mesh material={decorMaterials.metal} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.3, 6]} />
      </mesh>
      <mesh ref={flagRef} geometry={geometry} material={material} position={[0, 0.2, 0]} />
    </group>
  )
}

/** Stems reach from the gravel to lily pads that float on the (moving) water surface. */
function LilyFx({ def }: FxProps) {
  const groupRef = useRef<THREE.Group>(null)
  const stemsRef = useRef<THREE.Group>(null)
  const preview = useIsPreview()
  const pads = useMemo(() => {
    const b = new MeshBuilder()
    const spots: Array<[number, number, number, number]> = [
      [0, 0, 0.2, 0.3],
      [0.32, 0.1, 0.15, 2.1],
      [-0.28, -0.12, 0.17, 4],
      [0.08, -0.32, 0.13, 1.1],
    ]
    for (const [x, z, r, rot] of spots) {
      const pad = new THREE.CircleGeometry(r, 28, 0.35, Math.PI * 2 - 0.35)
      pad.rotateX(-Math.PI / 2)
      pad.rotateY(rot)
      b.add('thin', pad, { color: def.color, position: [x, 0, z], colorFn: (p, _n, c) => c.set(def.color).multiplyScalar(0.8 + Math.sin(Math.atan2(p.z - z, p.x - x) * 12) * 0.08) })
    }
    // Flower: two rings of petals with a golden center
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 8; i++) {
        const petal = new THREE.SphereGeometry(0.05, 10, 6)
        petal.scale(0.55, 0.3, 1.4)
        petal.translate(0, 0.02 + ring * 0.03, 0.06 - ring * 0.015)
        petal.rotateX(-0.5 - ring * 0.4)
        petal.rotateY((i / 8) * Math.PI * 2 + ring * 0.4)
        b.add('glow', petal, { color: ring ? '#ffd1ea' : def.accentColor, colorTop: '#ffffff', position: [0.02, 0.02, 0.02] })
      }
    }
    b.add('glow', new THREE.SphereGeometry(0.025, 10, 8), { color: '#ffd23f', position: [0.02, 0.07, 0.02] })
    return b.build({ groundAO: false })
  }, [def])
  const stems = useMemo(() => {
    const b = new MeshBuilder()
    const tips: Array<[number, number]> = [
      [0, 0],
      [0.32, 0.1],
      [-0.28, -0.12],
      [0.08, -0.32],
    ]
    for (const [x, z] of tips) {
      b.add('sway', taperedTube([[x * 0.2, 0, z * 0.2], [x * 0.6, 0.5, z * 0.6], [x, 1, z]], 0.012, 0.01, 16, 5, false), { color: '#3f7a34' })
    }
    b.add('matte', latheFrom([[0.12, 0], [0.08, 0.03], [0.0001, 0.05]], 16), { color: '#3a2e20' })
    return b.build({ groundAO: false })
  }, [])

  useFrame(() => {
    const group = groupRef.current
    if (!group || !stemsRef.current) return
    let height = 0.9
    if (!preview && group.parent) {
      const p = new THREE.Vector3()
      group.parent.getWorldPosition(p)
      height = waterLevel.current - floorHeightAt(p.x, p.z) - 0.015
    }
    group.position.y = height
    stemsRef.current.scale.y = height
  })

  return (
    <>
      <group ref={stemsRef}>
        {stems.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
        ))}
      </group>
      <group ref={groupRef}>
        {pads.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
        ))}
      </group>
    </>
  )
}

export const DECORATION_FX: Partial<Record<DecorationKind, ComponentType<FxProps>>> = {
  chest: ChestFx,
  clam: ClamFx,
  airstone: AirstoneFx,
  diver: DiverFx,
  submarine: SubmarineFx,
  volcano: VolcanoFx,
  ufo: UfoFx,
  mushrooms: SporesFx,
  crystals: CrystalFx,
  palace: PalaceFx,
  castle: CastleFlag,
  lily: LilyFx,
}
