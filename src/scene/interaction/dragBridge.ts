import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useUIStore } from '../../state/useUIStore'

/**
 * The decoration being carried, shared between the decoration that was
 * pressed (useDecorationDrag) and DragSurface, which follows the pointer and
 * moves the decoration's Object3D directly each frame. Nothing per-frame goes
 * into React or zustand state (that would cause a render/localStorage-write
 * storm); the store only hears about the final spot on drop.
 */
export const dragBridge = {
  current: null as THREE.Object3D | null,
  id: null as string | null,
  footprintRadius: 0,
  pointerId: -1,
  /** Where the press started (px), to tell a tap from a drag. */
  startX: 0,
  startY: 0,
  /** Past the tap threshold: it's being carried. */
  moving: false,
  /** The floor-height plane the pointer is projected onto. */
  plane: new THREE.Plane(),
  /** Decoration position minus where the pointer met the plane, so it doesn't jump to the pointer. */
  offset: new THREE.Vector3(),
  /** Where it's heading (x, z). */
  target: new THREE.Vector3(),
  /** Where it was picked up from, to put it back if the drag is cancelled. */
  origin: new THREE.Vector3(),
}

const UP = new THREE.Vector3(0, 1, 0)
const hit = new THREE.Vector3()

/** Pick a decoration up where the pointer pressed it. */
export function startDrag(id: string, group: THREE.Object3D, footprintRadius: number, event: ThreeEvent<PointerEvent>) {
  const d = dragBridge
  d.plane.setFromNormalAndCoplanarPoint(UP, group.position)
  if (event.ray.intersectPlane(d.plane, hit)) d.offset.set(group.position.x - hit.x, 0, group.position.z - hit.z)
  else d.offset.set(0, 0, 0)
  d.current = group
  d.id = id
  d.footprintRadius = footprintRadius
  d.pointerId = event.pointerId
  d.startX = event.clientX
  d.startY = event.clientY
  d.moving = false
  d.target.copy(group.position)
  d.origin.copy(group.position)
  useUIStore.getState().setDraggingId(id)
}

export function clearDrag() {
  dragBridge.current = null
  dragBridge.id = null
  dragBridge.pointerId = -1
  dragBridge.moving = false
}
