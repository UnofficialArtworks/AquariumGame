import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MeshBuilder, type BuiltPart, type V3 } from '../../geometry/MeshBuilder'
import { latheFrom, noiseRock, taperedTube } from '../../geometry/shapes'
import { fbm3, noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { hashString, mulberry32 } from '../../../utils/rng'
import { bricks, mossy, rr, smoothstep, type ColorFn, type Rand, type StaticBuilder } from './common'
import type { DecorationCatalogEntry } from '../decorationDefinitions'

const UP = new THREE.Vector3(0, 1, 0)

/** Euler rotation that turns +Y toward `dir` (tufts, twigs, leaning coins). */
function aimY(dir: THREE.Vector3): V3 {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())
  const e = new THREE.Euler().setFromQuaternion(q)
  return [e.x, e.y, e.z]
}

const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]

/**
 * Lathe with smooth seams that can be sculpted: merged, displaced, re-lit.
 * The profile must run bottom-to-top, outside-to-axis, so faces point outward.
 */
function sculptLathe(profile: Array<[number, number]>, segments: number, displace: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = latheFrom(profile, segments)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    displace(v)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Horizontal ring (torus lying flat) at the origin, for belts, rails and rims. */
function ring(radius: number, tube: number, segments = 32): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, 8, segments)
  g.rotateX(Math.PI / 2)
  return g
}

// --- marimo moss balls ---------------------------------------------------------------

export interface MarimoBall {
  r: number
  p: V3
  seed: number
}

/** Ball sizes and resting spots, shared by the pebble bed and the rocking balls in GadgetFx. */
export const MARIMO_BALLS: MarimoBall[] = [
  { r: 0.15, p: [-0.04, 0.135, 0.03], seed: 1.3 },
  { r: 0.115, p: [0.17, 0.105, 0.09], seed: 4.7 },
  { r: 0.095, p: [0.0, 0.085, -0.17], seed: 8.1 },
  { r: 0.075, p: [-0.2, 0.065, -0.07], seed: 11.9 },
]

/** Radial moss relief for a unit direction: soft lumps, clumps, then fine fibres. */
function mossRelief(x: number, y: number, z: number, seed: number): number {
  const lump = fbm3(x * 1.8 + seed, y * 1.8, z * 1.8 - seed, 3)
  const clump = noise3(x * 6.5 + seed * 0.7, y * 6.5 - seed, z * 6.5)
  const fiber = noise3(x * 17 - seed, y * 17 + seed * 0.4, z * 17)
  return lump * 0.1 + clump * 0.04 + fiber * 0.022
}

function mossBallGeometry(radius: number, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, radius > 0.1 ? 12 : 10)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    v.multiplyScalar(radius * (1 + mossRelief(v.x, v.y, v.z, seed)))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** One fuzzy moss ball centred on its own origin (so it can rock in place), with hair tufts. */
export function buildMarimoBall(def: DecorationCatalogEntry, index: number): BuiltPart[] {
  const ball = MARIMO_BALLS[index]
  const rand = mulberry32(hashString(def.id) + index * 977)
  const b = new MeshBuilder()
  const deep = new THREE.Color(shade(def.color, -0.14))
  const mid = new THREE.Color(def.color).offsetHSL((index - 1.5) * 0.012, 0, 0)
  const light = new THREE.Color(def.accentColor)
  const dir = new THREE.Vector3()
  const mossColor: ColorFn = (p, n, c) => {
    dir.copy(p).normalize()
    const t = smoothstep(-0.06, 0.07, mossRelief(dir.x, dir.y, dir.z, ball.seed))
    c.copy(deep).lerp(mid, smoothstep(0, 0.55, t)).lerp(light, smoothstep(0.35, 1, t) * 0.85)
    c.multiplyScalar(0.9 + noise3(p.x * 55, p.y * 55, p.z * 55) * 0.12)
    const ground = 0.5 + 0.5 * smoothstep(-0.02, 0.14, p.y + ball.p[1])
    c.multiplyScalar(ground * (n.y < 0 ? 0.85 : 1))
  }
  b.add('matte', mossBallGeometry(ball.r, ball.seed), { color: def.color, colorFn: mossColor })

  // Tiny hair-like tufts sticking out of the fuzz.
  const tufts = Math.round(ball.r * ball.r * 1800)
  const d = new THREE.Vector3()
  for (let i = 0; i < tufts; i++) {
    const z = rand() * 2 - 1
    const a = rand() * Math.PI * 2
    const s = Math.sqrt(1 - z * z)
    d.set(s * Math.cos(a), z, s * Math.sin(a))
    const surface = ball.r * (1 + mossRelief(d.x, d.y, d.z, ball.seed))
    if (d.y * surface + ball.p[1] < 0.03) continue
    const len = rr(rand, 0.02, 0.04)
    const tuft = new THREE.ConeGeometry(0.0045, len, 3, 1, true)
    tuft.translate(0, len / 2, 0)
    const lean = d.clone().add(new THREE.Vector3(rr(rand, -0.3, 0.3), rr(rand, -0.3, 0.3), rr(rand, -0.3, 0.3)))
    b.add('matte', tuft, {
      color: mid,
      colorTop: light,
      position: [d.x * (surface - 0.006), d.y * (surface - 0.006), d.z * (surface - 0.006)],
      rotation: aimY(lean),
    })
  }
  return b.build({ groundAO: false })
}

/** Pebble bed the moss balls nestle into (the balls themselves are animated, see MarimoFx). */
export const buildMarimo: StaticBuilder = (_def, rand) => {
  const b = new MeshBuilder()
  const tones = ['#9a948a', '#b8a98a', '#7f8a86', '#c9bfa8', '#8d8478', '#a69a7e']
  const pebbles: Array<[number, number, number]> = [
    [-0.14, 0.15, 0.05],
    [0.06, 0.16, 0.05],
    [0.28, 0.0, 0.05],
    [0.2, 0.22, 0.045],
    [0.09, -0.06, 0.04],
    [-0.1, -0.2, 0.045],
    [0.14, -0.2, 0.04],
    [-0.27, 0.04, 0.045],
    [-0.26, -0.18, 0.04],
    [-0.05, 0.26, 0.035],
    [0.3, 0.14, 0.035],
    [-0.02, -0.3, 0.035],
  ]
  pebbles.forEach(([x, z, r], i) => {
    b.add('satin', noiseRock(r, i * 2.7 + 1, 0.22, 3), {
      color: tones[i % tones.length],
      position: [x, r * 0.3, z],
      rotation: [0, rand() * 6, 0],
      scale: [1.12, 0.72, 1],
      mottle: 0.14,
    })
  })
  return b.build({ aoHeight: 0.08 })
}

// --- auto-feeder lighthouse -------------------------------------------------------------

/** Local position of the lantern top, where the simulation spawns pellets. */
export const FEEDER_SPOUT: [number, number, number] = [0, 1.36, 0]
/** Where the dome cap's own origin sits (the cap hops up from here). */
export const FEEDER_CAP_BASE_Y = 1.15
/** Centre of the lantern room, where the lamp, lens and beams live. */
export const FEEDER_LAMP: V3 = [0, 1.07, 0]
export const FEEDER_LANTERN_RADIUS = 0.1

const TOWER_Y0 = 0.13
const TOWER_Y1 = 0.93
const TOWER_R0 = 0.172
const TOWER_R1 = 0.115
const towerRadius = (y: number) => TOWER_R0 + (TOWER_R1 - TOWER_R0) * ((y - TOWER_Y0) / (TOWER_Y1 - TOWER_Y0))

export const buildFeeder: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const white = def.color
  const red = def.accentColor
  const charcoal = '#343a44'
  const warm = '#ffcf6b'

  // Rock island with moss, and a ring of boulders hugging the foundation.
  b.add('matte', noiseRock(0.3, 3.7, 0.2, 4), {
    color: '#7d7a73',
    position: [0, 0.02, 0],
    scale: [1.15, 0.3, 1.1],
    colorFn: mossy('#7d7a73', '#5b8f3d', 0.85, 7),
  })
  const boulders: Array<[number, number]> = [
    [0.95, 0.1],
    [1.9, 0.085],
    [2.8, 0.11],
    [3.7, 0.09],
    [4.6, 0.1],
    [5.5, 0.08],
  ]
  const rockTones = ['#7d7a73', '#8a857d', '#6f6e6a']
  boulders.forEach(([a, size], i) => {
    const tone = rockTones[i % 3]
    b.add('matte', noiseRock(size, i * 1.9 + 2, 0.3, 3), {
      color: tone,
      position: [Math.sin(a) * 0.27, size * 0.35, Math.cos(a) * 0.27],
      scale: [1.15, 0.7, 1],
      colorFn: mossy(tone, '#5b8f3d', 0.8, 8),
    })
  })

  // Stone foundation and the front doorstep.
  b.add('matte', new THREE.CylinderGeometry(0.2, 0.225, 0.13, 28, 2), {
    color: '#bdb7ab',
    position: [0, 0.065, 0],
    colorFn: bricks('#bdb7ab', '#5f8a3a', 0.05, 0.1),
  })
  b.add('matte', new THREE.BoxGeometry(0.13, 0.105, 0.07), { color: '#a8a296', position: [0, 0.1025, 0.2], mottle: 0.1 })

  // Striped tower: one frustum per band so the stripe edges stay razor sharp.
  const bandH = (TOWER_Y1 - TOWER_Y0) / 5
  for (let i = 0; i < 5; i++) {
    const y0 = TOWER_Y0 + bandH * i
    const y1 = y0 + bandH
    const color = i % 2 === 0 ? white : red
    b.add('satin', new THREE.CylinderGeometry(towerRadius(y1), towerRadius(y0), bandH, 36, 1, true), {
      color,
      colorTop: shade(color, 0.04),
      position: [0, (y0 + y1) / 2, 0],
      mottle: 0.05,
    })
    if (i > 0) b.add('satin', ring(towerRadius(y0) + 0.002, 0.009, 36), { color: shade(white, -0.12), position: [0, y0, 0] })
  }

  // Arched wooden door in a stone frame, and a spiral of lit windows.
  b.add('matte', new RoundedBoxGeometry(0.09, 0.14, 0.026, 3, 0.044), { color: '#9a9488', position: [0, 0.185, 0.17], mottle: 0.1 })
  b.add('matte', new RoundedBoxGeometry(0.066, 0.12, 0.03, 3, 0.033), { color: '#6b4528', position: [0, 0.18, 0.175], mottle: 0.12 })
  b.add('metal', new THREE.SphereGeometry(0.008, 8, 6), { color: '#e6c25a', position: [0.02, 0.17, 0.192] })
  for (let i = 0; i < 4; i++) {
    const y = 0.37 + i * 0.16
    const a = 0.8 + i * 1.57
    const r = towerRadius(y)
    b.add('satin', new RoundedBoxGeometry(0.058, 0.09, 0.03, 2, 0.012), {
      color: charcoal,
      position: [Math.sin(a) * r, y, Math.cos(a) * r],
      rotation: [0, a, 0],
    })
    b.add('lamp', new THREE.BoxGeometry(0.038, 0.066, 0.012), {
      color: warm,
      position: [Math.sin(a) * (r + 0.015), y, Math.cos(a) * (r + 0.015)],
      rotation: [0, a, 0],
    })
  }

  // Life ring hung against the tower.
  {
    const a = -0.75
    const r = towerRadius(0.19) + 0.018
    const center = new THREE.Vector3(Math.sin(a) * r, 0.186, Math.cos(a) * r)
    const tangent = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a))
    const redC = new THREE.Color(red)
    const whiteC = new THREE.Color(white)
    b.add('satin', new THREE.TorusGeometry(0.04, 0.014, 10, 28), {
      color: white,
      position: v3(center),
      rotation: [0, a, 0],
      colorFn: (p, _n, c) => {
        const dx = p.x - center.x
        const dy = p.y - center.y
        const dz = p.z - center.z
        const ang = Math.atan2(dy, dx * tangent.x + dz * tangent.z)
        c.copy(Math.floor((ang + Math.PI) / (Math.PI / 2)) % 2 ? whiteC : redC)
      },
    })
  }

  // Gallery: flared corbel, deck, and a red railing.
  b.add('satin', new THREE.CylinderGeometry(0.2, 0.125, 0.05, 32), { color: charcoal, position: [0, 0.925, 0] })
  b.add('satin', new THREE.CylinderGeometry(0.205, 0.205, 0.025, 36), { color: shade(charcoal, 0.04), position: [0, 0.9625, 0] })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    b.add('satin', new THREE.CylinderGeometry(0.0055, 0.0055, 0.085, 6), {
      color: red,
      position: [Math.sin(a) * 0.188, 1.0175, Math.cos(a) * 0.188],
    })
  }
  b.add('satin', ring(0.188, 0.01, 40), { color: red, position: [0, 1.06, 0] })
  b.add('satin', ring(0.188, 0.005, 40), { color: red, position: [0, 1.02, 0] })

  // Lantern room: pedestal, eight mullions, a bright lamp and a top ring.
  b.add('satin', new THREE.CylinderGeometry(0.112, 0.118, 0.03, 24), { color: charcoal, position: [0, 0.99, 0] })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    b.add('satin', new THREE.CylinderGeometry(0.008, 0.008, 0.133, 6), {
      color: charcoal,
      position: [Math.sin(a) * FEEDER_LANTERN_RADIUS, 1.0715, Math.cos(a) * FEEDER_LANTERN_RADIUS],
    })
  }
  b.add('satin', ring(FEEDER_LANTERN_RADIUS, 0.012, 24), { color: charcoal, position: [0, 1.138, 0] })
  b.add('lamp', new THREE.SphereGeometry(0.032, 16, 12), { color: '#fff1b0', position: FEEDER_LAMP })
  b.add('lamp', new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), { color: warm, position: FEEDER_LAMP })
  return b.build({ aoHeight: 0.22 })
}

/** The lantern's dome cap in its own frame (origin at its base) so it can hop when pellets pop out. */
export const buildFeederCap: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const profile: Array<[number, number]> = [
    [0.0001, 0],
    [0.128, 0],
    [0.131, 0.008],
    [0.12, 0.02],
    [0.105, 0.034],
    [0.093, 0.058],
    [0.073, 0.085],
    [0.05, 0.106],
    [0.03, 0.12],
    [0.022, 0.13],
    [0.0001, 0.134],
  ]
  const dome = sculptLathe(profile, 32, (v) => {
    // Eight soft ribs running up the dome.
    const rib = 1 + Math.cos(Math.atan2(v.x, v.z) * 8) * 0.03 * smoothstep(0.02, 0.05, v.y) * (1 - smoothstep(0.1, 0.13, v.y))
    v.x *= rib
    v.z *= rib
  })
  b.add('glossy', dome, { color: def.accentColor, colorTop: shade(def.accentColor, 0.14), mottle: 0.04 })
  b.add('satin', ring(0.129, 0.007, 36), { color: shade(def.color, -0.08), position: [0, 0.006, 0] })
  b.add('metal', new THREE.CylinderGeometry(0.014, 0.018, 0.03, 12), { color: '#c9a64a', position: [0, 0.14, 0] })
  b.add('metal', new THREE.SphereGeometry(0.03, 16, 12), { color: '#e6c25a', position: [0, 0.172, 0] })
  return b.build({ groundAO: false })
}

// --- bubble filter tower --------------------------------------------------------------------

/** How much taller the window section is than its first sketch: everything above it rides up by this. */
const FILTER_RISE = 0.07

export const FILTER = {
  /** The clear window: a glass tube between two plates. */
  glassRadius: 0.192,
  glassY0: 0.61,
  glassY1: 1.13 + FILTER_RISE,
  /** Heights of the two spinning impellers. */
  impellers: [0.82, 1.04] as const,
  /** Status LED on the head's front panel. */
  led: [-0.04, 1.215 + FILTER_RISE, 0.247] as V3,
  /** The outlet bubbles stream out of. */
  outlet: [0, 1.53 + FILTER_RISE, 0] as V3,
}

export const buildFilter: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const steel = def.color
  const dark = shade(steel, -0.2)
  const light = shade(steel, 0.14)
  const cyan = def.accentColor
  const octa = -Math.PI / 8

  // Octagonal base with intake grilles on every face.
  b.add('satin', new THREE.CylinderGeometry(0.31, 0.31, 0.06, 8), { color: shade(steel, -0.32), position: [0, 0.02, 0], rotation: [0, octa, 0] })
  b.add('satin', new THREE.CylinderGeometry(0.29, 0.29, 0.19, 8), { color: dark, colorTop: shade(dark, 0.05), position: [0, 0.145, 0], rotation: [0, octa, 0] })
  b.add('satin', new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), { color: shade(steel, 0.04), position: [0, 0.265, 0], rotation: [0, octa, 0] })
  const apothem = 0.29 * Math.cos(Math.PI / 8)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const place = (radial: number, y: number): V3 => [Math.sin(a) * radial, y, Math.cos(a) * radial]
    b.add('satin', new THREE.BoxGeometry(0.15, 0.1, 0.012), { color: '#14202a', position: place(apothem + 0.003, 0.145), rotation: [0, a, 0] })
    for (let s = -2; s <= 2; s++) {
      b.add('metal', new THREE.BoxGeometry(0.13, 0.008, 0.01), { color: light, position: place(apothem + 0.008, 0.145 + s * 0.02), rotation: [0, a, 0] })
    }
  }

  // Lower body with glowing light strips and a little pressure gauge.
  b.add('satin', new THREE.CylinderGeometry(0.205, 0.215, 0.29, 36), { color: steel, colorTop: light, position: [0, 0.435, 0], mottle: 0.04 })
  b.add('metal', ring(0.215, 0.011, 36), { color: light, position: [0, 0.29, 0] })
  b.add('metal', ring(0.207, 0.011, 36), { color: light, position: [0, 0.58, 0] })
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    b.add('glow', new THREE.BoxGeometry(0.016, 0.2, 0.014), { color: cyan, position: [Math.sin(a) * 0.214, 0.435, Math.cos(a) * 0.214], rotation: [0, a, 0] })
  }
  const gaugeFace = new THREE.CylinderGeometry(0.04, 0.04, 0.012, 24)
  gaugeFace.rotateX(Math.PI / 2)
  b.add('glossy', gaugeFace, { color: '#f4f7fa', position: [0, 0.43, 0.2115] })
  b.add('metal', new THREE.TorusGeometry(0.042, 0.008, 8, 28), { color: '#c9a64a', position: [0, 0.43, 0.215] })
  b.add('satin', new THREE.BoxGeometry(0.005, 0.03, 0.004), { color: '#e0443c', position: [0.008, 0.438, 0.2195], rotation: [0, 0, -0.5] })
  b.add('satin', new THREE.SphereGeometry(0.006, 8, 6), { color: '#3a4350', position: [0, 0.43, 0.2205] })

  // Window section: plates, struts, shaft and a bed of filter media. The glass is added by FilterFx.
  b.add('satin', new THREE.CylinderGeometry(0.22, 0.22, 0.03, 36), { color: light, position: [0, 0.595, 0] })
  b.add('satin', new THREE.CylinderGeometry(0.22, 0.22, 0.03, 36), { color: light, position: [0, 1.145 + FILTER_RISE, 0] })
  b.add('glow', ring(0.221, 0.006, 36), { color: cyan, position: [0, 0.595, 0] })
  b.add('glow', ring(0.221, 0.006, 36), { color: cyan, position: [0, 1.145 + FILTER_RISE, 0] })
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    b.add('satin', new THREE.CylinderGeometry(0.012, 0.012, 0.52 + FILTER_RISE, 8), { color: shade(steel, 0.02), position: [Math.sin(a) * 0.2, 0.87 + FILTER_RISE / 2, Math.cos(a) * 0.2] })
  }
  b.add('metal', new THREE.CylinderGeometry(0.016, 0.016, 0.52 + FILTER_RISE, 10), { color: '#b9c6d2', position: [0, 0.87 + FILTER_RISE / 2, 0] })
  const mediaTones = [new THREE.Color('#1f3342'), new THREE.Color('#5fd6e6'), new THREE.Color('#e8f7ff'), new THREE.Color('#ffb27a')]
  b.add('matte', new THREE.CylinderGeometry(0.178, 0.178, 0.09, 24), {
    color: '#1f3342',
    position: [0, 0.655, 0],
    colorFn: (p, _n, c) => {
      const s = noise3(p.x * 70, p.y * 70, p.z * 70)
      const k = s > 0.42 ? 2 : s > 0.3 ? 1 : s < -0.45 ? 3 : 0
      c.copy(mediaTones[k]).multiplyScalar(k === 0 ? 0.85 + s * 0.3 : 0.9)
    },
  })
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2
    const d = 0.03 + Math.sqrt(rand()) * 0.13
    const tone = i % 3 === 0 ? '#e8f7ff' : i % 3 === 1 ? '#5fd6e6' : '#35566b'
    b.add('satin', new THREE.SphereGeometry(rr(rand, 0.016, 0.024), 10, 8), { color: tone, position: [Math.sin(a) * d, 0.7 + rand() * 0.012, Math.cos(a) * d] })
  }

  // Head: shoulder dome, seam ring, status panel and the outlet spout.
  const head = latheFrom(
    [
      [0.0001, 0],
      [0.222, 0],
      [0.225, 0.004],
      [0.225, 0.1],
      [0.215, 0.14],
      [0.19, 0.18],
      [0.15, 0.215],
      [0.105, 0.24],
      [0.08, 0.255],
      [0.075, 0.262],
      [0.0001, 0.262],
    ],
    40,
  )
  b.add('satin', head, { color: steel, colorTop: light, position: [0, 1.16 + FILTER_RISE, 0], mottle: 0.04 })
  b.add('metal', ring(0.226, 0.008, 40), { color: light, position: [0, 1.26 + FILTER_RISE, 0] })
  b.add('glow', ring(0.1, 0.0045, 32), { color: cyan, position: [0, 1.4035 + FILTER_RISE, 0] })
  b.add('metal', new THREE.CylinderGeometry(0.052, 0.058, 0.09, 20), { color: '#aeb9c4', position: [0, 1.455 + FILTER_RISE, 0] })
  b.add('metal', ring(0.06, 0.014, 24), { color: '#c4cfd9', position: [0, 1.5 + FILTER_RISE, 0] })
  const mouth = new THREE.CircleGeometry(0.047, 24)
  mouth.rotateX(-Math.PI / 2)
  b.add('satin', mouth, { color: '#0c1c26', position: [0, 1.506 + FILTER_RISE, 0] })
  b.add('glow', ring(0.04, 0.005, 24), { color: cyan, position: [0, 1.507 + FILTER_RISE, 0] })
  b.add('glossy', new RoundedBoxGeometry(0.15, 0.062, 0.03, 3, 0.012), { color: '#17232e', position: [0, 1.215 + FILTER_RISE, 0.225] })
  const bars: Array<[number, number]> = [
    [0.016, 0.02],
    [0.036, 0.03],
    [0.056, 0.04],
  ]
  for (const [x, h] of bars) b.add('glow', new THREE.BoxGeometry(0.01, h, 0.006), { color: cyan, position: [x, 1.196 + FILTER_RISE + h / 2, 0.242] })
  return b.build({ aoHeight: 0.25 })
}

// --- sunstone coral ----------------------------------------------------------------------------

export const GROW_ORB: V3 = [0, 0.4, 0]
export const GROW_ORB_RADIUS = 0.125

/** Recursive branching sprig, capped with a rounded amber bud. */
function sprig(b: MeshBuilder, rand: Rand, start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number, color: ColorFn, tip: string) {
  const end = start.clone().addScaledVector(dir, length)
  const mid = start.clone().addScaledVector(dir, length * 0.5).add(new THREE.Vector3(rr(rand, -0.014, 0.014), 0, rr(rand, -0.014, 0.014)))
  b.add('satin', taperedTube([v3(start), v3(mid), v3(end)], radius, radius * 0.72, 6, 7, true), { color: '#ff9a3c', colorFn: color })
  if (depth === 0) {
    b.add('glow', new THREE.SphereGeometry(radius * 0.72 * 1.15, 8, 6), { color: tip, position: v3(end) })
    return
  }
  const children = rand() < 0.4 ? 3 : 2
  for (let i = 0; i < children; i++) {
    const axis = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize()
    const next = dir.clone().applyAxisAngle(axis, rr(rand, 0.4, 0.8))
    next.y += 0.35
    next.normalize()
    sprig(b, rand, end, next, length * rr(rand, 0.74, 0.86), radius * 0.72, depth - 1, color, tip)
  }
}

export const buildGrowLamp: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const orb = new THREE.Vector3(...GROW_ORB)
  const deep = new THREE.Color(def.color).offsetHSL(-0.025, 0.05, -0.13)
  const mid = new THREE.Color(def.color)
  const tip = new THREE.Color('#ffc35a')
  const warm = new THREE.Color(def.accentColor)
  const peach = shade(def.color, 0.07)
  const coral: ColorFn = (p, _n, c) => {
    const t = smoothstep(0, 0.95, p.y)
    c.copy(deep).lerp(mid, smoothstep(0, 0.45, t)).lerp(tip, smoothstep(0.6, 1, t) * 0.45)
    // The orb lights the coral nearest to it.
    const lit = smoothstep(0.3, 0.14, p.distanceTo(orb))
    c.lerp(warm, lit * 0.3).multiplyScalar(1 + lit * 0.12)
    c.multiplyScalar(0.9 + noise3(p.x * 30, p.y * 30, p.z * 30) * 0.2)
  }

  // Encrusted base
  b.add('matte', noiseRock(0.22, 5.1, 0.3, 3), {
    color: '#5a4338',
    position: [0, 0.0, 0],
    scale: [1.4, 0.3, 1.3],
    colorFn: (p, _n, c) => {
      const crust = smoothstep(-0.1, 0.4, noise3(p.x * 9, p.y * 9, p.z * 9))
      c.set('#503c33').lerp(deep, crust * 0.8).multiplyScalar(0.85 + noise3(p.x * 30, p.y * 30, p.z * 30) * 0.2)
    },
  })

  // Thick stalk that flares into a cup, which holds the orb.
  b.add('satin', taperedTube([[0, -0.03, 0], [0.012, 0.1, 0.006], [0, 0.23, 0]], 0.1, 0.065, 12, 14, false), { color: '#ff9a3c', colorFn: coral })
  b.add(
    'satin',
    latheFrom(
      [
        [0.0001, 0.2],
        [0.07, 0.205],
        [0.11, 0.25],
        [0.125, 0.31],
        [0.12, 0.335],
        [0.105, 0.33],
        [0.085, 0.28],
        [0.0001, 0.265],
      ],
      28,
    ),
    { color: '#ff9a3c', colorFn: coral },
  )

  // Six branches rise from the cup around the orb and fork into antlers above it.
  const N = 6
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2 + rr(rand, -0.15, 0.15)
    const s = rr(rand, 0.94, 1.05)
    const twist = rr(rand, 0.2, 0.4) * (k % 2 ? 1 : -1)
    const profile: Array<[number, number]> = [
      [0.12, 0.29],
      [0.19, 0.4],
      [0.225, 0.54],
      [0.235, 0.65],
      [0.225, rr(rand, 0.74, 0.8)],
    ]
    const points = profile.map(([r, y], i): V3 => {
      const ang = a + (twist * i) / (profile.length - 1)
      return [Math.sin(ang) * r * s, y, Math.cos(ang) * r * s]
    })
    const r0 = 0.05
    const r1 = 0.03
    b.add('satin', taperedTube(points, r0, r1, 18, 8, false), { color: '#ff9a3c', colorFn: coral })
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    const end = curve.getPointAt(1)
    const tangent = curve.getTangentAt(1)
    const radial = new THREE.Vector3(end.x, 0, end.z).normalize()
    const side = new THREE.Vector3().crossVectors(tangent, radial).normalize()
    const forks: Array<[number, number, number]> = [
      [0.7, 0, 0.13],
      [0.1, 0.75, 0.11],
      [0.1, -0.75, 0.11],
    ]
    for (const [out, sw, len] of forks) {
      const dir = tangent.clone().addScaledVector(radial, out).addScaledVector(side, sw)
      dir.y += 0.3
      dir.normalize()
      sprig(b, rand, end, dir, len, r1 * 0.95, 1, coral, '#ffb347')
    }
    // Soft polyp bumps along the stem.
    for (let i = 0; i < 5; i++) {
      const t = 0.1 + i * 0.19 + rand() * 0.05
      const p = curve.getPointAt(t)
      const out = new THREE.Vector3(p.x, 0, p.z).normalize()
      const tubeR = THREE.MathUtils.lerp(r0, r1, t)
      const sideways = new THREE.Vector3().crossVectors(curve.getTangentAt(t), out).multiplyScalar(i % 2 ? 1 : -1)
      const at = p.clone().addScaledVector(out, tubeR * 0.85).addScaledVector(sideways, tubeR * 0.3)
      b.add('satin', new THREE.SphereGeometry(tubeR * 0.42, 8, 6), { color: peach, position: v3(at) })
    }
  }

  // Shorter outer branches round the foot fill out the silhouette.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3 + rand() * 0.25
    const start = new THREE.Vector3(Math.sin(a) * 0.15, -0.01, Math.cos(a) * 0.15)
    const dir = new THREE.Vector3(Math.sin(a) * 0.4, 0.85, Math.cos(a) * 0.4).normalize()
    sprig(b, rand, start, dir, rr(rand, 0.12, 0.16), 0.04, 2, coral, '#ffb347')
  }
  return b.build({ aoHeight: 0.2 })
}

// --- lucky coin fountain --------------------------------------------------------------------------

const FOUNTAIN_FISH_BASE = 0.7
const FOUNTAIN_FISH_LENGTH = 0.25

/** Sideways bend of the leaping fish's spine at height `y` above the statue base. */
function fishBend(y: number): number {
  const u = y / FOUNTAIN_FISH_LENGTH
  return 0.035 * u * u - 0.012 * Math.sin(u * Math.PI * 2)
}

/** The fish's nose, where the spray ring spins. */
export const FOUNTAIN_SPOUT: V3 = [fishBend(FOUNTAIN_FISH_LENGTH), FOUNTAIN_FISH_BASE + FOUNTAIN_FISH_LENGTH - 0.01, 0]
export const FOUNTAIN_WATER_Y = 0.668
export const FOUNTAIN_UPPER_RIM: V3 = [0.268, 0.708, 0]
export const FOUNTAIN_LOWER_Y = 0.13

/** Fin shape in the XY plane, bent to follow the spine. */
function finGeometry(shape: THREE.Shape): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 10)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + fishBend(pos.getY(i)))
  g.computeVertexNormals()
  return g
}

export const buildFountain: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const rich = (lightness: number) => '#' + new THREE.Color(def.color).offsetHSL(0, 0.2, lightness).getHexString()
  const gold = rich(-0.03)
  const goldDeep = rich(-0.17)
  const goldLight = rich(0.1)
  const enamel = new THREE.Color('#3fc2d6')
  const goldDeepC = new THREE.Color(goldDeep)
  const goldLightC = new THREE.Color(goldLight)
  const scallop = (v: THREE.Vector3, lift: number, amount: number) => {
    const f = 1 + Math.cos(Math.atan2(v.x, v.z) * 14) * amount * smoothstep(lift, lift + 0.05, v.y)
    v.x *= f
    v.z *= f
  }

  // Cream marble plinth.
  b.add('satin', new THREE.CylinderGeometry(0.47, 0.495, 0.09, 40), { color: '#efe6d0', colorTop: '#fbf5e6', position: [0, 0.025, 0], mottle: 0.06 })

  // Lower basin: gold shell with a turquoise enamel floor.
  const lower = sculptLathe(
    [
      [0.0001, 0.05],
      [0.26, 0.05],
      [0.3, 0.06],
      [0.37, 0.1],
      [0.43, 0.16],
      [0.465, 0.21],
      [0.47, 0.225],
      [0.46, 0.235],
      [0.445, 0.235],
      [0.435, 0.222],
      [0.41, 0.17],
      [0.36, 0.13],
      [0.3, 0.118],
      [0.0001, 0.115],
    ],
    56,
    (v) => scallop(v, 0.17, 0.02),
  )
  b.add('glossy', lower, {
    color: gold,
    colorFn: (p, n, c) => {
      const band = Math.abs(p.y - 0.15) < 0.007 && n.y < 0.2 ? 0.8 : 1
      c.copy(goldDeepC).lerp(goldLightC, smoothstep(0.05, 0.24, p.y)).multiplyScalar(band)
      if (n.y > 0.12 && p.y < 0.19) c.lerp(enamel, smoothstep(0.19, 0.14, p.y) * 0.9)
    },
  })
  b.add('metal', ring(0.455, 0.012, 56), { color: goldLight, position: [0, 0.232, 0] })

  // Stem: a turned baluster with two collars.
  b.add(
    'glossy',
    latheFrom(
      [
        [0.13, 0.105],
        [0.13, 0.13],
        [0.1, 0.16],
        [0.075, 0.19],
        [0.058, 0.225],
        [0.055, 0.26],
        [0.07, 0.285],
        [0.086, 0.315],
        [0.09, 0.34],
        [0.08, 0.37],
        [0.06, 0.4],
        [0.048, 0.43],
        [0.045, 0.5],
        [0.06, 0.53],
        [0.07, 0.55],
      ],
      32,
    ),
    { color: goldDeep, colorTop: goldLight },
  )
  b.add('metal', ring(0.062, 0.014, 32), { color: goldLight, position: [0, 0.26, 0] })
  b.add('metal', ring(0.052, 0.011, 32), { color: goldLight, position: [0, 0.48, 0] })

  // Upper basin with water.
  const upper = sculptLathe(
    [
      [0.0001, 0.545],
      [0.09, 0.545],
      [0.15, 0.57],
      [0.21, 0.62],
      [0.26, 0.675],
      [0.272, 0.7],
      [0.265, 0.71],
      [0.25, 0.71],
      [0.244, 0.698],
      [0.22, 0.665],
      [0.17, 0.636],
      [0.1, 0.622],
      [0.0001, 0.62],
    ],
    48,
    (v) => scallop(v, 0.66, 0.025),
  )
  b.add('glossy', upper, {
    color: gold,
    colorFn: (p, _n, c) => {
      c.copy(goldDeepC).lerp(goldLightC, smoothstep(0.54, 0.71, p.y))
    },
  })
  b.add('metal', ring(0.258, 0.011, 48), { color: goldLight, position: [0, 0.708, 0] })
  const water = new THREE.CircleGeometry(0.23, 40)
  water.rotateX(-Math.PI / 2)
  b.add('glow', water, {
    color: '#2a8fb0',
    position: [0, FOUNTAIN_WATER_Y, 0],
    colorFn: (p, _n, c) => {
      c.set('#2a8fb0').lerp(new THREE.Color('#5fd8ee'), smoothstep(0.1, 0.23, Math.hypot(p.x, p.z)) * 0.5)
    },
  })

  // Statue base and the leaping fish.
  const baseY = FOUNTAIN_FISH_BASE
  b.add(
    'glossy',
    latheFrom(
      [
        [0.062, 0.62],
        [0.062, 0.64],
        [0.045, 0.665],
        [0.038, 0.685],
        [0.07, 0.692],
        [0.098, 0.696],
        [0.098, 0.7],
        [0.0001, 0.7],
      ],
      28,
    ),
    { color: goldDeep, colorTop: goldLight },
  )
  const bodyProfile: Array<[number, number]> = [
    [0.0001, 0.05],
    [0.012, 0.05],
    [0.015, 0.08],
    [0.03, 0.12],
    [0.046, 0.16],
    [0.05, 0.185],
    [0.046, 0.21],
    [0.034, 0.232],
    [0.018, 0.246],
    [0.0001, 0.25],
  ]
  const body = sculptLathe(bodyProfile, 24, (v) => {
    v.x += fishBend(v.y)
    v.z *= 0.8
  })
  const fishGold = new THREE.Color('#ffcc3d')
  const fishLight = new THREE.Color('#ffe58a')
  b.add('metal', body, {
    color: '#ffcc3d',
    position: [0, baseY, 0],
    colorFn: (p, n, c) => {
      const scales = 0.92 + 0.08 * Math.sin((p.y - baseY) * 170 + p.x * 40)
      c.copy(fishGold).lerp(fishLight, smoothstep(0.1, 0.8, n.x * 0.5 + 0.5) * 0.4).multiplyScalar(scales)
    },
  })
  const tail = new THREE.Shape()
  tail.moveTo(0, 0.09)
  tail.bezierCurveTo(0.04, 0.078, 0.09, 0.045, 0.105, -0.005)
  tail.bezierCurveTo(0.07, 0.0, 0.025, 0.014, 0, 0.034)
  tail.bezierCurveTo(-0.025, 0.014, -0.07, 0.0, -0.105, -0.005)
  tail.bezierCurveTo(-0.09, 0.045, -0.04, 0.078, 0, 0.09)
  b.add('thin', finGeometry(tail), {
    color: '#ffd96a',
    position: [0, baseY, 0],
    colorFn: (p, _n, c) => {
      const rays = Math.sin(Math.atan2(p.y - baseY - 0.09, p.x) * 22) * 0.5 + 0.5
      c.set('#ffd96a').multiplyScalar(0.86 + rays * 0.22)
    },
  })
  const dorsal = new THREE.Shape()
  dorsal.moveTo(-0.035, 0.1)
  dorsal.bezierCurveTo(-0.09, 0.115, -0.12, 0.135, -0.108, 0.148)
  dorsal.bezierCurveTo(-0.09, 0.17, -0.07, 0.195, -0.04, 0.225)
  dorsal.lineTo(-0.035, 0.1)
  b.add('thin', finGeometry(dorsal), { color: '#ffd96a', colorTop: '#fff0a8', position: [0, baseY, 0] })
  for (const side of [1, -1]) {
    const fin = new THREE.SphereGeometry(0.036, 10, 8)
    fin.scale(0.3, 1, 0.65)
    b.add('satin', fin, { color: '#ffd96a', position: [fishBend(0.14), baseY + 0.135, side * 0.05], rotation: [side * 0.5, 0, side * 0.15] })
    const eye = fishBend(0.2)
    b.add('glossy', new THREE.SphereGeometry(0.013, 10, 8), { color: '#ffffff', position: [eye + 0.004, baseY + 0.205, side * 0.034] })
    b.add('glossy', new THREE.SphereGeometry(0.0078, 8, 6), { color: '#101418', position: [eye + 0.009, baseY + 0.206, side * 0.042] })
  }

  const mouth = new THREE.SphereGeometry(0.014, 10, 8)
  mouth.scale(1, 0.5, 0.9)
  b.add('glossy', mouth, { color: '#3a2a10', position: [fishBend(FOUNTAIN_FISH_LENGTH) + 0.002, baseY + FOUNTAIN_FISH_LENGTH - 0.004, 0] })

  // Gold coins strewn across the lower basin, a few stacked and leaning, plus gems.
  const floorY = (r: number) => (r < 0.34 ? 0.115 + (r / 0.34) * 0.005 : 0.12 + ((r - 0.34) / 0.06) * 0.03)
  const coinTones = [gold, '#ffd24a', '#f2c230', '#ffe07a', '#d9a92e', '#d8dde6']
  const placed: Array<[number, number]> = []
  for (let i = 0; i < 34; i++) {
    let r = 0
    let a = 0
    let level = 0
    for (let tries = 0; tries < 8; tries++) {
      r = rr(rand, 0.16, 0.37)
      a = rand() * Math.PI * 2
      level = placed.filter(([x, z]) => Math.hypot(x - Math.sin(a) * r, z - Math.cos(a) * r) < 0.05).length
      if (level < 2) break
    }
    level = Math.min(level, 2)
    placed.push([Math.sin(a) * r, Math.cos(a) * r])
    const tilt = level ? rr(rand, 0.12, 0.35) : rr(rand, 0, 0.12)
    const dir = new THREE.Vector3(Math.sin(rand() * 6.28) * Math.sin(tilt), Math.cos(tilt), Math.cos(rand() * 6.28) * Math.sin(tilt))
    const tone = coinTones[i % 7 === 6 ? 5 : i % 5]
    b.add('metal', new THREE.CylinderGeometry(0.036, 0.036, 0.008, 20), {
      color: tone,
      position: [Math.sin(a) * r, floorY(r) + 0.004 + level * 0.009 + Math.sin(tilt) * 0.034, Math.cos(a) * r],
      rotation: aimY(dir),
    })
  }
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 1.55
    const r = 0.155
    const out = new THREE.Vector3(Math.sin(a), 0.55, Math.cos(a)).normalize()
    b.add('metal', new THREE.CylinderGeometry(0.037, 0.037, 0.008, 20), {
      color: coinTones[(i + 1) % 5],
      position: [Math.sin(a) * r, 0.165, Math.cos(a) * r],
      rotation: aimY(out),
    })
  }
  const gems = ['#ff4d6d', '#37e08e', '#4db8ff', '#c46bff']
  gems.forEach((color, i) => {
    const a = 1.1 + i * 1.6
    const r = 0.25 + (i % 2) * 0.08
    b.add('glow', new THREE.OctahedronGeometry(0.026, 0), { color, position: [Math.sin(a) * r, floorY(r) + 0.022, Math.cos(a) * r], rotation: [rand(), rand() * 3, rand()] })
  })
  return b.build({ aoHeight: 0.2 })
}
