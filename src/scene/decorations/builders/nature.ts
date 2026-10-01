import * as THREE from 'three'
import { MeshBuilder, type V3 } from '../../geometry/MeshBuilder'
import { latheFrom, leafGeometry, noiseRock, ribbonGeometry, taperedTube } from '../../geometry/shapes'
import { noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { gradientY, mossy, rr, smoothstep, woodGrain, type Rand, type StaticBuilder } from './common'

export const buildRocks: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const layout: Array<{ r: number; p: V3; s: V3 }> = [
    { r: 0.3, p: [0, 0.12, 0], s: [1.25, 0.8, 1.05] },
    { r: 0.22, p: [0.4, 0.08, 0.1], s: [1, 0.85, 1.1] },
    { r: 0.2, p: [-0.36, 0.07, 0.14], s: [1.1, 0.8, 1] },
    { r: 0.13, p: [0.12, 0.04, 0.36], s: [1, 0.8, 1] },
    { r: 0.17, p: [-0.06, 0.36, -0.05], s: [1, 0.85, 1] },
    { r: 0.1, p: [0.3, 0.03, -0.3], s: [1, 0.7, 1] },
  ]
  layout.forEach((l, i) => {
    const tone = shade(def.color, rr(rand, -0.06, 0.06))
    b.add('matte', noiseRock(l.r, i * 1.7 + rand() * 10, 0.32, 3), {
      color: tone,
      position: l.p,
      scale: l.s,
      rotation: [0, rand() * 6, 0],
      colorFn: mossy(tone, def.accentColor, 0.85),
    })
  })
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2
    const d = 0.38 + rand() * 0.2
    b.add('matte', noiseRock(0.035 + rand() * 0.03, i + 50, 0.2, 1), {
      color: shade(def.color, rr(rand, -0.1, 0.1)),
      position: [Math.cos(a) * d, 0.015, Math.sin(a) * d],
      scale: [1, 0.6, 1],
      mottle: 0.2,
    })
  }
  return b.build()
}

export const buildDriftwood: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const grain = woodGrain(def.color, 'x', def.accentColor)
  const limbs: Array<{ pts: V3[]; r0: number; r1: number }> = [
    { pts: [[-0.6, 0.05, 0.05], [-0.28, 0.1, -0.05], [0.05, 0.14, 0.02], [0.3, 0.32, -0.04], [0.45, 0.66, 0.05], [0.42, 0.82, 0.1]], r0: 0.085, r1: 0.025 },
    { pts: [[-0.15, 0.1, -0.02], [-0.2, 0.3, 0.08], [-0.3, 0.52, 0.12], [-0.26, 0.74, 0.22]], r0: 0.045, r1: 0.01 },
    { pts: [[0.1, 0.15, 0.02], [0.2, 0.22, 0.2], [0.28, 0.36, 0.34], [0.34, 0.42, 0.42]], r0: 0.04, r1: 0.01 },
    { pts: [[0.3, 0.33, -0.02], [0.18, 0.5, -0.18], [0.12, 0.64, -0.32]], r0: 0.03, r1: 0.008 },
    { pts: [[-0.48, 0.07, 0.05], [-0.56, 0.12, 0.25], [-0.66, 0.08, 0.4]], r0: 0.035, r1: 0.01 },
    { pts: [[-0.55, 0.06, 0.02], [-0.7, 0.14, -0.15], [-0.78, 0.26, -0.24]], r0: 0.03, r1: 0.008 },
  ]
  for (const limb of limbs) b.add('matte', taperedTube(limb.pts, limb.r0, limb.r1, 36, 10), { color: def.color, colorFn: grain })
  // Knots and a hollow end
  b.add('matte', noiseRock(0.055, 3, 0.35, 1), { color: shade(def.color, -0.1), position: [0.02, 0.17, 0.07] })
  b.add('matte', noiseRock(0.045, 5, 0.35, 1), { color: shade(def.color, -0.12), position: [-0.32, 0.12, -0.07] })
  b.add('matte', new THREE.CircleGeometry(0.07, 16), { color: '#2a1a10', position: [-0.605, 0.05, 0.05], rotation: [0, -Math.PI / 2, 0] })
  return b.build()
}

export const buildFern: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  b.add('matte', taperedTube([[-0.14, 0.02, 0], [0, 0.045, 0.03], [0.14, 0.02, -0.02]], 0.03, 0.02, 10, 6), { color: '#4a3a2a' })
  const count = 13
  for (let i = 0; i < count; i++) {
    const len = 0.36 + rand() * 0.36
    const g = leafGeometry(len, 0.075 + rand() * 0.05, 0.3 + rand() * 0.3, 0.45, 8)
    g.rotateX(-(0.2 + rand() * 0.6))
    g.rotateY((i / count) * Math.PI * 2 + rand() * 0.5)
    b.add('swayLeaf', g, {
      color: shade(def.color, -0.12),
      colorTop: def.accentColor,
      position: [(rand() - 0.5) * 0.18, 0.03, (rand() - 0.5) * 0.1],
      mottle: 0.12,
    })
  }
  return b.build({ aoHeight: 0.18 })
}

export const buildGrass: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  for (let i = 0; i < 80; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * 0.4
    const len = 0.12 + rand() * 0.24
    const g = leafGeometry(len, 0.016, 0.4 + rand() * 0.6, 0, 3)
    g.rotateX(-rand() * 0.55)
    g.rotateY(rand() * Math.PI * 2)
    b.add('swayLeaf', g, { color: shade(def.color, -0.18), colorTop: def.accentColor, position: [Math.cos(a) * d, 0, Math.sin(a) * d] })
  }
  return b.build({ aoHeight: 0.12 })
}

export const buildKelp: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  // Holdfast at the base
  b.add('matte', noiseRock(0.1, 9, 0.4, 2), { color: shade(def.color, -0.3), position: [0, 0.02, 0], scale: [1.4, 0.5, 1.4] })
  for (let s = 0; s < 3; s++) {
    const h = 3.0 + rand() * 0.6
    const bx = (rand() - 0.5) * 0.25
    const bz = (rand() - 0.5) * 0.25
    const pts: V3[] = [
      [bx, 0, bz],
      [bx + rr(rand, -0.12, 0.12), h * 0.33, bz + rr(rand, -0.12, 0.12)],
      [bx + rr(rand, -0.18, 0.18), h * 0.66, bz + rr(rand, -0.18, 0.18)],
      [bx + rr(rand, -0.22, 0.22), h, bz + rr(rand, -0.22, 0.22)],
    ]
    b.add('sway', taperedTube(pts, 0.026, 0.012, 48, 6), { color: shade(def.color, -0.2), colorTop: def.color })
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)))
    const blades = 16
    for (let k = 0; k < blades; k++) {
      const t = 0.1 + (k / blades) * 0.88
      const p = curve.getPointAt(t)
      const blade = ribbonGeometry(0.32 + rand() * 0.22, 0.085 + rand() * 0.04, 12, rand() * 1.6, 0.05)
      blade.rotateZ((k % 2 ? 1 : -1) * (0.45 + rand() * 0.45))
      blade.rotateY(rand() * Math.PI * 2)
      b.add('swayLeaf', blade, { color: def.color, colorTop: def.accentColor, position: [p.x, p.y, p.z], mottle: 0.1 })
      b.add('sway', new THREE.SphereGeometry(0.028, 8, 6), { color: def.accentColor, position: [p.x, p.y, p.z], scale: [1, 1.35, 1] })
    }
  }
  return b.build({ aoHeight: 0.25 })
}

/** Recursive antler-like coral branching. */
function coralBranch(b: MeshBuilder, rand: Rand, start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, depth: number, color: string, tip: string, glowTips: boolean) {
  const end = start.clone().addScaledVector(dir, length)
  const mid = start.clone().addScaledVector(dir, length * 0.5).add(new THREE.Vector3(rr(rand, -0.02, 0.02), 0, rr(rand, -0.02, 0.02)))
  const colorFn = gradientY(color, tip, 0.05, 0.85)
  b.add('satin', taperedTube([[start.x, start.y, start.z], [mid.x, mid.y, mid.z], [end.x, end.y, end.z]], radius, radius * 0.75, 8, 8, true), {
    color,
    colorFn: (p, n, c) => {
      colorFn(p, n, c)
      c.multiplyScalar(0.9 + noise3(p.x * 30, p.y * 30, p.z * 30) * 0.15)
    },
  })
  if (depth === 0) {
    b.add(glowTips ? 'glow' : 'satin', new THREE.SphereGeometry(radius * (glowTips ? 1.25 : 0.85), 10, 8), { color: tip, position: [end.x, end.y, end.z] })
    return
  }
  const children = rand() < 0.45 ? 3 : 2
  for (let i = 0; i < children; i++) {
    const axis = new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).normalize()
    const next = dir.clone().applyAxisAngle(axis, rr(rand, 0.35, 0.8))
    next.y += 0.35
    next.normalize()
    coralBranch(b, rand, end, next, length * rr(rand, 0.7, 0.85), radius * 0.72, depth - 1, color, tip, glowTips)
  }
}

export const buildStaghorn: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const glowTips = def.styleTags.includes('sparkle')
  b.add('matte', noiseRock(0.16, 4, 0.35, 2), { color: shade(def.color, -0.35), position: [0, 0, 0], scale: [1.6, 0.4, 1.4] })
  for (let i = 0; i < 4; i++) {
    const yaw = (i / 4) * Math.PI * 2 + rand()
    const tilt = rr(rand, 0.15, 0.5)
    const dir = new THREE.Vector3(Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw))
    const start = new THREE.Vector3(Math.cos(yaw) * 0.06, 0.02, Math.sin(yaw) * 0.06)
    coralBranch(b, rand, start, dir, 0.22, 0.05, 3, def.color, def.accentColor, glowTips)
  }
  return b.build()
}

export const buildBrain: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const dome = (radius: number, seed: number) => {
    const g = new THREE.SphereGeometry(radius, 110, 44, 0, Math.PI * 2, 0, Math.PI / 2)
    const pos = g.getAttribute('position')
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const dir = v.clone().normalize()
      const ridge = 1 - Math.abs(noise3(dir.x * 5.5 + seed, dir.y * 5.5, dir.z * 5.5 - seed))
      const lump = noise3(dir.x * 1.5 + seed, dir.y * 1.5, dir.z * 1.5) * 0.08
      v.copy(dir).multiplyScalar(radius * (1 + Math.pow(ridge, 3) * 0.07 + lump))
      v.y *= 0.72
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    g.computeVertexNormals()
    return g
  }
  const ridgeColor = new THREE.Color(def.color)
  const grooveColor = new THREE.Color(def.accentColor)
  const colorFor = (seed: number) => (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    const dir = new THREE.Vector3(p.x, p.y / 0.72, p.z).normalize()
    const ridge = 1 - Math.abs(noise3(dir.x * 5.5 + seed, dir.y * 5.5, dir.z * 5.5 - seed))
    c.copy(grooveColor).lerp(ridgeColor, smoothstep(0.55, 0.9, ridge))
  }
  b.add('satin', dome(0.36, 1.3), { color: def.color, colorFn: colorFor(1.3) })
  b.add('satin', dome(0.18, 4.1), { color: def.color, position: [0.36, -0.01, 0.2], colorFn: (p, n, c) => colorFor(4.1)(p.clone().sub(new THREE.Vector3(0.36, -0.01, 0.2)), n, c) })
  return b.build()
}

type Place = (x: number, y: number, z: number) => V3

/** Branches split in a flat plane, like a real gorgonian fan. */
function fanBranch(b: MeshBuilder, rand: Rand, place: Place, x: number, y: number, z: number, angle: number, length: number, radius: number, depth: number, colorFn: ReturnType<typeof gradientY>) {
  const ex = x + Math.sin(angle) * length
  const ey = y + Math.cos(angle) * length
  const ez = z + rr(rand, -0.015, 0.015)
  const pts: V3[] = [place(x, y, z), place((x + ex) / 2 + rr(rand, -0.01, 0.01), (y + ey) / 2, (z + ez) / 2), place(ex, ey, ez)]
  b.add('sway', taperedTube(pts, radius, radius * 0.8, 5, 5, depth === 0), { color: '#ffffff', colorFn })
  if (depth === 0) return
  const spread = rr(rand, 0.25, 0.42)
  fanBranch(b, rand, place, ex, ey, ez, angle - spread, length * rr(rand, 0.75, 0.88), radius * 0.78, depth - 1, colorFn)
  fanBranch(b, rand, place, ex, ey, ez, angle + spread, length * rr(rand, 0.75, 0.88), radius * 0.78, depth - 1, colorFn)
}

export const buildSeaFan: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  b.add('matte', noiseRock(0.12, 6, 0.3, 2), { color: '#6d6278', scale: [1.4, 0.5, 1.2] })
  const fans: Array<{ offset: V3; yaw: number; scale: number }> = [
    { offset: [0, 0, 0], yaw: 0, scale: 1 },
    { offset: [0.2, 0, -0.12], yaw: 0.6, scale: 0.7 },
  ]
  const colorFn = gradientY(def.color, def.accentColor, 0, 1.1)
  for (const fan of fans) {
    const cos = Math.cos(fan.yaw)
    const sin = Math.sin(fan.yaw)
    const place: Place = (x, y, z) => [
      (x * cos + z * sin) * fan.scale + fan.offset[0],
      y * fan.scale + fan.offset[1],
      (-x * sin + z * cos) * fan.scale + fan.offset[2],
    ]
    fanBranch(b, rand, place, 0, 0, 0, 0, 0.24, 0.028, 5, colorFn)
  }
  return b.build({ aoHeight: 0.15 })
}

export const buildAnemone: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  b.add('satin', latheFrom([[0.15, 0], [0.17, 0.05], [0.14, 0.17], [0.155, 0.27], [0.21, 0.32], [0.12, 0.335], [0, 0.34]], 32), {
    color: shade(def.color, -0.25),
    colorTop: def.color,
    mottle: 0.1,
  })
  const tentacles = 56
  for (let i = 0; i < tentacles; i++) {
    const a = i * 2.39996
    const ring = Math.sqrt((i + 0.5) / tentacles) * 0.2
    const bx = Math.cos(a) * ring
    const bz = Math.sin(a) * ring
    const by = 0.33
    const out = 0.08 + rand() * 0.12
    const up = 0.12 + rand() * 0.12
    const pts: V3[] = [
      [bx, by, bz],
      [bx + Math.cos(a) * out * 0.4, by + up * 0.7, bz + Math.sin(a) * out * 0.4],
      [bx + Math.cos(a) * out, by + up, bz + Math.sin(a) * out],
    ]
    b.add('tentacle', taperedTube(pts, 0.017, 0.009, 8, 6), { color: def.color, colorTop: shade(def.color, 0.12) })
    b.add('tentacle', new THREE.SphereGeometry(0.015, 8, 6), { color: def.accentColor, position: pts[2] })
  }
  return b.build({ aoHeight: 0.15 })
}
