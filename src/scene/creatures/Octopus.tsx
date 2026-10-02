import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { noise3 } from '../../utils/noise'
import { randomRange } from '../../utils/math'
import { hashString, mulberry32 } from '../../utils/rng'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

const ARM_PARS = /* glsl */ `
  attribute vec2 aArm;
  uniform float uWalk;
  uniform float uEffort;
  uniform float uJet;
  uniform float uSeed;
  uniform float uLen;
`

// Each arm knows how far along it a vertex is (aArm.x) and which way it
// points (aArm.y). Arms step in alternating pairs as it crawls, waves flow
// down them while it sits, the tips curl, and a startled jet streams them all
// back behind the mantle.
const ARM_VERTEX = /* glsl */ `
  {
    float s = aArm.x;
    float a = aArm.y;
    vec2 radial = vec2(cos(a), sin(a));
    vec2 across = vec2(-radial.y, radial.x);
    float t = uAquaTime;
    float stride = uWalk + a * 2.0;
    float lift = max(0.0, sin(stride)) * uEffort * 0.09 * uLen * smoothstep(0.1, 0.6, s);
    float wave = sin(t * 1.6 + a * 3.0 + uSeed - s * 5.0);
    float curl = sin(t * 1.1 + a * 2.0 + uSeed) * s * s * 0.06 * uLen;
    transformed.y += lift + curl;
    transformed.xz += across * wave * pow(s, 1.5) * 0.06 * uLen * (0.6 + uEffort);
    transformed.xz += radial * cos(stride) * uEffort * 0.04 * uLen * s;
    vec2 streamed = vec2(-(0.1 + s * 0.6) * uLen, transformed.z * 0.25);
    float jet = uJet * smoothstep(0.0, 0.45, s);
    transformed.xz = mix(transformed.xz, streamed, jet);
    transformed.y = mix(transformed.y, transformed.y * 0.25 - 0.02 * uLen, jet);
  }
`

/** Where the arms meet under the head (model space, facing +X). */
const HUB = new THREE.Vector3(0.04, -0.04, 0)

/** Skin tone baked into vertex colours: darker, spotty back, paler underside. */
function skinTone(p: THREE.Vector3, n: THREE.Vector3, L: number): number {
  const spots = noise3(p.x * (24 / L), p.y * (24 / L), p.z * (24 / L))
  const back = 0.72 + noise3(p.x * (8 / L), p.y * (8 / L), p.z * (8 / L)) * 0.08
  const tone = spots > 0.15 ? back * (0.82 - (spots - 0.15) * 0.6) : back
  return THREE.MathUtils.lerp(tone, 1.05, THREE.MathUtils.smoothstep(-n.y, -0.1, 0.6))
}

const bodyCache = new Map<number, { head: ReturnType<MeshBuilder['build']>; mantle: ReturnType<MeshBuilder['build']>; arms: THREE.BufferGeometry }>()

function octopusGeometry(L: number) {
  let cached = bodyCache.get(L)
  if (cached) return cached
  const tone = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => c.setScalar(skinTone(p, n, L))
  const head = new MeshBuilder()
  head.add('satin', new THREE.SphereGeometry(L * 0.13, 24, 18), { color: '#fff', position: [L * 0.05, L * 0.02, 0], scale: [1, 0.9, 1.05], colorFn: tone })
  // Raised eyes with sleepy lids and the octopus's horizontal pupils.
  for (const side of [1, -1]) {
    head.add('satin', new THREE.SphereGeometry(L * 0.05, 14, 10), { color: '#fff', position: [L * 0.1, L * 0.085, side * L * 0.085], colorFn: tone })
    head.add('glossy', new THREE.SphereGeometry(L * 0.036, 14, 10), { color: '#fff3d6', position: [L * 0.115, L * 0.09, side * L * 0.11] })
    head.add('glossy', new THREE.SphereGeometry(L * 0.02, 12, 8), { color: '#141018', position: [L * 0.122, L * 0.09, side * L * 0.138], scale: [1.7, 0.45, 0.7] })
    head.add('glossy', new THREE.SphereGeometry(L * 0.006, 6, 6), { color: '#ffffff', position: [L * 0.135, L * 0.1, side * L * 0.143] })
  }
  const mantle = new MeshBuilder()
  mantle.add('satin', new THREE.SphereGeometry(L * 0.155, 28, 20), { color: '#fff', scale: [1.35, 1.05, 1], colorFn: tone })

  // Eight arms in their own vertical planes, curling up at the tips.
  const rand = mulberry32(hashString(`octopus:${L}`))
  const arms: THREE.BufferGeometry[] = []
  const radial = [0.07, 0.18, 0.3, 0.4, 0.47, 0.5, 0.47]
  const height = [-0.04, -0.15, -0.24, -0.27, -0.25, -0.2, -0.155]
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const reach = (Math.abs(dx) > 0.7 && dx > 0 ? 0.85 : 1) * (0.92 + rand() * 0.16)
    const points = radial.map((r, k): [number, number, number] => [HUB.x + dx * r * L * reach, HUB.y + (height[k] - HUB.y) * L, HUB.z + dz * r * L * reach])
    const tube = taperedTube(points, L * 0.045, L * 0.007, 22, 6)
    const uv = tube.getAttribute('uv')
    const pos = tube.getAttribute('position')
    const nor = tube.getAttribute('normal')
    const arm = new Float32Array(uv.count * 2)
    const colors = new Float32Array(uv.count * 3)
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    for (let v = 0; v < uv.count; v++) {
      const s = uv.getY(v)
      arm[v * 2] = s
      arm[v * 2 + 1] = a
      p.fromBufferAttribute(pos, v)
      n.fromBufferAttribute(nor, v)
      // Rows of pale suckers along the underside.
      const under = n.y < -0.25
      const sucker = under && (s * 18) % 1 < 0.5
      const c = sucker ? 1.25 : skinTone(p, n, L)
      colors.set([c, c * (sucker ? 0.97 : 1), c * (sucker ? 0.95 : 1)], v * 3)
    }
    tube.setAttribute('aArm', new THREE.BufferAttribute(arm, 2))
    tube.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    tube.deleteAttribute('uv')
    arms.push(tube)
  }
  cached = { head: head.build({ groundAO: false }), mantle: mantle.build({ groundAO: false }), arms: mergeGeometries(arms)! }
  arms.forEach((g) => g.dispose())
  bodyCache.set(L, cached)
  return cached
}

/** Per-octopus skin materials: they share programs, but each changes colour on its own. */
function createSkin(L: number, seed: number) {
  const uniforms = {
    uWalk: { value: 0 },
    uEffort: { value: 0.3 },
    uJet: { value: 0 },
    uSeed: { value: seed },
    uLen: { value: L },
  }
  const body = makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), {}, 'octopus-skin')
  const arms = makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    { uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexPars: ARM_PARS, vertexHook: ARM_VERTEX },
    'octopus-arms',
  )
  return {
    uniforms,
    body,
    arms,
    dispose() {
      body.dispose()
      arms.dispose()
    },
  }
}

const scratchColor = new THREE.Color()

/** Curious octopus: crawls on rippling arms, breathes, blushes through colours and jets off when startled. */
export function OctopusVisual({ def, agentRef, seed = 0 }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null>; seed?: number }) {
  const L = def.bodyLength
  const geometry = octopusGeometry(L)
  const skin = useMemo(() => createSkin(L, seed), [L, seed])
  useEffect(() => () => skin.dispose(), [skin])
  const palette = useMemo(() => ({ a: new THREE.Color(def.color), b: new THREE.Color(def.color2), alarm: new THREE.Color(def.color3 ?? '#5a1f1f') }), [def])
  const bodyRef = useRef<THREE.Group>(null)
  const mantleRef = useRef<THREE.Group>(null)
  const motion = useRef({ walk: 0, jet: 0, alarm: 0, color: new THREE.Color(def.color) })

  useFrame(({ clock }, delta) => {
    const agent = agentRef?.current
    const t = clock.elapsedTime + seed
    const m = motion.current
    const speed = agent ? agent.velocity.length() : 0
    const effort = agent ? Math.min(1, speed / Math.max(0.05, def.maxSpeed) + 0.15) : 0.25
    m.walk += delta * (agent ? 2 + speed * 18 : 2.4)
    m.jet = THREE.MathUtils.damp(m.jet, agent && agent.startle > 0 ? 1 : 0, agent && agent.startle > 0 ? 6 : 1.5, delta)
    m.alarm = THREE.MathUtils.damp(m.alarm, agent && agent.startle > 0 ? 1 : 0, 4, delta)
    // Slow mood colours, flushing dark when startled.
    const mood = 0.5 + 0.5 * Math.sin(t * 0.33)
    scratchColor.copy(palette.a).lerp(palette.b, mood * mood * 0.65)
    m.color.lerp(scratchColor, 1 - Math.exp(-delta * 2)).lerp(palette.alarm, m.alarm * 0.12)
    skin.body.color.copy(m.color)
    skin.arms.color.copy(m.color)
    const u = skin.uniforms
    u.uWalk.value = m.walk
    u.uEffort.value = effort
    u.uJet.value = m.jet
    if (bodyRef.current) {
      bodyRef.current.position.y = Math.sin(m.walk * 2) * L * 0.012 * effort + Math.sin(t * 0.9) * L * 0.01
      bodyRef.current.rotation.z = m.jet * 0.3 + Math.sin(t * 0.7) * 0.04
      bodyRef.current.rotation.y = agent ? agent.bend * 0.25 : Math.sin(t * 0.5) * 0.2
    }
    if (mantleRef.current) {
      const breathe = 1 + Math.sin(t * 1.9) * 0.045
      mantleRef.current.scale.set(breathe * (1 - m.jet * 0.15), breathe * (1 - m.jet * 0.2), breathe)
      mantleRef.current.rotation.z = 0.45 - m.jet * 0.35 + Math.sin(t * 0.8) * 0.05
    }
  })

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group ref={bodyRef}>
        {geometry.head.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={p.material === 'satin' ? skin.body : decorMaterials[p.material]} castShadow />
        ))}
        <group ref={mantleRef} position={[-L * 0.12, L * 0.12, 0]} rotation={[0, 0, 0.45]}>
          {geometry.mantle.map((p, i) => (
            <mesh key={i} geometry={p.geometry} material={skin.body} castShadow />
          ))}
        </group>
        <mesh geometry={geometry.arms} material={skin.arms} castShadow />
      </group>
    </group>
  )
}

export function OctopusEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'yaw', sizeScale: instance.sizeScale })
  const [start] = useState<[number, number, number]>(() => [
    randomRange(-INTERIOR_HALF_WIDTH + 0.7, INTERIOR_HALF_WIDTH - 0.7),
    0.5,
    randomRange(-INTERIOR_HALF_DEPTH + 0.5, INTERIOR_HALF_DEPTH - 0.5),
  ])
  const seed = useMemo(() => (hashString(instance.id) % 1000) / 100, [instance.id])
  return (
    <group ref={groupRef} position={start}>
      <OctopusVisual def={def} agentRef={agentRef} seed={seed} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={def.bodyLength * 0.6} iconHeight={def.bodyLength * 0.7} />
    </group>
  )
}
