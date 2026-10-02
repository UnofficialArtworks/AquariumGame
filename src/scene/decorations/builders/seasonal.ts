import * as THREE from 'three'
import { MeshBuilder } from '../../geometry/MeshBuilder'
import type { StaticBuilder } from './common'
import { shade } from '../../../utils/color'

/** A ribbed pumpkin with a carved face that glows (brightest at night). */
export const buildPumpkin: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const R = 0.26
  const body = new THREE.SphereGeometry(R, 40, 24)
  const pos = body.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // Eight soft ribs, and a dimple at the top and bottom.
    const rib = 1 + 0.07 * Math.cos(Math.atan2(v.z, v.x) * 8)
    const flat = 1 - 0.18 * Math.pow(Math.abs(v.y) / R, 6)
    pos.setXYZ(i, v.x * rib, v.y * 0.78 * flat, v.z * rib)
  }
  body.computeVertexNormals()
  const orange = new THREE.Color(def.color)
  const groove = new THREE.Color(shade(def.color, -0.18))
  b.add('satin', body, {
    color: def.color,
    position: [0, R * 0.78, 0],
    colorFn: (p, _n, c) => {
      const k = 0.5 + 0.5 * Math.cos(Math.atan2(p.z, p.x) * 8)
      c.copy(groove).lerp(orange, k)
    },
  })
  b.add('satin', new THREE.CylinderGeometry(0.025, 0.04, 0.12, 8), { color: '#5b7a2e', position: [0.01, R * 1.55, 0], rotation: [0, 0, -0.25] })
  // The carved face on the front.
  const lamp = def.accentColor
  const z = R * 1.02
  for (const side of [1, -1]) {
    b.add('lamp', new THREE.ConeGeometry(0.05, 0.07, 3), { color: lamp, position: [side * 0.085, R * 0.98, z * 0.93], rotation: [Math.PI / 2, 0, Math.PI], scale: [1, 1, 0.25] })
  }
  b.add('lamp', new THREE.ConeGeometry(0.03, 0.045, 3), { color: lamp, position: [0, R * 0.82, z * 0.98], rotation: [Math.PI / 2, 0, Math.PI], scale: [1, 1, 0.25] })
  b.add('lamp', new THREE.TorusGeometry(0.1, 0.022, 6, 16, Math.PI), { color: lamp, position: [0, R * 0.68, z * 0.9], rotation: [0.25, 0, Math.PI], scale: [1, 0.7, 0.6] })
  return b.build()
}

/** A snowman made of sea foam, with a carrot nose and a cosy scarf. */
export const buildSnowman: StaticBuilder = (def) => {
  const b = new MeshBuilder()
  const snow = def.color
  const balls: Array<[number, number]> = [
    [0.22, 0.2],
    [0.16, 0.53],
    [0.12, 0.78],
  ]
  for (const [r, y] of balls) b.add('satin', new THREE.SphereGeometry(r, 24, 16), { color: snow, colorTop: '#ffffff', position: [0, y, 0], mottle: 0.04 })
  // Coal eyes, smile and buttons.
  for (const side of [1, -1]) b.add('glossy', new THREE.SphereGeometry(0.016, 8, 6), { color: '#1b1b22', position: [side * 0.045, 0.82, 0.105] })
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + (i / 4) * 1.2
    b.add('glossy', new THREE.SphereGeometry(0.01, 6, 5), { color: '#1b1b22', position: [Math.sin(a) * 0.06, 0.745 - Math.cos(a) * 0.02, 0.112] })
  }
  for (const y of [0.47, 0.55, 0.36]) b.add('glossy', new THREE.SphereGeometry(0.018, 8, 6), { color: '#1b1b22', position: [0, y, Math.sqrt(Math.max(0, 0.16 ** 2 - (y - 0.53) ** 2)) + (y < 0.4 ? 0.07 : 0.004)] })
  b.add('satin', new THREE.ConeGeometry(0.022, 0.13, 10), { color: def.accentColor, position: [0, 0.79, 0.17], rotation: [Math.PI / 2, 0, 0] })
  // Scarf, with a tail hanging down.
  b.add('satin', new THREE.TorusGeometry(0.12, 0.03, 8, 24), { color: '#e2384d', position: [0, 0.665, 0], rotation: [Math.PI / 2, 0, 0], scale: [1, 1, 0.9] })
  b.add('satin', new THREE.BoxGeometry(0.06, 0.16, 0.025), { color: '#e2384d', position: [0.07, 0.6, 0.11], rotation: [0.2, 0, 0.15] })
  // A little bucket hat of glowing sea glass, so it twinkles at night.
  b.add('glow', new THREE.CylinderGeometry(0.075, 0.09, 0.09, 16), { color: '#8fe3ff', position: [0, 0.92, 0] })
  b.add('glow', new THREE.CylinderGeometry(0.12, 0.12, 0.015, 20), { color: '#8fe3ff', position: [0, 0.875, 0] })
  return b.build()
}
