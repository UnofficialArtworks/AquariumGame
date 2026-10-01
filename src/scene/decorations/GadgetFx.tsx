import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecorationKind } from './decorationDefinitions'
import type { FxProps } from './DecorationFx'
import { useBubbleEmitter, useIsPreview } from './decorationHooks'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { atmosphere } from '../Atmosphere'
import { MeshBuilder, type BuiltPart, type V3 } from '../geometry/MeshBuilder'
import { emitBubble } from '../../sim/bubbles'
import { emitSparks } from '../../sim/sparks'
import { gadgetPulses } from '../../sim/gadgets'
import { simClock } from '../../sim/world'
import { hashString } from '../../utils/rng'
import {
  buildFeederCap,
  buildMarimoBall,
  FEEDER_CAP_BASE_Y,
  FEEDER_LAMP,
  FEEDER_LANTERN_RADIUS,
  FEEDER_SPOUT,
  FILTER,
  FOUNTAIN_SPOUT,
  FOUNTAIN_UPPER_RIM,
  FOUNTAIN_LOWER_Y,
  GROW_ORB,
  GROW_ORB_RADIUS,
  MARIMO_BALLS,
} from './builders/gadgets'

// --- shared helpers ------------------------------------------------------------------

const tmpVec = new THREE.Vector3()
const dummy = new THREE.Object3D()

/** Glows, beams and specks are only for looking at: they must never swallow clicks meant for the tank. */
const noRaycast: THREE.Object3D['raycast'] = () => {}

/** Geometry for moving pieces, built once per key and shared by every placed copy. */
const partCache = new Map<string, BuiltPart[]>()
function cachedParts(key: string, build: () => BuiltPart[]): BuiltPart[] {
  let parts = partCache.get(key)
  if (!parts) {
    parts = build()
    partCache.set(key, parts)
  }
  return parts
}

function Parts({ parts }: { parts: BuiltPart[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow receiveShadow />
      ))}
    </>
  )
}

/** Per-instance material that is freed again when the decoration is removed. */
function useOwned<T extends { dispose(): void }>(make: () => T): T {
  const [item] = useState(make)
  useEffect(() => () => item.dispose(), [item])
  return item
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  draw(canvas.getContext('2d')!, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

let haloTexture: THREE.CanvasTexture | null = null
/** Soft round glow, for lamp halos and light blooms. */
function getHalo(): THREE.CanvasTexture {
  haloTexture ??= canvasTexture((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
  return haloTexture
}

let starTexture: THREE.CanvasTexture | null = null
/** Four-point twinkle, for glints on shiny gold. */
function getStar(): THREE.CanvasTexture {
  starTexture ??= canvasTexture((ctx, s) => {
    const c = s / 2
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.moveTo(c, 0)
    ctx.lineTo(c + 3, c - 3)
    ctx.lineTo(s, c)
    ctx.lineTo(c + 3, c + 3)
    ctx.lineTo(c, s)
    ctx.lineTo(c - 3, c + 3)
    ctx.lineTo(0, c)
    ctx.lineTo(c - 3, c - 3)
    ctx.closePath()
    ctx.fill()
    const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.45)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
  return starTexture
}

/** Additive billboard material; callers drive `opacity` and the sprite's scale every frame. */
function makeGlowSprite(map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 0.3): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, toneMapped: false })
}

// --- marimo moss balls -----------------------------------------------------------------

/** The moss balls rock gently in place (offset phases) and now and then puff out a tiny oxygen bubble. */
function MarimoFx({ def }: FxProps) {
  const preview = useIsPreview()
  const balls = MARIMO_BALLS.map((_, i) => cachedParts(`marimo:${def.id}:${i}`, () => buildMarimoBall(def, i)))
  const refs = useRef<Array<THREE.Group | null>>([])
  const timer = useRef(2 + Math.random() * 3)
  useFrame(({ clock }, delta) => {
    if (preview) return
    const t = clock.elapsedTime
    MARIMO_BALLS.forEach((ball, i) => {
      const g = refs.current[i]
      if (!g) return
      const ph = ball.seed
      g.rotation.set(Math.sin(t * 0.5 + ph) * 0.13, t * 0.05 + ph, Math.cos(t * 0.42 + ph * 1.3) * 0.13)
      g.position.set(
        ball.p[0] + Math.sin(t * 0.45 + ph) * 0.004,
        ball.p[1] + Math.sin(t * 0.6 + ph * 1.7) * 0.003,
        ball.p[2] + Math.cos(t * 0.4 + ph) * 0.004,
      )
    })
    timer.current -= Math.min(delta, 0.1)
    if (timer.current > 0) return
    timer.current = 3 + Math.random() * 5
    const i = Math.floor(Math.random() * MARIMO_BALLS.length)
    const g = refs.current[i]
    if (!g) return
    tmpVec.set(0, MARIMO_BALLS[i].r * 0.92, 0)
    g.localToWorld(tmpVec)
    emitBubble(tmpVec.x + (Math.random() - 0.5) * 0.02, tmpVec.y, tmpVec.z + (Math.random() - 0.5) * 0.02, 0.012 * (0.8 + Math.random() * 0.5), 0)
  })
  return (
    <>
      {MARIMO_BALLS.map((ball, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          position={ball.p}
        >
          <Parts parts={balls[i]} />
        </group>
      ))}
    </>
  )
}

// --- auto-feeder lighthouse -------------------------------------------------------------

const BEAM_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vAlong = uv.y;
    gl_Position = projectionMatrix * mv;
  }
`

// Bright along the middle of the cone, fading out toward its silhouette and its far end.
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vAlong;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float a = pow(facing, 1.6) * pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.06, vAlong);
    gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
  }
`

let beamGeometry: THREE.BufferGeometry | null = null
/** A soft cone of light: apex at the lamp, opening toward +X. */
function getBeamGeometry(): THREE.BufferGeometry {
  if (!beamGeometry) {
    const length = 1
    const g = new THREE.CylinderGeometry(0.21, 0.014, length, 16, 1, true)
    g.translate(0, length / 2, 0)
    g.rotateZ(-Math.PI / 2)
    g.scale(1, 0.55, 1)
    beamGeometry = g
  }
  return beamGeometry
}

function makeBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffd98a') }, uIntensity: { value: 0.1 } },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/** Two Fresnel lens panels on little arms: the part of the lamp that turns. */
function buildLens(): BuiltPart[] {
  const b = new MeshBuilder()
  for (const side of [1, -1]) {
    b.add('lamp', new THREE.BoxGeometry(0.012, 0.1, 0.07), { color: '#fff0b8', position: [side * 0.058, 0, 0] })
    for (const y of [-0.03, 0, 0.03]) {
      b.add('metal', new THREE.BoxGeometry(0.024, 0.006, 0.076), { color: '#9a8650', position: [side * 0.058, y, 0] })
    }
    b.add('metal', new THREE.BoxGeometry(0.05, 0.008, 0.008), { color: '#c9a64a', position: [side * 0.03, 0, 0] })
  }
  return b.build({ groundAO: false })
}

/** Cap hop (up, then a little settle bounce) for `age` seconds after pellets pop out. */
function capHop(age: number): number {
  if (age < 0 || age >= 1.2) return 0
  if (age < 0.4) return Math.sin((age / 0.4) * Math.PI) * 0.075
  if (age < 0.65) return Math.sin(((age - 0.4) / 0.25) * Math.PI) * 0.02
  return 0
}

/**
 * The lantern: a lens and two soft beams sweep around (brighter at night), and
 * when the simulation drops pellets the dome cap hops up and warm sparks pop out.
 */
function FeederFx({ def, instanceId }: FxProps) {
  const preview = useIsPreview()
  const capParts = cachedParts(`feeder-cap:${def.id}`, () => buildFeederCap(def, Math.random))
  const lens = cachedParts('feeder-lens', buildLens)
  const capRef = useRef<THREE.Group>(null)
  const spinRef = useRef<THREE.Group>(null)
  const spoutRef = useRef<THREE.Group>(null)
  const haloRef = useRef<THREE.Sprite>(null)
  const glow = useOwned(
    () => new THREE.MeshBasicMaterial({ color: '#ffc86a', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  )
  const halo = useOwned(() => makeGlowSprite(getHalo(), '#ffcf70'))
  const beam = useOwned(makeBeamMaterial)
  const state = useRef({ init: false, lastPulse: undefined as number | undefined, phase: (hashString(instanceId ?? def.id) % 628) / 100 })

  useFrame(({ clock }) => {
    const s = state.current
    const t = clock.elapsedTime
    const night = atmosphere.night
    let age = Infinity
    if (!preview) {
      const pulseAt = instanceId ? gadgetPulses.get(instanceId) : undefined
      if (!s.init) {
        // A pulse from before this component mounted shouldn't replay its sparks.
        s.init = true
        s.lastPulse = pulseAt
      } else if (pulseAt !== undefined && pulseAt !== s.lastPulse) {
        s.lastPulse = pulseAt
        if (spoutRef.current && simClock.t - pulseAt < 1.2) {
          spoutRef.current.getWorldPosition(tmpVec)
          emitSparks(tmpVec, 14, '#ffd36b', { speed: 0.55, size: 1.2, life: 0.9, buoyancy: 0.25 })
          emitSparks(tmpVec, 6, '#fff3c4', { speed: 0.35, size: 0.9, life: 0.6, buoyancy: 0.4 })
        }
      }
      if (pulseAt !== undefined) age = simClock.t - pulseAt
    }
    const popping = age >= 0 && age < 1.2
    const flash = popping ? Math.exp(-age * 3.2) : 0

    if (capRef.current) {
      capRef.current.position.y = FEEDER_CAP_BASE_Y + capHop(age)
      capRef.current.rotation.z = popping && age < 0.8 ? Math.sin(age * 22) * 0.05 * Math.exp(-age * 5) : 0
    }
    if (spinRef.current) spinRef.current.rotation.y = preview ? 0.6 : t * 0.8 + s.phase
    glow.opacity = preview ? 0.14 : 0.1 + night * 0.28 + flash * 0.35 + Math.sin(t * 1.7) * 0.015
    halo.opacity = preview ? 0.3 : 0.28 + night * 0.5 + flash * 0.3
    haloRef.current?.scale.setScalar(preview ? 0.34 : 0.36 + Math.sin(t * 2.1) * 0.02 + night * 0.06 + flash * 0.18)
    beam.uniforms.uIntensity.value = 0.1 + night * 0.9 + flash * 0.5
  })

  return (
    <>
      <group ref={capRef} position={[0, FEEDER_CAP_BASE_Y, 0]}>
        <Parts parts={capParts} />
      </group>
      <group position={FEEDER_LAMP}>
        <mesh material={glow} raycast={noRaycast}>
          <cylinderGeometry args={[FEEDER_LANTERN_RADIUS - 0.002, FEEDER_LANTERN_RADIUS - 0.002, 0.13, 20, 1, true]} />
        </mesh>
        <group ref={spinRef}>
          <Parts parts={lens} />
          {!preview && (
            <>
              <mesh geometry={getBeamGeometry()} material={beam} frustumCulled={false} raycast={noRaycast} />
              <mesh geometry={getBeamGeometry()} material={beam} rotation={[0, Math.PI, 0]} frustumCulled={false} raycast={noRaycast} />
            </>
          )}
        </group>
        <sprite ref={haloRef} material={halo} scale={0.36} raycast={noRaycast} />
      </group>
      <group ref={spoutRef} position={FEEDER_SPOUT} />
    </>
  )
}

// --- bubble filter tower --------------------------------------------------------------------

/** Clear window of the filter tower, tinted by the same water shader as everything else. */
const glassMaterial = makeAqua(
  new THREE.MeshStandardMaterial({ color: '#cdf6ff', transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  {},
  'aqua-gadget-glass',
)

/** Six pitched blades on a hub. */
function buildImpeller(): BuiltPart[] {
  const b = new MeshBuilder()
  b.add('metal', new THREE.CylinderGeometry(0.034, 0.034, 0.05, 16), { color: '#b9c6d2' })
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.BoxGeometry(0.14, 0.05, 0.012)
    blade.translate(0.095, 0, 0)
    blade.rotateX(0.6)
    blade.rotateY((i / 6) * Math.PI * 2)
    b.add('satin', blade, { color: '#8fe3f5', colorTop: '#d9faff' })
  }
  return b.build({ groundAO: false })
}

function buildSpeck(): BuiltPart[] {
  const b = new MeshBuilder()
  b.add('glow', new THREE.SphereGeometry(0.008, 8, 6), { color: '#c8f6ff' })
  return b.build({ groundAO: false })
}

const SWIRL_COUNT = 26
const swirlSeeds = Array.from({ length: SWIRL_COUNT }, (_, i) => ({
  angle: i * 2.399,
  radius: 0.06 + ((i * 37) % 11) * 0.01,
  offset: i / SWIRL_COUNT,
  speed: 0.7 + ((i * 13) % 7) / 10,
}))

/** Fine specks circulate through the window, carried round and up by the impellers. */
function placeSwirl(mesh: THREE.InstancedMesh, t: number) {
  const y0 = FILTER.glassY0 + 0.1
  const span = FILTER.glassY1 - 0.04 - y0
  swirlSeeds.forEach((p, i) => {
    const rise = (t * 0.1 * p.speed + p.offset) % 1
    const angle = p.angle + t * (p.radius < 0.11 ? 1.3 : -1)
    dummy.position.set(Math.cos(angle) * p.radius, y0 + rise * span, Math.sin(angle) * p.radius)
    dummy.scale.setScalar(0.5 + Math.sin(rise * Math.PI) * 0.9)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
}

const LED_COLOR = new THREE.Color('#5ff0ff')

/** Spinning impellers behind clear glass, a pulsing cyan LED, and a steady stream of fine bubbles. */
function FilterFx() {
  const preview = useIsPreview()
  const impeller = cachedParts('filter-impeller', buildImpeller)
  const speck = cachedParts('filter-speck', buildSpeck)[0]
  const lowerRef = useRef<THREE.Group>(null)
  const upperRef = useRef<THREE.Group>(null)
  const swirlRef = useRef<THREE.InstancedMesh>(null)
  const outletRef = useRef<THREE.Group>(null)
  const haloRef = useRef<THREE.Sprite>(null)
  const led = useOwned(() => new THREE.MeshBasicMaterial({ color: LED_COLOR, toneMapped: false }))
  const halo = useOwned(() => makeGlowSprite(getHalo(), '#7ff0ff'))
  const phase = useRef(Math.random() * 6)
  useBubbleEmitter(outletRef, { rate: 10, radius: 0.011, spread: 0.016 })

  useLayoutEffect(() => {
    if (swirlRef.current) placeSwirl(swirlRef.current, 3)
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (preview) {
      if (lowerRef.current) lowerRef.current.rotation.y = 0.4
      if (upperRef.current) upperRef.current.rotation.y = 1.1
      led.color.copy(LED_COLOR).multiplyScalar(1.6)
      halo.opacity = 0.5
      haloRef.current?.scale.setScalar(0.1)
      return
    }
    if (lowerRef.current) lowerRef.current.rotation.y = t * 5
    if (upperRef.current) upperRef.current.rotation.y = -t * 3.6 + 1
    if (swirlRef.current) placeSwirl(swirlRef.current, t)
    const k = 0.5 + 0.5 * Math.sin(t * 2.4 + phase.current)
    led.color.copy(LED_COLOR).multiplyScalar(0.9 + k * 1.4)
    halo.opacity = 0.25 + k * 0.4 + atmosphere.night * 0.2
    haloRef.current?.scale.setScalar(0.09 + k * 0.05)
  })

  const { glassY0, glassY1, glassRadius, impellers, led: ledAt, outlet } = FILTER
  return (
    <>
      <mesh material={glassMaterial} position={[0, (glassY0 + glassY1) / 2, 0]} renderOrder={4}>
        <cylinderGeometry args={[glassRadius, glassRadius, glassY1 - glassY0, 40, 1, true]} />
      </mesh>
      <group ref={lowerRef} position={[0, impellers[0], 0]}>
        <Parts parts={impeller} />
      </group>
      <group ref={upperRef} position={[0, impellers[1], 0]}>
        <Parts parts={impeller} />
      </group>
      <instancedMesh ref={swirlRef} args={[speck.geometry, decorMaterials[speck.material], SWIRL_COUNT]} frustumCulled={false} raycast={noRaycast} />
      <mesh position={ledAt} material={led}>
        <sphereGeometry args={[0.014, 12, 10]} />
      </mesh>
      <sprite ref={haloRef} position={[ledAt[0], ledAt[1], ledAt[2] + 0.012]} material={halo} scale={0.1} raycast={noRaycast} />
      <group ref={outletRef} position={outlet} />
    </>
  )
}

// --- sunstone coral -----------------------------------------------------------------------------

/** The sunstone breathes: its scale and glow pulse softly, and warm motes drift up around it. */
function GrowFx() {
  const preview = useIsPreview()
  const orbRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Sprite>(null)
  const orb = useOwned(() =>
    makeAqua(
      new THREE.MeshStandardMaterial({ color: '#ffc468', emissive: '#ff9a2e', emissiveIntensity: 1.7, roughness: 0.25, metalness: 0, flatShading: true }),
      {},
      'aqua-gadget-orb',
    ),
  )
  const halo = useOwned(() => makeGlowSprite(getHalo(), '#ffb347'))
  const motes = useRef(0.5)

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    if (preview) {
      orb.emissiveIntensity = 1.7
      halo.opacity = 0.5
      haloRef.current?.scale.setScalar(0.5)
      return
    }
    const night = atmosphere.night
    const beat = 0.5 + 0.5 * Math.sin(t * 1.9)
    const s = 1 + (beat - 0.5) * 0.1 + Math.sin(t * 3.3 + 1) * 0.015
    orbRef.current?.scale.setScalar(s)
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.12
    orb.emissiveIntensity = 1.2 + beat * 0.9 + night * 1.6
    halo.opacity = 0.32 + beat * 0.2 + night * 0.4
    haloRef.current?.scale.setScalar(0.5 * s + night * 0.1)

    motes.current -= Math.min(delta, 0.1)
    if (motes.current > 0 || !orbRef.current) return
    motes.current = 0.25 + Math.random() * 0.45
    orbRef.current.getWorldPosition(tmpVec)
    const a = Math.random() * Math.PI * 2
    const d = 0.13 + Math.random() * 0.12
    tmpVec.x += Math.cos(a) * d
    tmpVec.z += Math.sin(a) * d
    tmpVec.y += (Math.random() - 0.4) * 0.15
    emitSparks(tmpVec, 1, Math.random() < 0.5 ? '#ffd27a' : '#fff0a0', { speed: 0.05, size: 0.9, life: 2.4, buoyancy: 0.35, spread: 0.01 })
  })

  return (
    <group ref={orbRef} position={GROW_ORB}>
      <mesh ref={coreRef} material={orb}>
        <icosahedronGeometry args={[GROW_ORB_RADIUS, 1]} />
      </mesh>
      <sprite ref={haloRef} material={halo} scale={0.5} raycast={noRaycast} />
    </group>
  )
}

// --- lucky coin fountain ---------------------------------------------------------------------------

function buildDroplet(): BuiltPart[] {
  const b = new MeshBuilder()
  b.add('glow', new THREE.SphereGeometry(0.011, 8, 6), { color: '#bff4ff' })
  return b.build({ groundAO: false })
}

const JETS = 8
const JET_DROPS = 5
const STREAMS = 6
const STREAM_DROPS = 5
const DROP_COUNT = JETS * JET_DROPS + STREAMS * STREAM_DROPS

/**
 * Water droplets: a ring of jets arcs out of the fish's mouth into the top basin
 * (spinning slowly), and a few streams spill over the rim into the lower basin.
 */
function placeDrops(mesh: THREE.InstancedMesh, t: number) {
  const [sx, sy, sz] = FOUNTAIN_SPOUT
  let n = 0
  for (let j = 0; j < JETS; j++) {
    const a = t * 0.5 + (j / JETS) * Math.PI * 2
    for (let d = 0; d < JET_DROPS; d++) {
      const u = (t * 0.55 + d / JET_DROPS + j * 0.07) % 1
      const reach = 0.2 * u
      dummy.position.set(sx + Math.sin(a) * reach, sy + 0.22 * u - 0.49 * u * u, sz + Math.cos(a) * reach)
      dummy.scale.setScalar(0.8 + (1 - u) * 0.5)
      dummy.updateMatrix()
      mesh.setMatrixAt(n++, dummy.matrix)
    }
  }
  for (let k = 0; k < STREAMS; k++) {
    const a = (k / STREAMS) * Math.PI * 2 + 0.3
    for (let d = 0; d < STREAM_DROPS; d++) {
      const u = (t * 0.7 + d / STREAM_DROPS + k * 0.13) % 1
      const r = FOUNTAIN_UPPER_RIM[0] + 0.04 * u
      dummy.position.set(Math.sin(a) * r, FOUNTAIN_UPPER_RIM[1] - (FOUNTAIN_UPPER_RIM[1] - FOUNTAIN_LOWER_Y) * u * u, Math.cos(a) * r)
      dummy.scale.set(0.8, 1.6 + u * 1.2, 0.8)
      dummy.updateMatrix()
      mesh.setMatrixAt(n++, dummy.matrix)
    }
  }
  mesh.instanceMatrix.needsUpdate = true
}

/** Where the twinkles sit: rims, the stem's bulb and the fish. */
const GLINTS: V3[] = [
  [0.0, 0.24, 0.47],
  [0.34, 0.24, 0.33],
  [-0.4, 0.24, 0.24],
  [0.2, 0.72, 0.18],
  [-0.24, 0.72, -0.1],
  [0.05, 0.9, 0.05],
  [-0.06, 0.34, 0.09],
]

/** Water spray, twinkling glints on the gold, and the odd golden sparkle. */
function FountainFx() {
  const preview = useIsPreview()
  const droplet = cachedParts('fountain-droplet', buildDroplet)[0]
  const dropsRef = useRef<THREE.InstancedMesh>(null)
  const rootRef = useRef<THREE.Group>(null)
  const spoutRef = useRef<THREE.Group>(null)
  const glintRefs = useRef<Array<THREE.Sprite | null>>([])
  const star = useOwned(() => makeGlowSprite(getStar(), '#ffe9a0', 0.95))
  const timers = useRef({ glint: Math.random() * 1.5, sparkle: 3 + Math.random() * 3 })

  useLayoutEffect(() => {
    if (dropsRef.current) placeDrops(dropsRef.current, 0.3)
  }, [])

  useFrame(({ clock }, delta) => {
    if (preview) return
    const t = clock.elapsedTime
    if (dropsRef.current) placeDrops(dropsRef.current, t)
    glintRefs.current.forEach((sprite, i) => {
      const k = Math.max(0, Math.sin(t * 1.5 + i * 2.1))
      sprite?.scale.setScalar(0.02 + 0.13 * k ** 5)
    })
    const dt = Math.min(delta, 0.1)
    const tm = timers.current
    tm.glint -= dt
    if (tm.glint <= 0 && rootRef.current) {
      tm.glint = 0.6 + Math.random() * 1.2
      rootRef.current.getWorldPosition(tmpVec)
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * 0.45
      tmpVec.x += Math.cos(a) * r
      tmpVec.z += Math.sin(a) * r
      tmpVec.y += 0.2 + Math.random() * 0.6
      emitSparks(tmpVec, 2, '#ffe27a', { speed: 0.12, size: 1.5, life: 0.8 })
    }
    tm.sparkle -= dt
    if (tm.sparkle <= 0 && spoutRef.current) {
      tm.sparkle = 5 + Math.random() * 5
      spoutRef.current.getWorldPosition(tmpVec)
      emitSparks(tmpVec, 8, '#fff0a0', { speed: 0.45, size: 1.3, life: 1.1, buoyancy: 0.5 })
    }
  })

  return (
    <group ref={rootRef}>
      <instancedMesh ref={dropsRef} args={[droplet.geometry, decorMaterials[droplet.material], DROP_COUNT]} frustumCulled={false} raycast={noRaycast} />
      {GLINTS.map((p, i) => (
        <sprite
          key={i}
          ref={(el) => {
            glintRefs.current[i] = el
          }}
          position={p}
          material={star}
          scale={preview ? 0.07 : 0.02}
          raycast={noRaycast}
        />
      ))}
      <group ref={spoutRef} position={FOUNTAIN_SPOUT} />
    </group>
  )
}

/** Animated parts for the gadget decorations; DecorationVisual merges this into its FX lookup. */
export const GADGET_FX: Partial<Record<DecorationKind, ComponentType<FxProps>>> = {
  marimo: MarimoFx,
  feeder: FeederFx,
  filter: FilterFx,
  growlamp: GrowFx,
  fountain: FountainFx,
}
