import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MeshBuilder, type V3 } from '../../geometry/MeshBuilder'
import { crystalGeometry, latheFrom, noiseRock } from '../../geometry/shapes'
import { noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { mossy, pose, rr, smoothstep, type Rand, type StaticBuilder } from './common'

// Late-game centrepieces: bigger, richer pieces for levels 21-28.

const UP = new THREE.Vector3(0, 1, 0)

/** A crystal whose base sits at `at` and whose tip points along `dir`. */
function pointedCrystal(radius: number, height: number, dir: THREE.Vector3, rand: Rand): THREE.BufferGeometry {
  const g = crystalGeometry(radius, height, radius * 1.7)
  g.rotateY(rand() * Math.PI)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()))
  return g
}

/** Turn a closed surface inside out (flip winding and normals) so it can be seen from within. */
function insideOut(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source
  for (const name of ['position', 'normal', 'uv']) {
    const attr = g.getAttribute(name)
    if (!attr) continue
    const size = attr.itemSize
    const a = attr.array as Float32Array
    for (let t = 0; t < attr.count; t += 3) {
      for (let k = 0; k < size; k++) {
        const i1 = (t + 1) * size + k
        const i2 = (t + 2) * size + k
        const tmp = a[i1]
        a[i1] = a[i2]
        a[i2] = tmp
      }
    }
  }
  const normals = g.getAttribute('normal')
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i))
  return g
}

/** Little runes: two or three tiny bars in a random arrangement. */
function addRune(b: MeshBuilder, center: V3, scale: number, color: string, rand: Rand, facing: 'z' | 'x' = 'z') {
  const bars = 2 + Math.floor(rand() * 2)
  for (let i = 0; i < bars; i++) {
    const vertical = rand() < 0.5
    const w = vertical ? 0.012 : rr(rand, 0.03, 0.05)
    const h = vertical ? rr(rand, 0.035, 0.055) : 0.012
    const off: V3 = facing === 'z'
      ? [center[0] + rr(rand, -0.015, 0.015) * scale, center[1] + rr(rand, -0.018, 0.018) * scale, center[2]]
      : [center[0], center[1] + rr(rand, -0.018, 0.018) * scale, center[2] + rr(rand, -0.015, 0.015) * scale]
    b.add('glow', new THREE.BoxGeometry(facing === 'z' ? w * scale : 0.01, h * scale, facing === 'z' ? 0.01 : w * scale), { color, position: off })
  }
}

export const buildCityGate: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const stone = def.color
  const dark = shade(stone, -0.22)
  const rune = def.accentColor
  const weathered = mossy(stone, '#6f9a4a', 0.55, 7)
  // Worn steps the gate stands on.
  b.add('matte', new RoundedBoxGeometry(1.32, 0.07, 0.56, 2, 0.02), { color: dark, position: [0, 0.035, 0], colorFn: mossy(dark, '#5f8a3a', 0.4) })
  b.add('matte', new RoundedBoxGeometry(1.12, 0.06, 0.44, 2, 0.02), { color: stone, position: [0, 0.095, 0], colorFn: weathered })
  for (const side of [-1, 1]) {
    const x = side * 0.4
    // Square pillars with carved bands and a flared capital.
    b.add('matte', new RoundedBoxGeometry(0.2, 0.78, 0.2, 2, 0.015), { color: stone, position: [x, 0.515, 0], colorFn: weathered })
    for (const y of [0.18, 0.5, 0.82]) {
      b.add('matte', new RoundedBoxGeometry(0.235, 0.035, 0.235, 2, 0.01), { color: dark, position: [x, y, 0], colorFn: mossy(dark, '#5f8a3a', 0.5) })
    }
    b.add('matte', new RoundedBoxGeometry(0.27, 0.07, 0.27, 2, 0.015), { color: stone, position: [x, 0.93, 0], colorFn: weathered })
    // A column of glowing runes down the front of each pillar.
    for (const y of [0.26, 0.35, 0.6, 0.7]) addRune(b, [x, y, 0.104], 1, rune, rand)
  }
  // Inner arch under the lintel.
  b.add('matte', new THREE.TorusGeometry(0.3, 0.045, 10, 28, Math.PI), { color: stone, position: [0, 0.7, 0], scale: [1, 1, 2.2], colorFn: weathered })
  b.add('glow', new THREE.TorusGeometry(0.3, 0.008, 6, 40, Math.PI), { color: rune, position: [0, 0.7, 0.1] })
  // Lintel, stepped crown and a glowing keystone disc.
  b.add('matte', new RoundedBoxGeometry(1.08, 0.13, 0.26, 2, 0.02), { color: stone, position: [0, 1.03, 0], colorFn: weathered })
  b.add('matte', new RoundedBoxGeometry(0.78, 0.07, 0.22, 2, 0.015), { color: dark, position: [0, 1.13, 0], colorFn: mossy(dark, '#5f8a3a', 0.5) })
  b.add('matte', new RoundedBoxGeometry(0.42, 0.06, 0.2, 2, 0.015), { color: stone, position: [0, 1.195, 0], colorFn: weathered })
  b.add('satin', new THREE.CylinderGeometry(0.075, 0.075, 0.03, 24), { color: dark, position: [0, 1.03, 0.13], rotation: [Math.PI / 2, 0, 0] })
  b.add('glow', new THREE.TorusGeometry(0.055, 0.009, 6, 24), { color: rune, position: [0, 1.03, 0.148] })
  b.add('glow', new THREE.SphereGeometry(0.022, 10, 8), { color: rune, position: [0, 1.03, 0.148] })
  for (let i = 0; i < 6; i++) addRune(b, [-0.42 + i * 0.168 + (i > 2 ? 0.02 : -0.02), 1.03, 0.133], 0.8, rune, rand)
  // A toppled column section, a broken stump and scattered rubble.
  b.add('matte', latheFrom([[0.0001, 0], [0.075, 0], [0.075, 0.36], [0.0001, 0.36]], 14), { color: stone, position: [0.66, 0.075, 0.28], rotation: [0, 0.5, Math.PI / 2], colorFn: weathered })
  b.add('matte', new THREE.CylinderGeometry(0.08, 0.09, 0.2, 14), { color: stone, position: [-0.66, 0.1, 0.24], colorFn: weathered })
  for (let i = 0; i < 7; i++) {
    const a = rr(rand, 0, Math.PI * 2)
    const r = rr(rand, 0.55, 0.75)
    b.add('matte', noiseRock(rr(rand, 0.035, 0.06), i + 3, 0.35, 1), { color: stone, position: [Math.cos(a) * r, 0.02, Math.sin(a) * r * 0.55 + 0.12], colorFn: weathered })
  }
  // A little coral has taken hold on the lintel.
  for (let i = 0; i < 5; i++) {
    b.add('satin', new THREE.SphereGeometry(rr(rand, 0.018, 0.03), 10, 8), { color: i % 2 ? '#ff8fae' : '#ffb36b', position: [0.42 + rr(rand, -0.05, 0.05), 1.11 + rr(rand, 0, 0.03), rr(rand, -0.06, 0.08)] })
  }
  return b.build({ aoHeight: 0.25 })
}

export const buildGlowCave: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const rock = def.color
  const glow = def.accentColor
  const rockColor = mossy(shade(rock, 0.18), '#3d7a6c', 0.45, 5)
  // Two rings of lumpy boulders make a short tunnel, open front and back.
  for (const z of [-0.2, 0.2]) {
    const n = 8
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI
      const r = rr(rand, 0.18, 0.24) * (i === 0 || i === n ? 1.25 : 1)
      b.add('matte', noiseRock(r, i * 3.1 + z * 10, 0.32, 2), {
        color: rock,
        position: [Math.cos(a) * 0.56, Math.sin(a) * 0.6 + 0.04, z + rr(rand, -0.04, 0.04)],
        scale: [1, 0.95, 1.25],
        colorFn: rockColor,
      })
    }
  }
  // A heavier cap stone on top and a floor of flat stones inside.
  b.add('matte', noiseRock(0.27, 11, 0.3, 2), { color: rock, position: [0.05, 0.72, 0], scale: [1.3, 0.7, 1.4], colorFn: rockColor })
  b.add('matte', noiseRock(0.3, 4, 0.25, 2), { color: shade(rock, 0.35), position: [0, -0.01, 0], scale: [1.3, 0.1, 1.2], mottle: 0.2 })
  // Crystals line the inside of the arch, pointing into the tunnel.
  const center = new THREE.Vector3()
  for (let i = 0; i < 16; i++) {
    const a = rr(rand, 0.25, Math.PI - 0.25)
    const z = rr(rand, -0.28, 0.28)
    const base = new THREE.Vector3(Math.cos(a) * 0.4, Math.sin(a) * 0.44 + 0.04, z)
    center.set(0, 0.18, z)
    const dir = center.sub(base).normalize().add(new THREE.Vector3(rr(rand, -0.3, 0.3), 0, rr(rand, -0.3, 0.3))).normalize()
    const r = rr(rand, 0.022, 0.045)
    b.add('glow', pointedCrystal(r, r * rr(rand, 2.4, 4), dir, rand), { color: shade(glow, -0.15), colorTop: shade(glow, 0.3), position: base.toArray() as V3 })
  }
  // Clusters at the mouths and a couple on the roof.
  const clusters: V3[] = [[-0.3, 0.02, 0.36], [0.34, 0.02, -0.34], [0.1, 0.03, 0.2], [-0.18, 0.86, 0.08], [0.32, 0.72, -0.12]]
  for (const [cx, cy, cz] of clusters) {
    for (let i = 0; i < 4; i++) {
      const dir = new THREE.Vector3(rr(rand, -0.5, 0.5), 1, rr(rand, -0.5, 0.5))
      const r = rr(rand, 0.025, 0.05)
      b.add('glow', pointedCrystal(r, r * rr(rand, 2.2, 3.6), dir, rand), {
        color: shade(glow, -0.2),
        colorTop: shade(glow, 0.35),
        position: [cx + rr(rand, -0.05, 0.05), cy, cz + rr(rand, -0.05, 0.05)],
      })
    }
  }
  return b.build({ aoHeight: 0.25 })
}

export const buildAtlantis: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const marble = def.color
  const gold = def.accentColor
  const goldDeep = shade(gold, -0.25)
  const veins = (p: THREE.Vector3, _n: THREE.Vector3, c: THREE.Color) => {
    // Faint grey marble veining.
    const v = Math.abs(noise3(p.x * 6 + p.y * 3, p.y * 9, p.z * 6))
    c.set(marble).multiplyScalar(0.93 + smoothstep(0.0, 0.08, v) * 0.07)
  }
  const lit = '#fff2c0'
  // Two-tier round platform with gold trim and front steps.
  b.add('satin', new THREE.CylinderGeometry(0.98, 1.02, 0.08, 56), { color: marble, position: [0, 0.04, 0], colorFn: veins })
  b.add('glossy', new THREE.TorusGeometry(0.985, 0.012, 6, 64), { color: gold, position: [0, 0.08, 0], rotation: [Math.PI / 2, 0, 0] })
  b.add('satin', new THREE.CylinderGeometry(0.82, 0.86, 0.08, 56), { color: marble, position: [0, 0.12, 0], colorFn: veins })
  for (let i = 0; i < 3; i++) {
    b.add('satin', new RoundedBoxGeometry(0.42 - i * 0.06, 0.04, 0.1, 2, 0.01), { color: marble, position: [0, 0.02 + i * 0.04, 0.98 - i * 0.08], colorFn: veins })
  }
  // A ring of columns (gap at the front) holding a gold-trimmed entablature.
  const column = latheFrom([[0.0001, 0], [0.058, 0], [0.058, 0.03], [0.044, 0.05], [0.038, 0.5], [0.05, 0.53], [0.06, 0.56], [0.0001, 0.56]], 12)
  const count = 14
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count
    if (Math.abs(Math.sin(a) - 1) < 0.03) continue
    b.add('satin', column.clone(), { color: marble, position: [Math.cos(a) * 0.7, 0.16, Math.sin(a) * 0.7], colorFn: veins })
  }
  column.dispose()
  b.add('satin', new THREE.TorusGeometry(0.7, 0.05, 4, 56), { color: marble, position: [0, 0.75, 0], rotation: [Math.PI / 2, 0, 0], colorFn: veins })
  b.add('glossy', new THREE.TorusGeometry(0.7, 0.014, 6, 56), { color: gold, position: [0, 0.71, 0], rotation: [Math.PI / 2, 0, 0] })
  // The central hall: a drum ringed with glowing windows under a golden dome.
  b.add('satin', new THREE.CylinderGeometry(0.38, 0.4, 0.55, 40), { color: marble, position: [0, 0.435, 0], colorFn: veins })
  b.add('glossy', new THREE.TorusGeometry(0.39, 0.02, 6, 48), { color: gold, position: [0, 0.71, 0], rotation: [Math.PI / 2, 0, 0] })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    b.add('glow', new RoundedBoxGeometry(0.06, 0.13, 0.02, 2, 0.01), {
      color: lit,
      position: [Math.cos(a) * 0.392, 0.46, Math.sin(a) * 0.392],
      rotation: [0, Math.PI / 2 - a, 0],
    })
  }
  b.add('glossy', new THREE.SphereGeometry(0.4, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2), { color: goldDeep, colorTop: gold, position: [0, 0.71, 0] })
  // Ribs down the dome.
  for (let i = 0; i < 8; i++) {
    b.add('glossy', new THREE.TorusGeometry(0.405, 0.008, 4, 20, Math.PI / 2), { color: shade(gold, 0.2), position: [0, 0.71, 0], rotation: [0, (i / 8) * Math.PI * 2, Math.PI / 2] })
  }
  b.add('satin', new THREE.CylinderGeometry(0.07, 0.09, 0.12, 20), { color: marble, position: [0, 1.16, 0] })
  b.add('glossy', new THREE.CylinderGeometry(0.02, 0.05, 0.08, 16), { color: gold, position: [0, 1.25, 0] })
  // Grand doorway at the front.
  b.add('satin', new THREE.BoxGeometry(0.16, 0.2, 0.04), { color: '#3a3326', position: [0, 0.26, 0.39] })
  b.add('satin', new THREE.CylinderGeometry(0.08, 0.08, 0.04, 20, 1, false, 0, Math.PI), { color: '#3a3326', position: [0, 0.36, 0.39], rotation: [Math.PI / 2, 0, Math.PI / 2] })
  b.add('glossy', new THREE.TorusGeometry(0.09, 0.012, 6, 20, Math.PI), { color: gold, position: [0, 0.36, 0.41] })
  // Two slender towers behind, each with a little dome and a glowing tip.
  for (const side of [-1, 1]) {
    const x = side * 0.5
    const z = -0.42
    b.add('satin', new THREE.CylinderGeometry(0.1, 0.12, 0.85, 24), { color: marble, position: [x, 0.585, z], colorFn: veins })
    b.add('glossy', new THREE.TorusGeometry(0.105, 0.012, 6, 24), { color: gold, position: [x, 0.98, z], rotation: [Math.PI / 2, 0, 0] })
    b.add('glossy', new THREE.SphereGeometry(0.12, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), { color: goldDeep, colorTop: gold, position: [x, 1.01, z] })
    b.add('glossy', new THREE.ConeGeometry(0.03, 0.16, 12), { color: gold, position: [x, 1.2, z] })
    b.add('lamp', new THREE.SphereGeometry(0.028, 12, 10), { color: gold, position: [x, 1.29, z] })
    for (let i = 0; i < 3; i++) {
      b.add('glow', new RoundedBoxGeometry(0.04, 0.08, 0.02, 2, 0.008), { color: lit, position: [x, 0.42 + i * 0.18, z + 0.115] })
    }
  }
  // Scattered gold coins and a pearl or two on the platform.
  for (let i = 0; i < 10; i++) {
    const a = rr(rand, 0, Math.PI * 2)
    const r = rr(rand, 0.45, 0.8)
    b.add('glossy', new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), { color: gold, position: [Math.cos(a) * r, 0.165, Math.sin(a) * r], rotation: [rr(rand, -0.3, 0.3), 0, rr(rand, -0.3, 0.3)] })
  }
  b.add('glossy', new THREE.SphereGeometry(0.03, 14, 10), { color: '#fff6f0', position: [0.3, 0.19, 0.55] })
  return b.build({ aoHeight: 0.18 })
}

/** Height the geode's centre sits at, and its rotation, so its glow FX can find the opening. */
export const GEODE_RADIUS = 0.36
export const GEODE_POSE = pose([-0.42, 0.25, 0], [0, GEODE_RADIUS * 0.82, 0])

export const buildGeode: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const R = GEODE_RADIUS
  const inner = R * 0.8
  const shell = def.color
  const purple = def.accentColor
  // Rough outer stone: the back half of a sphere, lumpy except at the cut rim.
  const outer = new THREE.SphereGeometry(R, 36, 22, Math.PI, Math.PI)
  const pos = outer.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const rim = smoothstep(0, R * 0.25, -v.z)
    const bump = noise3(v.x * 7, v.y * 7, v.z * 7) * 0.12 + noise3(v.x * 19, v.y * 19, v.z * 19) * 0.04
    v.multiplyScalar(1 + bump * rim)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  outer.computeVertexNormals()
  b.add('matte', outer, { color: shell, mottle: 0.25, colorFn: mossy(shell, shade(shell, -0.3), 0.4, 6) })
  // The hollow inside, seen from within.
  b.add('satin', insideOut(new THREE.SphereGeometry(inner, 28, 16, Math.PI, Math.PI)), { color: shade(purple, -0.45) })
  // Agate bands on the cut face, from crystal-pale at the hollow to stone at the rim.
  const bands = ['#efe6ff', '#b99ae0', '#f7f2ff', '#8d6fb3', '#d7c6ef', '#5f4b73'].map((c) => new THREE.Color(c))
  b.add('satin', new THREE.RingGeometry(inner, R, 64, 4), {
    color: shell,
    colorFn: (p, _n, c) => {
      const t = (Math.hypot(p.x, p.y) - inner) / (R - inner)
      const wobble = noise3(p.x * 14, p.y * 14, 0.3) * 0.12
      c.copy(bands[Math.min(bands.length - 1, Math.max(0, Math.floor((t + wobble) * bands.length)))])
    },
  })
  // Crystals packed over the hollow, all pointing at its heart.
  const dir = new THREE.Vector3()
  for (let i = 0; i < 46; i++) {
    const theta = Math.acos(rr(rand, -0.92, 0.92))
    const phi = Math.PI + rr(rand, 0.15, Math.PI - 0.15)
    dir.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
    const r = rr(rand, 0.028, 0.05)
    const pointIn = dir.clone().negate().add(new THREE.Vector3(rr(rand, -0.25, 0.25), rr(rand, -0.25, 0.25), 0.2))
    b.add('glow', pointedCrystal(r, r * rr(rand, 1.6, 2.8), pointIn, rand), {
      color: shade(purple, -0.25),
      colorTop: shade(purple, 0.35),
      position: dir.clone().multiplyScalar(inner + 0.012).toArray() as V3,
    })
  }
  const parts = b.build({ groundAO: false, transform: GEODE_POSE })
  // Loose shards that tumbled out onto the gravel.
  const loose = new MeshBuilder()
  for (let i = 0; i < 6; i++) {
    const a = rr(rand, -1.2, 1.2)
    const r = rr(rand, 0.38, 0.55)
    const d = new THREE.Vector3(rr(rand, -1, 1), rr(rand, 0.2, 0.8), rr(rand, -1, 1))
    const s = rr(rand, 0.025, 0.04)
    loose.add('glow', pointedCrystal(s, s * 2.4, d, rand), { color: shade(purple, -0.2), colorTop: shade(purple, 0.3), position: [Math.sin(a) * r, 0.005, Math.cos(a) * r] })
  }
  for (let i = 0; i < 4; i++) {
    loose.add('matte', noiseRock(rr(rand, 0.03, 0.05), i + 20, 0.4, 1), { color: shell, position: [rr(rand, -0.5, 0.5), 0.015, rr(rand, -0.2, 0.5)] })
  }
  return [...parts, ...loose.build({ aoHeight: 0.1 })]
}
