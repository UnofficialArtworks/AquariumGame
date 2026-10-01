import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { noise3 } from '../../utils/noise'
import type { DecorMaterialKind } from '../materials/materials'

export type V3 = [number, number, number]

export interface PartOptions {
  position?: V3
  rotation?: V3
  scale?: V3 | number
  color: THREE.ColorRepresentation
  /** Vertical gradient: `color` at the part's lowest point, `colorTop` at its highest. */
  colorTop?: THREE.ColorRepresentation
  /** Per-vertex brightness noise, e.g. 0.15 for subtle mottling. */
  mottle?: number
  /**
   * Full control over per-vertex color, evaluated in builder space after the
   * part is transformed (e.g. moss on upward-facing rock faces).
   */
  colorFn?: (position: THREE.Vector3, normal: THREE.Vector3, out: THREE.Color) => void
}

export interface BuiltPart {
  material: DecorMaterialKind
  geometry: THREE.BufferGeometry
}

const tmpPos = new THREE.Vector3()
const tmpNormal = new THREE.Vector3()
const tmpColor = new THREE.Color()
const tmpColorTop = new THREE.Color()
const tmpMatrix = new THREE.Matrix4()
const tmpQuat = new THREE.Quaternion()
const tmpEuler = new THREE.Euler()
const tmpScale = new THREE.Vector3()
const tmpTranslate = new THREE.Vector3()

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Collects many primitive parts, bakes their transforms and colors into
 * vertex data, and merges them into one geometry per material. A whole
 * castle becomes one or two draw calls instead of dozens of meshes, which
 * is what lets decorations carry much more detail.
 */
export class MeshBuilder {
  private groups = new Map<DecorMaterialKind, THREE.BufferGeometry[]>()

  add(material: DecorMaterialKind, source: THREE.BufferGeometry, options: PartOptions): this {
    const geometry = source.index ? source.toNonIndexed() : source
    if (geometry !== source) source.dispose()

    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const count = geometry.getAttribute('position').count
    if (!geometry.getAttribute('uv')) {
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    }

    // Gradient range is measured in the part's own space, before transforming.
    let minY = 0
    let maxY = 1
    if (options.colorTop !== undefined) {
      geometry.computeBoundingBox()
      minY = geometry.boundingBox!.min.y
      maxY = geometry.boundingBox!.max.y
    }
    const preTransformY = options.colorTop !== undefined ? Float32Array.from(
      { length: count },
      (_, i) => geometry.getAttribute('position').getY(i),
    ) : null

    const scale = options.scale ?? 1
    tmpScale.set(...(typeof scale === 'number' ? ([scale, scale, scale] as V3) : scale))
    tmpEuler.set(...(options.rotation ?? [0, 0, 0]))
    tmpQuat.setFromEuler(tmpEuler)
    tmpTranslate.set(...(options.position ?? [0, 0, 0]))
    tmpMatrix.compose(tmpTranslate, tmpQuat, tmpScale)
    geometry.applyMatrix4(tmpMatrix)

    const positions = geometry.getAttribute('position')
    const normals = geometry.getAttribute('normal')
    const colors = new Float32Array(count * 3)
    const base = new THREE.Color(options.color)
    if (options.colorTop !== undefined) tmpColorTop.set(options.colorTop)

    for (let i = 0; i < count; i++) {
      tmpPos.fromBufferAttribute(positions, i)
      tmpNormal.fromBufferAttribute(normals, i)
      if (options.colorFn) {
        tmpColor.copy(base)
        options.colorFn(tmpPos, tmpNormal, tmpColor)
      } else if (preTransformY) {
        const t = maxY > minY ? (preTransformY[i] - minY) / (maxY - minY) : 0
        tmpColor.copy(base).lerp(tmpColorTop, t)
      } else {
        tmpColor.copy(base)
      }
      if (options.mottle) {
        const n = noise3(tmpPos.x * 9.1, tmpPos.y * 9.1, tmpPos.z * 9.1)
        tmpColor.multiplyScalar(1 + n * options.mottle)
      }
      colors[i * 3] = tmpColor.r
      colors[i * 3 + 1] = tmpColor.g
      colors[i * 3 + 2] = tmpColor.b
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const list = this.groups.get(material) ?? []
    list.push(geometry)
    this.groups.set(material, list)
    return this
  }

  /**
   * Merge everything added so far. `groundAO` darkens vertices near y=0 so
   * items look seated in the gravel; `transform` tilts/sinks the whole
   * finished model (e.g. a wreck lying on its side).
   */
  build({ groundAO = true, aoHeight = 0.3, transform }: { groundAO?: boolean; aoHeight?: number; transform?: THREE.Matrix4 } = {}): BuiltPart[] {
    const parts: BuiltPart[] = []
    for (const [material, list] of this.groups) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false)
      if (!merged) continue
      if (list.length > 1) list.forEach((g) => g.dispose())
      if (transform) merged.applyMatrix4(transform)
      if (groundAO) {
        const positions = merged.getAttribute('position')
        const colors = merged.getAttribute('color')
        for (let i = 0; i < positions.count; i++) {
          const ao = 0.5 + 0.5 * smoothstep(-0.02, aoHeight, positions.getY(i))
          colors.setXYZ(i, colors.getX(i) * ao, colors.getY(i) * ao, colors.getZ(i) * ao)
        }
      }
      merged.computeBoundingSphere()
      merged.computeBoundingBox()
      parts.push({ material, geometry: merged })
    }
    this.groups.clear()
    return parts
  }
}
