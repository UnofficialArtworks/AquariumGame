import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { fbm3 } from '../../utils/noise'
import type { V3 } from './MeshBuilder'

/**
 * Smooth, lumpy rock: a subdivided icosahedron pushed in/out by fractal
 * noise. Much more natural than a raw low-poly icosahedron.
 */
export function noiseRock(radius: number, seed: number, roughness = 0.28, detail = 3): THREE.BufferGeometry {
  let geometry: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail)
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  geometry = mergeVertices(geometry)
  const pos = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const dir = v.clone().normalize()
    const n = fbm3(dir.x * 1.6 + seed * 3.1, dir.y * 1.6 + seed * 1.7, dir.z * 1.6 - seed * 2.3, 4)
    v.copy(dir).multiplyScalar(radius * (1 + n * roughness))
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A tube that follows a smooth curve and tapers from `radiusStart` to
 * `radiusEnd` — used for branches, driftwood, coral, tentacles and stems.
 */
export function taperedTube(
  points: V3[],
  radiusStart: number,
  radiusEnd: number,
  tubularSegments = 16,
  radialSegments = 8,
  closeEnd = true,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const point = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments
    curve.getPointAt(t, point)
    const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, t)
    const N = frames.normals[i]
    const B = frames.binormals[i]
    for (let j = 0; j <= radialSegments; j++) {
      const angle = (j / radialSegments) * Math.PI * 2
      const sin = Math.sin(angle)
      const cos = -Math.cos(angle)
      normal.set(cos * N.x + sin * B.x, cos * N.y + sin * B.y, cos * N.z + sin * B.z).normalize()
      positions.push(point.x + radius * normal.x, point.y + radius * normal.y, point.z + radius * normal.z)
      normals.push(normal.x, normal.y, normal.z)
      uvs.push(j / radialSegments, t)
    }
  }
  for (let i = 1; i <= tubularSegments; i++) {
    for (let j = 1; j <= radialSegments; j++) {
      const a = (radialSegments + 1) * (i - 1) + (j - 1)
      const b = (radialSegments + 1) * i + (j - 1)
      const c = (radialSegments + 1) * i + j
      const d = (radialSegments + 1) * (i - 1) + j
      indices.push(a, b, d, b, c, d)
    }
  }

  if (closeEnd && radiusEnd > 0.0001) {
    // Rounded-ish cap: a single fan at the tip.
    curve.getPointAt(1, point)
    const tangent = curve.getTangentAt(1)
    const centerIndex = positions.length / 3
    positions.push(point.x, point.y, point.z)
    normals.push(tangent.x, tangent.y, tangent.z)
    uvs.push(0.5, 1)
    const ringStart = (radialSegments + 1) * tubularSegments
    // Both windings, so the cap shows regardless of which way the frame spun.
    for (let j = 0; j < radialSegments; j++) {
      indices.push(ringStart + j, ringStart + j + 1, centerIndex)
      indices.push(ringStart + j + 1, ringStart + j, centerIndex)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/**
 * Leaf blade lying in the XY plane, base at the origin, tip at +Y. `curl`
 * bends it backward along its length and `fold` creases it along the midrib
 * so it catches light like a real leaf instead of a flat card.
 */
export function leafGeometry(length: number, width: number, curl = 0.25, fold = 0.25, segments = 8): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(width * 0.9, length * 0.15, width * 0.7, length * 0.75, 0, length)
  shape.bezierCurveTo(-width * 0.7, length * 0.75, -width * 0.9, length * 0.15, 0, 0)
  const geometry = new THREE.ShapeGeometry(shape, segments)
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const t = y / length
    const z = -curl * length * t * t + Math.abs(x) * fold
    pos.setZ(i, z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Long wavy ribbon (kelp blade) along +Y with a gentle twist. */
export function ribbonGeometry(length: number, width: number, segments = 24, twist = 1.2, wave = 0.08): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, length, 2, segments)
  geometry.translate(0, length / 2, 0)
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const t = y / length
    const taper = 1 - Math.pow(t, 3) * 0.85
    const angle = t * twist
    const edgeRuffle = Math.sin(y * 9) * wave * Math.abs(x) / (width / 2)
    const lx = x * taper
    pos.setXYZ(i, lx * Math.cos(angle), y, lx * Math.sin(angle) + edgeRuffle + Math.sin(t * 5) * 0.06)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Hexagonal crystal: a prism with a pointed tip. Base at the origin, +Y up. */
export function crystalGeometry(radius: number, height: number, tipHeight: number): THREE.BufferGeometry {
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 0.92, 0),
    new THREE.Vector2(radius, height * 0.1),
    new THREE.Vector2(radius, height),
    new THREE.Vector2(0, height + tipHeight),
  ]
  return new THREE.LatheGeometry(points, 6)
}

/** Lathe from [radius, y] pairs — terse helper for vases, columns, bells. */
export function latheFrom(profile: Array<[number, number]>, segments = 24): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  )
}

/** Five-armed starfish, flat-ish with a puffy top. */
export function starfishGeometry(radius: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const arms = 5
  for (let i = 0; i <= arms * 2; i++) {
    const angle = (i / (arms * 2)) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 === 0 ? radius : radius * 0.42
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.4,
    bevelEnabled: true,
    bevelThickness: thickness * 0.3,
    bevelSize: radius * 0.12,
    bevelSegments: 3,
  })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}
