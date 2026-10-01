import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { MeshBuilder, type V3 } from '../../geometry/MeshBuilder'
import { latheFrom, leafGeometry, noiseRock, taperedTube } from '../../geometry/shapes'
import { noise3 } from '../../../utils/noise'
import { shade } from '../../../utils/color'
import { bricks, mossy, rr, woodGrain, type StaticBuilder } from './common'

const WINDOW_GLOW = '#ffcf6b'

export const buildCastle: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const stone = bricks(def.color, '#5f8a3a')
  const towerStone = bricks(shade(def.color, -0.05), '#5f8a3a', 0.07, 0.09)
  // Keep
  b.add('matte', new THREE.BoxGeometry(0.64, 0.62, 0.64, 8, 8, 8), { color: def.color, position: [0, 0.31, 0], colorFn: stone })
  b.add('matte', new THREE.BoxGeometry(0.7, 0.06, 0.7), { color: shade(def.color, -0.08), position: [0, 0.63, 0], colorFn: stone })
  const merlon = (x: number, y: number, z: number) =>
    b.add('matte', new THREE.BoxGeometry(0.08, 0.09, 0.08), { color: def.color, position: [x, y, z], colorFn: stone })
  for (let i = 0; i < 5; i++) {
    const t = -0.28 + i * 0.14
    merlon(t, 0.7, 0.32)
    merlon(t, 0.7, -0.32)
    merlon(0.32, 0.7, t)
    merlon(-0.32, 0.7, t)
  }
  // Inner tower rising from the keep
  b.add('matte', new THREE.CylinderGeometry(0.13, 0.14, 0.5, 20, 6), { color: def.color, position: [0.05, 0.9, -0.05], colorFn: towerStone })
  b.add('satin', new THREE.ConeGeometry(0.19, 0.38, 20), { color: def.accentColor, colorTop: shade(def.accentColor, 0.15), position: [0.05, 1.34, -0.05] })
  b.add('glow', new RoundedBoxGeometry(0.05, 0.09, 0.03, 2, 0.01), { color: WINDOW_GLOW, position: [0.05, 0.95, 0.09] })
  // Corner towers
  const corners: Array<[number, number]> = [
    [0.34, 0.34],
    [-0.34, 0.34],
    [0.34, -0.34],
    [-0.34, -0.34],
  ]
  for (const [x, z] of corners) {
    b.add('matte', new THREE.CylinderGeometry(0.15, 0.16, 0.92, 22, 8), { color: def.color, position: [x, 0.46, z], colorFn: towerStone })
    b.add('matte', new THREE.CylinderGeometry(0.18, 0.18, 0.06, 22), { color: shade(def.color, -0.08), position: [x, 0.94, z] })
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      b.add('matte', new THREE.BoxGeometry(0.06, 0.08, 0.06), { color: def.color, position: [x + Math.cos(a) * 0.15, 1.0, z + Math.sin(a) * 0.15], rotation: [0, -a, 0], colorFn: towerStone })
    }
    b.add('satin', new THREE.ConeGeometry(0.2, 0.36, 22), { color: def.accentColor, colorTop: shade(def.accentColor, 0.15), position: [x, 1.18, z] })
    b.add('satin', new THREE.SphereGeometry(0.025, 8, 6), { color: '#d9b64a', position: [x, 1.37, z] })
    // Arrow-slit window facing outward, lit at night
    const out = new THREE.Vector2(x, z).normalize()
    b.add('glow', new RoundedBoxGeometry(0.04, 0.12, 0.03, 2, 0.01), {
      color: WINDOW_GLOW,
      position: [x + out.x * 0.15, 0.62, z + out.y * 0.15],
      rotation: [0, Math.atan2(out.x, out.y), 0],
    })
  }
  // Arched doorway — big enough to look like fish could swim in
  b.add('satin', new THREE.BoxGeometry(0.2, 0.2, 0.04), { color: '#241812', position: [0, 0.1, 0.32] })
  b.add('satin', new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20, 1, false, 0, Math.PI), { color: '#241812', position: [0, 0.2, 0.32], rotation: [Math.PI / 2, 0, Math.PI / 2] })
  b.add('matte', new THREE.TorusGeometry(0.12, 0.022, 8, 20, Math.PI), { color: shade(def.color, -0.15), position: [0, 0.2, 0.335] })
  for (const x of [-0.18, 0.18]) b.add('glow', new RoundedBoxGeometry(0.06, 0.1, 0.03, 2, 0.01), { color: WINDOW_GLOW, position: [x, 0.45, 0.325] })
  return b.build({ aoHeight: 0.25 })
}

function fluted(height: number, radius: number): THREE.BufferGeometry {
  const g = latheFrom([[radius * 1.05, 0], [radius * 0.92, height * 0.06], [radius * 0.85, height * 0.94], [radius * 1.0, height]], 32)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const a = Math.atan2(v.x, v.z)
    const f = 1 + Math.cos(a * 16) * 0.05
    pos.setXYZ(i, v.x * f, v.y, v.z * f)
  }
  g.computeVertexNormals()
  return g
}

export const buildRuins: StaticBuilder = (def, rand) => {
  const b = new MeshBuilder()
  const stone = mossy(def.color, def.accentColor, 0.85, 7)
  b.add('matte', new THREE.BoxGeometry(1.3, 0.09, 0.85, 6, 1, 4), { color: def.color, position: [0, 0.02, 0], colorFn: stone })
  b.add('matte', new THREE.BoxGeometry(1.1, 0.08, 0.68, 6, 1, 4), { color: def.color, position: [0, 0.1, 0], colorFn: stone })
  const columns: Array<{ x: number; z: number; h: number; tilt: number; broken: boolean }> = [
    { x: -0.42, z: -0.2, h: 1.05, tilt: 0, broken: false },
    { x: 0.42, z: -0.2, h: 1.05, tilt: 0, broken: false },
    { x: -0.42, z: 0.2, h: 0.55, tilt: 0.05, broken: true },
    { x: 0.42, z: 0.22, h: 0.82, tilt: -0.18, broken: true },
  ]
  for (const c of columns) {
    const g = fluted(c.h, 0.085)
    g.rotateZ(c.tilt)
    b.add('matte', g, { color: def.color, position: [c.x, 0.14, c.z], colorFn: stone })
    b.add('matte', new THREE.BoxGeometry(0.22, 0.05, 0.22), { color: def.color, position: [c.x, 0.165, c.z], colorFn: stone })
    if (c.broken) {
      b.add('matte', noiseRock(0.09, c.x * 10, 0.4, 2), { color: def.color, position: [c.x - Math.sin(c.tilt) * c.h, 0.14 + c.h, c.z], scale: [1, 0.6, 1], colorFn: stone })
    } else {
      b.add('matte', new THREE.BoxGeometry(0.24, 0.06, 0.24), { color: def.color, position: [c.x, 0.14 + c.h + 0.03, c.z], colorFn: stone })
    }
  }
  // Lintel across the two standing columns, with a carved band
  b.add('matte', new THREE.BoxGeometry(1.08, 0.11, 0.22, 8, 1, 2), { color: def.color, position: [0, 0.14 + 1.05 + 0.115, -0.2], colorFn: stone })
  b.add('matte', new THREE.BoxGeometry(0.5, 0.2, 0.04), { color: shade(def.color, -0.05), position: [0, 0.14 + 1.05 + 0.27, -0.2], colorFn: stone })
  // Fallen column in two pieces, rubble
  const fallen = fluted(0.5, 0.08)
  fallen.rotateZ(Math.PI / 2)
  b.add('matte', fallen, { color: def.color, position: [0.15, 0.08, 0.5], rotation: [0, 0.3, 0], colorFn: stone })
  const fallen2 = fluted(0.3, 0.08)
  fallen2.rotateZ(Math.PI / 2)
  b.add('matte', fallen2, { color: def.color, position: [-0.45, 0.08, 0.55], rotation: [0, -0.4, 0], colorFn: stone })
  for (let i = 0; i < 6; i++) {
    b.add('matte', noiseRock(0.05 + rand() * 0.05, i * 3.3, 0.4, 1), {
      color: def.color,
      position: [rr(rand, -0.6, 0.6), 0.03, rr(rand, 0.3, 0.6)],
      scale: [1, 0.7, 1],
      colorFn: stone,
    })
  }
  return b.build({ aoHeight: 0.25 })
}

export const buildTiki: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const wood = woodGrain(def.color, 'y', '#5f7f3a')
  const dark = '#2a1a10'
  b.add('matte', noiseRock(0.24, 2, 0.3, 2), { color: '#6b6560', position: [0, 0.02, 0], scale: [1.3, 0.35, 1.1], colorFn: mossy('#6b6560', '#5f7f3a') })
  b.add('matte', new RoundedBoxGeometry(0.4, 0.74, 0.34, 4, 0.08), { color: def.color, position: [0, 0.47, 0], colorFn: wood })
  // Heavy brow, long nose, wide lips
  b.add('matte', new RoundedBoxGeometry(0.44, 0.09, 0.12, 3, 0.03), { color: shade(def.color, -0.08), position: [0, 0.66, 0.15], colorFn: wood })
  b.add('matte', new RoundedBoxGeometry(0.11, 0.24, 0.12, 3, 0.04), { color: def.color, position: [0, 0.5, 0.19], colorFn: wood })
  for (const x of [-0.045, 0.045]) b.add('matte', new THREE.SphereGeometry(0.035, 10, 8), { color: shade(def.color, -0.1), position: [x, 0.4, 0.22], colorFn: wood })
  b.add('matte', new RoundedBoxGeometry(0.3, 0.1, 0.1, 3, 0.04), { color: shade(def.color, -0.05), position: [0, 0.28, 0.16], colorFn: wood })
  b.add('satin', new RoundedBoxGeometry(0.24, 0.035, 0.05, 2, 0.012), { color: dark, position: [0, 0.28, 0.2] })
  for (let i = 0; i < 5; i++) b.add('satin', new THREE.BoxGeometry(0.03, 0.03, 0.02), { color: '#efe6cc', position: [-0.08 + i * 0.04, 0.29, 0.215] })
  // Deep eye sockets with an ember glow
  for (const x of [-0.1, 0.1]) {
    b.add('satin', new THREE.SphereGeometry(0.065, 16, 12), { color: dark, position: [x, 0.58, 0.155], scale: [1.1, 0.75, 0.5] })
    b.add('lamp', new THREE.SphereGeometry(0.028, 12, 10), { color: def.accentColor, position: [x, 0.58, 0.17] })
  }
  // Ears
  for (const side of [1, -1]) b.add('matte', new RoundedBoxGeometry(0.06, 0.26, 0.1, 2, 0.02), { color: def.color, position: [side * 0.22, 0.52, 0.02], colorFn: wood })
  // Feather headdress fanned across the top
  const feathers = ['#2ec4b6', '#ff9f1c', '#e71d36', '#2ec4b6', '#ff9f1c', '#e71d36', '#2ec4b6']
  feathers.forEach((color, i) => {
    const a = (i - 3) * 0.28
    const g = leafGeometry(0.34, 0.08, 0.1, 0.2, 6)
    g.rotateZ(-a)
    b.add('thin', g, { color: shade(color, -0.1), colorTop: color, position: [Math.sin(a) * 0.06, 0.8, -0.02 - Math.abs(a) * 0.02] })
  })
  b.add('satin', new THREE.TorusGeometry(0.19, 0.03, 8, 24), { color: '#c9a25a', position: [0, 0.82, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 0.85, 1] })
  return b.build({ aoHeight: 0.2 })
}

export const buildAirstone: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const porous = new THREE.Color(def.color)
  const g = new THREE.CylinderGeometry(0.075, 0.085, 0.1, 24, 3)
  b.add('matte', g, {
    color: def.color,
    position: [0, 0.04, 0],
    colorFn: (p, _n, c) => {
      const pores = noise3(p.x * 70, p.y * 70, p.z * 70)
      c.copy(porous).multiplyScalar(pores > 0.35 ? 0.5 : 0.95 + pores * 0.1)
    },
  })
  const tube: V3[] = [[0, 0.09, 0], [0, 0.14, -0.06], [0.04, 0.12, -0.2], [0.1, 0.05, -0.32], [0.14, 0.02, -0.42]]
  b.add('glossy', taperedTube(tube, 0.014, 0.014, 20, 8), { color: '#3f8a5a' })
  return b.build({ aoHeight: 0.08 })
}
