import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MeshBuilder, type V3 } from '../../geometry/MeshBuilder'
import { crystalGeometry, latheFrom, noiseRock, starfishGeometry, taperedTube } from '../../geometry/shapes'
import { noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { mossy, rr, smoothstep, type StaticBuilder } from './common'

export const buildCrystals: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  b.add('matte', noiseRock(0.26, 7, 0.3, 3), { color: '#5d5670', position: [0, 0.02, 0], scale: [1.35, 0.45, 1.2], colorFn: mossy('#5d5670', '#46405a', 0.5) })
  const crystals: Array<{ r: number; h: number; x: number; z: number; tiltX: number; tiltZ: number; accent: boolean }> = [
    { r: 0.085, h: 0.55, x: 0, z: 0, tiltX: 0.05, tiltZ: -0.08, accent: false },
    { r: 0.06, h: 0.38, x: 0.14, z: 0.06, tiltX: 0.2, tiltZ: -0.5, accent: true },
    { r: 0.055, h: 0.32, x: -0.13, z: 0.08, tiltX: 0.25, tiltZ: 0.55, accent: false },
    { r: 0.05, h: 0.28, x: 0.05, z: -0.14, tiltX: -0.5, tiltZ: -0.15, accent: true },
    { r: 0.045, h: 0.22, x: -0.08, z: -0.1, tiltX: -0.45, tiltZ: 0.4, accent: false },
    { r: 0.04, h: 0.18, x: 0.2, z: -0.08, tiltX: -0.3, tiltZ: -0.8, accent: false },
    { r: 0.035, h: 0.16, x: -0.2, z: -0.02, tiltX: 0.1, tiltZ: 0.85, accent: true },
    { r: 0.03, h: 0.12, x: 0.1, z: 0.17, tiltX: 0.7, tiltZ: -0.3, accent: false },
    { r: 0.03, h: 0.1, x: -0.14, z: 0.17, tiltX: 0.8, tiltZ: 0.4, accent: true },
  ]
  for (const c of crystals) {
    const g = crystalGeometry(c.r, c.h, c.r * 1.7)
    g.rotateZ(c.tiltZ)
    g.rotateX(c.tiltX)
    g.rotateY(rand() * Math.PI)
    const color = c.accent ? def.accentColor : def.color
    b.add('glow', g, { color: shade(color, -0.12), colorTop: shade(color, 0.18), position: [c.x, 0.07, c.z] })
  }
  return b.build()
}

function scallop(radius: number, ribs: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, 36, Math.PI * 0.08, Math.PI * 0.84)
  const pos = g.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const r = Math.hypot(x, y) / radius
    const a = Math.atan2(y, x)
    pos.setZ(i, (1 - r * r) * radius * 0.35 + Math.cos(a * ribs) * radius * 0.04 * r)
  }
  g.computeVertexNormals()
  return g
}

export const buildShells: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  // Spiral conch shells: a tube wound around a narrowing cone.
  const conch = (size: number): THREE.BufferGeometry => {
    const pts: V3[] = []
    for (let k = 0; k <= 26; k++) {
      const a = k * 0.62
      const r = size * 0.55 * (1 - k / 28)
      pts.push([Math.cos(a) * r, (k / 26) * size * 1.3, Math.sin(a) * r])
    }
    return taperedTube(pts, size * 0.42, size * 0.02, 90, 10)
  }
  const shellColor = new THREE.Color(def.color)
  const stripe = new THREE.Color(shade(def.color, -0.18))
  const conchColor = (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    const s = Math.sin(Math.atan2(p.z, p.x) * 3 + p.y * 30)
    c.copy(shellColor).lerp(stripe, smoothstep(0.3, 0.8, s))
  }
  const conches: Array<{ size: number; p: V3; r: V3 }> = [
    { size: 0.12, p: [0.12, 0.07, 0.02], r: [0.2, 0.4, Math.PI / 2 - 0.2] },
    { size: 0.08, p: [-0.2, 0.05, 0.14], r: [0.1, 2.2, Math.PI / 2 + 0.3] },
  ]
  for (const c of conches) b.add('glossy', conch(c.size), { color: def.color, position: c.p, rotation: c.r, colorFn: conchColor })
  // Scallops
  const scallopSpots: Array<{ p: V3; yaw: number; s: number; color: string }> = [
    { p: [-0.08, 0.03, -0.15], yaw: 0.4, s: 1, color: shade(def.color, 0.08) },
    { p: [0.24, 0.02, -0.12], yaw: 2.2, s: 0.75, color: '#fff1e6' },
    { p: [-0.26, 0.02, -0.06], yaw: -0.8, s: 0.65, color: '#ffd6b8' },
  ]
  for (const sc of scallopSpots) {
    const g = scallop(0.1 * sc.s, 16)
    g.rotateX(-Math.PI / 2 + 0.25)
    g.rotateY(sc.yaw)
    b.add('satin', g, { color: sc.color, position: sc.p, mottle: 0.12 })
  }
  // Starfish with a bumpy top
  const star = starfishGeometry(0.14, 0.035)
  const starColor = new THREE.Color(def.accentColor)
  b.add('satin', star, {
    color: def.accentColor,
    position: [0.02, 0.02, 0.2],
    rotation: [0, rand() * 6, 0.08],
    colorFn: (p, _n, c) => {
      const bumps = noise3(p.x * 60, p.y * 60, p.z * 60)
      c.copy(starColor).multiplyScalar(0.85 + bumps * 0.25)
    },
  })
  // Sand dollar with a five-petal flower
  const dollarColor = new THREE.Color('#efe3c8')
  b.add('satin', new THREE.CylinderGeometry(0.075, 0.08, 0.012, 32), {
    color: '#efe3c8',
    position: [-0.28, 0.01, 0.26],
    rotation: [0.06, 0, 0.05],
    colorFn: (p, n, c) => {
      const x = p.x + 0.28
      const z = p.z - 0.26
      const petal = Math.cos(Math.atan2(z, x) * 5) * 0.5 + 0.5
      const r = Math.hypot(x, z)
      const mark = n.y > 0.5 && r > 0.015 && r < 0.05 && petal > 0.75 ? 0.75 : 1
      c.copy(dollarColor).multiplyScalar(mark)
    },
  })
  return b.build({ aoHeight: 0.06 })
}

/** Half of a scalloped clam shell: a shallow ribbed bowl, hinge along the Z axis. */
export function clamShellGeometry(radius: number, depth: number): THREE.BufferGeometry {
  // Only half a revolution (x >= 0), so the hinge runs along the Z axis at x = 0.
  const g = new THREE.LatheGeometry(
    [
      [0.0001, -depth],
      [radius * 0.35, -depth * 0.92],
      [radius * 0.7, -depth * 0.6],
      [radius * 0.92, -depth * 0.2],
      [radius, 0],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    40,
    0,
    Math.PI,
  )
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const a = Math.atan2(v.x, v.z)
    const r = Math.hypot(v.x, v.z) / radius
    const rib = Math.cos(a * 9) * r
    v.x *= 1 + rib * 0.05
    v.z *= 1 + rib * 0.05
    v.y += Math.cos(a * 9) * depth * 0.18 * r * r
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

export const CLAM_RADIUS = 0.36
export const CLAM_DEPTH = 0.13
/** X of the hinge line, chosen so the shell is centred on the decoration origin. */
export const CLAM_HINGE_X = -0.17

export const buildClamBase: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const R = CLAM_RADIUS
  const D = CLAM_DEPTH
  const shell = new THREE.Color(def.color)
  const shellDark = new THREE.Color(shade(def.color, -0.2))
  b.add('thin', clamShellGeometry(R, D), {
    color: def.color,
    position: [CLAM_HINGE_X, D, 0],
    colorFn: (p, _n, c) => {
      const band = Math.sin(Math.hypot(p.x - CLAM_HINGE_X, p.z) * 60)
      c.copy(shell).lerp(shellDark, smoothstep(0.2, 0.9, band) * 0.6)
    },
  })
  // Soft mantle lining the lip, speckled with glowing spots.
  const mantle = new THREE.Color('#3aa7c9')
  const spot = new THREE.Color('#aef6ff')
  const lip = new THREE.TorusGeometry(R * 0.8, 0.045, 10, 40, Math.PI)
  lip.rotateX(Math.PI / 2)
  lip.rotateY(Math.PI / 2)
  b.add('glow', lip, {
    color: '#3aa7c9',
    position: [CLAM_HINGE_X, D + 0.005, 0],
    scale: [1, 0.6, 1],
    colorFn: (p, _n, c) => {
      const s = noise3(p.x * 40, p.y * 40, p.z * 40)
      c.copy(mantle).multiplyScalar(0.45).lerp(spot, smoothstep(0.35, 0.55, s))
    },
  })
  b.add('glow', new THREE.SphereGeometry(0.075, 28, 20), { color: def.accentColor, position: [CLAM_HINGE_X + 0.16, D + 0.02, 0] })
  return b.build({ aoHeight: 0.12 })
}

export const buildClamLid: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const shell = new THREE.Color(def.color)
  const shellDark = new THREE.Color(shade(def.color, -0.2))
  const g = clamShellGeometry(0.36, 0.13)
  g.scale(1, -1, 1)
  b.add('thin', g, {
    color: def.color,
    colorFn: (p, _n, c) => {
      const band = Math.sin(Math.hypot(p.x, p.z) * 60)
      c.copy(shell).lerp(shellDark, smoothstep(0.2, 0.9, band) * 0.6)
    },
  })
  return b.build({ groundAO: false })
}

export const buildPalace: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const pink = '#ffc6e8'
  const mint = '#bdf5e6'
  const lilac = def.color
  const glow = def.accentColor
  b.add('satin', new THREE.CylinderGeometry(0.62, 0.66, 0.1, 40), { color: '#f7f0ff', position: [0, 0.03, 0], mottle: 0.05 })
  b.add('satin', new THREE.CylinderGeometry(0.5, 0.52, 0.06, 40), { color: pink, position: [0, 0.1, 0] })
  // Central tower with balcony, spire and a glowing orb.
  b.add('satin', new THREE.CylinderGeometry(0.15, 0.17, 1.0, 28), { color: lilac, position: [0, 0.62, 0], colorTop: '#ffffff' })
  b.add('satin', new THREE.TorusGeometry(0.19, 0.025, 8, 32), { color: pink, position: [0, 0.82, 0], rotation: [Math.PI / 2, 0, 0] })
  b.add('satin', new THREE.ConeGeometry(0.2, 0.5, 28), { color: pink, colorTop: '#ffffff', position: [0, 1.37, 0] })
  b.add('glow', new THREE.SphereGeometry(0.055, 16, 12), { color: glow, position: [0, 1.66, 0] })
  for (let i = 0; i < 10; i++) {
    const a = i * 0.9
    b.add('glow', new THREE.SphereGeometry(0.02, 8, 6), { color: pink, position: [Math.cos(a) * 0.165, 0.2 + i * 0.07, Math.sin(a) * 0.165] })
  }
  // Four side towers with alternating pastel spires.
  const towers: Array<{ x: number; z: number; h: number; roof: string }> = [
    { x: 0.36, z: 0.24, h: 0.62, roof: mint },
    { x: -0.36, z: 0.24, h: 0.55, roof: pink },
    { x: 0.32, z: -0.28, h: 0.72, roof: pink },
    { x: -0.32, z: -0.28, h: 0.68, roof: mint },
  ]
  for (const t of towers) {
    b.add('satin', new THREE.CylinderGeometry(0.085, 0.095, t.h, 22), { color: lilac, colorTop: '#ffffff', position: [t.x, 0.13 + t.h / 2, t.z] })
    b.add('satin', new THREE.ConeGeometry(0.12, 0.32, 22), { color: t.roof, colorTop: '#ffffff', position: [t.x, 0.13 + t.h + 0.16, t.z] })
    b.add('glow', new THREE.SphereGeometry(0.03, 10, 8), { color: glow, position: [t.x, 0.13 + t.h + 0.34, t.z] })
    b.add('glow', new RoundedBoxGeometry(0.05, 0.08, 0.02, 2, 0.01), { color: '#ffe9a8', position: [t.x + Math.sign(t.x) * 0.02, 0.13 + t.h * 0.7, t.z + 0.085] })
  }
  // Curtain walls with a scalloped top between the front towers.
  b.add('satin', new THREE.BoxGeometry(0.6, 0.32, 0.08), { color: lilac, position: [0, 0.29, 0.26] })
  for (let i = 0; i < 6; i++) b.add('satin', new THREE.SphereGeometry(0.05, 12, 8), { color: pink, position: [-0.25 + i * 0.1, 0.45, 0.26] })
  b.add('satin', new THREE.BoxGeometry(0.08, 0.32, 0.5), { color: lilac, position: [0.34, 0.29, -0.02] })
  b.add('satin', new THREE.BoxGeometry(0.08, 0.32, 0.5), { color: lilac, position: [-0.34, 0.29, -0.02] })
  // Arched door and glowing windows
  b.add('satin', new THREE.BoxGeometry(0.15, 0.16, 0.03), { color: '#5b3f7a', position: [0, 0.21, 0.3] })
  b.add('satin', new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20, 1, false, 0, Math.PI), { color: '#5b3f7a', position: [0, 0.29, 0.3], rotation: [Math.PI / 2, 0, Math.PI / 2] })
  for (const x of [-0.18, 0.18]) b.add('glow', new RoundedBoxGeometry(0.06, 0.1, 0.02, 2, 0.01), { color: '#ffe9a8', position: [x, 0.33, 0.305] })
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i - 1) * 0.7
    b.add('glow', new RoundedBoxGeometry(0.05, 0.1, 0.02, 2, 0.01), { color: '#ffe9a8', position: [Math.cos(a) * 0.16, 0.55 + i * 0.12, Math.sin(a) * 0.16], rotation: [0, -a + Math.PI / 2, 0] })
  }
  return b.build({ aoHeight: 0.2 })
}

export const buildArch: StaticBuilder = () => {
  const b = new MeshBuilder()
  const bands = ['#ff4d6d', '#ff9f43', '#ffd93d', '#6bdb6b', '#4db8ff', '#8b6bff']
  bands.forEach((color, i) => {
    b.add('glow', new THREE.TorusGeometry(0.64 - i * 0.065, 0.034, 12, 56, Math.PI), { color, position: [0, 0.08, 0] })
  })
  const cloud = new THREE.Color('#ffffff')
  const shadow = new THREE.Color('#c9d8ff')
  for (const side of [1, -1]) {
    const puffs: Array<[number, number, number, number]> = [
      [0.58, 0.08, 0.02, 0.15],
      [0.72, 0.06, -0.04, 0.11],
      [0.46, 0.05, 0.08, 0.1],
      [0.6, 0.18, -0.03, 0.1],
      [0.66, 0.06, 0.12, 0.09],
    ]
    for (const [x, y, z, r] of puffs) {
      b.add('glossy', new THREE.SphereGeometry(r, 18, 12), {
        color: '#ffffff',
        position: [side * x, y, z],
        colorFn: (_p, n, c) => c.copy(cloud).lerp(shadow, smoothstep(0.2, -0.8, n.y) * 0.6),
      })
    }
  }
  return b.build({ aoHeight: 0.12 })
}

export const buildMushrooms: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  b.add('matte', noiseRock(0.2, 12, 0.35, 2), { color: '#3f5a3a', position: [0, 0.0, 0], scale: [1.8, 0.35, 1.6], colorFn: mossy('#3f5a3a', '#6b8f4a', 0.8) })
  const shrooms: Array<{ x: number; z: number; h: number; cap: number; color: string }> = [
    { x: 0, z: 0, h: 0.42, cap: 0.17, color: def.color },
    { x: 0.2, z: 0.1, h: 0.26, cap: 0.11, color: def.accentColor },
    { x: -0.18, z: 0.12, h: 0.22, cap: 0.1, color: def.color },
    { x: 0.1, z: -0.2, h: 0.3, cap: 0.12, color: def.accentColor },
    { x: -0.12, z: -0.16, h: 0.16, cap: 0.075, color: def.color },
    { x: 0.28, z: -0.08, h: 0.12, cap: 0.06, color: def.color },
    { x: -0.3, z: -0.02, h: 0.1, cap: 0.055, color: def.accentColor },
  ]
  for (const s of shrooms) {
    const stem = s.cap * 0.28
    const lean = rr(rand, -0.15, 0.15)
    const stemGeo = latheFrom([[stem * 1.4, 0], [stem, s.h * 0.2], [stem * 0.85, s.h * 0.8], [stem * 0.95, s.h]], 16)
    stemGeo.rotateZ(lean)
    b.add('satin', stemGeo, { color: '#f4efe6', colorTop: '#fffaf2', position: [s.x, 0.02, s.z] })
    const capGeo = latheFrom(
      [
        [0.0001, s.h + s.cap * 0.55],
        [s.cap * 0.5, s.h + s.cap * 0.48],
        [s.cap * 0.85, s.h + s.cap * 0.26],
        [s.cap, s.h + s.cap * 0.02],
        [s.cap * 0.9, s.h - 0.01],
        [stem, s.h - 0.005],
      ],
      28,
    )
    capGeo.rotateZ(lean)
    const capColor = new THREE.Color(s.color)
    const dot = new THREE.Color('#ffffff')
    b.add('glow', capGeo, {
      color: s.color,
      position: [s.x, 0.02, s.z],
      colorFn: (p, n, c) => {
        const spots = noise3(p.x * 45, p.y * 45, p.z * 45)
        c.copy(capColor).multiplyScalar(n.y < -0.2 ? 0.45 : 1)
        if (n.y > 0.2) c.lerp(dot, smoothstep(0.45, 0.55, spots))
      },
    })
  }
  return b.build({ aoHeight: 0.1 })
}
