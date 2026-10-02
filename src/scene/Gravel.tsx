import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGameStore } from '../state/useGameStore'
import { decorMaterials } from './materials/materials'
import { makeAqua } from './materials/aquaShader'
import { noiseRock } from './geometry/shapes'
import { getSubstrateDef, type SubstrateDefinition } from './substrates'
import { floorHeightAt, HALF_DEPTH, HALF_WIDTH, TANK_BOTTOM_Y, TANK_DEPTH, TANK_WIDTH } from './TankBounds'
import { noise2 } from '../utils/noise'
import { mulberry32 } from '../utils/rng'

const PEBBLE_COUNT = 1500
const EDGE_INSET = 0.02

const pebbleMaterial = makeAqua(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }), {}, 'aqua-pebble')
const glowPebbleMaterial = makeAqua(
  new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 }),
  { glowFromVertexColor: 0.45 },
  'aqua-pebble-glow',
)

function buildTerrain(def: SubstrateDefinition): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(TANK_WIDTH - EDGE_INSET * 2, TANK_DEPTH - EDGE_INSET * 2, 110, 55)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const base = new THREE.Color(def.base)
  const alt = new THREE.Color(def.baseAlt)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const ripple = Math.sin(x * 7 + noise2(x * 0.8, z * 0.8) * 3) * 0.006
    pos.setY(i, floorHeightAt(x, z) + ripple)
    const n = noise2(x * 2.3, z * 2.3) * 0.5 + 0.5
    c.copy(base).lerp(alt, n * 0.8)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Vertical "cut" faces of the gravel bed, visible through the glass, with darker strata. */
function buildSkirt(def: SubstrateDefinition): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const base = new THREE.Color(def.base).multiplyScalar(0.8)
  const alt = new THREE.Color(def.baseAlt).multiplyScalar(0.55)
  const c = new THREE.Color()
  const segments = 60
  const rows = 6
  const hw = HALF_WIDTH - EDGE_INSET
  const hd = HALF_DEPTH - EDGE_INSET
  const edges: Array<[[number, number], [number, number]]> = [
    [[-hw, hd], [hw, hd]],
    [[hw, hd], [hw, -hd]],
    [[hw, -hd], [-hw, -hd]],
    [[-hw, -hd], [-hw, hd]],
  ]
  for (const [[x0, z0], [x1, z1]] of edges) {
    const start = positions.length / 3
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const x = x0 + (x1 - x0) * t
      const z = z0 + (z1 - z0) * t
      const top = floorHeightAt(x, z)
      for (let r = 0; r <= rows; r++) {
        const v = r / rows
        const y = TANK_BOTTOM_Y + (top - TANK_BOTTOM_Y) * v
        positions.push(x, y, z)
        const strata = noise2(x * 3 + y * 0.5, y * 18) * 0.5 + 0.5
        c.copy(alt).lerp(base, strata * 0.7 + v * 0.3)
        colors.push(c.r, c.g, c.b)
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let r = 0; r < rows; r++) {
        const a = start + i * (rows + 1) + r
        const b = a + rows + 1
        indices.push(a, b, a + 1, b, b + 1, a + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

const pebbleGeometry = noiseRock(1, 4.2, 0.22, 1)

/** Sloped sand bed, cut-away strata visible through the glass, and ~1.5k instanced pebbles. */
/** The tank floor; the Koi Pond passes its own pebbles instead of the player's choice. */
export function Gravel({ substrateId: override }: { substrateId?: string } = {}) {
  const chosen = useGameStore((s) => s.substrateId)
  const substrateId = override ?? chosen
  const def = getSubstrateDef(substrateId)
  const terrain = useMemo(() => buildTerrain(def), [def])
  const skirt = useMemo(() => buildSkirt(def), [def])
  const pebblesRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = pebblesRef.current
    if (!mesh) return
    const rand = mulberry32(90210)
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    for (let i = 0; i < PEBBLE_COUNT; i++) {
      const x = (rand() * 2 - 1) * (HALF_WIDTH - 0.08)
      const z = (rand() * 2 - 1) * (HALF_DEPTH - 0.08)
      const s = (0.022 + Math.pow(rand(), 2.2) * 0.05) * def.pebbleScale
      dummy.position.set(x, floorHeightAt(x, z) - s * 0.25, z)
      dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
      dummy.scale.set(s * (0.8 + rand() * 0.5), s * (0.55 + rand() * 0.3), s * (0.8 + rand() * 0.5))
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.set(def.pebbleColors[Math.floor(rand() * def.pebbleColors.length)])
      color.multiplyScalar(0.8 + rand() * 0.35)
      mesh.setColorAt(i, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [def])

  useLayoutEffect(
    () => () => {
      terrain.dispose()
      skirt.dispose()
    },
    [terrain, skirt],
  )

  return (
    <group>
      <mesh geometry={terrain} material={decorMaterials.matte} receiveShadow />
      <mesh geometry={skirt} material={decorMaterials.matte} />
      <instancedMesh
        // Remount when the substrate changes so instance colors are rebuilt cleanly.
        key={def.id}
        ref={pebblesRef}
        args={[pebbleGeometry, def.glow ? glowPebbleMaterial : pebbleMaterial, PEBBLE_COUNT]}
        castShadow={false}
        receiveShadow
      />
    </group>
  )
}
