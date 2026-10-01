import * as THREE from 'three'
import type { BuiltPart, V3 } from '../../geometry/MeshBuilder'
import type { DecorationCatalogEntry } from '../decorationDefinitions'
import { noise3 } from '../../../utils/noise'

export type Rand = () => number
export type StaticBuilder = (def: DecorationCatalogEntry, rand: Rand) => BuiltPart[]
export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => void

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function rr(rand: Rand, min: number, max: number): number {
  return min + rand() * (max - min)
}

/** Rotation (XYZ euler) + translation as a matrix, for tilting a finished model. */
export function pose(rotation: V3, position: V3 = [0, 0, 0]): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  )
}

/** Stone/wood tone variation plus moss creeping over upward-facing surfaces. */
export function mossy(base: THREE.ColorRepresentation, moss: THREE.ColorRepresentation, amount = 0.9, scale = 6): ColorFn {
  const b = new THREE.Color(base)
  const m = new THREE.Color(moss)
  return (p, n, c) => {
    const tone = 0.84 + noise3(p.x * scale, p.y * scale, p.z * scale) * 0.26
    c.copy(b).multiplyScalar(tone)
    const cover = smoothstep(0.45, 0.9, n.y) * smoothstep(-0.15, 0.35, noise3(p.x * scale * 1.3 + 3.1, p.y * scale * 1.3, p.z * scale * 1.3))
    c.lerp(m, cover * amount)
  }
}

/** Streaky wood grain running along one axis. */
export function woodGrain(base: THREE.ColorRepresentation, along: 'x' | 'y' | 'z' = 'y', moss?: THREE.ColorRepresentation): ColorFn {
  const b = new THREE.Color(base)
  const m = moss ? new THREE.Color(moss) : null
  return (p, n, c) => {
    const s = along === 'x' ? noise3(p.x * 2, p.y * 22, p.z * 22) : along === 'y' ? noise3(p.x * 22, p.y * 2, p.z * 22) : noise3(p.x * 22, p.y * 22, p.z * 2)
    c.copy(b).multiplyScalar(0.8 + s * 0.35)
    if (m) c.lerp(m, smoothstep(0.6, 0.95, n.y) * smoothstep(0.1, 0.5, noise3(p.x * 7, p.y * 7, p.z * 7 + 4)) * 0.8)
  }
}

/** Stone blocks with mortar lines, a little grime at the base and moss up top. */
export function bricks(base: THREE.ColorRepresentation, moss: THREE.ColorRepresentation, rowHeight = 0.07, brickWidth = 0.13): ColorFn {
  const b = new THREE.Color(base)
  const mortar = new THREE.Color(base).multiplyScalar(0.55)
  const m = new THREE.Color(moss)
  return (p, n, c) => {
    const row = Math.floor(p.y / rowHeight)
    const along = Math.abs(n.x) > 0.6 ? p.z : Math.abs(n.z) > 0.6 ? p.x : p.x + p.z
    const u = along / brickWidth + (row % 2) * 0.5
    const v = p.y / rowHeight
    const isMortar = Math.abs(n.y) < 0.6 && (v - Math.floor(v) < 0.12 || u - Math.floor(u) < 0.07)
    const tone = 0.85 + noise3(Math.floor(u) * 1.7, row * 2.3, 0.5) * 0.3
    c.copy(isMortar ? mortar : b).multiplyScalar(isMortar ? 1 : tone)
    c.multiplyScalar(0.7 + smoothstep(0, 0.25, p.y) * 0.3)
    c.lerp(m, smoothstep(0.55, 0.95, n.y) * smoothstep(0, 0.4, noise3(p.x * 8, p.y * 8, p.z * 8)) * 0.7)
  }
}

/** Rusty metal: base metal mottled with orange-brown rust. */
export function rusty(metal: THREE.ColorRepresentation, rust: THREE.ColorRepresentation): ColorFn {
  const a = new THREE.Color(metal)
  const r = new THREE.Color(rust)
  return (p, _n, c) => {
    const n = noise3(p.x * 9, p.y * 9, p.z * 9) * 0.6 + noise3(p.x * 23, p.y * 23, p.z * 23) * 0.4
    c.copy(a).lerp(r, smoothstep(-0.15, 0.35, n))
  }
}

export function gradientY(bottom: THREE.ColorRepresentation, top: THREE.ColorRepresentation, y0: number, y1: number): ColorFn {
  const b = new THREE.Color(bottom)
  const t = new THREE.Color(top)
  return (p, _n, c) => {
    c.copy(b).lerp(t, smoothstep(y0, y1, p.y))
  }
}
