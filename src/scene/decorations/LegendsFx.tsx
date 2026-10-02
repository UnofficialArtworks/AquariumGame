import { useEffect, useMemo, useRef, type ComponentType } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { DecorationKind } from './decorationDefinitions'
import { GlintFx, type FxProps } from './DecorationFx'
import { getHalo } from './GadgetFx'
import { useIsPreview } from './decorationHooks'
import { GEODE_POSE, GEODE_RADIUS } from './builders/legends'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { decorMaterials } from '../materials/materials'
import { atmosphere } from '../Atmosphere'

/**
 * A soft additive glow that breathes slowly and blooms after dark: the
 * shimmer in the gate, the cave's crystal light, the geode's heart.
 */
function Halo({ color, position, size, day, night, speed = 1.2 }: { color: string; position: [number, number, number]; size: number; day: number; night: number; speed?: number }) {
  const ref = useRef<THREE.Sprite>(null)
  const preview = useIsPreview()
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: getHalo(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: day }),
    [color, day],
  )
  useEffect(() => () => material.dispose(), [material])
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(({ clock }) => {
    const sprite = ref.current
    if (!sprite) return
    const breathe = 0.5 + 0.5 * Math.sin(clock.elapsedTime * speed + phase)
    material.opacity = THREE.MathUtils.lerp(day, night, atmosphere.night) * (0.75 + breathe * 0.25)
    sprite.scale.setScalar(size * (0.94 + breathe * 0.08))
  })
  if (preview) return null
  return <sprite ref={ref} material={material} position={position} scale={size} renderOrder={3} />
}

function CityGateFx({ def }: FxProps) {
  return (
    <>
      <Halo color={def.accentColor} position={[0, 0.6, 0]} size={0.95} day={0.16} night={0.5} speed={0.9} />
      <GlintFx height={1.0} spread={0.55} color={def.accentColor} />
    </>
  )
}

function GlowCaveFx({ def }: FxProps) {
  return (
    <>
      <Halo color={def.accentColor} position={[0, 0.28, 0]} size={0.9} day={0.14} night={0.55} />
      <Halo color={def.accentColor} position={[0.1, 0.7, 0.1]} size={0.45} day={0.06} night={0.3} speed={1.7} />
      <GlintFx height={0.6} spread={0.6} color={def.accentColor} />
    </>
  )
}

/** The palace orb and the sparkles circling it, built once and shared. */
let orbParts: ReturnType<MeshBuilder['build']> | null = null
let ringParts: ReturnType<MeshBuilder['build']> | null = null
function atlantisParts(gold: string) {
  if (!orbParts) {
    const orb = new MeshBuilder()
    orb.add('lamp', new THREE.SphereGeometry(0.075, 24, 16), { color: '#fff6d6' })
    orb.add('lamp', new THREE.TorusGeometry(0.1, 0.008, 6, 32), { color: gold, rotation: [Math.PI / 2.4, 0, 0] })
    orbParts = orb.build({ groundAO: false })
    const ring = new MeshBuilder()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      ring.add('lamp', new THREE.OctahedronGeometry(0.018, 0), { color: gold, position: [Math.cos(a) * 0.2, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.2] })
    }
    ringParts = ring.build({ groundAO: false })
  }
  return { orb: orbParts, ring: ringParts! }
}

function AtlantisFx({ def }: FxProps) {
  const orbRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Group>(null)
  const parts = atlantisParts(def.accentColor)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (orbRef.current) {
      orbRef.current.position.y = 1.4 + Math.sin(t * 1.1) * 0.035
      orbRef.current.rotation.y = t * 0.6
    }
    if (ringRef.current) {
      ringRef.current.rotation.y = -t * 0.45
      ringRef.current.rotation.z = Math.sin(t * 0.3) * 0.15
    }
  })
  return (
    <>
      <group ref={orbRef} position={[0, 1.4, 0]}>
        {parts.orb.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
        ))}
        <group ref={ringRef}>
          {parts.ring.map((p, i) => (
            <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} />
          ))}
        </group>
      </group>
      <Halo color={def.accentColor} position={[0, 1.4, 0]} size={0.6} day={0.25} night={0.6} speed={1.1} />
      <GlintFx height={1.5} spread={0.9} color={def.accentColor} />
    </>
  )
}

/** Where the geode's opening is, after its tilt. */
const GEODE_HEART = new THREE.Vector3(0, 0, GEODE_RADIUS * 0.15).applyMatrix4(GEODE_POSE).toArray() as [number, number, number]

function GeodeFx({ def }: FxProps) {
  return (
    <>
      <Halo color={def.accentColor} position={GEODE_HEART} size={0.7} day={0.12} night={0.5} speed={0.8} />
      <GlintFx height={0.5} spread={0.4} color={def.accentColor} />
    </>
  )
}

export const LEGENDS_FX: Partial<Record<DecorationKind, ComponentType<FxProps>>> = {
  citygate: CityGateFx,
  glowcave: GlowCaveFx,
  atlantis: AtlantisFx,
  geode: GeodeFx,
}
