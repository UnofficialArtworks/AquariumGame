import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { FinStyle, FishDefinition } from '../../state/types'

/**
 * Body geometry for a fish: a lathe-revolved tapered profile, baked so the
 * nose points at local +X, back is +Y, and sides are ±Z (squashed by the
 * species' width). Cached per species since every fish of a kind shares it.
 */

const PROFILE: Array<[number, number]> = [
  // t (0 = tail end, 1 = nose), radius fraction of half-height
  [0, 0.16],
  [0.06, 0.2],
  [0.18, 0.42],
  [0.32, 0.72],
  [0.46, 0.93],
  [0.58, 1.0],
  [0.7, 0.95],
  [0.8, 0.8],
  [0.88, 0.6],
  [0.94, 0.38],
  [0.98, 0.18],
  [1, 0],
]

const SHARK_PROFILE: Array<[number, number]> = [
  [0, 0.14],
  [0.08, 0.2],
  [0.25, 0.5],
  [0.45, 0.88],
  [0.58, 1.0],
  [0.7, 0.92],
  [0.8, 0.72],
  [0.88, 0.48],
  [0.94, 0.28],
  [0.985, 0.1],
  [1, 0],
]

export function profileFor(def: FishDefinition): Array<[number, number]> {
  return def.features?.includes('pointyNose') ? SHARK_PROFILE : PROFILE
}

/** Body radius (fraction of half-height) at t, interpolated from the profile. */
export function profileRadius(profile: Array<[number, number]>, t: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [t1, r1] = profile[i]
    const [t0, r0] = profile[i - 1]
    if (t <= t1) return r0 + ((t - t0) / (t1 - t0)) * (r1 - r0)
  }
  return 0
}

const bodyCache = new Map<string, THREE.BufferGeometry>()

export function bodyGeometry(def: FishDefinition): THREE.BufferGeometry {
  const cached = bodyCache.get(def.id)
  if (cached) return cached
  const hl = def.bodyLength / 2
  const hh = def.bodyHeight / 2
  const width = def.bodyWidth ?? 0.62
  // Denser sampling of the profile for a smooth silhouette.
  const profile = profileFor(def)
  const points: THREE.Vector2[] = []
  const samples = 28
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const eased = 0.5 - Math.cos(t * Math.PI) / 2
    points.push(new THREE.Vector2(profileRadius(profile, eased) * hh, -hl + eased * hl * 2))
  }
  const lathe = new THREE.LatheGeometry(points, 22)
  lathe.rotateZ(-Math.PI / 2)
  lathe.scale(1, 1, width)
  // Weld the lathe seam and the nose/tail poles so normals come out smooth everywhere.
  lathe.deleteAttribute('uv')
  lathe.deleteAttribute('normal')
  const geometry = mergeVertices(lathe, 1e-5)
  lathe.dispose()
  // Slightly flatter belly, rounder back — reads more "fish" than a torpedo.
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < 0) pos.setY(i, y * 0.88)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  bodyCache.set(def.id, geometry)
  return geometry
}

// --- fins -------------------------------------------------------------------

function shapeGeometry(shape: THREE.Shape, segments = 10): THREE.BufferGeometry {
  const geometry = new THREE.ShapeGeometry(shape, segments)
  geometry.computeVertexNormals()
  return geometry
}

/** Tail fin in the XY plane, root at the origin, extending toward -X. */
export function tailGeometry(style: FinStyle, length: number, halfHeight: number): THREE.BufferGeometry {
  const L = length
  const h = halfHeight
  const s = new THREE.Shape()
  switch (style) {
    case 'forked':
      s.moveTo(0, h * 0.22)
      s.quadraticCurveTo(-L * 0.2, h * 0.5, -L * 0.42, h * 0.95)
      s.quadraticCurveTo(-L * 0.3, h * 0.35, -L * 0.2, 0)
      s.quadraticCurveTo(-L * 0.3, -h * 0.35, -L * 0.42, -h * 0.95)
      s.quadraticCurveTo(-L * 0.2, -h * 0.5, 0, -h * 0.22)
      break
    case 'fan':
      s.moveTo(0, h * 0.25)
      s.bezierCurveTo(-L * 0.2, h * 0.8, -L * 0.45, h * 1.25, -L * 0.62, h * 0.9)
      s.bezierCurveTo(-L * 0.52, h * 0.3, -L * 0.52, -h * 0.3, -L * 0.62, -h * 0.9)
      s.bezierCurveTo(-L * 0.45, -h * 1.25, -L * 0.2, -h * 0.8, 0, -h * 0.25)
      break
    case 'veil':
      s.moveTo(0, h * 0.3)
      s.bezierCurveTo(-L * 0.3, h * 1.4, -L * 0.8, h * 1.8, -L * 1.0, h * 0.9)
      s.bezierCurveTo(-L * 1.08, h * 0.4, -L * 0.95, -h * 0.2, -L * 1.1, -h * 0.8)
      s.bezierCurveTo(-L * 0.85, -h * 1.9, -L * 0.3, -h * 1.5, 0, -h * 0.3)
      break
    case 'sword':
      s.moveTo(0, h * 0.25)
      s.quadraticCurveTo(-L * 0.25, h * 0.9, -L * 0.38, h * 0.55)
      s.quadraticCurveTo(-L * 0.36, 0, -L * 0.3, -h * 0.25)
      s.lineTo(-L * 0.85, -h * 0.55)
      s.lineTo(-L * 0.82, -h * 0.72)
      s.quadraticCurveTo(-L * 0.3, -h * 0.6, 0, -h * 0.25)
      break
    case 'shark':
      s.moveTo(0, h * 0.2)
      s.quadraticCurveTo(-L * 0.12, h * 0.6, -L * 0.3, h * 1.25)
      s.quadraticCurveTo(-L * 0.22, h * 0.3, -L * 0.14, 0)
      s.quadraticCurveTo(-L * 0.2, -h * 0.4, -L * 0.2, -h * 0.75)
      s.quadraticCurveTo(-L * 0.08, -h * 0.4, 0, -h * 0.2)
      break
    case 'lunate':
      s.moveTo(0, h * 0.2)
      s.quadraticCurveTo(-L * 0.2, h * 0.6, -L * 0.36, h * 1.05)
      s.quadraticCurveTo(-L * 0.18, h * 0.3, -L * 0.2, 0)
      s.quadraticCurveTo(-L * 0.18, -h * 0.3, -L * 0.36, -h * 1.05)
      s.quadraticCurveTo(-L * 0.2, -h * 0.6, 0, -h * 0.2)
      break
    case 'round':
    default:
      s.moveTo(0, h * 0.25)
      s.bezierCurveTo(-L * 0.2, h * 0.7, -L * 0.42, h * 0.75, -L * 0.42, 0)
      s.bezierCurveTo(-L * 0.42, -h * 0.75, -L * 0.2, -h * 0.7, 0, -h * 0.25)
      break
  }
  return shapeGeometry(s, 12)
}

/** Dorsal fin in the XY plane: base along the X axis from x=0 (front) to x=-base. */
export function dorsalGeometry(base: number, height: number, sweep = 0.4, flowing = false): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, -height * 0.05)
  if (flowing) {
    s.bezierCurveTo(-base * 0.1, height * 0.8, -base * 0.6, height * 1.1, -base * 1.3, height * 0.55)
    s.bezierCurveTo(-base * 1.1, height * 0.2, -base * 1.0, height * 0.1, -base, -height * 0.05)
  } else {
    s.quadraticCurveTo(-base * 0.1, height * 0.7, -base * sweep - base * 0.2, height)
    s.quadraticCurveTo(-base * 0.75, height * 0.4, -base, -height * 0.05)
  }
  s.lineTo(0, -height * 0.05)
  return shapeGeometry(s, 10)
}

/** Small paddle fin; root at the origin, extending toward -X. */
export function paddleGeometry(length: number, width: number): THREE.BufferGeometry {
  const s = new THREE.Shape()
  s.moveTo(0, width * 0.3)
  s.bezierCurveTo(-length * 0.4, width * 0.9, -length, width * 0.6, -length, 0)
  s.bezierCurveTo(-length, -width * 0.4, -length * 0.4, -width * 0.5, 0, -width * 0.2)
  return shapeGeometry(s, 8)
}

const finCache = new Map<string, THREE.BufferGeometry>()

export function cachedFin(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = finCache.get(key)
  if (!g) {
    g = build()
    finCache.set(key, g)
  }
  return g
}
