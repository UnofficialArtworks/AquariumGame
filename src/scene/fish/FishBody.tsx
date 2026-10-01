import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { FishDefinition } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { simClock } from '../../sim/world'
import { makeAqua } from '../materials/aquaShader'
import { createFishMaterials } from './fishMaterials'
import {
  bodyGeometry,
  cachedFin,
  dorsalGeometry,
  paddleGeometry,
  profileFor,
  profileRadius,
  tailGeometry,
} from './fishGeometry'
import { taperedTube } from '../geometry/shapes'

const eyeWhite = makeAqua(new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.25 }), {}, 'aqua-eye-white')
const eyePupil = makeAqua(new THREE.MeshStandardMaterial({ color: '#0b0b10', roughness: 0.08, metalness: 0.2 }), {}, 'aqua-eye-pupil')
const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const whiskerMaterial = makeAqua(new THREE.MeshStandardMaterial({ color: '#d9c7a0', roughness: 0.6 }), {}, 'aqua-whisker')
const spikeMaterial = makeAqua(new THREE.MeshStandardMaterial({ color: '#f4ecd0', roughness: 0.5 }), {}, 'aqua-spike')
const beakMaterial = makeAqua(new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.3 }), {}, 'aqua-beak')
const gillMaterial = makeAqua(new THREE.MeshStandardMaterial({ color: '#4a525c', roughness: 0.7 }), {}, 'aqua-gill')

const sphere = new THREE.SphereGeometry(1, 16, 12)
const cone = new THREE.ConeGeometry(1, 1, 6)
const NO_FEATURES: NonNullable<FishDefinition['features']> = []

interface FishBodyProps {
  def: FishDefinition
  /** Live agent driving animation; omitted for static shop previews. */
  agentRef?: RefObject<FishAgent | null>
  seedKey?: string
  /** 0..1 hunger, used to make starving fish look a little pale. */
  hungerRef?: RefObject<number>
}

/**
 * A fish built from code: smooth lathe body with a shader-painted pattern,
 * species-specific tail/dorsal/pectoral fins, cute eyes, and optional
 * features (whiskers, spines, spikes, beak, gills). The body bends in a
 * travelling wave and the tail whips to match, driven by the fish's brain.
 */
export function FishBody({ def, agentRef, seedKey = def.id, hungerRef }: FishBodyProps) {
  const tailRef = useRef<THREE.Group>(null)
  const pectoralRefs = useRef<Array<THREE.Group | null>>([])
  const spikesRef = useRef<THREE.Group>(null)
  const materials = useMemo(() => createFishMaterials(def, seedKey), [def, seedKey])

  useEffect(
    () => () => {
      materials.body.dispose()
      materials.fin.dispose()
    },
    [materials],
  )

  const hl = def.bodyLength / 2
  const hh = def.bodyHeight / 2
  const width = def.bodyWidth ?? 0.62
  const profile = profileFor(def)
  const features = def.features ?? NO_FEATURES

  const geometries = useMemo(() => {
    const L = def.bodyLength
    const tail = cachedFin(`tail:${def.id}`, () => tailGeometry(def.finStyle, L, hh))
    const flowing = def.finStyle === 'veil'
    const tall = features.includes('longFins')
    const sharky = def.finStyle === 'shark'
    const dorsal = cachedFin(`dorsal:${def.id}`, () =>
      dorsalGeometry(L * (flowing ? 0.55 : sharky ? 0.22 : 0.38), hh * (tall ? 2.6 : flowing ? 1.4 : sharky ? 1.5 : 0.95), sharky ? 0.3 : 0.45, flowing || tall),
    )
    const anal = cachedFin(`anal:${def.id}`, () =>
      dorsalGeometry(L * (flowing ? 0.45 : 0.24), hh * (tall ? 2.2 : flowing ? 1.5 : 0.6), 0.5, flowing || tall),
    )
    const pectoral = cachedFin(`pec:${def.id}`, () =>
      paddleGeometry(L * (features.includes('spines') ? 0.55 : 0.22), hh * (features.includes('spines') ? 1.1 : 0.45)),
    )
    return { tail, dorsal, anal, pectoral }
  }, [def, hh, features])

  const eye = useMemo(() => {
    const t = def.features?.includes('pointyNose') ? 0.84 : 0.8
    const r = profileRadius(profile, t) * hh
    const size = hh * (features.includes('bigEyes') ? 0.34 : 0.26)
    return { x: -hl + t * def.bodyLength, y: r * 0.3, z: r * width * 0.88, size }
  }, [def, hl, hh, width, profile, features])

  const whiskers = useMemo(() => {
    if (!features.includes('whiskers')) return null
    const s = def.bodyLength
    return [1, -1].flatMap((side) => [
      taperedTube([[0, 0, 0], [s * 0.1, -s * 0.04, side * s * 0.06], [s * 0.18, -s * 0.12, side * s * 0.1]], s * 0.012, s * 0.003, 8, 4),
      taperedTube([[0, 0, 0], [s * 0.06, -s * 0.07, side * s * 0.04], [s * 0.1, -s * 0.16, side * s * 0.05]], s * 0.01, s * 0.003, 8, 4),
    ])
  }, [def, features])

  const spikes = useMemo(() => {
    if (!features.includes('spikes')) return []
    const out: Array<{ position: THREE.Vector3; quaternion: THREE.Quaternion }> = []
    for (let i = 0; i < 34; i++) {
      const t = 0.18 + ((i * 0.618) % 1) * 0.66
      const angle = i * 2.399
      const r = profileRadius(profile, t) * hh
      const normal = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle) * width).normalize()
      const position = new THREE.Vector3(-hl + t * def.bodyLength, Math.cos(angle) * r * 0.95, Math.sin(angle) * r * width * 0.95)
      out.push({ position, quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal) })
    }
    return out
  }, [def, features, profile, hh, hl, width])

  useFrame(({ clock }, delta) => {
    const agent = agentRef?.current
    const u = materials.uniforms
    const t = simClock.t
    const phase = agent ? agent.swimPhase : clock.elapsedTime * 6
    const effort = agent ? agent.effort : 0.5
    u.uSwimPhase.value = phase
    u.uSwimAmp.value = def.bodyLength * (0.035 + Math.min(1.5, effort) * 0.045) * (agent?.sleeping ? 0.5 : 1)
    u.uPuff.value = agent ? THREE.MathUtils.damp(u.uPuff.value, agent.puff > 0.05 ? 1 : 0, 6, delta) : 0
    u.uGulp.value = agent ? Math.sin(Math.max(0, agent.eatPulse / 0.3) * Math.PI) : 0
    if (agent) {
      const fx = agent.effects
      u.uRainbow.value = THREE.MathUtils.damp(u.uRainbow.value, fx.rainbow > t ? 1 : 0, 3, delta)
      u.uGolden.value = THREE.MathUtils.damp(u.uGolden.value, fx.golden > t ? 1 : 0, 3, delta)
      u.uGlowFx.value = THREE.MathUtils.damp(u.uGlowFx.value, fx.glow > t ? 1 : 0, 3, delta)
    }
    if (hungerRef) u.uPale.value = THREE.MathUtils.smoothstep(hungerRef.current ?? 0, 0.6, 1)

    // Tail follows the tip of the body wave, then whips a little further.
    if (tailRef.current) {
      const amp = u.uSwimAmp.value
      const p = phase - 3.2
      tailRef.current.position.z = Math.sin(p) * amp
      tailRef.current.rotation.y = ((-3.2 * Math.cos(p) + 2 * Math.sin(p)) * amp) / def.bodyLength * 1.6
    }
    pectoralRefs.current.forEach((g, i) => {
      if (!g) return
      const side = i === 0 ? 1 : -1
      g.rotation.x = side * (0.5 + Math.sin(phase * 0.7 + i) * 0.35)
    })
    if (spikesRef.current) {
      const s = 0.4 + u.uPuff.value * 1.1
      spikesRef.current.scale.setScalar(1 + u.uPuff.value * 0.55)
      spikesRef.current.children.forEach((c) => c.scale.set(hh * 0.07, hh * 0.28 * s, hh * 0.07))
    }
  })

  const finMaterial = materials.fin
  const sharky = def.finStyle === 'shark'

  return (
    // Built nose-toward-local+X; steering orients the parent group so local -Z
    // is the direction of travel (THREE.Matrix4.lookAt), so turn +X to -Z here.
    <group rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={bodyGeometry(def)} material={materials.body} castShadow />

      {/* Eyes: white, pupil, and a tiny highlight for a lively look */}
      {[1, -1].map((side) => (
        <group key={side} position={[eye.x, eye.y, side * eye.z]}>
          <mesh geometry={sphere} material={eyeWhite} scale={eye.size} />
          <mesh geometry={sphere} material={eyePupil} scale={eye.size * 0.62} position={[eye.size * 0.18, 0, side * eye.size * 0.5]} />
          <mesh geometry={sphere} material={eyeShine} scale={eye.size * 0.2} position={[eye.size * 0.38, eye.size * 0.3, side * eye.size * 0.8]} />
        </group>
      ))}

      <group ref={tailRef} position={[-hl + def.bodyLength * 0.01, 0, 0]}>
        <mesh geometry={geometries.tail} material={finMaterial} />
      </group>

      <mesh geometry={geometries.dorsal} material={finMaterial} position={[sharky ? hl * 0.15 : hl * 0.25, hh * 0.78, 0]} />
      {!sharky && (
        <mesh geometry={geometries.anal} material={finMaterial} position={[-hl * 0.15, -hh * 0.62, 0]} rotation={[Math.PI, 0, 0]} />
      )}
      {sharky && (
        <>
          <mesh geometry={geometries.anal} material={finMaterial} position={[-hl * 0.45, -hh * 0.55, 0]} rotation={[Math.PI, 0, 0]} scale={0.6} />
          {[0, 1, 2].map((i) => (
            <mesh key={i} material={gillMaterial} position={[hl * (0.5 - i * 0.07), 0, 0]} scale={[0.006, hh * 0.9, hh * width * 1.02]}>
              <boxGeometry args={[1, 1, 1]} />
            </mesh>
          ))}
        </>
      )}

      {[1, -1].map((side, i) => (
        <group
          key={side}
          ref={(g) => {
            pectoralRefs.current[i] = g
          }}
          position={[hl * 0.35, -hh * 0.3, side * hh * width * 0.85]}
          rotation={[side * 0.6, side * -0.5, sharky ? -0.5 : -0.25]}
        >
          <mesh geometry={geometries.pectoral} material={finMaterial} />
        </group>
      ))}

      {whiskers?.map((g, i) => (
        <mesh key={i} geometry={g} material={whiskerMaterial} position={[hl * 0.97, -hh * 0.2, 0]} />
      ))}

      {features.includes('spines') &&
        Array.from({ length: 9 }, (_, i) => (
          <mesh
            key={i}
            geometry={cone}
            material={finMaterial}
            position={[hl * (0.45 - i * 0.12), hh * 0.95 + hh * 0.8, 0]}
            rotation={[0, 0, 0.35 + i * 0.03]}
            scale={[hh * 0.05, hh * (1.8 - Math.abs(i - 3) * 0.16), hh * 0.05]}
          />
        ))}

      {spikes.length > 0 && (
        <group ref={spikesRef}>
          {spikes.map((s, i) => (
            <mesh key={i} geometry={cone} material={spikeMaterial} position={s.position} quaternion={s.quaternion} />
          ))}
        </group>
      )}

      {features.includes('beak') && (
        <mesh geometry={sphere} material={beakMaterial} position={[hl * 0.93, -hh * 0.05, 0]} scale={[hh * 0.35, hh * 0.3, hh * 0.3 * width]} />
      )}
    </group>
  )
}
