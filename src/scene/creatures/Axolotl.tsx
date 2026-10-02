import { useMemo, useRef, useState, type RefObject } from 'react'
import { hatchStart } from '../../sim/hatching'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FishDefinition, FishInstance } from '../../state/types'
import type { FishAgent } from '../../sim/world'
import { useFishBrain } from '../fish/useFishBrain'
import { CreatureOverlay } from '../fish/FishEntity'
import { MeshBuilder } from '../geometry/MeshBuilder'
import { latheFrom, taperedTube } from '../geometry/shapes'
import { decorMaterials } from '../materials/materials'
import { makeAqua } from '../materials/aquaShader'
import { shade } from '../../utils/color'
import { randomRange } from '../../utils/math'
import { INTERIOR_HALF_DEPTH, INTERIOR_HALF_WIDTH } from '../TankBounds'

function buildBody(def: FishDefinition) {
  const L = def.bodyLength
  const skin = def.color
  const b = new MeshBuilder()
  // Body along +X (head) with a soft round profile.
  const body = latheFrom(
    [
      [0, -L * 0.34],
      [L * 0.05, -L * 0.3],
      [L * 0.085, -L * 0.18],
      [L * 0.1, -L * 0.02],
      [L * 0.095, L * 0.1],
      [L * 0.07, L * 0.16],
      [0, L * 0.18],
    ],
    20,
  )
  body.rotateZ(-Math.PI / 2)
  b.add('satin', body, { color: skin, colorFn: (_p, n, c) => c.set(skin).lerp(new THREE.Color('#ffe3ea'), Math.max(0, -n.y) * 0.6) })
  // Big friendly head
  b.add('satin', new THREE.SphereGeometry(L * 0.14, 20, 14), { color: skin, position: [L * 0.26, L * 0.01, 0], scale: [0.9, 0.7, 1.05] })
  // Eyes
  for (const side of [1, -1]) {
    b.add('glossy', new THREE.SphereGeometry(L * 0.022, 10, 8), { color: '#1a1014', position: [L * 0.34, L * 0.05, side * L * 0.1] })
    b.add('glossy', new THREE.SphereGeometry(L * 0.007, 6, 6), { color: '#ffffff', position: [L * 0.35, L * 0.058, side * L * 0.117] })
  }
  // The famous smile
  b.add('satin', new THREE.TorusGeometry(L * 0.07, L * 0.006, 6, 20, Math.PI * 0.8), {
    color: shade(skin, -0.35),
    position: [L * 0.36, -L * 0.02, 0],
    rotation: [0, Math.PI / 2, Math.PI + Math.PI * 0.1],
    scale: [1, 0.55, 1],
  })
  return b.build({ groundAO: false })
}

/** One feathery gill (stalk + six plumes) baked into a single mesh. */
function buildGill(def: FishDefinition, index: number): THREE.BufferGeometry {
  return mergeGeometries(buildGillParts(def, index))!
}

function buildGillParts(def: FishDefinition, index: number): THREE.BufferGeometry[] {
  const L = def.bodyLength
  const up = (index - 1) * 0.5
  const pts: Array<[number, number, number]> = [
    [0, 0, 0],
    [-L * 0.04, L * 0.05 + up * L * 0.04, L * 0.05],
    [-L * 0.1, L * 0.1 + up * L * 0.08, L * 0.08],
  ]
  const stalk = taperedTube(pts, L * 0.014, L * 0.006, 10, 5)
  const feathers: THREE.BufferGeometry[] = [stalk]
  for (let i = 0; i < 6; i++) {
    const t = 0.25 + i * 0.13
    const x = -L * 0.1 * t
    const y = (L * 0.1 + up * L * 0.08) * t
    const z = L * 0.08 * t
    const f = new THREE.ConeGeometry(L * 0.012, L * 0.06, 4)
    f.translate(0, L * 0.03, 0)
    f.rotateX(Math.PI / 2 + 0.4)
    f.translate(x, y, z)
    feathers.push(f)
  }
  return feathers
}

const gillMaterialCache = new Map<string, THREE.MeshStandardMaterial>()
function gillMaterial(color: string) {
  let m = gillMaterialCache.get(color)
  if (!m) {
    m = makeAqua(new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), { fragmentColorHook: 'totalEmissiveRadiance += diffuseColor.rgb * 0.15 * uGlowBoost;' }, 'axolotl-gill')
    gillMaterialCache.set(color, m)
  }
  return m
}

/** Smiling axolotl model with waving gills and gently paddling legs. */
export function AxolotlVisual({ def, agentRef }: { def: FishDefinition; agentRef?: RefObject<FishAgent | null> }) {
  const L = def.bodyLength
  const body = useMemo(() => buildBody(def), [def])
  const gills = useMemo(() => [0, 1, 2].map((i) => buildGill(def, i)), [def])
  const legGeometry = useMemo(() => taperedTube([[0, 0, 0], [0, -L * 0.05, L * 0.05], [L * 0.02, -L * 0.09, L * 0.07]], L * 0.025, L * 0.014, 8, 6), [L])
  const tailGeometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, L * 0.07)
    shape.quadraticCurveTo(-L * 0.25, L * 0.1, -L * 0.42, 0)
    shape.quadraticCurveTo(-L * 0.25, -L * 0.06, 0, -L * 0.05)
    return new THREE.ShapeGeometry(shape, 10)
  }, [L])
  const skinMaterial = useMemo(
    () => makeAqua(new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), {}, 'axolotl-tail'),
    [def.color],
  )
  const legMaterial = useMemo(() => makeAqua(new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5 }), {}, 'axolotl-leg'), [def.color])
  const legRefs = useRef<Array<THREE.Group | null>>([])
  const gillRefs = useRef<Array<THREE.Group | null>>([])
  const tailRef = useRef<THREE.Group>(null)

  const bodyRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const agent = agentRef?.current
    const t = clock.elapsedTime
    const walk = agent ? agent.swimPhase : t * 4
    const effort = agent ? Math.min(1, agent.effort) : 0.4
    // Diagonal legs step together, like a real salamander walk.
    legRefs.current.forEach((g, i) => {
      if (!g) return
      const phase = walk * 0.8 + (i % 2 === 0 ? 0 : Math.PI) + (i < 2 ? 0 : Math.PI)
      g.rotation.y = Math.sin(phase) * 0.6 * effort
      g.rotation.x = Math.max(0, Math.cos(phase)) * 0.25 * effort
    })
    // The whole body sways side to side with each step, the tail following.
    if (bodyRef.current) {
      bodyRef.current.rotation.y = Math.sin(walk * 0.8) * 0.12 * effort + (agent ? agent.bend * 0.15 : 0)
      bodyRef.current.position.y = Math.abs(Math.sin(walk * 0.8)) * L * 0.015 * effort
    }
    // Feathery gills ripple and flare as it breathes.
    gillRefs.current.forEach((g, i) => {
      if (!g) return
      g.rotation.x = Math.sin(t * 2 + i) * 0.15 + Math.sin(t * 5.5 + i * 0.7) * 0.05
      g.scale.y = 1 + Math.sin(t * 1.6 + i * 0.4) * 0.08
    })
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(walk * 0.8 - 1.2) * (0.25 + effort * 0.35)
  })

  const legSpots: Array<[number, number, number, number]> = [
    [L * 0.12, -L * 0.04, L * 0.07, 1],
    [L * 0.12, -L * 0.04, -L * 0.07, -1],
    [-L * 0.14, -L * 0.04, L * 0.07, 1],
    [-L * 0.14, -L * 0.04, -L * 0.07, -1],
  ]

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      <group ref={bodyRef}>
        {body.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={decorMaterials[p.material]} castShadow />
        ))}
        <group ref={tailRef} position={[-L * 0.3, L * 0.01, 0]}>
          <mesh geometry={tailGeometry} material={skinMaterial} />
        </group>
        {legSpots.map(([x, y, z, side], i) => (
          <group
            key={i}
            ref={(g) => {
              legRefs.current[i] = g
            }}
            position={[x, y, z]}
            scale={[1, 1, side]}
          >
            <mesh geometry={legGeometry} material={legMaterial} />
          </group>
        ))}
        {[1, -1].map((side) =>
          gills.map((gill, gi) => (
            <group
              key={`${side}-${gi}`}
              ref={(g) => {
                gillRefs.current[gi + (side > 0 ? 0 : 3)] = g
              }}
              position={[L * 0.2, L * 0.03 + (gi - 1) * L * 0.035, side * L * 0.1]}
              scale={[1, 1, side]}
            >
              <mesh geometry={gill} material={gillMaterial(def.color2)} />
            </group>
          )),
        )}
      </group>
    </group>
  )
}

/** Axolotl game entity; simulation and overlays stay outside its reusable visual. */
export function AxolotlEntity({ instance, def }: { instance: FishInstance; def: FishDefinition }) {
  const { groupRef, agentRef } = useFishBrain(instance.id, def, { orientation: 'yaw', sizeScale: instance.sizeScale })
  // A fresh hatchling starts inside its egg.
  const [start] = useState<[number, number, number]>(() => hatchStart(instance) ?? [
    randomRange(-INTERIOR_HALF_WIDTH + 0.6, INTERIOR_HALF_WIDTH - 0.6),
    0.6,
    randomRange(-INTERIOR_HALF_DEPTH + 0.5, INTERIOR_HALF_DEPTH - 0.5),
  ])
  return (
    <group ref={groupRef} position={start}>
      <AxolotlVisual def={def} agentRef={agentRef} />
      <CreatureOverlay fishId={instance.id} def={def} agentRef={agentRef} radius={def.bodyLength * 0.5} iconHeight={0.3} />
    </group>
  )
}
