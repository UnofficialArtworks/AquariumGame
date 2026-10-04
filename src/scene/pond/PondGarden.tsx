import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshBuilder, type BuiltPart, type V3 } from '../geometry/MeshBuilder'
import { taperedTube } from '../geometry/shapes'
import { makeAqua, aquaUniforms, resetWaterBox } from '../materials/aquaShader'
import { atmosphere } from '../Atmosphere'
import { FLOOR_Y, HALF_DEPTH, HALF_WIDTH, onTankResize, waterLevel, WATER_LINE_Y } from '../TankBounds'
import { mulberry32 } from '../../utils/rng'
import { noise2, noise3 } from '../../utils/noise'

/**
 * The Koi Pond is a real garden pond, not a glass tank: a pond-shaped hole in
 * a lawn with earthy banks going down to the pebbles, half-buried rim stones,
 * reeds and cattails, flowers, bushes and trees, a stone lantern, lily pads
 * floating on the surface and an open sky. The fish swim in the same water
 * volume as the aquarium, so all the fish behaviour carries over; you just
 * look down into it from above, through the water.
 */

/** The lawn sits a little above the water line, so the pond has a lip. */
export const GROUND_Y = WATER_LINE_Y + 0.16
let RX = HALF_WIDTH + 0.4
let RZ = HALF_DEPTH + 0.42
onTankResize(() => {
  RX = HALF_WIDTH + 0.4
  RZ = HALF_DEPTH + 0.42
  POND_OUTLINE_RADII[0] = RX
  POND_OUTLINE_RADII[2] = RZ
})

/** The pond's edge: a rounded, slightly wobbly shape that encloses the whole swimming space. */
function outline(scale = 1, n = 120): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    // A squircle (rounded rectangle) with a gentle organic wobble that only bulges outward.
    const wobble = 1 + 0.035 * (1 + Math.sin(a * 3 + 1.3)) + 0.025 * (1 + Math.sin(a * 5 + 0.4))
    pts.push([Math.sign(c) * Math.pow(Math.abs(c), 0.5) * RX * wobble * scale, Math.sign(s) * Math.pow(Math.abs(s), 0.5) * RZ * wobble * scale])
  }
  return pts
}

// Plain (above-water) materials: no underwater tint or caustics on the lawn and trees.
const garden = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  satin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
  glossy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }),
  glow: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: '#ffd27a', emissiveIntensity: 0 }),
  lamp: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: '#ffcf6a', emissiveIntensity: 0 }),
  tentacle: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
} as const
// The banks are underwater, so they do get the water tint and caustics.
const bankMaterial = makeAqua(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { causticsFacingUp: true }, 'pond-bank')

function Parts({ parts, shadows = false }: { parts: BuiltPart[]; shadows?: boolean }) {
  return (
    <>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={garden[p.material as keyof typeof garden] ?? garden.matte} castShadow={shadows} receiveShadow />
      ))}
    </>
  )
}

/** Lawn with a pond-shaped hole, coloured with soft patches of lighter and darker grass. */
function buildLawn() {
  const shape = new THREE.Shape()
  shape.moveTo(-60, -60)
  shape.lineTo(60, -60)
  shape.lineTo(60, 60)
  shape.lineTo(-60, 60)
  shape.closePath()
  const hole = new THREE.Path()
  outline().forEach(([x, z], i) => (i === 0 ? hole.moveTo(x, -z) : hole.lineTo(x, -z)))
  hole.closePath()
  shape.holes.push(hole)
  const geometry = new THREE.ShapeGeometry(shape, 1)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, GROUND_Y, 0)
  const light = new THREE.Color('#7ccf4f')
  const dark = new THREE.Color('#3f9a3a')
  const dirt = new THREE.Color('#8a6a45')
  const b = new MeshBuilder()
  b.add('matte', geometry, {
    color: light,
    colorFn: (p, _n, c) => {
      const n = noise2(p.x * 0.18, p.z * 0.18) * 0.5 + noise2(p.x * 0.7, p.z * 0.7) * 0.25
      c.copy(dark).lerp(light, THREE.MathUtils.clamp(0.55 + n, 0, 1))
      // A little bare earth right at the water's edge.
      const edge = Math.pow(Math.abs(p.x) / (RX + 0.5), 4) + Math.pow(Math.abs(p.z) / (RZ + 0.5), 4)
      if (edge < 1.15) c.lerp(dirt, 0.35)
    },
  })
  return b.build({ groundAO: false })
}

/** The pond's sides and floor: earth and stone going down to the pebbles. */
function buildBanks() {
  const top = outline(1, 120)
  // The banks slope in to meet the pebble bed, rounding off its corners.
  const bottom = outline(0.915, 120)
  const positions: number[] = []
  const colors: number[] = []
  const index: number[] = []
  const rows = 6
  const earth = new THREE.Color('#5b4632')
  const moss = new THREE.Color('#6f8a42')
  const stone = new THREE.Color('#b0a690')
  const sand = new THREE.Color('#d1c09a')
  const c = new THREE.Color()
  for (let r = 0; r <= rows; r++) {
    const t = r / rows
    const y = THREE.MathUtils.lerp(GROUND_Y + 0.02, FLOOR_Y - 0.05, t)
    top.forEach(([tx, tz], i) => {
      const [bx, bz] = bottom[i]
      const bulge = Math.sin(t * Math.PI) * 0.12 * (0.6 + 0.4 * noise2(i * 0.3, t * 3))
      const x = THREE.MathUtils.lerp(tx, bx, t) * (1 + bulge * 0.03)
      const z = THREE.MathUtils.lerp(tz, bz, t) * (1 + bulge * 0.05)
      positions.push(x, y, z)
      // Mossy at the top, stony in the middle, sandy near the bottom, in soft blotches.
      const blotch = noise2(i * 0.18, t * 2.2) * 0.5 + noise2(i * 0.5 + 7, t * 5) * 0.25
      c.copy(moss).lerp(stone, THREE.MathUtils.clamp(t * 2.2 + blotch, 0, 1))
      c.lerp(sand, THREE.MathUtils.clamp((t - 0.55) * 2 + blotch * 0.5, 0, 1))
      if (blotch < -0.3) c.lerp(earth, 0.4)
      colors.push(c.r, c.g, c.b)
    })
  }
  const n = top.length
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i
      const b2 = r * n + ((i + 1) % n)
      const d = (r + 1) * n + i
      const e = (r + 1) * n + ((i + 1) % n)
      index.push(a, d, b2, b2, d, e)
    }
  }
  const walls = new THREE.BufferGeometry()
  walls.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  walls.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  walls.setIndex(index)
  walls.computeVertexNormals()
  // A dark earthy floor under the pebbles, so the rounded corners have a bottom too.
  const floorShape = new THREE.Shape()
  bottom.forEach(([x, z], i) => (i === 0 ? floorShape.moveTo(x, -z) : floorShape.lineTo(x, -z)))
  const floor = new THREE.ShapeGeometry(floorShape, 1)
  floor.rotateX(-Math.PI / 2)
  floor.translate(0, FLOOR_Y + 0.05, 0)
  const fc: number[] = []
  const pebble = new THREE.Color('#8a7e6c')
  for (let i = 0; i < floor.getAttribute('position').count; i++) fc.push(pebble.r, pebble.g, pebble.b)
  floor.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3))
  return [walls, floor]
}

/** True when (x, z) is clear of the pond and its rim. */
function onLawn(x: number, z: number, margin = 0.7): boolean {
  return Math.pow(Math.abs(x) / (RX + margin), 4) + Math.pow(Math.abs(z) / (RZ + margin), 4) > 1
}

/** A natural, lumpy stone: a noisy sphere with a flatter base, mossy where it faces the sky. */
function addStone(b: MeshBuilder, rand: () => number, at: V3, size: number, base: string) {
  const geo = new THREE.IcosahedronGeometry(1, 2)
  const pos = geo.getAttribute('position')
  const v = new THREE.Vector3()
  const seed = rand() * 100
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    v.multiplyScalar(1 + noise3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6) * 0.22)
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.2
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  const stone = new THREE.Color(base)
  const moss = new THREE.Color('#6f9a3e')
  b.add('matte', geo, {
    color: base,
    mottle: 0.1,
    position: at,
    rotation: [0, rand() * Math.PI * 2, 0],
    scale: [size * (1.1 + rand() * 0.5), size * (0.55 + rand() * 0.2), size],
    colorFn: (p, n, c) => {
      const speck = noise3(p.x * 9, p.y * 9, p.z * 9) * 0.08
      c.copy(stone).offsetHSL(0, 0, speck)
      // Moss settles on the tops of stones by the water.
      if (n.y > 0.55 && noise3(p.x * 3 + 5, p.y * 3, p.z * 3) > 0.05) c.lerp(moss, 0.55)
    },
  })
}

/** Stones half-buried round the rim, with little pebbles tucked in between and gaps where plants grow. */
function buildRimStones(rand: () => number) {
  const b = new MeshBuilder()
  const tones = ['#b3a894', '#9c9384', '#c4b9a3', '#8d867a', '#a99d86']
  outline(1.03, 52).forEach(([x, z], i) => {
    if (i % 13 === 4 || rand() < 0.08) return
    const s = 0.24 + rand() * 0.2
    addStone(b, rand, [x * (1 + rand() * 0.03), GROUND_Y + s * 0.05, z * (1 + rand() * 0.05)], s, tones[i % tones.length])
  })
  outline(1.1, 70).forEach(([x, z], i) => {
    if (rand() < 0.35) return
    const s = 0.08 + rand() * 0.09
    addStone(b, rand, [x + (rand() - 0.5) * 0.3, GROUND_Y + s * 0.1, z + (rand() - 0.5) * 0.25], s, tones[(i + 2) % tones.length])
  })
  // Flat stepping stones leading up to the water at the front.
  for (let k = 0; k < 6; k++) {
    const z = RZ * 1.12 + 0.3 + k * 0.62
    const x = Math.sin(k * 1.3) * 0.35 + 0.6
    const disc = new THREE.CylinderGeometry(0.3, 0.33, 0.07, 10)
    b.add('matte', disc, { color: '#a49c8c', colorTop: '#c7bfae', mottle: 0.12, position: [x, GROUND_Y + 0.02, z], rotation: [0, rand() * 3, 0], scale: [1 + rand() * 0.25, 1, 0.85] })
  }
  return b.build({ groundAO: false })
}

/** One flower: a daisy, a tulip or a lavender spike, with leaves at its foot. */
function addFlower(b: MeshBuilder, rand: () => number, x: number, z: number, kind: 'daisy' | 'tulip' | 'lavender', color: string) {
  const h = kind === 'lavender' ? 0.35 + rand() * 0.15 : 0.18 + rand() * 0.14
  const lean = (rand() - 0.5) * 0.08
  const top: V3 = [x + lean, GROUND_Y + h, z]
  b.add('satin', taperedTube([[x, GROUND_Y, z], [x + lean * 0.5, GROUND_Y + h * 0.5, z], top], 0.008, 0.006, 5, 4), { color: '#4b8f36' })
  for (let l = 0; l < 2; l++) {
    const a = rand() * Math.PI * 2
    b.add('satin', new THREE.ConeGeometry(0.025, 0.12, 3), {
      color: '#3f8a34',
      colorTop: '#79bf55',
      position: [x + Math.cos(a) * 0.03, GROUND_Y + 0.05, z + Math.sin(a) * 0.03],
      rotation: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6],
      scale: [1, 1, 0.35],
    })
  }
  if (kind === 'daisy') {
    for (let p = 0; p < 7; p++) {
      const a = (p / 7) * Math.PI * 2
      b.add('satin', new THREE.SphereGeometry(0.03, 6, 4), {
        color,
        position: [top[0] + Math.cos(a) * 0.035, top[1], top[2] + Math.sin(a) * 0.035],
        rotation: [0, -a, 0.25],
        scale: [1.2, 0.25, 0.55],
      })
    }
    b.add('glossy', new THREE.SphereGeometry(0.018, 6, 5), { color: '#ffc93a', position: [top[0], top[1] + 0.008, top[2]], scale: [1, 0.6, 1] })
  } else if (kind === 'tulip') {
    for (let p = 0; p < 3; p++) {
      const a = (p / 3) * Math.PI * 2
      b.add('glossy', new THREE.SphereGeometry(0.03, 8, 6), {
        color,
        colorTop: '#ffffff',
        position: [top[0] + Math.cos(a) * 0.012, top[1] + 0.03, top[2] + Math.sin(a) * 0.012],
        rotation: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25],
        scale: [0.75, 1.5, 0.75],
      })
    }
  } else {
    for (let p = 0; p < 7; p++) {
      b.add('satin', new THREE.SphereGeometry(0.016, 5, 4), { color, position: [top[0], top[1] - p * 0.025, top[2]], scale: [1, 1.3, 1] })
    }
  }
}

/** Reeds and iris at the water's edge, flowerbeds and grass tufts on the lawn, and flowering bushes. */
function buildPlants(rand: () => number) {
  const b = new MeshBuilder()
  const ring = outline(1.13, 60)
  // Clumps of reeds with cattails, and broad iris leaves, at spots round the edge.
  for (const at of [3, 9, 17, 25, 33, 41, 50, 56]) {
    const [cx, cz] = ring[at]
    for (let k = 0; k < 10; k++) {
      const x = cx + (rand() - 0.5) * 0.7
      const z = cz + (rand() - 0.5) * 0.5
      const h = 0.9 + rand() * 1.1
      const lean = (rand() - 0.5) * 0.25
      b.add('satin', taperedTube([[x, GROUND_Y, z], [x + lean * 0.4, GROUND_Y + h * 0.6, z], [x + lean, GROUND_Y + h, z + lean * 0.3]], 0.024, 0.005, 8, 5), {
        color: '#4f8f3a',
        colorTop: '#9ccb5e',
      })
      if (k % 3 === 0) {
        b.add('satin', new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), { color: '#6b4426', colorTop: '#8a5a32', position: [x + lean * 0.8, GROUND_Y + h * 0.82, z + lean * 0.24] })
      }
    }
    // Iris: flat sword leaves fanning out, with a purple bloom or two.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7 - 0.5) * 1.2
      const h = 0.5 + rand() * 0.3
      b.add('satin', new THREE.ConeGeometry(0.05, h, 3), {
        color: '#3f7f3a',
        colorTop: '#86b85a',
        position: [cx + 0.4 + Math.sin(a) * 0.12, GROUND_Y + h / 2, cz + 0.15],
        rotation: [0, 0, a * 0.5],
        scale: [1, 1, 0.25],
      })
    }
    if (at % 2) addFlower(b, rand, cx + 0.42, cz + 0.12, 'tulip', '#8d6bff')
  }
  // Flowerbeds: clumps of one or two kinds, the way a gardener would plant them.
  const kinds: Array<['daisy' | 'tulip' | 'lavender', string]> = [
    ['daisy', '#ffffff'],
    ['tulip', '#ff6b8f'],
    ['lavender', '#a17ee8'],
    ['tulip', '#ffcf3a'],
    ['daisy', '#ffd6e8'],
    ['tulip', '#ff8a3c'],
  ]
  const beds: Array<[number, number]> = [
    [-5.6, 1.5], [-4.2, 3.9], [-1.6, 4.3], [2.4, 4.6], [4.6, 3.6], [5.9, 1.2],
    [-6.2, -1.6], [6.3, -1.9], [-3.2, -3.9], [0.6, -4.2], [3.9, -3.8],
  ]
  beds.forEach(([bx, bz], i) => {
    const [kind, color] = kinds[i % kinds.length]
    const [kind2, color2] = kinds[(i + 2) % kinds.length]
    for (let k = 0; k < 16; k++) {
      const a = rand() * Math.PI * 2
      const r = Math.sqrt(rand()) * 0.75
      const x = bx + Math.cos(a) * r * 1.3
      const z = bz + Math.sin(a) * r
      if (!onLawn(x, z)) continue
      if (k % 4 === 3) addFlower(b, rand, x, z, kind2, color2)
      else addFlower(b, rand, x, z, kind, color)
    }
  })
  // Soft tufts of taller grass dotted over the lawn.
  for (let k = 0; k < 320; k++) {
    const a = rand() * Math.PI * 2
    const r = 1.2 + rand() * 2.4
    const x = Math.cos(a) * RX * r * 0.8
    const z = Math.sin(a) * RZ * r
    if (!onLawn(x, z, 0.35)) continue
    for (let blade = 0; blade < 3; blade++) {
      const h = 0.1 + rand() * 0.16
      b.add('satin', new THREE.ConeGeometry(0.018, h, 3), {
        color: '#3f9435',
        colorTop: '#a3d968',
        position: [x + (rand() - 0.5) * 0.06, GROUND_Y + h / 2, z + (rand() - 0.5) * 0.06],
        rotation: [(rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6],
      })
    }
  }
  // Rounded bushes, some in bloom.
  const bushes: Array<[number, number, number, string | null]> = [
    [-6.4, -2.9, 1, '#ff9ccf'], [6.2, -3.1, 1.2, null], [-7.2, 2.6, 0.8, '#ffffff'], [7.2, 2.7, 0.9, '#ffd45a'],
    [-1.8, -5, 1.1, null], [2.9, -4.9, 0.9, '#ff9ccf'],
  ]
  for (const [x, z, s, bloom] of bushes) {
    for (let k = 0; k < 6; k++) {
      const r = (0.35 + rand() * 0.3) * s
      const cx = x + (rand() - 0.5) * 0.8 * s
      const cz = z + (rand() - 0.5) * 0.6 * s
      const cy = GROUND_Y + r * 0.8
      b.add('satin', new THREE.IcosahedronGeometry(r, 2), { color: '#3c8a35', colorTop: '#80c75a', mottle: 0.12, position: [cx, cy, cz] })
      if (bloom) {
        for (let f = 0; f < 6; f++) {
          const u = rand() * Math.PI * 2
          const w = rand() * 1.2
          b.add('glossy', new THREE.SphereGeometry(0.045, 6, 5), {
            color: bloom,
            position: [cx + Math.cos(u) * Math.sin(w) * r, cy + Math.cos(w) * r, cz + Math.sin(u) * Math.sin(w) * r],
          })
        }
      }
    }
  }
  return b.build({ groundAO: false })
}

/** A wooden sign with a painted fish, at the back of the pond. */
function buildSign() {
  const b = new MeshBuilder()
  const [x, z] = [-RX - 0.75, -RZ + 0.5]
  const wood = '#8a6a48'
  b.add('matte', new THREE.BoxGeometry(0.09, 1.1, 0.09), { color: wood, position: [x, GROUND_Y + 0.55, z] })
  b.add('matte', new THREE.BoxGeometry(0.75, 0.42, 0.06), { color: '#b08a5c', colorTop: '#c9a674', position: [x, GROUND_Y + 1.0, z + 0.06] })
  b.add('glossy', new THREE.SphereGeometry(0.11, 12, 8), { color: '#ff7a2a', position: [x + 0.04, GROUND_Y + 1.0, z + 0.1], scale: [1.4, 0.8, 0.25] })
  b.add('glossy', new THREE.ConeGeometry(0.08, 0.14, 3), { color: '#ff7a2a', position: [x - 0.17, GROUND_Y + 1.0, z + 0.1], rotation: [0, 0, Math.PI / 2], scale: [1, 1, 0.3] })
  b.add('glossy', new THREE.SphereGeometry(0.018, 6, 5), { color: '#1b1b22', position: [x + 0.14, GROUND_Y + 1.02, z + 0.13] })
  return b.build({ groundAO: false })
}

/** A few soft, rounded trees and weeping willows behind the pond. */
function buildTrees(rand: () => number) {
  const b = new MeshBuilder()
  const trees: Array<[number, number, number, boolean]> = [
    [-7.2, -5.5, 1.3, true],
    [7.6, -6, 1.1, false],
    [-2.5, -9, 1.4, false],
    [4.2, -10, 1.6, true],
    [-11, -2, 1.2, false],
    [11.5, -1.5, 1.3, true],
  ]
  for (const [x, z, s, willow] of trees) {
    const h = 2.6 * s
    b.add('matte', taperedTube([[x, GROUND_Y, z], [x + 0.15, GROUND_Y + h * 0.6, z], [x - 0.1, GROUND_Y + h, z + 0.1]], 0.2 * s, 0.09 * s, 10, 8), { color: '#6b4c33' })
    if (willow) {
      // Long drooping curtains of leaves.
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2
        const r = 1.1 * s
        b.add('satin', new THREE.CapsuleGeometry(0.28 * s, 1.5 * s, 4, 8), {
          color: '#6fae3f',
          colorTop: '#a4d65e',
          mottle: 0.1,
          position: [x + Math.cos(a) * r, GROUND_Y + h * 0.78, z + Math.sin(a) * r],
          rotation: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2],
        })
      }
      b.add('satin', new THREE.IcosahedronGeometry(1.3 * s, 2), { color: '#7fbf4a', colorTop: '#b2e070', position: [x, GROUND_Y + h * 1.12, z], scale: [1, 0.6, 1] })
    } else {
      for (let k = 0; k < 7; k++) {
        const r = (0.7 + rand() * 0.5) * s
        b.add('satin', new THREE.IcosahedronGeometry(r, 2), {
          color: '#3e8a37',
          colorTop: '#86c95a',
          mottle: 0.12,
          position: [x + (rand() - 0.5) * 1.4 * s, GROUND_Y + h + (rand() - 0.2) * 0.9 * s, z + (rand() - 0.5) * 1.2 * s],
        })
      }
    }
  }
  return b.build({ groundAO: false })
}

/** A little stone lantern by the water, glowing after dark. */
function buildLantern() {
  const b = new MeshBuilder()
  const [x, z] = [RX + 0.75, -RZ + 0.6]
  const stone = '#a39c8f'
  b.add('matte', new THREE.CylinderGeometry(0.22, 0.28, 0.12, 8), { color: stone, position: [x, GROUND_Y + 0.06, z] })
  b.add('matte', new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), { color: stone, position: [x, GROUND_Y + 0.38, z] })
  b.add('matte', new THREE.BoxGeometry(0.34, 0.06, 0.34), { color: stone, position: [x, GROUND_Y + 0.68, z] })
  b.add('lamp', new THREE.BoxGeometry(0.24, 0.24, 0.24), { color: '#ffe6a8', position: [x, GROUND_Y + 0.83, z] })
  b.add('matte', new THREE.ConeGeometry(0.34, 0.26, 4), { color: stone, position: [x, GROUND_Y + 1.08, z], rotation: [0, Math.PI / 4, 0] })
  b.add('matte', new THREE.SphereGeometry(0.06, 8, 6), { color: stone, position: [x, GROUND_Y + 1.24, z] })
  return b.build({ groundAO: false })
}

const skyMaterial = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { uNight: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uNight;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y, 0.0, 1.0);
      vec3 day = mix(vec3(0.78, 0.92, 1.0), vec3(0.32, 0.6, 0.95), pow(h, 0.6));
      vec3 night = mix(vec3(0.08, 0.1, 0.22), vec3(0.01, 0.02, 0.07), pow(h, 0.6));
      gl_FragColor = vec4(mix(day, night, uNight), 1.0);
    }
  `,
})

/** Distant rolling hills on the horizon. */
function buildHills(rand: () => number) {
  const b = new MeshBuilder()
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + rand() * 0.2
    const r = 30 + rand() * 8
    const s = 6 + rand() * 6
    b.add('matte', new THREE.SphereGeometry(s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), {
      color: '#4f9a48',
      colorTop: '#8fcf6a',
      position: [Math.cos(a) * r, GROUND_Y - 1, Math.sin(a) * r],
      scale: [1.6, 0.45, 1],
    })
  }
  return b.build({ groundAO: false })
}

/** Lily pads drifting on the surface, a few with pink flowers. */
function LilyPads() {
  const pads = useMemo(() => {
    const rand = mulberry32(9)
    return Array.from({ length: 11 }, (_, i) => ({
      x: (rand() - 0.5) * RX * 1.6,
      z: (rand() - 0.5) * RZ * 1.5,
      r: 0.22 + rand() * 0.18,
      spin: rand() * Math.PI * 2,
      flower: i % 4 === 0,
      phase: rand() * 6,
    }))
  }, [])
  const geometry = useMemo(() => new THREE.CircleGeometry(1, 28, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2), [])
  const padMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4fae4a', roughness: 0.5, side: THREE.DoubleSide }), [])
  const petalGeometry = useMemo(() => new THREE.ConeGeometry(0.06, 0.16, 5), [])
  const petalMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffb3d1', roughness: 0.5 }), [])
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.children.forEach((c, i) => {
      const p = pads[i]
      c.position.y = waterLevel.current + 0.012 + Math.sin(clock.elapsedTime * 0.8 + p.phase) * 0.008
      c.rotation.y = p.spin + Math.sin(clock.elapsedTime * 0.2 + p.phase) * 0.15
    })
  })
  return (
    <group ref={group}>
      {pads.map((p, i) => (
        <group key={i} position={[p.x, waterLevel.current, p.z]}>
          <mesh geometry={geometry} material={padMaterial} scale={p.r} receiveShadow />
          {p.flower &&
            Array.from({ length: 6 }, (_, k) => (
              <mesh
                key={k}
                geometry={petalGeometry}
                material={petalMaterial}
                position={[Math.cos((k / 6) * Math.PI * 2) * 0.05, 0.06, Math.sin((k / 6) * Math.PI * 2) * 0.05]}
                rotation={[Math.sin((k / 6) * Math.PI * 2) * 0.6, 0, -Math.cos((k / 6) * Math.PI * 2) * 0.6]}
              />
            ))}
        </group>
      ))}
    </group>
  )
}

export function PondGarden() {
  const scene = useMemo(() => {
    const rand = mulberry32(2026)
    return {
      lawn: buildLawn(),
      banks: buildBanks(),
      stones: buildRimStones(rand),
      plants: buildPlants(rand),
      trees: buildTrees(rand),
      lantern: buildLantern(),
      sign: buildSign(),
      hills: buildHills(rand),
    }
  }, [])
  const sky = useMemo(() => new THREE.SphereGeometry(80, 32, 16), [])

  // The water box reaches out to the pond's rounded edges, so the banks get the water tint too.
  useEffect(() => {
    aquaUniforms.uWaterBoxMin.value.set(-RX * 1.08, aquaUniforms.uWaterBoxMin.value.y, -RZ * 1.1)
    aquaUniforms.uWaterBoxMax.value.set(RX * 1.08, aquaUniforms.uWaterBoxMax.value.y, RZ * 1.1)
    return resetWaterBox
  }, [])

  useFrame(() => {
    const night = atmosphere.night
    skyMaterial.uniforms.uNight.value = night
    garden.lamp.emissiveIntensity = 0.2 + night * 2.2
  })

  return (
    <group>
      <mesh geometry={sky} material={skyMaterial} renderOrder={-10} />
      <Parts parts={scene.hills} />
      <Parts parts={scene.lawn} />
      {scene.banks.map((g, i) => (
        <mesh key={i} geometry={g} material={bankMaterial} receiveShadow />
      ))}
      <Parts parts={scene.stones} shadows />
      <Parts parts={scene.plants} shadows />
      <Parts parts={scene.trees} shadows />
      <Parts parts={scene.lantern} shadows />
      <Parts parts={scene.sign} shadows />
      <LilyPads />
    </group>
  )
}

export const POND_OUTLINE_RADII: V3 = [RX, GROUND_Y, RZ]
