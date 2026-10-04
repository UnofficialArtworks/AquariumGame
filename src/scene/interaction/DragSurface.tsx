import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useUIStore } from '../../state/useUIStore'
import { useGameStore } from '../../state/useGameStore'
import { getDecorationDef } from '../decorations/decorationDefinitions'
import { clampDecoration, floorHeightAt } from '../TankBounds'
import { emitSparks } from '../../sim/sparks'
import { sfx } from '../../audio/sfx'
import { clearDrag, dragBridge } from './dragBridge'
import { onTouchCount } from './touches'
import { ESCAPE_LAYER, useEscape } from '../../ui/escape'

/** How far (px) a press must travel before it's a drag rather than a tap. */
const DRAG_SLOP = 6
/** How high a carried decoration floats above the gravel. */
const LIFT = 0.18
/** Skip rays that skim the floor almost flat: they'd fling the decoration far away. */
const MIN_RAY_DOWN = 0.04

const ringMaterial = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#8dffc0').multiplyScalar(1.6),
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
  toneMapped: false,
})
const ringGeometry = new THREE.RingGeometry(0.9, 1.02, 48).rotateX(-Math.PI / 2)
const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })
const shadowGeometry = new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2)

/**
 * Carries the decoration that was pressed (see dragBridge): it follows the
 * pointer across the gravel without jumping to it, floats a little while
 * carried with a ring and shadow showing where it will land, and settles on
 * drop. A press that barely moves selects it instead. A second finger, or
 * Escape, puts it back where it was.
 */
export function DragSurface() {
  const draggingId = useUIStore((s) => s.draggingId)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const marker = useRef<THREE.Group>(null)
  const scratch = useMemo(() => ({ raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), hit: new THREE.Vector3() }), [])

  useEscape(() => release(false), ESCAPE_LAYER.drag, Boolean(draggingId))

  useEffect(() => {
    if (!draggingId) return
    const d = dragBridge
    const move = (e: PointerEvent) => {
      if (e.pointerId !== d.pointerId || !d.current) return
      if (!d.moving) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_SLOP) return
        d.moving = true
        document.body.style.cursor = 'grabbing'
        sfx.pickUp()
      }
      const rect = gl.domElement.getBoundingClientRect()
      scratch.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      scratch.raycaster.setFromCamera(scratch.ndc, camera)
      const ray = scratch.raycaster.ray
      if (ray.direction.y > -MIN_RAY_DOWN || !ray.intersectPlane(d.plane, scratch.hit)) return
      const [x, z] = clampDecoration(scratch.hit.x + d.offset.x, scratch.hit.z + d.offset.z, d.footprintRadius)
      d.target.set(x, 0, z)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === d.pointerId) release(true)
    }
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === d.pointerId) release(false)
    }
    const stopForSecondFinger = onTouchCount((count) => {
      if (count > 1) release(false)
    })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      stopForSecondFinger()
    }
  }, [draggingId, camera, gl, scratch])

  // Glide toward the pointer, lifted, leaning a little into the motion.
  useFrame((_, rawDelta) => {
    const d = dragBridge
    const group = d.current
    const ring = marker.current
    if (!group || !d.moving) {
      if (ring) ring.visible = false
      return
    }
    const k = 1 - Math.exp(-Math.min(rawDelta, 0.05) * 22)
    const floor = floorHeightAt(d.target.x, d.target.z)
    const dx = d.target.x - group.position.x
    const dz = d.target.z - group.position.z
    group.position.x += dx * k
    group.position.z += dz * k
    group.position.y += (floor + LIFT - group.position.y) * k
    const lean = (v: number) => Math.max(-0.14, Math.min(0.14, v * 0.6))
    group.rotation.x += (lean(dz) - group.rotation.x) * k
    group.rotation.z += (lean(-dx) - group.rotation.z) * k
    if (ring) {
      ring.visible = true
      ring.position.set(d.target.x, floor + 0.03, d.target.z)
      ring.scale.setScalar(Math.max(0.25, d.footprintRadius))
    }
  })

  return (
    <group ref={marker} visible={false}>
      <mesh geometry={shadowGeometry} material={shadowMaterial} renderOrder={14} />
      <mesh geometry={ringGeometry} material={ringMaterial} renderOrder={15} />
    </group>
  )
}

/** Put the carried decoration down (or back where it was), or select it if it was only tapped. */
function release(commit: boolean) {
  const d = dragBridge
  const group = d.current
  const id = d.id
  const ui = useUIStore.getState()
  if (group && id) {
    group.rotation.x = 0
    group.rotation.z = 0
    if (!d.moving) {
      group.position.copy(d.origin)
      ui.setSelectedDecorationId(id)
    } else if (commit) {
      const [x, z] = [d.target.x, d.target.z]
      group.position.set(x, floorHeightAt(x, z) - 0.02, z)
      useGameStore.getState().updateDecorationTransform(id, [x, 0, z])
      ui.setSelectedDecorationId(id)
      sfx.place()
      const def = getDecorationDef(useGameStore.getState().placedDecorations.find((p) => p.id === id)?.defId ?? '')
      emitSparks(new THREE.Vector3(x, floorHeightAt(x, z) + 0.05, z), 8 + Math.round((def?.footprintRadius ?? 0.4) * 8), '#e8dcc0', { speed: 0.45, size: 0.9, life: 0.55 })
    } else {
      group.position.copy(d.origin)
    }
  }
  document.body.style.cursor = 'auto'
  clearDrag()
  ui.setDraggingId(null)
}
