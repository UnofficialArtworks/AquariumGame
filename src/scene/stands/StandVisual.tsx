import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { atmosphere } from '../Atmosphere'
import { ROOM_FLOOR_Y, STAND_DEPTH, STAND_HEIGHT, STAND_WIDTH, type StandStyle } from './standDefinitions'

// Everything below is built in "stand space": y = 0 is the room floor, y = H is the
// top surface the tank rests on, +z is the front. Each style is a handful of merged
// geometries (one per material), built lazily once and shared by every StandVisual.

const W = STAND_WIDTH
const D = STAND_DEPTH
const H = STAND_HEIGHT
const HW = W / 2
const HD = D / 2
const PI = Math.PI
/** How far the top slab overhangs the body on every side. */
const OVER = 0.06
/** How far door panels stand proud of the body face. */
const DF = 0.04
const DOOR_GAP = 0.1
const DOOR_W = (W - 0.44 - 2 * DOOR_GAP) / 3
const WHITE = '#ffffff'

type Face = 'front' | 'back' | 'right' | 'left'
const FACES: Face[] = ['front', 'back', 'right', 'left']
/** Placement: x, y, z, a rotation about Y and a uniform scale. */
type At = readonly [number, number, number, number?, number?]
type Rot = readonly [number, number, number]
type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.ColorRepresentation
type Tint = THREE.ColorRepresentation | ColorFn

interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  receiveShadow: boolean
}

interface StandKit {
  parts: Part[]
  /** Per-frame hook for glows and blinking lights. */
  update?: (time: number, night: number) => void
}

// --- Geometry helpers -------------------------------------------------------

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

/** Moves (and optionally rotates / scales) a geometry in place. */
function put<G extends THREE.BufferGeometry>(g: G, x = 0, y = 0, z = 0, rot?: Rot, scale: number | Rot = 1): G {
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0)
  _q.setFromEuler(_e)
  if (typeof scale === 'number') _s.set(scale, scale, scale)
  else _s.set(scale[0], scale[1], scale[2])
  _m.compose(_p.set(x, y, z), _q, _s)
  return g.applyMatrix4(_m)
}

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => put(new THREE.BoxGeometry(w, h, d), x, y, z)
const rbox = (w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0, seg = 2) =>
  put(new RoundedBoxGeometry(w, h, d, seg, r), x, y, z)
const cylY = (rt: number, rb: number, h: number, seg: number, x = 0, y = 0, z = 0) =>
  put(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z)
const cylZ = (r: number, len: number, x = 0, y = 0, z = 0, seg = 20) =>
  put(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, [PI / 2, 0, 0])
const cylX = (r: number, len: number, x = 0, y = 0, z = 0, seg = 14) =>
  put(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, [0, 0, PI / 2])
const ball = (r: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6) =>
  put(new THREE.SphereGeometry(r, ws, hs), x, y, z, undefined, [sx, sy, sz])
const torusZ = (big: number, tube: number, x = 0, y = 0, z = 0, rs = 8, ts = 28) =>
  put(new THREE.TorusGeometry(big, tube, rs, ts), x, y, z)

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length) % list.length]
}

/** Multi-stop color ramp; the returned color is a shared scratch value. */
function ramp(stops: readonly string[]): (t: number) => THREE.Color {
  const cols = stops.map((s) => new THREE.Color(s))
  const out = new THREE.Color()
  return (t) => {
    const f = THREE.MathUtils.clamp(t, 0, 1) * (cols.length - 1)
    const i = Math.min(cols.length - 2, Math.floor(f))
    return out.copy(cols[i]).lerp(cols[i + 1], f - i)
  }
}

/** Collects placed geometries, bakes a vertex color into each, and merges them into one draw call. */
class Batch {
  private list: THREE.BufferGeometry[] = []

  add(geometry: THREE.BufferGeometry, tint: Tint = WHITE, at?: At): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    g.deleteAttribute('uv')
    if (at) put(g, at[0], at[1], at[2], [0, at[3] ?? 0, 0], at[4] ?? 1)
    const pos = g.getAttribute('position')
    const nor = g.getAttribute('normal')
    const colors = new Float32Array(pos.count * 3)
    if (typeof tint === 'function') {
      for (let i = 0; i < pos.count; i++) {
        _c.set(tint(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)))
        colors[i * 3] = _c.r
        colors[i * 3 + 1] = _c.g
        colors[i * 3 + 2] = _c.b
      }
    } else {
      _c.set(tint)
      for (let i = 0; i < pos.count; i++) {
        colors[i * 3] = _c.r
        colors[i * 3 + 1] = _c.g
        colors[i * 3 + 2] = _c.b
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.list.push(g)
    return this
  }

  addAll(geometries: THREE.BufferGeometry[], tint: Tint = WHITE, at?: At): this {
    for (const g of geometries) this.add(g, tint, at)
    return this
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list)
    for (const g of this.list) g.dispose()
    this.list = []
    if (!merged) throw new Error('StandVisual: could not merge geometry')
    merged.computeBoundingSphere()
    return merged
  }
}

const part = (batch: Batch, material: THREE.Material, receiveShadow = false): Part => ({
  geometry: batch.build(),
  material,
  receiveShadow,
})

const lit = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
const gloss = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p)

// --- Face layout ------------------------------------------------------------

/** Placement for a detail on one of the four vertical faces (local x runs along the face, z points outward). */
function faceAt(face: Face, x = 0, y = 0, out = 0): At {
  switch (face) {
    case 'front':
      return [x, y, HD + out, 0]
    case 'back':
      return [-x, y, -HD - out, PI]
    case 'right':
      return [HW + out, y, -x, PI / 2]
    default:
      return [-HW - out, y, x, -PI / 2]
  }
}

const faceLen = (face: Face) => (face === 'front' || face === 'back' ? W : D)

/** Door positions along a face: three on front/back, one wide panel on each side. */
function bays(face: Face): Array<{ cx: number; w: number }> {
  if (face === 'front' || face === 'back') return [-1, 0, 1].map((i) => ({ cx: i * (DOOR_W + DOOR_GAP), w: DOOR_W }))
  return [{ cx: 0, w: D - 0.44 }]
}

/**
 * Rectangular band around the body (four boxes that only touch edge to edge). It
 * reaches `embed` inside and `out` beyond the rectangle of half-extents (ox, oz).
 */
function wrap(y0: number, y1: number, out: number, embed = 0.02, ox = HW, oz = HD): THREE.BufferGeometry[] {
  const hx = ox - embed
  const hz = oz - embed
  const t = embed + out
  const h = y1 - y0
  const cy = (y0 + y1) / 2
  return [
    box(2 * (hx + t), h, t, 0, cy, hz + t / 2),
    box(2 * (hx + t), h, t, 0, cy, -hz - t / 2),
    box(t, h, 2 * hz, hx + t / 2, cy, 0),
    box(t, h, 2 * hz, -hx - t / 2, cy, 0),
  ]
}

/** Rectangular outline lying in the local XY plane, centered on the origin, at depth z. */
function rectRing(w: number, h: number, t: number, z: number, d: number): THREE.BufferGeometry[] {
  return [
    box(w, t, d, 0, (h - t) / 2, z),
    box(w, t, d, 0, -(h - t) / 2, z),
    box(t, h - 2 * t, d, (w - t) / 2, 0, z),
    box(t, h - 2 * t, d, -(w - t) / 2, 0, z),
  ]
}

/** Vertical bar handle standing off the door on two posts, centered on the local origin. */
function barHandle(b: Batch, at: At, len: number, r: number) {
  b.add(put(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 10), 0, 0, DF + 0.075), WHITE, at)
  for (const s of [-1, 1]) b.add(cylZ(r * 0.7, 0.085, 0, s * (len / 2 - 0.07), DF + 0.0325, 10), WHITE, at)
}

/** Hanging strip with a scalloped lower edge in the local XY plane, top edge at y = 0, centered on x. */
function scallopStrip(length: number, band: number, lobes: number, depth: number, bevel: number): THREE.BufferGeometry {
  const s = length / lobes
  const shape = new THREE.Shape()
  shape.moveTo(-length / 2, 0)
  shape.lineTo(length / 2, 0)
  shape.lineTo(length / 2, -band)
  for (let i = lobes - 1; i >= 0; i--) shape.absarc(-length / 2 + (i + 0.5) * s, -band, s / 2, 0, PI, true)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  })
  return g.translate(0, 0, -depth / 2)
}

function heartGeometry(size: number, depth: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const k = size / 32
  const n = 40
  for (let i = 0; i < n; i++) {
    const t = (i / n) * PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    if (i === 0) shape.moveTo(x * k, (y + 3) * k)
    else shape.lineTo(x * k, (y + 3) * k)
  }
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 1,
  })
  return g.translate(0, 0, -depth / 2)
}

/** Plump five-armed star (arm tip points up). */
function starGeometry(radius: number, depth: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const n = 80
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2
    const p = 0.5 + 0.5 * Math.cos(5 * (a - PI / 2))
    const r = radius * (0.4 + 0.6 * p ** 1.4)
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  })
  return g.translate(0, 0, -depth / 2)
}

function crownGeometry(depth: number, bevel: number): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [
    [-0.25, -0.1],
    [0.25, -0.1],
    [0.25, 0.22],
    [0.13, 0.08],
    [0, 0.28],
    [-0.13, 0.08],
    [-0.25, 0.22],
  ]
  const shape = new THREE.Shape()
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  })
  return g.translate(0, 0, -depth / 2)
}

/** Flat spiral band (lollipop swirl) in the XY plane, extruded along +z. */
function spiralGeometry(radius: number, turns: number, width: number, depth: number): THREE.BufferGeometry {
  const steps = Math.round(turns * 28)
  const inner: Array<[number, number]> = []
  const outer: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = t * turns * PI * 2
    const r = 0.015 + t * (radius - 0.015 - width)
    inner.push([Math.cos(a) * (r - width / 2), Math.sin(a) * (r - width / 2)])
    outer.push([Math.cos(a) * (r + width / 2), Math.sin(a) * (r + width / 2)])
  }
  const shape = new THREE.Shape()
  inner.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  for (let i = outer.length - 1; i >= 0; i--) shape.lineTo(outer[i][0], outer[i][1])
  shape.closePath()
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 })
}

/** Seashell: a fan of beveled wedges that meet at the hinge (origin), fan opening toward +y. */
function shellWedges(radius: number, lobes: number, depth: number): THREE.BufferGeometry[] {
  const from = (25 / 180) * PI
  const span = ((180 - 50) / 180) * PI
  return Array.from({ length: lobes }, (_, i) => {
    const a0 = from + (i / lobes) * span
    const a1 = from + ((i + 1) / lobes) * span
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    for (let k = 0; k <= 8; k++) {
      const u = k / 8
      const a = a0 + (a1 - a0) * u
      const r = radius * (0.86 + 0.14 * Math.sin(PI * u))
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.008,
      bevelSegments: 2,
      curveSegments: 1,
    })
  })
}

/**
 * Thin ribbon that hugs a side profile, given as (z, y) points running from the top
 * down, lifted `lift` off the surface and `thick` deep, spanning `width` along x.
 */
function ribbon(profile: ReadonlyArray<readonly [number, number]>, lift: number, thick: number, cx: number, width: number) {
  const n = profile.length
  const normals: Array<[number, number]> = []
  for (let i = 0; i < n - 1; i++) {
    const dz = profile[i + 1][0] - profile[i][0]
    const dy = profile[i + 1][1] - profile[i][1]
    const len = Math.hypot(dz, dy)
    normals.push([-dy / len, dz / len])
  }
  const inner: Array<[number, number]> = []
  const outer: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const a = normals[Math.max(0, i - 1)]
    const b = normals[Math.min(n - 2, i)]
    const l = Math.hypot(a[0] + b[0], a[1] + b[1])
    const nz = (a[0] + b[0]) / l
    const ny = (a[1] + b[1]) / l
    const k = 1 / Math.max(0.5, nz * b[0] + ny * b[1])
    inner.push([profile[i][0] + nz * lift * k, profile[i][1] + ny * lift * k])
    outer.push([profile[i][0] + nz * (lift + thick) * k, profile[i][1] + ny * (lift + thick) * k])
  }
  const shape = new THREE.Shape()
  inner.forEach(([z, y], i) => (i === 0 ? shape.moveTo(z, y) : shape.lineTo(z, y)))
  for (let i = n - 1; i >= 0; i--) shape.lineTo(outer[i][0], outer[i][1])
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 })
  g.rotateY(-PI / 2)
  return g.translate(cx + width / 2, 0, 0)
}

// --- Glow pool (soft light on the floor under the stand) --------------------

let glowTexture: THREE.Texture | null | undefined

function getGlowTexture(): THREE.Texture | null {
  if (glowTexture !== undefined) return glowTexture
  glowTexture = null
  if (typeof document === 'undefined') return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return glowTexture
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, '#222222')
  gradient.addColorStop(0.6, '#ffffff')
  gradient.addColorStop(1, '#000000')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(canvas)
  glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

/** Additive, unlit-looking floor decal. Returns null where no canvas is available. */
function glowPool(color: string): { part: Part; material: THREE.MeshPhysicalMaterial } | null {
  const map = getGlowTexture()
  if (!map) return null
  const material = gloss({
    color: '#000000',
    emissive: color,
    emissiveMap: map,
    emissiveIntensity: 0.8,
    roughness: 1,
    metalness: 0,
    specularIntensity: 0,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const geometry = new THREE.PlaneGeometry(W + 3.4, D + 3.4)
  geometry.rotateX(-PI / 2)
  geometry.translate(0, 0.012, 0)
  return { part: { geometry, material, receiveShadow: false }, material }
}

const lerp = THREE.MathUtils.lerp

// --- 1. Walnut --------------------------------------------------------------

/** Raised-panel door: frame, dark groove, raised center panel and faint grain strips. */
function shakerDoor(
  b: Batch,
  at: At,
  w: number,
  h: number,
  frame: string,
  panel: string,
  rand: () => number,
) {
  b.add(rbox(w, h, 0.05, 0.02, 0, 0, DF - 0.025), frame, at)
  b.add(box(w - 0.3, h - 0.3, 0.03, 0, 0, DF - 0.003), '#1b120c', at)
  b.add(rbox(w - 0.34, h - 0.34, 0.05, 0.015, 0, 0, DF + 0.005), panel, at)
  // Grain: slender strips, one per slot so none overlap.
  const base = new THREE.Color(panel)
  const slots = 7
  const slot = (w - 0.5) / slots
  for (let i = 0; i < slots; i++) {
    const gw = 0.012 + rand() * 0.02
    const gh = (h - 0.5) * (0.4 + rand() * 0.55)
    const gx = -(w - 0.5) / 2 + (i + 0.2 + rand() * 0.6) * slot
    const gy = (rand() - 0.5) * (h - 0.5 - gh)
    const tone = base.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.05)
    b.add(box(gw, gh, 0.02, gx, gy, DF + 0.03), tone, at)
  }
}

function buildWalnut(): StandKit {
  const wood = new Batch()
  const brass = new Batch()
  const rand = rng(7)
  const slabT = 0.16
  const plinth = 0.26
  const top = H - slabT
  wood.add(box(W - 0.3, plinth + 0.02, D - 0.3, 0, (plinth + 0.02) / 2, 0), '#150e09')
  wood.add(box(W, top + 0.02 - plinth, D, 0, (top + 0.02 + plinth) / 2, 0), '#2b1d15')
  wood.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.03, 0, H - slabT / 2, 0, 3), '#503625')
  wood.add(box(W + 0.04, 0.07, D + 0.04, 0, top - 0.025, 0), '#36251a')

  const y0 = plinth + 0.12
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const tones = [
    ['#3f2b1d', '#4b3324'],
    ['#432f20', '#503727'],
    ['#3b281b', '#47301f'],
  ]
  for (const face of FACES) {
    bays(face).forEach((bay, i) => {
      const [frame, panel] = tones[i % 3]
      shakerDoor(wood, faceAt(face, bay.cx, cy), bay.w, y1 - y0, frame, panel, rand)
    })
  }

  // Brass inlay line under the moulding, and bar handles on the front doors.
  brass.addAll(wrap(top - 0.09, top - 0.07, 0.014))
  for (const i of [-1, 0, 1]) {
    const hx = i * (DOOR_W + DOOR_GAP) + (i === 1 ? -1 : 1) * (DOOR_W / 2 - 0.12)
    barHandle(brass, faceAt('front', hx, cy), 0.46, 0.026)
  }

  return {
    parts: [
      part(wood, lit({ color: WHITE, vertexColors: true, roughness: 0.55, metalness: 0 }), true),
      part(brass, lit({ color: '#c9a76a', roughness: 0.28, metalness: 1 })),
    ],
  }
}

// --- 2. Arctic --------------------------------------------------------------

function buildArctic(): StandKit {
  const lacquer = new Batch()
  const chrome = new Batch()
  const led = new Batch()
  const legH = 0.24
  const slabT = 0.14
  const top = H - slabT
  lacquer.add(rbox(W, top + 0.02 - legH, D, 0.06, 0, (legH + top + 0.02) / 2, 0, 3), '#c3d1db')
  lacquer.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.04, 0, H - slabT / 2, 0, 3), '#dfe9ef')

  const y0 = legH + 0.14
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  for (const face of FACES) {
    for (const bay of bays(face)) {
      const at = faceAt(face, bay.cx, cy)
      lacquer.add(rbox(bay.w, y1 - y0, 0.05, 0.035, 0, 0, DF - 0.025, 3), '#e6eef3', at)
      chrome.addAll(rectRing(bay.w - 0.14, y1 - y0 - 0.14, 0.012, DF + 0.004, 0.016), WHITE, at)
    }
  }

  // Chrome: trim under the slab, a line near the bottom edge, bar handles and legs.
  chrome.addAll(wrap(top - 0.0125, top + 0.0125, 0.01, 0.02, HW + OVER, HD + OVER))
  chrome.addAll(wrap(legH + 0.06, legH + 0.085, 0.01))
  for (const i of [-1, 0, 1]) {
    const hx = i * (DOOR_W + DOOR_GAP) + (i === 1 ? -1 : 1) * (DOOR_W / 2 - 0.12)
    barHandle(chrome, faceAt('front', hx, cy), 0.8, 0.02)
  }
  for (const x of [-1, 0, 1]) {
    for (const z of [-1, 1]) {
      chrome.add(cylY(0.07, 0.07, legH + 0.01, 14, x * (HW - 0.45), (legH + 0.02) / 2 + 0.005, z * (HD - 0.35)))
      chrome.add(cylY(0.1, 0.1, 0.02, 16, x * (HW - 0.45), 0.01, z * (HD - 0.35)))
    }
  }

  // Cool-blue LED ring tucked under the body's lower edge.
  led.addAll(wrap(legH - 0.05, legH + 0.005, 0, 0.06, HW - 0.05, HD - 0.05))

  const ledMat = lit({ color: '#0b1a24', emissive: '#5cc8ff', emissiveIntensity: 1.8, roughness: 0.4 })
  const pool = glowPool('#4cb8ff')
  const parts = [
    part(lacquer, gloss({ color: WHITE, vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }), true),
    part(chrome, lit({ color: '#e8eef2', roughness: 0.1, metalness: 1 })),
    part(led, ledMat),
  ]
  if (pool) parts.push(pool.part)
  return {
    parts,
    update: (_time, night) => {
      ledMat.emissiveIntensity = lerp(1.8, 3.2, night)
      if (pool) pool.material.emissiveIntensity = lerp(0.8, 1.3, night)
    },
  }
}

// --- 3. Bubblegum -----------------------------------------------------------

function bowGeometries(b: Batch, at: At, color: string, knot: string) {
  for (const s of [-1, 1]) {
    b.add(put(new THREE.SphereGeometry(0.13, 12, 8), s * 0.14, 0.02, 0, [0, 0, s * 0.3], [1, 0.7, 0.4]), color, at)
    b.add(put(new THREE.BoxGeometry(0.07, 0.24, 0.02), s * 0.06, -0.16, s > 0 ? 0.008 : 0, [0, 0, -s * 0.3]), color, at)
  }
  b.add(ball(0.055, 0, 0, 0.02, 1, 1, 0.8), knot, at)
}

function buildBubblegum(): StandKit {
  const pink = new Batch()
  const gold = new Batch()
  const slabT = 0.16
  const top = H - slabT
  const skirtTop = 0.36
  pink.add(box(W - 0.4, 0.34, D - 0.4, 0, 0.17, 0), '#c64f8e')
  pink.add(rbox(W, top + 0.02 - 0.32, D, 0.08, 0, (0.32 + top + 0.02) / 2, 0, 3), '#ff86c2')
  pink.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.07, 0, H - slabT / 2, 0, 3), '#ffc4e1')
  gold.addAll(wrap(top - 0.012, top + 0.012, 0.012, 0.02, HW + OVER, HD + OVER))
  gold.addAll(wrap(H - 0.09, H - 0.07, 0.012, 0.02, HW + OVER, HD + OVER))
  gold.addAll(wrap(skirtTop - 0.015, skirtTop + 0.025, 0.1))

  const y0 = 0.5
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const h = y1 - y0
  for (const face of FACES) {
    for (const bay of bays(face)) {
      const at = faceAt(face, bay.cx, cy)
      pink.add(rbox(bay.w, h, 0.05, 0.04, 0, 0, DF - 0.025, 3), '#ff9fd0', at)
      pink.add(rbox(bay.w - 0.5, h - 0.5, 0.05, 0.035, 0, 0, DF + 0.005, 3), '#ffc9e4', at)
      gold.addAll(rectRing(bay.w - 0.2, h - 0.2, 0.022, DF + 0.004, 0.02), WHITE, at)
    }
  }

  // Front: heart handles, a crown on the center door, bows on the outer doors.
  for (const s of [-1, 1]) {
    const cx = s * (DOOR_W + DOOR_GAP)
    gold.add(heartGeometry(0.36, 0.04, 0.016), WHITE, faceAt('front', cx - s * 0.86, cy, DF + 0.075))
    gold.add(cylZ(0.028, 0.08, 0, 0, DF + 0.045, 10), WHITE, faceAt('front', cx - s * 0.86, cy))
    bowGeometries(pink, faceAt('front', cx + s * 0.6, cy + h / 2 - 0.5, DF + 0.07), '#ff4fa3', '#ff2e8f')
  }
  const crownAt = faceAt('front', 0, cy + 0.12, DF + 0.05)
  gold.add(crownGeometry(0.05, 0.012).applyMatrix4(new THREE.Matrix4().makeScale(1.5, 1.5, 1)), WHITE, crownAt)
  for (const [gx, gy, c] of [
    [-0.375, 0.375, '#ff4fa3'],
    [0, 0.435, '#7fe9ff'],
    [0.375, 0.375, '#ff4fa3'],
    [0, -0.045, '#ff4fa3'],
  ] as const) {
    pink.add(ball(0.05, gx, gy, 0.07, 1, 1, 0.8, 10, 8), c, crownAt)
  }

  // Ruffled skirt: two staggered layers of scalloped frills on every face.
  for (const face of FACES) {
    const len = faceLen(face) + 0.1
    const n = Math.round(len / 0.36)
    pink.add(scallopStrip(len, 0.16, n, 0.05, 0.012), '#ff6fb5', faceAt(face, 0, skirtTop, 0.05))
    const s = len / n
    pink.add(scallopStrip((n - 1) * s, 0.1, n - 1, 0.05, 0.012), '#ffa8d3', faceAt(face, 0, skirtTop - 0.07, 0.085))
  }

  return {
    parts: [
      part(pink, gloss({ color: WHITE, vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }), true),
      part(gold, lit({ color: '#ffcf4d', emissive: '#6b4a00', emissiveIntensity: 0.25, roughness: 0.28, metalness: 1 })),
    ],
  }
}

// --- 4. Racer ---------------------------------------------------------------

function buildRacer(): StandKit {
  const black = new Batch()
  const red = new Batch()
  const chrome = new Batch()
  const white = new Batch()
  const rubber = new Batch()
  const slabT = 0.2
  const top = H - slabT
  const bodyBottom = 0.38
  black.add(box(W - 1, 0.4, D - 0.8, 0, 0.2, 0), '#090a0c')
  black.add(rbox(W, top + 0.02 - bodyBottom, D, 0.05, 0, (bodyBottom + top + 0.02) / 2, 0, 3), '#16181d')
  black.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.012, 0, H - slabT / 2, 0, 3), '#0e1013')
  red.addAll(wrap(top - 0.01, top + 0.01, 0.01, 0.02, HW + OVER, HD + OVER))

  const y0 = 0.5
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const h = y1 - y0
  for (const face of FACES) {
    bays(face).forEach((bay, i) => {
      const at = faceAt(face, bay.cx, cy)
      black.add(rbox(bay.w, h, 0.05, 0.03, 0, 0, DF - 0.025), '#1e2127', at)
      // The center door stays flat so the racing stripes can run over it.
      const flat = i === 1
      if (!flat) {
        black.add(rbox(bay.w - 0.44, h - 0.44, 0.05, 0.02, 0, 0, DF + 0.005), '#101215', at)
        red.addAll(rectRing(bay.w - 0.34, h - 0.34, 0.014, DF + 0.004, 0.016), WHITE, at)
      }
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          chrome.add(
            put(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6), sx * (bay.w / 2 - 0.11), sy * (h / 2 - 0.11), DF + 0.01, [PI / 2, PI / 6, 0]),
            WHITE,
            at,
          )
        }
      }
    })
  }
  for (const s of [-1, 1]) {
    barHandle(chrome, faceAt('front', s * (DOOR_W + DOOR_GAP) - s * (DOOR_W / 2 - 0.11), cy), 0.5, 0.024)
  }

  // Two racing stripes over the top front edge and down the center door.
  const slabFace: Array<[number, number]> = [
    [HD - 0.1, H],
    [HD + OVER, H],
    [HD + OVER, H - slabT],
  ]
  const doorFace: Array<[number, number]> = [
    [HD, top],
    [HD, y1],
    [HD + DF, y1],
    [HD + DF, y0],
    [HD, y0],
    [HD, bodyBottom + 0.04],
  ]
  for (const sx of [-0.2, 0.2]) {
    red.add(ribbon(slabFace, 0.008, 0.012, sx, 0.26))
    red.add(ribbon(doorFace, 0.008, 0.012, sx, 0.26))
  }

  // Checkered finish line around the slab: white squares floating just off the black.
  const cell = 0.09
  for (const face of FACES) {
    const cols = Math.round((faceLen(face) + 2 * OVER) / cell)
    const sz = (faceLen(face) + 2 * OVER) / cols
    const at = faceAt(face, 0, 0, OVER + 0.008)
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < cols; i++) {
        if ((i + row) % 2) continue
        const x = -(cols * sz) / 2 + (i + 0.5) * sz
        if (face === 'front' && Math.abs(Math.abs(x) - 0.2) < 0.13 + sz / 2) continue
        white.add(put(new THREE.PlaneGeometry(sz, sz), x, H - 0.1 + (row - 0.5) * sz, 0), WHITE, at)
      }
    }
  }

  // Chunky tires with chrome hubs and red caps, tucked under the front corners.
  const tire = new THREE.LatheGeometry(
    [
      [0.15, -0.17],
      [0.26, -0.17],
      [0.3, -0.12],
      [0.3, 0.12],
      [0.26, 0.17],
      [0.15, 0.17],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    24,
  ).rotateZ(PI / 2)
  const tireScale = 1.15
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HW - 0.32)
      const z = sz * (HD - 0.42)
      const y = 0.3 * tireScale
      rubber.add(tire.clone(), '#25262b', [x, y, z, 0, tireScale])
      chrome.add(cylX(0.2, 0.43, x, y, z, 16))
      red.add(cylX(0.08, 0.45, x, y, z, 14))
    }
  }
  tire.dispose()

  const chromeMat = lit({ color: '#e9edf2', roughness: 0.12, metalness: 1 })
  const redMat = gloss({ color: '#e2342d', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 })
  return {
    parts: [
      part(black, gloss({ color: WHITE, vertexColors: true, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }), true),
      part(red, redMat),
      part(chrome, chromeMat),
      part(white, lit({ color: '#f4f4f2', roughness: 0.4 })),
      part(rubber, lit({ color: WHITE, vertexColors: true, roughness: 0.9, metalness: 0 })),
    ],
  }
}

// --- 5. Bamboo --------------------------------------------------------------

const BAMBOO = ['#c4b25a', '#bfae55', '#cdb961'] as const
const BAMBOO_RING = '#8c7b33'
const ROPE = '#8b6a3a'
const STRAW = ['#d9b765', '#c9a24f', '#e2c57d', '#b88f40'] as const

function buildBamboo(): StandKit {
  const pole = new Batch()
  const woven = new Batch()
  const thatch = new Batch()
  const rand = rng(33)
  const slabT = 0.14
  const top = H - slabT
  const pr = 0.13
  const railTop = 1.78
  const railBot = 0.2
  const rr = 0.085

  // Hidden core so the woven panels have something dark behind them.
  woven.add(box(W - 0.3, top + 0.02, D - 0.3, 0, (top + 0.02) / 2, 0), '#2e2110')

  // Roof: a raft of bamboo poles lying front to back, ends showing at the front and back.
  const raft = Math.round((W + 2 * OVER) / 0.14)
  const pitch = (W + 2 * OVER) / raft
  pole.add(box(W + 2 * OVER - 0.02, 0.08, D + 2 * OVER - 0.04, 0, H - 0.1, 0), '#5a4420')
  for (let i = 0; i < raft; i++) {
    const x = -(W + 2 * OVER) / 2 + (i + 0.5) * pitch
    pole.add(
      cylZ(pitch * 0.49, D + 2 * OVER, x, H - 0.07, 0, 10),
      (_x, _y, _z, _nx, _ny, nz) => (Math.abs(nz) > 0.9 ? '#ecd9a0' : i % 2 ? '#c9a95c' : '#d3b366'),
    )
  }

  const vertical = (x: number, z: number, r: number, y0: number, y1: number) => {
    pole.add(cylY(r, r, y1 - y0, 14, x, (y0 + y1) / 2, z), pick(rand, BAMBOO))
    for (let y = y0 + 0.35 + rand() * 0.2; y < y1 - 0.15; y += 0.45 + rand() * 0.2) {
      pole.add(cylY(r + 0.022, r + 0.022, 0.05, 14, x, y, z), BAMBOO_RING)
    }
  }
  const lash = (x: number, y: number, z: number, r: number, turns: number) => {
    for (let k = 0; k < turns; k++) {
      pole.add(put(new THREE.TorusGeometry(r + 0.014, 0.02, 6, 18), x, y + (k - (turns - 1) / 2) * 0.05, z, [PI / 2, 0, 0]), ROPE)
    }
  }
  const horizontal = (axis: 'x' | 'z', fixed: number, y: number, len: number) => {
    pole.add(axis === 'x' ? cylX(rr, len, 0, y, fixed) : cylZ(rr, len, fixed, y, 0, 14), pick(rand, BAMBOO))
    for (let p = -len / 2 + 0.6 + rand() * 0.3; p < len / 2 - 0.3; p += 1.0 + rand() * 0.4) {
      pole.add(axis === 'x' ? cylX(rr + 0.02, 0.05, p, y, fixed) : cylZ(rr + 0.02, 0.05, fixed, y, p, 14), BAMBOO_RING)
    }
  }

  const cx = HW - pr
  const cz = HD - pr
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      vertical(sx * cx, sz * cz, pr, 0, top + 0.02)
      lash(sx * cx, railBot, sz * cz, pr, 3)
      lash(sx * cx, railTop, sz * cz, pr, 3)
    }
  }
  for (const y of [railBot, railTop]) {
    for (const sz of [-1, 1]) horizontal('x', sz * cz, y, W - 0.3)
    for (const sx of [-1, 1]) horizontal('z', sx * cx, y, D - 0.3)
  }
  const midX = 1.35
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      vertical(sx * midX, sz * (cz + 0.02), 0.07, 0, railTop + 0.05)
      lash(sx * midX, railBot, sz * (cz + 0.02), 0.07, 2)
      lash(sx * midX, railTop, sz * (cz + 0.02), 0.07, 2)
    }
  }

  // Woven panels: alternating horizontal and vertical slats over the dark core.
  const weave = (at: At, w: number, h: number, cell: number) => {
    const cols = Math.max(1, Math.round(w / cell))
    const rows = Math.max(1, Math.round(h / cell))
    const cw = w / cols
    const ch = h / rows
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const horiz = (i + j) % 2 === 0
        const tone = horiz ? ['#dcb96c', '#d2ae62'] : ['#c79f56', '#bd964e']
        woven.add(
          box(horiz ? cw * 0.94 : cw * 0.5, horiz ? ch * 0.5 : ch * 0.94, 0.06, -w / 2 + (i + 0.5) * cw, -h / 2 + (j + 0.5) * ch, 0.025),
          pick(rand, tone),
          at,
        )
      }
    }
  }
  const panelY0 = railBot + rr + 0.01
  const panelY1 = railTop - rr - 0.01
  for (const face of FACES) {
    if (face === 'front' || face === 'back') {
      for (const i of [-1, 0, 1]) {
        weave(faceAt(face, i * 2.705, (panelY0 + panelY1) / 2, -0.15), 2.56, panelY1 - panelY0, 0.17)
      }
    } else {
      weave(faceAt(face, 0, (panelY0 + panelY1) / 2, -0.15), D - 0.52, panelY1 - panelY0, 0.22)
    }
  }

  // Thatch fringe hanging from the roof edge.
  for (const face of FACES) {
    const len = faceLen(face) + 2 * OVER
    for (let layer = 0; layer < 2; layer++) {
      const n = Math.round(len / 0.08)
      const at = faceAt(face, 0, H - 0.1, OVER - 0.03 + layer * 0.025)
      for (let i = 0; i < n; i++) {
        const l = (0.24 + rand() * 0.16) * (layer ? 0.8 : 1)
        const x = -len / 2 + (i + (layer ? 1 : 0.5)) * (len / n)
        if (x > len / 2) continue
        thatch.add(
          put(new THREE.CylinderGeometry(0.03, 0.004, l, 3, 1), x, -l / 2, 0, [-0.1 + (rand() - 0.5) * 0.1, 0, (rand() - 0.5) * 0.12]),
          pick(rand, STRAW),
          at,
        )
      }
    }
  }

  return {
    parts: [
      part(pole, lit({ color: WHITE, vertexColors: true, roughness: 0.45, metalness: 0 }), true),
      part(woven, lit({ color: WHITE, vertexColors: true, roughness: 0.8, metalness: 0 })),
      part(thatch, lit({ color: WHITE, vertexColors: true, roughness: 0.95, metalness: 0 })),
    ],
  }
}

// --- 6. Pirate --------------------------------------------------------------

const PLANKS = ['#6b4a2c', '#5e4026', '#7a5632', '#52371f', '#684628'] as const

function buildPirate(): StandKit {
  const wood = new Batch()
  const iron = new Batch()
  const bone = new Batch()
  const brass = new Batch()
  const rand = rng(21)
  const slabT = 0.18
  const top = H - slabT
  const base = 0.3
  const ironColor = '#2a2d33'

  wood.add(box(W - 0.3, 0.32, D - 0.3, 0, 0.16, 0), '#120b06')
  wood.add(box(W, top + 0.02 - (base - 0.02), D, 0, (top + 0.02 + base - 0.02) / 2, 0), '#1d1209')
  // Lid: two stacked boards, the upper one a touch wider so a seam shows.
  wood.add(rbox(W + 0.1, 0.1, D + 0.1, 0.012, 0, top + 0.05, 0), '#4a3220')
  wood.add(rbox(W + 0.14, H - top - 0.09, D + 0.14, 0.012, 0, (top + 0.09 + H) / 2, 0), '#5a3d27')

  // Weathered vertical boards, each a little different in height and depth.
  const knot = '#2a1a0e'
  for (const face of FACES) {
    for (const bay of bays(face)) {
      const count = Math.round(bay.w / 0.52)
      const pw = bay.w / count
      for (let p = 0; p < count; p++) {
        const x = bay.cx - bay.w / 2 + (p + 0.5) * pw
        const by0 = base + 0.02 + rand() * 0.02
        const by1 = top - 0.02 - rand() * 0.02
        const zf = 0.03 + rand() * 0.014
        const at = faceAt(face, x, 0)
        wood.add(rbox(pw - 0.014, by1 - by0, 0.05, 0.012, 0, (by0 + by1) / 2, zf - 0.025), pick(rand, PLANKS), at)
        if (rand() < 0.4) wood.add(ball(0.03, (rand() - 0.5) * pw * 0.4, by0 + rand() * (by1 - by0), zf, 1, 1.6, 0.35, 8, 6), knot, at)
      }
    }
  }

  // Iron straps (wrapped right around), rivets, and heavy corner brackets.
  const strapOut = 0.085
  for (const [sy0, sy1] of [
    [0.44, 0.62],
    [1.8, 1.98],
  ]) {
    iron.addAll(wrap(sy0, sy1, strapOut), ironColor)
    for (const face of FACES) {
      const len = faceLen(face) - 0.9
      const n = Math.round(len / 0.34)
      for (let i = 0; i <= n; i++) {
        iron.add(ball(0.03, -len / 2 + (i * len) / n, (sy0 + sy1) / 2, strapOut, 1, 1, 1, 6, 4), '#3b3f47', faceAt(face, 0, 0))
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      iron.add(box(0.38, top - base, 0.07, sx * (HW - 0.09), (top + base) / 2, sz * (HD + 0.065)), ironColor)
      iron.add(box(0.07, top - base, 0.28, sx * (HW + 0.065), (top + base) / 2, sz * (HD - 0.11)), ironColor)
      for (const ry of [0.95, 1.35, 1.75]) {
        iron.add(ball(0.028, sx * (HW - 0.18), ry, sz * (HD + 0.1), 1, 1, 1, 6, 4), '#3b3f47')
        iron.add(ball(0.028, sx * (HW + 0.1), ry, sz * (HD - 0.18), 1, 1, 1, 6, 4), '#3b3f47')
      }
      // Lid corner caps.
      const ex = HW + 0.07
      const ez = HD + 0.07
      iron.add(box(0.5, slabT - 0.05, 0.05, sx * (ex - 0.22), top + 0.01 + (slabT - 0.05) / 2, sz * (ez + 0.005)), ironColor)
      iron.add(box(0.05, slabT - 0.05, 0.485, sx * (ex + 0.005), top + 0.01 + (slabT - 0.05) / 2, sz * (ez - 0.2625)), ironColor)
    }
  }

  // Skull-and-crossbones medallion on the center door.
  const mf = faceAt('front', 0, 1.16)
  const mat: At = [mf[0], mf[1], mf[2], 0, 1.15]
  brass.add(cylZ(0.44, 0.07, 0, 0, 0.05, 32), '#8a6a2a', mat)
  iron.add(torusZ(0.44, 0.045, 0, 0, 0.085, 8, 36), ironColor, mat)
  iron.add(torusZ(0.32, 0.012, 0, 0, 0.085, 6, 32), '#4a4d55', mat)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    iron.add(ball(0.03, Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0.13, 1, 1, 1, 6, 4), '#3b3f47', mat)
  }
  for (const s of [-1, 1]) {
    bone.add(put(new THREE.CylinderGeometry(0.03, 0.03, 0.66, 10), 0, 0, 0.11, [0, 0, PI / 2 + s * 0.7]), '#e3d7b8', mat)
    for (const e of [-1, 1]) {
      for (const k of [-1, 1]) {
        const a = s * 0.7
        const px = Math.cos(a) * e * 0.33 - Math.sin(a) * k * 0.035
        const py = Math.sin(a) * e * 0.33 + Math.cos(a) * k * 0.035
        bone.add(ball(0.05, px, py, 0.11, 1, 1, 1, 8, 6), '#e3d7b8', mat)
      }
    }
  }
  bone.add(ball(0.19, 0, 0.07, 0.12, 1, 0.92, 0.55, 14, 10), '#eee3c4', mat)
  bone.add(rbox(0.2, 0.1, 0.1, 0.03, 0, -0.09, 0.12), '#eee3c4', mat)
  for (const s of [-1, 1]) {
    iron.add(ball(0.055, s * 0.085, 0.06, 0.205, 1, 1.15, 0.5, 10, 8), '#0c0c0e', mat)
    iron.add(box(0.008, 0.07, 0.02, s * 0.035, -0.09, 0.175), '#2a1a0e', mat)
  }
  iron.add(ball(0.025, 0, -0.01, 0.213, 1, 1.5, 0.8, 8, 6), '#0c0c0e', mat)
  iron.add(box(0.008, 0.07, 0.02, 0, -0.09, 0.175), '#2a1a0e', mat)

  // Padlock hanging from a hasp plate on the upper strap.
  const lat = faceAt('front', 0, 1.7)
  iron.add(box(0.34, 0.4, 0.04, 0, 0.05, 0.092), ironColor, lat)
  brass.add(rbox(0.26, 0.24, 0.1, 0.04, 0, 0, 0.145), '#c9a14a', lat)
  iron.add(put(new THREE.TorusGeometry(0.075, 0.02, 8, 16, PI), 0, 0.1, 0.145), '#6b6f78', lat)
  iron.add(cylZ(0.03, 0.02, 0, 0.02, 0.195, 10), '#1a1612', lat)
  iron.add(box(0.016, 0.06, 0.02, 0, -0.03, 0.2), '#1a1612', lat)

  return {
    parts: [
      part(wood, lit({ color: WHITE, vertexColors: true, roughness: 0.88, metalness: 0 }), true),
      part(iron, lit({ color: WHITE, vertexColors: true, roughness: 0.5, metalness: 0.65 })),
      part(bone, lit({ color: '#ffffff', vertexColors: true, roughness: 0.7, metalness: 0 })),
      part(brass, lit({ color: '#ffffff', vertexColors: true, roughness: 0.35, metalness: 0.85 })),
    ],
  }
}

// --- 7. Mermaid -------------------------------------------------------------

function buildMermaid(): StandKit {
  const pastel = new Batch()
  const pearl = new Batch()
  const slabT = 0.16
  const top = H - slabT
  const shade = ramp(['#b79cff', '#9db4ff', '#86cfec', '#6fe0d8'])
  const white = new THREE.Color('#ffffff')
  /** Lavender-to-teal gradient across the width, washed lighter toward the top. */
  const paint = (lighten: number, rowTint = 0): ColorFn => (x, y) => {
    const c = shade(x / W + 0.5).lerp(white, lighten + (y / H) * 0.1)
    return rowTint ? c.offsetHSL(rowTint, 0, 0) : c
  }

  pastel.add(box(W - 0.4, 0.36, D - 0.4, 0, 0.18, 0), '#5a63a8')
  pastel.add(put(new THREE.BoxGeometry(W, top + 0.02 - 0.34, D, 48, 8, 8), 0, (0.34 + top + 0.02) / 2, 0), paint(0))
  pastel.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.06, 0, H - slabT / 2, 0, 3), '#ddd3f0')
  pearl.addAll(wrap(top - 0.012, top + 0.012, 0.012, 0.02, HW + OVER, HD + OVER), '#f1dfe9')
  pearl.addAll(wrap(0.385, 0.415, 0.09), '#f1dfe9')

  const y0 = 0.54
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const h = y1 - y0
  const shellColors = ['#ffd1e6', '#ffc2de', '#ffe3f1']
  for (const face of FACES) {
    for (const bay of bays(face)) {
      const at = faceAt(face, bay.cx, cy)
      pastel.add(put(new THREE.BoxGeometry(bay.w, h, 0.05, 12, 6, 1), 0, 0, DF - 0.025), paint(0.16), at)
      pearl.addAll(rectRing(bay.w - 0.2, h - 0.2, 0.018, DF + 0.004, 0.02), '#f1dfe9', at)
    }
  }

  // Front: seashell handles, a starfish emblem, and swags of pearls under the lid.
  const emblem = faceAt('front', 0, cy + 0.05, DF + 0.03)
  pearl.add(starGeometry(0.34, 0.04, 0.02), '#ff8fb5', emblem)
  for (let arm = 0; arm < 5; arm++) {
    const a = PI / 2 + (arm / 5) * PI * 2
    for (const r of [0.14, 0.24]) {
      pearl.add(ball(0.022, Math.cos(a) * r, Math.sin(a) * r, 0.05, 1, 1, 0.7, 8, 6), '#fff0f6', emblem)
    }
  }
  pearl.add(ball(0.04, 0, 0, 0.05, 1, 1, 0.7, 8, 6), '#ffd36b', emblem)
  for (const s of [-1, 1]) {
    const hat = faceAt('front', s * (DOOR_W + DOOR_GAP) - s * 0.95, cy - 0.2, DF + 0.03)
    shellWedges(0.3, 7, 0.03).forEach((g, i) => pearl.add(g, shellColors[i % 3], hat))
    pearl.add(ball(0.045, 0, 0, 0.02, 1, 1, 1, 8, 6), '#fff4f8', hat)
  }
  const strand = ['#f4e6ee', '#ece1f6', '#dff3ee']
  for (const i of [-1, 0, 1]) {
    const cx = i * (DOOR_W + DOOR_GAP)
    const at = faceAt('front', cx, 0)
    for (let k = 0; k <= 12; k++) {
      const u = (k / 12) * 2 - 1
      pearl.add(ball(0.05, u * (DOOR_W / 2 - 0.1), top - 0.03 - 0.26 * (1 - u * u), DF + 0.03, 1, 1, 1, 6, 4), strand[k % 3], at)
    }
  }

  // Pearl beads along the top edge.
  const px = HW + OVER - 0.1
  const pz = HD + OVER - 0.1
  for (const [len, fixed, along] of [
    [2 * px, pz, 'x'],
    [2 * px, -pz, 'x'],
    [2 * pz, px, 'z'],
    [2 * pz, -px, 'z'],
  ] as const) {
    const n = Math.round(len / 0.15)
    // Side rows skip their end beads: the front and back rows already placed the corners.
    for (let i = along === 'x' ? 0 : 1; i <= (along === 'x' ? n : n - 1); i++) {
      const p = -len / 2 + (i * len) / n
      pearl.add(
        ball(0.07, along === 'x' ? p : fixed, H + 0.02, along === 'x' ? fixed : p, 1, 1, 1, 8, 6),
        strand[i % 3],
      )
    }
  }

  // Scale-like skirt: three overlapping rows of scallops, upper rows in front.
  for (const face of FACES) {
    // Side strips stop short of the corners so they don't end on the front/back strips' faces.
    const len = faceLen(face) + (face === 'front' || face === 'back' ? 0.1 : 0.02)
    for (let row = 0; row < 3; row++) {
      const n = Math.round(len / 0.28) + (row % 2 ? -1 : 0)
      const s = len / Math.round(len / 0.28)
      pastel.add(
        scallopStrip(n * s, 0.04, n, 0.03, 0.008),
        paint(0.04 * row, row * 0.012),
        faceAt(face, 0, 0.4 - row * 0.1, 0.02 + 0.014 * (2 - row)),
      )
    }
  }

  return {
    parts: [
      part(
        pastel,
        gloss({
          color: WHITE,
          vertexColors: true,
          roughness: 0.3,
          clearcoat: 0.9,
          clearcoatRoughness: 0.1,
          iridescence: 0.3,
          iridescenceIOR: 1.35,
          iridescenceThicknessRange: [120, 380],
        }),
        true,
      ),
      part(
        pearl,
        gloss({
          color: WHITE,
          vertexColors: true,
          roughness: 0.2,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          iridescence: 0.7,
          iridescenceIOR: 1.5,
          sheen: 1,
          sheenColor: new THREE.Color('#ffd9f2'),
        }),
      ),
    ],
  }
}

// --- 8. Galaxy --------------------------------------------------------------

function buildGalaxy(): StandKit {
  const hull = new Batch()
  const glow = new Batch()
  const hazard = new Batch()
  const lampG = new Batch()
  const lampA = new Batch()
  const lampR = new Batch()
  const slabT = 0.14
  const top = H - slabT
  const plinth = 0.3
  const bodyBottom = plinth - 0.02

  hull.add(box(W - 0.3, plinth + 0.02, D - 0.3, 0, (plinth + 0.02) / 2, 0), '#12151b')
  hull.add(box(W, top + 0.02 - bodyBottom, D, 0, (top + 0.02 + bodyBottom) / 2, 0), '#161a22')
  hull.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.03, 0, H - slabT / 2, 0, 3), '#2d3340')
  glow.addAll(wrap(bodyBottom + 0.02, bodyBottom + 0.045, 0.01))
  glow.addAll(wrap(H - slabT / 2 - 0.012, H - slabT / 2 + 0.012, 0.014, 0.02, HW + OVER, HD + OVER))
  // Seams across the slab edge.
  for (const face of FACES) {
    const len = faceLen(face) + 2 * OVER
    const n = Math.round(len / 1.4)
    for (let i = 1; i < n; i++) {
      hull.add(box(0.015, slabT - 0.04, 0.02, -len / 2 + (i * len) / n, 0, OVER - 0.002), '#10131a', faceAt(face, 0, H - slabT / 2))
    }
  }

  const y0 = 0.42
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const h = y1 - y0
  for (const face of FACES) {
    bays(face).forEach((bay, i) => {
      const at = faceAt(face, bay.cx, cy)
      const center = face === 'front' && i === 1
      hull.add(rbox(bay.w, h, 0.05, 0.03, 0, 0, DF - 0.025), center ? '#323a48' : '#3c4454', at)
      hull.add(box(bay.w - 0.36, h - 0.36, 0.03, 0, 0, DF), center ? '#1e232d' : '#252b37', at)
      if (center) {
        // Glowing corner brackets instead of a full frame, so the hatch can sit in the middle.
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const bx = sx * (bay.w / 2 - 0.3)
            const by = sy * (h / 2 - 0.3)
            glow.add(box(0.18, 0.025, 0.024, bx - sx * 0.09, by, DF + 0.014), WHITE, at)
            glow.add(box(0.025, 0.155, 0.024, bx, by - sy * 0.0925, DF + 0.014), WHITE, at)
          }
        }
      } else {
        glow.addAll(rectRing(bay.w - 0.4, h - 0.4, 0.022, DF + 0.014, 0.024), WHITE, at)
        for (const sy of [-0.1, 0.12]) glow.add(box((bay.w - 0.36) * 0.55, 0.02, 0.024, 0, sy * h, DF + 0.014), WHITE, at)
      }
    })
  }

  // Front controls: indicator strips with blinking lamps on the outer bays.
  const lamps = [lampG, lampA, lampR, lampG, lampG, lampA, lampG]
  for (const s of [-1, 1]) {
    const at = faceAt('front', s * (DOOR_W + DOOR_GAP), cy + h / 2 - 0.4)
    hull.add(rbox(1.3, 0.14, 0.03, 0.01, 0, 0, DF + 0.008), '#10141b', at)
    lamps.forEach((lamp, i) => lamp.add(cylZ(0.032, 0.03, (i - 3) * 0.17, 0, DF + 0.03, 12), WHITE, at))
  }

  // Round hatch on the center door: bolted ring, glowing seam, spoked wheel and a beacon.
  const hat = faceAt('front', 0, cy)
  hull.add(cylZ(0.66, 0.07, 0, 0, DF + 0.005, 40), '#444d5c', hat)
  hull.add(torusZ(0.68, 0.05, 0, 0, DF + 0.04, 8, 40), '#5d687c', hat)
  glow.add(torusZ(0.52, 0.015, 0, 0, DF + 0.04, 6, 40), WHITE, hat)
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * PI * 2
    hull.add(cylZ(0.032, 0.03, Math.cos(a) * 0.6, Math.sin(a) * 0.6, DF + 0.045, 8), '#8892a4', hat)
  }
  hull.add(cylZ(0.1, 0.08, 0, 0, DF + 0.075, 16), '#6f7a8e', hat)
  hull.add(torusZ(0.22, 0.03, 0, 0, DF + 0.085, 8, 28), '#6f7a8e', hat)
  for (const a of [0, PI / 2]) hull.add(put(new THREE.BoxGeometry(0.44, 0.05, 0.04), 0, 0, DF + 0.085, [0, 0, a]), '#6f7a8e', hat)
  glow.add(ball(0.04, 0, 0, DF + 0.115, 1, 1, 0.8, 10, 8), WHITE, hat)
  lampR.add(cylZ(0.04, 0.06, 0, h / 2 - 0.04, DF + 0.02, 12), WHITE, hat)

  // Hazard stripes along the recessed base.
  for (const face of FACES) {
    const len = faceLen(face) - 0.3
    const at = faceAt(face, 0, 0, -0.142)
    for (let x = -len / 2 + 0.1; x + 0.29 < len / 2 - 0.1; x += 0.3) {
      const shape = new THREE.Shape([
        new THREE.Vector2(x, 0.07),
        new THREE.Vector2(x + 0.15, 0.07),
        new THREE.Vector2(x + 0.29, 0.23),
        new THREE.Vector2(x + 0.14, 0.23),
      ])
      hazard.add(new THREE.ShapeGeometry(shape), WHITE, at)
    }
  }

  const glowMat = lit({ color: '#08222a', emissive: '#38e1ff', emissiveIntensity: 1.5, roughness: 0.4 })
  const mkLamp = (color: string) => lit({ color: '#101214', emissive: color, emissiveIntensity: 0.2, roughness: 0.4 })
  const matG = mkLamp('#2bff7a')
  const matA = mkLamp('#ffb52e')
  const matR = mkLamp('#ff3b3b')
  const pool = glowPool('#38e1ff')
  const parts = [
    part(hull, lit({ color: WHITE, vertexColors: true, roughness: 0.38, metalness: 0.75 }), true),
    part(glow, glowMat),
    part(hazard, lit({ color: '#f0be2a', roughness: 0.55, metalness: 0.2 })),
    part(lampG, matG),
    part(lampA, matA),
    part(lampR, matR),
  ]
  if (pool) parts.push(pool.part)
  return {
    parts,
    update: (time, night) => {
      const boost = 1 + night * 0.4
      glowMat.emissiveIntensity = lerp(1.5, 3.4, night)
      if (pool) pool.material.emissiveIntensity = lerp(0.6, 1.2, night)
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.1)
      matG.emissiveIntensity = (0.3 + 1.9 * pulse * pulse) * boost
      matA.emissiveIntensity = ((time * 1.3) % 1 < 0.5 ? 2.4 : 0.15) * boost
      const ph = (time * 0.9) % 1
      matR.emissiveIntensity = (ph < 0.12 || (ph > 0.26 && ph < 0.38) ? 2.6 : 0.15) * boost
    },
  }
}

// --- 9. Candy ---------------------------------------------------------------

const RAINBOW = ['#ff4d4d', '#ff9f43', '#ffe14d', '#5fe08a', '#4db8ff', '#7a6bff', '#c86bff'] as const
const GUMDROPS = ['#ff4d6d', '#ff9f43', '#ffe14d', '#5fe08a', '#4db8ff', '#b36bff'] as const

function buildCandy(): StandKit {
  const candy = new Batch()
  const frosting = new Batch()
  const rand = rng(55)
  const slabT = 0.2
  const top = H - slabT
  const bodyBottom = 0.42

  candy.add(box(W - 0.8, bodyBottom + 0.04, D - 0.8, 0, (bodyBottom + 0.04) / 2, 0), '#ff5fa2')
  candy.add(rbox(W, top + 0.02 - bodyBottom, D, 0.1, 0, (bodyBottom + top + 0.02) / 2, 0, 3), '#6cc9ff')
  frosting.add(rbox(W + 2 * OVER, slabT, D + 2 * OVER, 0.09, 0, H - slabT / 2, 0, 3))

  // Gumdrop feet.
  const drop = new THREE.LatheGeometry(
    [
      [0, 0],
      [0.3, 0],
      [0.31, 0.03],
      [0.28, 0.12],
      [0.22, 0.24],
      [0.14, 0.33],
      [0.06, 0.38],
      [0, 0.4],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    20,
  )
  let n = 0
  for (const x of [-1, 0, 1]) {
    for (const z of [-1, 1]) {
      candy.add(drop.clone(), GUMDROPS[n++ % GUMDROPS.length], [x * (HW - 0.6), 0, z * (HD - 0.55), 0, 1.35])
    }
  }
  drop.dispose()

  // Rainbow doors framed in frosting, piped with beads, with lollipop handles.
  const y0 = bodyBottom + 0.16
  const y1 = top - 0.1
  const cy = (y0 + y1) / 2
  const h = y1 - y0
  const stripeColors = [RAINBOW, [...RAINBOW].reverse(), RAINBOW]
  for (const face of FACES) {
    bays(face).forEach((bay, bi) => {
      const at = faceAt(face, bay.cx, cy)
      frosting.add(rbox(bay.w, h, 0.05, 0.05, 0, 0, DF - 0.025), WHITE, at)
      const sw = (bay.w - 0.2) / 7
      for (let i = 0; i < 7; i++) {
        candy.add(rbox(sw, h - 0.2, 0.04, 0.015, -bay.w / 2 + 0.1 + (i + 0.5) * sw, 0, DF + 0.01, 1), stripeColors[bi % 3][i], at)
      }
      const rw = bay.w - 0.12
      const rh = h - 0.12
      const per = 2 * (rw + rh)
      const beads = Math.round(per / 0.12)
      const along = (d: number): [number, number] => {
        if (d < rw) return [-rw / 2 + d, rh / 2]
        if (d < rw + rh) return [rw / 2, rh / 2 - (d - rw)]
        if (d < 2 * rw + rh) return [rw / 2 - (d - rw - rh), -rh / 2]
        return [-rw / 2, -rh / 2 + (d - 2 * rw - rh)]
      }
      for (let k = 0; k < beads; k++) {
        const [bx, by] = along((k / beads) * per)
        frosting.add(ball(0.04, bx, by, DF, 1, 1, 1, 6, 4), WHITE, at)
      }
    })
  }
  const swirl = spiralGeometry(0.2, 3, 0.03, 0.016)
  const swirlColors = ['#ff3d8b', '#2d9bff', '#2fcf6b']
  for (const [k, i] of [-1, 0, 1].entries()) {
    const at = faceAt('front', i * (DOOR_W + DOOR_GAP) + (i === -1 ? 0.95 : -0.95), cy)
    frosting.add(cylY(0.026, 0.026, 0.7, 10, 0, -0.05, DF + 0.09), WHITE, at)
    frosting.add(cylZ(0.22, 0.05, 0, 0.3, DF + 0.09, 28), WHITE, at)
    candy.add(swirl.clone(), swirlColors[k], [at[0], at[1] + 0.3, at[2] + DF + 0.09 + 0.021, 0])
    for (const py of [-0.32, 0.02]) frosting.add(cylZ(0.032, 0.1, 0, py, DF + 0.045, 10), WHITE, at)
  }
  swirl.dispose()

  // Frosting drips hanging from the lid on every side.
  for (const face of FACES) {
    const len = faceLen(face) + 2 * OVER
    const count = Math.round(len / 0.32)
    for (let i = 0; i < count; i++) {
      const r = 0.05 + rand() * 0.035
      const l = 0.1 + rand() * 0.28
      const x = -len / 2 + (i + 0.5 + (rand() - 0.5) * 0.5) * (len / count)
      frosting.add(
        put(new THREE.CapsuleGeometry(r, l, 2, 7), x, -l / 2 - r * 0.2, 0.03),
        WHITE,
        faceAt(face, 0, top + 0.02, 0.04),
      )
    }
  }

  // Sprinkles on the visible ring of the lid.
  const px = HW + OVER
  const pz = HD + OVER
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(rand() * 4)
    let x: number
    let z: number
    if (side < 2) {
      x = (rand() * 2 - 1) * (px - 0.05)
      z = (side ? -1 : 1) * (pz - 0.04 - rand() * 0.11)
    } else {
      x = (side === 2 ? -1 : 1) * (px - 0.04 - rand() * 0.14)
      z = (rand() * 2 - 1) * (pz - 0.05)
    }
    candy.add(put(new THREE.CapsuleGeometry(0.014, 0.07, 1, 5), x, H, z, [PI / 2, 0, rand() * PI]), pick(rand, RAINBOW))
  }

  return {
    parts: [
      part(candy, gloss({ color: WHITE, vertexColors: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })),
      part(frosting, lit({ color: '#f1e6ee', roughness: 0.5, metalness: 0 }), true),
    ],
  }
}

// --- Public component -------------------------------------------------------

const BUILDERS: Record<StandStyle, () => StandKit> = {
  walnut: buildWalnut,
  arctic: buildArctic,
  bubblegum: buildBubblegum,
  racer: buildRacer,
  bamboo: buildBamboo,
  pirate: buildPirate,
  mermaid: buildMermaid,
  galaxy: buildGalaxy,
  candy: buildCandy,
}

const kits = new Map<StandStyle, StandKit>()

/** Builds (once) and returns the shared geometry/materials for a stand style; unknown ids fall back to walnut. */
function getStandKit(standId: string): StandKit {
  const style: StandStyle = Object.hasOwn(BUILDERS, standId) ? (standId as StandStyle) : 'walnut'
  let kit = kits.get(style)
  if (!kit) {
    kit = BUILDERS[style]()
    kits.set(style, kit)
  }
  return kit
}

/** The cabinet the tank sits on, in one of the catalog styles. Geometry and materials are shared and never disposed. */
export function StandVisual({ standId }: { standId: string }) {
  const kit = getStandKit(standId)
  useFrame(({ clock }) => {
    kit.update?.(clock.elapsedTime, atmosphere.night)
  })
  return (
    <group position={[0, ROOM_FLOOR_Y, 0]} dispose={null}>
      {kit.parts.map((p, i) => (
        <mesh key={`${standId}:${i}`} geometry={p.geometry} material={p.material} receiveShadow={p.receiveShadow} />
      ))}
    </group>
  )
}
