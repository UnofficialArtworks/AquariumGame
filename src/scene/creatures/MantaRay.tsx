import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { makeAqua } from '../materials/aquaShader'
import { noise3 } from '../../utils/noise'
import { shade } from '../../utils/color'
import { randomRange } from '../../utils/math'
import { hashString } from '../../utils/rng'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

const RAY_PARS = /* glsl */ `
  uniform float uFlap;
  uniform float uAmp;
  uniform float uSpan;
  uniform float uTail;
`

// Wings beat in a wave that runs from the leading edge back to the trailing
// edge, strongest at the tips; the body barely moves and the tail whips along.
const RAY_VERTEX = /* glsl */ `
  {
    float w = clamp(abs(transformed.z) / (uSpan * 0.5), 0.0, 1.0);
    float chord = transformed.x / uSpan;
    float wing = pow(w, 1.35);
    transformed.y += uAmp * wing * sin(uFlap + chord * 2.6 - w * 0.5);
    transformed.x += uAmp * 0.18 * wing * cos(uFlap + chord * 2.6);
    float behind = clamp((-chord - 0.14) / 0.5, 0.0, 1.0);
    transformed.z += sin(uTail - behind * 5.0) * 0.045 * uSpan * behind;
    transformed.y += sin(uFlap - 1.5 - behind * 3.0) * 0.02 * uSpan * behind;
  }
`

/** Leading and trailing edge (x) of the wing at a fraction of the half-span. */
function wingEdges(w: number, S: number): [number, number] {
  return [S * (0.17 - 0.27 * Math.pow(w, 1.3)), S * (-0.15 + 0.05 * Math.pow(w, 0.7))]
}

/** Both skins of the diamond-shaped wing, open at no edge. */
function wingGeometry(S: number): THREE.BufferGeometry {
  const nu = 28
  const nv = 12
  const positions: number[] = []
  const indices: number[] = []
  for (const top of [true, false]) {
    const base = positions.length / 3
    for (let i = 0; i <= nu; i++) {
      const z = (i / nu - 0.5) * S
      const w = Math.abs(z) / (S * 0.5)
      const [xl, xt] = wingEdges(w, S)
      for (let j = 0; j <= nv; j++) {
        const v = j / nv
        const x = THREE.MathUtils.lerp(xl, xt, v)
        const bulge = Math.pow(Math.max(0, 1 - w * w), 1.6) * Math.pow(Math.sin(Math.PI * v), 0.6)
        positions.push(x, top ? S * 0.05 * bulge : -S * 0.022 * bulge, z)
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = base + i * (nv + 1) + j
        const b = a + nv + 1
        if (top) indices.push(a, a + 1, b, b, a + 1, b + 1)
        else indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

const geometryCache = new Map<string, ReturnType<MeshBuilder['build']>>()

function rayGeometry(def: FishDefinition) {
  const key = `${def.bodyLength}:${def.color}:${def.color2}`
  let parts = geometryCache.get(key)
  if (parts) return parts
  const S = def.bodyLength
  const back = new THREE.Color(def.color)
  const shoulder = new THREE.Color(shade(def.color, 0.45))
  const belly = new THREE.Color(def.color2)
  const spot = new THREE.Color(shade(def.color, -0.1))
  const b = new MeshBuilder()
  b.add('satin', wingGeometry(S), {
    color: def.color,
    colorFn: (p, n, c) => {
      const w = Math.abs(p.z) / (S * 0.5)
      const [xl, xt] = wingEdges(w, S)
      const v = xl === xt ? 0.5 : (xl - p.x) / (xl - xt)
      if (n.y > 0) {
        // Dark back with the pale chevron "shoulder" patches mantas are known for.
        const patch = 1 - THREE.MathUtils.smoothstep(Math.hypot((w - 0.3) * 1.3, v - 0.32), 0.06, 0.2)
        c.copy(back).lerp(shoulder, patch * 0.75).multiplyScalar(0.92 + noise3(p.x * 9, 0, p.z * 9) * 0.08)
      } else {
        // Pale belly, dark-edged wings and a few spots between the gills.
        const edge = Math.max(THREE.MathUtils.smoothstep(w, 0.72, 0.98), THREE.MathUtils.smoothstep(Math.abs(v - 0.5), 0.36, 0.5))
        const spots = w < 0.35 && noise3(p.x * 30, 1.7, p.z * 30) > 0.42 ? 1 : 0
        c.copy(belly).lerp(back, edge * 0.8).lerp(spot, spots * 0.7)
      }
    },
  })
  // Cephalic fins: two curled scoops either side of the mouth.
  for (const side of [1, -1]) {
    b.add('satin', taperedTube([[S * 0.14, S * 0.004, side * S * 0.075], [S * 0.21, 0, side * S * 0.082], [S * 0.26, -S * 0.016, side * S * 0.068], [S * 0.27, -S * 0.03, side * S * 0.046]], S * 0.017, S * 0.007, 12, 6), {
      color: def.color,
      scale: [1, 1, 1],
    })
    b.add('satin', new THREE.SphereGeometry(S * 0.012, 10, 8), { color: '#0e1015', position: [S * 0.165, S * 0.012, side * S * 0.088] })
    // Gill slits on the underside.
    for (let k = 0; k < 5; k++) {
      b.add('satin', new THREE.BoxGeometry(S * 0.004, S * 0.003, S * 0.03), {
        color: shade(def.color2, -0.45),
        position: [S * (0.08 - k * 0.022), -S * 0.018, side * S * (0.06 + k * 0.004)],
        rotation: [0, side * 0.25, 0],
      })
    }
  }
  b.add('satin', new THREE.BoxGeometry(S * 0.012, S * 0.006, S * 0.09), { color: '#1a1c22', position: [S * 0.168, -S * 0.006, 0] })
  b.add('satin', taperedTube([[-S * 0.13, 0, 0], [-S * 0.28, S * 0.004, 0], [-S * 0.45, S * 0.008, 0], [-S * 0.6, S * 0.008, 0]], S * 0.012, S * 0.002, 16, 5), { color: def.color })
  parts = b.build({ groundAO: false })
  geometryCache.set(key, parts)
  return parts
}

function createRayMaterial(S: number) {
  const uniforms = {
    uFlap: { value: Math.random() * 6 },
    uAmp: { value: S * 0.06 },
    uSpan: { value: S },
    uTail: { value: 0 },
  }
  const material = makeAqua(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide }),
    { uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexPars: RAY_PARS, vertexHook: RAY_VERTEX },
    'manta-ray',
  )
  return { uniforms, material }
}

/** Manta ray: slow wingbeats that build to a hurry, long glides in between. */
export function MantaRayVisual({ def, agentRef, seed = 0 }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null>; seed?: number }) {
  const S = def.bodyLength
  const parts = rayGeometry(def)
  const kit = useMemo(() => createRayMaterial(S), [S])
  useEffect(() => () => kit.material.dispose(), [kit])
  const bodyRef = useRef<THREE.Group>(null)
  const beat = useRef({ amp: S * 0.06 })

  useFrame(({ clock }, delta) => {
    const agent = agentRef?.current
    const u = kit.uniforms
    const effort = agent ? Math.min(1.2, agent.effort) : 0.45
    u.uFlap.value += delta * (1.5 + effort * 2.4)
    u.uTail.value += delta * 2.2
    beat.current.amp = THREE.MathUtils.damp(beat.current.amp, S * (0.035 + 0.09 * Math.min(1, effort)), 2, delta)
    u.uAmp.value = beat.current.amp
    if (bodyRef.current) {
      // The body lifts a touch on each downstroke and rocks gently.
      bodyRef.current.position.y = -Math.sin(u.uFlap.value) * beat.current.amp * 0.18
      bodyRef.current.rotation.z = Math.cos(u.uFlap.value) * 0.03 + Math.sin(clock.elapsedTime * 0.4 + seed) * 0.02
    }
  })

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group ref={bodyRef}>
        {parts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={kit.material} castShadow />
        ))}
      </group>
    </group>
  )
}

export function MantaRayEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'full', sizeScale: instance.sizeScale })
  const [start] = useState<[number, number, number]>(() => [
    randomRange(-INTERIOR_HALF_WIDTH + 1, INTERIOR_HALF_WIDTH - 1),
    randomRange(1.4, 2.6),
    randomRange(-INTERIOR_HALF_DEPTH + 0.6, INTERIOR_HALF_DEPTH - 0.6),
  ])
  const seed = useMemo(() => (hashString(instance.id) % 1000) / 100, [instance.id])
  return (
    <group ref={groupRef} position={start}>
      <MantaRayVisual def={def} agentRef={agentRef} seed={seed} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={def.bodyLength * 0.45} iconHeight={def.bodyLength * 0.2 + 0.15} />
    </group>
  )
}
