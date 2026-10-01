import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MeshBuilder, type V3 } from '../../geometry/MeshBuilder'
import { latheFrom, noiseRock, taperedTube } from '../../geometry/shapes'
import { noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { pose, rr, rusty, smoothstep, woodGrain, type StaticBuilder } from './common'

const GOLD = '#ffc93d'

// --- treasure chest ----------------------------------------------------------

export const CHEST = { W: 0.5, D: 0.34, H: 0.26 }

function plankWood(base: string): (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => void {
  const grain = woodGrain(base, 'x')
  const seam = new THREE.Color(base).multiplyScalar(0.45)
  return (p, n, c) => {
    grain(p, n, c)
    if (Math.abs(n.y) < 0.5 && (p.y / 0.065) % 1 < 0.1) c.copy(seam)
  }
}

export const buildChestBase: StaticBuilder = (def, rand) => {
  const { W, D, H } = CHEST
  const b = new MeshBuilder()
  b.add('matte', new THREE.BoxGeometry(W, H, D, 4, 4, 4), { color: def.color, position: [0, H / 2, 0], colorFn: plankWood(def.color) })
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    b.add('metal', new THREE.BoxGeometry(0.045, H + 0.01, D + 0.012), { color: def.accentColor, position: [x, H / 2, 0] })
  }
  b.add('metal', new THREE.BoxGeometry(W + 0.012, 0.03, D + 0.012), { color: def.accentColor, position: [0, H - 0.015, 0] })
  b.add('metal', new THREE.BoxGeometry(W + 0.012, 0.03, D + 0.012), { color: def.accentColor, position: [0, 0.015, 0] })
  b.add('metal', new RoundedBoxGeometry(0.08, 0.1, 0.025, 2, 0.008), { color: def.accentColor, position: [0, H - 0.05, D / 2 + 0.01] })
  b.add('satin', new THREE.BoxGeometry(0.014, 0.035, 0.01), { color: '#1a1008', position: [0, H - 0.055, D / 2 + 0.024] })
  // Heap of treasure inside (seen when the lid opens)
  for (let i = 0; i < 28; i++) {
    b.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), {
      color: GOLD,
      position: [rr(rand, -W / 2 + 0.05, W / 2 - 0.05), H - 0.01 + rand() * 0.03, rr(rand, -D / 2 + 0.05, D / 2 - 0.05)],
      rotation: [rr(rand, -0.5, 0.5), rand() * 3, rr(rand, -0.5, 0.5)],
    })
  }
  const gems = ['#ff3b5c', '#3bff8f', '#3bb8ff', '#c46bff']
  gems.forEach((color, i) => {
    b.add('glow', new THREE.OctahedronGeometry(0.03, 0), { color, position: [-0.15 + i * 0.1, H + 0.025, rr(rand, -0.06, 0.06)], rotation: [rand(), rand(), rand()] })
  })
  // Coins spilled on the sand
  for (let i = 0; i < 8; i++) {
    b.add('metal', new THREE.CylinderGeometry(0.03, 0.03, 0.008, 16), {
      color: GOLD,
      position: [rr(rand, -0.3, 0.3), 0.01, D / 2 + 0.05 + rand() * 0.18],
      rotation: [rr(rand, -0.3, 0.3), rand() * 3, rr(rand, -0.3, 0.3)],
    })
  }
  return b.build({ aoHeight: 0.15 })
}

/** Lid in its own frame: hinge line along X at the origin, lid extends toward +Z. */
export const buildChestLid: StaticBuilder = (def) => {
  const { W, D } = CHEST
  const r = D / 2
  const b = new MeshBuilder()
  const lid = new THREE.CylinderGeometry(r, r, W, 28, 1, false, 0, Math.PI)
  lid.rotateZ(Math.PI / 2)
  lid.translate(0, 0, r)
  b.add('matte', lid, { color: shade(def.color, -0.08), colorFn: woodGrain(shade(def.color, -0.08), 'x') })
  for (const x of [-W / 2 + 0.06, W / 2 - 0.06]) {
    const band = new THREE.TorusGeometry(r + 0.004, 0.014, 6, 24, Math.PI)
    band.rotateY(Math.PI / 2)
    band.translate(x, 0, r)
    b.add('metal', band, { color: def.accentColor })
  }
  return b.build({ groundAO: false })
}

// --- shipwreck ------------------------------------------------------------------

function hullGeometry(L: number, W: number, D: number, segs = 32, ring = 16): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const x = -L / 2 + t * L
    const beam = t < 0.35 ? 0.8 + 0.2 * (t / 0.35) : Math.pow(Math.max(0, Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2))), 0.6)
    const w = (W / 2) * Math.max(beam, 0.015)
    const d = D * (t > 0.8 ? 1 - ((t - 0.8) / 0.2) * 0.35 : 1)
    const sheer = 0.13 * Math.pow((t - 0.45) * 2, 2)
    for (let j = 0; j <= ring; j++) {
      const th = -Math.PI / 2 + (j / ring) * Math.PI
      positions.push(x, sheer - d * Math.pow(Math.cos(th), 0.75), w * Math.sin(th))
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j
      const bb = (i + 1) * (ring + 1) + j
      indices.push(a, bb, a + 1, bb, bb + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

const HULL = { L: 1.75, W: 0.56, D: 0.44 }

function hullSheer(t: number) {
  return 0.13 * Math.pow((t - 0.45) * 2, 2)
}

function hullHalfWidth(t: number) {
  const beam = t < 0.35 ? 0.8 + 0.2 * (t / 0.35) : Math.pow(Math.max(0, Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2))), 0.6)
  return (HULL.W / 2) * Math.max(beam, 0.015)
}

export const SHIP_POSE = pose([0.38, 0.25, 0.06], [0, 0.2, 0])
/** Where the lantern hangs, in the ship's pre-tilt frame (for the animated flicker). */
export const SHIP_LANTERN: V3 = [-0.84, 0.46, 0]

export const buildShipwreck: StaticBuilder = (def, rand) => {
  const ship = new MeshBuilder()
  const hullColor = new THREE.Color(def.color)
  const plankSeam = new THREE.Color(def.color).multiplyScalar(0.5)
  const hole = new THREE.Color('#0d0906')
  const holeCenter = new THREE.Vector3(0.25, -0.18, HULL.W / 2)
  ship.add('thin', hullGeometry(HULL.L, HULL.W, HULL.D), {
    color: def.color,
    colorFn: (p, _n, c) => {
      const grain = noise3(p.x * 3, p.y * 30, p.z * 30)
      c.copy(hullColor).multiplyScalar(0.8 + grain * 0.3)
      if (((p.y + 1) / 0.055) % 1 < 0.12) c.copy(plankSeam)
      const d = p.distanceTo(holeCenter) + noise3(p.x * 20, p.y * 20, p.z * 20) * 0.04
      if (d < 0.13) c.copy(hole)
      c.lerp(new THREE.Color('#4f7a3a'), smoothstep(-0.05, -0.35, p.y) * 0.35)
    },
  })
  // Deck planks (a couple missing)
  for (let i = 0; i < 13; i++) {
    if (i === 4 || i === 8) continue
    const t = 0.06 + (i / 13) * 0.86
    const x = -HULL.L / 2 + t * HULL.L
    const w = hullHalfWidth(t) * 2 * 0.96
    ship.add('matte', new THREE.BoxGeometry(0.12, 0.02, w), {
      color: shade(def.color, 0.08),
      position: [x, hullSheer(t) - 0.03, 0],
      rotation: [rr(rand, -0.04, 0.04), 0, rr(rand, -0.03, 0.03)],
      colorFn: woodGrain(shade(def.color, 0.08), 'x'),
    })
  }
  // Stern cabin with dark windows
  ship.add('matte', new THREE.BoxGeometry(0.34, 0.24, 0.42), { color: def.color, position: [-0.62, 0.18, 0], colorFn: woodGrain(def.color, 'y') })
  ship.add('matte', new THREE.BoxGeometry(0.38, 0.04, 0.46), { color: shade(def.color, -0.1), position: [-0.62, 0.31, 0] })
  for (const z of [-0.1, 0.1]) ship.add('satin', new THREE.BoxGeometry(0.02, 0.07, 0.08), { color: '#120c08', position: [-0.79, 0.19, z] })
  // Broken mast, yard, crow's nest and a tattered sail
  const mastTop: V3 = [0.12, 1.28, -0.02]
  ship.add('matte', taperedTube([[0.08, -0.05, 0], [0.1, 0.6, 0], mastTop], 0.035, 0.024, 16, 10), { color: shade(def.color, 0.05), colorFn: woodGrain(shade(def.color, 0.05), 'y') })
  ship.add('matte', taperedTube([[0.105, 0.95, -0.34], [0.11, 0.97, 0], [0.105, 0.95, 0.34]], 0.017, 0.017, 10, 8), { color: shade(def.color, 0.05) })
  ship.add('matte', new THREE.CylinderGeometry(0.1, 0.08, 0.08, 16, 1, true), { color: def.color, position: [0.115, 1.13, -0.01] })
  const sail = new THREE.Shape()
  sail.moveTo(-0.32, 0)
  sail.lineTo(0.32, 0)
  sail.lineTo(0.3, -0.3)
  const jag = [0.22, 0.12, 0.02, -0.1, -0.18, -0.28]
  jag.forEach((x, i) => sail.lineTo(x, -0.36 - (i % 2) * 0.1 + Math.sin(i * 3) * 0.04))
  sail.lineTo(-0.31, -0.28)
  sail.lineTo(-0.32, 0)
  const sailHole = new THREE.Path()
  sailHole.absarc(0.08, -0.18, 0.05, 0, Math.PI * 2, false)
  sail.holes.push(sailHole)
  const sailGeo = new THREE.ShapeGeometry(sail, 6)
  const sp = sailGeo.getAttribute('position')
  for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 6) * 0.03 + sp.getY(i) * -0.12)
  sailGeo.computeVertexNormals()
  sailGeo.rotateY(Math.PI / 2)
  ship.add('swayLeaf', sailGeo, { color: '#e3d5b4', position: [0.14, 0.94, 0], mottle: 0.25 })
  // Rigging
  ship.add('satin', taperedTube([mastTop, [0.5, 0.7, 0], [0.86, 0.18, 0]], 0.005, 0.005, 12, 4, false), { color: '#3a2e22' })
  ship.add('satin', taperedTube([mastTop, [-0.3, 0.8, 0], [-0.72, 0.32, 0]], 0.005, 0.005, 12, 4, false), { color: '#3a2e22' })
  // Bowsprit
  ship.add('matte', taperedTube([[0.78, 0.12, 0], [0.98, 0.22, 0], [1.08, 0.28, 0]], 0.025, 0.012, 8, 8), { color: def.color })
  // Lantern post with a glowing lantern
  ship.add('matte', taperedTube([[-0.8, 0.3, 0], [-0.84, 0.52, 0]], 0.012, 0.012, 4, 6), { color: '#2a2a2a' })
  ship.add('metal', new THREE.BoxGeometry(0.07, 0.09, 0.07), { color: '#2d2a26', position: SHIP_LANTERN })
  ship.add('lamp', new THREE.BoxGeometry(0.05, 0.065, 0.075), { color: def.accentColor, position: SHIP_LANTERN })
  ship.add('lamp', new THREE.BoxGeometry(0.075, 0.065, 0.05), { color: def.accentColor, position: SHIP_LANTERN })
  // Barrel on deck
  const barrel = latheFrom([[0.05, -0.07], [0.062, -0.03], [0.065, 0], [0.062, 0.03], [0.05, 0.07]], 16)
  ship.add('matte', barrel.clone(), { color: '#8a6440', position: [0.45, 0.06, 0.08], colorFn: woodGrain('#8a6440', 'y') })
  const shipParts = ship.build({ transform: SHIP_POSE, aoHeight: 0.2 })

  // Things that fell onto the sand (not tilted with the ship)
  const sand = new MeshBuilder()
  sand.add('metal', taperedTube([[0.55, 0.06, 0.55], [0.8, 0.07, 0.6]], 0.05, 0.035, 8, 12, false), { color: '#35383c' })
  for (const z of [0.5, 0.64]) sand.add('matte', new THREE.TorusGeometry(0.045, 0.015, 6, 14), { color: '#4a3a28', position: [0.62, 0.045, z], rotation: [0, 0, 0] })
  const lying = latheFrom([[0.05, -0.07], [0.062, -0.03], [0.065, 0], [0.062, 0.03], [0.05, 0.07]], 16)
  lying.rotateZ(Math.PI / 2)
  sand.add('matte', lying, { color: '#7a5634', position: [-0.5, 0.06, 0.52], rotation: [0, 0.7, 0], colorFn: woodGrain('#7a5634', 'x') })
  for (let i = 0; i < 4; i++) {
    sand.add('matte', new THREE.BoxGeometry(0.28, 0.018, 0.07), {
      color: shade(def.color, 0.05),
      position: [rr(rand, -0.8, 0.8), 0.015, rr(rand, 0.45, 0.7)],
      rotation: [0, rand() * 3, rr(rand, -0.1, 0.1)],
      colorFn: woodGrain(shade(def.color, 0.05), 'x'),
    })
  }
  return [...shipParts, ...sand.build({ aoHeight: 0.1 })]
}

// --- anchor --------------------------------------------------------------------

export const buildAnchor: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const rust = rusty(def.color, def.accentColor)
  b.add('satin', new THREE.CylinderGeometry(0.035, 0.04, 0.72, 14), { color: def.color, position: [0, 0.46, 0], colorFn: rust })
  b.add('satin', new THREE.TorusGeometry(0.08, 0.02, 10, 24), { color: def.color, position: [0, 0.88, 0], colorFn: rust })
  b.add('satin', new THREE.CylinderGeometry(0.024, 0.024, 0.44, 10), { color: def.color, position: [0, 0.76, 0], rotation: [Math.PI / 2, 0, 0], colorFn: rust })
  for (const z of [-0.23, 0.23]) b.add('satin', new THREE.SphereGeometry(0.035, 10, 8), { color: def.color, position: [0, 0.76, z], colorFn: rust })
  const arms = new THREE.TorusGeometry(0.27, 0.036, 12, 36, Math.PI)
  arms.rotateZ(Math.PI)
  b.add('satin', arms, { color: def.color, position: [0, 0.34, 0], colorFn: rust })
  b.add('satin', new THREE.SphereGeometry(0.055, 12, 10), { color: def.color, position: [0, 0.08, 0], colorFn: rust })
  for (const side of [1, -1]) {
    b.add('satin', new THREE.ConeGeometry(0.085, 0.18, 3), {
      color: def.color,
      position: [side * 0.29, 0.39, 0],
      rotation: [0, 0, -side * 0.5],
      scale: [1, 1, 0.35],
      colorFn: rust,
    })
  }
  // Chain: links alternating orientation, trailing onto the sand.
  const chainPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.8, 0.04),
    new THREE.Vector3(0.12, 0.45, 0.18),
    new THREE.Vector3(0.2, 0.05, 0.3),
    new THREE.Vector3(0.45, 0.03, 0.34),
    new THREE.Vector3(0.6, 0.03, 0.18),
  ])
  const links = 16
  for (let i = 0; i < links; i++) {
    const t = i / (links - 1)
    const p = chainPath.getPointAt(t)
    const tangent = chainPath.getTangentAt(t)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent)
    const e = new THREE.Euler().setFromQuaternion(q)
    const link = new THREE.TorusGeometry(0.035, 0.011, 6, 14)
    link.scale(1.4, 1, 1)
    if (i % 2) link.rotateX(Math.PI / 2)
    b.add('satin', link, { color: def.color, position: [p.x, p.y, p.z], rotation: [e.x, e.y, e.z], colorFn: rust })
  }
  return b.build({ transform: pose([0.05, 0.3, 0.32], [-0.05, -0.02, 0]), aoHeight: 0.15 })
}

// --- skull rock ---------------------------------------------------------------

export const buildSkull: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const bone = new THREE.Color(def.color)
  const crack = new THREE.Color(shade(def.color, -0.45))
  const boneFn = (p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color) => {
    c.copy(bone).multiplyScalar(0.85 + noise3(p.x * 6, p.y * 6, p.z * 6) * 0.2)
    const cr = Math.abs(noise3(p.x * 5 + 1, p.y * 5, p.z * 5))
    c.lerp(crack, smoothstep(0.04, 0.0, cr) * 0.9)
    c.lerp(new THREE.Color('#6f8a4a'), smoothstep(0.25, 0.0, p.y) * smoothstep(-0.2, 0.3, noise3(p.x * 9, p.y * 9, p.z * 9)) * 0.7)
    if (n.y > 0.8) c.lerp(new THREE.Color('#7f9a5a'), 0.3)
  }
  const dark = '#140c0a'
  b.add('matte', new THREE.SphereGeometry(0.36, 40, 28), { color: def.color, position: [0, 0.5, -0.04], scale: [1, 0.92, 1.12], colorFn: boneFn })
  b.add('matte', new RoundedBoxGeometry(0.46, 0.26, 0.36, 4, 0.1), { color: def.color, position: [0, 0.32, 0.12], colorFn: boneFn })
  for (const side of [1, -1]) {
    b.add('matte', new THREE.SphereGeometry(0.11, 16, 12), { color: def.color, position: [side * 0.19, 0.33, 0.2], colorFn: boneFn })
    b.add('satin', new THREE.SphereGeometry(0.1, 20, 14), { color: dark, position: [side * 0.13, 0.44, 0.27], scale: [1, 0.95, 0.55] })
    b.add('lamp', new THREE.SphereGeometry(0.03, 12, 10), { color: def.accentColor, position: [side * 0.13, 0.44, 0.305] })
  }
  for (const side of [1, -1]) b.add('satin', new THREE.SphereGeometry(0.035, 10, 8), { color: dark, position: [side * 0.028, 0.3, 0.315], scale: [0.8, 1.3, 0.6] })
  b.add('matte', new RoundedBoxGeometry(0.34, 0.08, 0.14, 3, 0.03), { color: def.color, position: [0, 0.2, 0.22], colorFn: boneFn })
  for (let i = 0; i < 8; i++) {
    b.add('glossy', new RoundedBoxGeometry(0.034, 0.06, 0.03, 2, 0.01), { color: '#f4efdc', position: [-0.14 + i * 0.04, 0.15, 0.285 - Math.abs(i - 3.5) * 0.008] })
  }
  // Half-buried lower jaw hanging open
  b.add('matte', new RoundedBoxGeometry(0.34, 0.07, 0.24, 3, 0.03), { color: def.color, position: [0, 0.03, 0.26], rotation: [0.25, 0, 0], colorFn: boneFn })
  for (let i = 0; i < 6; i++) b.add('glossy', new RoundedBoxGeometry(0.03, 0.05, 0.026, 2, 0.01), { color: '#f4efdc', position: [-0.1 + i * 0.04, 0.08, 0.34] })
  return b.build({ aoHeight: 0.2 })
}

// --- megalodon jaws ------------------------------------------------------------

export const buildJaws: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const bone = new THREE.Color(def.color)
  const gum = new THREE.Color('#b58a7a')
  const center = new THREE.Vector3(0, 0.5, 0)
  const jawFn = (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    const r = Math.hypot(p.x - center.x, (p.y - center.y) / 0.92)
    c.copy(bone).multiplyScalar(0.85 + noise3(p.x * 8, p.y * 8, p.z * 8) * 0.2)
    c.lerp(gum, smoothstep(0.42, 0.36, r) * 0.6)
  }
  const upper = new THREE.TorusGeometry(0.42, 0.065, 12, 48, Math.PI)
  b.add('satin', upper, { color: def.color, position: [0, 0.5, 0], scale: [1, 0.92, 0.8], colorFn: jawFn })
  const lower = new THREE.TorusGeometry(0.42, 0.055, 12, 48, Math.PI)
  lower.rotateZ(Math.PI)
  b.add('satin', lower, { color: def.color, position: [0, 0.5, 0], scale: [1, 0.92, 0.8], colorFn: jawFn })
  const tooth = (angle: number, size: number, z: number) => {
    const pos = new THREE.Vector3(Math.cos(angle) * 0.38, 0.5 + Math.sin(angle) * 0.38 * 0.92, z)
    const inward = center.clone().setZ(z).sub(pos).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward)
    const e = new THREE.Euler().setFromQuaternion(q)
    const g = new THREE.ConeGeometry(0.04 * size, 0.13 * size, 4)
    g.scale(1, 1, 0.45)
    g.translate(0, 0.05 * size, 0)
    b.add('glossy', g, { color: '#fbf7ea', colorTop: '#ffffff', position: [pos.x, pos.y, pos.z], rotation: [e.x, e.y, e.z] })
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 25) * Math.PI * 2
    const size = 0.75 + Math.abs(Math.sin(a)) * 0.45
    tooth(a, size, 0.03)
    tooth(a + 0.12, size * 0.7, -0.025)
  }
  b.add('matte', noiseRock(0.3, 8, 0.3, 2), { color: '#c9b48a', position: [0, 0.02, 0], scale: [1.8, 0.28, 0.9], mottle: 0.15 })
  return b.build({ aoHeight: 0.2 })
}

// --- diver helmet -----------------------------------------------------------------

export const DIVER_POSE = pose([0.12, 0.3, -0.18], [0, 0, 0])
export const DIVER_VALVE = new THREE.Vector3(0, 0.72, 0).applyMatrix4(DIVER_POSE)

export const buildDiver: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const brass = new THREE.Color(def.color)
  const tarnish = new THREE.Color('#4f8a6a')
  const brassFn = (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    c.copy(brass).lerp(tarnish, smoothstep(0.25, 0.6, noise3(p.x * 7, p.y * 7, p.z * 7)) * 0.5)
  }
  b.add('metal', new THREE.SphereGeometry(0.24, 40, 28), { color: def.color, position: [0, 0.44, 0], colorFn: brassFn })
  b.add('metal', latheFrom([[0.13, 0.28], [0.26, 0.22], [0.36, 0.1], [0.4, 0.0], [0.38, -0.02]], 40), { color: def.color, colorFn: brassFn })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    b.add('metal', new THREE.SphereGeometry(0.018, 8, 6), { color: shade(def.color, -0.2), position: [Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.3] })
  }
  // Front window with grille, glowing faintly inside
  b.add('metal', new THREE.TorusGeometry(0.11, 0.026, 10, 28), { color: shade(def.color, -0.1), position: [0, 0.44, 0.23] })
  b.add('glow', new THREE.CircleGeometry(0.1, 28), { color: def.accentColor, position: [0, 0.44, 0.235] })
  for (const x of [-0.035, 0.035]) b.add('metal', new THREE.BoxGeometry(0.012, 0.2, 0.012), { color: '#3a3226', position: [x, 0.44, 0.245] })
  for (const side of [1, -1]) {
    b.add('metal', new THREE.TorusGeometry(0.065, 0.02, 8, 20), { color: shade(def.color, -0.1), position: [side * 0.225, 0.46, 0.02], rotation: [0, Math.PI / 2, 0] })
    b.add('glow', new THREE.CircleGeometry(0.058, 20), { color: def.accentColor, position: [side * 0.232, 0.46, 0.02], rotation: [0, side * Math.PI / 2, 0] })
  }
  b.add('metal', new THREE.CylinderGeometry(0.03, 0.04, 0.08, 12), { color: shade(def.color, -0.1), position: [0, 0.69, 0] })
  b.add('metal', new THREE.SphereGeometry(0.03, 10, 8), { color: shade(def.color, -0.1), position: [0, 0.73, 0] })
  b.add('satin', taperedTube([[0, 0.5, -0.22], [0, 0.45, -0.4], [0.1, 0.08, -0.55], [0.3, 0.03, -0.6], [0.5, 0.03, -0.45]], 0.03, 0.03, 24, 10), { color: '#2f4a38' })
  return b.build({ transform: DIVER_POSE, aoHeight: 0.18 })
}

// --- submarine ---------------------------------------------------------------------

export const SUB_POSE = pose([0.08, 0.35, 0.05], [0, 0.22, 0])
export const SUB_PROPELLER = new THREE.Vector3(-0.6, 0, 0)

export const buildSubmarine: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const hull = latheFrom([[0.0001, -0.56], [0.12, -0.5], [0.2, -0.36], [0.225, -0.12], [0.225, 0.22], [0.2, 0.4], [0.12, 0.52], [0.0001, 0.57]], 36)
  hull.rotateZ(-Math.PI / 2)
  b.add('glossy', hull, { color: def.color, colorFn: (_p, n, c) => c.set(def.color).multiplyScalar(n.y < -0.4 ? 0.8 : 1) })
  b.add('glossy', new RoundedBoxGeometry(0.3, 0.2, 0.15, 4, 0.06), { color: def.color, position: [0.05, 0.27, 0] })
  b.add('metal', taperedTube([[0.1, 0.36, 0], [0.1, 0.55, 0], [0.16, 0.58, 0]], 0.018, 0.018, 10, 8), { color: '#6f7780' })
  b.add('metal', new THREE.BoxGeometry(0.06, 0.035, 0.035), { color: '#6f7780', position: [0.18, 0.58, 0] })
  for (let i = 0; i < 3; i++) {
    const x = 0.25 - i * 0.2
    for (const side of [1, -1]) {
      b.add('metal', new THREE.TorusGeometry(0.048, 0.013, 8, 20), { color: '#8a8f96', position: [x, 0.02, side * 0.222], rotation: [0, 0, 0] })
      b.add('glow', new THREE.CircleGeometry(0.043, 20), { color: def.accentColor, position: [x, 0.02, side * 0.226], rotation: [0, side < 0 ? Math.PI : 0, 0] })
    }
  }
  b.add('metal', new THREE.TorusGeometry(0.07, 0.016, 8, 24), { color: '#8a8f96', position: [0.555, 0.02, 0], rotation: [0, Math.PI / 2, 0] })
  b.add('glow', new THREE.CircleGeometry(0.065, 24), { color: def.accentColor, position: [0.565, 0.02, 0], rotation: [0, Math.PI / 2, 0] })
  // Fins
  b.add('glossy', new RoundedBoxGeometry(0.16, 0.22, 0.025, 2, 0.01), { color: shade(def.color, -0.1), position: [-0.5, 0.05, 0] })
  b.add('glossy', new RoundedBoxGeometry(0.16, 0.025, 0.36, 2, 0.01), { color: shade(def.color, -0.1), position: [-0.5, 0, 0] })
  b.add('glossy', new RoundedBoxGeometry(0.1, 0.02, 0.5, 2, 0.008), { color: shade(def.color, -0.1), position: [0.18, 0.2, 0] })
  // Rivet lines
  for (let i = 0; i < 12; i++) {
    const x = -0.4 + i * 0.075
    b.add('metal', new THREE.SphereGeometry(0.009, 6, 4), { color: '#b8a25a', position: [x, 0.16, 0.14] })
    b.add('metal', new THREE.SphereGeometry(0.009, 6, 4), { color: '#b8a25a', position: [x, 0.16, -0.14] })
  }
  b.add('metal', new THREE.CylinderGeometry(0.03, 0.05, 0.08, 12), { color: '#6f7780', position: [-0.58, 0, 0], rotation: [0, 0, Math.PI / 2] })
  return b.build({ transform: SUB_POSE, aoHeight: 0.15 })
}

// --- volcano -------------------------------------------------------------------------

export const VOLCANO_CRATER = new THREE.Vector3(0, 1.02, 0)

export const buildVolcano: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const cone = latheFrom([[0.75, 0], [0.62, 0.16], [0.48, 0.46], [0.3, 0.88], [0.21, 1.06], [0.17, 1.09], [0.13, 1.0], [0.0001, 0.98]], 64)
  const pos = cone.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r = Math.hypot(v.x, v.z)
    if (r > 0.02) {
      const n = noise3(v.x * 4, v.y * 4, v.z * 4) * 0.07 + noise3(v.x * 11, v.y * 11, v.z * 11) * 0.025
      v.x *= 1 + n / Math.max(r, 0.2)
      v.z *= 1 + n / Math.max(r, 0.2)
    }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  cone.computeVertexNormals()
  const rock = new THREE.Color(def.color)
  const lava = new THREE.Color(def.accentColor).multiplyScalar(2.2)
  b.add('glow', cone, {
    color: def.color,
    colorFn: (p, n, c) => {
      c.copy(rock).multiplyScalar(0.7 + noise3(p.x * 9, p.y * 9, p.z * 9) * 0.3)
      const ridged = 1 - Math.abs(noise3(p.x * 5, p.y * 2.2, p.z * 5))
      const crack = smoothstep(0.9, 0.97, ridged) * smoothstep(0.08, 0.5, p.y)
      c.lerp(lava, crack)
      if (n.y < 0 && p.y > 0.95) c.copy(lava)
    },
  })
  const pool = new THREE.CircleGeometry(0.14, 24)
  pool.rotateX(-Math.PI / 2)
  b.add('lamp', pool, { color: def.accentColor, position: [0, 1.0, 0] })
  b.add('lamp', taperedTube([[0.17, 1.05, 0.04], [0.3, 0.8, 0.14], [0.44, 0.45, 0.25], [0.6, 0.1, 0.33], [0.68, 0.02, 0.38]], 0.04, 0.025, 30, 8), {
    color: def.accentColor,
  })
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2
    const d = 0.7 + rand() * 0.2
    b.add('matte', noiseRock(0.08 + rand() * 0.07, i * 2.2, 0.4, 2), { color: shade(def.color, -0.05), position: [Math.cos(a) * d, 0.03, Math.sin(a) * d], scale: [1, 0.7, 1] })
  }
  return b.build({ aoHeight: 0.2 })
}

// --- UFO -----------------------------------------------------------------------------

export const UFO_POSE = pose([0.32, 0.4, -0.12], [0, 0.18, 0])
export const UFO_RIM_RADIUS = 0.6

export const buildUfo: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const saucer = latheFrom([[0.0001, -0.1], [0.2, -0.12], [0.45, -0.07], [0.62, 0], [0.6, 0.035], [0.4, 0.08], [0.25, 0.1], [0.0001, 0.1]], 64)
  const metal = new THREE.Color(def.color)
  b.add('metal', saucer, {
    color: def.color,
    colorFn: (p, _n, c) => {
      const r = Math.hypot(p.x, p.z)
      c.copy(metal).multiplyScalar(Math.abs(r - 0.45) < 0.008 || Math.abs(r - 0.3) < 0.008 ? 0.5 : 1)
    },
  })
  b.add('glow', new THREE.SphereGeometry(0.22, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), { color: '#7fe8ff', position: [0, 0.09, 0] })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    b.add('lamp', new THREE.SphereGeometry(0.025, 10, 8), { color: i % 2 ? def.accentColor : '#ff5dd6', position: [Math.cos(a) * UFO_RIM_RADIUS, 0.012, Math.sin(a) * UFO_RIM_RADIUS] })
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4
    b.add('metal', taperedTube([[Math.cos(a) * 0.3, -0.1, Math.sin(a) * 0.3], [Math.cos(a) * 0.4, -0.22, Math.sin(a) * 0.4]], 0.018, 0.012, 4, 6), { color: '#8a939c' })
  }
  const saucerParts = b.build({ transform: UFO_POSE, aoHeight: 0.15 })

  // Crater lip of kicked-up sand, plus a small curious alien peeking out.
  const extras = new MeshBuilder()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rand() * 0.3
    const d = 0.72 + rand() * 0.12
    extras.add('matte', noiseRock(0.1 + rand() * 0.06, i * 1.9, 0.35, 2), { color: '#c9b48a', position: [Math.cos(a) * d, 0.01, Math.sin(a) * d * 0.8], scale: [1.3, 0.45, 1.1], mottle: 0.15 })
  }
  const alien = '#7ddc6b'
  extras.add('satin', new THREE.CapsuleGeometry(0.05, 0.08, 4, 10), { color: alien, position: [0.42, 0.1, 0.42] })
  extras.add('satin', new THREE.SphereGeometry(0.085, 20, 14), { color: alien, position: [0.42, 0.24, 0.42], scale: [1.15, 1, 1] })
  for (const side of [1, -1]) {
    extras.add('glossy', new THREE.SphereGeometry(0.035, 14, 10), { color: '#07070a', position: [0.42 + side * 0.035, 0.25, 0.49], scale: [0.8, 1.2, 0.6], rotation: [0, 0, side * 0.4] })
    extras.add('glossy', taperedTube([[0.42 + side * 0.03, 0.31, 0.42], [0.42 + side * 0.07, 0.4, 0.43]], 0.007, 0.005, 4, 5), { color: alien })
    extras.add('lamp', new THREE.SphereGeometry(0.018, 8, 6), { color: def.accentColor, position: [0.42 + side * 0.07, 0.41, 0.43] })
  }
  return [...saucerParts, ...extras.build({ aoHeight: 0.1 })]
}
