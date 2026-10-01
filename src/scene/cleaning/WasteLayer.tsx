import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '../../state/useGameStore'
import { useUIStore } from '../../state/useUIStore'
import { makeAqua } from '../materials/aquaShader'
import { floorHeightAt } from '../TankBounds'
import { hashString } from '../../utils/rng'
import { MAX_WASTE_ITEMS } from '../../state/economy'
import { atmosphere } from '../Atmosphere'
import { makeRingMaterial } from './ringMaterial'
import type { WasteItem } from '../../state/types'

// Pebbles poke up to ~4cm out of the gravel surface, so waste rests on top
// of them instead of half-buried (which is what made it hard to spot).
const REST_LIFT = 0.04

const poopGeometry = new THREE.CapsuleGeometry(0.05, 0.13, 4, 8).rotateZ(Math.PI / 2)
const crumbGeometry = new THREE.DodecahedronGeometry(0.07, 0)
const smudgeGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)
const ringGeometry = new THREE.RingGeometry(0.62, 1, 32).rotateX(-Math.PI / 2)

const wasteMaterial = makeAqua(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0 }), {}, 'aqua-waste')
const suckMaterial = makeAqua(new THREE.MeshStandardMaterial({ roughness: 0.55, color: '#4b3b27' }), {}, 'aqua-waste-suck')

/** Soft grimy patch under each piece of waste, so it reads on any gravel color. */
const smudgeMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec2 vLocal;
    void main() {
      vLocal = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vLocal;
    void main() {
      float d = length(vLocal);
      float a = (1.0 - smoothstep(0.25, 1.0, d)) * 0.55;
      gl_FragColor = vec4(0.16, 0.12, 0.05, a);
    }
  `,
})

/** Pulsing "clean me!" rings shown in Clean mode; drawn on top so decor can't hide waste. */
const ringMaterial = makeRingMaterial('#b8ff4a', 0.62, 1)

const POOP_COLOR = new THREE.Color('#4a3420')
const FOOD_COLOR = new THREE.Color('#9a8a32')

export interface SuckedItem {
  item: WasteItem
  start: number
  from: THREE.Vector3
  /** Bottom of the vacuum nozzle; the bit is pulled here first, then up the tube. */
  via: THREE.Vector3
  to: THREE.Vector3
}

/** Items mid-way up the siphon tube (purely visual, already removed from the save). */
export const suckedWaste: SuckedItem[] = []

/**
 * Live positions for waste being dragged toward a vacuum nozzle. Visual only
 * until the vacuum is released, then committed to the save in one update.
 */
export const wastePull = new Map<string, { x: number; z: number }>()

export function wastePosition(w: WasteItem): { x: number; z: number } {
  return wastePull.get(w.id) ?? w
}

const dummy = new THREE.Object3D()
const tint = new THREE.Color()

function radiusOf(w: WasteItem): number {
  return (w.kind === 'poop' ? 0.05 : 0.07) * w.size
}

/** Fish poop and rotting leftovers lying on the gravel, plus bits being sucked up the siphon. */
export function WasteLayer() {
  const waste = useGameStore((s) => s.waste)
  const poopRef = useRef<THREE.InstancedMesh>(null)
  const crumbRef = useRef<THREE.InstancedMesh>(null)
  const smudgeRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const suckRef = useRef<THREE.InstancedMesh>(null)

  const poop = useMemo(() => waste.filter((w) => w.kind === 'poop'), [waste])
  const crumbs = useMemo(() => waste.filter((w) => w.kind === 'food'), [waste])

  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    const ui = useUIStore.getState()
    const cleaning = ui.mode === 'clean' && ui.activeTank === 'main'
    const vacuuming = cleaning && ui.cleanTool === 'vacuum'

    const place = (mesh: THREE.InstancedMesh | null, items: WasteItem[], color: THREE.Color) => {
      if (!mesh) return
      items.forEach((w, i) => {
        const h = hashString(w.id)
        const p = wastePosition(w)
        const pulled = wastePull.has(w.id)
        const wobble = pulled ? Math.sin(now * 30 + h) * 0.012 : 0
        dummy.position.set(p.x, floorHeightAt(p.x, p.z) + REST_LIFT + radiusOf(w) * 0.6 + wobble, p.z)
        dummy.rotation.set(0, (h % 628) / 100 + (pulled ? now * 6 : 0), ((h >> 8) % 40) / 100)
        dummy.scale.setScalar(w.size)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        tint.copy(color).multiplyScalar(0.8 + ((h >> 4) % 40) / 100)
        mesh.setColorAt(i, tint)
      })
      mesh.count = items.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    place(poopRef.current, poop, POOP_COLOR)
    place(crumbRef.current, crumbs, FOOD_COLOR)

    const smudges = smudgeRef.current
    const rings = ringRef.current
    if (smudges && rings) {
      waste.forEach((w, i) => {
        const p = wastePosition(w)
        const y = floorHeightAt(p.x, p.z) + REST_LIFT * 0.5
        dummy.position.set(p.x, y, p.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.setScalar(0.2 * w.size)
        dummy.updateMatrix()
        smudges.setMatrixAt(i, dummy.matrix)

        const phase = (hashString(w.id) % 100) / 100
        const pulse = (now * 0.9 + phase) % 1
        dummy.position.y = y + 0.01
        dummy.scale.setScalar((vacuuming ? 0.17 : 0.13) + pulse * (vacuuming ? 0.14 : 0.08))
        dummy.updateMatrix()
        rings.setMatrixAt(i, dummy.matrix)
      })
      smudges.count = waste.length
      smudges.instanceMatrix.needsUpdate = true
      rings.count = cleaning ? waste.length : 0
      rings.instanceMatrix.needsUpdate = true
      ringMaterial.uniforms.uOpacity.value = (vacuuming ? 1 : 0.55) * (1 - atmosphere.night * 0.2) * (0.8 + Math.sin(now * 4) * 0.2)
    }

    const sucked = suckRef.current
    if (sucked) {
      let n = 0
      for (let i = suckedWaste.length - 1; i >= 0; i--) {
        const s = suckedWaste[i]
        const t = (now - s.start) / 0.6
        if (t >= 1) {
          suckedWaste.splice(i, 1)
          continue
        }
        // Skid across the gravel into the nozzle, then shoot up the tube.
        if (t < 0.35) dummy.position.lerpVectors(s.from, s.via, (t / 0.35) * (t / 0.35))
        else dummy.position.lerpVectors(s.via, s.to, (t - 0.35) / 0.65)
        dummy.position.x += Math.sin(t * 24) * 0.025 * (1 - t)
        dummy.position.z += Math.cos(t * 21) * 0.025 * (1 - t)
        dummy.rotation.set(t * 9, t * 6, 0)
        dummy.scale.setScalar(s.item.size * (1 - t * 0.6))
        dummy.updateMatrix()
        sucked.setMatrixAt(n++, dummy.matrix)
      }
      sucked.count = n
      sucked.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={smudgeRef} args={[smudgeGeometry, smudgeMaterial, MAX_WASTE_ITEMS]} frustumCulled={false} renderOrder={1} />
      <instancedMesh ref={poopRef} args={[poopGeometry, wasteMaterial, MAX_WASTE_ITEMS]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={crumbRef} args={[crumbGeometry, wasteMaterial, MAX_WASTE_ITEMS]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={ringRef} args={[ringGeometry, ringMaterial, MAX_WASTE_ITEMS]} frustumCulled={false} renderOrder={14} />
      <instancedMesh ref={suckRef} args={[poopGeometry, suckMaterial, 40]} frustumCulled={false} />
    </group>
  )
}
