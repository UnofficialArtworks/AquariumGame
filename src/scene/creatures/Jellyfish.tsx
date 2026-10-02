import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { makeAqua } from '../materials/aquaShader'
import { latheFrom, ribbonGeometry, taperedTube } from '../geometry/shapes'
import { randomRange } from '../../utils/math'
import { hashString, mulberry32 } from '../../utils/rng'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

const JELLY_PARS = /* glsl */ `
  uniform float uContract;
  uniform float uContractLag;
  uniform float uPulsePhase;
  uniform float uBellR;
  uniform float uSeed;
  uniform vec3 uBend;
  uniform float uTwist;
  uniform vec2 uSteer;
`

// The bell squeezes hardest at the rim and grows a little taller; the rim
// edge ripples in scallops. Turning, it squeezes harder on one side, and its
// soft skirt drags after the turn.
const BELL_VERTEX = /* glsl */ `
  {
    float bh = clamp(transformed.y / (uBellR * 0.62), 0.0, 1.0);
    float rimW = 1.0 - bh;
    float rl = length(transformed.xz);
    float side = rl > 0.0001 ? dot(transformed.xz / rl, uSteer) : 0.0;
    transformed.xz *= 1.0 - uContract * (0.06 + 0.24 * rimW * rimW) * (1.0 - side * 0.45);
    transformed.y = transformed.y * (1.0 + uContract * 0.16) - uContract * 0.05 * uBellR * rimW;
    float drag = sin(uBend.z) * rimW * rimW;
    transformed.xz += uBend.xy * drag * 0.16 * uBellR;
    transformed.y += drag * 0.05 * uBellR;
    float ang = rl > 0.0001 ? atan(transformed.z, transformed.x) : 0.0;
    transformed.y += sin(ang * 8.0 + uAquaTime * 2.0 + uSeed) * 0.025 * uBellR * rimW * rimW * (0.5 + uContract);
  }
`

// Translucent in the middle, denser and brighter toward the silhouette, and a
// soft flash of glow with every squeeze.
const BELL_FRAGMENT = /* glsl */ `
  {
    float jf = clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
    float jrim = jf * jf;
    diffuseColor.a = clamp(diffuseColor.a * (0.45 + jrim * 1.3), 0.0, 1.0);
    totalEmissiveRadiance += diffuseColor.rgb * (0.22 + uContract * 0.3 + jrim * 0.55) * uGlowBoost;
  }
`

// Tentacles and oral arms: roots ride the squeezing rim (the squeeze reaches
// further down a moment later) and a ripple from each pulse runs down their
// length. Then each strand bends like something soft: it leaves the rim along
// the bell's axis and curves toward the direction it hangs (uBend: bell-local
// xz direction + angle), the tips trailing furthest. Lengths are kept, so the
// strands swing rather than stretch.
const TENTACLE_VERTEX = /* glsl */ `
  {
    float hang = max(-transformed.y, 0.0);
    float h = hang / uBellR;
    float sq = mix(uContract, uContractLag, smoothstep(0.0, 2.0, h));
    float rl = length(transformed.xz);
    float side = rl > 0.0001 ? dot(transformed.xz / rl, uSteer) : 0.0;
    transformed.xz *= 1.0 - sq * 0.3 * (1.0 - side * 0.45);
    float ripple = sin(uPulsePhase - h * 1.8);
    float sway = 0.05 + 0.035 * ripple;
    transformed.x += (sin(uAquaTime * 1.1 + h * 1.7 + uSeed) * 0.6 + ripple * 0.5) * sway * hang;
    transformed.z += (cos(uAquaTime * 0.9 + h * 1.4 + uSeed * 1.3) * 0.6 + cos(uPulsePhase - h * 1.8) * 0.5) * sway * hang;
    float tw = uTwist * smoothstep(0.0, 3.0, h);
    float tc = cos(tw);
    float ts = sin(tw);
    transformed.xz = vec2(tc * transformed.x - ts * transformed.z, ts * transformed.x + tc * transformed.z);
    // Tangent angle eases from 0 at the root toward uBend.z; integrate the
    // curve with Simpson's rule (3 samples) so the strand keeps its length.
    float bendLen = uBellR * 0.9;
    float th1 = uBend.z * (1.0 - exp(-hang * 0.5 / bendLen));
    float th2 = uBend.z * (1.0 - exp(-hang / bendLen));
    float down = hang * (1.0 + 4.0 * cos(th1) + cos(th2)) / 6.0;
    float across = hang * (4.0 * sin(th1) + sin(th2)) / 6.0;
    transformed.y += hang - down - uContract * 0.05 * uBellR;
    transformed.xz += uBend.xy * across;
  }
`

interface JellyUniforms {
  uContract: THREE.IUniform<number>
  uContractLag: THREE.IUniform<number>
  uPulsePhase: THREE.IUniform<number>
  uBellR: THREE.IUniform<number>
  uSeed: THREE.IUniform<number>
  uBend: THREE.IUniform<THREE.Vector3>
  uTwist: THREE.IUniform<number>
  uSteer: THREE.IUniform<THREE.Vector2>
}

/** Each jelly gets its own materials (its own pulse uniforms); they share shader programs. */
function createJellyKit(def: FishDefinition, seed: number) {
  const uniforms: JellyUniforms = {
    uContract: { value: 0 },
    uContractLag: { value: 0 },
    uPulsePhase: { value: 0 },
    uBellR: { value: def.bodyLength * 0.5 },
    uSeed: { value: seed },
    uBend: { value: new THREE.Vector3(1, 0, 0) },
    uTwist: { value: 0 },
    uSteer: { value: new THREE.Vector2() },
  }
  const shared = uniforms as unknown as Record<string, THREE.IUniform>
  const bell = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.5, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    { uniforms: shared, vertexPars: JELLY_PARS, fragmentPars: JELLY_PARS, vertexHook: BELL_VERTEX, fragmentColorHook: BELL_FRAGMENT },
    'jelly-bell-v3',
  )
  const organs = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color2, roughness: 0.4, transparent: true, opacity: 0.85 }),
    { uniforms: shared, fragmentPars: JELLY_PARS, fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * (0.45 + uContract * 0.45) * uGlowBoost;' },
    'jelly-organs-v3',
  )
  const tentacles = makeAqua(
    new THREE.MeshStandardMaterial({ color: def.color, transparent: true, opacity: 0.6, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    { uniforms: shared, vertexPars: JELLY_PARS, vertexHook: TENTACLE_VERTEX, fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 0.45 * uGlowBoost;' },
    'jelly-tentacles-v3',
  )
  return {
    uniforms,
    bell,
    organs,
    tentacles,
    dispose() {
      bell.dispose()
      organs.dispose()
      tentacles.dispose()
    },
  }
}

function flat(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name)
  return out
}

const geometryCache = new Map<number, { bell: THREE.BufferGeometry; organs: THREE.BufferGeometry; strands: THREE.BufferGeometry }>()

/** Bell, gonad rings and every strand (fringe, long tentacles, oral arms) merged into three meshes. */
function jellyGeometries(R: number) {
  let g = geometryCache.get(R)
  if (g) return g
  const bell = latheFrom(
    [
      [0.0001, R * 0.62],
      [R * 0.45, R * 0.56],
      [R * 0.8, R * 0.38],
      [R * 0.98, R * 0.12],
      [R * 1.02, 0],
      [R * 0.9, -R * 0.03],
    ],
    40,
  )
  const rings: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const ring = new THREE.TorusGeometry(R * 0.16, R * 0.045, 8, 20)
    ring.rotateX(Math.PI / 2)
    ring.translate(Math.cos(a) * R * 0.28, R * 0.35, Math.sin(a) * R * 0.28)
    rings.push(flat(ring))
  }
  const rand = mulberry32(hashString(`jelly:${R}`))
  const strands: THREE.BufferGeometry[] = []
  // A fringe of short fine tentacles all around the rim...
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2
    const x = Math.cos(a) * R * 0.94
    const z = Math.sin(a) * R * 0.94
    const len = R * (0.55 + rand() * 0.5)
    strands.push(flat(taperedTube([[x, 0, z], [x * 1.04, -len * 0.5, z * 1.04], [x, -len, z]], R * 0.012, R * 0.004, 5, 3, false)))
  }
  // ...a few long trailing ones...
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2
    const x = Math.cos(a) * R * 0.92
    const z = Math.sin(a) * R * 0.92
    const len = R * (2.4 + rand() * 1.1)
    strands.push(flat(taperedTube([[x, 0, z], [x * 0.9, -len * 0.5, z * 0.9], [x * 0.8, -len, z * 0.8]], R * 0.018, R * 0.005, 14, 3, false)))
  }
  // ...and four frilly oral arms from the middle.
  for (let i = 0; i < 4; i++) {
    const arm = ribbonGeometry(R * 2.1, R * 0.26, 16, 1.6, 0.06)
    arm.rotateX(Math.PI)
    arm.rotateY((i / 4) * Math.PI * 2 + 0.4)
    arm.translate(Math.cos((i / 4) * Math.PI * 2) * R * 0.12, 0, Math.sin((i / 4) * Math.PI * 2) * R * 0.12)
    strands.push(flat(arm))
  }
  g = { bell, organs: mergeGeometries(rings)!, strands: mergeGeometries(strands)! }
  geometryCache.set(R, g)
  return g
}

/** 0→1 fast squeeze, then a slow 1→0 relax, over one pulse cycle. */
function pulseShape(cycle: number): number {
  const squeeze = 0.32
  return cycle < squeeze
    ? Math.sin((cycle / squeeze) * Math.PI * 0.5)
    : Math.pow(Math.cos(((cycle - squeeze) / (1 - squeeze)) * Math.PI * 0.5), 2)
}

/** Translucent pulsing bell, glowing clover organs, frilly arms and drifting tentacles. */
export function JellyfishVisual({ def, agentRef, seed = 0 }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null>; seed?: number }) {
  const organsRef = useRef<THREE.Group>(null)
  const R = def.bodyLength * 0.5
  const kit = useMemo(() => createJellyKit(def, seed), [def, seed])
  useEffect(() => () => kit.dispose(), [kit])
  const geometries = jellyGeometries(R)
  const lag = useRef(0)

  useFrame(({ clock }, delta) => {
    const u = kit.uniforms
    const agent = agentRef?.current
    let contract: number
    if (agent) {
      contract = agent.pulse
      u.uPulsePhase.value = agent.swimPhase
      const hang = agent.trail
      const across = Math.hypot(hang.x, hang.z)
      if (across > 0.0001) u.uBend.value.set(hang.x / across, hang.z / across, Math.min(Math.atan2(across, -hang.y), 1.7))
      else u.uBend.value.z = 0
      u.uTwist.value = agent.twist
      u.uSteer.value.set(agent.steer.x, agent.steer.z)
    } else {
      // Shop previews: a gentle idle pulse, the tentacles drifting in a slow circle.
      const t = clock.elapsedTime
      const cycles = t * 0.6 + seed
      contract = pulseShape(cycles - Math.floor(cycles))
      u.uPulsePhase.value = cycles * Math.PI * 2
      u.uBend.value.set(Math.cos(t * 0.4), Math.sin(t * 0.4), 0.18 + Math.sin(t * 0.7) * 0.08)
    }
    u.uContract.value = contract
    lag.current = THREE.MathUtils.damp(lag.current, contract, 3.5, delta)
    u.uContractLag.value = lag.current
    organsRef.current?.scale.set(1 - contract * 0.12, 1 + contract * 0.1, 1 - contract * 0.12)
  })

  return (
    <group>
      <mesh geometry={geometries.bell} material={kit.bell} renderOrder={2} />
      <group ref={organsRef}>
        <mesh geometry={geometries.organs} material={kit.organs} />
      </group>
      <mesh geometry={geometries.strands} material={kit.tentacles} renderOrder={2} />
    </group>
  )
}

export function JellyfishEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'none', sizeScale: instance.sizeScale, locomotion: 'jelly' })
  const [start] = useState<[number, number, number]>(() => [
    randomRange(-INTERIOR_HALF_WIDTH + 0.8, INTERIOR_HALF_WIDTH - 0.8),
    randomRange(1.6, 3.2),
    randomRange(-INTERIOR_HALF_DEPTH + 0.6, INTERIOR_HALF_DEPTH - 0.6),
  ])
  const seed = useMemo(() => (hashString(instance.id) % 1000) / 100, [instance.id])
  const R = def.bodyLength * 0.5
  return (
    <group ref={groupRef} position={start}>
      <JellyfishVisual def={def} agentRef={agentRef} seed={seed} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={R * 1.3} iconHeight={R + 0.25} />
    </group>
  )
}
